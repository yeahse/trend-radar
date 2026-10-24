/**
 * 소스별 수집健全성 점검 — 파서 깨짐(조용한 0건) 조기 감지용
 *
 * 2026-10-23 실제로 itch.io / DeviantArt가 "에러 없이 0건"을 반환하고 있었다.
 * 이 스크립트는 각 소스를 1회씩 직접 긁어서 "아이템 수 + 첫 3개"를 출력한다.
 *
 * 사용: node tools\verify_sources.mjs
 */
import { collectReddit } from '../src/sources/reddit.mjs';
import { collectBluesky } from '../src/sources/bluesky.mjs';
import { collectKYM } from '../src/sources/kym.mjs';
import { collectEarlyCommunity } from '../src/sources/earlycommunity.mjs';
import { collectNaver } from '../src/sources/naver.mjs';
import { collectWikimedia } from '../src/sources/wikimedia.mjs';
import { loadConfig } from '../src/store.mjs';

const cfg = await loadConfig();
const terms = cfg.watchlist?.terms || [];
const wikiPairs = Object.entries(cfg.watchlist?.wikiMap || {}).map(([term, article]) => ({ term, article }));

const show = (name, items, errs) => {
  const n = Array.isArray(items) ? items.length : 0;
  const flag = n === 0 ? '❌ 0건 — 파서/차단 확인 필요' : n < 5 ? '⚠️ 적은 편' : '✅';
  console.log(`\n${flag} ${name}: ${n}건`);
  (items || []).slice(0, 3).forEach((i) =>
    console.log(`    - ${String(i.title || '').slice(0, 80)}  [${i.source || i.platform}]`)
  );
  (errs || []).forEach((e) => console.log(`    ⚠️ ${e}`));
};

console.log('=== 소스별 수집 점검 ===');

const rd = await collectReddit(cfg, { subs: ['dankmemes'], queries: [] });
show('Reddit (dankmemes)', rd.items, rd.errors);

const bs = await collectBluesky(cfg);
show('Bluesky', bs.items, bs.errors);

const ky = await collectKYM();
show('Know Your Meme', ky.items, ky.errors);

const ec = await collectEarlyCommunity(cfg);
show('itch.io + DeviantArt', ec.items, ec.errors);

const nv = await collectNaver(cfg, terms);
show('Naver DataLab', nv.items, nv.errors);
console.log('    기준 그룹(__REF_ALL__) 제외, 실제 term 수 =', nv.items.length);

const wk = await collectWikimedia(wikiPairs);
show('Wikipedia pageviews', wk.items, wk.errors);

console.log('\n=== 끝 ===');
console.log('0건이 나온 소스가 있으면 마크업이 바뀐 것 → src/sources/*.mjs 파서 점검 필요');
