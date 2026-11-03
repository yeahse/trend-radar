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

const POSTS = [
  ['AO3 grossed out', '1wx77e1'],
  ['AO3 language fem!', '1wzunh1'],
  ['anime news Yunayu', '1xk5s0c'], // placeholder, resolved below
];

// ① r/animenews Yunayu 포스트 찾기
console.log('=== ① r/animenews "Yunayu" 포스트 ===');
const an = await j('https://oauth.reddit.com/r/animenews/search?q=Yunayu&restrict_sr=1&sort=new&t=year&limit=5&raw_json=1');
for (const c of an.data?.children || []) {
  const d = c.data;
  console.log(`  [${d.score}] ${d.title}`);
  console.log(`     https://www.reddit.com${d.permalink} (${new Date(d.created_utc * 1000).toISOString().slice(0, 10)}, ${d.num_comments}댓글)`);
  console.log(`     ${String(d.url).slice(0, 110)}`);
  // 본문
  const full = await j(`https://oauth.reddit.com/comments/${d.id}.json?raw_json=1`);
  const body = full[0]?.data?.children?.[0]?.data?.selftext || '';
  console.log(`     본문: ${body.replace(/\s+/g, ' ').slice(0, 700)}`);
  console.log('');
}

// ② AO3 "grossed out" 포스트 본문 + 댓글 정서
console.log('\n=== ② r/AO3 "grossed out by the whole malfoid thing" ===');
const ao3 = await j('https://oauth.reddit.com/comments/1wx77e1.json?raw_json=1');
const p = ao3[0]?.data?.children?.[0]?.data;
if (p) {
  console.log(`  [${p.score}] ${p.title}`);
  console.log(`  https://www.reddit.com${p.permalink}`);
  console.log(`  작성 ${new Date(p.created_utc * 1000).toISOString().slice(0, 10)} · 댓글 ${p.num_comments} · by u/${p.author}`);
  console.log(`\n  본문:\n  ${(p.selftext || '').slice(0, 1800)}`);
  console.log('\n  --- 상위 댓글 ---');
  for (const c of (ao3[1]?.data?.children || []).slice(0, 8)) {
    if (c.kind !== 't1' || !c.data) continue;
    console.log(`   [${c.data.score}] u/${c.data.author}: ${String(c.data.body || '').replace(/\s+/g, ' ').slice(0, 220)}`);
  }
}

// ③ r/mAIfoid 최근 yt 링크 전부 (경쟁작 모니터링용)
console.log('\n=== ③ r/mAIfoid 최근 yt 링크 전부 ===');
const mai = await j('https://oauth.reddit.com/r/mAIfoid/new?limit=40&raw_json=1');
for (const c of mai.data?.children || []) {
  const d = c.data;
  const yt = /youtube\.com|youtu\.be/.test(d.url || '');
  console.log(`  ${yt ? '★' : ' '} [${d.score}] ${String(d.title).slice(0, 60)}`);
  console.log(`      ${String(d.url).slice(0, 95)} | by u/${d.author} | ${new Date(d.created_utc * 1000).toISOString().slice(0, 10)}`);
}
