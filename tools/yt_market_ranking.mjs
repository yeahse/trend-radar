/**
 * YouTube 시장 랭킹 (2026-11-13)
 *   ① 절대 규모 순  : 국가별 top50 인기영상 총 조회수
 *   ② 인구 대비 순  : 총 조회수 / 인구 × 100만 (1인당 조회수)
 *
 * 사용: node tools\yt_market_ranking.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

// 최신 디코 CSV 찾기
const dataDir = path.join(root, 'data');
const csvs = fs.readdirSync(dataDir).filter((f) => /^yt_decode_\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
if (!csvs.length) { console.error('디코 CSV 없음 — node tools\\yt_trend_decode.mjs 먼저'); process.exit(1); }
const file = csvs[csvs.length - 1];
console.log(`사용 데이터: ${file}`);

function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(fs.readFileSync(path.join(dataDir, file), 'utf8'));
const head = rows[0];
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const body = rows.slice(1).filter((r) => r.length > 5);

// ── 인구 데이터 (World Bank API — 1회 요청, 24개국 필터) ──────────
let POP = {};
try {
  const r = await fetch('https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=400&date=2024', {
    headers: { 'user-agent': 'trend-radar/1.0', accept: 'application/json' },
  });
  const j = await r.json();
  const rows = Array.isArray(j) && Array.isArray(j[1]) ? j[1] : [];
  for (const c of rows) {
    const code = c?.countryiso3code ? null : null;
    const iso2 = c?.country?.id; // ISO2 (AF, US, ...)
    if (iso2 && c.value) POP[iso2] = { pop: Number(c.value), name: c.country?.value || iso2 };
  }
  console.log(`인구 데이터: ${Object.keys(POP).length}개국 로드 (World Bank SP.POP.TOTL, 2024)`);
} catch (e) {
  console.log(`인구 데이터 로드 실패(${e.message}) — 절대 순위만 출력`);
}

// World Bank 비회원국 보정 (대만 등)
const POP_FIX = { TW: 23_400_000, KP: 26_500_000, TW_pop: 0 };
for (const [k, v] of Object.entries(POP_FIX)) {
  if (v && (!POP[k] || !POP[k].pop)) POP[k] = { pop: v, name: k };
}

// ── 국가별 집계 ───────────────────────────────────────────────────
// ★ 중복 제거가 필수: mostPopular 는 "그 나라에서 인기 있는" 걸 주므로
//   글로벌 콘텐츠(예: 인도영화 예고편 40.7M)가 여러 국가 1위로 중복 집계된다.
//   실측: 호주·인도·나이지리아 1위가 전부 같은 Salman Khan 예고편.
//   → 각 영상은 조회수가 가장 높은 1개국에만 배정하고, 그 합으로 순위를 매긴다.
const agg = new Map();
const vidMap = new Map(); // videoId → { views, vel, geos: Map<geo,{views,vel}> }
for (const r of body) {
  const geo = r[ix.geo];
  if (!geo) continue;
  if (!agg.has(geo)) agg.set(geo, { geo, ko: r[ix.geoKo], views: 0, vel: 0, n: 0, likes: 0, comments: 0, uniq: 0, uniqN: 0 });
  const a = agg.get(geo);
  const v = Number(r[ix.views]) || 0;
  const vel = Number(r[ix.vel]) || 0;
  a.views += v;
  a.vel += vel;
  a.n += 1;
  a.likes += Number(r[ix.likes]) || 0;
  a.comments += Number(r[ix.comments]) || 0;

  const raw = r[ix.url] || '';
  const vid = raw.match(/[?&]v=([\w-]{11})/)?.[1] || raw.split('/').filter(Boolean).pop() || `${geo}:${r[ix.title]}`;
  if (!vidMap.has(vid)) vidMap.set(vid, { views: v, vel, geos: new Map() });
  const vm = vidMap.get(vid);
  vm.geos.set(geo, { views: v, vel });
  if (v > vm.views) vm.views = v;
}

// 각 영상을 조회수가 가장 높은 국가에 배정
for (const vm of vidMap.values()) {
  let home = null;
  for (const [g, d] of vm.geos) {
    if (!home || d.views > home.d.views) home = { g, d };
  }
  if (!home) continue;
  const a = agg.get(home.g);
  if (!a) continue;
  a.uniq += home.d.views;
  a.uniqN += 1;
}

const list = [...agg.values()];
for (const a of list) {
  const p = POP[a.geo];
  a.pop = p?.pop || 0;
  a.popName = p?.name || '';
  a.avgViews = a.n ? a.views / a.n : 0;
  a.perMillion = a.pop ? (a.views / a.pop) * 1e6 : 0;
  a.velPerMillion = a.pop ? (a.vel / a.pop) * 1e6 : 0;
  a.uniqPerMillion = a.pop ? (a.uniq / a.pop) * 1e6 : 0;
}
const dupes = [...vidMap.values()].filter((v) => v.geos.size > 1).length;
const totalVids = vidMap.size;

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const fmtPop = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(n));

console.log(`중복 영상 ${dupes}개 / 전체 ${totalVids}개 (여러 국가 1위 동시 등장)`);

console.log('\n' + '='.repeat(112));
console.log('【 랭킹 ① 】 YouTube 시장 규모 — 절대 순 (유니크 영상 기준 총 조회수)');
console.log('='.repeat(112));
console.log('#'.padStart(4) + '국가'.padEnd(16) + '유니크조회수'.padStart(15) + '유니크영상'.padStart(10) + '중복포함총합'.padStart(14) + '속도합'.padStart(13) + '인구'.padStart(9));
const bySize = [...list].sort((a, b) => b.uniq - a.uniq);
bySize.forEach((a, i) => {
  console.log(
    String(i + 1).padStart(4) + ` ${a.ko} (${a.geo})`.padEnd(16) +
    fmt(a.uniq).padStart(15) + String(a.uniqN).padStart(10) +
    fmt(a.views).padStart(14) + fmt(a.vel).padStart(13) + fmtPop(a.pop).padStart(9)
  );
});

console.log('\n' + '='.repeat(112));
console.log('【 랭킹 ② 】 인구 대비 — 1인당 유니크 조회수 (유니크 조회수 ÷ 인구 × 100만)');
console.log('='.repeat(112));
console.log('#'.padStart(4) + '국가'.padEnd(16) + '1인당유니크조회'.padStart(16) + '인구'.padStart(9) + '유니크조회수'.padStart(15) + '속도/100만'.padStart(13) + '유니크영상당'.padStart(13));
const byPercap = [...list].sort((a, b) => b.uniqPerMillion - a.uniqPerMillion);
byPercap.forEach((a, i) => {
  console.log(
    String(i + 1).padStart(4) + ` ${a.ko} (${a.geo})`.padEnd(16) +
    fmt(a.uniqPerMillion).padStart(16) + fmtPop(a.pop).padStart(9) +
    fmt(a.uniq).padStart(15) + fmt(a.velPerMillion).padStart(13) +
    fmt(a.uniqN ? a.uniq / a.uniqN : 0).padStart(13)
  );
});

// ── 마크다운 저장 ────────────────────────────────────────────────
const today = file.replace(/yt_decode_|\.csv/g, '');
const md = [];
md.push(`# YouTube 시장 랭킹 — ${today}`);
md.push('');
md.push(`> 데이터: ${file} (국가별 mostPopular 50편) · 인구: World Bank SP.POP.TOTL 2024`);
md.push(`> 중복 영상 ${dupes}개 / 전체 ${totalVids}개 — 여러 국가 1위가 같은 글로벌 콘텐츠여서 **유니크 영상 기준**으로 랭킹함`);
md.push('');
md.push('## ① 시장 규모 — 절대 순 (유니크 영상 기준)');
md.push('');
md.push('| # | 국가 | 유니크 조회수 | 유니크 영상수 | 중복포함 총합 | 속도합 | 인구 |');
md.push('|---|---|---|---|---|---|---|');
bySize.forEach((a, i) => md.push(`| ${i + 1} | ${a.ko} (${a.geo}) | ${fmt(a.uniq)} | ${a.uniqN} | ${fmt(a.views)} | ${fmt(a.vel)} | ${fmtPop(a.pop)} |`));
md.push('');
md.push('## ② 인구 대비 — 1인당 유니크 조회수');
md.push('');
md.push('| # | 국가 | 1인당 유니크 조회수 | 인구 | 유니크 조회수 | 속도/100만 | 유니크 영상당 평균 |');
md.push('|---|---|---|---|---|---|---|');
byPercap.forEach((a, i) => md.push(`| ${i + 1} | ${a.ko} (${a.geo}) | ${fmt(a.uniqPerMillion)} | ${fmtPop(a.pop)} | ${fmt(a.uniq)} | ${fmt(a.velPerMillion)} | ${fmt(a.uniqN ? a.uniq / a.uniqN : 0)} |`));
md.push('');
md.push('> **해석**: mostPopular 는 "그 나라에서 지금 인기 있는 것"이라 글로벌 콘텐츠가');
md.push('> 여러 국가 1위로 중복 집계된다. 그래서 ①은 각 영상을 조회수가 가장 높은');
md.push('> 1개국에만 배정한 **유니크 기준**이다. ②는 그것을 인구로 나눈 값.');
md.push('> 두 순위가 크게 갈리면 = 인구는 적은데 시청이 뜨거운 시장.');
md.push('');
fs.writeFileSync(path.join(root, 'reports', `yt_market_${today}.md`), md.join('\n'), 'utf8');
console.log(`\n저장: reports/yt_market_${today}.md`);
