/** Startup 폴더에 올바른(ASCII/CRLF) 런처 배포 + 프로젝트 자체 start_daemon.cmd 정규화 */
import fs from 'node:fs';
import path from 'node:path';

const LOCAL = path.join(process.env.LOCALAPPDATA, 'TrendRadar', 'TrendRadar.cmd');
const STARTUP = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'TrendRadar.cmd');
const PROJ_CMD = 'C:\\Users\\ue-agent\\Documents\\기본 프로젝트\\trend-radar\\tools\\start_daemon.cmd';

const ascii = (t) => {
  let raw = fs.readFileSync(t, 'utf8').replace(/^\uFEFF/, '');
  raw = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/[^\x00-\x7F]/g, '');
  fs.writeFileSync(t, raw, 'ascii');
  return raw.length;
};

// 1) 정본(LOCAL)을 Startup 으로 배포
const body = fs.readFileSync(LOCAL);
fs.writeFileSync(STARTUP, body);
console.log('Startup 배포 OK:', STARTUP, fs.statSync(STARTUP).size, 'bytes');

// 2) 프로젝트 자체 start_daemon.cmd 도 정규화
if (fs.existsSync(PROJ_CMD)) {
  const n = ascii(PROJ_CMD);
  console.log('프로젝트 start_daemon.cmd 정규화 OK:', n, 'bytes');
}

// 3) 배포본 검증
const t = fs.readFileSync(STARTUP, 'utf8');
console.log('\n--- Startup 런처 내용 ---');
console.log(t);
console.log('비ASCII:', (t.match(/[^\x00-\x7F]/g) || []).length, '| CRLF:', (t.match(/\r\n/g) || []).length, '| BOM:', t.charCodeAt(0) === 0xFEFF);
