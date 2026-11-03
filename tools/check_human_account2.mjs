import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

async function j(url) {
  const r = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
  const t = await r.text();
  if (!r.ok) return { __status: r.status, __body: t.slice(0, 120) };
  try { return JSON.parse(t); } catch { return { __body: t.slice(0, 120) }; }
}

for (const name of ['ahuuu135', 'Hot_Information126t8']) {
  const about = await j(`https://oauth.reddit.com/user/${name}/about.json?raw_json=1`);
  if (about.__status) { console.log(`${name}: HTTP ${about.__status} ${about.__body}`); continue; }
  const d = about.data || {};
  console.log(`\n=== ${name} ===`);
  console.log('  생성      :', new Date((d.created_utc || 0) * 1000).toISOString().slice(0, 10));
  console.log('  카르마    :', d.link_karma, '+', d.comment_karma, '| total:', d.total_karma);
  console.log('  is_gold   :', d.is_gold, '| id:', d.id, '| verified:', d.verified);
  console.log('  모더레이터:', (d.subreddit?.moderator_of || []).join(', ') || '-');
  const posts = await j(`https://oauth.reddit.com/user/${name}/submitted.json?limit=6&raw_json=1`);
  const items = posts.data?.children || [];
  console.log(`  최근 게시물 ${items.length}건:`);
  for (const c of items) console.log(`     [${c.data.score}] ${String(c.data.title).slice(0, 58)} (r/${c.data.subreddit}, ${new Date(c.data.created_utc * 1000).toISOString().slice(0, 10)})`);
}
