import { getJson } from '../util.mjs';
import { daysAgoISO } from '../util.mjs';

/**
 * 🔀 크로스오버 탐지 — Reddit OAuth 대체
 *
 * 왜 대체하나 (2026-10-24):
 *   Reddit 공개 API는 2027-01-12(미등록 시 차단) → 2027-03(공개 API 완전 종료) 예정.
 *   애써 등록해도 1년 뒤에 죽는다. 크로스오버 밈 탐지는 Reddit에만 있을 필요 없다.
 *   → **YouTube Data API `search`** 로 같은 역할을 한다. 키가 이미 있고 100QPM/10K유닛.
 *
 * 잡는 것:
 *   totalResults = 해당 주제의 총 공급량(얼마나 많이 만들어졌나)
 *   recentRatio  = 최신순 50편 중 최근 7일 비율 (= 지금 뜨는 정도)
 *   channelMix   = 상위 영상의 채널 분산 (서로 다른 채널이면 = 크로스오버 진행 중)
 *   newChannels  = 상위 중 7일 이내 첫 게시 채널 수 (= 새로 진입한 채널 = 확산 중)
 */

const API = 'https://www.googleapis.com/youtube/v3';

function numDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function searchVideos(keyword, apiKey, { regionCode = 'US', maxResults = 50, publishedAfter } = {}) {
  const p = new URLSearchParams({
    // ⚠️ search.list는 statistics를 제공하지 않는다 (part=snippet,statistics → HTTP 400)
    part: 'snippet',
    type: 'video',
    q: keyword,
    order: 'date', // ★ 최신순 → 최근성 측정 가능
    maxResults: String(maxResults),
    regionCode,
    key: apiKey,
  });
  if (publishedAfter) p.set('publishedAfter', publishedAfter);
  const j = await getJson(`${API}/search?${p}`, { minGapMs: 120 });
  return j;
}

function within7(publishedAt) {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  return Date.now() - t <= 7 * 86400000;
}

/**
 * 단일 키워드 크로스오버 신호
 */
export async function crossoverSignal(keyword, apiKey, { regionCode = 'US' } = {}) {
  const j = await searchVideos(keyword, apiKey, { regionCode, maxResults: 50 });
  const items = j.items || [];
  const total = j.pageInfo?.totalResults ?? 0;

  const recent = items.filter((v) => within7(v.snippet?.publishedAt));
  const recentRatio = items.length ? recent.length / items.length : 0;

  const channels = new Set(items.map((v) => v.snippet?.channelId).filter(Boolean));
  const recentChannels = new Set(recent.map((v) => v.snippet?.channelId).filter(Boolean));
  const top = items.slice(0, 10).map((v) => ({
    title: v.snippet?.title,
    channel: v.snippet?.channelTitle,
    publishedAt: v.snippet?.publishedAt,
    url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
  }));
  const recentTop = top.filter((v) => within7(v.publishedAt));

  return {
    keyword,
    totalSupply: total,
    sampled: items.length,
    recentCount: recent.length,
    recentRatio: Math.round(recentRatio * 100),
    channelCount: channels.size,
    newChannelCount: recentChannels.size,
    // 크로스오버 점수: 최근성 + 채널 분산
    crossoverScore: Math.round(
      Math.min(60, recentRatio * 60) +
        Math.min(40, (channels.size / Math.max(1, items.length)) * 40 * 2)
    ),
    top,
    recentTop,
  };
}

/**
 * 여러 키워드를 배치로 탐지
 */
export async function collectCrossover(cfg, keywords, { regionCode = 'US', max = 8 } = {}) {
  const out = [];
  const errors = [];
  if (!cfg.youtube?.apiKey) {
    return { items: out, errors: ['youtube.apiKey 없음 → 크로스오버 탐지 스킵'] };
  }
  for (const kw of keywords.slice(0, max)) {
    try {
      out.push(await crossoverSignal(kw, cfg.youtube.apiKey, { regionCode }));
    } catch (e) {
      errors.push(`crossover("${kw}"): ${e.message}`);
    }
  }
  return { items: out, errors };
}
