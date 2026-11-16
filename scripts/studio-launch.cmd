@echo off
rem Blog Studio launcher: start local studio server if needed, then open the browser.
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$up = Get-NetTCPConnection -LocalPort 3456 -State Listen -ErrorAction SilentlyContinue;" ^
  "if (-not $up) { Start-Process -WindowStyle Minimized -FilePath 'cmd.exe' -ArgumentList '/c','npm run studio' -WorkingDirectory (Get-Location) };" ^
  "for ($i = 0; $i -lt 90; $i++) { try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:3456/studio' | Out-Null; break } catch { Start-Sleep -Seconds 1 } };" ^
  "Start-Process 'http://localhost:3456/studio'"
