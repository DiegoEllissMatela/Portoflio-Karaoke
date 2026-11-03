@echo off
setlocal EnableExtensions
title DNM Karaoke - Setup and Run
cd /d "%~dp0"

:: ====================================================================
::  DNM Karaoke - one-click setup + launcher for any Windows PC
::  1. Checks Node.js (needs 20.19+ or 22.12+) and npm, installs if missing/old
::  2. Installs project dependencies (npm ci / npm install)
::  3. Starts the app and opens it in the browser
::  Usage: double-click. Pass "setup" to only install, no launch.
:: ====================================================================

set "NODE_FALLBACK_VERSION=22.19.0"
set "APP_URL=http://localhost:5173"
set "SETUP_ONLY=0"
if /i "%~1"=="setup" set "SETUP_ONLY=1"

echo ====================================================
echo        DNM Karaoke - Setup and Run
echo ====================================================
echo.

:: ---------- 1. Sanity check: are we in the project folder? ----------
if not exist "package.json" (
  echo [ERROR] package.json not found. Run this file from inside the DNM Karaoke folder.
  goto :fail
)
if not exist "public\songs\catalog.json" (
  echo [WARN] public\songs\catalog.json not found. The song catalog will be generated on first run
  echo        if the "public\songs\songs" folder with the MIDI files is present.
  echo.
)

:: ---------- 2. Node.js check ----------
echo [1/4] Checking Node.js...
call :check_node
if "%NODE_OK%"=="1" goto :node_ready

if defined NODE_VER (
  echo       Found Node.js %NODE_VER% - too old. Need 20.19+ or 22.12+.
) else (
  echo       Node.js is not installed.
)
echo       Installing Node.js LTS...
call :install_node
call :check_node
if not "%NODE_OK%"=="1" (
  echo.
  echo [ERROR] Node.js could not be installed automatically.
  echo         Install the LTS version manually from https://nodejs.org then run this file again.
  goto :fail
)

:node_ready
echo       OK  Node.js %NODE_VER%

:: ---------- 3. npm check ----------
echo [2/4] Checking npm...
for /f "delims=" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
if not defined NPM_VER (
  echo [ERROR] npm was not found. Reinstall Node.js from https://nodejs.org
  goto :fail
)
echo       OK  npm %NPM_VER%

:: ---------- 4. Dependencies ----------
echo [3/4] Checking project dependencies...
set "NEED_INSTALL=0"
if not exist "node_modules\vite\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\react\package.json" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="0" (
  echo       OK  node_modules already installed
  goto :deps_done
)
echo       Installing packages (first run needs internet, may take a few minutes)...
if exist "package-lock.json" (
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo       npm ci failed, retrying with npm install...
    call npm install --no-audit --no-fund
  )
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 (
  echo [ERROR] Dependency installation failed. Check your internet connection and retry.
  goto :fail
)
echo       OK  Dependencies installed

:deps_done
if "%SETUP_ONLY%"=="1" (
  echo.
  echo Setup complete. Run this file again without "setup" to start the app.
  goto :end
)

:: ---------- 5. Launch ----------
echo [4/4] Starting DNM Karaoke...
echo.

:: Free ports 5173/5174 if a previous run is hanging
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5174 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

:: Open browser after the server has had time to start
start "" /b powershell -NoProfile -Command "Start-Sleep -Seconds 4; Start-Process '%APP_URL%'"

echo  App address on this PC : %APP_URL%
echo  Keep this window open while using the app. Press Ctrl+C to stop.
echo.
call npm run dev
goto :end

:: ====================================================================
:check_node
set "NODE_OK=0"
set "NODE_VER="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
if not defined NODE_VER exit /b 0
set "NODE_VER=%NODE_VER:v=%"
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit((a>22||(a===22&&b>=12)||(a===20&&b>=19))?0:1)" >nul 2>&1
if not errorlevel 1 set "NODE_OK=1"
exit /b 0

:install_node
:: Try winget first (Windows 10 1809+/11)
where winget >nul 2>&1
if not errorlevel 1 (
  echo       Using winget...
  winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  call :refresh_path
  call :check_node
  if "%NODE_OK%"=="1" exit /b 0
)
:: Fallback: download the official MSI
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
set "MSI=%TEMP%\node-v%NODE_FALLBACK_VERSION%-%ARCH%.msi"
echo       Downloading Node.js %NODE_FALLBACK_VERSION% (%ARCH%) from nodejs.org...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/v%NODE_FALLBACK_VERSION%/node-v%NODE_FALLBACK_VERSION%-%ARCH%.msi' -OutFile '%MSI%'"
if not exist "%MSI%" exit /b 1
echo       Running installer (accept the Windows admin prompt)...
msiexec /i "%MSI%" /qb /norestart
del "%MSI%" >nul 2>&1
call :refresh_path
exit /b 0

:refresh_path
:: Make a freshly installed Node visible in this same window
set "PATH=%PATH%;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm"
exit /b 0

:fail
echo.
echo Setup did not finish. See the messages above.
pause
exit /b 1

:end
pause
endlocal
exit /b 0
