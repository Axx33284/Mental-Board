# Installing Mental Board

Mental Board lives in one folder, in one place:

```
%LOCALAPPDATA%\Programs\Mental Board\Mental Board.exe
```

Your boards are not in that folder. They live in **`Documents\My Boards`**,
so installing, updating or uninstalling the app never touches them.

There are two ways to put it there. Both put it in the same place, so pick
one: the **setup file** does it for you, the **zip** is the same app as a
folder you put in place yourself.

## The easy way: the setup file

1. Download **`Mental-Board-Setup-<version>.exe`** from the Releases page:
   <https://github.com/axx33284/mental-board/releases/latest>
2. Run it. Windows may say *"Windows protected your PC"*, because the app is
   not code-signed: click **More info ▸ Run anyway**.
3. That is all. It needs no administrator, adds Mental Board to the Start
   menu, and offers to start it. It does not ask where to install: there is
   only one place.

**Update:** quit the app (right-click its tray icon ▸ **Quit**), then run the
new setup. It replaces the old copy — it never keeps both. If the app is still
running, the setup says so and waits for you to quit it.

**Uninstall:** Windows **Settings ▸ Apps ▸ Installed apps ▸ Mental Board ▸
Uninstall**. The app's folder and its Start-menu entry go; your boards stay
in `Documents\My Boards` until you delete that folder yourself.

## Without the setup: the zip

### Install (about one minute)

1. Download **`Mental-Board-<version>-windows-x64.zip`** from the Releases
   page, into your **Downloads** folder:
   <https://github.com/axx33284/mental-board/releases/latest>
2. Put it in its place. Either way works; both do the same thing.

   **The quick way.** Press **Start**, type **PowerShell**, open it, paste
   this whole block and press **Enter**:

   ```powershell
   & {
     if (Get-Process 'Mental Board' -ErrorAction SilentlyContinue) { 'Quit Mental Board first (tray icon > Quit). Nothing was changed.'; return }
     $zip = @(Get-ChildItem "$HOME\Downloads\Mental-Board-*-windows-x64.zip")
     if ($zip.Count -ne 1) { "Found $($zip.Count) Mental Board zips in Downloads. Keep exactly one. Nothing was changed."; return }
     $dest = "$env:LOCALAPPDATA\Programs"
     Remove-Item "$dest\Mental Board" -Recurse -Force -ErrorAction SilentlyContinue
     Expand-Archive -LiteralPath $zip[0].FullName -DestinationPath $dest
     "Installed $($zip[0].Name). Start: $dest\Mental Board\Mental Board.exe"
   }
   ```

   It changes nothing if the app is running or if there is not exactly one
   Mental Board zip in Downloads. It removes an old copy before unpacking the
   new one, so this is also how you update.

   **By hand.** Press **Win+R**, type `%LOCALAPPDATA%` and press **Enter**. If
   there is no folder called **Programs** there, make one. Open it. Then
   double-click the zip you downloaded and drag the **Mental Board** folder
   out of it into **Programs**.
3. Start it: press **Win+R**, paste
   `%LOCALAPPDATA%\Programs\Mental Board\Mental Board.exe`, press **Enter**.
4. Windows may say *"Windows protected your PC"*, because the app is not
   code-signed. Click **More info ▸ Run anyway**. It asks once.
5. To keep it one click away, right-click its icon on the taskbar while it
   runs ▸ **Pin to taskbar**. That pins this one copy. Never copy the exe
   anywhere else.

Then delete the zip from Downloads.

### Update

1. **Quit the app.** Closing the window only hides it in the tray: right-click
   the tray icon (by the clock, behind **^** if hidden) ▸ **Quit**.
2. Download the new zip and do step 2 again. The quick way removes the old
   folder for you. By hand, delete the old **Mental Board** folder in
   `Programs` first, then drag the new one in.

Your taskbar pin keeps working, because the path never changes. The version
is in the titlebar and in `BUILD.txt` inside the folder. If the titlebar still
shows the old version, an old copy is still running. Quit it from the tray and
start again.

### Uninstall

Quit the app, then delete `%LOCALAPPDATA%\Programs\Mental Board`. Your boards
stay in `Documents\My Boards` until you delete that folder too.

## The rules

These are short because each one has already cost someone their notes or an
afternoon.

1. **One copy, one place.** Mental Board lives in
   `%LOCALAPPDATA%\Programs\Mental Board` and nowhere else — the setup
   and the zip both put it there. Never keep a second
   copy, such as one in Downloads, an "old" folder, or a `Mental Board (2)`.
   Two copies share one lock, so starting the new one just brings the old
   one's window to the front. It looks exactly like the update did nothing.
2. **Never run it from inside the zip or from Downloads.** Extract it to its
   place first.
3. **Replace, never merge.** On update, delete the old folder, then extract.
   Files left over from an old version can make the new one behave like the
   old one.
4. **Quit from the tray before updating.** A running app locks its files, and
   the close button only hides the window.
5. **Your boards are not in the app folder.** They are in
   `Documents\My Boards`, one folder per board. To back them up, copy that
   folder. The app also keeps a dated copy of each board for 14 days in
   `Documents\My Boards\Backups`.
6. **Download only from this repository's Releases page.** Each release lists
   a SHA-256 for its zip. To check yours, run this in PowerShell:
   `Get-FileHash .\Mental-Board-*.zip`
7. **Building from source instead?** Then `App\Mental Board.exe` in your
   checkout is your one copy (see the README). Use either that or the
   download, never both on one machine.
8. **Installed with the setup? Update with the setup.** The zip's quick way
   would replace the folder but not the entry in Installed apps, which would
   then point at an uninstaller that is gone. A zip install can move to the
   setup at any time: the setup replaces it.

## If something is wrong

- **The app does not open, or opens an old version:** a copy is still running.
  Open Task Manager, end every **Mental Board**, and start it again.
- **"Mental Board stopped responding":** it reloads from the last save. Your
  boards are in `Documents\My Boards`, and dated copies are in its `Backups`
  folder.
- **A board shows as unreadable:** the app never writes over a file it could
  not read. The previous good copy is `board.bak.json` beside it, and older
  ones are in `Backups`.
