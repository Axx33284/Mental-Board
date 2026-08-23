@echo off
:: Copies your board out to admin\backups\ with the date and time on it.
::
:: The app already keeps its own backups (one per day, twenty deep, plus one
:: before each new version) inside %APPDATA%\Mental Board\backups. Those age
:: out. These do not, and they sit next to the project where you will find them
:: — worth taking before you import something or try a build you are unsure of.
title Backup Mental Board
setlocal
set "DATA=%APPDATA%\Mental Board"
set "DEST=%~dp0backups"

if not exist "%DATA%\board.json" (
  echo No board found at:
  echo   %DATA%\board.json
  echo.
  echo Nothing to back up — that is what a first run looks like.
  pause
  exit /b 1
)

:: %DATE% is formatted by locale, so it cannot be sliced up portably. WMIC used
:: to be the way round that; it is gone from current Windows 11 builds, so ask
:: PowerShell — which is on every machine that can run the app anyway.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set "STAMP=%%i"
if not defined STAMP (
  echo Could not read the date. Is PowerShell available?
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"
copy /y "%DATA%\board.json" "%DEST%\board-%STAMP%.json" >nul
if errorlevel 1 (
  echo Copy failed.
  pause
  exit /b 1
)

echo Saved: %DEST%\board-%STAMP%.json
echo.
dir /b /o-n "%DEST%"
echo.
pause
