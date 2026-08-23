@echo off
:: Runs Mental Board straight from the source in this folder.
::
:: This is the one you want day to day. There is no build step and no install:
:: it opens your real board out of %APPDATA%\Mental Board, exactly like the
:: installed copy, but it runs the code as it is on disk right now. Edit a file,
:: press Ctrl+R in the window, and the change is there.
::
:: The installed copy, if you have one, is not touched and not needed.
title Mental Board
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

echo Starting Mental Board from source...
echo Close this window to quit the app.
echo.
"node_modules\electron\dist\electron.exe" .
