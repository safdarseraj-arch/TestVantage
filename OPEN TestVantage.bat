@echo off

title TestVantage - open app

cd /d "%~dp0"



where node >nul 2>&1

if errorlevel 1 (

  echo.

  echo  Node.js is not installed.

  echo  Install from https://nodejs.org then run this again.

  echo.

  pause

  exit /b 1

)



node scripts/open-or-start.mjs

if errorlevel 1 pause


