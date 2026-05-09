@echo off
echo Starting EMS Backend (port 5002)...
cd /d "%~dp0server"
call npm install --legacy-peer-deps
node index.js
pause
