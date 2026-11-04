/**
 * "말포이 다음으로 지금 뭐가 뜨나" — 2026-11-04 실시간 신호 수집.
 * Reddit(공식 OAuth) + 속도(점수/시간) 기준 랭킹.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { redditAuth } from '../src/reddit_auth.mjs';

// 이 스크립트가 있는 폴더 기준으로 프로젝트 루트 계산 (cwd 무관하게 동작)
const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

async function j(url) {
  const r = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  if (!r.ok) return { __status: r.status };
  return r.json();
}

const SUBS = ['MALfoid', 'mAIfoid', 'suddenlymalfoid', 'DracoMalfoy', 'Femslash', 'HPfanfiction', 'AnimeMemes', 'AIart'];

console.log('=== ① 서브레딧별 최신 신호 (24시간, 점수/시간 속도) ===');
for (const s of SUBS) {
  const t = await j(`https://oauth.reddit.com/r/${s}/top?t=day&limit=30&raw_json=1`);
  const items = t.data?.children || [];
  if (!items.length) { console.log(`\n--- r/${s} : 없음/빈 응답 (${t.__status || 0})`); continue; }
  const now = Date.now() / 1000;
  const rows = items.map((c) => {
    const d = c.data;
    const ageH = Math.max(0.5, (now - d.created_utc) / 3600);
    return { t: d.title, score: d.score, ageH, vel: d.score / ageH, flair: d.link_flair_text || '-', url: String(d.url).slice(0, 58), ext: d.is_video || /youtube|vimeo|twitch/i.test(d.url || '') };
  }).sort((a, b) => b.vel - a.vel);
  const sub = (await j(`https://oauth.reddit.com/r/${s}/about.json?raw_json=1`)).data || {};
  console.log(`\n--- r/${s} (구독자 ${sub.subscribers ?? '?'}, ${Math.round((Date.now() - (sub.created_utc || 0) * 1000) / 86400000)}일차) ---`);
  for (const r of rows.slice(0, 8)) {
    console.log(`  ${String(Math.round(r.vel)).padStart(6)}/h [${String(r.score).padStart(5)}] ${r.t.slice(0, 62)}${r.ext ? '  ▶VIDEO' : ''}  (${r.flair})`);
    console.log(`          ${r.url}`);
  }
}

console.log('\n\n=== ② 새 말포이/TS 관련 서브레딧 검색 (최근 30일) ===');
for (const q of ['femdraco', 'female draco', 'genderbend malfoy', 'TS female draco', 'draco female']) {
  const s = await j(`https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=new&t=month&limit=10&raw_json=1`);
  const items = s.data?.children || [];
  if (!items.length) continue;
  console.log(`\n--- "${q}" (${items.length}건) ---`);
  const now = Date.now() / 1000;
  for (const c of items) {
    const d = c.data;
    const ageH = Math.max(0.5, (now - d.created_utc) / 3600);
    console.log(`  ${String(Math.round(d.score / ageH)).padStart(6)}/h [${d.score}] r/${d.subreddit} :: ${d.title.slice(0, 60)}`);
    console.log(`          ${String(d.url).slice(0, 80)}  · ${new Date(d.created_utc * 1000).toISOString().slice(0, 10)}`);
  }
}

console.log('\n\n=== ③ r/MALfoid 최근 48시간 포스트 흐름 (일별) ===');
const dayCount = {};
for (const w of ['day', 'week']) {
  const t = await j(`https://oauth.reddit.com/r/MALfoid/top?t=${w}&limit=100&raw_json=1`);
  for (const c of t.data?.children || []) {
    const d = new Date(c.data.created_utc * 1000).toISOString().slice(0, 10);
    dayCount[d] = (dayCount[d] || 0) + 1;
  }
}
for (const [d, c] of Object.entries(dayCount).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12)) {
  console.log(`  ${d}  ${'█'.repeat(Math.min(c, 45))} ${c}`);
}
