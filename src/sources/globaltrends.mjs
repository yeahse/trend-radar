import { get, getJson, noteQuota } from '../util.mjs';

/**
 * 🌍 글로벌 트렌드 수집 — "전 세계 지금 뭐가 유행하는가"
 *
 * 왜 별도 모듈인가 (2026-10-23):
 *   기존 watchlist 분석은 **네가 지정한 키워드**만 본다 (해리포터 계열).
 *   "지금 세계가 뭘 원하는가"를 보는 표면이 아예 없었기 때문에 HP만 나왔던 것.
 *   → watchlist와 무관하게, 전 세계에서 지금 뜨는 걸 별도로 수집하고
 *     → 그걸 네 채널 포맷에 매칭하는 단계로 연결한다.
 *
 * 소스별 신뢰도 (2026-10-23 실측):
 *   YouTube mostPopular ★★★  국가당 50편 (1유닛/국가) → 37개국 1,850편
 *   Google Trends RSS  ★★★  키 불필요, 국가당 10건 (RSS가 10건 고정) → 국가를 넓혀야 함
 *   Wikipedia mostread ★★☆  언어당 43~48건 → 13개 언어 585건
 *   Reddit r/popular  ★★☆   RSS 1회만 성공 → 이후 429
 *   TikTok / Instagram  ✗    공개 API 없음(404 / SPA) → 수동
 *
 * ⚠️ YouTube popular RSS(`feeds/videos.xml?chart=mostPopular`)는 400 → API만 사용.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 동시 요청 제한 (같은 호스트로 너무 몰리면 429) */
async function pooled(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        const r = await fn(items[idx], idx);
        if (r) out.push(r);
      } catch {
        /* 개별 실패는 무시하고 계속 */
      }
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Google Trends 급상승 RSS (공개, 키 불필요)
 * ⚠️ RSS는 국가당 10건이 고정 → 더 많이 얻으려면 국가를 넓혀야 한다.
 */
