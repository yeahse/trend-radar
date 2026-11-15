import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(path.resolve(HERE, '..'), 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;
const UP = 'UU8O3X1yDZli1f3Uc5RdJO5g';

const pi = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${UP}&maxResults=10&key=${KEY}`, { headers: { 'user-agent': 't/1.0' } })).json();
const ids = (pi.items || []).map((i) => i.contentDetails?.videoId || i.snippet?.resourceId?.videoId).filter(Boolean);
console.log('ids:', ids.length, ids.slice(0, 3).join(','));

for (const part of ['statistics', 'snippet,statistics']) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=${part}&id=${ids.join(',')}&key=${KEY}`, { headers: { 'user-agent': 't/1.0' } });
  const t = await r.text();
  console.log(`\npart=${part} -> HTTP ${r.status}`);
  console.log('  ', t.slice(0, 400));
}
