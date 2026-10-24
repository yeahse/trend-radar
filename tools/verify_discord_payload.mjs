/**
 * Discord 브리핑 페이로드 검증.
 * postDiscord() 을 가짜 fetch 로 호출해서 실제 전송되는 embed 를 캡처한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { postDiscord } from '../src/report.mjs';

const root = path.resolve(process.cwd());
const date = fs.readdirSync(path.join(root, 'reports')).find((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))?.replace('.md', '');
const snapshotLines = fs.readFileSync(path.join(root, 'data', 'snapshot.jsonl'), 'utf8').trim().split('\n');
const snapshot = JSON.parse(snapshotLines[snapshotLines.length - 1]);

// globalAll = 스냅샷의 global.top 을 그대로 사용 (report.mjs 와 동일한 폴백 경로)
const globalAll = snapshot.global?.top || [];

const captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('discord.com/api/webhooks')) {
    captured.push(JSON.parse(opts.body));
    return { ok: true, status: 204, json: async () => ({}), text: async () => '' };
  }
  return realFetch(url, opts);
};

await postDiscord(snapshot, 'https://discord.com/api/webhooks/0/fake', '', globalAll);
globalThis.fetch = realFetch;

console.log(`전송 메시지 ${captured.length}건`);
let msg = 0;
for (const m of captured) {
  msg++;
  console.log(`\n===== 메시지 ${msg} (embed ${m.embeds.length}개) =====`);
  for (const e of m.embeds) {
    console.log(`  ▸ ${e.title}`);
    const chars = JSON.stringify(e).length;
    if (chars > 6000) console.log(`    ⚠️ 6000자 초과: ${chars}`);
    for (const f of (e.fields || []).slice(0, 20)) {
      const v = String(f.value || '');
      const lines = v.split('\n').length;
      const flag = v.length > 1024 ? ' ⚠️필드 1024자 초과' : '';
      console.log(`      [${f.name}] ${lines}줄${flag}`);
      if (lines > 1) console.log(`         첫줄: ${v.split('\n')[0].slice(0, 70)}`);
    }
  }
}

// 국가별 YT embed 에서 실제 항목 수 확인
const ytEmbed = captured.flatMap((m) => m.embeds).find((e) => /국가별 지금 뜨는 것/.test(e.title || ''));
if (ytEmbed) {
  console.log('\n=== 국가별 YT 속도 TOP 항목 수 ===');
  const counts = {};
  for (const f of ytEmbed.fields || []) {
    counts[f.name] = String(f.value || '').split('\n').filter(Boolean).length;
  }
  console.log(JSON.stringify(counts));
  console.log('제목:', ytEmbed.title);
  console.log('샘플 필드:\n' + (ytEmbed.fields?.[0]?.value || ''));
}
