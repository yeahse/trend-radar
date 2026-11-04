/**
 * Task Scheduler 등록 (2026-11-04).
 * ★ 이 머신에서 "At logon" 트리거가 실제로 작동함을 oCamTask 로 확인했다
 *   (oCamTask: Status=Running, Last Run 2026-11-04 06:18, Logon Mode=Interactive/Background).
 *   기존 "\TrendRadar Daily" 는 Daily 08:30 + Interactive only 였지만
 *   StartWhenAvailable/WakeToRun/재시도가 꺼져 있었고, 액션이 한글경로 .bat 이라
 *   파싱 문제가 겹쳐 "한 번도 실행되지 않은"(Last Result 267011) 상태였다.
 *
 * 조치:
 *   1) 액션 → ASCII junction 경로 + daemon.ps1 -Once (상주 루프 없음, 1회만)
 *   2) 트리거 2개: Daily 08:30 + Logon(+5분) → 놓친 날 자동 보정
 *   3) StartWhenAvailable / WakeToRun / RestartOnFailure(3회·1분) / 배터리 무관
 *   4) LogonType = InteractiveToken (oCamTask 와 동일 계열)
 *
 * 사용: node tools\install_task.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, '..');
const ASCII = 'C:\\Users\\ue-agent\\Documents\\trend-radar';

// ── 1) run_daily.bat 을 ASCII + CRLF 로 정규화 ─────────────────────────
const bat = path.join(root, 'tools', 'run_daily.bat');
if (fs.existsSync(bat)) {
  let raw = fs.readFileSync(bat, 'utf8').replace(/^\uFEFF/, '');
  const nonAscii = (raw.match(/[^\x00-\x7F]/g) || []).length;
  raw = raw.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n').replace(/[^\x00-\x7F]/g, '');
  fs.writeFileSync(bat, raw, 'ascii');
  console.log(`OK  run_daily.bat 정규화 (비ASCII ${nonAscii}자 제거, CRLF)`);
}

// ── 2) Task XML 생성 (schtasks /create /xml 은 UTF-16 필요) ─────────────
const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Trend Radar daily collection (auto-repair: StartWhenAvailable + Logon + retry)</Description>
    <URI>\\TrendRadar Daily</URI>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-11-05T08:30:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT5M</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>ue-agent</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>
      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${ASCII}\\tools\\daemon.ps1" -Once</Arguments>
      <WorkingDirectory>${ASCII}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;

const xmlPath = path.join(process.env.LOCALAPPDATA || process.env.TEMP, 'TrendRadar', '_task.xml');
fs.mkdirSync(path.dirname(xmlPath), { recursive: true });
// schtasks 는 UTF-16 XML 만 받는다 (BOM 포함 little-endian)
fs.writeFileSync(xmlPath, Buffer.from('\uFEFF' + xml.replace('encoding="UTF-16"', 'encoding="UTF-16"'), 'utf16le'));
console.log('OK  XML 생성:', xmlPath);

// ── 3) 등록 ───────────────────────────────────────────────────────────
try {
  execFileSync('schtasks.exe', ['/delete', '/tn', 'TrendRadar Daily', '/f'], { stdio: 'pipe' });
  console.log('기존 태스크 삭제됨');
} catch { /* 없었음 */ }

execFileSync('schtasks.exe', ['/create', '/tn', 'TrendRadar Daily', '/xml', xmlPath, '/f'], { stdio: 'inherit' });
console.log('OK  태스크 등록 완료');

// ── 4) 검증 ───────────────────────────────────────────────────────────
const out = execFileSync('schtasks.exe', ['/query', '/tn', 'TrendRadar Daily', '/fo', 'LIST', '/v'], { encoding: 'utf8' });
for (const line of out.split(/\r?\n/)) {
  if (/Task To Run|Schedule Type|Start Time|Status|Last Run|Last Result|Logon Mode|Run As User|Wake|Start In/.test(line)) {
    console.log('   ' + line.trim());
  }
}
