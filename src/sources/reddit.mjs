import { get, getJson, sleep } from '../util.mjs';
import { decodeEntities, stripTags } from '../util.mjs';

/**
 * Reddit Data API User-Agent (공식 요구 형식, 2026-10-24 정책 문서 확인)
 *   "<platform>:<app ID>:<version string> (by /u/<reddit username>)"
 *   예: windows:trend-radar:v1.0.0 (by /u/ahuuu135)
 *   Reddit은 "Python/urllib" 같은 기본 UA를 "drastically limited" 처리한다.
 *   → config.json → reddit.username 에 실제 reddit 아이디를 넣어두면 자동으로 반영된다.
 */
function redditUA(cfg) {
  const user = cfg.reddit?.username || 'trend-radar-user';
  return `windows:trend-radar:v1.0.0 (by /u/${user})`;
}

/**
 * Reddit 수집 2가지 방법
 * 1) OAuth (권장) — reddit.com/prefs/apps 에서 "script" 앱 생성 후 client id/secret 입력
 *    공식 quota가 넉넉하고 안정적
 * 2) RSS 폴백 — 인증 없이 1~2회만 안정적으로 성공 (IP당 쿼터가 빡빡함)
 */
let cachedToken = null;
let tokenAt = 0;

export async function getRedditToken(cfg) {
  const { clientId, clientSecret } = cfg.reddit || {};
  if (!clientId || !clientSecret) throw new Error('reddit OAuth 키 미설정');
  if (cachedToken && Date.now() - tokenAt < 45 * 60 * 1000) return cachedToken;
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await get('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': redditUA(cfg),
    },
    body: 'grant_type=client_credentials',
    minGapMs: 0,
    retries: 2,
  });
  const j = JSON.parse(r.text);
  if (!j.access_token) throw new Error(`token 발급 실패: ${j.error || r.text.slice(0, 120)}`);
  cachedToken = j.access_token;
  tokenAt = Date.now();
  return cachedToken;
}

function normalizePost(d) {
  return {
    platform: 'reddit',
    source: d.subreddit ? `r/${d.subreddit}` : 'reddit',
    title: decodeEntities(d.title || ''),
    link: d.permalink ? 'https://www.reddit.com' + d.permalink : '',
    ts: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '',
    author: d.author || '',
    score: d.score ?? 0,
    comments: d.num_comments ?? 0,
  };
}

/** OAuth JSON API */
export async function fetchSubredditOAuth(cfg, sub, { window = 'week', limit = 25, sort = 'top' } = {}) {
  const token = await getRedditToken(cfg);
  const url =
    `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${sort}?t=${window}&limit=${limit}&raw_json=1`;
  const j = await getJson(url, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': redditUA(cfg) },
    minGapMs: 1200,
  });
  return (j.data?.children || []).map((c) => normalizePost(c.data));
}

export async function searchRedditOAuth(cfg, q, { window = 'week', limit = 25, sort = 'new' } = {}) {
  const token = await getRedditToken(cfg);
  const url =
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=${sort}&t=${window}&limit=${limit}&raw_json=1`;
  const j = await getJson(url, {
    headers: { authorization: `Bearer ${token}`, 'user-agent': redditUA(cfg) },
    minGapMs: 1200,
  });
  return (j.data?.children || []).map((c) => normalizePost(c.data));
}

/** RSS 폴백 (인증 없이, 1회 정도만 성공) */
async function fetchViaRSS(path, cfg) {
  const r = await get(`https://www.reddit.com${path}`, {
    headers: {
      accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': redditUA(cfg),
    },
    minGapMs: 12000,
    retries: 1,
  });
  const items = [];
  const blocks = r.text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const title = stripTags((b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '');
    const link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const ts = (b.match(/<updated>([^<]+)<\/updated>/) || [])[1] || '';
    const author = (b.match(/<name>([^<]+)<\/name>/) || [])[1] || '';
    if (title) {
      items.push({
        platform: 'reddit',
        source: subredditFromLink(link) || 'reddit',
        title,
        link,
        ts,
        author,
      });
    }
  }
  return items;
}

/** 링크에서 서브레딧 이름 추출 (r/dankmemes → dankmemes) */
export function subredditFromLink(link) {
  const m = String(link || '').match(/reddit\.com\/r\/([^/?#]+)/i);
  return m ? m[1] : '';
}

/**
 * Reddit는 IP당 요청 쿼터가 매우 빡빡해서 429가 자주 난다.
 * 한 번 429를 만나면 나머지 요청은 10분간 중단한다 (무의미한 재시도 방지).
 */
let rateLimitedUntil = 0;

export async function collectReddit(cfg, { subs = [], queries = [] } = {}) {
  const out = [];
  const errors = [];
  const hasOAuth = !!(cfg.reddit?.clientId && cfg.reddit?.clientSecret);

  for (const sub of subs) {
    if (Date.now() < rateLimitedUntil) {
      errors.push(`r/${sub}: reddit 429 감지 → 남은 요청 중단 (10분 대기)`);
      break;
    }
    try {
      if (hasOAuth) out.push(...(await fetchSubredditOAuth(cfg, sub)));
      else {
        const items = await fetchViaRSS(`/r/${encodeURIComponent(sub)}/top/.rss?t=week&limit=25`, cfg);
        if (!items.length) throw new Error('빈 응답 (RSS는 IP당 1회만 성공 — OAuth 키 권장)');
        out.push(...items);
      }
    } catch (e) {
      if (String(e.message).includes('429')) rateLimitedUntil = Date.now() + 10 * 60 * 1000;
      errors.push(`r/${sub}: ${e.message}`);
    }
  }

  // 검색은 OAuth 없이는 쓰면 안 된다.
  // (2026-10-23 실측: 인증 없는 search.rss 는 'genderbend fanart' 검색에 대해
  //  r/MakeFriendsOver30, r/ForeverAloneDating 등 무관 서브레딧 25건을 반환했다.)
  if (queries.length) {
    if (!hasOAuth) {
      errors.push(
        `검색 ${queries.length}건 스킵: RSS 검색은 무관 결과를 반환함 → Reddit OAuth 키 필요`
      );
    } else {
      for (const q of queries) {
        if (Date.now() < rateLimitedUntil) {
          errors.push(`search "${q}": reddit 429 감지 → 남은 요청 중단 (10분 대기)`);
          break;
        }
        try {
          out.push(...(await searchRedditOAuth(cfg, q)));
        } catch (e) {
          if (String(e.message).includes('429')) rateLimitedUntil = Date.now() + 10 * 60 * 1000;
          errors.push(`search "${q}": ${e.message}`);
        }
      }
    }
  }
  return { items: out, errors };
}
