@echo off
:: Runs the two checks that gate a release, without building anything.
::
::   check:lang   every visible string has a key, and every language has it
::   check:icons  every downloaded icon is drawn, and everything drawn exists
::
:: Both are fast. Run them after touching index.html, renderer.js or the
:: catalogues — `npm run dist` runs them too, but finding out here is quicker
:: than finding out four minutes into a build.
title Check Mental Board
cd /d "%~dp0.."

call npm run check
if errorlevel 1 (
  echo.
  echo ^>^>^> Something is wrong. See above.
  pause
  exit /b 1
)

echo.
echo All checks passed.
pause
