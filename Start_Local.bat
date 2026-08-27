@echo off
title Automate Karaoke - Local Dev Server
cd /d "%~dp0"
echo ====================================================
echo        Starting Automate Karaoke (Forced Fullscreen)
echo ====================================================
echo.

:: Launch browser in dedicated Kiosk/Fullscreen App Mode (works even if Chrome is already open)
start "" /b powershell -Command "Start-Sleep -Seconds 2; $target = 'https://localhost:5173'; $p = Join-Path $env:TEMP 'karaoke_pwa_profile'; if (Get-Command chrome -ErrorAction SilentlyContinue) { Start-Process chrome -ArgumentList ('--app=' + $target), '--start-fullscreen', ('--user-data-dir=' + $p), '--no-first-run', '--no-default-browser-check' } else { Start-Process msedge -ArgumentList ('--app=' + $target), '--start-fullscreen', ('--user-data-dir=' + $p), '--no-first-run', '--no-default-browser-check' }"

:: Start Vite dev server in this window
npm run dev
pause
