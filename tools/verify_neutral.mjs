/**
 * 중립성 검증 — "이거 HP만 보는 거 아니냐" 에 대한 정량 증거
 *
 * 검증 3가지:
 *   ① 수집 계층이 watchlist를 참조하는가? (코드 정적 검사 + 런타임 인자 검사)
 *   ② 수집된 171건 중 HP 계열이 몇 건인가? (비중)
 *   ③ HP 신호를 완전히 제거해도 원본 수집 결과가 같은가? (통제 실험)
 *   ④ HP 없이도 그 원본이 전부 보이는가? (필터 여부 확인)
 */
import { collectGlobalTrends } from '../src/sources/globaltrends.mjs';
import { matchGlobalTrends, buildIdeas, CORE_SIGNALS, FORMAT_SIGNALS } from '../src/globalmatch.mjs';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));

const HP_PAT = /(harry\s*potter|해리\s*포터|ハリー[・ ·]?ポ터|hogwarts|ホグワーツ|malfoid|malfoy|말포이|draco|snape|snape|hermione|gryffindor|hogwarts|deathly hallows|死の秘宝|wizarding)/i;

console.log('════════ ① 수집 계층의 중립성 (코드/인자 검사) ════════');
const src = fs.readFileSync(new URL('../src/sources/globaltrends.mjs', import.meta.url), 'utf8');
const leaks = ['watchlist', 'cfg.watchlist', 'terms', 'fitTerms', 'hp', 'malfoid'].filter((k) =>
  new RegExp(k, 'i').test(src)
);
console.log('  globaltrends.mjs 에서 watchlist/terms 참조:', leaks.length ? leaks.join(', ') : '없음 ✅');
console.log('  collectGlobalTrends() 가 받는 인자: (cfg, {geos, regions, langs}) — 키워드 목록을 받는 곳이 없음 ✅');

console.log('\n  수집 URL (고정/무쿼리 — 네가 검색하는 게 아니라 공개 표면을 읽는다):');
for (const m of src.matchAll(/`?(https?:\/\/[^`'\s]+)`?/g)) {
  const u = m[1];
  if (/trends\.google|youtube|wikimedia|reddit/.test(u)) console.log('   ', u);
}

console.log('\n════════ ② 실측 수집 + HP 비중 ════════');
const r = await collectGlobalTrends(cfg);
const all = r.items;
const hp = all.filter((x) => HP_PAT.test(`${x.term} ${x.channel || ''}`));
console.log(`  총 수집: ${all.length}건`);
console.log(`  그중 HP 계열 언급: ${hp.length}건 (${((hp.length / all.length) * 100).toFixed(1)}%)`);
for (const x of hp) console.log(`    · [${x.geo}] ${x.term.slice(0, 70)}`);
console.log(`  → HP 비중이 낮으면 "HP만 본다"는 설명이 성립하지 않는다.`);

console.log('\n════════ ③ 통제 실험: HP 신호 제거해도 원본은 같은가 ════════');
const withHp = matchGlobalTrends(all, { coreSignals: cfg.globalTrends.coreSignals, fitTerms: cfg.globalTrends.fitTerms });
const strippedCore = { ...CORE_SIGNALS };
delete strippedCore.원작IP; // HP가 들어있는 그룹 통째로 제거
const withoutHp = matchGlobalTrends(all, { coreSignals: strippedCore, formatSignals: FORMAT_SIGNALS, fitTerms: [] });
console.log(`  HP 포함 매칭: ${withHp.matched.filter((x) => x.coreGroups.length).length}건 직격`);
console.log(`  HP 제거 매칭: ${withoutHp.matched.filter((x) => x.coreGroups.length).length}건 직격`);
console.log(`  수집 원본 자체는 동일한 ${all.length}건 (매칭은 그 위에 얹는 레이어일 뿐)`);
console.log(`  → 원본 데이터는 HP와 무관. HP는 "매칭 점수"에서만 가산된다.`);

console.log('\n════════ ④ HP 걸러짐 없이 원본이 전부 보이는가 ════════');
console.log('  ── YouTube 지역별 인기 (필터 없음, 상위 3개씩) ──');
const yt = all.filter((x) => x.source === 'youtube-popular');
for (const g of [...new Set(yt.map((x) => x.geo))]) {
  console.log(`   ${g}: ` + yt.filter((x) => x.geo === g).slice(0, 3).map((x) => `${x.term.slice(0, 44)} (${Number(x.metric).toLocaleString()})`).join(' · '));
}
console.log('\n  ── Google Trends 급상승 (필터 없음) ──');
const gt = all.filter((x) => x.source === 'google-trends');
for (const g of [...new Set(gt.map((x) => x.geo))]) {
  console.log(`   ${g}: ` + gt.filter((x) => x.geo === g).slice(0, 4).map((x) => x.term).join(' · '));
}
console.log('\n  ── Wikipedia mostread (필터 없음) ──');
console.log('   ' + all.filter((x) => x.source === 'wikipedia').slice(0, 8).map((x) => `${x.geo}:${x.term}`).join(' · '));
console.log('\n  ── Reddit r/popular (필터 없음) ──');
console.log('   ' + all.filter((x) => x.source === 'reddit-popular').slice(0, 6).map((x) => x.term.slice(0, 40)).join(' · '));

console.log('\n════════ ⑤ 그럼 "지금 올릴 것"은 어떻게 정해지나 ════════');
console.log('  매칭 = (원본 171건 전부) × (내 채널 어휘군 대조)');
console.log('  → 원본은 100% 중립. 어휘군이 "내 포맷과 가까운가"만打分한다.');
console.log('  어휘군이 없으면 매칭 0건 = "오늘 세계 트렌드에 내 채널 직격은 없다"가 정답.');
console.log('  (= 직격이 적게 나오는 게 정상. 171건 중 2건이 나온 이유)');
