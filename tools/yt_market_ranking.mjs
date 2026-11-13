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
const byGeoRaw = {}; // geo → [{title,ch,views}]
const geoName = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베트남', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };
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
  (byGeoRaw[geo] = byGeoRaw[geo] || []).push({ title: r[ix.title] || '', ch: r[ix.channel] || '', views: v });

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
  // ★ 신뢰도 게이지: 자국 콘텐츠 점유율 (유니크/raw).
  //   낮으면 "그 나라 시장"이 아니라 "글로벌 콘텐츠 소비국"이라는 뜻.
  a.localRatio = a.n ? a.uniqN / a.n : 0;
}
const dupes = [...vidMap.values()].filter((v) => v.geos.size > 1).length;
const totalVids = vidMap.size;

// ── ★ 한국어 콘텐츠 시장 (실전 지표) ─────────────────────────────────
//   mostPopular 에 한국어 영상/한국 채널이 몇 편이나 올라가 있는가
//   = "한국어 콘텐츠가 이미 그 시장에서 통하는가"의 실측값
const KO_CHANNELS = /(smtown|hybe|jyp entertainment|bang|ador|pledis|yg ent|fromm|brave girls|secret number|woo!ah!|powerhouse|big hit|bts|blackpink|twice|nct dream|ive|babymonster|aespa|newjeans|nmixx|seventeen|en hyp|dreamcatcher|loona|rebel|new beat|stone music|oden|kakao m)/i;
const KO_TITLE = /[가-힣]/;
const koRows = [];
for (const [geo, items2] of Object.entries(byGeoRaw)) {
  const ko = items2.filter((v) => KO_TITLE.test(v.title) || KO_CHANNELS.test(v.ch || ''));
  koRows.push({
    geo, koKo: geoName[geo] || geo,
    n: ko.length, share: ko.length / items2.length,
    views: ko.reduce((s, v) => s + v.views, 0),
    per: ko.length ? ko.reduce((s, v) => s + v.views, 0) / ko.length : 0,
    localRatio: list.find((a) => a.geo === geo)?.localRatio || 0,
  });
}
koRows.sort((a, b) => b.per - a.per);


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
console.log('【 랭킹 ② 】 인구 대비 — 1인당 유니크 조회수  ★신뢰도=자국 콘텐츠 점유율');
console.log('='.repeat(112));
console.log('#'.padStart(4) + '국가'.padEnd(16) + '1인당유니크조회'.padStart(16) + '자국점유율'.padStart(11) + '판정'.padStart(8) + '인구'.padStart(9) + '유니크조회수'.padStart(15));
const byPercap = [...list].sort((a, b) => b.uniqPerMillion - a.uniqPerMillion);
byPercap.forEach((a, i) => {
  const trust = a.localRatio >= 0.7 ? '✔실체' : a.localRatio >= 0.45 ? '△혼합' : '✕노이즈';
  console.log(
    String(i + 1).padStart(4) + ` ${a.ko} (${a.geo})`.padEnd(16) +
    fmt(a.uniqPerMillion).padStart(16) + (a.localRatio * 100).toFixed(0).padStart(10) + '%' +
    trust.padStart(8) + fmtPop(a.pop).padStart(9) + fmt(a.uniq).padStart(15)
  );
});

console.log('\n' + '='.repeat(112));
console.log('【 실전 】 한국어 콘텐츠가 통하는 시장 (mostPopular 내 한국어 영상 기준)');
console.log('='.repeat(112));
console.log('#'.padStart(4) + '국가'.padEnd(16) + '한국어편'.padStart(9) + '점유율'.padStart(8) + '한국어조회수'.padStart(14) + '편당평균'.padStart(12) + '자국점유율'.padStart(11) + '  판정');
koRows.forEach((k, i) => {
  const verdict = k.n === 0 ? '★공백(기회)' : k.per >= 3000000 ? '✔먹힘' : '보통';
  console.log(
    String(i + 1).padStart(4) + ` ${k.koKo} (${k.geo})`.padEnd(16) +
    String(k.n).padStart(9) + (k.share * 100).toFixed(1).padStart(7) + '%' +
    k.views.toLocaleString('ko-KR').padStart(14) + Math.round(k.per).toLocaleString('ko-KR').padStart(12) +
    (k.localRatio * 100).toFixed(0).padStart(10) + '%' + '  ' + verdict
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
md.push('| # | 국가 | 1인당 유니크 조회수 | 자국 콘텐츠 점유율 | 판정 | 인구 |');
md.push('|---|---|---|---|---|---|');
byPercap.forEach((a, i) => {
  const trust = a.localRatio >= 0.7 ? '✔ 실체' : a.localRatio >= 0.45 ? '△ 혼합' : '✕ 노이즈';
  md.push(`| ${i + 1} | ${a.ko} (${a.geo}) | ${fmt(a.uniqPerMillion)} | ${(a.localRatio * 100).toFixed(0)}% | ${trust} | ${fmtPop(a.pop)} |`);
});
md.push('');
md.push('> **신뢰도 게이지 = 자국 콘텐츠 점유율.** 낮으면 "그 나라 시장"이 아니라');
md.push('> "글로벌 콘텐츠 소비국"이라는 뜻. (호주 43%·UAE 26%·캐나다 11% = 1인당 순위 노이즈)');
md.push('');
md.push('## ★ 실전 — 한국어 콘텐츠가 통하는 시장');
md.push('');
md.push('| # | 국가 | 한국어 영상 | 점유율 | 한국어 조회수 | 편당 평균 | 자국점유율 | 판정 |');
md.push('|---|---|---|---|---|---|---|---|');
koRows.forEach((k, i) => {
  const v = k.n === 0 ? '**★ 공백(기회)**' : k.per >= 3000000 ? '✔ 먹힘' : '보통';
  md.push(`| ${i + 1} | ${k.koKo} (${k.geo}) | ${k.n} | ${(k.share * 100).toFixed(1)}% | ${k.views.toLocaleString('ko-KR')} | ${Math.round(k.per).toLocaleString('ko-KR')} | ${(k.localRatio * 100).toFixed(0)}% | ${v} |`);
});
md.push('');
md.push('> **mostPopular 에 한국어 영상이 몇 편이나 올라가 있는가** = 그 시장에서');
md.push('> 한국어 콘텐츠가 이미 통하고 있는가의 실측값. 0편이면 완전 공백 시장.');
md.push('');
fs.writeFileSync(path.join(root, 'reports', `yt_market_${today}.md`), md.join('\n'), 'utf8');
console.log(`\n저장: reports/yt_market_${today}.md`);