export async function googleTrends(geos = ['US', 'KR', 'JP'], { limit = 10 } = {}) {
  const errors = [];
  const results = await pooled(geos, 3, async (geo) => {
    try {
      const r = await get(`https://trends.google.com/trending/rss?geo=${geo}`, {
        minGapMs: 700,
        retries: 2,
        timeoutMs: 15000,
        headers: { accept: 'application/rss+xml, application/xml, text/xml, */*' },
      });
      const items = [...r.text.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
      const out = [];
      let rank = 0;
      for (const it of items.slice(0, limit)) {
        const title = (it.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const traffic = (it.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/) || [])[1] || '';
        const link = (it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        if (!title.trim()) continue;
        rank++;
        out.push({
          source: 'google-trends',
          geo,
          term: title.trim(),
          metric: traffic.replace('+', '') || '',
          metricNum: parseTraffic(traffic),
          rank,
          url: link.trim(),
        });
      }
      return out;
    } catch (e) {
      errors.push(`google-trends(${geo}): ${e.message}`);
      return null;
    }
  });
  return { items: results.flat().filter(Boolean), errors };
}

/** "1,000+" → 1000, "200+" → 200 */
function parseTraffic(s) {
  const n = Number(String(s).replace(/[+,\s]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * YouTube 지역별 인기 영상 (API 키 필요, 1유닛/호출, 국가당 최대 50편)
 * @returns {{items:Array, errors:Array}}
 */
export async function youtubeTrendingByRegion(regions = ['US', 'KR', 'JP'], apiKey, { limit = 50 } = {}) {
  const out = [];
  const errors = [];
  if (!apiKey) return { items: out, errors: ['youtube.apiKey 없음 → 지역별 인기 영상 스킵'] };
  for (const rc of regions) {
    try {
      const url =
        'https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular' +
        `&regionCode=${rc}&maxResults=${limit}&key=${apiKey}`;
      noteQuota('videos.list', 1);
      const j = await getJson(url, { minGapMs: 180, timeoutMs: 20000 });
      (j.items || []).forEach((v, i) => {
        out.push({
          source: 'youtube-popular',
          geo: rc,
          term: v.snippet?.title || '',
          channel: v.snippet?.channelTitle || '',
          metric: Number(v.statistics?.viewCount || 0),
          metricNum: Number(v.statistics?.viewCount || 0),
          // ★ 절대 조회수만으��� "지금 뜨는 것"을 못 본다 → 게시 시각이 있어야 상대속도가 계산된다
          publishedAt: v.snippet?.publishedAt || '',
          rank: i + 1,
          url: `https://www.youtube.com/watch?v=${v.id}`,
        });
      });
    } catch (e) {
      if (String(e.message).includes('429')) {
        errors.push(`youtube-popular(${rc}): HTTP 429 (쿼터 소진 — 더 시도하지 않음)`);
        break;
      }
      errors.push(`youtube-popular(${rc}): ${e.message}`);
    }
  }
  return { items: out, errors };
}

/**
 * Wikipedia 그날 가장 많이 본 문서 (= 화제)
 * ⚠️ 언어당 43~48건이 나온다 (12건으로 자를 이유 없음)
 */
export async function wikipediaMostRead(langs = ['en', 'ko', 'ja'], { limit = 50 } = {}) {
  const errors = [];
  const now = new Date();
  const d = new Date(now.getTime() - 86400000);
  const ymd = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;

  const results = await pooled(langs, 3, async (lang) => {
    try {
      const r = await get(`https://api.wikimedia.org/feed/v1/wikipedia/${lang}/featured/${ymd}`, {
        minGapMs: 300,
        retries: 1,
        timeoutMs: 15000,
      });
      const j = JSON.parse(r.text);
      const arts = j.mostread?.articles || [];
      return arts.slice(0, limit).map((a, i) => ({
        source: 'wikipedia',
        geo: lang.toUpperCase(),
        term: (a.title || '').replace(/_/g, ' '),
        metric: a.views || 0,
        metricNum: a.views || 0,
        rank: i + 1,
        url: a.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${a.title}`,
      }));
    } catch (e) {
      errors.push(`wikipedia(${lang}): ${e.message}`);
      return null;
    }
  });
  return { items: results.flat().filter(Boolean), errors };
}

/**
 * Reddit r/popular (RSS) — 지금 뜨는 콘텐츠
 * ⚠️ IP당 1회만 성공하는 경우가 많아 호출은 1회로 제한, 간격 넉넉히
 */
export async function redditPopular({ limit = 25 } = {}) {
  const out = [];
  const errors = [];
  try {
    const r = await get('https://www.reddit.com/r/popular/top/.rss?t=day&limit=25', {
      minGapMs: 12000,
      retries: 1,
      timeoutMs: 20000,
      headers: { accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    const blocks = r.text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    blocks.slice(0, limit).forEach((b, i) => {
      const title = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
      const link = (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
      const sub = (b.match(/<category[^>]*term="([^"]+)"/) || [])[1] || '';
      if (!title.trim()) return;
      out.push({
        source: 'reddit-popular',
        geo: 'GLOBAL',
        term: title.trim().replace(/&amp;/g, '&'),
        channel: sub ? `r/${sub}` : '',
        metric: 0,
        metricNum: 0,
        rank: i + 1,
        url: link,
      });
    });
  } catch (e) {
    errors.push(`reddit-popular: ${e.message}`);
  }
  return { items: out, errors };
}

/**
 * 전 소스 통합 수집
 */
export async function collectGlobalTrends(cfg, { geos, regions, langs, ytMax = 50, wikiMax = 50 } = {}) {
  const g = geos || cfg.globalTrends?.geos || ['US', 'KR', 'JP'];
  const rl = regions || cfg.globalTrends?.ytRegions || g;
  const ll = langs || cfg.globalTrends?.wikiLangs || ['en', 'ko', 'ja'];

  const [gt, yt, wk, rd] = await Promise.all([
    googleTrends(g, { limit: cfg.globalTrends?.trendsMax || 10 }),
    youtubeTrendingByRegion(rl, cfg.youtube?.apiKey, { limit: ytMax }),
    wikipediaMostRead(ll, { limit: wikiMax }),
    redditPopular(),
  ]);

  return {
    items: [...gt.items, ...yt.items, ...wk.items, ...rd.items],
    errors: [...gt.errors, ...yt.errors, ...wk.errors, ...rd.errors],
    bySource: {
      'google-trends': gt.items,
      'youtube-popular': yt.items,
      wikipedia: wk.items,
      'reddit-popular': rd.items,
    },
  };
}
