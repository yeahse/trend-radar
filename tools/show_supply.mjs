import fs from 'node:fs';
import path from 'node:path';

function parseCsv(t) {
  const rows = [];
  let r = [], f = '', q = false;
  const s = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f.length || r.length) { r.push(f); rows.push(r); }
  return rows;
}

const root = path.resolve(process.cwd());
const rows = parseCsv(fs.readFileSync(path.join(root, 'data', 'tracker_2026-10-24.csv'), 'utf8'));
const h = rows[0];
const i = Object.fromEntries(h.map((x, j) => [x, j]));

const pad = (s, n) => String(s ?? '-').padEnd(n);
const padS = (s, n) => String(s ?? '-').padStart(n);

console.log('term'.padEnd(20) + '최근7일업로드'.padStart(14) + '전체total'.padStart(14) + 'deficit'.padStart(9) + '점수'.padStart(7) + '출처'.padStart(9));
console.log('-'.repeat(73));
const keep = ['제비차', 'female draco', 'TS 말포이', '말포이', '해리포터 AI', 'genderbend', 'harry potter', 'flying tesla', 'fem!draco', 'tsundere', 'draco malfoy', '해리포터'];
const out = [];
for (const r of rows.slice(1)) {
  const t = r[i.term];
  if (!t || !keep.includes(t)) continue;
  out.push({ t, recent: r[i.supplyRecent], total: r[i.supplyTotal], deficit: r[i.supplyDeficit], score: r[i.score], src: r[i.supplySource] });
}
out.sort((a, b) => Number(b.score) - Number(a.score));
for (const o of out) {
  console.log(pad(o.t, 20) + padS(o.recent, 14) + padS(o.total, 14) + padS(o.deficit, 9) + padS(o.score, 7) + padS(o.src, 9));
}
