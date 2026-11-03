import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;
const auth = await redditAuth(cfg);

async function yt(url) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${url}`, { headers: { 'user-agent': 'trend-radar' } });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { return { __error: t.slice(0, 150) }; }
  if (j.error) return { __error: `${j.error.code}: ${j.error.message}` };
  return j;
}

const NAMES = ['dmpklab', 'serave.1', '세라브랑'];
const found = [];

console.log('=== ① 채널 ID 확보 (channels.list = 1유닛, search 우회) ===');
for (const name of NAMES) {
  for (const [kind, q] of [['forUsername', name], ['forHandle', '@' + name]]) {
    const r = await yt(`channels?part=snippet,statistics,contentDetails&${kind}=${encodeURIComponent(q)}&key=${KEY}`);
    if (r.__error) { console.log(`  ${name} ${kind} → ERR ${r.__error.slice(0, 80)}`); continue; }
    for (const it of r.items || []) {
      console.log(`  ✔ ${name} (${kind}) → ${it.id} | ${it.snippet.title} | 구독자 ${it.statistics?.subscriberCount} | 영상 ${it.statistics?.videoCount} | ${it.snippet.customUrl || ''}`);
      found.push({ id: it.id, title: it.snippet.title, name });
    }
  }
}

// ② 업로드 플레이리스트로 영상 제목 (playlistItems = 1유닛)
console.log('\n=== ② 최근 영상 제목 ===');
const videos = [];
const done = new Set();
for (const c of found) {
  if (done.has(c.id)) continue;
  done.add(c.id);
  const pl = await yt(`playlists?part=snippet&channelId=${c.id}&maxResults=10&key=${KEY}`);
  if (pl.__error) { console.log(`  ${c.title} → ERR ${pl.__error.slice(0, 70)}`); continue; }
  const up = (pl.items || []).find((p) => /upload/i.test(p.snippet?.title || ''));
  if (!up) { console.log(`  ${c.title} → 업로드 플레이리스트 없음 (${pl.items?.length || 0}개)`); continue; }
  const it = await yt(`playlistItems?part=snippet&playlistId=${up.id}&maxResults=20&key=${KEY}`);
  if (it.__error) { console.log(`  ${c.title} → ERR ${it.__error.slice(0, 70)}`); continue; }
  console.log(`\n  [${c.title}] ${it.items?.length || 0}개`);
  for (const i of it.items || []) {
    console.log(`    ${i.snippet.publishedAt?.slice(0, 10)} | ${String(i.snippet.title).slice(0, 70)}`);
    videos.push(i.snippet.title);
  }
}

// ③ 레딧 검색 (Reddit 은 쿼터 무제한)
console.log('\n=== ③ 레딧 검색: 채널명 + 영상제목 ===');
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
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 62)}`);
    console.log(`       ${String(d.url).slice(0, 95)}`);
    console.log(`       https://www.reddit.com${d.permalink}`);
  }
}
for (const n of NAMES) await rsearch(n, '채널명');
for (const v of videos.slice(0, 10)) await rsearch(v, '영상제목');
