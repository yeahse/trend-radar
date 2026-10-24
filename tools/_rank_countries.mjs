/**
 * 국가별 미디어 시장 규모 랭킹 (수집 데이터 기반)
 * 기준: YouTube popular 50편의 합산뷰 + 상위多条의 Country 대표성
 */
import fs from 'node:fs';

const l = fs.readFileSync(new URL('../data/snapshot.jsonl', import.meta.url), 'utf8').trim().split('\n');
const s = JSON.parse(l[l.length - 1]);
const all = s.global.top.filter((x) => x.source === 'youtube-popular');

const byGeo = new Map();
for (const x of all) {
  if (!byGeo.has(x.geo)) byGeo.set(x.geo, []);
  byGeo.get(x.geo).push(x);
}

// 1개국 고유 콘텐츠 수 (다른 나라랑 안 겹치는 것 = 그 나라 고유 신호)
const titleGeo = new Map();
for (const x of all) {
  const k = (x.term || '').toLowerCase().replace(/[^a-z0-9가-힣一-龥]/gi, '').slice(0, 35);
  if (!titleGeo.has(k)) titleGeo.set(k, new Set());
  titleGeo.get(k).add(x.geo);
}
const uniqueFor = (geo) => {
  let n = 0;
  for (const [k, gs] of titleGeo) if (gs.size === 1 && gs.has(geo)) n++;
  return n;
};

const rows = [];
for (const [geo, list] of byGeo) {
  const total = list.reduce((a, b) => a + (b.metric || 0), 0);
  const med = [...list].map((x) => x.metric).sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const top = [...list].sort((a, b) => b.metric - a.metric)[0];
  const vel = [...list].sort((a, b) => (b.vel || 0) - (a.vel || 0))[0];
  rows.push({
    geo,
    n: list.length,
    total,
    med,
    unique: uniqueFor(geo),
    top: (top.term || '').slice(0, 34),
    velTop: (vel.term || '').slice(0, 34),
  });
}
rows.sort((a, b) => b.total - a.total);

console.log('순위 | 국가 | 합산뷰(50편) | 중앙값 | 고유콘텐츠 | 1위 영상');
rows.forEach((r, i) => {
  console.log(
    `${String(i + 1).padStart(2)}. ${r.geo.padEnd(3)} | ${String(r.total).padStart(13)} | ${String(r.med).padStart(10)} | ${String(r.unique).padStart(3)} | ${r.top}`
  );
});

console.log('\n--- 고유콘텐츠 수 상위 (해당국만의 신호 = 그 나라 시장 전용 트렌드) ---');
[...rows].sort((a, b) => b.unique - a.unique).slice(0, 15).forEach((r, i) => {
  console.log(`${String(i + 1).padStart(2)}. ${r.geo.padEnd(3)} 고유 ${String(r.unique).padStart(3)}건 | ${r.velTop}`);
});
