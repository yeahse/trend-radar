/**
 * ★ 연도별 × 국가별 소비 규모 (2024 / 2025 / 2026) — 실측 기반
 *
 * [왜 이 방법]
 *   search.list 의 totalResults 는 1,000,000 에 캡 걸려 비교 불가.
 *   mostPopular 는 현재 스냅샿이라 "몇 년도꺼냐" 물음에 답 못함.
 *   → publishedAfter/publishedBefore 로 연도를 나누고,
 *     order=viewCount 로 **그 연도 그 국가 상위 50편** 을 받아
 *     조회수 합을 비교한다. 캡 없고(50편 한정), 정확하고, 연도가 명시된다.
 *
 *   해석: "그 연도·그 국가에서 해당 키워드가 소비된 규모"의 대용 지표.
 *         절대값 비교 + 25→26 성장률.
 *
 * [비용] 100유닛/콜. 국가 14 × 연도 3 × 키워드 1 = 42콜 = 4,200유닛 (일일 10,000 이내)
 *
 * [사용] node tools\yt_yearly_country.mjs [키워드] [국가,국가,...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;

const KW = process.argv[2] || 'malfoid';
const GEOS = (process.argv[3] || 'US,VN,ID,PH,NG,TH,IN,TW,BR,TR,MY,SA,AE,JP,KR').split(',');
const YEARS = [2024, 2025, 2026];
const NAME = { US: '미국', VN: '베트남', ID: '인도네시아', PH: '필리핀', NG: '나이지리아', TH: '태국', IN: '인도', TW: '대만', BR: '브라질', TR: '터키', MY: '말레이시아', SA: '사우디', AE: 'UAE', JP: '일본', KR: '한국', EG: '이집트', PL: '폴란드', CA: '캐나다', AU: '호주', FR: '프랑스', DE: '독일', IT: '이탈리아', ES: '스페인', MX: '멕시코', GB: '영국' };

let used = 0;
async function top50(q, geo, year) {
  const after = `${year}-01-01T00:00:00Z`;
  const before = `${year + 1}-01-01T00:00:00Z`;
  // 1) search.list 은 part=statistics 를 안 받으므로 snippet 으로 상위 50개 videoId 만 받는다
  const surl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}` +
    `&regionCode=${geo}&order=viewCount&publishedAfter=${after}&publishedBefore=${before}&maxResults=50&key=${KEY}`;
  const r = await fetch(surl, { headers: { 'user-agent': 'trend-radar/1.0' } });
  used += 100;
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { err: 'parse ' + t.slice(0, 100) }; }
  if (j.error) return { err: `${j.error.code} ${j.error.message}`, quota: j.error.errors?.[0]?.reason };
  const items = j.items || [];
  const ids = items.map((it) => it.id?.videoId).filter(Boolean);
  const titles = items.slice(0, 3).map((it) => it.snippet?.title?.slice(0, 46));
  if (!ids.length) return { n: 0, views: 0, titles, total: j.pageInfo?.totalResults };

  // 2) videos.list 로 실제 조회수 (1유닛/50편)
  const vurl = `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(0, 50).join(',')}&key=${KEY}`;
  const vr = await fetch(vurl, { headers: { 'user-agent': 'trend-radar/1.0' } });
  used += 1;
  const vt = await vr.text();
  let vj; try { vj = JSON.parse(vt); } catch { return { err: 'vparse ' + vt.slice(0, 80) }; }
  if (vj.error) return { err: `${vj.error.code} ${vj.error.message}`, quota: vj.error.errors?.[0]?.reason };
  const views = (vj.items || []).reduce((s, it) => s + (Number(it.statistics?.viewCount) || 0), 0);
  return { n: ids.length, views, titles, total: j.pageInfo?.totalResults };
}

console.log(`=== 연도별 국가별 소비 규모 — 키워드 "${KW}" (상위 50편 조회수 합) ===\n`);
const rows = [];
for (const geo of GEOS) {
  const cell = {};
  for (const y of YEARS) {
    const r = await top50(KW, geo, y);
    if (r.err) { console.log(`  ${NAME[geo] || geo} ${y}: ERR ${r.err}`); if (r.quota === 'quotaExceeded' || r.quota === 'dailyLimitExceeded') { console.log('  → 쿼터 소진, 중단'); process.exit(2); } }
    cell[y] = r;
    await new Promise((s) => setTimeout(s, 120));
  }
  rows.push({ geo, name: NAME[geo] || geo, ...cell });
  const v = YEARS.map((y) => (cell[y]?.views != null ? Math.round(cell[y].views / 1e6) + 'M' : '-').padStart(8)).join('');
  const g = cell[2025]?.views ? ((cell[2026].views / cell[2025].views - 1) * 100).toFixed(0) + '%' : '-';
  console.log(`${(NAME[geo] || geo).padEnd(12)}(${geo}) ${v}   25→26 ${g}`);
}

console.log('\n' + '='.repeat(100));
console.log('【 최종 랭킹 】 2026 조회수 합 기준');
console.log('='.repeat(100));
const sorted = [...rows].sort((a, b) => (b[2026]?.views || 0) - (a[2026]?.views || 0));
console.log('#'.padStart(4) + '국가'.padEnd(18) + '2024'.padStart(13) + '2025'.padStart(13) + '2026'.padStart(13) + '25→26증가'.padStart(13));
sorted.forEach((r, i) => {
  const g = r[2025]?.views ? ((r[2026].views / r[2025].views - 1) * 100) : null;
  console.log(
    String(i + 1).padStart(4) + ` ${r.name} (${r.geo})`.padEnd(18) +
    (r[2024] ? Math.round(r[2024].views / 1e6) + 'M' : '-').padStart(13) +
    (r[2025] ? Math.round(r[2025].views / 1e6) + 'M' : '-').padStart(13) +
    (r[2026] ? Math.round(r[2026].views / 1e6) + 'M' : '-').padStart(13) +
    (g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-').padStart(13)
  );
});

const md = [];
md.push(`# 연도별 국가별 소비 규모 — "${KW}"`);
md.push('');
md.push(`> YouTube Data API search.list · order=viewCount · 연도별 상위 50편 조회수 합 · ${new Date().toISOString().slice(0, 10)}`);
md.push('');
md.push('| # | 국가 | 2024 | 2025 | 2026 | 25→26 |');
md.push('|---|---|---|---|---|---|');
sorted.forEach((r, i) => {
  const g = r[2025]?.views ? ((r[2026].views / r[2025].views - 1) * 100) : null;
  md.push(`| ${i + 1} | ${r.name} (${r.geo}) | ${r[2024] ? Math.round(r[2024].views / 1e6) + 'M' : '-'} | ${r[2025] ? Math.round(r[2025].views / 1e6) + 'M' : '-'} | ${r[2026] ? Math.round(r[2026].views / 1e6) + 'M' : '-'} | ${g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-'} |`);
});
fs.writeFileSync(path.join(root, 'reports', `yt_yearly_${KW}_${new Date().toISOString().slice(0, 10)}.md`), md.join('\n'), 'utf8');
console.log(`\n사용 유닛 ${used} · 저장: reports/yt_yearly_${KW}_${new Date().toISOString().slice(0, 10)}.md`);
