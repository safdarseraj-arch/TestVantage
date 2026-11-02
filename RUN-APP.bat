@echo off
title TestVantage
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org then run this again.
  pause
  exit /b 1
)
echo Starting TestVantage - keep this window open.
echo Browser opens at http://127.0.0.1:5173/question-bank
echo.
call npm run dev
pause
