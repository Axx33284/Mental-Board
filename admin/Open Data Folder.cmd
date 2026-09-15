@echo off
:: Opens the folder your boards actually live in: Documents\My Boards.
::
:: settings.json            how the app is set up, and the order of the boards
:: <Board name>\board.json  one folder per board; files\ beside it holds its
::                          pictures, clips and documents
:: <Group>\<Board name>\    a board inside a group
:: Trash\                   the bin
:: Backups\<Board name>\    one dated copy of each board per day, plus one
::                          taken before each new app version
::
:: Recovery is a rename: put a good copy over a board's board.json and restart.
:: Copy a board's folder anywhere and it is the whole board; delete My Boards
:: and the app starts as new. If you edit a file by hand, save it as UTF-8.
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%i"
set "DATA=%DOCS%\My Boards"
if not exist "%DATA%" (
  echo Mental Board has not saved anything yet — %DATA% does not exist.
  pause
  exit /b 1
)
explorer "%DATA%"
