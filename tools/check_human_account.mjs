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

for (const name of ['ahuuu135', 'Hot_Information126t8']) {
  const about = await j(`https://oauth.reddit.com/api/v1/user/${name}/about?raw_json=1`);
  if (about.__status) { console.log(`${name}: ${about.__status}`); continue; }
  const d = about.data || {};
  console.log(`\n=== ${name} ===`);
  console.log('  생성      :', new Date((d.created_utc || 0) * 1000).toISOString().slice(0, 10), `(${(d.created_utc ? Math.round((Date.now() - d.created_utc * 1000) / 86400000) : '?')}일 전)`);
  console.log('  카르마    :', d.link_karma, '| 코멘트 카르마:', d.comment_karma);
  console.log('  Link ID   :', d.id, '| verified:', d.verified);
  console.log('  서브레딧  :', (d.subreddit?.display_name || '-') || '(없음)');
  console.log('  모더레이터:', (d.subreddit?.moderator_of || []).join(', ') || '-');
  console.log('  is_gold   :', d.is_gold, '| awardee_karma:', d.awardee_karma, '| awarder_karma:', d.awarder_karma);
  console.log('  total_karma:', d.total_karma);
  // 최근 활동
  const posts = await j(`https://oauth.reddit.com/user/${name}/submitted?limit=5&raw_json=1`);
  const items = posts.data?.children || [];
  console.log('  최근 게시물:', items.length, '건');
  for (const c of items) console.log(`     [${c.data.score}] ${String(c.data.title).slice(0, 60)} (r/${c.data.subreddit})`);
  const comments = await j(`https://oauth.reddit.com/user/${name}/comments?limit=5&raw_json=1`);
  console.log('  최근 댓글  :', (comments.data?.children || []).length, '건');
}
