/**
 * "다음 소재" 탐색 분석.
 * 1) 형식별 상대속도(velocity) 합/평균 → 지금 뜨는 포맷
 * 2) 포맷별 상위 아이템 (속도 + 국가수)
 * 3) watchlist 공급량 대비 수요 → 공짜 시장 후보
 */
import fs from 'node:fs';
import path from 'node:path';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const root = path.resolve(process.cwd());
const gRows = parseCsv(fs.readFileSync(path.join(root, 'data', 'global_trends_2026-10-24.csv'), 'utf8'));
const gHead = gRows[0];
const gi = Object.fromEntries(gHead.map((h, i) => [h, i]));
const gData = gRows.slice(1).filter((r) => r.length > 5).map((r) => ({
  term: r[gi.term], score: Number(r[gi.score]) || 0,
  vel: Number(r[gi.velocity]) || 0, metric: Number(String(r[gi.supplyRecent]).replace(/[^0-9.]/g, '')) || 0,
  source: r[gi.supplySource], geo: (r[gi.note] || '').match(/^\[([A-Z]{2})\]/)?.[1] || '',
  format: (r[gi.note] || '').split('] ')[1]?.split(' ')[0] || '',
  groups: (r[gi.fit] || ''), url: r[gi.sources],
}));

console.log('=== [1] 형식별 상대속도 (velocity 합/평균) ===');
const byFmt = {};
for (const d of gData) {
  const f = d.format || '(미분류)';
  byFmt[f] = byFmt[f] || { n: 0, velSum: 0, viewSum: 0, geos: new Set() };
  byFmt[f].n++;
  byFmt[f].velSum += d.vel;
  byFmt[f].viewSum += d.metric;
  if (d.geo) byFmt[f].geos.add(d.geo);
}
const fmtRows = Object.entries(byFmt)
  .map(([f, v]) => ({ f, n: v.n, velSum: v.velSum, velAvg: v.velSum / v.n, viewSum: v.viewSum, geos: v.geos.size }))
  .sort((a, b) => b.velSum - a.velSum);
console.log('형식'.padEnd(18) + '건수'.padStart(6) + '속도합'.padStart(14) + '속도평균'.padStart(12) + '조회합'.padStart(14) + '국가수'.padStart(7));
for (const r of fmtRows) {
  console.log(
    r.f.padEnd(20) + String(r.n).padStart(4) +
    Math.round(r.velSum).toLocaleString('ko-KR').padStart(13) +
    Math.round(r.velAvg).toLocaleString('ko-KR').padStart(12) +
    Math.round(r.viewSum).toLocaleString('ko-KR').padStart(14) +
    String(r.geos).padStart(7)
  );
}

console.log('\n=== [2] 내 포맷(음악/MV · 성별전환/TS · AI 생성 · 시리즈)과 겹치는 상위 신호 ===');
const MINE = ['음악/MV', '성별전환/TS', 'AI 생성 콘텐츠', '시리즈/연작 화', '숏폼/밈', '기타'];
const mine = gData.filter((d) => MINE.includes(d.format) && d.vel > 0)
  .sort((a, b) => b.vel - a.vel).slice(0, 30);
for (const d of mine) {
  console.log(`${d.geo.padEnd(3)} ${Math.round(d.vel).toLocaleString('ko-KR').padStart(12)}/h  ${d.format.padEnd(14)} ${String(d.term).slice(0, 54)}`);
}

console.log('\n=== [3] 같은 콘텐츠가 여러 국가에서 반복 = 글로벌 포맷 신호 ===');
const termGeo = {};
for (const d of gData) { if (!d.term) continue; (termGeo[d.term] = termGeo[d.term] || []).push(d); }
const multi = Object.entries(termGeo)
  .filter(([, v]) => new Set(v.map((x) => x.geo)).size >= 4)
  .map(([t, v]) => ({ t, geos: new Set(v.map((x) => x.geo)).size, vel: Math.max(...v.map((x) => x.vel)), fmt: v[0].format, grp: v[0].groups, views: Math.max(...v.map((x) => x.metric)) }))
  .sort((a, b) => b.geos - a.geos || b.vel - a.vel)
  .slice(0, 25);
for (const m of multi) {
  console.log(`${String(m.geos).padStart(2)}개국 ${Math.round(m.vel).toLocaleString('ko-KR').padStart(12)}/h ${m.fmt.padEnd(16)} ${String(m.t).slice(0, 48)}  [${m.grp}]`);
}

console.log('\n=== [4] watchlist 공급량 (공급 < 수요 = 공짜 시장) ===');
const tRows = parseCsv(fs.readFileSync(path.join(root, 'data', 'tracker_2026-10-24.csv'), 'utf8'));
const tHead = tRows[0];
const ti = Object.fromEntries(tHead.map((h, i) => [h, i]));
const tData = tRows.slice(1).filter((r) => r.length > 5).map((r) => ({
  term: r[ti.term], score: Number(r[ti.score]) || 0,
  supply: Number(String(r[ti.supplyRecent]).replace(/[^0-9.]/g, '')) || 0,
  src: r[ti.supplySource], deficit: r[ti.supplyDeficit], action: r[ti.action],
  vel: r[ti.velocity], yt: r[ti.ytUploads], rp: r[ti.redditHits], bp: r[ti.blueskyHits],
})).sort((a, b) => b.score - a.score);
for (const t of tData) {
  console.log(`${String(t.score).padStart(3)}점 ${String(t.term).slice(0, 26).padEnd(28)} 공급=${String(t.supply || '-').padStart(8)}(${t.src}) deficit=${String(t.deficit).padStart(3)} reddit=${t.rp} bluesky=${t.bp} yt=${t.yt}`);
}
