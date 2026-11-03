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

console.log('=== r/mAIfoid 포스트 flair 목록 ===');
const fl = await j('https://oauth.reddit.com/api/v1/user/ahuuu135/takedown?raw_json=1');
const list = await j('https://oauth.reddit.com/r/mAIfoid/api/link_flair_v2?raw_json=1');
console.log(JSON.stringify(list).slice(0, 1200));

console.log('\n=== r/mALfoid flair 비교 ===');
const fl2 = await j('https://oauth.reddit.com/r/MALfoid/api/link_flair_v2?raw_json=1');
console.log(JSON.stringify(fl2).slice(0, 900));

console.log('\n=== r/mAIfoid 최근 포스트들의 flair 사용 현황 ===');
const nw = await j('https://oauth.reddit.com/r/mAIfoid/new?limit=40&raw_json=1');
const counts = {};
for (const c of nw.data?.children || []) {
  const f = c.data.link_flair_text || '(없음)';
  counts[f] = (counts[f] || 0) + 1;
}
console.log(JSON.stringify(counts, null, 1));
