/**
 * 공개 저장소(staging) 증분 동기화.
 * ⚠️ .git 은 절대 건드리지 않는다 (기존 _stage_public_repo.mjs 는 rm -rf 로 .git 까지 지운다).
 *
 * 포함: src/ docs/ tools/ README.md package.json config.example.json
 * 제외: config.json(시크릿), data/ logs/ reports/, 토큰 일부를 출력하는 진단 스크립트
 */
import fs from 'node:fs';
import path from 'node:path';

const src = 'C:\\Users\\ue-agent\\Documents\\기본 프로젝트\\trend-radar';
const stage = 'C:\\Users\\ue-agent\\Documents\\GitHub\\trend-radar';

// 토큰 조각을 출력하는 진단용 스크립트만 제외 (동작에는 불필요)
const TOOL_EXCLUDE = new Set(['diag_devvit_token.mjs', 'test_devvit_token.mjs']);

function copyDir(from, to, skipName) {
  fs.mkdirSync(to, { recursive: true });
  const keep = new Set();
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skipName && skipName(e.name)) continue;
    const s = path.join(from, e.name);
    const d = path.join(to, e.name);
    keep.add(e.name);
    if (e.isDirectory()) copyDir(s, d, skipName);
    else fs.copyFileSync(s, d);
  }
  // 원본에 없는 파일은 제거 (stale 제거) — 단 .git 은 건드리지 않는다
  if (path.basename(to) !== '.git') {
    for (const e of fs.readdirSync(to, { withFileTypes: true })) {
      if (keep.has(e.name)) continue;
      const d = path.join(to, e.name);
      fs.rmSync(d, { recursive: true, force: true });
      console.log('  제거(stale):', path.relative(stage, d));
    }
  }
}

function copyFile(rel) {
  const s = path.join(src, rel);
  const d = path.join(stage, rel);
  if (!fs.existsSync(s)) return;
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
}

copyDir(path.join(src, 'src'), path.join(stage, 'src'));
copyDir(path.join(src, 'docs'), path.join(stage, 'docs'));
copyDir(path.join(src, 'tools'), path.join(stage, 'tools'), (n) => TOOL_EXCLUDE.has(n));
copyFile('README.md');
copyFile('package.json');

// config.json → config.example.json (시크릿 제거)
const cfg = JSON.parse(fs.readFileSync(path.join(src, 'config.json'), 'utf8'));
const SECRET_KEY = /^(apiKey|clientId|clientSecret|webhookUrl|globalWebhookUrl|botToken|chatId|username|password|token)$/i;
for (const block of Object.values(cfg)) {
  if (!block || typeof block !== 'object') continue;
  for (const k of Object.keys(block)) {
    if (SECRET_KEY.test(k)) block[k] = '';
  }
}
fs.writeFileSync(path.join(stage, 'config.example.json'), JSON.stringify(cfg, null, 2), 'utf8');

fs.writeFileSync(
  path.join(stage, '.gitignore'),
  ['config.json', 'data/', 'logs/', 'node_modules/', '*.log', 'reports/', '!reports/.gitkeep'].join('\n'),
  'utf8'
);

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(stage, p));
  }
})(stage);
console.log('스테이징 동기화 완료 | 파일 수:', files.length);
console.log('신규/변경 가능 파일:');
for (const f of ['src/reddit_auth.mjs', 'src/sources/reddit.mjs', 'src/run.mjs', 'docs/06_Reddit_접근_현황.md', 'config.example.json']) {
  console.log(' ', f, fs.existsSync(path.join(stage, f)) ? 'OK' : 'MISSING');
}
