@echo off
setlocal EnableExtensions
title DNM Karaoke - Create Shareable Zip
cd /d "%~dp0"

:: Creates "DNM Karaoke - Share.zip" next to this project folder, containing everything
:: needed to run on another PC EXCEPT node_modules / dist / .git (recreated by Setup_And_Run.bat).
:: Your personal save files are excluded so the recipient starts fresh.

set "STAGE=%TEMP%\dnm_share_stage"
set "OUT=%~dp0..\DNM Karaoke - Share.zip"

echo Preparing files (the song library is large, this can take a few minutes)...
if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%\DNM Karaoke"

robocopy "%~dp0." "%STAGE%\DNM Karaoke" /E /NFL /NDL /NJH /NJS /NP ^
  /XD node_modules dist dist-ssr electron-dist .git .vscode save settings ^
  /XF save.json save.txt *.log >nul

:: robocopy exit codes below 8 mean success
if errorlevel 8 (
  echo [ERROR] File copy failed.
  goto :done
)

echo Compressing...
if exist "%OUT%" del "%OUT%"
tar -a -c -f "%OUT%" -C "%STAGE%" "DNM Karaoke"
if errorlevel 1 (
  powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\DNM Karaoke' -DestinationPath '%OUT%' -Force"
)

rmdir /s /q "%STAGE%"
if exist "%OUT%" (
  echo.
  echo Done: %OUT%
) else (
  echo [ERROR] Zip was not created.
)

:done
pause
endlocal

