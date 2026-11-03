import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

const HANDLES = ['dmpklab', 'serave.1', '세라브랑', 'dmpk.lab', 'dmpk_lab', 'dmpklab1'];

/** YouTube 채널 페이지 HTML에서 channelId + 영상 제목 추출 (API 쿼터 무관) */
async function scrapeChannel(handle) {
  const url = `https://www.youtube.com/@${encodeURIComponent(handle)}/videos`;
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8',
    },
  });
  const html = await res.text();
  if (!res.ok) return { ok: false, status: res.status, url };
  const cid = html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1] || null;
  const title =
    html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ||
    html.match(/"channelMetadataRenderer":\{"title":"([^"]*)"/)?.[1] ||
    null;
  // ytInitialData 안의 videoRenderer 제목
  const titles = new Set();
  for (const m of html.matchAll(/"videoRenderer":\{.*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    try { titles.add(JSON.parse('"' + m[1] + '"')); } catch { titles.add(m[1]); }
  }
  for (const m of html.matchAll(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/g)) {
    try { titles.add(JSON.parse('"' + m[1] + '"')); } catch { /* noop */ }
  }
  const subs = html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/)?.[1] || null;
  const vcount = html.match(/"videosCountText":\{"runs":\[\{"text":"([^"]+)"/)?.[1] || null;
  return { ok: true, url, cid, title, subs, vcount, titles: [...titles].filter((t) => t.length > 1).slice(0, 15) };
}

console.log('=== ① YouTube 채널 페이지 직접 스크레이핑 (API 쿼터 무관) ===');
const found = [];
for (const h of HANDLES) {
  const r = await scrapeChannel(h);
  if (!r.ok) { console.log(`  @${h} → HTTP ${r.status}`); continue; }
  console.log(`\n  @${h} → ${r.title || '(제목 없음)'}`);
  console.log(`     channelId=${r.cid || '-'} | 구독자=${r.subs || '-'} | 영상수=${r.vcount || '-'}`);
  if (r.titles.length) console.log(`     제목샘플: ${r.titles.slice(0, 5).map((t) => t.slice(0, 40)).join(' || ')}`);
  if (r.cid) found.push({ handle: h, ...r });
}

console.log('\n=== ② 레딧 검색: 채널명 + 영상제목 ===');
async function rsearch(q, label) {
  const res = await fetch(
    `https://oauth.reddit.com/search?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=8&raw_json=1`,
    { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } }
  );
  const j = await res.json();
  const n = j.data?.children?.length || 0;
  console.log(`\n-- "${q}" (${label}) : ${n}건`);
  for (const c of j.data?.children || []) {
    const d = c.data;
    console.log(`   [${d.score}] r/${d.subreddit} :: ${String(d.title).slice(0, 62)}`);
    console.log(`       ${String(d.url).slice(0, 95)}`);
    console.log(`       https://www.reddit.com${d.permalink}`);
  }
}
for (const f of found) {
  await rsearch(f.handle, '채널명');
  for (const t of f.titles.slice(0, 6)) await rsearch(t, '영상제목');
}
