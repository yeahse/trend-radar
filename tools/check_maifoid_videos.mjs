import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 영상 페이지에서 채널/제목/조회수 추출 (API 쿼터 무관) */
async function videoInfo(vid) {
  const res = await fetch(`https://www.youtube.com/watch?v=${vid}`, {
    headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' },
  });
  const html = await res.text();
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] || null;
  const chan = html.match(/"ownerChannelName":"([^"]*)"/)?.[1] || null;
  const chanId = html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1] || null;
  const handle = html.match(/"canonicalBaseUrl":"\/([^"]+)"/)?.[1] || null;
  const views = html.match(/"viewCount":"(\d+)"/)?.[1] || null;
  const date = html.match(/"uploadDate":"([^"]+)"/)?.[1] || null;
  const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1] || null;
  return { vid, title, chan, chanId, handle, views, date, desc: desc ? desc.slice(0, 160).replace(/\\n/g, ' ') : null };
}

// ① r/mAIfoid 에서 수집한 yt 링크들 + 사용자 채널에서 추정된 링크들
const VIDS = ['f9m1SwSe1nE', 'YO_oGTFUvgg'];

console.log('=== ① r/mAIfoid yt 링크 실체 확인 ===');
for (const v of VIDS) {
  const i = await videoInfo(v);
  console.log(`\n  https://youtu.be/${v}`);
  console.log(`    제목  : ${i.title}`);
  console.log(`    채널  : ${i.chan} (${i.chanId || '-'} / ${i.handle ? '@' + i.handle : '-'})`);
  console.log(`    조회수: ${i.views} | ${i.date}`);
  console.log(`    설명  : ${i.desc}`);
}

// ② 사용자 채널 검색 (youtube 검색 페이지 스크레이핑 — API 무관)
console.log('\n\n=== ② 사용자 채널 탐색 (youtube 검색 페이지) ===');
async function searchYT(q) {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, {
    headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' },
  });
  const html = await res.text();
  const chans = new Map();
  for (const m of html.matchAll(/"channelRenderer":\{"channelId":"(UC[\w-]{20,})"[\s\S]{0,600}?"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/g)) {
    let t; try { t = JSON.parse('"' + m[2] + '"'); } catch { t = m[2]; }
    chans.set(m[1], t);
  }
  const subs = new Map();
  for (const m of html.matchAll(/"channelRenderer":\{"channelId":"(UC[\w-]{20,})"[\s\S]{0,900}?"subscriberCountText":\{"simpleText":"([^"]+)"/g)) subs.set(m[1], m[2]);
  const vids = new Map();
  for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,400}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    let t; try { t = JSON.parse('"' + m[2] + '"'); } catch { t = m[2]; }
    vids.set(m[1], t);
  }
  return { chans: [...chans.entries()], subs, vids: [...vids.entries()] };
}

for (const q of ['dmpklab', '세라브랑', 'serave.1', 'dmpk lab']) {
  const r = await searchYT(q);
  console.log(`\n  "${q}" → 채널 ${r.chans.length}개, 영상 ${r.vids.length}개`);
  for (const [id, t] of r.chans.slice(0, 5)) console.log(`     CH ${id} | ${t} | ${r.subs.get(id) || ''}`);
  for (const [id, t] of r.vids.slice(0, 6)) console.log(`     VD ${id} | ${t.slice(0, 60)}`);
}
