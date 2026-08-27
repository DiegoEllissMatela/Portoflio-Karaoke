@echo off
title Automate Karaoke - Online Stream Launcher
cd /d "%~dp0"
echo ====================================================================
echo             AUTOMATE KARAOKE - 1-CLICK STREAM LAUNCHER
echo ====================================================================
echo.
echo [1/2] Launching Local Vite Server in new window...
start "Karaoke Local Dev Server (Keep Open)" cmd /k "cd /d ""%~dp0"" && npm run dev"

echo [2/2] Launching Cloudflare Tunnel in 3 seconds...
timeout /t 3 /nobreak >nul
start "Karaoke Cloudflare Tunnel (Copy Link From Here)" cmd /k "cd /d ""%~dp0"" && npx cloudflared tunnel --url https://localhost:5173 --no-tls-verify"

echo.
echo ====================================================================
echo Both servers have been launched in separate windows!
echo Check the 'Karaoke Cloudflare Tunnel' window for your https:// link.
echo ====================================================================
timeout /t 6
