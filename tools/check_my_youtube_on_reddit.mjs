import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);
const KEY = cfg.youtube.apiKey;

// ① 네 유튜브 채널 찾기 + 영상 목록
async function yt(url) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${url}`, { headers: { 'user-agent': 'trend-radar' } });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { __raw: t.slice(0, 200) }; }
}

console.log('=== ① YouTube 채널 검색: treerahouse ===');
const ch = await yt(`channels?part=snippet,contentDetails,statistics&forUsername=treerahouse&key=${KEY}`);
const chId = ch.items?.[0]?.id;
console.log('forUsername 결과:', ch.items?.[0]?.snippet?.title || '(없음)', chId || '');

let vidIds = [];
if (chId) {
  const pl = await yt(`playlists?part=snippet&channelId=${chId}&key=${KEY}`);
  const up = pl.items?.find((p) => p.snippet?.title?.toLowerCase().includes('upload'));
  if (up) {
    const items = await yt(`playlistItems?playlistId=${up.id}&maxResults=20&key=${KEY}`);
    vidIds = (items.items || []).map((i) => i.snippet?.resourceId?.videoId).filter(Boolean);
  }
}
if (!vidIds.length) {
  const s = await yt(`search?part=snippet&channelId=${chId || ''}&order=date&maxResults=20&key=${KEY}`);
  vidIds = (s.items || []).map((i) => i.id.videoId).filter(Boolean);
}
const vids = vidIds.length ? await yt(`videos?part=snippet,statistics&id=${vidIds.slice(0, 20).join(',')}&key=${KEY}`) : { items: [] };
console.log(`\n최근 영상 ${vids.items?.length || 0}개:`);
for (const v of vids.items || []) {
  console.log(`  ${new Date(v.snippet.publishedAt).toISOString().slice(0, 10)} | ${String(v.snippet.title).slice(0, 62)} | ${v.statistics.viewCount}뷰`);
}

// ② 그 제목들로 레딧 검색
console.log('\n=== ② 레딧 검색 (네 영상 제목 기준) ===');
async function rsearch(q, label) {
  const res = await fetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=10&raw_json=1`,
    { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } }
  );
  const j = await res.json();
  const n = j.data?.children?.length || 0;
  console.log(`\n-- "${q}" (${label}) : ${n}건`);
  for (const c of j.data?.children || []) {
    const d = c.data;
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 58)}`);
    console.log(`       ${String(d.url).slice(0, 95)}`);
  }
}
for (const v of (vids.items || []).slice(0, 5)) {
  await rsearch(v.snippet.title, '제목');
}
await rsearch('treerahouse', '채널명');
await rsearch('url:youtube.com treerahouse', '링크');
