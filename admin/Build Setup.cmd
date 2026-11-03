@echo off
:: Builds the setup file: dist\Mental-Board-Setup-<version>.exe.
::
:: First it builds the app, exactly as Build App.cmd does (the checks, the
:: tests, App\ deleted and rebuilt). Then it packs that App\ into a setup
:: with Inno Setup 6, which is free: https://jrsoftware.org/isinfo.php
::
:: The setup installs to %LOCALAPPDATA%\Programs\Mental Board and nowhere
:: else, replaces an older copy rather than merging into it, refuses while
:: Mental Board is running, and its uninstaller leaves your boards alone.
::
:: Your boards live in Documents\My Boards and are never touched by a build
:: or by the setup.
title Build the Mental Board setup
cd /d "%~dp0.."

if not exist "node_modules\electron\dist\electron.exe" (
  echo Dependencies are not installed yet. Running npm install once...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Is Node.js installed?  https://nodejs.org
    pause
    exit /b 1
  )
)

call npm run build
if errorlevel 1 (
  echo.
  echo Build failed -- the output above says why. No setup was made.
  pause
  exit /b 1
)

call npm run setup
if errorlevel 1 (
  echo.
  echo The setup was not built -- the output above says why. Is Inno Setup 6 installed?
  pause
  exit /b 1
)

echo.
pause
