import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;
const auth = await redditAuth(cfg);

async function ytRaw(url) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${url}`, { headers: { 'user-agent': 'trend-radar' } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { __raw: t.slice(0, 200), __status: r.status }; }
  if (j.error) return { __error: `${j.error.code}: ${j.error.message}`, __status: r.status };
  return { __status: r.status, ...j };
}

const NAMES = ['dmpklab', 'serave.1', '세라브랑'];

console.log('=== ① YouTube 채널 실측 (쿼터 상태 포함) ===');
const channels = [];
for (const name of NAMES) {
  console.log(`\n--- "${name}" ---`);
  const byUser = await ytRaw(`channels?part=snippet,statistics,contentDetails&id=&forUsername=${encodeURIComponent(name)}&key=${KEY}`);
  console.log(`  forUsername → ${byUser.__error || (byUser.items?.length || 0) + '건'}`);
  const byHandle = await ytRaw(`channels?part=snippet,statistics&forHandle=${encodeURIComponent('@' + name)}&key=${KEY}`);
  console.log(`  forHandle   → ${byHandle.__error || (byHandle.items?.length || 0) + '건'}`);
  const s = await ytRaw(`search?part=snippet&type=channel&q=${encodeURIComponent(name)}&maxResults=5&key=${KEY}`);
  if (s.__error) console.log(`  search      → ERR ${s.__error}`);
  else {
    console.log(`  search      → ${s.items?.length || 0}건`);
    for (const it of s.items || []) {
      console.log(`     ${it.id.channelId} | ${it.snippet.channelTitle} | ${String(it.snippet.description || '').slice(0, 50)}`);
      channels.push({ id: it.id.channelId, title: it.snippet.channelTitle, q: name });
    }
  }
  for (const src of [byUser, byHandle]) {
    for (const it of src.items || []) {
      console.log(`     ✔ ${it.id} | ${it.snippet.title} | 구독자 ${it.statistics?.subscriberCount} | 영상 ${it.statistics?.videoCount}`);
      channels.push({ id: it.id, title: it.snippet.title, q: name });
    }
  }
}

// ② 채널별 최근 영상 제목
console.log('\n=== ② 채널별 최근 영상 제목 ===');
const seen = new Set();
const myVideos = [];
for (const c of channels) {
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  const s = await ytRaw(`search?part=snippet&type=video&channelId=${c.id}&order=date&maxResults=10&key=${KEY}`);
  if (s.__error) { console.log(`  ${c.title} → ERR ${s.__error}`); continue; }
  console.log(`\n  [${c.title}] ${s.items?.length || 0}건`);
  for (const it of s.items || []) {
    console.log(`    ${new Date(it.snippet.publishedAt).toISOString().slice(0, 10)} | ${it.snippet.title.slice(0, 64)}`);
    myVideos.push({ title: it.snippet.title, channel: c.title });
  }
}

// ③ 레딧 검색
console.log('\n=== ③ 레딧에서 채널명/영상제목 검색 ===');
async function rsearch(q, label) {
  const res = await fetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=8&raw_json=1`,
    { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } }
  );
  const j = await res.json();
  const n = j.data?.children?.length || 0;
  console.log(`\n-- "${q}" (${label}) : ${n}건`);
  for (const c of j.data?.children || []) {
    const d = c.data;
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 60)}`);
    console.log(`       ${String(d.url).slice(0, 95)}`);
    console.log(`       https://www.reddit.com${d.permalink}`);
  }
}
for (const n of NAMES) await rsearch(n, '채널명');
for (const v of myVideos.slice(0, 8)) await rsearch(v.title, '영상제목');
