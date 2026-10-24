import { get, stripTags, decodeEntities } from '../util.mjs';

/** itch.io 신규 인기 게임 — "밈가 VizNovel로 확장" 단계의 선행지표 (말포이 VN 사례) */
export async function fetchItchNewPopular() {
  const r = await get('https://itch.io/games/new-and-popular', { minGapMs: 2500 });
  const out = [];
  // 실제 마크업 (2026-10-23 실측):
  // <div class="game_title"><a data-label="..." href="https://vadeum.itch.io/legendum" class="title game_link">Legendum</a></div>
  const re = /<div class="game_title">\s*<a[^>]*href="([^"]+)"[^>]*>([^<]{1,120})<\/a>/g;
  let m;
  while ((m = re.exec(r.text))) {
    const title = decodeEntities(m[2]).trim();
    if (!title) continue;
    out.push({
      platform: 'itch',
      source: 'itch.io',
      title,
      link: m[1].startsWith('http') ? m[1] : 'https://itch.io' + m[1],
      ts: new Date().toISOString(),
    });
  }
  return out;
}

/** DeviantArt 태그/작품 페이지 — 신규 팬아트 신호 */
export async function fetchDeviantArtTag(tag) {
  const r = await get(`https://www.deviantart.com/tag/${encodeURIComponent(tag)}`, {
    minGapMs: 3000,
  });
  const out = [];
  const seen = new Set();

  // (1) 2026-10-23 실측 구조 — __NEXT_DATA__ 는 더 이상 없고 이 구조로 바뀜:
  // <a href="https://www.deviantart.com/<user>/art/<slug>-<id>" aria-label="&quot;TITLE&quot; by AUTHOR, visual art">
  const reA =
    /<a[^>]*href="(https:\/\/www\.deviantart\.com\/[^"]+\/art\/[^"]+)"[^>]*aria-label="([^"]+)"/g;
  let m;
  while ((m = reA.exec(r.text))) {
    const label = decodeEntities(m[2]);
    // '"TITLE" by AUTHOR, visual art' 파싱
    const mm = label.match(/^"?(.+?)"?\s+by\s+(.+?),\s*(?:visual art|illustration|concept art)/i);
    const title = (mm ? mm[1] : label.split(' by ')[0]).replace(/^"|"$/g, '').trim();
    const author = mm ? mm[2].trim() : '';
    if (!title || title.length < 2) continue;
    if (isDAChrome(title)) continue; // 'Comment' / '5 Comments' 같은 UI 잔재
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    out.push({
      platform: 'deviantart',
      source: `da:${tag}`,
      title,
      author,
      link: m[1],
      ts: new Date().toISOString(),
    });
  }

  // (2) 폴백: 썸네일 alt 텍스트 (아바타/머천은 제외)
  if (!out.length) {
    const reB = /<img[^>]+alt="([^"]+)"/g;
    let x;
    while ((x = reB.exec(r.text))) {
      const alt = decodeEntities(x[1]).trim();
      if (!alt || alt.length < 3 || alt.length > 140) continue;
      if (/avatar|Merch|Shop/i.test(alt)) continue;
      if (isDAChrome(alt)) continue;
      if (seen.has(alt.toLowerCase())) continue;
      seen.add(alt.toLowerCase());
      out.push({
        platform: 'deviantart',
        source: `da:${tag}`,
        title: alt,
        author: '',
        link: `https://www.deviantart.com/tag/${encodeURIComponent(tag)}`,
        ts: new Date().toISOString(),
      });
    }
  }
  return out;
}

/** DA 페이지 UI 잔재('Comment', '12 Comments' 등) 판별 */
function isDAChrome(title) {
  return /^\s*\d*\s*comments?\s*$/i.test(title);
}

export async function collectEarlyCommunity(cfg) {
  const items = [];
  const errors = [];
  try {
    const itch = await fetchItchNewPopular();
    if (!itch.length) errors.push('itch: 파싱 결과 0건 (마크업 변경됨 — 정규식 점검 필요)');
    items.push(...itch);
  } catch (e) {
    errors.push(`itch: ${e.message}`);
  }
  for (const tag of cfg.deviantartTags || []) {
    try {
      const da = await fetchDeviantArtTag(tag);
      if (!da.length) errors.push(`deviantart "${tag}": 파싱 결과 0건 (마크업 변경됨)`);
      items.push(...da);
    } catch (e) {
      errors.push(`deviantart "${tag}": ${e.message}`);
    }
  }
  return { items, errors };
}
