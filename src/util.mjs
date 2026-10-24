// 공통 유틸: 레이트리밋 + 재시도 + 간단 파서 (외부 의존성 0개)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const lastHit = new Map();

/**
 * 같은 호스트에 일정 간격으로만 요청 (429 방지)
 *
 * ⚠️ 2026-10-23 수정 — **슬롯 선점(reservation) 방식**으로 바�다.
 *    기존 구현은 wait 계산 → await → set 순서라서, 같은 호스트로 동시 호출이 들어오면
 *    여러 워커가 같은 시점을 계산하고 **간격 없이 나간다** → Google Trends 429 폭발.
 *    (실측: 37개국 병렬 수집에서 16개국이 429)
 *    지금은 "앞으로 시작할 시각"을 먼저 set 해둬서 진짜로 간격이 보장된다.
 */
export async function throttle(host, minGapMs = 1200) {
  const now = Date.now();
  const prev = lastHit.get(host) || 0;
  const startAt = prev + minGapMs > now ? prev + minGapMs : now;
  lastHit.set(host, startAt); // ★ 슬롯을 먼저 선점 (JS 단일 스레드라 원자적)
  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
}

export async function get(url, opts = {}) {
  const {
    headers = {},
    retries = 3,
    timeoutMs = 20000,
    minGapMs = 1200,
    method = 'GET',
    body = undefined,
    accept = 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
  } = opts;
  const host = new URL(url).host;
  let lastErr;
  for (let i = 0; i < retries; i++) {
    await throttle(host, minGapMs);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        body,
        headers: {
          'user-agent': UA,
          accept,
          'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          ...headers,
        },
        redirect: 'follow',
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get('retry-after') || 0) * 1000;
        await sleep(Math.max(ra, 2500 * (i + 1)));
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const text = buf.toString('utf8');
      return { ok: res.ok, status: res.status, text, buf, url: res.url, res };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw lastErr || new Error(`fetch failed: ${url}`);
}

/** 바이너리 응답(xlsx 등)용 */
export async function getBuffer(url, opts = {}) {
  const r = await get(url, opts);
  return r.buf;
}

export async function getJson(url, opts = {}) {  const r = await get(url, { ...opts, accept: 'application/json' });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  try {
    return JSON.parse(r.text);
  } catch {
    throw new Error(`invalid json: ${url}`);
  }
}

export function decodeEntities(s = '') {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

export function stripTags(s = '') {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Atom/RSS feed 파서 (Redddit RSS, YouTube RSS 등) */
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<entry[\s\S]*?<\/entry>/g) || xml.match(/<item[\s\S]*?<\/item>/g) || [];
  for (const b of blocks) {
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return '';
      return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
    };
    const link =
      (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] ||
      (b.match(/<link>([^<]+)<\/link>/) || [])[1] ||
      '';
    items.push({
      title: stripTags(pick('title')),
      published: pick('published') || pick('updated') || pick('pubDate'),
      author: pick('name') || pick('author'),
      link: link.trim(),
      body: stripTags(pick('content') || pick('description')).slice(0, 400),
    });
  }
  return items;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const daysAgoISO = (n) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/**
 * KST 기준 날짜. 데이터랩 조회 창은 반드시 KST로 고정해야 한다.
 * (2026-10-23 실측: UTC 자정 = KST 09:00 에 창이 하루 밀려
 *  해리포터 last7 이 338.42 → 389.33, 성장률 4.1% → 19.7% 로 흔들렸다)
 */
export const daysAgoKST = (n) => {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
export const pctChange = (now, prev) => {
  if (!prev) return now > 0 ? 100 : 0;
  return ((now - prev) / prev) * 100;
};
export const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
export const uniq = (a) => [...new Set(a)];
export const byDate = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

export function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
