/**
 * 자동 실행 전부 해제 → 수동 전용 모드 (2026-11-12 사용자 지시).
 *
 * "그냥 내가 부를 때만 오면되는데" → 아래 3개 경로를 모두 제거한다.
 *   1) HKCU\...\Run\TrendRadar          (11/04 등록)
 *   2) Startup 폴더\TrendRadar.cmd      (11/03 등록)
 *   3) Task Scheduler "\TrendRadar Daily" (11/04 등록, Logon 트리거가 실제로 발화함)
 *
 * 그리고 진행 중인 데몬 프로세스를 모두 종료한다.
 * 제거한 Startup.cmd 는 삭제하지 않고 tools\ 에 비활성 사본으로 보관한다.
 *
 * 사용: node tools\disable_autostart.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');

const ps = (cmd) => {
  try {
    return execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
  } catch (e) {
    return `[err] ${String(e.stdout || e.message).slice(0, 160)}`;
  }
};

console.log('=== 1) HKCU Run 값 제거 ===');
console.log(ps("try { Remove-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'TrendRadar' -ErrorAction Stop; 'removed' } catch { 'already absent' }").trim());
console.log('  확인:', ps("(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue).TrendRadar").trim() || '(없음)');

console.log('\n=== 2) Startup 폴더에서 이동 (삭제 아님) ===');
const startup = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'TrendRadar.cmd');
if (fs.existsSync(startup)) {
  const backup = path.join(root, 'tools', '_disabled_startup_TrendRadar.cmd');
  fs.copyFileSync(startup, backup);
  fs.unlinkSync(startup);
  console.log(`  Startup\\TrendRadar.cmd → tools\\_disabled_startup_TrendRadar.cmd (사본 보관)`);
} else {
  console.log('  없음');
}

console.log('\n=== 3) Task Scheduler 태스크 삭제 ===');
console.log(' ', ps("try { schtasks /delete /tn 'TrendRadar Daily' /f | Out-Null; 'deleted' } catch { 'already absent' }").trim());
console.log('  확인:', ps("schtasks /query /tn 'TrendRadar Daily' 2>&1 | Select-Object -First 1").trim());

console.log('\n=== 4) 실행 중인 데몬 종료 ===');
console.log(' ', ps(
  "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | " +
  "Where-Object { $_.CommandLine -like '*daemon.ps1*' } | " +
  "ForEach-Object { Stop-Process -Id $_.ProcessId -Force; 'killed pid=' + $_.ProcessId }"
).trim());
await new Promise((r) => setTimeout(r, 1500));
console.log('  남은 데몬:', ps("Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*daemon.ps1*' } | Measure-Object | Select-Object -ExpandProperty Count").trim());

console.log('\n=== 5) 수동 실행 도구 확인 ===');
const runNow = path.join(root, 'tools', 'run_now.cmd');
console.log('  tools\\run_now.cmd 존재:', fs.existsSync(runNow));
console.log('  사용법: node src\\run.mjs   (또는 tools\\run_now.cmd 더블클릭)');
