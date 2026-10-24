import { get, getJson, parseFeed, daysAgoISO, noteQuota } from '../util.mjs';
import { supplyProxy, proxySupplyDeficit } from './youtube_supply.mjs';

const API = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube Data API: 키워드별 최근 N일 공급량 + 경쟁 영상 목록 (1회 호출로 둘 다)
 *
 * ⚠️ 쿼터가 절약된다:
 *   search.list = 100 유닛/호출, 일일 10,000 유닛.
 *   part=id 로 개수만 세고 part=snippet 으로 제목을 다시 받는 식으로 2회 호출하면 200유닛/term.
 *   **part=snippet 만으로 totalResults(개수) + 영상목록을 동시에 받는다** → 100유닛/term 으로 끝.
 *
 * @returns {{count:number, videos:Array}}  count = 최근 N일 업로드 수(근사), videos = 상위 경쟁영상
 */
export async function supplyAndCompetitors(keyword, apiKey, { days = 7, regionCode = 'KR', maxResults = 15 } = {}) {
  const url =
    `${API}/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(keyword)}` +
    `&publishedAfter=${daysAgoISO(days)}T00:00:00Z&regionCode=${regionCode}&key=${apiKey}`;
  noteQuota('search.list', 100);
  const j = await getJson(url, { minGapMs: 400 });
  return {
    count: j.pageInfo?.totalResults ?? 0,
    videos: (j.items || []).map((v) => ({
      title: v.snippet?.title,
      channel: v.snippet?.channelTitle,
      views: Number(v.snippet?.viewCount || 0),
      publishedAt: v.snippet?.publishedAt,
      url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
    })),
  };
}

