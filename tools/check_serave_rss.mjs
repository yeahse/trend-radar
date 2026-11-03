import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

function parseRss(xml) {
  const out = [];
  for (const m of xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([\w-]{11})<\/yt:videoId>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<published>([^<]+)<\/published>[\s\S]*?<media:description>([\s\S]*?)<\/media:description>/g)) {
    out.push({ vid: m[1], title: m[2], date: m[3].slice(0, 10), desc: m[4].slice(0, 120).replace(/\s+/g, ' ') });
  }
  return out;
}

console.log('=== ① Serave 채널 RSS (공개 피드, API 무관) ===');
const CID = 'UCgKNj_TiSX2Uc7Yorx8gSfg';
const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CID}`, { headers: { 'user-agent': UA } });
const xml = await res.text();
const entries = parseRss(xml);
console.log(`  HTTP ${res.status} | ${entries.length}개`);
const titles = [];
for (const e of entries) {
  console.log(`   ${e.date} | ${e.title}`);
  console.log(`      https://youtu.be/${e.vid}`);
  titles.push(e.title);
}

console.log('\n=== ② 다른 채널 핸들 변형 시도 ===');
const CAND = ['dmpklab', 'dmpk_lab', 'dmpk-lab', 'dmpk', 'labdmpk', 'dmpklabofficial', '세라브랑', 'serave', 'serave1', 'serabrang'];
for (const h of CAND) {
  for (const path of ['', '/videos']) {
    const r = await fetch(`https://www.youtube.com/@${encodeURIComponent(h)}${path}`, { headers: { 'user-agent': UA } });
    if (r.status === 200) {
      const html = await r.text();
      const cid = html.match(/"externalId":"(UC[\w-]{20,})"/)?.[1] || html.match(/"browseId":"(UC[\w-]{20,})"/)?.[1] || null;
      const name = html.match(/"channelMetadataRenderer":\{"title":"([^"]*)"/)?.[1] || html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || null;
      console.log(`  ✔ @${h}${path} → ${name || '(이름없음)'} | ${cid || '-'}`);
      break;
    }
  }
}

console.log('\n=== ③ Reddit: Serave 영상 제목으로 검색 ===');
async function rsearch(q) {
  const r = await fetch(`https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=6&raw_json=1`, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  const j = await r.json();
  const n = j.data?.children?.length || 0;
  console.log(`\n-- "${q}" : ${n}건`);
  for (const c of j.data?.children || []) {
    const d = c.data;
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 60)}`);
    console.log(`       ${String(d.url).slice(0, 90)}`);
  }
}
for (const t of titles.slice(0, 8)) await rsearch(t);
