@echo off
rem First-time setup for Blog Studio (double-click once).
rem Keep this file ASCII-only: cmd.exe misreads UTF-8 text in batch files.
rem Installs packages, creates admin password + desktop icon, offers AI login.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Node.js is not installed.
  echo      Install the LTS version from https://nodejs.org and run this file again.
  echo.
  start "" "https://nodejs.org/ko/download"
  pause
  exit /b 1
)

node scripts\studio-setup.mjs --first-run
echo.
pause
