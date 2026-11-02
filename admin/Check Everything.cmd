@echo off
:: Runs the four checks that gate a release, without building anything.
::
::   check:lang   every visible string has a key, and every language has it
::                (the renderer, index.html, and main.js + preload.js)
::   check:icons  every downloaded icon is drawn, and everything drawn exists
::   check:crlf   every .cmd file still has CRLF endings, which cmd.exe needs
::   check:dupes  no name is declared twice in the scripts' shared scope
::
:: All four are fast. Run them after touching index.html, anything in
:: src\js, or the catalogues — `npm run build` runs them too, but finding
:: out here is quicker than finding out four minutes into a build.
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
