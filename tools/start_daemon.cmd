@echo off
REM ============================================================
REM Trend Radar daemon launcher.
REM ASCII ONLY on purpose.
REM   cmd.exe reads .cmd files in the OEM codepage (cp949 here).
REM   Any UTF-8 text in this file corrupts the following lines -
REM   that is exactly why the daemon silently failed to start
REM   between 2026-10-24 and 2026-11-03 (the "/min" flag was
REM   mangled into "n", so the command aborted).
REM
REM The project path has Korean characters, so an ASCII junction
REM is used: C:\Users\ue-agent\Documents\trend-radar
REM ============================================================
set "ROOT=%LOCALAPPDATA%\TrendRadar"
if not exist "%ROOT%" mkdir "%ROOT%"
set "LOG=%ROOT%\startup.log"
set "SCRIPT=C:\Users\ue-agent\Documents\trend-radar\tools\daemon.ps1"

echo [%DATE% %TIME%] launcher invoked >> "%LOG%"
if not exist "%SCRIPT%" (
  echo [%DATE% %TIME%] FATAL daemon.ps1 not found: %SCRIPT% >> "%LOG%"
  exit /b 3
)

start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT%"
echo [%DATE% %TIME%] daemon start issued >> "%LOG%"
exit /b 0
