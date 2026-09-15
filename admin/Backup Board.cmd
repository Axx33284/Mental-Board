@echo off
:: Copies the whole My Boards folder out to admin\backups\ with the date and
:: time on it — every board, every picture, the settings.
::
:: The app already keeps a dated copy of each board inside My Boards\Backups,
:: and Settings can mirror the folder to another drive. Those age out or need
:: setting up; this one sits next to the project where you will find it —
:: worth taking before you import something or try a build you are unsure of.
title Backup Mental Board
setlocal
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%i"
set "DATA=%DOCS%\My Boards"
set "DEST=%~dp0backups"

if not exist "%DATA%\settings.json" (
  echo No boards found at:
  echo   %DATA%
  echo.
  echo Nothing to back up — that is what a first run looks like.
  pause
  exit /b 1
)

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"`) do set "STAMP=%%i"
if not defined STAMP (
  echo Could not read the date. Is PowerShell available?
  pause
  exit /b 1
)

if not exist "%DEST%" mkdir "%DEST%"
robocopy "%DATA%" "%DEST%\My Boards %STAMP%" /E /XD Backups /XF *.tmp /NFL /NDL /NJH /NJS /NC /NS /NP >nul
if errorlevel 8 (
  echo Copy failed.
  pause
  exit /b 1
)

echo Saved: %DEST%\My Boards %STAMP%
pause
