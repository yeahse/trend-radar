/**
 * YouTube Data API 로 "연도별 × 국가별" 관심도 성장 측정.
 * search.list 의 publishedAfter/publishedBefore 로 연도를 나눠 totalResults 비교.
 *
 * ⚠️ search 의 totalResults 는 근사치(상한 있음)지만 상대 비교에는 유효.
 *    100유닛/콜 이므로 호출 수를 신중히 관리.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;

let used = 0;
async function yt(url) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${url}`, { headers: { 'user-agent': 'trend-radar/1.0' } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { __err: t.slice(0, 160) }; }
  if (j.error) return { __err: `${j.error.code} ${j.error.message}`, __quota: j.error.errors?.[0]?.reason };
  return j;
}

async function count(q, geo, year) {
  const after = `${year}-01-01T00:00:00Z`;
  const before = `${year + 1}-01-01T00:00:00Z`;
  const j = await yt(`search?part=snippet&type=video&q=${encodeURIComponent(q)}&regionCode=${geo}&publishedAfter=${after}&publishedBefore=${before}&maxResults=1&key=${KEY}`);
  used += 100;
  if (j.__err) return { n: -1, err: j.__err, quota: j.__quota };
  return { n: j.pageInfo?.totalResults ?? 0 };
}

const mode = process.argv[2] || 'probe';

if (mode === 'probe') {
  console.log('=== 쿼리 후보 탐색 (2024 vs 2025 vs 2026) ===');
  const QUERIES = ['malfoid', 'female draco malfoy', 'draco malfoy ts', 'genderbend harry potter', 'ts harry potter', 'draconia'];
  const GEOS = ['US', 'VN', 'ID', 'PH', 'NG', 'TH'];
  console.log('쿼리'.padEnd(26) + GEOS.map((g) => g.padStart(18)).join(''));
  for (const q of QUERIES) {
    const cells = [];
    for (const g of GEOS) {
      const y24 = await count(q, g, 2024);
      const y25 = await count(q, g, 2025);
      const y26 = await count(q, g, 2026);
      cells.push(`${y24.n}/${y25.n}/${y26.n}`.padStart(18));
    }
    console.log(q.padEnd(26) + cells.join(''));
    if (y26.err) { console.log('   쿼터 에러:', y26.err); break; }
  }
  console.log(`\n사용 유닛 추정: ${used}`);
}
