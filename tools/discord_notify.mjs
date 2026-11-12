/**
 * Discord 알림 테스트 (수동 트리거).
 * -t "제목"   : 커스텀 제목
 * 기본        : 오늘자 상태 요약
 *
 * 사용: node tools\discord_notify.mjs ["제목"]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const hook = cfg.discord?.webhookUrl;

if (!hook) {
  console.error('discord.webhookUrl 이 config.json 에 없다');
  process.exit(1);
}

const custom = process.argv[2] || null;

// 오늘 리포트/디코 파일 존재 여부로 간단한 상태 요약 만들기
const reportsDir = path.join(root, 'reports');
const files = fs.existsSync(reportsDir) ? fs.readdirSync(reportsDir) : [];
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const hasToday = files.includes(`${today}.md`);
const hasDecode = files.includes(`yt_decode_${today}.md`);
const lastReport = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().pop();

const embeds = [
  {
    title: custom || `📡 Trend Radar 알림 (수동 테스트) — ${today}`,
    color: 0x9b59b6,
    fields: [
      { name: '오늘 리포트', value: hasToday ? '✅ 생성됨' : `❌ 없음 (마지막: ${lastReport || '-'})`, inline: true },
      { name: '오늘 YouTube 디코', value: hasDecode ? '✅ 생성됨' : '❌ 없음', inline: true },
      { name: '알림 시각', value: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC', inline: true },
    ],
    footer: { text: 'trend-radar · Discord 알림 테스트' },
    timestamp: new Date().toISOString(),
  },
];

const res = await fetch(hook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ content: '🟣 테스트 알림', embeds }),
});

console.log(`HTTP ${res.status} ${res.statusText}`);
if (!res.ok) console.log((await res.text()).slice(0, 300));
else console.log('디스코드 알림 발송 완료');
