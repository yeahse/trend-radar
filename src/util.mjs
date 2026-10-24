// 공통 유틸: 레이트리밋 + 재시도 + 간단 파서 (외부 의존성 0개)
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ★ 외부 API 쿼터 소비량 계측 (2026-10-24)
 *
 * "하루에 한번만 돌려도 되는데 왜 이렇게 많이?" 에 답하기 위한 계측기.
 *   YouTube Data API: search.list = 100유닛 · videos.list = 1유닛 / 일일 10,000유닛
 *   → 실행할 때마다 "이번 실행이 유닛을 얼마나 태웠는지" 를 로그로 남긴다.
 */
export const apiQuota = { units: 0, breakdown: {}, calls: 0 };

export function noteQuota(kind, units) {
  apiQuota.units += units;
  apiQuota.calls += 1;
  apiQuota.breakdown[kind] = (apiQuota.breakdown[kind] || 0) + units;
  return apiQuota.units;
}

export function quotaSummary(limit = 10000) {
  const parts = Object.entries(apiQuota.breakdown)
    .map(([k, v]) => `${k} ${v.toLocaleString('ko-KR')}유닛`)
    .join(' + ');
  const pct = Math.round((apiQuota.units / limit) * 100);
  return `이번 실행 YouTube 쿼터 ${apiQuota.units.toLocaleString('ko-KR')}유닛 (${parts || '없음'}) = 일일 ${limit.toLocaleString('ko-KR')}의 ${pct}%`;
}

/**
 * ★ 시크릿 마스킹 (2026-10-24 추가)
 *
 * 에러 메시지에 API 키가 그대로 실려서 일일 리포트 파일(및 Discord 본문)에
 * 평문으로 남던 버그가 있었다. (실측: YouTube 키 8회 노출)
 * → 모든 에러 문자열을 이거 통과시켜서 키/토큰/웹훅 URL을 가린다.
 */
export function redact(text) {
  if (text == null) return text;
  return String(text)
    // YouTube / Google API 키
    .replace(/AIza[0-9A-Za-z_\-]{10,}/g, 'AIza***REDACTED***')
    // 쿼리스트링의 키 계열
    .replace(/([?&](?:key|api_key|apikey|client_secret|access_token|refresh_token|token)=)[^&\s]+/gi, '$1***REDACTED***')
    // Authorization 헤더 값
    .replace(/(Bearer|Basic)\s+[A-Za-z0-9._\-]{10,}/g, '$1 ***REDACTED***')
    // Discord 웹훅 URL
    .replace(/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_\-]+/g, 'discord.com/api/webhooks/***REDACTED***')
    // 그 밖의 긴 시크릿성 문자열 (JWT)
    .replace(/\beyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g, '***REDACTED-JWT***');
}

/** 문자열 배열 전체를 마스킹 */
export function redactAll(list) {
  return (list || []).map((e) => redact(e));
}

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
