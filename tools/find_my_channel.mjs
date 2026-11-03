import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;

async function yt(url) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${url}`, { headers: { 'user-agent': 'trend-radar' } });
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { return { __raw: t.slice(0, 300) }; }
  if (j.error) return { __error: `${j.error.code} ${j.error.message}` };
  return j;
}

console.log('=== A. 채널 forUsername=treerahouse ===');
console.log(JSON.stringify(await yt(`channels?part=snippet&forUsername=treerahouse&key=${KEY}`)).slice(0, 400));

console.log('\n=== B. YouTube 검색 "treerahouse" ===');
const s = await yt(`search?part=snippet&type=channel&q=treerahouse&maxResults=10&key=${KEY}`);
if (s.__error) console.log('ERR', s.__error);
for (const it of s.items || []) {
  console.log(`  ${it.id.channelId} | ${it.snippet.channelTitle} | 구독자 ${it.snippet.hiddenVideoCount ?? '-'} | ${it.snippet.description?.slice(0, 60)}`);
}

console.log('\n=== C. YouTube 검색 "In Another Life" (영상) ===');
const s2 = await yt(`search?part=snippet&type=video&q=${encodeURIComponent('"In Another Life" treerahouse')}&maxResults=10&key=${KEY}`);
if (s2.__error) console.log('ERR', s2.__error);
for (const it of s2.items || []) {
  console.log(`  ${it.id.videoId} | ${it.snippet.title?.slice(0, 60)} | ${it.snippet.channelTitle}`);
}
