/**
 * 편향 검증 — "특정 IP에 특별대우하고 있진 않은가" 를 재현 가능하게 확인
 *
 * 사용: node tools/verify_no_bias.mjs
 *
 * 기준:
 *   ① coreSignals 에 IP 고유어(harry potter / marvel / nintendo / narnia …) 가 없어야 한다
 *   ② fitTerms 가 비어 있어야 한다 (IP 고유어 직접 매칭 금지)
 *   ③ 직격 매칭 결과에 IP 브랜드 고유어가 없어야 한다
 *   ④ 단어경계 매칭: 'witch' ⊂ "Swi[tch]" 같은 부분문자열 오탐이 없어야 한다
 */
import { matchGlobalTrends, buildIdeas } from '../src/globalmatch.mjs';
import { collectGlobalTrends } from '../src/sources/globaltrends.mjs';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

const BRAND =
  /harry potter|해리\s?포터|ハリー|死の|ホグワ|marvel|dc comics|star wars|nintendo|pokemon|ghibli|jujutsu|demon slayer|attack on titan|narnia|hogwarts|zelda|legend of|마블|닌텐도|포켓몬/i;

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};

console.log('=== [1] 어휘군에 IP 고유어가 없는가 ===');
const allWords = Object.values(cfg.globalTrends.coreSignals || {}).flat();
const branded = allWords.filter((w) => BRAND.test(w));
ok('coreSignals에 IP 브랜드 고유어 없음', branded.length === 0, `→ ${branded.join(', ')}`);
ok('fitTerms가 비어 있음 (IP 직접 매칭 없음)', (cfg.globalTrends.fitTerms || []).length === 0,
   `→ ${JSON.stringify(cfg.globalTrends.fitTerms)}`);

console.log('\n=== [2] 단어경계 오탐 (witch ⊂ Switch) ===');
const r0 = await collectGlobalTrends(cfg, { ytMax: 50, wikiMax: 50 });
const mm0 = matchGlobalTrends(r0.items, {
  coreSignals: cfg.globalTrends.coreSignals,
  formatSignals: cfg.globalTrends.formatSignals,
  fitTerms: cfg.globalTrends.fitTerms,
});
const zelda = mm0.all.find((y) => /Zelda/i.test(y.term));
ok('"Nintendo Switch" 제목이 원작IP로 오탐되지 않음', !zelda || zelda.coreGroups.length === 0,
   `→ ${JSON.stringify(zelda?.coreGroups)}`);

console.log('\n=== [3] 직격 매칭이 IP 고유어로 잡힌 건 없는가 (매칭 근거 기준) ===');
const ideas = buildIdeas(mm0.matched, { max: 12 });
// ⚠️ **제목**에 IP명이 있는 것과 **IP 고유어로 매칭**된 것은 다르다.
//    예: 「【ハリー・ポターと死の秘宝】」는 제목에 IP명이 있지만,
//    매칭 근거는 '魔法'(=마법, 일반 장르어)다 → IP 대우가 아니라 판타지 콘텐츠로 잡힌 것.
//    그래서 **매칭에 사용된 단어**를 검사해야 한다.
const brandedBasis = [];
for (const x of ideas) {
  const m = mm0.all.find((y) => y.term === x.term && y.geo === x.geo);
  const basis = m?.coreMatched || [];
  const bad = basis.filter((w) => BRAND.test(w));
  if (bad.length) brandedBasis.push({ term: x.term, geo: x.geo, bad });
}
ok('직격 결과가 IP 고유어로 잡힌 건 없음', brandedBasis.length === 0,
   `→ ${brandedBasis.map((b) => `${b.term.slice(0, 24)}:${b.bad.join(',')}`).join(' | ')}`);
console.log('\n  직격 12건 (괄호 = 매칭에 쓰인 일반 신호):');
ideas.forEach((x, i) => {
  const m = mm0.all.find((y) => y.term === x.term && y.geo === x.geo);
  console.log(`   ${i + 1}. [${x.geo}] ${(x.term || '').slice(0, 42).padEnd(44)} (${(m?.coreMatched || []).join(',') || '-'})`);
});

console.log('\n=== [4] 잡힌 근거 (어떤 일반 신호로 매칭됐는지) ===');
for (const x of ideas.slice(0, 8)) {
  const m = mm0.all.find((y) => y.term === x.term && y.geo === x.geo);
  console.log(`  ${(x.term || '').slice(0, 40).padEnd(42)} → ${JSON.stringify(m?.coreGroups || [])}`);
}

console.log(`\n=== 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
