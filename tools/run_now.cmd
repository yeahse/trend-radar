@echo off
REM ============================================================
REM Trend Radar - MANUAL run (2026-11-12)
REM   자동 실행은 전부 해제됨 (Startup 폴더 / HKCU Run / Task Scheduler).
REM   이 파일을 더블클릭하거나 실행하면 1회 수집 + Discord 브리핑이 나간다.
REM
REM   ASCII-only on purpose: cmd.exe reads .cmd in the OEM codepage,
REM   so UTF-8 text here corrupts the following lines.
REM
REM   Project path has Korean characters -> ASCII junction is used:
REM   C:\Users\ue-agent\Documents\trend-radar
REM ============================================================
set "ROOT=%LOCALAPPDATA%\TrendRadar"
if not exist "%ROOT%" mkdir "%ROOT%"
set "LOG=%ROOT%\manual_run.log"
set "PROJ=C:\Users\ue-agent\Documents\trend-radar"

echo [%DATE% %TIME%] manual run starting... >> "%LOG%"
cd /d "%PROJ%"
if not defined NODE_EXE set "NODE_EXE=C:\Program Files\nodejs\node.exe"

"%NODE_EXE%" src\run.mjs %*
set EXITCODE=%ERRORLEVEL%
echo [%DATE% %TIME%] exit code %EXITCODE% >> "%LOG%"

if %EXITCODE% NEQ 0 (
  echo [ERROR] run failed, code %EXITCODE%
  echo [%DATE% %TIME%] FAILED code %EXITCODE% >> "%LOG%"
  pause
  exit /b %EXITCODE%
)

echo [OK] Report: reports\latest.md
echo [OK] CSV   : data\tracker_%date:~-4%%date:~3,2%%date:~0,2%.csv
echo [%DATE% %TIME%] done >> "%LOG%"
pause
exit /b 0
