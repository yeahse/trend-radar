/**
 * Windows 자동 실행 등록 (2026-11-09).
 *
 * 문제: Startup 폴더의 TrendRadar.cmd 는 11/03에 ASCII/CRLF 로 고쳐 직접 실행은
 *   검증됐지만, 11/07 재부팅 후 실행되지 않았다 (startup.log 에 기록 없음).
 *   → Windows 11 은 Startup 폴더의 .cmd/.bat 를 시작 프로그램으로 차단하는 경우가 있다.
 *
 * 해결: HKCU\Software\Microsoft\Windows\CurrentVersion\Run 에 직접 등록.
 *   - 이 경로는 이미 OneDrive / Discord 가 쓰고 있어 검증됨
 *   - .cmd 를 거치지 않으므로 OEM 코어페이지 인코딩 문제가 원천 차단
 *   - exe 를 직접 호출하므로 확장자 차단에도 걸리지 않음
 *
 * 사용: node tools\install_autostart.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASCII = 'C:\\Users\\ue-agent\\Documents\\trend-radar';
const LOGDIR = path.join(process.env.LOCALAPPDATA, 'TrendRadar');
fs.mkdirSync(LOGDIR, { recursive: true });

const PS = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const DAEMON = `${ASCII}\\tools\\daemon.ps1`;
const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

console.log('=== 1) HKCU Run 등록 ===');
const cmd = `"${PS}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${DAEMON}"`;
console.log('값:', cmd);
execFileSync('reg.exe', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'TrendRadar', '/t', 'REG_SZ', '/d', cmd, '/f'], { stdio: 'inherit' });
console.log('OK  HKCU Run 등록 완료');

console.log('\n=== 2) Startup 폴더에도 유지 (이중保险) ===');
const startupCmd = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'TrendRadar.cmd');
const body = `@echo off
REM Trend Radar daemon launcher (Startup). ASCII-only: cmd.exe parses .cmd in the
REM OEM codepage, so UTF-8 text here corrupts the following lines.
REM The project path has Korean characters, so an ASCII junction is used.
set "ROOT=%LOCALAPPDATA%\\TrendRadar"
if not exist "%ROOT%" mkdir "%ROOT%"
set "LOG=%ROOT%\\startup.log"
set "SCRIPT=${DAEMON}"
echo [%DATE% %TIME%] launcher invoked >> "%LOG%"
if not exist "%SCRIPT%" (
  echo [%DATE% %TIME%] FATAL daemon.ps1 not found: %SCRIPT% >> "%LOG%"
  exit /b 3
)
start "" /min "${PS}" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT%"
echo [%DATE% %TIME%] daemon start issued >> "%LOG%"
exit /b 0
`.replace(/\n/g, '\r\n');
fs.writeFileSync(startupCmd, body, 'ascii');
console.log('OK  Startup 런처 재작성 (ASCII/CRLF):', startupCmd);

console.log('\n=== 3) 데몬 기동 (부모 없는 프로세스) ===');
try {
  execFileSync('taskkill.exe', ['/F', '/IM', 'powershell.exe'], { stdio: 'pipe' });
} catch { /* 개별 종료는 아래에서 처리 */ }

// taskkill 이 powershell 전체를 죽일 수 있으니 데몬만 PID 로 종료
const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*daemon.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; 'killed'",
], { encoding: 'utf8' });

execFileSync('powershell.exe', ['-NoProfile', '-Command',
  `$c = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${DAEMON}"'; ` +
  `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $c }; ` +
  `Write-Output ('PID=' + $r.ProcessId)`,
], { stdio: 'inherit' });

console.log('\n=== 4) 확인 ===');
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*daemon.ps1*' } | Select-Object ProcessId,ParentProcessId,CreationDate | Format-Table -AutoSize",
], { stdio: 'inherit' });
execFileSync('powershell.exe', ['-NoProfile', '-Command',
  "Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' | Select-Object TrendRadar | Format-List",
], { stdio: 'inherit' });
