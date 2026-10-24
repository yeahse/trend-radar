import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const p = path.join(os.homedir(), '.devvit', 'token');
const raw = fs.readFileSync(p, 'utf8').trim();
let obj = null;
try { obj = JSON.parse(raw); } catch { /* ignore */ }
const envelope = obj?.token || raw;

let inner = null;
try { inner = JSON.parse(Buffer.from(envelope, 'base64').toString('utf8')); } catch (e) { console.log('base64 decode failed: ' + e.message); }
if (!inner) { console.log('inner decode failed'); process.exit(1); }
console.log('INNER_KEYS=' + Object.keys(inner).join(','));
for (const [k, v] of Object.entries(inner)) {
  const s = String(v);
  console.log(`  ${k}: len=${s.length} head=${s.slice(0, 10)}`);
}

const candidates = [];
if (inner.access_token) candidates.push(['inner.access_token', inner.access_token]);
if (inner.accessToken) candidates.push(['inner.accessToken', inner.accessToken]);
if (inner.token) candidates.push(['inner.token', inner.token]);
if (inner.refresh_token) candidates.push(['inner.refresh_token', inner.refresh_token]);

const UA = 'script:com.trendradar.devtest:v1.0.0 (by /u/Hot_Information126t8)';

for (const [label, tok] of candidates) {
  for (const bearer of [`bearer ${tok}`, `Bearer ${tok}`, tok]) {
    const res = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: { Authorization: bearer, 'User-Agent': UA },
    });
    const body = await res.text();
    let who = '';
    try { const j = JSON.parse(body); who = j.name ? ' user=' + j.name : ' err=' + String(j.error || j.message || '').slice(0, 80); } catch { who = body.replace(/\s+/g, ' ').slice(0, 90); }
    console.log(`[${res.status}] ${label} :: ${bearer.slice(0, 12)}... :: ${who}`);
    if (res.status === 200) break;
  }
}
