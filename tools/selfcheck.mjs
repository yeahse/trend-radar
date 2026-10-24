/**
 * 핵심 로직 단위 검증 — 2026-10-23 수정 내역의 4가지 결정을 각각 재현
 * 실행: node tools\selfcheck.mjs
 */
import { discoverCandidates, scoreWatchlist } from '../src/score.mjs';
import { parseDatalabRows } from '../src/sources/naver.mjs';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};

console.log('\n=== [1] 신규 발견: 쓰레기 제거 ===');
const items = [
  { platform: 'bluesky', title: 'Malfoid and Harry Pottah fanart', link: 'x', likes: 2 },
  { platform: 'bluesky', title: 'Malfoid and Harry Pottah genderbend', link: 'x', likes: 1 },
  { platform: 'deviantart', title: 'Draco Malfoy fanart', link: 'x', likes: 0 },
  { platform: 'deviantart', title: 'Female Draco illustration', link: 'x', likes: 0 },
  { platform: 'reddit', title: '30 M4F online open to friendship', link: 'x', likes: 0 },
  { platform: 'reddit', title: 'Thinking of this degree as an option', link: 'x', likes: 0 },
  { platform: 'reddit', title: 'looking for new talkative friends', link: 'x', likes: 0 },
  { platform: 'reddit', title: 'Maybe one day we will get one', link: 'x', likes: 0 },
  { platform: 'deviantart', title: 'What is in the bottle, Malfoy', link: 'x', likes: 0 },
  { platform: 'bluesky', title: 'genderbend fanart of Fem Draco', link: 'x', likes: 3 },
  { platform: 'bluesky', title: 'genderbend fanart again today', link: 'x', likes: 1 },
  { platform: 'deviantart', title: 'genderbend fanart collection', link: 'x', likes: 0 },
  { platform: 'bluesky', title: 'The tsundere Draco Malfoy takes', link: 'x', likes: 1 },
];
const disc = discoverCandidates({ items, fitTerms: ['genderbend', 'fem', 'draco'], watchTerms: ['malfoid'] });
const names = disc.map((d) => d.term);
console.log('  후보:', JSON.stringify(names));
ok('"online" 제거됨', !names.includes('online'));
ok('"thinking" 제거됨', !names.includes('thinking'));
ok('"looking" 제거됨', !names.includes('looking'));
ok('"maybe" 제거됨', !names.includes('maybe'));
ok('"what\'s" 제거됨', !names.includes("what's"));
ok('"genderbend fanart" 유지', names.includes('genderbend fanart'));
ok('"draco malfoy" 유지', names.includes('draco malfoy'));

console.log('\n=== [2] 저볼륨 성장률 게이트 ===');
const base = { items: [], wiki: [], uploads: {}, fitTerms: ['tsundere'], history: new Map() };
const hi = scoreWatchlist({ ...base, terms: ['tsundere'], naver: [{ term: 'tsundere', growth: 100, last7: 200, prev7: 0 }] })[0];
const lo = scoreWatchlist({ ...base, terms: ['tsundere'], naver: [{ term: 'tsundere', growth: 100, last7: 0.2, prev7: 0 }] })[0];
console.log(`  고볼륨(last7=200) V=${hi.velocity} 점수=${hi.score} / 저볼륨(last7=0.2) V=${lo.velocity} 점수=${lo.score}`);
ok('저볼륨이 점수를 부풀리지 않음', lo.velocity < hi.velocity);
ok('저볼륨 +100% 성장인데 velocity 감쇠', lo.velocity < 30);

console.log('\n=== [3] 네이버 REF 앵커 → 교차배치 비교 ===');
const rows = [
  ['날짜', '__REF_ALL__', '날짜', 'tsundere'],
  ['2026-10-20', 90, '2026-10-20', 0.1],
  ['2026-10-21', 95, '2026-10-21', 0.15],
  ['2026-10-22', 100, '2026-10-22', 0.2],
];
const parsed = parseDatalabRows(rows, [
  { title: '__REF_ALL__', keywords: [] },
  { title: 'tsundere', keywords: ['tsundere'] },
]);
const ts = parsed.find((p) => p.title === 'tsundere');
ok('REF가 있는 요청에서 tsundere가 100이 아님', ts.peak.ratio < 1, `peak=${ts.peak.ratio}`);
ok('REF peak이 100', parsed.find((p) => p.title === '__REF_ALL__').peak.ratio === 100);

console.log('\n=== [4] 모멘텀 (historyMap 스키마) ===');
const mkHist = (scores) => {
  const hist = new Map();
  const snaps = scores.map((sc, i) => ({
    ts: `2026-10-${22 + i}T00:00:00Z`,
    watch: [{ term: 'malfoid', score: sc, velocity: 30 }],
  }));
  for (const s of snaps) for (const it of s.watch || s.items || []) {
    const k = it.term.toLowerCase();
    if (!hist.has(k)) hist.set(k, []);
    hist.get(k).push({ ts: s.ts, score: it.score, velocity: it.velocity });
  }
  return hist;
};
const calcMom = (hist) =>
  scoreWatchlist({ terms: ['malfoid'], items: [], naver: [], wiki: [], uploads: {}, fitTerms: [], history: hist })[0].momentum;
const m1 = calcMom(mkHist([40, 48]));   // (48-40)*2 = 16
const m2 = calcMom(mkHist([40, 58]));   // (58-40)*2 = 36 → ±20 클램프 → 20
const m3 = calcMom(mkHist([48, 40]));   // (40-48)*2 = -16
console.log(`  상승 +8점 → ${m1} / 상승 +18점 → ${m2} (클램프) / 하락 -8점 → ${m3}`);
ok('모멘텀 계산됨 (0 아님)', m1 !== 0);
ok('상승 모멘텀 정확 (+16)', m1 === 16);
ok('상승 모멘텀 클램프 (+36→+20)', m2 === 20);
ok('하락 모멘텀 정확 (-16)', m3 === -16);

console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
