import fs from 'node:fs';
import path from 'node:path';

/** 간단한 RFC4180 CSV 파서 (따옴표 안의 쉼표/개행 처리) */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const p = path.resolve(process.cwd(), 'data', 'global_trends_2026-10-24.csv');
const rows = parseCsv(fs.readFileSync(p, 'utf8'));
const head = rows[0];
const vi = head.indexOf('velocity');
const si = head.indexOf('supplySource');
const pi = head.indexOf('publishedAt');
const ti = head.indexOf('term');

const body = rows.slice(1).filter((r) => r.length > 1);
const withVel = body.filter((r) => (r[vi] || '').trim() !== '');
const yt = body.filter((r) => r[si] === 'youtube-popular');
const ytWithVel = yt.filter((r) => (r[vi] || '').trim() !== '');

console.log('헤더:', head.join(','));
console.log('전체 데이터 행:', body.length);
console.log('velocity 채워진 행:', withVel.length);
console.log('youtube-popular 행:', yt.length, '| 그중 velocity 채워진 행:', ytWithVel.length);
console.log('\n--- youtube-popular 속도 상위 8 ---');
ytWithVel
  .map((r) => ({ term: r[ti], vel: Number(r[vi]) || 0, pub: r[pi] }))
  .sort((a, b) => b.vel - a.vel)
  .slice(0, 8)
  .forEach((r) => console.log(`  ${r.vel.toLocaleString('ko-KR')}/h  ${String(r.term).slice(0, 56)}  (${r.pub})`));

if (withVel.length === 0) { console.log('\n❌ velocity가 하나도 안 채워짐'); process.exit(1); }
console.log('\n✅ CSV velocity 정상 출력');
