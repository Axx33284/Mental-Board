@echo off
:: Builds the app into ..\App. It makes no shortcuts and touches none:
::
:: This is how a build from source gets updated. Nothing downloads a new
:: version behind your back: you edit the files in this project, you run this,
:: and the thing you double-click is that code. (Build Setup.cmd packs this
:: same App\ into the setup file other people install from.)
::
:: App\ is DELETED and rebuilt every time rather than written over, because a
:: file left behind by an older build is exactly what makes a new build behave
:: like the old one. Afterwards, App\BUILD.txt tells you the version and the
:: minute it was built, and the version also sits in the titlebar — so "is this
:: really the build I just made?" is always answerable.
::
:: Your boards live in Documents\My Boards and are never touched by a build.
title Build Mental Board
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
  echo Build failed -- the output above says why. App\ was left as it was.
  pause
  exit /b 1
)

echo.
pause
