import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function head(url) {
  try {
    const r = await fetch(url, {
      headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.8' },
      redirect: 'follow',
    });
    const html = await r.text();
    return { status: r.status, finalUrl: r.url, html };
  } catch (e) {
    return { status: 'ERR', finalUrl: url, html: '', err: e.message };
  }
}

function extract(html) {
  const cid =
    html.match(/"externalId":"(UC[\w-]{20,})"/)?.[1] ||
    html.match(/"browseId":"(UC[\w-]{20,})"/)?.[1] ||
    html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1] ||
    html.match(/\/channel\/(UC[\w-]{20,})/)?.[1] ||
    null;
  const name =
    html.match(/"channelMetadataRenderer":\{"title":"([^"]*)"/)?.[1] ||
    html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ||
    html.match(/<title>([^<]*?)\s*-\s*YouTube<\/title>/)?.[1] ||
    null;
  const subs =
    html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/)?.[1] ||
    html.match(/"subscriberCountText":\{"runs":\[\{"text":"([^"]+)"/)?.[1] ||
    null;
  const vids = [];
  const seen = new Set();
  for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,500}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    let t; try { t = JSON.parse('"' + m[2] + '"'); } catch { t = m[2]; }
    vids.push({ id: m[1], title: t });
  }
  return { cid, name, subs, vids };
}

const URLFORMS = [
  (n) => `https://www.youtube.com/c/${encodeURIComponent(n)}`,
  (n) => `https://www.youtube.com/user/${encodeURIComponent(n)}`,
  (n) => `https://www.youtube.com/@${encodeURIComponent(n)}`,
  (n) => `https://www.youtube.com/@${encodeURIComponent(n)}/videos`,
];

for (const name of ['dmpklab', 'dmpk lab', 'dmpk_lab', '세라브랑', 'serabrang']) {
  console.log(`\n===== "${name}" =====`);
  for (const mk of URLFORMS) {
    const u = mk(name);
    const r = await head(u);
    if (r.status !== 200) { console.log(`  ${r.status}  ${u}`); continue; }
    const e = extract(r.html);
    if (e.cid || (e.name && !/does not exist/i.test(e.name))) {
      console.log(`  ✔ ${u}`);
      console.log(`     → 최종: ${r.finalUrl}`);
      console.log(`     name=${e.name} | cid=${e.cid} | 구독자=${e.subs}`);
      for (const v of e.vids.slice(0, 8)) console.log(`       ${v.id} | ${v.title.slice(0, 62)}`);
      break;
    }
  }
}
