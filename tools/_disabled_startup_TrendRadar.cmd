@echo off
REM Trend Radar daemon launcher (Startup). ASCII-only: cmd.exe parses .cmd in the
REM OEM codepage, so UTF-8 text here corrupts the following lines.
REM The project path has Korean characters, so an ASCII junction is used.
set "ROOT=%LOCALAPPDATA%\TrendRadar"
if not exist "%ROOT%" mkdir "%ROOT%"
set "LOG=%ROOT%\startup.log"
set "SCRIPT=C:\Users\ue-agent\Documents\trend-radar\tools\daemon.ps1"
echo [%DATE% %TIME%] launcher invoked >> "%LOG%"
if not exist "%SCRIPT%" (
  echo [%DATE% %TIME%] FATAL daemon.ps1 not found: %SCRIPT% >> "%LOG%"
  exit /b 3
)
start "" /min "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT%"
echo [%DATE% %TIME%] daemon start issued >> "%LOG%"
exit /b 0
