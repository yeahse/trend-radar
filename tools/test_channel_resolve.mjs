import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(path.resolve(HERE, '..'), 'config.json'), 'utf8'));
const KEY = cfg.youtube.apiKey;
async function t(label, q) {
  const r = await fetch(`https://www.googleapis.com/youtube/v3/${q}`, { headers: { 'user-agent': 'trend-radar/1.0' } });
  const x = await r.text();
  let j; try { j = JSON.parse(x); } catch { console.log(label, '->', x.slice(0, 120)); return; }
  if (j.error) { console.log(label, '-> ERR', j.error.code, j.error.message.slice(0, 90)); return; }
  console.log(label, '->', (j.items || []).map((i) => `${i.id}:${i.snippet.title}[${i.contentDetails?.relatedPlaylists?.uploads || '-'}]`).join(' , ') || '(0건)');
}
await t('forHandle @serave.1 ', `channels?part=snippet,contentDetails&forHandle=${encodeURIComponent('@serave.1')}&key=${KEY}`);
await t('forHandle serave.1  ', `channels?part=snippet,contentDetails&forHandle=${encodeURIComponent('serave.1')}&key=${KEY}`);
await t('forUsername serave.1', `channels?part=snippet,contentDetails&forUsername=serave.1&key=${KEY}`);
await t('search serave.1      ', `search?part=snippet&type=channel&q=serave.1&maxResults=5&key=${KEY}`);
await t('search dmpklab       ', `search?part=snippet&type=channel&q=dmpklab&maxResults=5&key=${KEY}`);