/** YouTube Data API: 지역별 인기 동영상 (Trending 대체) */
export async function mostPopular(apiKey, { regionCode = 'KR', maxResults = 50 } = {}) {
  // ⚠️ id 파라미터를 빈 값으로 보내면 HTTP 400 (chart 모드에서는 id 지정 불가)
  const url = `${API}/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&maxResults=${maxResults}&key=${apiKey}`;
  noteQuota('videos.list', 1);
  const j = await getJson(url, { minGapMs: 400 });
  return (j.items || []).map((v) => ({
    title: v.snippet?.title,
    channel: v.snippet?.channelTitle,
    views: Number(v.statistics?.viewCount || 0),
    publishedAt: v.snippet?.publishedAt,
    tags: v.snippet?.tags || [],
    url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

/** 경쟁 채널 신규 업로드 감시 (RSS - API 키 불필요) */
export async function channelLatest(channelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const r = await get(url, { minGapMs: 1500 });
  return parseFeed(r.text).map((i) => ({
    title: i.title,
    link: i.link,
    ts: i.published,
    channelId,
  }));
}

/** 경쟁 채널에서 특정 키워드가 포함된 신규 영상만 골라낸다 (与我 포맷 경쟁 감지) */
export async function competitorKeywordHits(cfg, keywords) {
  const ids = cfg.youtube?.watchChannelIds || [];
  const hits = [];
  const errors = [];
  for (const id of ids) {
    try {
      const vids = await channelLatest(id);
      for (const v of vids) {
        const t = (v.title || '').toLowerCase();
        const matched = keywords.filter((k) => t.includes(k.toLowerCase()));
        if (matched.length) hits.push({ ...v, matched });
      }
    } catch (e) {
      errors.push(`channel ${id}: ${e.message}`);
    }
  }
  return { hits, errors };
}

export async function collectYouTube(cfg, watchTerms = [], { proxyTerms = [], cache = null, force = false } = {}) {
  const errors = [];
  let trending = [];
  const uploads = {};
  const supply = {};
  const competitors = {};
  let supplySource = 'none';
  let quotaHit = false;

  if (cfg.youtube?.apiKey) {
    // ⚠️ 쿼터 관리: search.list = 100유닛/호출, 일일 10,000유닛 (매일 08:00 KST 리셋)
    //    → term당 1회만 호출 + 12시간 캐시로 하루 1,000유닛 안쪽 유지
    const CACHE_KEY = 'yt_supply';
    const TTL_MS = 12 * 3600 * 1000;
    const cached = cache && !force ? cache.getResult?.(CACHE_KEY) : null;
    const cachedAt = cache && !force ? cache.getSourceTime?.(CACHE_KEY) : 0;
    const cacheFresh = cached && Date.now() - cachedAt < TTL_MS;

    let apiTerms;
    if (cacheFresh) {
      apiTerms = [];
      for (const [k, v] of Object.entries(cached)) {
        if (k === '__meta') continue;
        uploads[k] = v.count;
        competitors[k] = v.videos || [];
      }
      supplySource = 'api(cache)';
    } else {
      // 수요가 있는 term 우선 (유需求量 기준)
      apiTerms = (proxyTerms.length ? proxyTerms : watchTerms).slice(0, 10);
      const bucket = {};
      for (const term of apiTerms) {
        try {
          const r = await supplyAndCompetitors(term, cfg.youtube.apiKey, {
            regionCode: cfg.youtube.regionCode || 'KR',
            maxResults: 12,
          });
          uploads[term] = r.count;
          competitors[term] = r.videos;
          bucket[term] = { count: r.count, videos: r.videos };
        } catch (e) {
          if (String(e.message).includes('429')) {
            quotaHit = true;
            errors.push(`uploads("${term}"): HTTP 429 (일일 쿼터 소진 — 미국태평양시간 자정/KST 오후 4시경 리셋)`);
            // ★ 2026-10-24 — 쿼터 소진돼도 남은 term 은 **키 불필요 프록시**로 폴백한다.
            //    그래야 공급량이 통째로 빈칸이 안 된다 (score.mjs 는 uploads > supply 순으로 쓴다)
            for (const t of apiTerms.slice(apiTerms.indexOf(term))) {
              try {
                supply[t] = await supplyProxy(t);
              } catch { /* 폴백도 실패면 그냥 둔다 */ }
            }
            errors.push(`→ 남은 ${apiTerms.length - apiTerms.indexOf(term)}개 term 은 프록시(키 무의존) 폴백으로 측정`);
            break; // 남은 term은 시도하지 않음 (쿼터 더 태우지 않기)
          }
          errors.push(`uploads("${term}"): ${e.message}`);
        }
      }
      if (cache && Object.keys(bucket).length) {
        cache.saveResult?.(CACHE_KEY, bucket);
        cache.markFetched?.(CACHE_KEY);
      }
      supplySource = 'api';
    }

    try {
      trending = await mostPopular(cfg.youtube.apiKey, {
        regionCode: cfg.youtube.regionCode || 'KR',
        maxResults: 50,
      });
    } catch (e) {
      errors.push(`mostPopular: ${e.message}`);
    }
  } else if (cfg.youtube?.useProxySupply !== false && proxyTerms.length) {
    // 키 없이 대용 신호: 검색 상위 결과 중 최근 7일 게시 비율 (절대값 아님, 상대 비교용)
    supplySource = 'proxy';
    for (const term of proxyTerms) {
      try {
        const p = await supplyProxy(term);
        supply[term] = p;
      } catch (e) {
        errors.push(`supplyProxy("${term}"): ${e.message}`);
        await new Promise((r) => setTimeout(r, 4000)); // 연속 실패 시 쿨다운
      }
    }
    errors.push(
      'youtube.apiKey 없음 → 공급량은 검색필터(동영상+이번주) 기반 근사치로 측정 (±1~5% 오차). API 키가 더 정확.'
    );
  } else {
    errors.push('youtube.apiKey 없음 → 인기/공급량 수집 스킵 (무료 API 키 발급: README 참고)');
  }

  const comp = await competitorKeywordHits(cfg, watchTerms);
  errors.push(...comp.errors);

  return { trending, uploads, supply, competitors, supplySource, quotaHit, competitorHits: comp.hits, errors };
}
