@echo off
title TestVantage - START HERE
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Install from https://nodejs.org  then double-click START-HERE.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo  ========================================
echo    START HERE - TestVantage dev server
echo  ========================================
echo.
echo  Keep this window OPEN while you use the app.
echo  Browser: http://127.0.0.1:5173/question-bank
echo.

call npm run dev

echo.
echo  Server stopped.
pause
