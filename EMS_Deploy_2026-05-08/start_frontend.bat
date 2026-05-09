@echo off
echo Starting EMS Frontend Proxy (port 5173)...
cd /d "%~dp0frontend"
call npm install express http-proxy-middleware
node proxy-server.cjs
pause
