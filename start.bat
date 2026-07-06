@echo off
title eCompany Dev Server

echo === eCompany Dev Server v3.0 ===
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found. Please install Node.js 22+.
    pause
    exit /b 1
)

node -v

cd /d "%~dp0backend"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

echo Starting server on http://localhost:8002
echo Opening browser...
start http://localhost:8002
echo.
node server-modern.js

pause
