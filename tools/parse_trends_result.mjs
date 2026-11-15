/** 외부화된 lightpanda 결과 복원 */
import fs from 'node:fs';

const f = process.argv[2];
const raw = fs.readFileSync(f, 'utf8');
const rows = raw.split(/\r?\n/).filter(Boolean);
let text = '';
for (const r of rows) {
  try {
    const o = JSON.parse(r);
    if (o && typeof o.text === 'string') text += o.text;
    else if (o && o.chunks) text += o.chunks.map((c) => c.text || '').join('');
  } catch { /* skip */ }
}
if (!text) {
  // char-map 형태 복원
  const map = {};
  for (const r of rows) {
    try {
      const o = JSON.parse(r);
      if (o && typeof o === 'object' && !o.text) {
        for (const [k, v] of Object.entries(o)) if (typeof v === 'string') map[k] = v;
      }
    } catch { /* skip */ }
  }
  text = Object.keys(map).length ? Object.keys(map).sort((a, b) => Number(a) - Number(b)).map((k) => map[k]).join('') : raw;
}
// 문자 char-map 이면 다시 복원
let parsed;
try { parsed = JSON.parse(text); } catch { parsed = null; }
if (!parsed || typeof parsed !== 'object') {
  try { parsed = JSON.parse(JSON.parse(text)); } catch { parsed = null; }
}
if (!parsed) {
  const map = {};
  for (const m of text.matchAll(/"(\d+)":"((?:[^"\\]|\\.)*)"/g)) map[m[1]] = m[2];
  const s = Object.keys(map).length ? Object.keys(map).sort((a, b) => Number(a) - Number(b)).map((k) => map[k]).join('') : text;
  try { parsed = JSON.parse(s); } catch { console.log('RAW:', s.slice(0, 3000)); process.exit(0); }
}

const NAME = { US: '미국', VN: '베트남', ID: '인도네시아', PH: '필리핀', NG: '나이지리아', TH: '태국', IN: '인도', TW: '대만', BR: '브라질', TR: '터키', MY: '말레이시아', SA: '사우디', AE: 'UAE', JP: '일본', KR: '한국' };
const arr = Array.isArray(parsed) ? parsed : [parsed];
// Google Trends timelineData[].time 은 epoch 초 문자열("1703010700") → 연도 변환
function regroup(byYearRaw) {
  const out = {};
  for (const [k, v] of Object.entries(byYearRaw || {})) {
    const y = /^\d{9,}$/.test(k) ? String(new Date(Number(k) * 1000).getUTCFullYear()) : k.slice(0, 4);
    out[y] = (out[y] || 0) + v;
  }
  return out;
}
const rows2 = arr.map((o) => ({ geo: o.geo, byYear: regroup(o.byYear), err: o.err, points: o.points }));
console.log('=== Google Trends 연도별 검색관심도 — "malfoid" (국가별) ===');
console.log('국가'.padEnd(16) + '2024'.padStart(9) + '2025'.padStart(9) + '2026'.padStart(9) + '  25→26');
for (const r of rows2) {
  if (r.err) { console.log(`${(NAME[r.geo] || r.geo).padEnd(16)} ERR ${r.err}`); continue; }
  const b = r.byYear || {};
  const g = b['2025'] ? ((b['2026'] / b['2025'] - 1) * 100) : null;
  console.log(
    (NAME[r.geo] || r.geo).padEnd(16) +
    String(Math.round(b['2024'] || 0)).padStart(9) +
    String(Math.round(b['2025'] || 0)).padStart(9) +
    String(Math.round(b['2026'] || 0)).padStart(9) +
    '  ' + (g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-')
  );
}
const ok = rows2.filter((r) => r.byYear && !r.err);
const sorted = [...ok].sort((a, b) => (b.byYear['2026'] || 0) - (a.byYear['2026'] || 0));
console.log('\n=== 2026 관심도 순위 ===');
sorted.forEach((r, i) => {
  const g = r.byYear['2025'] ? ((r.byYear['2026'] / r.byYear['2025'] - 1) * 100) : null;
  console.log(`${String(i + 1).padStart(3)} ${(NAME[r.geo] || r.geo).padEnd(14)} 2024=${Math.round(r.byYear['2024'] || 0)}  2025=${Math.round(r.byYear['2025'] || 0)}  2026=${Math.round(r.byYear['2026'] || 0)}  25→26 ${g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-'}`);
});
