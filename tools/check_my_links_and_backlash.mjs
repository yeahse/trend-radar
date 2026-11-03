import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

const MY_VIDS = ['7onwsc5Bf5g', '5PfAFuu5g7Y', 'StHwVF0dbrU', '3Kz0LAcWAeE', 'VTb3bDcIOjU', 'C6yWnFlRgYU'];

async function rsearch(q, label, sort = 'relevance', t = 'year') {
  const res = await fetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=${sort}&t=${t}&limit=10&raw_json=1`,
    { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } }
  );
  const j = await res.json();
  const kids = j.data?.children || [];
  console.log(`\n-- "${q}" (${label}) : ${kids.length}건`);
  for (const c of kids) {
    const d = c.data;
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 64)}`);
    console.log(`       ${String(d.url).slice(0, 92)}`);
    console.log(`       https://www.reddit.com${d.permalink}  (${new Date(d.created_utc * 1000).toISOString().slice(0, 10)}, ${d.num_comments}댓글)`);
  }
  return kids;
}

// ① 네 영상 ID/URL 이 레딧에 있는지 (직접 게시 여부)
console.log('=== ① 내 영상 링크가 레딧에 게시됐는지 ===');
let found = 0;
for (const v of MY_VIDS) {
  const kids = await rsearch(v, '영상ID');
  for (const c of kids) {
    const d = c.data;
    if ((d.url || '').includes(v)) { found++; console.log(`   ★★ 네 영상 링크 발견! ${d.url}`); }
  }
}
console.log(`\n>>> 내 영상 직접 게시 건수: ${found}`);

// ② 밈 백라워/포화 신호
console.log('\n\n=== ② 말포이 밈 백라워·포화 신호 ===');
await rsearch('malfoid grossed out', '반발/피로', 'top');
await rsearch('female draco artist deleted', '작가 사과/삭제', 'top');
await rsearch('malfoid cringe', 'cringe', 'top');
await rsearch('malfoid tired of', '피로', 'top');
