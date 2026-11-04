/**
 * 오늘(11-04) 신호 원문 추적:
 *  - Bluesky 에서 zelda/okami 계열이 왜 떠오르는지
 *  - DeviantArt(earlycommunity) 신호 확인
 *  - 11-03 → 11-04 신호 변화
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

async function bsky(q, limit = 12) {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=${limit}&sort=top`;
  const r = await fetch(url, { headers: { 'user-agent': 'trend-radar/1.0' } });
  if (!r.ok) return { posts: [] };
  const j = await r.json();
  return { posts: j.posts || [] };
}

console.log('=== ① Bluesky: zelda / okami / twilight 원문 ===');
for (const q of ['zelda', 'okami twilight', 'twilight princess', 'december zelda']) {
  const { posts } = await bsky(q, 10);
  console.log(`\n--- "${q}" (${posts.length}건) ---`);
  for (const p of posts) {
    const ageH = Math.max(0.2, (Date.now() - new Date(p.record.createdAt).getTime()) / 3600000);
    const likes = p.likeCount ?? 0;
    console.log(`  ${String(Math.round(likes / ageH)).padStart(5)}/h [${likes}] ${p.author.handle}`);
    console.log(`     ${String(p.record.text || '').replace(/\s+/g, ' ').slice(0, 150)}`);
  }
}

console.log('\n\n=== ② Bluesky: animation / timelapse / AI 애니 신호 ===');
for (const q of ['AI animation', 'timelapse animation']) {
  const { posts } = await bsky(q, 8);
  console.log(`\n--- "${q}" (${posts.length}건) ---`);
  for (const p of posts) {
    const ageH = Math.max(0.2, (Date.now() - new Date(p.record.createdAt).getTime()) / 3600000);
    console.log(`  ${String(Math.round((p.likeCount ?? 0) / ageH)).padStart(5)}/h [${p.likeCount ?? 0}] @${p.author.handle}`);
    console.log(`     ${String(p.record.text || '').replace(/\s+/g, ' ').slice(0, 140)}`);
  }
}

console.log('\n\n=== ③ 오늘 리포트 아이디어 섹션 ===');
const t = fs.readFileSync(path.join(root, 'reports', '2026-11-04.md'), 'utf8');
const lines = t.split('\n');
const i = lines.findIndex((l) => l.includes('지금 올릴 수 있는 것'));
if (i >= 0) console.log(lines.slice(i, i + 14).join('\n'));

console.log('\n\n=== ④ ACT / WATCH 섹션 ===');
const j = lines.findIndex((l) => l.includes('🔴 ACT'));
if (j >= 0) console.log(lines.slice(j, j + 22).join('\n'));
