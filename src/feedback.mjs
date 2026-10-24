/**
 * 적중률 계산 + 지난 결정 회고
 *
 * 이게 "정보 흡수"의 마지막 고리다.
 * 시스템은 매일 ACT를 추천하지만, 그걸 따라 했는지 안 했는지 모르면
 * 추천이 늘수록 거르고 실력이 안 늘어난다. 여기서 "맞았나"를 수치로 만든다.
 */
import { loadSnapshots } from './store.mjs';
import { loadDecisions } from './decisions.mjs';

/**
 * 스냅샷에서 날짜별 ACT 목록
 *
 * ⚠️ 같은 날 여러 번 실행되면 스냅샷이 여러 개 쌓인다.
 *   마지막 1개만 쓰면 "아침엔 ACT였는데 점심에 빠진" 키워드의 기록이 사라진다.
 *   → 날짜별로 **합집합**을 취한다 (하루 중 한 번이라도 ACT면 그날 ACT로 본다).
 */
export async function actHistory(days = 30) {
  const snaps = await loadSnapshots(days);
  const byDate = new Map();
  for (const s of snaps) {
    if (!byDate.has(s.date)) {
      byDate.set(s.date, { date: s.date, act: [], watch: [], collectedAt: s.collectedAt });
    }
    const day = byDate.get(s.date);
    const seen = new Set(day.act.map((a) => a.term));
    for (const w of s.watch || []) {
      if (w.action === 'ACT' && !seen.has(w.term)) {
        seen.add(w.term);
        day.act.push({ term: w.term, score: w.score, supply: w.ytUploads ?? '', naver: w.naverGrowth ?? '' });
      } else if (w.action === 'WATCH' && !day.watch.includes(w.term)) {
        day.watch.push(w.term);
      }
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** 한 term이 최근 N일 중 ACT로 몇 번 나왔나 */
export function persistence(actByDate, term, windowDays = 14) {
  const tail = actByDate.slice(-windowDays);
  return tail.filter((d) => d.act.some((a) => a.term === term)).length;
}

/**
 * 종합 요약
 * @returns {Promise<{actTotal:number, actActed:number, hitRate:number, made:number, posted:number,
 *                    avgViews:number|null, persisting:Array, missed:Array, recentDecisions:Array}>}
 */
export async function summary() {
  const [actByDate, decisions] = await Promise.all([actHistory(30), loadDecisions()]);

  // ① ACT가 나온 날짜에, 해당 term을 실제로 착수했는가
  const actedTerms = new Set(
    decisions.filter((d) => d.status === 'made' || d.status === 'posted').map((d) => `${d.date}||${d.term}`)
  );
  let actTotal = 0;
  let actActed = 0;
  const missed = [];
  for (const day of actByDate) {
    for (const a of day.act) {
      actTotal++;
      if (actedTerms.has(`${day.date}||${a.term}`)) actActed++;
      else missed.push({ date: day.date, term: a.term, score: a.score });
    }
  }

  // ② 반복 등장 (지속 신호) — 하루짜리 스파이크가 아니라 진짜 트렌드
  const termCount = new Map();
  for (const day of actByDate) {
    for (const a of day.act) {
      const c = termCount.get(a.term) || { term: a.term, days: 0, maxScore: 0, last: day.date };
      c.days++;
      c.maxScore = Math.max(c.maxScore, a.score);
      c.last = day.date;
      termCount.set(a.term, c);
    }
  }
  const persisting = [...termCount.values()]
    .filter((c) => c.days >= 2)
    .sort((a, b) => b.days - a.days || b.maxScore - a.maxScore);

  // ③ 업로드된 것의 조회수
  const posted = decisions.filter((d) => d.status === 'posted' && d.views != null);
  const avgViews = posted.length
    ? Math.round(posted.reduce((a, d) => a + d.views, 0) / posted.length)
    : null;

  return {
    actTotal,
    actActed,
    hitRate: actTotal ? Math.round((actActed / actTotal) * 100) : 0,
    made: decisions.filter((d) => d.status === 'made').length,
    posted: decisions.filter((d) => d.status === 'posted').length,
    skipped: decisions.filter((d) => d.status === 'skipped').length,
    avgViews,
    persisting,
    missed: missed.slice(-10).reverse(),
    recentDecisions: decisions.slice(-10).reverse(),
    actByDate,
  };
}

/** 리포트에 들어갈 "지난 결정 회고" 마크다운 */
export function reviewMarkdown(s) {
  const L = [];
  L.push('## 🔁 지난 결정 회고 — 내 적중률');
  L.push('');
  if (!s.actTotal) {
    L.push('_아직 기록이 없다. `node src/record.mjs --term "제워드" --status made --note "..."` 로 기록 시작._');
    L.push('');
    return L.join('\n');
  }
  L.push('| 지표 | 값 |');
  L.push('|---|---|');
  L.push(`| ACT 추천 누적 | ${s.actTotal}건 |`);
  L.push(`| 그 중 실제 착수 | **${s.actActed}건 (적중률 ${s.hitRate}%)** |`);
  L.push(`| 제작( made ) | ${s.made}건 |`);
  L.push(`| 업로드 완료( posted ) | ${s.posted}건 |`);
  L.push(`| 포기( skipped ) | ${s.skipped}건 |`);
  L.push(`| 업로드 영상 평균 조회수 | ${s.avgViews != null ? s.avgViews.toLocaleString('ko-KR') + '뷰' : '기록 없음'} |`);
  L.push('');

  if (s.persisting.length) {
    L.push('### 📈 반복 ACT (지속 신호 — 하루 스파이크가 아님)');
    L.push('');
    L.push('| 키워드 | ACT 출현일수 | 최고점수 | 마지막 |');
    L.push('|---|---|---|---|');
    for (const p of s.persisting.slice(0, 10)) {
      L.push(`| **${p.term}** | ${p.days}일 | ${p.maxScore} | ${p.last} |`);
    }
    L.push('');
  }

  if (s.recentDecisions.length) {
    L.push('### 📝 최근 내 기록');
    L.push('');
    L.push('| 날짜 | 상태 | 키워드 | 메모 | 조회수 |');
    L.push('|---|---|---|---|---|');
    for (const d of s.recentDecisions) {
      const st = { made: '🟢 착수', posted: '🔵 업로드', skipped: '⚪ 포기', dropped: '⚪ 미착수' }[d.status] || d.status;
      L.push(`| ${d.date} | ${st} | ${d.term} | ${(d.note || '').slice(0, 40)} | ${d.views != null ? d.views.toLocaleString('ko-KR') : '-'} |`);
    }
    L.push('');
  }

  if (s.missed.length) {
    L.push('### ⚠️ 추천받았는데 안 만든 것 (기회비용)');
    L.push('');
    L.push('| 날짜 | 키워드 | 점수 |');
    L.push('|---|---|---|');
    for (const m of s.missed.slice(0, 8)) L.push(`| ${m.date} | ${m.term} | ${m.score} |`);
    L.push('');
  }
  return L.join('\n');
}
