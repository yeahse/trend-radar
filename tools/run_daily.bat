@echo off
REM ============================================================
REM  Trend Radar - daily collection + briefing runner (Windows)
REM  Doubles as a Task Scheduler target
REM ============================================================
setlocal
cd /d "%~dp0.."

REM  작업 스케줄러(비대화 세션)에서는 PATH에 node가 없을 수 있으므로 절대경로 기본값 사용
if not defined NODE_EXE set "NODE_EXE=C:\Program Files\nodejs\node.exe"

echo [%date% %time%] Trend Radar daily run starting...
"%NODE_EXE%" src\run.mjs %*
set EXITCODE=%ERRORLEVEL%

if not exist logs mkdir logs
echo [%date% %time%] exit code %EXITCODE% >> logs\run.log

if %EXITCODE% NEQ 0 (
  echo [ERROR] run failed, code %EXITCODE%
  exit /b %EXITCODE%
)

echo [OK] Report: reports\latest.md
echo [OK] CSV   : data\tracker_%date:~-4%%date:~3,2%%date:~0,2%.csv
endlocal
