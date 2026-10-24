import { get, stripTags } from '../util.mjs';

/**
 * Know Your Meme trending — 새 밈의 "탄생"을 잡는 가장 빠른 공개 소스.
 * 말포이 사례: 2026-09-30 KYM 첫 보도(=아직 "Under Research") → 10/2 템플릿 인식 → 이후 확산
 */
export async function fetchKYMTrending() {
  const r = await get('https://knowyourmeme.com/trending', { minGapMs: 2000 });
  const html = r.text;
  const out = [];
  const blocks = html.match(/<a class="wide-card"[\s\S]*?<\/a>/g) || [];
  for (const b of blocks) {
    const href = (b.match(/href="(\/memes\/[a-z0-9-]+)"/) || [])[1] || '';
    if (!href) continue;
    const alt = (b.match(/alt="([^"]{3,120})"/) || [])[1] || '';
    const h = (b.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '';
    const title = stripTags(h || alt).replace(/\s*meme example image\.?$/i, '').trim();
    if (!title) continue;
    out.push({
      platform: 'kym',
      source: 'knowyourmeme',
      title,
      link: 'https://knowyourmeme.com' + href,
      ts: new Date().toISOString(),
    });
  }
  return out;
}

/** Know Your Meme 항목별 최초 보도일 → 신선도(ageDays) 계산용 */
export async function fetchKYMEntry(slug) {
  const r = await get(`https://knowyourmeme.com/memes/${slug}`, { minGapMs: 2500 });
  const m =
    r.text.match(/Published\s*<[^>]*>([^<]{4,40})<\/a>/i) ||
    r.text.match(/href="\/memes\/[^"]+">([^<]{4,40})<\/a>\s*<\/div>\s*<div class="detail">/i);
  const txt = r.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const pm = txt.match(/Published\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  const om = txt.match(/Origin\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i);
  return {
    slug,
    published: pm ? pm[1] : null,
    origin: om ? om[1] : null,
    status: /Under Research/i.test(r.text) ? 'under-research' : 'documented',
  };
}

export async function collectKYM() {
  try {
    return { items: await fetchKYMTrending(), errors: [] };
  } catch (e) {
    return { items: [], errors: [`kym: ${e.message}`] };
  }
}
