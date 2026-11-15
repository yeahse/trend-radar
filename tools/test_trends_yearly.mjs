/** 연도별 통계 소스 연결 테스트: Wikipedia Pageviews + Google Trends 연도 비교 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

console.log('=== ① Wikipedia Pageviews 연도 합계 ===');
const arts = ['Malfoid', 'Galfoy', 'Draco_Malfoy', 'Female_Draco_Malfoy', 'Harry_Potter'];
for (const a of arts) {
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${a}/monthly/2024010100/2026123100`;
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (!r.ok) { console.log(`  ${a.padEnd(24)} HTTP ${r.status}`); continue; }
    const j = await r.json();
    const byYear = {};
    for (const it of j.items || []) {
      const y = it.timestamp.slice(0, 4);
      byYear[y] = (byYear[y] || 0) + it.views;
    }
    const s = Object.entries(byYear).map(([y, v]) => `${y}:${v.toLocaleString()}`).join('  ');
    console.log(`  ${a.padEnd(24)} ${s}`);
  } catch (e) { console.log(`  ${a.padEnd(24)} ERR ${e.message}`); }
}

console.log('\n=== ② Google Trends 연도 비교 테스트 (VN, "malfoid") ===');
async function trendsAnnual(terms, geo) {
  const req = {
    comparisonItem: terms.map((k) => ({ keyword: k, geo, time: '2024-01-01 2026-11-14' })),
    category: 0, property: '',
  };
  const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(req))}`;
  const r1 = await fetch(exploreUrl, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  const t1 = await r1.text();
  if (!r1.ok) { throw new Error(`explore HTTP ${r1.status}: ${t1.slice(0, 160)}`); }
  const j = JSON.parse(t1.replace(/^\)\]\}'/, ''));
  const widget = (j.widgets || []).find((w) => w.id === 'TIMESERIES');
  if (!widget) throw new Error('TIMESERIES widget 없음: ' + Object.keys(j.widgets || {}).join(','));
  const token = widget.token;
  const wreq = {
    comparisonItem: terms.map((k) => ({ keyword: k, geo, time: '2024-01-01 2026-11-14' })),
    category: 0, property: '',
  };
  const dataUrl = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(wreq))}&token=${token}`;
  const r2 = await fetch(dataUrl, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
  const t2 = await r2.text();
  if (!r2.ok) throw new Error(`widgetdata HTTP ${r2.status}: ${t2.slice(0, 160)}`);
  const j2 = JSON.parse(t2.replace(/^\)\]\}'/, ''));
  // 연도별 평균
  const byTerm = {};
  for (const d of j2.default?.timelineData || []) {
    const y = d.time.replace(/(\d{4})(\d{2})/, '$1');
    const v = d.value?.[0] ?? 0;
    byTerm[d.geo] = byTerm[d.geo] || {};
    byTerm[d.geo][y] = (byTerm[d.geo][y] || 0) + v;
  }
  return byTerm;
}

try {
  const res = await trendsAnnual(['malfoid', 'fandraco', 'aigenerated anime'], 'VN');
  for (const [geo, years] of Object.entries(res)) {
    console.log(`  ${geo}: ` + Object.entries(years).map(([y, v]) => `${y}=${Math.round(v)}`).join('  '));
  }
} catch (e) {
  console.log('  ERR:', e.message);
}
