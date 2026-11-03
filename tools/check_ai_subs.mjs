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

const SUBS = ['MALfoid', 'mAIfoid', 'malfoid', 'FemaleDraco', 'DracoMalfoy', 'suddenlymalfoid', 'Femslash', 'HPfanfiction'];

console.log('=== AI/말포이 관련 서브레딧 현황 ===');
console.log('서브레딧'.padEnd(20) + '구독자'.padStart(9) + '생성일'.padStart(13) + '활성'.padStart(8) + '설명');
for (const s of SUBS) {
  const r = await j(`https://oauth.reddit.com/r/${s}/about.json?raw_json=1`);
  if (r.__status) { console.log(`${s.padEnd(20)} ${String(r.__status).padStart(9)}  (없음/접근불가)`); continue; }
  const d = r.data || {};
  const created = d.created_utc ? new Date(d.created_utc * 1000).toISOString().slice(0, 10) : '-';
  const age = d.created_utc ? Math.round((Date.now() - d.created_utc * 1000) / 86400000) : '?';
  console.log(
    `${s.padEnd(20)} ${String(d.subscribers ?? '-').padStart(9)} ${String(created).padStart(13)} ${String(d.accounts_active ?? '-').padStart(8)} (${age}일) ${String(d.public_description || '').replace(/\s+/g, ' ').slice(0, 55)}`
  );
}

// r/MALfoid 주간 성장 (top 포스트의 일별 분포로 대략)
console.log('\n=== r/MALfoid 최근 포스트 시간 분포 (일별) ===');
const dayCount = {};
for (const w of ['week', 'month']) {
  const t = await j(`https://oauth.reddit.com/r/MALfoid/top?t=${w}&limit=100&raw_json=1`);
  for (const c of t.data?.children || []) {
    const d = new Date(c.data.created_utc * 1000).toISOString().slice(0, 10);
    dayCount[d] = (dayCount[d] || 0) + 1;
  }
}
const days = Object.entries(dayCount).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
for (const [d, c] of days) console.log(`  ${d}  ${'█'.repeat(Math.min(c, 40))} ${c}`);

// r/mAIfoid 최근 포스트 = AI 콘텐츠가 실제로 어떤 포맷으로 올라가는지
console.log('\n=== r/mAIfoid 최근 15개 (AI 콘텐츠 실제 포맷) ===');
const ma = await j('https://oauth.reddit.com/r/mAIfoid/new?limit=15&raw_json=1');
for (const c of ma.data?.children || []) {
  const d = c.data;
  console.log(`  [${d.score}] ${String(d.title).slice(0, 66)}`);
  console.log(`      ${String(d.url).slice(0, 80)} | flair=${d.link_flair_text || '-'} | by u/${d.author}`);
}
