/**
 * .cmd 파일 정규화: 순수 ASCII + CRLF + BOM 없음.
 * 이유: cmd.exe 는 .cmd 를 OEM 코어페이지(cp949)로 읽는다.
 *   UTF-8 한글/박스문자가 하나라도 있으면 이후 줄이 깨져서
 *   "start "" /min" 이 "n" 으로 잘리고 명령이 조용히 실패한다.
 *   → 2026-10-24 ~ 11-03 동안 데몬이 10일째 안 떠난 원인.
 *
 * 사용: node tools\fix_cmd_encoding.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const TARGETS = [
  path.join(ROOT, 'tools', 'start_daemon.cmd'),
  path.join(process.env.LOCALAPPDATA || '', 'TrendRadar', 'TrendRadar.cmd'),
  path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'TrendRadar.cmd'),
];

for (const t of TARGETS) {
  if (!fs.existsSync(t)) { console.log('SKIP (없음):', t); continue; }
  let raw = fs.readFileSync(t, 'utf8');
  // BOM 제거
  raw = raw.replace(/^\uFEFF/, '');
  // CRLF 정규화
  raw = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  // 비-ASCII 문자 → 제거 (주석용 한글은 사라져도 기능에 영향 없음)
  const nonAscii = raw.match(/[^\x00-\x7F]/g) || [];
  raw = raw.replace(/[^\x00-\x7F]/g, '');
  fs.writeFileSync(t, raw, 'ascii');
  console.log(`OK  ${t}`);
  console.log(`    ${raw.length} bytes, CRLF, 비ASCII ${nonAscii.length}자 제거`);
}
