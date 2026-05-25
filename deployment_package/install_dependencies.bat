@echo off
title EMS Production Dependencies Installer
cd server
echo ===================================================
echo   EMS Backend Node.js Production Dependencies      
echo ===================================================
echo Installing production node_modules...
npm install --production
echo Done!
pause
