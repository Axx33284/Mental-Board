@echo off
:: Same app, but pointed at a throwaway profile in .sandbox\ instead of your
:: real board.
::
:: Use this for anything you would not want to do to your own notes — trying an
:: import, testing the Erase button, checking what a first run looks like. The
:: board in %APPDATA%\Mental Board is never opened, so it cannot be written to.
::
:: --user-data-dir also wins over the folder main.js pins, which is the whole
:: point; see MAP.md, "The data folder is a contract".
::
:: DevTools is on port 9444 as well: open http://127.0.0.1:9444 in a browser to
:: attach, or just press F12 in the window.
title Mental Board (sandbox)
cd /d "%~dp0.."

if not exist "node_modules\electron\dist\electron.exe" (
  echo Dependencies are not installed yet. Running npm install once...
  echo.
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

echo Starting Mental Board with a THROWAWAY profile: %CD%\.sandbox
echo Your real board is not opened by this window.
echo.
"node_modules\electron\dist\electron.exe" . --user-data-dir=".sandbox" --remote-debugging-port=9444
