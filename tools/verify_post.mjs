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

const PID = '1xe5th2';
const p = await j(`https://oauth.reddit.com/api/info?id=t3_${PID}&raw_json=1`);
const post = p.data?.children?.[0]?.data;
if (!post) { console.log('게시물 조회 실패:', JSON.stringify(p).slice(0, 300)); process.exit(1); }

console.log('=== 게시된 포스트 검증 ===');
console.log('  id       :', post.name);
console.log('  제목     :', post.title);
console.log('  subreddit:', 'r/' + post.subreddit);
console.log('  url      :', post.url);
console.log('  author   : u/' + post.author);
console.log('  점수/댓글:', post.score, '/', post.num_comments);
console.log('  생성     :', new Date(post.created_utc * 1000).toISOString());
console.log('  flair    :', post.link_flair_text || '(없음)');
console.log('  selftext :', post.selftext ? `(본문 ${post.selftext.length}자)` : '(없음)');
console.log('  제거됨   :', post.removed_by_category ? '제거됨(' + post.removed_by_category + ')' : '아님');
console.log('  num_reports:', post.num_reports);
console.log('  upvote_ratio:', post.upvote_ratio);
console.log('  over_18   :', post.over_18);
console.log('  spoiler   :', post.spoiler);
console.log('  stickied  :', post.stickied, '| locked:', post.locked);

// r/mAIfoid new 피드에 실제로 보이는지 (AutoMod 필터 통과 확인)
console.log('\n=== r/mAIfoid 신규 피드 노출 확인 ===');
const feed = await j('https://oauth.reddit.com/r/mAIfoid/new?limit=20&raw_json=1');
const items = feed.data?.children || [];
const idx = items.findIndex((c) => c.data.id === PID);
console.log(`  신규 피드 ${items.length}건 중 위치: ${idx >= 0 ? idx + 1 : '없음'}`);
for (const c of items.slice(0, 6)) {
  console.log(`   [${c.data.score}] ${String(c.data.title).slice(0, 58)} — ${String(c.data.url || '').slice(0, 55)}`);
}

// r/mAIfoid top (hour/day)
for (const w of ['hour', 'day']) {
  const t = await j(`https://oauth.reddit.com/r/mAIfoid/top?t=${w}&limit=25&raw_json=1`);
  const found = (t.data?.children || []).find((c) => c.data.id === PID);
  console.log(`  top(${w}): ${found ? '포함됨 (순위 ' + ((t.data.children).findIndex((c) => c.data.id === PID) + 1) + ', 점수 ' + found.data.score + ')' : '미포함'}`);
}
