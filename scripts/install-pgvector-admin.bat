@echo off
title TestVantage install pgvector
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""c:\Users\seraj\OneDrive\Desktop\TestVantage\TestVantage\onlinetest\scripts\install-pgvector-win.ps1""'"
echo Done. Press F5 in Cursor to restart TestVantage.
pause
