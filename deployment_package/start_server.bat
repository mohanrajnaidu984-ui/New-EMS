@echo off
title EMS API Server Startup
cd server
echo ===================================================
echo   EMS Backend Express API Server Manual Startup    
echo ===================================================
echo Checking configuration...
if not exist .env (
    echo [WARNING] No '.env' file found! 
    echo Please configure your database credentials in 'server/.env' first.
    echo Creating temporary '.env' from '.env.example'...
    copy .env.example .env
)
echo Starting Express Server on port 5002...
node index.js
pause
