@echo off
title TestVantage Dev Server
cd /d "%~dp0"
echo.
echo  TestVantage - starting dev server
echo  Keep this window OPEN while using http://127.0.0.1:5173/question-bank
echo  Close this window only when you are done for the day.
echo.
call npm run dev
if errorlevel 1 pause
