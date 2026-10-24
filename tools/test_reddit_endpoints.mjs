import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const p = path.join(os.homedir(), '.devvit', 'token');
const raw = fs.readFileSync(p, 'utf8').trim();
let obj = null; try { obj = JSON.parse(raw); } catch {}
const inner = JSON.parse(Buffer.from(obj?.token || raw, 'base64').toString('utf8'));

const UA = 'script:com.trendradar.devtest:v1.0.0 (by /u/Hot_Information126t8)';
const tok = inner.accessToken;
const expiresAt = Number(inner.expiresAt);
console.log('expiresAt=' + new Date(expiresAt * 1000).toISOString() + ' now=' + new Date().toISOString() + ' 남은분=' + Math.round((expiresAt - Date.now() / 1000) / 60));

async function probe(label, url) {
  const res = await fetch(url, { headers: { Authorization: `bearer ${tok}`, 'User-Agent': UA, Accept: 'application/json' } });
  const body = await res.text();
  let note = '';
  try {
    const j = JSON.parse(body);
    const d = j.data;
    if (Array.isArray(d)) note = `items=${d.length}`;
    else if (d && typeof d === 'object') note = `keys=${Object.keys(d).slice(0, 5).join(',')}`;
    else if (Array.isArray(j.children)) note = `children=${j.children.length}`;
    else note = body.replace(/\s+/g, ' ').slice(0, 100);
  } catch { note = body.replace(/\s+/g, ' ').slice(0, 100); }
  console.log(`[${res.status}] ${label} :: ${note}`);
  return res.status;
}

console.log('--- 필요한 엔드포인트 ---');
await probe('GET /r/popular/top', 'https://oauth.reddit.com/r/popular/top?t=day&limit=5');
await probe('GET /r/HarryPotter/top', 'https://oauth.reddit.com/r/HarryPotter/top?t=week&limit=5');
await probe('GET /search (female draco)', 'https://oauth.reddit.com/search?q=%22female%20draco%22&sort=new&t=month&limit=5');
await probe('GET /search (malfoid)', 'https://oauth.reddit.com/search?q=malfoid&sort=relevance&t=year&limit=5');
await probe('GET /subreddits/mine', 'https://oauth.reddit.com/subreddits/mine?limit=5');
await probe('GET /r/MALfoid/top', 'https://oauth.reddit.com/r/MALfoid/top?t=month&limit=5');

console.log('--- refresh_token 갱신 테스트 ---');
const DEV_CLIENT = 'Bep8X2RRjuoyuxkKsKxFuQ';
const r1 = await fetch('https://www.reddit.com/api/v1/access_token', {
  method: 'POST',
  headers: { Authorization: `Basic ${Buffer.from(DEV_CLIENT + ':').toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
  body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: inner.refreshToken }),
});
const b1 = await r1.text();
console.log('[refresh basic-client] ' + r1.status + ' :: ' + b1.replace(/\s+/g, ' ').slice(0, 300));

if (r1.status === 200) {
  const j = JSON.parse(b1);
  const nt = j.access_token;
  const r2 = await fetch('https://oauth.reddit.com/api/v1/me', { headers: { Authorization: `bearer ${nt}`, 'User-Agent': UA } });
  const b2 = await r2.text();
  console.log('[refresh -> /me] ' + r2.status + ' :: ' + b2.replace(/\s+/g, ' ').slice(0, 120));
}
