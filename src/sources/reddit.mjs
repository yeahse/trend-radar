import { get, getJson, sleep } from '../util.mjs';
import { decodeEntities, stripTags } from '../util.mjs';
import { redditAuth, redditAuthStatus } from '../reddit_auth.mjs';

/**
 * Reddit Data API User-Agent (공식 요구 형식, 2026-10-24 정책 문서 확인)
 *   "<platform>:<app ID>:<version string> (by /u/<reddit username>)"
 *   예: windows:trend-radar:v1.0.0 (by /u/ahuuu135)
 *   Reddit은 "Python/urllib" 같은 기본 UA를 "drastically limited" 처리한다.
 *   → 인증 모듈이 인증된 계정 기준으로 UA를 만들어준다 (reddit_auth.mjs)
 */
function redditUA(cfg, auth) {
  return auth?.ua || `windows:trend-radar:v1.0.0 (by /u/${cfg.reddit?.username || 'trend-radar-user'})`;
}

/**
 * Reddit 인증 확보.
 * 2026-10-24 정책 변경으로 reddit.com/prefs/apps "create app" 이 전 계정 차단됨
 * → reddit_auth.mjs 가 두 경로를 자동 선택한다.
 *   A) classic : client_id/secret (정식 Data Access Request 승인 후)
 *   B) devvit  : 공식 Devvit CLI 토큰 + 자동 갱신 (현재 동작 경로)
 */
export async function getRedditAuth(cfg) {
  return redditAuth(cfg);
}

export async function getRedditToken(cfg) {
  const auth = await redditAuth(cfg);
  return auth.token;
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
  const auth = await redditAuth(cfg);
  const url =
    `https://oauth.reddit.com/r/${encodeURIComponent(sub)}/${sort}?t=${window}&limit=${limit}&raw_json=1`;
  const j = await getJson(url, {
    headers: { authorization: `Bearer ${auth.token}`, 'user-agent': auth.ua },
    minGapMs: 1200,
  });
  return (j.data?.children || []).map((c) => normalizePost(c.data));
}

export async function searchRedditOAuth(cfg, q, { window = 'week', limit = 25, sort = 'new' } = {}) {
  const auth = await redditAuth(cfg);
  const url =
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=${sort}&t=${window}&limit=${limit}&raw_json=1`;
  const j = await getJson(url, {
    headers: { authorization: `Bearer ${auth.token}`, 'user-agent': auth.ua },
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
  const status = await redditAuthStatus(cfg);
  const hasOAuth = status.ok;
  const authMode = status.mode || 'none';

  if (!hasOAuth) {
    errors.push(`Reddit 인증 실패: ${status.error}`);
  }

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
  return { items: out, errors, authMode };
}
