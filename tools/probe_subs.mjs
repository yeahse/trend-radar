import fs from 'node:fs';
import path from 'node:path';
import { redditAuth } from '../src/reddit_auth.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const auth = await redditAuth(cfg);

const candidates = [
  'genderbent', 'genderbending', 'GenderBending', 'genderbends', 'GenderBent',
  'rule63', 'Rule63', 'AIart', 'AI_Art', 'Animemes', 'animeMemes',
  'dankmemes', 'wholesomeanime', 'CharacterDesign', 'FanFiction',
  'HarryPotter', 'HarryPotterAIArt', 'MALfoid', 'malfoid', 'suddenlymalfoid',
  'femdraco', 'FemaleDraco', 'FemaleDracoMalfoy', 'DracoMalfoy',
  'TransReddit', 'Femslash', 'HPCrossover',
];

const out = [];
for (const s of candidates) {
  const url = `https://oauth.reddit.com/r/${encodeURIComponent(s)}/about?raw_json=1`;
  try {
    const res = await fetch(url, { headers: { authorization: `bearer ${auth.token}`, 'user-agent': auth.ua } });
    if (res.status === 200) {
      const j = await res.json();
      const d = j.data || {};
      out.push({ sub: s, ok: true, subs: d.subscribers ?? 0, title: (d.title || '').slice(0, 40) });
    } else {
      out.push({ sub: s, ok: false, status: res.status });
    }
  } catch (e) {
    out.push({ sub: s, ok: false, err: e.message });
  }
  await new Promise((r) => setTimeout(r, 400));
}
console.log('=== 존재하는 서브레딧 ===');
for (const o of out.filter((o) => o.ok)) console.log(`OK  r/${o.sub}  구독자=${o.subs}  ${o.title}`);
console.log('=== 없는 서브레딧 ===');
for (const o of out.filter((o) => !o.ok)) console.log(`NG  r/${o.sub}  ${o.status || o.err}`);
