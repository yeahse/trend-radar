import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

async function j(url) {
  const r = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  if (!r.ok) return { __status: r.status };
  return r.json();
}

// r/mAIfoid 최근 yt 링크 포스트의 selftext 확인 (본문 쓰는 관행인지)
const nw = await j('https://oauth.reddit.com/r/mAIfoid/new?limit=40&raw_json=1');
console.log('=== r/mAIfoid 최근 yt 링크 포스트의 본문 유무 ===');
for (const c of nw.data?.children || []) {
  const d = c.data;
  if (!/youtu/.test(d.url || '')) continue;
  console.log(`\n[${d.score}] ${d.title}`);
  console.log(`   url: ${d.url}`);
  console.log(`   selftext(${String(d.selftext || '').length}자): ${String(d.selftext || '(본문 없음)').slice(0, 300)}`);
  console.log(`   flair: ${d.link_flair_text || '(없음)'} | author: u/${d.author}`);
}

// ahuuu135 의 r/mAIfoid 활동 이력
console.log('\n\n=== ahuuu135 의 r/mAIfoid 활동 ===');
const sub = await j('https://oauth.reddit.com/user/ahuuu135/submitted.json?limit=25&raw_json=1');
const items = sub.data?.children || [];
console.log(`총 ${items.length}건`);
for (const c of items) {
  const d = c.data;
  console.log(`  [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 60)} (${new Date(d.created_utc * 1000).toISOString().slice(0, 10)}) ${d.url ? 'url=' + String(d.url).slice(0, 60) : ''}`);
}
const cm = await j('https://oauth.reddit.com/user/ahuuu135/comments.json?limit=25&raw_json=1');
const citems = cm.data?.children || [];
console.log(`\n댓글 ${citems.length}건`);
for (const c of citems.slice(0, 10)) {
  const d = c.data;
  console.log(`  [${d.score}] r/${d.subreddit} :: ${String(d.body || '').replace(/\s+/g, ' ').slice(0, 90)}`);
}
