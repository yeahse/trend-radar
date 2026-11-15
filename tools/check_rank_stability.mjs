/** 시장 스냅샷 간 순위 변동 = mostPopular 프록시의 안정성 점검 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(path.resolve(HERE, '..'), 'data');

function parse(t) {
  const R = []; let r = [], f = '', q = false;
  const s = t.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); R.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  return R;
}

const KO = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베냐��', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };
const files = fs.readdirSync(dir).filter((x) => /^yt_decode_.*\.csv$/.test(x)).sort();
const rank = {};
const uniqN = {};
for (const file of files) {
  const rows = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const h = rows[0];
  const ix = Object.fromEntries(h.map((x, i) => [x, i]));
  const vidOwn = {};
  for (const r of rows.slice(1)) {
    const g = r[ix.geo]; if (!g) continue;
    const v = Number(r[ix.views]) || 0;
    const url = r[ix.url] || '';
    const vid = (url.match(/[?&]v=([\w-]{11})/) || [])[1] || url;
    if (!vidOwn[vid] || v > vidOwn[vid].v) vidOwn[vid] = { g, v };
  }
  const agg = {};
  for (const o of Object.values(vidOwn)) { agg[o.g] = (agg[o.g] || 0) + o.v; uniqN[o.g] = (uniqN[o.g] || 0) + 1; }
  rank[file] = Object.entries(agg).sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

console.log('국가'.padEnd(14) + files.map((f) => f.slice(11, 16).padStart(7)).join('') + '   순위이동');
for (const g of Object.keys(KO)) {
  if (!files.some((f) => rank[f].includes(g))) continue;
  const pos = files.map((f) => { const i = rank[f].indexOf(g); return i >= 0 ? String(i + 1) : '-'; });
  const nums = pos.map((p) => Number(p)).filter((n) => n > 0);
  const spread = nums.length ? Math.max(...nums) - Math.min(...nums) : 0;
  console.log((KO[g] + '(' + g + ')').padEnd(16) + pos.map((p) => p.padStart(7)).join('') + '   ' + (spread >= 8 ? '⚠️변동 큼 ' + spread : spread >= 4 ? '△' + spread : '안정'));
}
