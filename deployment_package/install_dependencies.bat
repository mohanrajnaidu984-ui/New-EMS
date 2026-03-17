@echo off
echo Installing Backend Dependencies...
cd server
call npm install --production
if %errorlevel% neq 0 (
    echo Error installing dependencies. Check if Node.js is installed.
    pause
    exit /b %errorlevel%
)
echo Dependencies installed successfully.
pause
