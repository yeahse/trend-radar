/**
 * 속도(velocity) · 크로스국가 동시등장 분석
 *
 * 가설: "국가별 1등이 다 뮤비"는 (1) 절대 조회수 지표의 왜곡 + (2) 뮤비의 주간 이벤트성 때문이다.
 *       진짜 "지금 뜨는 것"은 절대 조회수가 아니라 **상대속도**이고,
 *       진짜 "글로벌 트렌드"는 **여러 국가에서 동시에** 뜨는 것이다.
 *
 * 사용: node tools\analyze_velocity.mjs
 */
import { collectGlobalTrends } from '../src/sources/globaltrends.mjs';
import { classifyFormat } from '../src/globalmatch.mjs';
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
const r = await collectGlobalTrends(cfg, { ytMax: 50, wikiMax: 50 });
const yt = r.items.filter((x) => x.source === 'youtube-popular');
const now = Date.now();
const hours = (iso) => (iso ? Math.max(0.2, (now - new Date(iso).getTime()) / 3600000) : null);
for (const x of yt) x.vel = x.publishedAt ? x.metric / hours(x.publishedAt) : 0;

const geos = [...new Set(yt.map((x) => x.geo))];
const fmt = (t) => classifyFormat(t).label;

console.log('════════ ① 절대조회수 1등 vs 속도 1등 ════════');
const firstByView = geos.map((g) => yt.find((x) => x.geo === g)).filter(Boolean);
const firstByVel = geos.map((g) =>
  yt.filter((x) => x.geo === g).sort((a, b) => b.vel - a.vel)[0]
).filter(Boolean);
const isMusic = (x) => fmt(x.term) === '음악/MV';
console.log(`  조회수 1등 중 음악: ${firstByView.filter(isMusic).length}/${firstByView.length} (${((firstByView.filter(isMusic).length / firstByView.length) * 100).toFixed(0)}%)`);
console.log(`  속도   1등 중 음악: ${firstByVel.filter(isMusic).length}/${firstByVel.length} (${((firstByVel.filter(isMusic).length / firstByVel.length) * 100).toFixed(0)}%)`);
console.log('  → 지표를 바꾸면 "세계가 뭘 원하는가"의 답이 바뀐다\n');

console.log('════════ ② 게시 요일 분포 (음악) ════════');
const dow = new Map();
for (const x of yt.filter(isMusic)) {
  if (!x.publishedAt) continue;
  const d = new Date(x.publishedAt).getUTCDay();
  const k = ['일', '월', '화', '수', '목', '금', '토'][d];
  dow.set(k, (dow.get(k) || 0) + 1);
}
console.log('  ' + [...dow.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));

console.log('\n════════ ③ ★ N개국 동시 1등 = 진짜 글로벌 트렌드 ════════');
const byTitle = new Map();
for (const g of geos) {
  const top = yt.filter((x) => x.geo === g).sort((a, b) => b.vel - a.vel)[0];
  if (!top) continue;
  const key = (top.term || '').toLowerCase().replace(/[^a-z0-9가-힣一-龥぀-ヿ]/gi, '').slice(0, 40);
  if (!byTitle.has(key)) byTitle.set(key, { title: top.term, geos: [], vel: top.vel, fmt: fmt(top.term), url: top.url });
  byTitle.get(key).geos.push(g);
}
const cross = [...byTitle.values()].filter((v) => v.geos.length >= 2).sort((a, b) => b.geos.length - a.geos.length || b.vel - a.vel);
for (const c of cross) {
  console.log(`  ${String(c.geos.length).padStart(2)}개국  ${(c.title || '').slice(0, 54).padEnd(56)} ${Math.round(c.vel).toLocaleString('ko-KR')}/h  [${c.fmt}]`);
  console.log(`          ${c.geos.join(' ')}`);
}

console.log('\n════════ ④ 속도 기준 국가별 "지금 뜨는 것" ════════');
for (const x of firstByVel) {
  console.log(`  ${x.geo.padEnd(4)} ${(x.term || '').slice(0, 50).padEnd(52)} ${Math.round(x.vel).toLocaleString('ko-KR')}/h  [${fmt(x.term)}]`);
}
