import fs from 'node:fs';
import path from 'node:path';

const src = 'C:\\Users\\ue-agent\\Documents\\기본 프로젝트\\trend-radar';
const stage = 'C:\\Users\\ue-agent\\Documents\\GitHub\\trend-radar';

fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
function copyFile(from, to) {
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
}

for (const dir of ['src', 'docs', 'tools']) copyDir(path.join(src, dir), path.join(stage, dir));
copyFile(path.join(src, 'README.md'), path.join(stage, 'README.md'));
copyFile(path.join(src, 'package.json'), path.join(stage, 'package.json'));

// config.json 은 API키·웹훅 포함 → 제외하고 예시만 생성
const cfg = JSON.parse(fs.readFileSync(path.join(src, 'config.json'), 'utf8'));
for (const k of ['clientId', 'clientSecret', 'apiKey', 'webhookUrl', 'botToken', 'chatId', 'client_id', 'client_secret', 'api_key', 'webhook_url', 'username']) {
  if (cfg.reddit) for (const kk of Object.keys(cfg.reddit)) if (/client|secret|user/i.test(kk)) cfg.reddit[kk] = '';
  if (cfg.youtube) cfg.youtube.apiKey = '';
  if (cfg.discord) cfg.discord.webhookUrl = '';
  if (cfg.telegram) { cfg.telegram.botToken = ''; cfg.telegram.chatId = ''; }
}
fs.writeFileSync(path.join(stage, 'config.example.json'), JSON.stringify(cfg, null, 2), 'utf8');
fs.writeFileSync(
  path.join(stage, '.gitignore'),
  ['config.json', 'data/', 'logs/', 'node_modules/', '*.log', 'reports/', '!reports/.gitkeep'].join('\n'),
  'utf8'
);

const count = fs.readdirSync(stage, { recursive: true }).filter((f) => fs.statSync(path.join(stage, f)).isFile()).length;
console.log('스테이징 완료:', stage, '| 파일 수:', count);
console.log('최상위:', fs.readdirSync(stage).join(', '));
