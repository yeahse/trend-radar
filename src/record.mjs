/**
 * 결정 기록 CLI — "뭘 만들지" 결정한 걸 시스템에 남긴다.
 *
 * 이게 정보 흡수 루프의 닫는 고리다.
 *   ① 수집·점수(자동) → ② 리포트/Discord로 알림 → ③ **네가 결정**(여기 기록) → ④ 제작·업로드 → ⑤ 회고(적중률)
 *   ①② 는 존재하는데 ③④⑤ 가 비어 있으면 "추천"만 계속 반복되고 실력이 안 늘어난다.
 *
 * 사용법
 *   node src/record.mjs --term "제비차" --status made --note "나법 1편 제작 시작"
 *   node src/record.mjs --term "제비차" --status skipped --note "제작 안 함 (시간 없음)"
 *   node src/record.mjs --term "제비차" --status posted --url "https://youtu.be/xxx" --views 1234
 *   node src/record.mjs --list          # 최근 기록 조회
 *   node src/record.mjs --stats         # 적중률 통계만 보기
 */
import { recordDecision, listDecisions } from './decisions.mjs';
import { summary } from './feedback.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

async function printStats() {
  const s = await summary();
  console.log(`누적 ACT 추천 : ${s.actTotal}건`);
  console.log(`실제 착수     : ${s.actActed}건  → 적중률 ${s.hitRate}%`);
  console.log(`제작/업로드   : made ${s.made} / posted ${s.posted} / skipped ${s.skipped}`);
  console.log(`업로드 평균뷰 : ${s.avgViews != null ? s.avgViews.toLocaleString('ko-KR') : '기록 없음'}`);
  if (s.persisting.length) {
    console.log('지속 신호     : ' + s.persisting.map((p) => `${p.term}(${p.days}일)`).join(', '));
  }
  if (s.missed.length) {
    console.log('놓친 것       : ' + s.missed.slice(0, 5).map((m) => `${m.term}(${m.date})`).join(', '));
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  const rows = await listDecisions(Number(args.n) || 30);
  if (!rows.length) {
    console.log('기록 없음. 시작: node src/record.mjs --term "제비차" --status made --note "..."');
  } else {
    console.log('날짜        | 상태      | 키워드        | 메모');
    console.log('------------|-----------|---------------|------------------------------');
    for (const r of rows) {
      console.log(
        `${r.date} | ${String(r.status).padEnd(9)} | ${String(r.term).padEnd(13)} | ${r.note || ''}` +
          (r.url ? `  → ${r.url}` : '') + (r.views != null ? `  (${r.views}뷰)` : '')
      );
    }
  }
  process.exit(0);
}

if (args.stats) {
  await printStats();
  process.exit(0);
}

if (!args.term || args.term === true) {
  console.error('사용법: node src/record.mjs --term "키워드" [--status made|skipped|posted] [--note "메모"] [--url "링크"] [--views 1234]');
  console.error('목록 보기: node src/record.mjs --list   |   통계: node src/record.mjs --stats');
  process.exit(1);
}

const entry = await recordDecision({
  term: String(args.term),
  status: args.status && args.status !== true ? String(args.status) : 'made',
  note: args.note && args.note !== true ? String(args.note) : '',
  url: args.url && args.url !== true ? String(args.url) : '',
  views: args.views && args.views !== true ? Number(args.views) : null,
});
console.log(`기록 완료: [${entry.date}] ${entry.term} — ${entry.status}` + (entry.note ? ` / ${entry.note}` : ''));
console.log('');
await printStats();
