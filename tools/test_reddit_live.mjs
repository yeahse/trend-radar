import fs from 'node:fs';
import path from 'node:path';
import { collectReddit } from '../src/sources/reddit.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));

const t0 = Date.now();
const rd = await collectReddit(cfg, {
  subs: ['MALfoid', 'HarryPotter'],
  queries: ['"female draco"'],
});
console.log(`authMode=${rd.authMode}  items=${rd.items.length}  ${Date.now() - t0}ms`);
console.log('errors=', JSON.stringify(rd.errors, null, 1));
console.log('--- 샘플 5건 ---');
for (const it of rd.items.slice(0, 5)) {
  console.log(`[${it.source}] ${String(it.title).slice(0, 80)} | score=${it.score} c=${it.comments} | ${it.link}`);
}
const bySrc = {};
for (const it of rd.items) bySrc[it.source] = (bySrc[it.source] || 0) + 1;
console.log('--- 소스 분포 ---');
console.log(JSON.stringify(bySrc, null, 1));
