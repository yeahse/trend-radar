# Trend Radar 데몬 — 매일 08:30 자동 수집
#
# 왜 데몬인지 (2026-10-24 실측):
#   이 머신의 Windows Task Scheduler가 **어떤 태스크도 실행하지 못한다.**
#   (trivial 액션 `cmd /c echo probe > file` 로도 LastRunTime이 갱신 안 되고
#    LastTaskResult=267011(SCHED_S_TASK_HAS_NOT_RUN) 로 남는다 → 머신 레벨 문제)
#   → Task Scheduler 의존을 버리고, **로그온 시 시작하는 데몬**으로 대체한다.
#
# 동작:
#   - 로그온 시 시작 (Startup 폴더 등록)
#   - 5분마다 확인: 08:30 지났고 오늘 아직 안 돌았으면 수집 실행
#   - PC를 껐다 켜면(오전에 껐다면) 08:30 이후 첫 로그온에 **자동 보정 실행**
#   - `data\.run_now` 파일을 만들면 즉시 1회 실행
#   - 실행 결과는 logs\run.log, 데몬 자체 로그는 logs\daemon.log

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$marker   = Join-Path $root 'data\.last_daily_run'
$runNow   = Join-Path $root 'data\.run_now'
$runLog   = Join-Path $root 'logs\run.log'
$daemonLog= Join-Path $root 'logs\daemon.log'
$lockFile = Join-Path $root 'data\.daemon.lock'
$nodeExe  = 'C:\Program Files\nodejs\node.exe'
$runAt    = '08:30'

if (-not (Test-Path (Join-Path $root 'logs'))) { New-Item -ItemType Directory -Path (Join-Path $root 'logs') | Out-Null }
if (-not (Test-Path (Join-Path $root 'data')))  { New-Item -ItemType Directory -Path (Join-Path $root 'data')  | Out-Null }

function Say($m) {
  Add-Content -Path $daemonLog -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m" -Encoding UTF8
}

Say "데몬 시작 (pid=$PID)"

while ($true) {
  try {
    $today = (Get-Date).ToString('yyyy-MM-dd')
    $last  = if (Test-Path $marker) { (Get-Content $marker -Raw -Encoding UTF8).Trim() } else { '' }
    $now   = Get-Date
    $target = [datetime]::ParseExact("$today $runAt", 'yyyy-MM-dd HH:mm', $null)

    $forced = Test-Path $runNow
    $due    = ($last -ne $today) -and ($now -ge $target)

    if (($forced -or $due) -and -not (Test-Path $lockFile)) {
      if ($forced) { Remove-Item $runNow -ErrorAction SilentlyContinue }
      New-Item -ItemType File -Path $lockFile -ErrorAction SilentlyContinue | Out-Null
      Say "수집 시작 (forced=$forced, last='$last')"
      try {
        & $nodeExe (Join-Path $root 'src\run.mjs') *>> $runLog
        $code = $LASTEXITCODE
        if ($code -eq 0) {
          Set-Content -Path $marker -Value $today -Encoding ASCII
          Say "수집 완료 (exit=$code) → marker=$today"
        } else {
          Say "수집 실패 (exit=$code) — 다음 주기(5분 후) 재시도"
        }
      } catch {
        Say "수집 예외: $($_.Exception.Message)"
      }
      Remove-Item $lockFile -ErrorAction SilentlyContinue
    }
  } catch {
    Say "루프 오류: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 300
}
