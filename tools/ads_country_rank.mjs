/**
 * ★ YouTube/Google Ads 지리 실측 → 국가 랭킹 (2026-11-15)
 *
 * [왜 필요한가]
 *   mostPopular 프록시는 "그 나라에서 지금 인기 있는 것"일 뿐
 *   "내 채널이 어느 나라에서 먹히는가"를 재지 않는다.
 *   실제로 2026-11 에 태국은 mostPopular 1위(자국점유율 90%)였지만
 *   실제 광고 실측에서는 구독자 전환이 가장 나빴다.
 *   → **판정은 네 광고 실측 데이터로 해야 한다.**
 *
 * [사용법]
 *   1) Google Ads → 보고서 → 지역(Geographic) → 기간 설정 → CSV 다운로드
 *   2) node tools\ads_country_rank.mjs <경로.csv> [--metric conversions]
 *
 * [자동 컬럼 인식]
 *   국가: country/geo/国家/地域/country code
 *   비용: cost/spend/비용/spend
 *   노출: impressions/imps/노출
 *   클릭: clicks/click/클릭
 *   전환: conversions/actions/conversions/전환/구독자
 *  .views: video views
 *  Revenue: revenue/수익/adsense
 *
 * [출력]
 *   - 절대 기준: 전환 수 / 비용(CPA) / ROAS
 *   - 효율 기준: 전환당 비용(CPA) 낮을수록 좋음
 *   - 전환이 0 인 국가를 "진입 후보"(지표는 참고용)
 *   - 내가 측정한 시장 구조(유니크 조회수·1인당·자국점유율)와 조인
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

const arg = process.argv[2];
if (!arg) {
  console.error('사용법: node tools\\ads_country_rank.mjs <google-ads-지역보고서.csv>');
  console.error('  (없으면 디코 CSV 최신본으로 시장구조 기준만 출력)');
  process.exit(1);
}

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

const rows = parseCsv(fs.readFileSync(arg, 'utf8'));
if (rows.length < 2) { console.error('CSV 파싱 실패'); process.exit(1); }
const head = rows[0].map((h) => h.trim());

const PICK = {
  geo: /^(country|geo(graphic)?|国家|地域|country code|territory|region|country\/region)/i,
  cost: /(cost|spend|비용|amount spent|cost per)/i,
  imps: /(impressions|imps|노출|impr)/i,
  clicks: /(clicks|click|클릭)/i,
  conv: /^(conversions|actions|conversion|전환|구독자|subscrib)/i,
  views: /(video views|views|조회)/i,
  revenue: /(revenue|수익|adsense|income|earnings)/i,
};
const idx = {};
for (const k of Object.keys(PICK)) {
  const i = head.findIndex((h) => PICK[k].test(h));
  if (i >= 0) idx[k] = i;
}
console.log('인식된 컬럼:', JSON.stringify(Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, head[i]]))));

const KO = { US: '미국', IN: '인도', ID: '인도네시아', BR: '브라질', MX: '멕시코', KR: '한국', JP: '일본', GB: '영국', DE: '독일', FR: '프랑스', TR: '터키', TH: '태국', VN: '베트남', PH: '필리핀', TW: '대만', CA: '캐나다', AU: '호주', IT: '이탈리아', ES: '스페인', PL: '폴란드', SA: '사우디', AE: 'UAE', EG: '이집트', NG: '나이지리아' };
const norm = (s) => String(s || '').trim();
const num = (s) => {
  const v = Number(String(s || '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
};

const agg = new Map();
for (const r of rows.slice(1)) {
  if (!r.length) continue;
  const geoRaw = idx.geo != null ? norm(r[idx.geo]) : '';
  if (!geoRaw) continue;
  const code = (geoRaw.match(/\b([A-Z]{2})\b/) || [])[1] || geoRaw.toUpperCase().slice(0, 2);
  if (!agg.has(code)) agg.set(code, { code, name: KO[code] || geoRaw, cost: 0, imps: 0, clicks: 0, conv: 0, views: 0, revenue: 0 });
  const a = agg.get(code);
  if (idx.cost != null) a.cost += num(r[idx.cost]);
  if (idx.imps != null) a.imps += num(r[idx.imps]);
  if (idx.clicks != null) a.clicks += num(r[idx.clicks]);
  if (idx.conv != null) a.conv += num(r[idx.conv]);
  if (idx.views != null) a.views += num(r[idx.views]);
  if (idx.revenue != null) a.revenue += num(r[idx.revenue]);
}

const list = [...agg.values()].map((a) => ({
  ...a,
  cpm: a.imps ? (a.cost / a.imps) * 1000 : 0,
  ctr: a.imps ? (a.clicks / a.imps) * 100 : 0,
  cpc: a.clicks ? a.cost / a.clicks : 0,
  cpa: a.conv ? a.cost / a.conv : 0,
  roas: a.revenue ? a.revenue / a.cost : 0,
  convRate: a.clicks ? (a.conv / a.clicks) * 100 : 0,
}));

console.log('\n' + '='.repeat(112));
console.log('【 실제 광고 실측 랭킹 】 — 이게 진짜 정답 (mostPopular 프록시 아님)');
console.log('='.repeat(112));
console.log('#'.padStart(4) + '국가'.padEnd(16) + '비용'.padStart(11) + '노출'.padStart(12) + '클릭'.padStart(9) + 'CTR%'.padStart(7) + 'CPC'.padStart(8) + '전환'.padStart(7) + 'CPA'.padStart(9) + '전환율%'.padStart(8) + 'ROAS'.padStart(7));
const byConv = [...list].sort((a, b) => b.conv - a.conv);
byConv.forEach((a, i) => {
  console.log(
    String(i + 1).padStart(4) + ` ${a.name} (${a.code})`.padEnd(16) +
    a.cost.toFixed(0).padStart(11) + a.imps.toLocaleString('ko-KR').padStart(12) +
    a.clicks.toLocaleString('ko-KR').padStart(9) + a.ctr.toFixed(2).padStart(7) +
    a.cpc.toFixed(2).padStart(8) + a.conv.toLocaleString('ko-KR').padStart(7) +
    (a.cpa ? a.cpa.toFixed(0).padStart(9) : '-'.padStart(9)) +
    a.convRate.toFixed(2).padStart(8) + (a.roas ? a.roas.toFixed(2).padStart(7) : '-'.padStart(7))
  );
});

const spend = list.filter((a) => a.conv > 0);
const noConv = list.filter((a) => a.conv === 0 && a.cost > 0);
console.log('\n--- 전환 있음 (스케일) ---');
for (const a of spend.sort((x, y) => y.conv - x.conv)) console.log(`  ${a.name} (${a.code})  전환 ${a.conv} · CPA ${a.cpa ? a.cpa.toFixed(0) : '-'} · CTR ${a.ctr.toFixed(2)}% · 비용 ${a.cost.toFixed(0)}`);
console.log('\n--- 전환 0 (테스트했는데 안 먹힘 → 재투자 X) ---');
for (const a of noConv.sort((x, y) => y.cost - x.cost)) console.log(`  ${a.name} (${a.code})  비용 ${a.cost.toFixed(0)} · 노출 ${a.imps.toLocaleString('ko-KR')} · CTR ${a.ctr.toFixed(2)}%`);

console.log('\n--- 미투입 국가 (후보) : 시장 구조 지표 참고 ---');
const done = new Set(list.map((a) => a.code));
const files = fs.readdirSync(path.join(root, 'data')).filter((f) => /^yt_decode_\d{4}-\d{2}-\d{2}\.csv$/.test(f)).sort();
const latest = files[files.length - 1];
const mrows = parseCsv(fs.readFileSync(path.join(root, 'data', latest), 'utf8'));
const mh = mrows[0];
const mix = Object.fromEntries(mh.map((h, i) => [h, i]));
const byGeo = {};
for (const r of mrows.slice(1)) { const g = r[mix.geo]; if (!g) continue; (byGeo[g] = byGeo[g] || []).push(Number(r[mix.views]) || 0); }
const all = [];
for (const [g, vs] of Object.entries(byGeo)) {
  if (done.has(g)) continue;
  all.push({ g, name: KO[g] || g, views: vs.reduce((a, b) => a + b, 0), n: vs.length });
}
all.sort((a, b) => b.views - a.views);
for (const a of all.slice(0, 12)) console.log(`  ${a.name} (${a.g})  top50 유니크합 ${a.views.toLocaleString('ko-KR')} (${a.n}편)`);

console.log(`\n참고: 시장구조 데이터 = ${latest} (단일 스냅샷이라 변동 큼. 판단은 실측 기준으로)`);
