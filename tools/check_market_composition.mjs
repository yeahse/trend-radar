/** 시장 순위가 이상한 이유 확인 — mostPopular 가 "현지 제작 콘텐츠"인지 "글로벌 콘텐츠"인지 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const file = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_.*\.csv$/.test(f)).sort().pop();

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

const rows = parseCsv(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
const h = rows[0];
const ix = Object.fromEntries(h.map((x, i) => [x, i]));
const byGeo = {};
for (const r of rows.slice(1)) {
  const g = r[ix.geo]; if (!g) continue;
  (byGeo[g] = byGeo[g] || []).push({ title: r[ix.title], ch: r[ix.channel], views: Number(r[ix.views]) || 0 });
}

for (const g of ['AU', 'US', 'JP', 'IN', 'BR', 'NG', 'KR']) {
  const list = (byGeo[g] || []).sort((a, b) => b.views - a.views);
  if (!list.length) continue;
  console.log(`\n=== ${g} (${list.length}편) 상위 6 ===`);
  for (const v of list.slice(0, 6)) {
    console.log(`  ${String(v.views).padStart(11)}  ${String(v.title).slice(0, 62)}`);
  }
  // 채널 중복도 (같은 글로벌 채널이 몇 편이나 차지하는지)
  const chCount = {};
  for (const v of list) chCount[v.ch] = (chCount[v.ch] || 0) + 1;
  const top = Object.entries(chCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(`  채널 분포: ${top.map(([c, n]) => `${c}(${n})`).join(', ')}`);
}
