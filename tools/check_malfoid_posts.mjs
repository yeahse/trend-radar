import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

async function j(url) {
  const res = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  if (!res.ok) return { __status: res.status };
  return res.json();
}

// ① r/MALfoid top (주간) — "In another life, maybe." 포함 여부
const top = await j('https://oauth.reddit.com/r/MALfoid/top?t=week&limit=50&raw_json=1');
console.log('=== r/MALfoid top (week) ===');
for (const c of top.data?.children || []) {
  const d = c.data;
  console.log(
    `[${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 62)}\n     url=${d.url}\n     permalink=https://www.reddit.com${d.permalink}\n     author=u/${d.author} | comments=${d.num_comments} | ${new Date(d.created_utc * 1000).toISOString().slice(0, 10)} | flair=${d.link_flair_text || '-'}`
  );
}

// ② "in another life" 로 r/MALfoid + 전체 검색
for (const q of ['"in another life"', 'treerahouse', '"another life"']) {
  const s = await j(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=15&raw_json=1`
  );
  console.log(`\n=== search "${q}" (${s.data?.children?.length || 0}건) ===`);
  for (const c of s.data?.children || []) {
    const d = c.data;
    console.log(`  [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 60)}`);
    console.log(`      url=${String(d.url).slice(0, 100)}`);
    console.log(`      permalink=https://www.reddit.com${d.permalink}  by u/${d.author}`);
  }
}
