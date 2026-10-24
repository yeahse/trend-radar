/**
 * 시크릿 누출 검증.
 * 1) redact() 함수 자체가 알려진 시크릿 패턴을 모두 가리는지
 * 2) 실제 일일 리포트/CSV 에 평문 키가 남아있지 않은지
 */
import fs from 'node:fs';
import path from 'node:path';
import { redact } from '../src/util.mjs';

const root = path.resolve(process.cwd());
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));

const secrets = [
  cfg.youtube?.apiKey,
  cfg.discord?.webhookUrl,
  cfg.discord?.globalWebhookUrl,
  cfg.telegram?.botToken,
  cfg.reddit?.clientId,
  cfg.reddit?.clientSecret,
].filter(Boolean);

let fail = 0;
const t = (name, ok) => {
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) fail++;
};

console.log('=== [1] redact() 동작 검증 ===');
const samples = [
  `HTTP 429 https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&key=${cfg.youtube?.apiKey}`,
  `https://www.googleapis.com/youtube/v3/search?type=video&order=date&maxResults=50&regionCode=US&key=${cfg.youtube?.apiKey}`,
  `POST 실패: ${cfg.discord?.webhookUrl}`,
  `Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IlNIQTI1NjpzS3dsMnlsV0VtMjVmcXhwTU40cWY4MXE2OWFFdWFyMnpLMUdhVGxjdWNZIiwidHlwIjoiSldUIn0.eyJpc3MiOiJodHRwczovL3d3dy5yZWRkaXQuY29tIn0.abcdefghijklmnop`,
  `client_secret=${cfg.reddit?.clientSecret}`,
  `api_key=${cfg.youtube?.apiKey}`,
];
for (const s of samples) {
  const out = redact(s);
  const leaked = secrets.filter((sec) => sec && out.includes(sec));
  t(`마스킹: ${s.slice(0, 62)}...`, leaked.length === 0);
  if (leaked.length) console.log(`      남은 시크릿: ${leaked.map((x) => x.slice(0, 12) + '…').join(', ')}`);
}

console.log('\n=== [2] 산출물에 평문 시크릿 없는지 ===');
const outDir = path.join(root, 'reports');
const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter((f) => f.endsWith('.md')) : [];
for (const f of files) {
  const text = fs.readFileSync(path.join(outDir, f), 'utf8');
  const leaked = secrets.filter((sec) => text.includes(sec));
  t(`reports/${f}`, leaked.length === 0);
  if (leaked.length) console.log(`      누출: ${leaked.map((x) => x.slice(0, 12) + '…').join(', ')}`);
}

const csvFiles = fs.existsSync(path.join(root, 'data'))
  ? fs.readdirSync(path.join(root, 'data')).filter((f) => f.endsWith('.csv'))
  : [];
for (const f of csvFiles) {
  const text = fs.readFileSync(path.join(root, 'data', f), 'utf8');
  const leaked = secrets.filter((sec) => text.includes(sec));
  t(`data/${f}`, leaked.length === 0);
}

console.log(`\n=== 결과: ${fail === 0 ? '전부 통과' : fail + '건 실패'} ===`);
process.exit(fail === 0 ? 0 : 1);
