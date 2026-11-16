@echo off
rem Blog Studio launcher (desktop icon).
rem Keep this file ASCII-only: cmd.exe misreads UTF-8 text in batch files.
rem Node.js check here; install / server start / browser open in studio-open.mjs.
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js is not installed.
  echo      Install the LTS version from https://nodejs.org and click the icon again.
  echo.
  start "" "https://nodejs.org/ko/download"
  pause
  exit /b 1
)

node scripts\studio-open.mjs
if errorlevel 1 pause
