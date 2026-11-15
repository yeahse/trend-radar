/**
 * ★ YouTube 채널별 연도별 성과 (2024 / 2025 / 2026) — 정확한 연도별 데이터
 *
 * mostPopular(현재 스냅샷)·search(totalResults 1M 캡) 대신
 * 채널 → 업로드 플레이리스트 → playlistItems(발게일+조회수) 로 연도별을 직접 집계한다.
 * 캡이 없고 정확한 연도 통계표가 나온다.
 *
 * [비용] 채널 탐색은 search(100유닛) 대신 forHandle/forUsername(1유닛) 우선.
 *        playlistItems 50편/콜(1유닛). 총 200유닛 내외.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;

let used = 0;
async function yt(pathAndQuery) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${pathAndQuery}`, { headers: { 'user-agent': 'trend-radar/1.0' } });
  used += 1;
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { __err: t.slice(0, 120) }; }
  if (j.error) return { __err: `${j.error.code} ${j.error.message}` };
  return j;
}

// 채널 핸들/이름 후보 (handle 우선, 없으면 검색)
const CANDIDATES = [
  ['dmpklab', 'dmpklab'],
  ['serave.1', 'serave.1'],
  ['세라브랑', '세라브랑'],
  ['FOYEGE', 'FOYEGE'],
  ['LouieVerse', 'LouieVerseCinematics'],
  ['ADayASMR', 'ADayASMR'],
  ['Bie The Ska', 'Bie The Ska'],
  ['FoxStory', 'foxstory01'],
  ['Mata Fantasy', 'matafantasyy'],
  ['History of Legends', 'History of Legends'],
  ['The Badge', 'The Badge'],
  ['JYG studio', 'JYG_studio'],
];

// 이미 확인된 채널ID (forHandle 로는 신규/비공개 채널이 조회가 안 됨)
const KNOWN_IDS = {
  'dmpklab': 'UC8O3X1yDZli1f3Uc5RdJO5g',
  'serave.1': 'UCgKNj_TiSX2Uc7Yorx8gSfg',
};

async function resolve(name, handle) {
  if (KNOWN_IDS[name]) {
    const j = await yt(`channels?part=snippet,statistics,contentDetails&id=${KNOWN_IDS[name]}&key=${KEY}`);
    if (j.items?.length) return j.items[0];
  }
  // 검색으로 폴백 (정확 매칭 우선)
  const s = await yt(`search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=10`);
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const items = s.items || [];
  const exact = items.find((i) => norm(i.snippet?.title) === norm(name)) ||
    items.find((i) => norm(i.snippet?.title).startsWith(norm(name))) ||
    items.find((i) => norm(i.snippet?.title).includes(norm(name)));
  if (exact) {
    const j = await yt(`channels?part=snippet,statistics,contentDetails&id=${exact.id.channelId}&key=${KEY}`);
    return j.items?.[0] || null;
  }
  return null;
}

const YEARS = [2024, 2025, 2026];
const results = [];

for (const [name, handle] of CANDIDATES) {
  const ch = await resolve(name, handle);
  if (!ch) { console.log(`${name.padEnd(20)} → 찾지 못함`); continue; }
  const up = ch.contentDetails?.relatedPlaylists?.uploads;
  if (!up) { console.log(`${name.padEnd(20)} → 업로드 플레이리스트 없음`); continue; }
  // 업로드 목록 최대 300편 (연도별 집계용)
  const vids = [];
  let token = '';
  for (let page = 0; page < 6; page++) {
    const q = `playlistItems?part=snippet,contentDetails&playlistId=${up}&maxResults=50${token ? `&pageToken=${token}` : ''}&key=${KEY}`;
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${q}`, { headers: { 'user-agent': 'trend-radar/1.0' } });
    used += 1;
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { break; }
    if (j.error) break;
    // playlistItems 는 part=snippet,contentDetails 면 contentDetails.videoId 를 준다
    for (const it of j.items || []) vids.push({ id: it.contentDetails?.videoId || it.snippet?.resourceId?.videoId, pub: it.snippet?.publishedAt });
    token = j.nextPageToken || '';
    if (!token) break;
  }
  // 조회수 배치
  const ids = vids.map((v) => v.id).filter(Boolean);
  const views = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${chunk.join(',')}&key=${KEY}`, { headers: { 'user-agent': 'trend-radar/1.0' } });
    used += 1;
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { continue; }
    for (const it of j.items || []) views[it.id] = Number(it.statistics?.viewCount) || 0;
  }
  const byYear = {};
  for (const v of vids) {
    if (!v.pub) continue;
    const y = Number(v.pub.slice(0, 4));
    if (!YEARS.includes(y)) continue;
    byYear[y] = byYear[y] || { n: 0, views: 0 };
    byYear[y].n += 1;
    byYear[y].views += views[v.id] || 0;
  }
  const row = {
    name, id: ch.id, title: ch.snippet?.title, subs: Number(ch.statistics?.subscriberCount) || 0,
    total: Number(ch.statistics?.viewCount) || 0, byYear,
  };
  results.push(row);
  const s = YEARS.map((y) => {
    const b = byYear[y]; if (!b) return '-'.padStart(11);
    return `${b.n}편/${Math.round(b.views / 1e6)}M`.padStart(11);
  }).join('');
  console.log(`${(ch.snippet?.title || name).slice(0, 22).padEnd(24)}${s}`);
}

console.log('\n' + '='.repeat(104));
console.log('【 연도별 채널 성과 】  (편수 / 조회수 합)');
console.log('='.repeat(104));
console.log('채널'.padEnd(26) + '2024'.padStart(13) + '2025'.padStart(13) + '2026'.padStart(13) + '25→26뷰증가'.padStart(14));
for (const r of results.sort((a, b) => (b.byYear[2026]?.views || 0) - (a.byYear[2026]?.views || 0))) {
  const a25 = r.byYear[2025]?.views || 0, a26 = r.byYear[2026]?.views || 0;
  const g = a25 ? ((a26 / a25 - 1) * 100) : null;
  console.log(
    (r.title || r.name).slice(0, 24).padEnd(26) +
    YEARS.map((y) => (r.byYear[y] ? `${r.byYear[y].n}편/${Math.round(r.byYear[y].views / 1e6)}M` : '-').padStart(13)).join('') +
    (g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-').padStart(14)
  );
}

// 저장
const md = [];
md.push('# YouTube 채널별 연도별 성과 (2024/2025/2026)');
md.push('');
md.push(`> YouTube Data API channels.list + playlistItems + videos.statistics 직접 집계 · ${new Date().toISOString().slice(0, 10)}`);
md.push('');
md.push('| 채널 | 2024 | 2025 | 2026 | 25→26 | 구독자 |');
md.push('|---|---|---|---|---|---|');
for (const r of results.sort((a, b) => (b.byYear[2026]?.views || 0) - (a.byYear[2026]?.views || 0))) {
  const a25 = r.byYear[2025]?.views || 0, a26 = r.byYear[2026]?.views || 0;
  const g = a25 ? ((a26 / a25 - 1) * 100) : null;
  md.push(`| ${r.title || r.name} | ${r.byYear[2024] ? `${r.byYear[2024].n}편/${Math.round(r.byYear[2024].views / 1e6)}M` : '-'} | ${r.byYear[2025] ? `${r.byYear[2025].n}편/${Math.round(r.byYear[2025].views / 1e6)}M` : '-'} | ${r.byYear[2026] ? `${r.byYear[2026].n}편/${Math.round(r.byYear[2026].views / 1e6)}M` : '-'} | ${g != null ? (g > 0 ? '+' : '') + g.toFixed(0) + '%' : '-'} | ${r.subs.toLocaleString('ko-KR')} |`);
}
fs.writeFileSync(path.join(root, 'reports', `yt_channel_yearly_${new Date().toISOString().slice(0, 10)}.md`), md.join('\n'), 'utf8');
console.log(`\n사용 유닛 ${used} · 저장: reports/yt_channel_yearly_${new Date().toISOString().slice(0, 10)}.md`);

