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

// ① 최근 100개 포스트 중 youtube/vimeo 링크가 붙은 것
const tops = {};
for (const w of ['week', 'month', 'year']) {
  const t = await j(`https://oauth.reddit.com/r/MALfoid/top?t=${w}&limit=100&raw_json=1`);
  for (const c of t.data?.children || []) tops[c.data.id] = c.data;
}
const all = Object.values(tops);
console.log(`=== ① r/MALfoid 상위 ${all.length}건 중 영상 링크 붙은 포스트 ===`);
const vids = all.filter((d) => /youtube\.com|youtu\.be|vimeo\.com|twitch/i.test(d.url || ''));
console.log(`링크 영상 포스트: ${vids.length}건`);
for (const d of vids) {
  console.log(`  [${d.score}] ${d.title}\n      ${d.url}\n      https://www.reddit.com${d.permalink}`);
}

// ② 링크 상위어 (어떤 플랫폼이 유행하는지)
console.log('\n=== ② 포스트 URL 도메인 분포 ===');
const dom = {};
for (const d of all) {
  let h = 'other';
  try { h = new URL(d.url).hostname.replace(/^www\./, ''); } catch {}
  dom[h] = (dom[h] || 0) + 1;
}
for (const [k, v] of Object.entries(dom).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

// ③ 서브레딧 규칙 (셀프홍보 가능?')
const about = await j('https://oauth.reddit.com/r/MALfoid/about/rules.json?raw_json=1');
console.log('\n=== ③ r/MALfoid 규칙 ===');
for (const r of about.rules || []) {
  const t = (r.description || '').replace(/\s+/g, ' ').slice(0, 260);
  console.log(`\n  [${r.short_name}] ${t}`);
}

// ④ 커뮤니티 정보
const info = await j('https://oauth.reddit.com/r/MALfoid/about.json?raw_json=1');
console.log('\n=== ④ r/MALfoid 정보 ===');
const d = info.data || {};
console.log('구독자:', d.subscribers, '| 활성:', d.accounts_active, '| 创建:', new Date(d.created_utc * 1000).toISOString().slice(0, 10));
console.log('설명:', String(d.public_description).replace(/\s+/g, ' ').slice(0, 300));
