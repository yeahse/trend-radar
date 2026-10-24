@echo off
REM Trend Radar 자동 수집 데몬 시작 (로그온 시 실행)
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0daemon.ps1"
exit /b 0
