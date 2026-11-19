@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4177/api/health -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if %errorlevel%==0 goto :open

echo Starting BioDynamX Choice OS...
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:4177'"
node src\cli.ts serve --host 0.0.0.0 --port 4177
echo.
echo The console stopped. Press any key to close.
pause >nul
exit /b

:open
start "" http://127.0.0.1:4177
exit /b
