/** 특정 국가의 디코 top N 상세 (파라미터: 국가코드) */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const GEO = (process.argv[2] || 'TH').toUpperCase();
const NAME = { TH: '태국', VN: '베트남', TW: '대만', PH: '필리핀', ID: '인도네시아', IN: '인도', KR: '한국', JP: '일본' };

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const file = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_.*\.csv$/.test(f)).sort().pop();
const rows = parseCsv(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const h = rows[0];
const ix = Object.fromEntries(h.map((x, i) => [x, i]));
const list = rows.slice(1).filter((r) => r.length > 5)
  .filter((r) => r[ix.geo] === GEO)
  .map((r) => ({
    title: r[ix.title], ch: r[ix.channel], views: Number(r[ix.views]) || 0,
    vel: Number(r[ix.vel]) || 0, fmt: r[ix.fmt], url: r[ix.url],
  }))
  .sort((a, b) => b.vel - a.vel);

console.log(`=== ${NAME[GEO] || GEO} (${GEO}) top ${list.length} — 속도순 ===`);
list.forEach((v, i) => {
  console.log(`${String(i + 1).padStart(3)} ${String(v.vel).padStart(9)}/h ${String(v.views).padStart(10)} [${v.fmt}] ${v.title.slice(0, 54)}  |${v.ch.slice(0, 22)}`);
});
const byF = {};
for (const v of list) byF[v.fmt] = (byF[v.fmt] || 0) + 1;
console.log('\n포맷 분포:', JSON.stringify(byF));
const ko = list.filter((v) => /[가-힣]/.test(v.title) || /(smtown|hybe|jyp|bang|ador|bright|ive|aespa|nct|babymonster|twice|newjeans)/i.test(v.ch));
console.log(`\n한국어/한국채널 ${ko.length}편:`);
for (const v of ko) console.log(`  ${String(v.vel).padStart(9)}/h ${String(v.views).padStart(10)} ${v.title.slice(0, 50)} | ${v.ch.slice(0, 24)}`);
