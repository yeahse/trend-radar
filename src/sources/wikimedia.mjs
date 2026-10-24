import { getJson, daysAgoISO } from '../util.mjs';

/**
 * 위키백과 페이지뷰 API — 인물/작품/IP의 관심 급상승을 정량화한다.
 * 말포이처럼 "작품 자체"가 아니라 "캐릭터/개념"이 터지는 경우를 잡아내기에 좋다.
 */
export async function pageviews(article, { days = 30, lang = 'en' } = {}) {
  const ymd = (d) => d.replace(/-/g, '');
  const url =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${lang}.wikipedia/` +
    `all-access/user/${encodeURIComponent(article)}/daily/${ymd(daysAgoISO(days))}/${ymd(daysAgoISO(0))}`;
  const j = await getJson(url, { minGapMs: 800 });
  const items = (j.items || []).map((i) => ({
    period: i.timestamp.slice(0, 8),
    views: i.views,
  }));
  const last7 = items.slice(-7).reduce((a, b) => a + b.views, 0);
  const prev7 = items.slice(-14, -7).reduce((a, b) => a + b.views, 0);
  const last3 = items.slice(-3).reduce((a, b) => a + b.views, 0);
  const prev3 = items.slice(-6, -3).reduce((a, b) => a + b.views, 0);
  return {
    article,
    total: items.reduce((a, b) => a + b.views, 0),
    last7,
    prev7,
    growth7: prev7 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0,
    growth3: prev3 ? ((last3 - prev3) / prev3) * 100 : last3 > 0 ? 100 : 0,
    series: items,
  };
}

export async function collectWikimedia(pairs) {
  const items = [];
  const errors = [];
  for (const p of pairs) {
    const article = typeof p === 'string' ? p : p.article;
    const term = typeof p === 'string' ? p : p.term || article;
    if (!article) continue;
    try {
      const r = await pageviews(article);
      items.push({ platform: 'wikimedia', source: 'wikipedia', term, article, ...r });
    } catch (e) {
      errors.push(`wiki "${article}": ${e.message}`);
    }
  }
  return { items, errors };
}
