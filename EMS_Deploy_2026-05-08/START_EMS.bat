@echo off
echo Launching EMS Backend...
start "EMS Backend"  cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 4 /nobreak >nul
echo Launching EMS Frontend...
start "EMS Frontend" cmd /k "cd /d "%~dp0frontend" && node proxy-server.cjs"
echo.
echo Both services launched. Check the terminal windows.
