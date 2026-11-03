import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VID = 'mNuKVrvZVzc';

// ① 영상 정보
const res = await fetch(`https://www.youtube.com/watch?v=${VID}`, {
  headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' },
});
const html = await res.text();
const pick = (re) => html.match(re)?.[1] ?? null;
let desc = pick(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
try { desc = desc ? JSON.parse('"' + desc + '"') : null; } catch { /* noop */ }
console.log('=== ① 올릴 영상 ===');
console.log('  URL     :', `https://www.youtube.com/watch?v=${VID}`);
console.log('  제목    :', pick(/"title":"((?:[^"\\]|\\.)*)"/) ? JSON.parse('"' + pick(/"title":"((?:[^"\\]|\\.)*)"/) + '"') : pick(/<meta property="og:title" content="([^"]*)"/));
console.log('  채널    :', pick(/"ownerChannelName":"([^"]*)"/));
console.log('  채널ID  :', pick(/"channelId":"(UC[\w-]{20,})"/));
console.log('  조회수  :', pick(/"viewCount":"(\d+)"/));
console.log('  업로드  :', pick(/"uploadDate":"([^"]+)"/));
console.log('  길이    :', pick(/"lengthSeconds":"(\d+)"/), '초');
console.log('  설명    :', (desc || '').slice(0, 700));
console.log('  해시태그:', [...new Set((desc || '').match(/#[^\s#]+/g) || [])].join(' '));

// ② r/mAIfoid 규칙 + 현재 로그인 계정
async function j(url) {
  const r = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  if (!r.ok) return { __status: r.status };
  return r.json();
}
console.log('\n=== ② r/mAIfoid 규칙 ===');
const rules = await j('https://oauth.reddit.com/r/mAIfoid/about/rules.json?raw_json=1');
for (const r of rules.rules || []) {
  console.log(`\n  [${r.short_name}] ${(r.description || '').replace(/\s+/g, ' ').slice(0, 420)}`);
}
const about = await j('https://oauth.reddit.com/r/mAIfoid/about.json?raw_json=1');
console.log('\n=== ③ r/mAIfoid 정보 ===');
console.log('  구독자:', about.data?.subscribers, '| 생성:', new Date((about.data?.created_utc || 0) * 1000).toISOString().slice(0, 10));
console.log('  설명  :', String(about.data?.public_description || '').replace(/\s+/g, ' ').slice(0, 400));

const me = await j('https://oauth.reddit.com/api/v1/me');
console.log('\n=== ④ 현재 Reddit 로그인 계정 (API) ===');
console.log('  ', me.name, '| id', me.id, '| 생성', new Date((me.created_utc || 0) * 1000).toISOString().slice(0, 10));
