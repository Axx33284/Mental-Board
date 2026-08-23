@echo off
:: Opens the folder your notes actually live in.
::
:: board.json          the board
:: board.bak.json      the copy from before the last save
:: backups\            dated copies, newest twenty, plus one per app version
::
:: Recovery is a rename: put a good copy over board.json and restart. If you
:: edit one of these by hand, save it as UTF-8 without a BOM — Notepad's default
:: adds one, and the app used to refuse a perfectly good board because of it.
:: (It strips the BOM now, but there is no reason to add one.)
set "DATA=%APPDATA%\Mental Board"
if not exist "%DATA%" (
  echo Mental Board has not saved anything yet — %DATA% does not exist.
  pause
  exit /b 1
)
explorer "%DATA%"
