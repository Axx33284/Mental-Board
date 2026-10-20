# Mental Board — code map

A map of this repo for whoever (human or model) works on it next. **Read this
before opening `src/js/` or `src/css/`** — this file tells you which of the
twenty-two scripts or nine sheets holds the thing you are after, so you never
have to read your way in.

Keep it current: if you move a region or add a feature, update the tables here
in the same change.

---

## 1. What the app is

An Electron desktop app: **boards** you drop rich-text notes onto, move,
resize, colour, rope together and corral into titled **workflows**. Each board
is an infinite canvas; the rail down the left edge switches between them. There
are no modes — the canvas is the whole app.

Plain HTML + CSS + twenty-two ordinary `<script>` tags. No framework, no
bundler, no build step, no modules — every file shares one global scope.

**2.0 in one paragraph.** Every board is now a folder in `Documents\My Boards`
(§3, `src/store.js`); a picture dropped on the canvas stands on the board by
itself and can be dragged into a note (§4q, `js/pictures.js`); a page menu at
the top right holds everything about *this* board — its font, text size,
background, group, copy, duplicate, trash, import, export (§4r, `js/page.js`);
the app's own look, "Mental Board", is the default theme and the chrome it
arrived with is `css/mental.css` (§5c); and a machine with no GPU is detected
and treated as one (§4c).

**Since 2.0.** A note carries a date beside its status (§4s); the agenda
lists every dated note on every board and the board can be seen as columns by
status, with a minimap in the corner (§4u, `js/views.js`); a board goes out
to and comes in from Obsidian as JSON Canvas (§4t, `js/canvas.js`); a video
can be added without a drag and says so when it cannot play (§4n); the board
picture draws its pictures (§4g); the renderer is sandboxed with a
deny-by-default permission policy (§7); and `npm test` exists (§6).

**2.1 in one paragraph** (all of it in §4v). A note has no head any more —
everything it carried is in the right-click menu. A rope is a way to get
somewhere: press it and the view flies to the note at the far end, and the
ropes of a selected note are drawn over the notes so you can see where they go.
`/link` puts the link at the caret (it used to land at the top of the note),
and a link can point at a note. Columns keep their shape through bigger text,
resizing and Backspace. Copy, cut, paste and duplicate carry their ropes, and
holding Ctrl+V shows where the paste will land. A workflow can be locked
behind the notes. The wheel scrolls a note that has more to read. The board can
be drawn on — pen, marker, brush, eraser (`js/ink.js`). Menus can make sounds
(`js/sound.js`, off by default). Graphics is three tiers, chosen for the
machine. The default accent is Mono — white on dark, black on light — and a
theme change fades.

**2.2, so far.** A phone with a pen is a wireless drawing tablet for the
board: Settings ▸ Extra ▸ Pair a phone shows a QR code, the phone's browser
opens a page this computer serves on the LAN, and the pen draws on the part of
the board outlined on the PC, in real time — the whole phone screen is the
drawing surface and shows that part of the board live; the pen's button
erases, and strokes can be selected, moved, recoloured and deleted from the
phone (§4x, `src/tablet.js`, `js/tablet.js`).

The things that make it more than a note wall:

| Feature | Where it lives |
|---|---|
| Infinite pan / zoom in world coordinates | js/view.js, js/items.js |
| **Thousands of notes without a stall** | js/view.js + css/later.css |
| **Several boards, one rail** | js/boards.js + css/boards.css |
| Notion-style block editor inside each note | js/editor.js |
| **Tables inside notes** | js/editor.js + css/boards.css |
| **Templates you make yourself** | js/editor.js |
| Windows-style 8-direction resize | js/items.js + css/notes.css |
| Workflow groups, with the title on any of nine sides | js/items.js §4i |
| Edge signposts for off-screen workflows | js/menus.js |
| Icons on notes, workflows and boards, 432 of them, plus `/icon` in text | js/media.js |
| **Find and a jump palette across every board** | js/edit-ops.js, js/settings.js |
| **Per-note history, and one board lockable behind a passphrase** | js/boards.js + §3b |
| **Quick capture from anywhere, reminders, a daily note** | js/boards.js + main.js |
| **Code colouring, table sorting, backlinks, board links** | js/editor.js |
| Crop / draw / annotate images | js/media.js |
| **Columns inside a note, any count** | js/editor.js + css/later.css §42 |
| **Statuses on notes, the user's own list** | js/state.js, js/items.js, js/menus.js |
| **Note shape, and three spacing levels** | js/theme.js + css/later.css |
| **Per-block text alignment** | js/toolbars.js + css/later.css |
| **Eighteen themes** and nine accents plus your own, following Windows or the clock | js/theme.js + css/tokens.css |
| **Note text in four faces, three shadow depths** | js/theme.js + css/later.css §45 |
| **Lines a note up with its neighbours as you drag it** | js/items.js §7 + css/later.css §46 |
| **Focus mode: the canvas and nothing else** | js/init.js + css/later.css §47 |
| **What a new note starts as, and whether a delete asks** | js/state.js + js/edit-ops.js |
| **Seven canvas papers, with a pitch and a strength** | js/view.js + css/chrome.css |
| Any-language UI, RTL interface, per-paragraph bidi | js/helpers.js, css/lang.css |
| **Arrange a selection into a grid, row or column** | js/edit-ops.js §4f |
| **A trash board — deleting is reversible** | js/edit-ops.js §4g |
| **The board as a PNG** | js/edit-ops.js §4g + main.js |
| **A palette you build yourself** | js/theme.js §3d |
| **The theme follows the clock** | js/theme.js §3d |
| **Video cards that look like the video, and play** | js/embeds.js §4e + main.js |
| **Paste a screenshot straight onto the board** | js/edit-ops.js §4h |
| **Ropes you can colour, shape and pin** | js/links.js §4d |
| **Video, sound and documents kept with the board** | js/media.js §4n |
| **A backup folder you can carry to another machine** | js/settings.js §4m + §4n |
| **Every board is a folder: `Documents\My Boards`** | src/store.js §3 |
| **Pictures standing on the board, dragged into notes** | js/pictures.js §4q |
| **The page menu: font, text size, background, group, copy, trash, export** | js/page.js §4r |
| **Boards in groups, which are sub-folders** | js/page.js §4r |
| **The Mental Board look, and a settings panel that explains itself** | css/mental.css §5c |
| **No GPU? The app notices** | main.js + js/theme.js §4c |
| **A date on a note, beside its status — red when late, amber on the day** | js/view.js + js/menus.js §4s |
| **The agenda: every dated note on every board, with a month** | js/views.js §4u |
| **The board as columns by status, drag to change** | js/views.js §4u |
| **A minimap of the whole board** | js/views.js §4u |
| **Obsidian: export and import as JSON Canvas** | js/canvas.js + store.js §4t |
| **Samsung Notes: text, handwriting, shapes and pictures from an .sdocx** | js/samsung.js + src/sdocx.js §4w |
| **Videos from the + menu, and a clip that cannot play says so** | js/init.js + js/media.js §4n |
| **Tests: the store, and the real app driven over CDP** | tools/test-*.js §6 |
| **A note with no head; everything in the right-click menu** | js/items.js + js/menus.js §4v |
| **Ropes you follow, and see end to end** | js/links.js §4v |
| **Links in text that land at the caret, and links to notes** | js/settings.js + js/editor.js §4v |
| **Columns that keep their shape** | js/editor.js + js/toolbars.js + css/mental.css §4v |
| **Hold Ctrl+V to see where a paste lands; ropes travel with copies** | js/boards.js + js/init.js §4v |
| **A workflow locked behind the notes** | js/items.js §4v |
| **The wheel scrolls a long note** | js/items.js §4v |
| **Drawing on the board — and selecting, moving, recolouring what was drawn** | js/ink.js §4v |
| **Any colour at all on a note or a workflow** | js/helpers.js + js/menus.js §4v |
| **Links in notes are blue** | css/mental.css §61 |
| **Settings ▸ Extra: typing sounds, pinned paper on a cork or wooden board; reset from any tab** | js/sound.js + css/mental.css §62 §4v |
| **A colour for each rope** | js/links.js + js/menus.js §4v |
| **Menu sounds** | js/sound.js §4v |
| **Three graphics tiers, picked for the machine** | js/theme.js + js/view.js §4c |
| **Mono accent, and a theme change that fades** | js/helpers.js + js/theme.js §4v |
| **A phone with a pen as a wireless drawing tablet, showing the board live** | src/tablet.js + js/tablet.js §4x |

---

## 2. Files

**The layout is one rule: everything the app ships lives in `src/`.** Nothing
else in the project is packaged. That is what makes the build's ignore list
short enough to be checkable (see §6) and what makes "does this file reach the
user?" answerable by looking at its path.

```
src/          the app — this is what gets packaged
  index.html    the whole DOM, and the load order for everything below
  js/           22 plain scripts, one global scope, no bundler   (§4)
  css/          9 sheets whose <link> order *is* the cascade     (§5)
  assets/       generated: icons.js, lang/, fonts/, icon.png; vendored: katex/
  main.js       Electron main
  store.js      the My Boards folder — every read and write of user data (§3)
  sdocx.js      reads a Samsung Notes file; required by store.js       (§4w)
  preload.js    the bridge: a list of IPC calls, no disk work of its own
  tablet.js     main: the LAN server a phone draws through (§4x)
  qr.js         main: the QR code of its pairing address (§4x)
  tablet/       phone.html — the page the phone opens (§4x)
tools/        build + checks, never shipped
admin/        double-clickable .cmd wrappers
App/          the built app (generated; deleted and rewritten by every build)
```

| File | Lines | What it is |
|------|-------|------------|
| `src/main.js` | ~1000 | Electron main. Window, native theme, the tray and the quick-capture hotkey, the loopback player origin, the `mbf://` protocol that serves a board's own files, the store's IPC handlers, the dialogs, the GPU check, the `shell:open-local` guard (§4m), the JSON Canvas dialogs (§4t), and the permission policy (§7). |
| `src/store.js` | ~860 | **The My Boards folder.** Runs in main. Scans the folder into boards, writes settings.json and each board.json atomically, lays a board's folder out (name, group, rename, move), keeps the files a board carries, copies them between boards, exports and imports whole boards, mirrors the folder for backup (never into itself), writes and reads JSON Canvas (§4t), reads a Samsung Notes file for a board and writes its pictures into that board's folder (`readSamsung`, `attachBuffer`, §4w), and migrates a 1.x board.json once. See §3. |
| `src/sdocx.js` | ~520 | **A Samsung Notes .sdocx, decoded.** Runs in main, plain Node: its own bounded zip reader (zlib), then `note.note` (title, rich text), the pages in `pageIdInfo.dat` order, their layers and object records — strokes, shapes and lines, text boxes, pictures — and `media/mediaInfo.dat`. Everything sized is read from its size and anything not understood is counted and skipped. No dependency; written from a published description of the format, see §4w. |
| `src/preload.js` | ~130 | The bridge. Six `contextBridge` globals (`mbPad` since 2.2), every one a thin IPC call — since 2.0 nothing here touches the disk, so the id→folder map `mbf://` is served from lives in one process. |
| `src/tablet.js` | ~360 | **A phone as a drawing tablet** (2.2). Runs in main, plain Node: picks the LAN address, serves the phone's page, speaks just enough WebSocket, enforces the pairing (one token, one phone, `resume` after a drop, Origin, private peers only), checks every message (`clean()`), sends the pictures of the board (`sendFrame()`, identical ones skipped) and stops by itself. See §4x. |
| `src/qr.js` | ~200 | A QR encoder for the pairing URL — byte mode, level M, versions 1–6, no dependency. See §4x. |
| `src/tablet/phone.html` | ~370 | The page the phone opens: a full-screen surface showing the board's pictures, pen in with pressure and hover, the pen button as an eraser, the arrow (select/move/recolour/delete), palm rejection, fingers to pan and zoom, and its own strokes drawn until a picture has them. No text of its own — the `main.pad*` strings are injected. See §4x. |
| `src/index.html` | ~1060 | The entire DOM: canvas, every overlay, every menu. Static; JS only fills it in. **Carries no user-visible text and no glyphs** — every string is a `data-t*` key, every icon is an empty slot filled by `STATIC_ICONS`. It also holds the two load orders, and both are load-bearing: see §4 and §5. |
| `src/js/*.js` | ~15300 | All app logic, in 23 plain scripts sharing one global scope. See §4. |
| `src/css/*.css` | ~4300 | All styling, in 9 sheets whose link order is the cascade. See §5. |
| `src/assets/lang/en.js` | ~860 | **The string catalogue.** English is the source of truth; every other file is a translation of it. |
| `src/assets/lang/ar.js` | ~960 | Arabic, `_rtl: true`. Complete — same keys as `en.js`. |
| `src/assets/fonts.css` + `src/assets/fonts/` | — | **Generated.** Noto Sans Arabic (one variable woff2, 162 KB, OFL). Run via `npm run fonts`. |
| `src/assets/katex/` | — | **Vendored**, not generated: KaTeX 0.16.11 (`katex.min.js`, `katex.min.css` trimmed to woff2 only, `fonts/*.woff2`) and its `mhchem.min.js`, MIT (`LICENSE.txt`). Loaded by plain tags in index.html above the app's scripts; the checks skip `assets/`. To update: `npm pack katex@x` and copy the same four things. See §4y. |
| `src/assets/icons.js` | — | **Generated.** 435 Material Symbols path strings + the picker's 21 groups. Do not hand-edit. |
| `tools/make-icon.js` | 264 | Turns `tools/icon-source.png` into `assets/icon.png` + `.ico` — decodes it, recolours it black-on-white, box-filters it down to every size. Run via `npm run icon`. Excluded from the package. |
| `tools/icon-source.png` | — | **The app icon, as artwork** — a brain in outline, black on white, 768×768. The only source of truth for the icon: replace this file and re-run `npm run icon`. Not taken from the icon set, because the set has no brain in it: `psychology` and `psychology_alt` are both *heads*. 768 on purpose — every size `make-icon.js` emits (16, 24, 32, 48, 64, 128, 256) divides it exactly, so no rung is box-filtered through a ragged window. Excluded from the package — what ships is the generated `src/assets/icon.png` and `.ico`. |
| `tools/fetch-icons.js` | 203 | Downloads the icon set into `assets/icons.js`. Run via `npm run icons`. Needs network; excluded from the package. |
| `tools/fetch-fonts.js` | 87 | Downloads the Arabic face into `assets/fonts/`. Run via `npm run fonts`. Needs network; excluded from the package. |
| `tools/app-source.js` | 79 | The app's scripts as one string, in `index.html`'s order. Both checkers read it, so neither keeps its own copy of the load order — the copy is what drifts. Also exposes `mainJs()`: `main.js` and `preload.js` are *not* in that order (they do not run in the page) but main draws the tray, the notification and every native dialog, so its strings have to be checked too. |
| `tools/check-lang.js` | 115 | Fails the build on a missing key, a drifted translation, a plural gap, or a template part with no string behind it. Covers the renderer scripts **and the main-process files** — `main.js`, `preload.js`, `store.js`, and since 2.2 `tablet.js` and `qr.js` (`MAIN_FILES` in `tools/app-source.js`). Run via `npm run check:lang`. |
| `tools/check-icons.js` | 95 | Fails the build on a downloaded icon nothing draws, or a drawn icon nothing downloaded. Run via `npm run check:icons`. |
| `tools/check-crlf.js` | 101 | Fails the build on a `.cmd` file with LF endings, which `cmd.exe` misparses into nonsense. Run via `npm run check:crlf`. |
| `tools/test-store.js` | ~330 | **Tests for store.js**, plain Node against a temporary My Boards: atomic writes, per-board failures, scan and the unreadable state, renames and groups, path escapes, attach and cleanup, snapshots, both migrations (and one whose writes fail), export, the mirror, a backup into itself, JSON Canvas files, a Samsung note read down to its stroke deltas. `npm run test:store`. |
| `tools/fake-sdocx.js` | ~85 | A small Samsung Notes file built byte by byte — a title, bold text, an inline picture, a stroke, a square and a garbage object — for both test files. No real Samsung file is checked in. |
| `tools/test-tablet.js` | ~260 | **Tests for the phone-as-tablet server and the QR encoder**, plain Node on 127.0.0.1: every symbol read back (format, finders, RS syndromes, bytes), then the pairing — the page and its CSP, a wrong token, a wrong Origin, a second socket, a spent token, `resume`, a message that is not ours, the pictures (numbers then JPEG, one over 64 KB, an identical one skipped), an unmasked frame, and Stop closing the port. `npm run test:tablet`. |
| `tools/test-app.js` | ~345 | **Tests that need the real app.** Launches Electron with a throwaway `--user-data-dir`, seeds an unreadable board, drives the page over CDP: `applySaveResult()` with every shape of answer, a real failed write and its retry, dates, cleanup refusing an unreadable board, a delete whose bin cannot be written. Captures every page error; the last page test fails on any that is not expected. Then two quits, each in a fresh app driven over `--inspect` (§4k): the last edit lands and every process goes, and every process goes even when the page never answers. `npm run test:app`. |
| `tools/test-app-features.js` | ~600 | The feature suites test-app.js runs: a smoke pass over every panel in every theme and in Arabic, the views (§4u), video and the board picture, JSON Canvas (§4t), Samsung Notes (§4w: onto the board and off again with one undo; the rich-text translation), and **2.1** (§4v): a note with no head, following a rope, `/link` at the caret, links to notes, ropes through copy/cut/paste/duplicate, the paste ghost, columns, a locked workflow on disk, ink on disk with undo and the eraser, the wheel in a long note, the Mono accent, menu sounds. The suite stubs `toSystemClipboard` — a test copy must never land on the real clipboard. |
| `tools/build-app.js` | 210 | Builds `src/` into `App/`, verifies the packaged payload, repoints the shortcuts. Run via `npm run build`. See §6. |
| `admin/` | — | Six `.cmd` launchers: run, sandbox, check, back up (a dated copy of My Boards beside the project), open My Boards, and **Build App**, which is how the app gets updated. |
| `.gitattributes` | — | Line endings. `*.cmd` is pinned to CRLF — a batch file checked out with LF fails in ways that look like anything but that. |
| `LICENSE` | — | MIT, plus the two bundled asset licences (Material Symbols, Noto). |
| `package.json` | — | `npm start` runs it, `npm run build` builds it. No installer config, no publish target, no runtime dependencies. |

`npm run check` — language, icons and batch-file line endings — and `npm test` —
the store and the app (§6) — are the checks, and `npm run build` runs both and
stops if either fails. No linter config.

**What 1.4 dropped, and why it is not coming back.** 1.3 carried
`electron-builder` with an NSIS installer, a portable target, a GitHub Actions
release workflow, `electron-updater`, and `RELEASING.md` to explain all of it.
Between the installed copy, the portable build's `%TEMP%` extraction, the
staged update and the folder the build script wrote, one machine could hold
four builds of this app — and a shortcut points at exactly one of them. That is
where "I updated it and it came back the same" came from. The whole apparatus
is gone; `@electron/packager` writes `App/` and that is the only copy. See §6.

---

## 3. Architecture in one paragraph

`index.html` declares the canvas and every overlay up front, and lists the
twenty-two scripts that follow. Between them they hold one mutable `state`,
render it into that fixed DOM, and write it to `Documents\My Boards` — one
`settings.json`, and a folder per board. There is no virtual DOM and no
reactivity: **you change `state`, then call the matching render function
yourself, then `saveSoon()`.** Notes and frames live in *world* coordinates;
`#world` is a single `translate() scale()` transform, so panning and zooming
never touch individual elements.

### The six preload globals

| Global | Gives you |
|--------|-----------|
| `window.mbData` | `load()` `save(payload)` `saveAsync(payload)` `snapshot(id,json,day)` `versionSnapshot(id,json,label)` `paths()` `openDataFolder()` `openBoardFolder(id)` `pickBackupDir()` `backupTo(dir)` `exportBoard(id,name)` `importBoard()` `readExternal(path)` `adoptFiles(beside,urls,toId)` `duplicateFiles(from,to,name,group)` `removeBoardDir(id)` — and JSON Canvas (§4t): `pickCanvasPath(suggested)` `writeCanvas(file,json,id,names,folder)` `importCanvas()` `readCanvas(path)` `resolveCanvas(dir,rels)` — and Samsung Notes (§4w): `pickSamsung()` `readSamsung(path,boardId)` |
| `window.mbFiles` | `pathOf(file)` `pickImage(purpose)` `pickVideo()` `savePng(dataUrl,name)` `describeEmbed(kind,id)` `playerUrl(kind,id)` `openExternal(url)` `openLocal(url)` `revealLocal(url)` `readImage(url)` — and the files a board carries: `attach(path,boardId,name)` `attachBytes(dataUrl,boardId,name)` `carry(urls,toId)` `listAttachments(boardId)` `unusedFiles(keep)` `removeUnusedFiles(keep)` `filesDir(boardId)` `openFilesDir(boardId)`. See §4n. |
| `window.mbWin` | `minimize()` `toggleMaximize()` `close()` `show()` `setBackground(on)` `setStrings(table)` `isMaximized()` `onMaximized(cb)` `onCapture(cb)` |
| `window.mbTheme` | `set(theme)` `isDark()` `onSystemChange(cb)` |
| `window.mbPad` | `start(address)` `stop()` `send(msg)` `addresses()` `onState(cb)` `onMessage(cb)` — the phone as a tablet (§4x). The renderer never sees the token and cannot pick a port; `send` passes only the `view` message. |
| `window.mbSys` | `info()` → `{ compositing, software, softwareRender }` — whether Chromium is drawing this window without a GPU. See §4c. |

**Every one of these is a thin IPC call; the work is in `src/store.js`, in
main.** Preload used to do the disk work itself. It moved because `mbf://`
(§4n) needs the id→folder map in the process that serves it, and two copies of
that map is how a picture goes missing.

`load()` and `save()` are **synchronous** (`ipcRenderer.sendSync`) on purpose:
the first runs before anything is drawn, the second on `beforeunload`, where a
promise never settles. Everything else is `invoke` and off the renderer's
thread — the writes go through `fs.promises` in main, so the UI never waits on
a disk.

**`save()` / `saveAsync()` take a payload, not a string, and return a status
per document:** `{ settings: json|null, boards: [{ id, name, group, json }] }`
in, `{ ok, errors: [{ id, error }], dirs }` out. Neither throws. One board's
folder being read-only does not stop the others landing, and the renderer
knows exactly which ones did — `writeNow()` keeps `lastWritten` per board and
only stamps the ones that landed. **A call that returns a status must have that
status acted on.** See §7.

`snapshot()` and `versionSnapshot()` return `{ ok, path }` / `{ ok: true,
skipped: true }` / `{ ok: false, error }` — never `null`, which used to mean
both "already done today" and "the write failed". `maybeSnapshot()` latches a
board id only after a success, so a failed snapshot is retried.

All six are absent when the page is opened in a plain browser; the renderer
falls back to `localStorage` (the 1.x one-document shape) and degrades the file
features. That fallback is deliberate — it makes the UI debuggable without
launching Electron.

### Persistence: the My Boards folder

```
Documents\My Boards\
  settings.json              the app's settings, templates, statuses, the
                             rail order (boardOrder) and the open board
  <Board name>\
    board.json               { mbBoard: 2, id, name, icon, …, notes, frames, links, view }
    board.bak.json           the previous good copy
    files\                   every picture, clip and document the board carries
  <Group>\<Board name>\      a board inside a group ("Move to…", §4r)
  Trash\                     the bin — an ordinary board with trash: true
  Backups\<Board name>\      YYYY-MM-DD.json, one per day, newest 14; and
                             before-<version>.json, taken once per upgrade
```

The whole design is those four lines: **a board is a folder, and the folder is
the whole board.** Copy it to a stick and it is complete, pictures included.
Drop it into anyone's `My Boards` and it is listed at the next launch. Delete
`My Boards` and the app starts as new. There is nothing anywhere else the user
would miss — `%APPDATA%\Mental Board` holds only Chromium's files, the window
rect, the tray-notice marker and `hangs.log` (§4k).

Rules that carry over from 1.x, and still hold per file:

- Writes are atomic: `.tmp` → copy current to `.bak` → rename over the top,
  for `settings.json` and for every `board.json`. Two scratch names, because
  the sync writer (the way out) and the async one (every other save) can
  overlap on the same file.
- **Only what changed is written.** `writeNow()` serialises each board, compares
  it to what last landed for that id, and sends only the ones that differ. A
  keystroke on a board of ten notes never re-serialises the four thousand on
  the others, which is most of what made a big 1.x store feel slow to save.
- `boardPayload()` serialises the whole board object minus two runtime keys,
  so **there is no whitelist to update** when you add a board field. Add it to
  `makeBoard()` and heal it in `adoptBoard()`. Settings likewise: `defaults()`
  and `adopt()`.
- A locked board is written as its envelope and nothing else, even while it is
  open. See §3b.
- The rail order lives in `settings.json`; a folder copied in by hand lands at
  the end, by name.
- `load()` → `adoptStore()` folds `{ settings, boards[] }` into the one-document
  shape `adopt()` has always taken, so the healing, the 1.0.x path and Import
  stay one function.

**Back up, and start again.** Settings → Your boards has three ways to a copy
and three ways back. `store.mirrorTo(dir)` copies what is new or changed into
`<dir>\Mental Board backup\` and never deletes there (the once-a-day one);
`store.backupAllTo(dir)` writes a complete dated copy, a new folder each time.
`store:erase-all` in main sends the whole `My Boards` folder to the Recycle
Bin (`shell.trashItem`, `rmSync` only if the Bin refuses), `store.reset()`
makes an empty one, and the renderer reloads — with `loadFailed` set first so
the flush on the way out cannot write the boards it still holds back into the
fresh folder. `migrateLegacy()` leaves a marker beside the 1.x file so an
emptied store does not bring the old board back at the next launch.

**A board the store cannot read is shown, and never written.** Its folder is
there and neither its `board.json` nor its `.bak` parses: it arrives with
`unreadable: true`, named after its folder, with a warning icon in the rail.
Switching to it is refused with a toast naming the folder, `writeNow()` skips
it, `deleteBoard()` refuses it, and its menu offers one thing — open the
folder. Collapsing that into "no board here" is how one half-copied file used
to become permanent loss (§3 "Refusing to save"). `loadFailed` still exists for
the case where the *folder itself* could not be scanned.

### The data folder is still a contract

`main.js` still **pins** userData to `appData/Mental Board`. Nothing of the
user's lives there now, but the single-instance lock is keyed to it, so two
builds of this app still cannot run at once (§6) — and the 1.x `board.json`
there is what `store.migrateLegacy()` reads, once, into an empty `My Boards`.
The old file is left exactly where it was.

- `--user-data-dir` still wins, and a sandbox run keeps its boards *inside* that
  folder (`.sandbox\My Boards`), so a test never touches the real ones.
- Chromium's own caches go to `%LOCALAPPDATA%/Mental Board/chromium`.
  `tidyOldCache()` removes the old copies once, by an explicit allowlist — it
  must never learn to delete anything it does not name.
- The Documents folder comes from `app.getPath('documents')`, which honours a
  redirected or OneDrive-backed Documents. That is a feature — the folder
  syncs — and the atomic writes mean a sync client only ever sees whole files.

### 3a. Boards, and why the live mirror exists

There are several boards and one is shown. The shape is:

```
state.boards      [ { id, name, icon, iconColor, updatedAt,
                      notes, frames, links, view, nextZ }, … ]
state.activeBoard  the id of the open one
state.notes …      the LIVE MIRROR of the open one
```

**Since 2.1 there is a sixth, `ink`** — the strokes drawn on the board (§4v).
It is bound, synced, snapshotted for undo, encrypted on a locked board and
emptied by the wipe exactly like `links`; `boardPayload()` writes it with no
list to update, and `adoptBoard()` heals it through `adoptInk()`.

`state.notes` / `frames` / `links` / `view` / `nextZ` still sit at the top level,
exactly where they were when there was only one board, and every other region
reads and writes them unchanged. **That is the whole trick** — boards cost 200
lines in §2 and §14b instead of a rewrite of all 4000.

Two functions keep the two copies honest:

- `syncActiveBoard()` — live → stored. Runs before every save and every switch.
  It copies whatever the references *currently are*, so it does not matter that
  `deleteItems`, `restore` and the wipe button replace `state.notes` wholesale
  rather than mutating it.
- `bindBoard(b)` — stored → live. Switching is `exitEdit`, sync, bind,
  `clearHistory`, `render`.

**`serialise()` is what gets written, not `JSON.stringify(state)`.** It drops the
five mirror keys, because writing them as well would double every board on disk
and give a future reader two copies that can disagree. It removes five *named*
keys rather than whitelisting the rest, so a new top-level field still persists
by itself — the property `save()` has always had.

**Undo does not cross boards.** The stack holds notes and frames; after a switch
those may belong to a board that is not on screen, so `switchBoard` calls
`clearHistory()`. Offering an undo that would drop one board's contents onto
another is worse than offering none.

`id` and `updatedAt` are stored and not yet read. They are there because the
point of boards is the shared/online mode that comes later, and any sync layer
needs to name a board and know which copy is newer. Storing them now is free;
retrofitting ids onto boards people already have is a migration.

### 3b. A locked board

One board can be encrypted at rest behind a passphrase. AES-GCM with a key
derived by PBKDF2, all of it WebCrypto — nothing here invents any cryptography.

The shape: `board.enc = { v, salt, iv, data }` holds the ciphertext and
`notes/frames/links` are empty on disk. `unlocked` is a Set of board ids opened
this session, in memory only, so quitting re-locks. `passOf` holds the
passphrase for those boards so `save()` can re-encrypt after every edit.

Four rules that keep it honest:

- **`serialise()` always writes the envelope**, never the plaintext, even for a
  board that is open. Re-encryption keeps `enc` current, but if that ever failed
  the worst case must be "an older ciphertext on disk", not "the plaintext of
  the board you locked".
- **`syncActiveBoard()` refuses on a locked board that is not open.** It holds no
  plaintext, so copying the live arrays onto it would write the previous board's
  contents over it and drop the ciphertext.
- **Locking verifies the round trip before dropping anything.** `lockBoard()`
  encrypts, decrypts what it just encrypted, checks the note count matches, and
  only then clears the plaintext. A bug in this code cannot silently turn a
  board into an envelope that will not open.
- **`save()` stays synchronous unless a locked board is open — and always on
  the way out.** Re-encryption is WebCrypto, so the debounced save for a locked
  board is async. `save(true)` is not: `flushSave()` runs on `beforeunload`,
  where an `await` does not finish before the window goes, so taking the async
  branch there wrote **nothing at all** — not the locked board and not the other
  boards either, whose work has nothing to do with the encryption. Every close
  silently dropped everything since the last debounce, and `writeNow()` never
  ran so nothing reported it. `save(true)` now writes immediately with whatever
  envelope the last debounce left; `serialise()` writes `enc` and never the
  plaintext, so this cannot leak a locked board.
- **The close button waits; nothing else can.** `closeAndQuit()` in §16 is the
  one exit the renderer owns, so it re-encrypts *first* and then lets
  `flushSave()` do the single blocking write. That recovers the last few seconds
  of typing into a locked board, which the paragraph above gives up. Alt+F4,
  Quit from the tray and a shutdown all arrive at `beforeunload` instead, where
  the synchronous write with the last good envelope is the backstop.

**It locks the text, not the files.** `notes`, `frames` and `links` are
encrypted; the pictures, video and documents the board carries are not. They sit
in the board's own `files\` folder under their own names, readable by
anyone who can read the disk — which is the very thing this feature is for. The
board's *notes* no longer say which file is which, and that is the whole of what
the lock buys here. Encrypting a two-gigabyte attachment store is a different
feature with a different cost, so the honest move was to stop implying
otherwise: `pass.lockBody` now says it in the confirm dialog, in both languages.

What it does **not** protect: an open board is plaintext in memory like any
other. This is protection from someone reading the disk or a backup, not from
someone sitting at an unlocked machine. And there is no recovery — the confirm
dialog says so in those words.

### One folder per board, since 2.0

1.x kept every board in one `board.json` and said so was deliberate: one file,
one rename, one recovery story. 2.0 reverses it, and for the reason 1.x named
as the way out — `updatedAt` already said which boards were dirty. The trade
is now the other way round: a save costs one board's JSON, and the price is
that the store is a folder walk rather than a file read, which `store.scan()`
does once at boot.

What moved with it: the live mirror (§3a) is unchanged — `state.notes` is
still the open board's array — and `serialise()` still produces the 1.x
one-document shape, for the browser fallback and for anything that wants the
whole store as one JSON. Nothing on disk is written by it any more.

### Migrating a 1.0.x board is the risky path

`adopt()` takes both shapes. A file written by 1.0.x has `notes`/`frames`/`links`
at the top level and no `boards`; anything newer has `boards`. The fallback when
`boards` is absent is **not an empty board** — it is the old top-level fields
read into one:

```js
const legacy = { name: '', icon: 'sticky_note_2', notes: raw.notes, … };
const list = (Array.isArray(raw.boards) && raw.boards.length) ? raw.boards : [legacy];
```

Get that backwards and the app opens empty on somebody's real board, then saves
the emptiness over it on the next keystroke. If you touch `adopt()`, test it
against a 1.0.x file before anything else.

### Refusing to save is a feature

`loadBoard()` in `preload.js` returns `{ board, status }`, and `status`
distinguishes **`empty`** (no file — a real first run) from **`unreadable`**
(a file is there and would not parse). On `unreadable` the renderer sets
`loadFailed`, `save()` becomes a no-op, no welcome note is seeded, and the user
gets a dialog naming the folder and the recovery files.

Collapsing those two states is what turns one unreadable file into permanent
data loss: the app treats it as a first run, seeds a welcome note, and saves it
over the file it just failed to read. Keep them apart.

---

## 3c. Twenty themes, and how to add the twenty-first

A theme is **two things and nothing else**: a row in `THEMES` (js/helpers.js) and
a `:root[data-theme="<id>"]` block of surface tokens. There is no third place —
no registry, no picker list, no per-theme note colours — because `data-mode` on
`<html>` carries the nine note colours and every theme inherits all nine by
declaring itself `light` or `dark`.

**Mental Board** and **Mental Board Light** are the two added in 2.0, and the
first is the default. Near-black with a cold cast, bone-white text, hairlines
where the others have shadows — and only surface tokens, like every other row.
The *chrome* that arrived with them (sharp corners, tracked labels, the
settings nav, selection as a bar of light) is `css/mental.css` §53 and applies
to all twenty; see §5c.

So adding one is:

1. a row in `THEMES` with `{ id, name, mode, swatch: [bg, surface, text] }`
2. a token block at the end of css/later.css, copied from the nearest existing
   theme and re-tinted — the same variable set in the same order as §2
3. `'theme.<id>'` in **every** `assets/lang/*.js` (check-lang fails the build
   otherwise; `theme.` is one of the prefixes it exempts from the *used* scan,
   so a missing translation is caught but a missing English key is not — write
   both)
4. `--c-default-b` only if the theme's own surface would let an untinted note
   disappear into its canvas

The eleven of 1.4 became eighteen in 1.5. The six added are not more shades of
what was there — each one filled a hole somebody could name:

| Theme | The gap it filled |
|---|---|
| Meadow | a light theme that is not grey, white or beige |
| Blossom | the warm end of that same idea |
| Contrast | edges you cannot miss: hairlines at .42 instead of .13, black on white, a grid you can read. A legibility choice, not a hue. |
| Nordic | a *mid* dark — lighter than Dark, cooler and bluer than Dim |
| Ember | the only warm dark; every other one is blue, green or purple |
| Graphite | Mono's dark twin. No hue anywhere, so colour-coded notes have nothing competing with them. |

**Contrast is deliberately not white-on-white.** Its canvas is `#f4f4f4` and its
notes are `#ffffff`, because a note has to be findable against the paper and
that is the whole job of the theme. Maximum contrast between *text and its own
background* is not the same thing as no contrast between a note and the board.

---

## 3d. What picks the theme, and the palette you build yourself

`state.settings.themeMode` is the whole answer, and it has three values:

| Mode | What decides |
|---|---|
| `fixed` | `settings.theme`, and nothing changes it |
| `system` | Windows, swapping `lightTheme` / `darkTheme` |
| `clock` | the time of day, swapping at `dayAt` / `nightAt` |

`matchSystem` is the boolean this replaced. It is **still written and still
read** — `adopt()` derives `themeMode` from it when the mode is missing, and
every write keeps the two in step — so a board that moves between an older and
a newer build keeps the choice either way round. Only one of the two is ever
authoritative, and it is `themeMode`.

### The pair, and who sets it

`system` and `clock` differ only in *what asks the question* — both answer it
with the same two fields, `settings.lightTheme` and `settings.darkTheme`. Both
have been stored since the modes existed; until 1.4 the only way to set them was
sideways. `pickTheme()` records whichever slot matches the picked theme's own
`mode` **and** forces `themeMode = 'fixed'`, so building a day/night pair meant
switching to fixed, picking a light theme, picking a dark theme and switching
back, with nothing on screen saying that was what you were doing.

`buildPairPickers()` in §15 is now the direct route: two selects in Settings →
Appearance, shown whenever `themeMode !== 'fixed'`, each listing **every** theme
with its three swatches beside the name.

Two decisions worth keeping:

- **Neither list is filtered by the theme's own mode.** The slots do not mean "a
  light palette" and "a dark palette" — they mean *the one you want in the day*
  and *the one you want at night*. Dim by day and Midnight at 2am is a
  deliberate choice, and filtering would be the app overruling somebody about
  their own eyes.
- **The pickers do not touch `themeMode`.** They exist *because* you are in a
  paired mode; dropping you into `fixed` would undo the thing you opened them to
  set up. That is the opposite of `pickTheme()`, which is an explicit "show me
  this one now" and should keep kicking you to `fixed`.

Three things about the clock mode:

- **It is watched, not read once.** `startThemeClock()` ticks every minute and
  reapplies only when the answer changed. Reading it at boot would mean the app
  never got dark until you restarted it, which is the same as not having it.
- **`clockSaysDark()` is written as "the night has started", not "the day has
  ended".** That makes the midnight wrap fall out for free, and it means
  someone who works nights can invert the two times and get exactly the inverse
  with no special case anywhere.
- **Equal times never switch.** That is a fixed theme by another name, so it
  behaves like one rather than being rejected with an error nobody needs.

### The custom palette

`theme.custom` is a real row in `THEMES`, so every place that validates a theme
id, resolves a light/dark pair or draws a picker card gets it for free. It is
the only row whose `mode` and `swatch` are not fixed — `themeById()` fills both
in from `settings.customTheme`.

The palette itself is **three colours and a mode**: canvas, notes, text, and
whether the app should use its light or its dark note colours. Everything else a
theme needs — the raised surfaces, the dimmed text, the hairlines, the grid, the
shadows, the overlay — is derived in `customVars()`. That is deliberate and it
is the reason this feature is safe to ship: there is no combination of three
inputs that produces text you cannot read on its own background, because the
contrast-carrying tokens are all mixes of the colours you chose rather than
separate choices you could get wrong.

Two traps that are already handled:

- **`applyTheme()` clears the inline properties before every apply.** A custom
  theme is CSS variables written onto the root element, and an inline value
  beats any stylesheet rule — so switching *away* from custom without clearing
  them would tint every built-in theme with the custom one forever.
- **The editor is shown whenever custom is *in play*,** not only when it is the
  current pick. Under `system` or `clock` it can be one of the two slots, and
  hiding the controls while the palette they edit is on screen is the one time
  you cannot reach them.

---

## 4. `src/js/` — the app, in twenty-two files

One `renderer.js` of 7,862 lines became fifteen scripts; 2.0 added two
(`pictures.js`, `page.js`) and 2.1 four more (`canvas.js`, `views.js`, `sound.js`, `ink.js`) and 2.2 two (`samsung.js`, `tablet.js`). Nothing about how the
code works changed: they are **plain scripts, not modules**, so they share one
global scope exactly as the single file did. There is no `import`, no `export`,
no bundler and no build step — the only thing joining them is the order
`index.html` lists them in.

| File | Lines | What is in it |
|------|------:|---------------|
| `helpers.js` | ~490 | `$()` `clamp` `uid` `esc` `stripHtml` `maxOf`/`minOf`, `THEMES` (18), `ACCENTS` (15, with `mono`), an item's colour (`okItemColor` `paintColor` `colorStyle` `colorName`, §4v), `icon()`, and the language layer: `t()` `te()` `num()` `pct()` `setLang` `applyStaticText`. See §4a. |
| `state.js` | ~1150 | One mutable `state`. `makeBoard` `canEditHere` `adoptBoard`/`adopt` `serialise()` `writeNow`/`save` `reportSaveFailure`, per-note history, the status list, `okDateKey()` (§4s), and the settings tables (`THEME_MODES`, `LINK_STYLES`, `okClock`). See §3a, §3b. |
| `sound.js` | ~400 | **Menu sounds** and **typing sounds** (2.1, both in Settings ▸ Extra): `keySfx` `KEY_SWITCHES` `wireKeySounds`, and `sfx(kind)` — move, select, back, open, toggle — synthesised with Web Audio through a generated room reverb, and `wireSounds()`, which hears menus by delegation and a MutationObserver. Off unless `settings.sounds`. See §4v. |
| `theme.js` | ~340 | `clockSaysDark`/`startThemeClock`, `customVars()`, `applyTheme`, **`applyThemeFaded(ms)`** (a View Transition crossfade, §4v), `applyLang`, `applySettings`, and the graphics tiers: `gpuName` `detectPerf` `resolvedPerf` (§4c). See §3d. |
| `view.js` | ~540 | `applyView` `toWorld` `toScreen`, the cached `vpRect()` (§4c), `render()`, and viewport culling: `syncMounted` `fillStubs` `ensureMounted` `applyFarMode`. See §4c. Also the pills under a note — `paintNoteStatus` (status **and date**), `setStatus`, and the dates: `setNoteDate` `dateState` `dateLabel` `fmtDay` `dayKeyIn` `watchDayChange`. See §4s. |
| `items.js` | ~950 | `makeNote` (no head since 2.1) `makeFrame`, the far-zoom stub and its text ghost (`stubNote` `noteGhost` `ghostBlocks`, §4c), **`lockFrame`** (§4v), the status pill, `lazyImages` (which also hands every drawn body to `watchVideos`), the one drag/resize gesture engine, **the alignment guides** (§4o), the selection set, and the camera (`zoomAt` `flyTo` `fitTo`, and `onWheel`, which lets a long note scroll — §4v). |
| `links.js` | ~400 | The ropes: `ropeColor`/`applyLinkStyle`, `anchor`, `ropePath`, `drawLinks`, and since 2.1 **following** them — `followRope` `goToNote` `flashNote`, the end highlight (`markRopeEnds`), the ropes of the selection drawn over the notes (`drawHotRopes`), `linksOf` `unlinkNote`. See §4d, §4v. |
| `ink.js` | ~640 | **Drawing on the board** (2.1): the strokes (`adoptInk` `inkPath` `drawInk` `syncInk`), the pen (`toggleInk` `setPen` `buildInkBar`), a stroke (`beginInk` → `onInkMove` → `endInkGesture`, `brushWidths`), the eraser (`eraseAt` `strokeNear`), **selecting** (`inkSel` `beginInkPick` `moveInkPick` `endInkPick` `deleteInkSelection` `pickInkColor` `recolorInkSelection`), and `paintInkOnCanvas` for the board picture. See §4v. |
| `editor.js` | ~1500 | The note editor — markdown shortcuts (`$…$` a formula, `a.`/`I.` a lettered or Roman list), **formulas** (`mathHtml` `paintMath` `renderTex` `insertMath`, §4y), `ensureTail` (a table is never last), `insertStyledList`, `normalizeBody` (which since 2.1 also strips the styles `insertHTML` freezes in and calls `repairColumns`), code colouring, tables, columns (`repairColumns` `columnsBroken` `columnEdgeKey`), user templates, the paste sanitiser. |
| `embeds.js` | 318 | Bookmark cards, click-to-play video, `/video`, and the paste-as menu. See §4e. |
| `toolbars.js` | ~650 | The floating selection toolbar (`applyFontPx` sizes text runs, never blocks — `textRunsIn`), `BLOCKS` and the slash menu (ranked by `blockRank`) — the chrome that sits over the editor. |
| `media.js` | ~740 | The icon picker; `watchVideos()` (§4n); images (select, resize, align, the crop/annotate studio — which writes its result back as a file in the board's folder, §4n); and **the files a board carries** — `takeFileIn`, `fileHtml`, `attachmentUrls`, `carryNotesTo`, `relinkAttachments`, `revealFile`. See §4n. |
| `pictures.js` | ~230 | **A picture standing on the board** — `fillPicture`, `addPicture`, the shape-keeping resize (`fitPictureBox`), the drop into a note (`trackPicTarget` / `finishPicDrop`), the studio on it, `replacePicture`, and the way back out of a note. See §4q. |
| `menus.js` | ~540 | The right-click menu (colour, status and **date** rows, §4s; linked notes, copy, lock — §4v), `openRopeMenu`, and the compass that signposts off-screen workflows. See §7. |
| `edit-ops.js` | ~915 | Create, delete (`askThenDelete` is the one door), **arrange**, duplicate, **the trash**, undo, the clipboard, find, and **the image export** (`loadExportPictures` → `paintBoardCanvas`, which draws the ink since 2.1). See §4f and §4g. |
| `boards.js` | ~1500 | Several boards, one rail: switching, the flyout, locking, drag-to-board, undo (including the `ink` step), the clipboard with its ropes (`clipLinks` `retieLinks`), **the paste ghost** (`beginPasteGhost` … `commitPasteGhost`), and the JSON export/import. |
| `settings.js` | ~1640 | The settings panel and every dialog behind it (the formula window: `openMathDialog` `applyMath` `MATH_SNIPS`, §4y; the link dialog: `openLinkDialog` `applyLink` `linkNoteMatches` `applyNoteLink` `followNoteLink`, §4v), the rail (with its group headings), the board menu, the description footer (`wireSettingsDesc`), `resetSettings()` and the stats cache. See §5b. |
| `page.js` | ~345 | **The page menu** at the top right and what a board decides for itself: `applyBoardLook()` (font, small text, background), `openPageMenu`, `copyBoardContent`, groups (`openMoveTo` / `moveBoardToGroup`), the inline rename. See §4r. |
| `canvas.js` | ~430 | **JSON Canvas** — `boardToCanvas` / `exportCanvas`, `canvasToBoard` / `importCanvas` / `importCanvasFile`, and the two translators `noteToMarkdown` and `markdownToNote`. See §4t. |
| `samsung.js` | ~300 | **Samsung Notes** — `importSamsung` (the page menu) / `importSamsungFiles` (also the canvas drop), `samsungToBoard` (one workflow: the text note, the pictures, the ink), `samsungStroke`, and the rich-text translation `richToHtml` / `runsHtml` / `samsungHref`. See §4w. |
| `views.js` | ~355 | **The minimap** (`drawMinimap`, `scheduleMinimap`, `wireMinimap`), **the agenda** (`openAgenda`, `renderAgenda`, `datedNotes`), **the board as columns** (`openKanban`, `renderKanban`), and `noteTitle()`. See §4u. |
| `tablet.js` | ~270 | **The phone as a tablet, the renderer's half** (2.2): the pairing panel (`wirePad` `startPad` `paintPadPanel` `qrSvg`), the phone's region (`padRect` `paintPadArea`, 2.2.1), the pictures (`padDirty` → `padPump` → `mbPad.frame`, `padGot`), what the phone is told (`sendPadView` `padPalette` `padCanDraw`), and what it says (`onPadMessage` → `beginPadStroke` / `movePadStroke` / `endPadStroke`, `padErase`, the arrow `beginPadPick` + `padSelection`, `padUndo`, `padPan`, the hover ring). Strokes go into `state.ink` exactly as ink.js puts them there. See §4x. |
| `init.js` | ~1440 | Pointer routing, the keyboard map, `init()`, `wireExtras()`, `STATIC_ICONS`, the canvas drop (`onCanvasDrop` → `noteFromDroppedFile` / `noteFromTaken`, `addMediaFromPicker`, `measureVideo`) — every event listener in one place — including, since 2.1, the rope press, the pen's pointer and keys, and Ctrl+V's hold (§4v). **Start here when a click does nothing.** |

### The load order is the only contract

`index.html` lists the scripts, and that list is the whole architecture. Two
things follow from it, and only two:

- **A file may read a `const` or `let` from a file above it while it is being
  evaluated, and not from one below.** Top-level lines like
  `let state = defaults()` and `const CUSTOM_VAR_NAMES = …` run at load time, so
  they can only see what has already been declared. Function *declarations* are
  hoisted within their own file and become globals for every later one, which is
  why almost nothing has to care about this.
- **After `init()` runs, everything can reach everything.** Every handler, every
  render function and every callback is called long after the last script has
  been evaluated, so ordering is invisible to all of them.

Move a file up the list and a top-level line in it can land in the temporal dead
zone of a `const` it used to be able to see. That throws on boot rather than
failing quietly — but it throws when *that file* is reached, so the message
names the file after the one you moved. If the window comes up blank, open
DevTools before anything else.

Adding a file is a `<script>` tag in `index.html` and nothing else. There is no
manifest, no list in a build script, and no registry to keep in step — the
checks read the tag list, which is why `tools/app-source.js` parses `index.html`
rather than keeping its own copy of the order.

The `/* ─── n. name ─── */` banner comments still mark the sections inside each
file; grep for `───` to see a file's shape.

### Conventions worth knowing

- `$(id)` is `document.getElementById`. Used everywhere.
- Mutate `state` → call `render*`/`draw*` → call `saveSoon()`. In that order.
- Overlays are hidden with the `.hidden` class, not inline `display`.
- A note is `{id,x,y,w,h,body,color,icon,iconColor,z}`; a frame is
  `{id,x,y,w,h,title,color,icon,iconColor}`. Links only ever join two **notes**.
- `iconColor` is `'auto'` (track the note's own colour) or one of `COLORS`, so
  icons re-tint with the theme instead of storing a dead hex value.
- Themes are keyed two ways: `data-theme` on `<html>` picks the surface
  palette, `data-mode` (`light`/`dark`) picks the nine note colours. A new
  theme only has to define surfaces.
- A note "belongs" to a frame when its **centre** is inside it — see
  `notesInFrame()`. Nothing is stored; membership is recomputed.
- Note bodies are `contenteditable` and formatted with `document.execCommand`.
  Yes, it is deprecated. It is also the only thing that gives you a caret-aware
  rich-text editor in 400 lines. See §7 for the traps that come with it.
- **`els` holds the items that are mounted, not all of them.** Above 60 items
  the ones far from the viewport are not in the document at all, so
  `els.get(id)` returning nothing is normal and every caller guards for it.
  See §4c.

---

## 4f. Arrange

`arrangeSelection(mode)` in `edit-ops.js`, on `grid` · `row` · `column`, from
the right-click menu or Ctrl+Shift+G. Notes only — a workflow frame is a
container, and moving one would drag everything inside it somewhere nobody put
it.

Three decisions do the work:

- **Reading order is preserved.** Items are sorted top-to-bottom then
  left-to-right, *banded* so two notes whose tops differ by less than 24px count
  as the same row. Sorting on raw `y` reshuffles a row that was already tidy,
  and scrambling an order the user can see is the one thing an arrange must
  never do.
- **The cell is the largest item, not the average**, and anything smaller is
  centred in it. Packing to the average leaves the big ones overlapping, which
  is the opposite of the job.
- **It anchors on the selection's own bounding box**, so the block stays where
  it was instead of jumping to the middle of the screen.

Ctrl+Shift+G rather than Ctrl+R: **Ctrl+R reloads the window** and that is how
this app is developed. Group and arrange are the two things you do to a
selection of several, so they share a letter and differ by Shift.

---

## 4g. The trash, and the board as a picture

### The trash is a board

`trash: true` on an ordinary board, made on demand by `ensureTrash()`. That is
the whole design, and it is the same trick boards themselves use: it saves,
loads, renders, culls, searches and survives a restart through code that already
existed, with no second storage shape to keep honest. Anybody who never deletes
anything never has one, and the tile disappears again when the bin is emptied —
which is also how you find out a delete was reversible, at the moment it
matters.

Deleting moves an item there with `trashedFrom` and `trashedAt` on it.
`putBack()` reads the first and returns the item to its own board, falling back
to the first live, unlocked board when that board is gone. Deleting a board
moves its contents to the bin first, so "I deleted the wrong board" costs its
name and nothing else.

Four rules hold it up:

- **Deleting *inside* the bin is final.** `deleteItems()` checks whether the
  active board is the bin before moving anything, or the bin would put things
  back into itself and never empty.
- **`putBack()` rebinds when the bin is open.** `state.notes` is the live mirror
  — the same array object, not a copy — and the filters that remove the restored
  items replace `tb.notes` with new arrays. Leave the mirror on the old ones and
  the next save copies them straight back over the new: the item ends up on its
  own board *and* still in the bin. This is `syncActiveBoard()`'s trap from the
  other side, and it was a real bug before it was a rule.
- **Its fallback may never be "the board in front of you".** That is the same
  aliasing one step further on, and it was the second real bug here. Put back is
  only offered while you are *standing in the bin* — `onTrashBoard()` gates the
  menu row — so "the board in front of you" **is** the bin, and `state.notes` is
  `tb.notes`. Pushing onto it put the item back into the bin, where the filters
  above then removed it along with the copy it was meant to replace: the item
  landed on no board at all, the toast said "Put 1 item back", and only Ctrl+Z
  could tell you otherwise. It fired whenever the origin board had been deleted
  or locked since. The fallback is `liveBoards().find((b) => !isLocked(b))`, and
  when there is no such board the item **stays in the bin** and is said so —
  the bin is the one place it is still safe. A locked board is not a candidate
  in either position: it holds no plaintext, and `syncActiveBoard()` would
  refuse to store what was pushed into it, which is the same disappearance by a
  longer route.
- **A locked board's contents cannot go in the bin.** There is no plaintext to
  move, so deleting one really does delete them — and the confirm says that
  instead of promising a recovery that is not there.

`emptyTrash()` is the only irreversible delete in the app, and the only one that
asks.

### The picture is drawn, not screenshotted

`paintBoardCanvas()` draws the board onto a `<canvas>` from `state` — it does
not rasterise the DOM. That is deliberate and it is why it works at all.

Rendering the real DOM would mean an `<svg><foreignObject>` carrying the whole
stylesheet, with every `file://` image inlined and every font embedded — and an
SVG loaded into an `<img>` runs in *secure static mode*, where none of the
external references it would then need are allowed. Drawing from the model has
no such cliff: it always produces a picture, it never taints the canvas, and it
needs nothing from the network or the disk.

What you lose is exact typography inside a note: a heading is drawn bigger and
bolder, a list gets bullets and tick boxes, and finer formatting is flattened.
What you get is what a board picture is for — where everything is, what colour
it is, and what is joined to what. Frames, ropes, note icons and status pills
are all drawn, in the theme that is showing, with `ropePath()` reused through
`new Path2D(d)` so the ropes in the picture are the ropes on screen.

**Pictures standing on the board are drawn too.** An `<img>` straight off
`mbf://` would taint the canvas and `toDataURL()` would refuse, so
`loadExportPictures()` reads each one through main as a data URL
(`mbFiles.readImage`) and decodes it *before* the theme swap — decoding is
async and `withTheme()` must stay synchronous. `paintBoardCanvas(board, scale,
pictures)` draws a decoded one at its box and falls back to the framed
placeholder for one that would not read. Pictures *inside* a note are still not
drawn: the note's text is laid out by hand here, and an image in the middle of
it would need real layout.

**It needs its own preload call.** `mbData.exportTo()` writes UTF-8; handing it
a PNG would write the *text* of the bytes and produce a file nothing opens.
`mbFiles.savePng()` goes to `file:save-image`, which decodes the data URL in
main and writes a Buffer — and like `save()`, it returns `null` (cancelled),
`{ path }` or `{ error }`, and the renderer has to act on which.

---

## 4h. Pasting a picture

Take a screenshot, click the board, Ctrl+V. It lands in a note of its own,
sized to the picture.

Two separate things were wrong, which is why it had never worked:

- **`toUrl()` returned the app's own folder.** `webUtils.getPathForFile()` gives
  back an empty string for a File the clipboard made — a screenshot has never
  been a file, so it has no path — and `pathToFileURL('')` neither throws nor
  returns null. It resolves `''` against the working directory. Every pasted
  screenshot therefore became `<img src="file:///D:/Projects/…/">`: a broken
  image, silently, and the data-URL fallback underneath it was never reached
  because the call had "succeeded".
- **Nothing listened on the canvas.** Inside a note the editor's own paste
  handler already caught an image. Outside one, Ctrl+V meant the *internal*
  clipboard — the notes you last cut or copied — and a screenshot is not one of
  those, so the most obvious way anybody would try did nothing at all.

`pasteAnything()` handles both shapes the clipboard uses: pixels (a screenshot,
inlined as a data URL, 6 MB cap) and a file reference (copying an image in
Explorer, kept as a `file://` URL so it costs nothing to store). An image beats
the internal clipboard, because if you have just taken a screenshot that is
plainly what you meant — and the notes you copied earlier are still there
afterwards.

The note is measured before it is made, not resized after the image decodes: a
note that changes size a beat after it appears reads as a glitch rather than as
fitting. `lastCanvasPoint` is tracked on the pointermove the rail peek already
handles, so the note lands where you were looking rather than in the middle of
the viewport — a paste has no position of its own.

---

## 4i. Where a workflow's title sits

`f.titlePos`, one of the nine codes in `TITLE_POS`: an edge (`t` above, `i`
inside the top, `b` below) and a side (`l` `c` `r`). It lands on the frame
element as `data-title` and css/later.css §43 does the rest — the frame's own
geometry is never touched, so moving a title cannot move the frame or anything
inside it.

It became a choice because one position could not cover the cases. A workflow
pushed against the top of the viewport had its name off screen entirely, and two
frames stacked closely enough put one frame's title on top of the frame above
it. Both are ordinary things to do on an infinite canvas. `i` — inside the top
edge — is the one that always fits, whatever is above the frame.

Three things worth knowing:

- **The picker is a 3×3 map of the frame, not nine named rows.** The grid *is*
  the shape being chosen, so nothing has to say "top right" and nothing in it
  needs translating. It sits in the context menu beside the colour swatches, for
  the same reason those are swatches: it is a thing you look at and adjust.
- **Left and right stay physical in every language.** The RTL rule that used to
  mirror `.frame-title` is gone. A workflow is placed by world coordinate like
  everything else on the canvas, and a language should not move something the
  user put somewhere — the same call the fab and the zoom bar got.
- **`setTitlePos()` does not `pushUndo()`.** The undo stack holds notes, frames
  and links, so a snapshot taken for a title move would restore a canvas
  identical to the one on screen and make the next Ctrl+Z look broken. Same
  branch `commitIconChange()` has for a board's icon.

---

## 4k. Running with the window shut

Closing the window used to end the app — `window-all-closed` quit and there was
no tray. Which meant the two features that are only worth anything when the app
is *not* in front of you were both dead the moment you closed it: every reminder
you had set, and the global capture hotkey.

Now the close button hides, a tray icon keeps the app reachable, and quitting is
something you ask for. Four pieces, and each one is load-bearing:

- **`quitting`** — set by `before-quit`. The `close` handler calls
  `e.preventDefault()` and hides *unless* this latch is up, so a real quit still
  gets through and the renderer still gets its `beforeunload` → `flushSave()`.
- **`runInBackground`** — mirrors `settings.background`, pushed over
  `win:background` from `applySettings()`. Off means close quits, exactly as
  before, and the tray is destroyed. There must be no way to end up with the
  window hidden and no tray to get it back, which is why `buildTray()` sets
  `runInBackground = false` if the tray ever fails to construct.
- **`backgroundThrottling: false`** — Chromium throttles timers in a hidden
  window to about one a minute, and the reminder ticker is a 20s timer in the
  renderer. Without this a reminder could arrive a minute late or in a clump,
  which is the whole bug this was meant to fix. The renderer does nothing else
  while idle, so it costs nothing worth measuring.
- **`.tray-notice`** — a marker beside the board, so "Mental Board is still
  running" is shown once in the life of the install. A window that vanishes
  with no word is indistinguishable from an app that closed, and the user finds
  out their reminders "did not work" days later.

The Quit item in the tray menu is not optional. With the close button hiding,
an app with no visible way out is one people end in Task Manager — which is the
one exit that skips the final save.

### A quit always ends the process (2.2.2)

`app.quit()` closes the window, and Chromium does not finish closing it until
the page has answered `beforeunload` (where `flushSave()` writes). A page that
never answers — hung in a loop, or frozen in a `sendSync` whose handler threw —
stalled the quit **for ever**: `before-quit` and the window's `close` fired,
then nothing. `will-quit` never ran, so the tray icon and the LAN server stayed
up, and all four processes stayed alive, with the window still on screen if it
was showing. 2.2.1 did this twice in one day, and a process that will not go
blocks `npm run build` (build-app.js refuses while it runs) until it is killed.

- **`armQuitWatchdog()`** — armed in `before-quit` *and* in the `close` handler
  whenever the close is real (`quitting || !runInBackground`), because with Run
  in background off `before-quit` only comes *after* the close completes. Past
  `QUIT_GRACE_MS` (8 s) it runs `teardown()` and `app.exit(0)`. A page that
  answers writes in milliseconds and is gone long before that; a page that is
  merely busy still gets 8 s to land its save. A page that never answers has
  lost its unsaved seconds whatever happens, so keeping the process alive saves
  nothing.
- **`teardown()`** — what `will-quit` does (hotkey, player server, tablet,
  tray), shared with the watchdog. Every step is safe to repeat.
- **`onSync()`** — every synchronous IPC handler goes through it, so a throw
  still sets `returnValue`. A sync handler that throws before setting it leaves
  the page frozen inside `sendSync` for good, which is one way to get a page
  that cannot answer `beforeunload`. A new sync channel goes through `onSync()`
  with the answer it gives on failure.
- **`hangs.log`** — in userData, beside `window-state.json`. One line when
  Chromium calls the page unresponsive or responsive again, and one when a quit
  had to be forced. *Why* the page stopped answering in 2.2.1 was not found —
  the dev app, the built copy, a copy of the real boards, a paired phone
  streaming strokes, a playing video, DevTools and a hidden window all quit
  cleanly — so this is how the next one gets caught. Trimmed past 64 KB.

`tools/test-app.js` ends with two quits, each in an app of its own: one checks
an edit made just before Quit is on disk and every process is gone; the other
hangs the page (`for (;;) {}`) and checks every process is still gone. Quit is
asked for as the tray does — `app.quit()` in main — over the Node inspector
(`--inspect`). Two traps in that harness: the inspector's `require` exists only
while the expression runs, so capture modules before any timer; and the page's
DevTools socket must stay open until the app has gone — **detaching DevTools
from a hung page lets the quit through**, which makes the test pass without
the fix.

---

## 4j. The boards window

The rail's flyout, in the top-left corner. `renderBoardRail()` in §15 builds it;
`boardRowHtml()` builds one row; later.css §30 styles it.

One markup shape serves both rail modes — `pinned` insets `#stage`, `hover`
floats a launcher with the panel hanging off it — so switching modes is a class
on `<body>`, not a different render. `Ctrl+B` opens it in either, and turns the
rail back on if it was off, the same way `renameBoard()` already did.

A row is a `<div class="br-row">` wrapping a `<button class="br-tile">` plus an
action cluster. **The wrapper is not decoration:** a `<button>` inside a
`<button>` is invalid and the parser silently unnests it, so the tile that
switches board and the buttons that act on it cannot be one element. Two things
follow:

- The hover/active background lives on the **row**, not the tile. The tile stops
  where the buttons begin, so a background on it drew a selected row that ran
  out two thirds of the way across the window.
- The cluster is `position: absolute` over the trailing end. Giving it a column
  of its own left a third of the window permanently empty — every row paying,
  all the time, for three buttons wanted on one row at a time. It fades in over
  the item count, which is not something anyone is reading at the moment they
  reach for the pencil.

The three buttons are icon, rename and ⋯. ⋯ opens the same `openBoardMenu()` the
right-click always did, so **nothing moved** — everything that was behind a
right-click is still behind it, and now has a visible way in as well. Renaming
still goes through `renameBoard()`, which finds its target with
`.br-tile[data-board="…"]`; keep `.br-name` inside the tile or that breaks.

Changing a board's icon must not `pushUndo()`. The undo stack holds notes,
frames and links, so a step taken for a board icon restores a canvas identical
to the one on screen and makes the next Ctrl+Z look broken —
`commitIconChange()` has the branch.

---

## 4l. Reminders that survive being away

Two things were wrong with reminders and they compounded: nothing fired while
the app was shut (§4k fixes that), and everything overdue fired **at once** on
the next launch — three days away meant three notifications stacked up for
things one, two and three days stale, which is a wall you dismiss without
reading.

`checkReminders()` now **gathers first and notifies second**. One due note fires
on its own, exactly as before; more than one in a single pass collapses into a
single grouped notification naming the first few. That falls out of the same
code path rather than needing a "did we just launch?" flag: while the app is
running, at most one or two ever come due in one twenty-second tick.

`repeat` on a note is `'' | daily | weekdays | weekly | monthly`, and `''` is
what every reminder written before this was, so no board needs migrating. A
repeating reminder is never latched `reminded` — it moves to its next occurrence
and stays armed.

`nextOccurrence()` has the two details that matter, both about the app having
been shut:

- **It rolls forward past now, in a loop.** A daily reminder and a fortnight
  away is fourteen missed occurrences. Advancing by one would fire, advance a
  day, fire again on the next tick, and keep going until it caught up —
  fourteen notifications for one task. Skipping to the next one that has not
  happened yet is what somebody back from leave actually wants.
- **Month arithmetic is clamped, and month-end is sticky.** `setMonth(+1)` on
  31 January gives 3 March, because February has no 31st and JavaScript rolls
  over. Clamping alone is not enough either: Jan 31 → Feb 28 → Mar 28 walks a
  month-end task back to the 28th for good. So if the date *is* the last day of
  its month it moves to the last day of the next one — Jan 31 → Feb 28 → Mar 31
  → Apr 30. An ordinary date like the 15th just clamps.

The four repeat labels are written out as literal `t()` calls in
`repeatLabel()`, not built from the id — `tools/check-lang.js` reads literals,
and it caught exactly this when they were `t('remind.' + n.repeat)`.

---

## 4m. Filtering, pictures, documents, and a copy off this disk

### Filtering the board

Colour focus enumerated all nine colours in the stylesheet —
`body.focusing[data-focus-color="red"] .note[data-color="red"]` and eight more.
That cannot extend to statuses: their ids belong to the user, and CSS cannot
compare one attribute against another.

So the *match* moved into JavaScript. `noteMatchesFocus()` answers it,
surviving notes get `.focus-hit`, and later.css §33 is two rules. Both
questions — "only the red ones", "only what is blocked" — are now the same
mechanism with a different `focusKind`.

Three places have to keep the classes honest, and missing any of them shows:

- **`mountNote()`** — culling mounts notes as you pan, and one arriving under a
  live filter must arrive dimmed. Otherwise panning slowly repopulates the
  board with bright notes the filter should be hiding.
- **`render()`** — it throws the elements away, and the classes with them.
- **`setStatus()`** / **`setNoteDate()`** — a note whose status or date just
  changed may have left the filter it was in. (`watchDayChange()` does the
  same at midnight, when "today" itself moves.)

A third kind, `focusKind = 'date'`, is "what is due": `dateState()` is `late`
or `today`. Offered from the right-click menu of a note that has a date.

`setStatusFocus('')` is a real filter, not a no-op: "show me the ones nobody
has given a status to" is the question a board asks after it has drifted.

### The board picture has its own theme

`exportPalette()` reads the live stylesheet, which is what keeps a picture
looking like the app — and what made every export a near-black PNG for anyone
on a dark theme. That is the wrong picture for what a board picture is *for*:
a deck, an email, a printer.

`settings.exportTheme` is a THEMES id or `app`, defaulting to Paper.
`withTheme(id, fn)` swaps `data-theme` on the root, runs, and puts it back.
Two things make that safe:

- **Everything between is synchronous**, so the browser never gets a frame in
  which to paint the intermediate state. No flash.
- **Inline custom-palette properties are lifted and restored.** They live on
  the root and beat any rule, so leaving them would tint the light picture
  with the user's own colours.

### Links to documents on this machine

`applyLink()` used to rewrite anything that was not http or mailto into
`https://` — so `C:\budget\FY26.xlsx` became `https://C:\budget\FY26.xlsx`,
a broken link to a file that was right there. `toLinkHref()` in §1 recognises
the two shapes a local path comes in, a drive letter and a UNC share, and
everything else keeps the old behaviour exactly.

**It is opened, never run.** `shell:open-local` in main holds an allow-list of
extensions and hands anything else to `showItemInFolder` instead of
`openPath`. That is not caution for its own sake: a board is a document that
gets exported, imported and mailed around, and `openPath` on a `.exe`, `.bat`
or `.lnk` means *executing* it. A crafted board must not be able to turn a
click into a program launch. The sanitiser lets `file:` hrefs through so a
link survives being copied between notes; the guard is in main, where it
cannot be bypassed by markup.

Dropping any file on the canvas now **copies it into the board's own folder**
and links the note to that copy. That reverses what this paragraph used to say
— "a link and not a copy, deliberately" — and §4n is where the reversal is
argued. The short version: the reason given was true of a working document and
was never true of the screenshot, the clip or the scan that most drops actually
are, and it made a board impossible to send anywhere. The original file is
never touched, moved or locked.

### A copy that is not on this disk

The `.bak`, the twenty dated snapshots and the copy before every version all
live in `%APPDATA%`, next to the file they protect. That is the right shape
for "I broke my board" and no protection at all against a dead drive, a
stolen laptop or a reinstall — which for anyone keeping real work in here is
the larger risk, and nothing in the interface used to mention it.

`settings.backupDir` is one folder, chosen once: a synced drive, a stick, a
share. `backupNow()` writes the same JSON Export writes, dated, **and a copy of
every unlocked board's files beside it**, and main prunes the JSONs to the
newest ten. It is **not** a sync service and does not try to be.

That second half is what makes a backup folder a *portable board*:

```
<your backup folder>/
  mental-board-2026-08-29.json
  files/<boardId>/clip.mp4, shot.png, …
```

Drop that `.json` on another machine and the pictures come with it, because
`files/` beside a board file is exactly where `adoptAttachments()` looks. Two
consequences worth stating: a locked board contributes no files (its notes are
ciphertext, so there is no list to read), and the JSON is written *before* the
files, so a stick pulled out halfway leaves the half that cannot be
reconstructed.

- **Written to a `.tmp` and renamed**, like the board itself. A backup half
  written because the stick came out is worse than none: it looks like one.
- **Once a day, on launch**, not on a timer and not on every save. Writing to
  a synced folder on every keystroke is how you end up fighting the sync
  client.
- **A failure is always said out loud**, even on the automatic one. A backup
  folder that has quietly stopped working is worse than never having set one
  up, because you stopped worrying about it.

---

## 4n. The files a board carries

A board is not only text. Drop a video, a picture, a scan or a spreadsheet on
it and **the file becomes part of the board**: the store copies it into

```
Documents\My Boards\<Board name>\files\<name>
```

and the note stores **`mbf://<boardId>/<name>`** — never a path. Main registers
`mbf` as a privileged scheme before `ready` and `protocol.handle()`s it by
looking the board id up in the store's id→folder map and streaming the file
(Range headers pass through, so a video seeks). `store.resolveFile()` refuses
anything that is not inside that board's own `files\`, so a crafted board
cannot ask for a file it does not own.

That URL is what makes a board folder portable: nothing in it names this
disk. Copy the folder to another machine and every picture still resolves,
because the id is in the folder's `board.json` and the file is beside it. The
host part is lowercase by construction (`uid()` is base-36) and the store
lowercases on lookup, because URL hosts are case-insensitive whatever the
file says.

`file:` URLs are still accepted everywhere `mbf:` is — `isFileUrl()` in
helpers.js is the one test — so a 1.x note that linked a document elsewhere on
the disk keeps working. `migrateLegacy()` rewrites the 1.x attachment URLs
(`file:///…/files/<id>/<name>`) to `mbf://` once, on the way in.

**Files travel with notes.** When notes leave a board — a drag onto a rail
tile, a paste onto another board, a put-back out of the bin, a board deleted
into the bin — `carryNotesTo()` copies the files they point at into the
destination board's folder and re-addresses the notes. Copied, never moved:
another note on the source may show the same picture. The source's copy is
what *Clean up unused* reclaims. Deleting a board is the one case where the
copy has to land *before* the next step: its folder is about to go, so
`deleteBoard()` saves the bin, carries, saves again, and only then asks the
store to remove the folder.

### Why this reverses §4m

§4m used to say the opposite, and said it deliberately: *a link and not a copy,
so the file stays where the rest of your filing expects it, and a note never
holds a stale copy of a model.* That reasoning is still correct about a working
document. It was never correct about the three things people actually drop —
a screenshot, a clip, a scan — and it had a cost the old wording did not
mention: **a board could not be sent anywhere.** Export it, mail it, restore it
on a new laptop, and every picture in it was a dead link to a path on a machine
you no longer had.

The original is never touched, moved or locked. What changes is only which copy
the note points at.

### The four rules

- **The name is reduced to one path segment.** `safeName()` strips separators,
  leading and trailing dots, the characters Windows refuses and the reserved
  device names, and keeps the extension — because the extension is what decides
  whether `shell:open-local` will open the file at all, so losing it would
  quietly turn a document into something only Explorer can reach.
- **Nothing is ever overwritten.** `freeName()` goes `name`, `name (2)`,
  `name (3)`. Two files called `screenshot.png` from two different folders are
  two different files, and the second silently replacing the first is a picture
  disappearing out of a note written months ago.
- **Nothing is deleted on its own.** A board's folder outlives the board,
  because deleting a board puts its notes in the bin and the bin is meant to be
  reversible — taking the pictures out from under it would make that a
  half-recovery. The cost is that a folder slowly fills with files nothing
  points at any more, and *Settings → Your board → Clean up unused* is the one
  thing that clears them. See below.
- **A copy is async.** `attachFile()` goes through `fs.promises`, for the same
  reason `saveBoardAsync` exists: blocking the renderer for the length of a
  two-gigabyte video copy is the exact stall this app was reworked to remove.

### How a board travels

The rule is one line: **a board file's attachments live in a `files/` folder
beside it.** That is the shape `backupNow()` writes (§4m), so a backup folder is
the transportable unit — copy it to a stick, drop the `.json` on another
machine, and `adoptAttachments()` finds each file at
`<beside>/files/<theirBoardId>/<name>`, or anywhere under `<beside>/files/` by
name, and copies it into the folder of the board being created.

`relinkAttachments()` then rewrites the stored markup, **including each note's
`hist` entries** — a version in the history points at the same file the current
body does, so leaving it addressed to the machine the board came from means
restoring an old version hands you a dead image.

Anything not found is left exactly as it was. A link that does not resolve is
honest; rewriting it to something that does not exist either would only hide
that.

### What is where

| Piece | Where |
|---|---|
| the copy, the naming, the adoption, the carry | `src/store.js` — `attachFile`, `carryFiles`, `adoptExternalFiles` |
| the URL scheme | `main.js` — `protocol.handle('mbf')`; `store.resolveFile` |
| what a dropped file *is*, and its markup | `media.js` §11b — `isVideoFile`, `fileHtml`, `takeFileIn` |
| a drop on the canvas | `init.js` — `onCanvasDrop`, `noteFromDroppedFile` |
| a drop into a note | `editor.js` — `insertFilesInto` |
| a board arriving from elsewhere | `boards.js` — `importBoardsFrom` |
| the player's styling | `later.css` §43 |

### Video in a note

An ordinary `<video controls preload="metadata">`, so Chromium's own transport
does the work — there is no custom player to keep in step with every theme,
and none of the accessibility that comes free with the native one has to be
rebuilt. `preload="metadata"` means a board of ten clips reads ten headers, not
ten videos. No `autoplay`, for the same reason embeds are click-to-play: a board
that starts making noise when you open it is a board you close.

The CSP already allowed it — `media-src 'self' data: blob: file:` was there
before any of this — so nothing about the policy changed.

Three things the sanitiser has to get right, because a note can be copied into
another note and markup is what a crafted board controls:

- `VIDEO` and `AUDIO` are on `ALLOWED`, but **only `src` survives**, held to
  `file:` by the same check that holds an `<img>` to a local file.
- `controls` and `preload` are re-applied by the sanitiser rather than trusted
  from the paste. What arrives is a source; what is inserted is our player.
- `autoplay` is on no allow-list anywhere, so a pasted card cannot make a note
  start playing by itself.

**Adding one without a drag.** + → *Video…*, right-click empty canvas →
*Add a video…*, and `/video` → *A video on this computer…* all pick a file
through `file:pick-video` (main) and land in the same place a drop does:
`addMediaFromPicker()` → `FILES.attach` → `noteFromTaken()`. That function is
what `noteFromDroppedFile()` became once a picked file needed the same road.

**A video note is sized to the clip.** `measureVideo()` reads the clip's
metadata first (four seconds at most), the note is 480 wide and as tall as the
clip's shape plus `VIDEO_CHROME` (the icon row, the name bar, the padding).
It used to be 480×360 whatever the clip, which put a scrollbar on every
widescreen video.

**A clip that cannot play says so.** Chromium decodes MP4/H.264, WebM and Ogg;
most `.avi` and some `.mkv`/`.mov` it cannot. That used to be a black box with
a greyed-out play button. `watchVideos()` (media.js, called from
`lazyImages()` so every drawn body passes through it) listens for the
`<video>`'s `error` and paints `.mb-cant` over it — a line saying why and an
*Open it* button through `openHref()`, the same guarded door a link uses.
**Painted, never stored:** `bodyHtml()` lifts `.mb-cant` out like the embed
face, and strips the `data-watched` flag that stops a video being wired twice.

### Cleaning up what nothing points at

`cleanUpFiles()` in `settings.js`, `cleanupFiles()` in `preload.js`. Three
things carry it:

- **The renderer says what to *keep*, never what to delete.** It hands over
  every file: URL it can still see; preload works out the difference and removes
  only inside `files/`. No path crosses the bridge as an instruction, so the
  worst a confused caller can do is keep too much.
- **`referencedFileUrls()` is deliberately generous**, and getting it wrong in
  one direction costs disk while the other costs a picture. Four places count,
  and the middle two are the ones easy to forget:

  | Held in | Why it counts |
  |---|---|
  | a note body, on any board | including the bin — the bin is a board |
  | a note's `hist` | restoring an old version has to restore its picture |
  | the undo / redo stacks | one Ctrl+Z and the note is back, with a hole in it |
  | a saved template | note markup the user kept on purpose |

- **It refuses outright while any board is locked and shut.** Its notes are
  ciphertext, so there is no way to know what it points at, and sweeping anyway
  would delete every picture on it — discovered the next time it was unlocked,
  which is precisely the shape of loss this app was rebuilt over. The toast
  names the board to open. Same rule as `syncActiveBoard()`, one layer out.

The count is taken twice: once for the dialog, once for the delete. The dialog
can sit open for as long as somebody takes to read it, and a reminder firing or
a daily note landing in that time would write a file the first scan never saw.

Deleted, not moved to a second bin. This is the sweep that runs *after* the
board's own bin has been emptied, and a holding pen nobody empties is how the
problem it solves comes back. The confirm says so.

### Show me where it is

Two rows, and neither can run a program:

- **Show file location**, on a note that carries a file, calls
  `shell:reveal-local` → `showItemInFolder`. Safe by construction rather than by
  an allow-list that has to keep up with Windows.
- **This board's files**, on the empty-canvas menu, calls `shell:open-path`,
  which checks the path is a *directory* and that it sits inside the app's own
  data folder before handing it to `openPath`.

These replaced `shell:reveal`, which was a bare `shell.openPath(String(p))` with
no scheme check, no extension check and — despite its name — no revealing:
`openPath` on a `.exe` runs it. It had no callers and `script-src 'self'` kept
anything in the page from reaching it, so it was never a live hole. It was a
door built to the old standard standing next to the new one, and it is gone.

---

## 4q. A picture on the board

Drop a screenshot on an empty patch of canvas and what you get is the
screenshot — not a note with a screenshot in it. `js/pictures.js`.

It **is** a note: `{ pic: true, ar }` on an ordinary note whose body is one
`<img class="mb-img" src="mbf://…">`. That one decision is why the feature is
230 lines and not a second item type threaded through render, culling, undo,
the clipboard, the trash, the board-to-board drag and the export: every one of
those already handles notes, and a picture is a note that is drawn
differently. `makeNote()` hands a `pic` to `fillPicture()` — the image and the
eight handles, no head, no body, no status — and never stubs it at far zoom,
because a blank rectangle where a picture was reads as a broken board.

Three gestures are its own:

- **A resize keeps the shape.** `fitPictureBox()` runs inside the gesture
  engine's resize branch: a corner follows the larger pull, an edge sets one
  side and the other follows, and the anchored corner stays put. `ar` is
  stored so the first resize does not have to wait for the picture to decode.
- **A double-click opens the studio on it.** `openStudio(img)` takes a target
  now; `applyStudio()` writes the result to the board's folder as a file
  (`attachBytes`) rather than a data URL into the markup, and lands in
  `pictureEdited()` for a picture, which re-measures the box so a crop changes
  the shape rather than squashing the result into the old one.
- **Dragging it onto a note puts it inside.** `beginMove()` records a lone
  picture as `gesture.pic`; each move calls `trackPicTarget()`, which asks
  `elementFromPoint()` what is under the pointer and lights the note up;
  `finishPicDrop()` appends the `<img>` to that note's body and removes the
  picture from the board — same file, nothing copied. The image toolbar's
  "take it out" button is the way back.

`.note.pic.dragging { pointer-events: none }` is load-bearing: without it,
`elementFromPoint()` only ever finds the picture being dragged. The gesture
holds pointer capture on the viewport, so the picture never needed the events.

The board picture (§4g) draws the picture itself, read as a data URL first so
the canvas is never tainted; one that cannot be read is a framed box with an
image glyph, at its size.

## 4r. The page menu, and what a board decides for itself

The board's name at the top right of the canvas, and behind it everything
about *this* board rather than about the app. Settings (Ctrl+,) is the place
for the app; this is the place for the page. `js/page.js`.

Three looks are stored **on the board** and fall back to Settings when unset:
`font` (one of `NOTE_FONTS`, or `''`), `smallText`, and `bg` — `{ file, fit,
dim }`, a picture in the board's own folder, named and never pathed.
`applyBoardLook()` paints them: from `render()` on every board switch and
from `applySettings()` whenever the global they fall back to changes. They
are on the board so a board keeps its look when it is exported.

- **Font** is offered as sample cards ("Ag" in each face) rather than names,
  because the shape is the only thing worth choosing on. The stacks are CSS
  variables (`--face-*`, mental.css §51) so the card and the note body read
  the same list. Seven faces, all system fonts: Segoe, Constantia, Verdana,
  Cascadia/Consolas, Candara, Bahnschrift, Segoe Print.
- **Small text** scales the note bodies only; the interface keeps its size.
- **Background** goes under the paper as one fixed, composited layer
  (`#bgImage`) with a veil of the canvas colour over it (`dim`, 0–90%), so
  notes stay readable on a photograph and panning costs nothing. Four fits.
  The file is counted by `referencedFileUrls()` so *Clean up unused* keeps it,
  and by `importBoardsFrom()` so an imported board brings it.
- **Copy everything on this board** (Ctrl+Shift+C) selects all and hands off
  to `copySelection()`, so the internal clipboard and the system clipboard
  both get it; the selection is put back afterwards.
- **Move to a group.** A group is a word on the board (`b.group`) and a
  sub-folder of My Boards; the rail shows grouped boards under a heading, and
  the store moves the folder on the next save. One level, on purpose.
  `moveBoardToGroup()` keeps `state.boards` contiguous by group so the order
  on screen and in `settings.json` agree. `Backups` is reserved.
- **Import / Export.** Export copies the board's folder — `board.json` and
  `files\` — wherever the user points (`store.exportBoard`), after a
  `saveNow()` so the copy is of *now*. A locked board travels locked. Import
  takes a `board.json`, a 1.x single-board export or a 1.x everything-export,
  keeps the board's id if nothing here has it (then the URLs inside are
  already right), gives it a new one otherwise and relinks, and brings the
  files in from beside where the file was (`adoptExternalFiles`). The folder
  has to exist before files can be copied into it, so the board is saved
  first — that is the `saveNow()` in the middle of `importBoardsFrom()`.

## 4s. A date on a note

A note can carry one **date** beside its status: `n.date`, a calendar day as
`'YYYY-MM-DD'` in local time, or `''`. It is a day, not a timestamp, on
purpose — "due Friday" has no hour, and a timestamp would move the day under
anyone who crosses a time zone. Reminders (§4l) are the timed thing; a date is
the plain one, and the two are independent. `okDateKey()` (state.js, a
function declaration so it is hoisted) is the only validator; `adoptBoard()`
heals the field through it, so a garbage value becomes `''`.

**It is drawn like the status, not in the head.** `paintNoteStatus()` paints
both pills into `.note-status`, which is hidden only when the note has
neither — so a stub at far zoom keeps its date as a landmark too. Either pill
opens the right-click menu on click, as the status pill always did.
`el.dataset.when` carries the state for anything keying off it.

**Its colour is what the day means, not a choice.** `dateState(n)` returns
`late` (before today), `today`, `done` (the note's status has `done: true` —
"late" stops being true of a finished note) or `''`. css/mental.css §55 maps
those to red, amber, struck-through and plain. `dateLabel()` says Today /
Tomorrow / Yesterday, the weekday for the coming six days, otherwise day and
month (plus the year when it is not this one) through `Intl` in the UI
language. `fmtDay()` is the long form, used in the tooltip and the toast.

**Setting it.** The right-click menu has a Date row under Status: Today,
Tomorrow, Next week, an `<input type="date">` for any other day, and None —
on every note in the selection, through `setNoteDate(ids, key)`, which takes
an undo step like the status chips do. The field's `change` fires as each part
of a *typed* date becomes valid (typing 2027 passes through years 2, 20, 202),
so a year below 1900 is ignored and only a whole date lands.

**Midnight.** "Today" goes stale. `watchDayChange()` (started from
`startReminders()`) checks the day once a minute and repaints the mounted
dated notes when it turns over; a note mounted later is painted fresh.

The board picture (§4g) draws the date pill beside the status pill in the same
colours.

## 4t. JSON Canvas — Obsidian, both ways

`js/canvas.js`, and `writeCanvas` / `readCanvas` / `resolveCanvasFiles` in
store.js. [JSON Canvas](https://jsoncanvas.org) is Obsidian's open board
format, and a board already *is* one: boxes at x/y with a size, groups, edges.

| Mental Board | JSON Canvas |
|---|---|
| note | `text` node, the body as Markdown |
| picture on the board | `file` node |
| workflow | `group` node, the title as `label` |
| rope | edge (`toEnd: 'none'` — ropes have no arrowhead) |
| `red orange amber green teal violet` | presets `"1"`–`"6"` |
| `blue`, `pink` | `#4c7fd9`, `#d65a9c` (no preset) |
| status, date, icon | a `mentalBoard` key on the node |

**The text is the only real translation.** `noteToMarkdown()` walks the note's
HTML the way `noteToText()` does but keeps inline formatting (bold, italic,
strike, highlight, code, links, pictures), to-dos as `- [ ]`/`- [x]`, tables
as pipe tables, code fences, quotes and callouts as `>`. A clip becomes
`![[path]]`, Obsidian's own embed. `markdownToNote()` is the reverse, and it
**escapes the text before it parses it** — so the only tags in its output are
the ones it writes, and `[x](javascript:…)` is a word, not a link. The round
trip is exact for everything the editor can make; the app test checks that.

**Files.** Out: `exportCanvas()` asks where (`canvas:pick-save`), the board's
`mbf://<id>/<name>` references become `<Name> files/<name>`, and
`store.writeCanvas()` copies exactly those files there and writes the JSON
(whole or not at all, **and without writeAtomic** — see §7). In:
`canvasToBoard()` collects every path the canvas names (file nodes, `![[…]]`,
`![](…)`, `[](…)` to a relative path), asks `resolveCanvasFiles()` for them —
beside the canvas, then up to eight folders up (a vault root is somewhere
above), then by name under the canvas's folder — copies each one found into
the new board's folder, and points the notes at the copies. Until then the
notes hold a `mbcanvas:<n>` token; one that was not found becomes the file's
name as text. **Only pictures, clips, sounds and documents are ever read**
(`CANVAS_FILE_EXT`), whatever a canvas names.

The board is built in the shape a saved board has and passed through
`adoptBoard()`, so it is healed and validated like any other. A `.canvas`
dropped on the board is imported (`onCanvasDrop`); the page menu has *Export
for Obsidian* and *Import a .canvas*.

## 4w. Samsung Notes — `js/samsung.js`, `src/sdocx.js`

Page menu ▸ *Import from Samsung Notes…*, or drop `.sdocx` files on the
canvas. Each note lands in the open board as one workflow named after it,
several in a row, one undo step each.

**Why the .sdocx and not an export.** Samsung's exports each lose something:
Word drops handwriting to pictures, image/PDF flatten everything, .txt keeps
only typed text. The .sdocx is a zip of size-delimited records, described in
the reverse-engineering notes of github.com/twangodev/sdocx (GPL — only the
*description* was used; `sdocx.js` is written fresh) and checked against the
four real notes in huggingface.co/datasets/twangodev/sdocx-compatibility
(CC-BY): 83 and 41 strokes, 6 shapes, 7 inline pictures and every styled run
came out matching Samsung's own PDFs. Because every record is sized, an
object the reader does not understand is stepped over exactly, counted, and
reported; it never shifts what comes after.

| In the .sdocx | On the board |
|---|---|
| typed text (`note.note` body) | one note: bold, italic, underline, strike, highlight, links, Samsung headings and big text as h1/h2, bullets, numbers, to-dos; pictures inline |
| handwriting (type-1 strokes) | ink: a pressure-varying stroke is the brush (width per point), see-through is the marker, black is the theme's ink |
| shapes and lines (types 7, 8) | ink, the saved outline path; edges cut into short steps so the pen's smoothing keeps corners |
| text boxes, pictures on a page | notes / pictures where they stood |
| tables, code blocks, `.spi` pictures, eraser strokes, unknown objects | counted; the toast says how many and points at Samsung's PDF export |

Pages are stacked, cropped to what is on them and scaled so a page is 900
world px wide (`SAMSUNG_PAGE_W`); the typed text sits to their left.
Pictures are written into the board's `files\` by `store.readSamsung`, so the
renderer only ever sees `mbf://` URLs. A PDF, PNG/JPEG or .txt picked in the
same dialog goes the ordinary way (document card, picture, note). A locked
note, or one that is not a zip, gets a toast saying to unlock it or export a
PDF. Limits: 512 MB file, 256 MB per entry, 4 M points.

## 4u. The agenda, the board as columns, and the minimap

`js/views.js`. Three other ways of looking at the same notes. **None stores
anything**: each is drawn from `state` when opened, and every change made in
one goes through the function the canvas uses (`setStatus`, `revealNote`), so
undo, saving and the pills need nothing new.

**The agenda** (`Ctrl+Shift+D`, the calendar button on the zoom bar). Every
note with a date on every board you can read — locked boards and the bin are
skipped — sorted by date, under Overdue / Today / Tomorrow / This week /
Later, with a month beside it whose days carry a dot (red when something on
that day is late). A day click filters to that day. A finished note that is
already past drops off the list; it is still in the month. The tick sets the
first status with `done: true` (or clears it); on a board that is not open it
writes the stored note directly and `saveSoon()` picks it up — the save path
compares JSON, so it does not need the board to be live. The week starts where
`Intl.Locale.weekInfo` says for the UI language.

**The board as columns** (`Ctrl+Shift+K`, the button beside it). The open
board only — a status is about a note's place in a piece of work, and the work
is the board. One column per status in the user's order plus *No status*; a
status id nobody has any more counts as none, the same as on the note. Cards
are ordered dated-first by date, then by where they sit. HTML5 drag between
columns → `pushUndo()` + `setStatus()`. 200 cards per column are drawn, then
"and N more".

**The minimap.** A `<canvas>` above the zoom bar: every note a filled rect in
its colour, every workflow an outline, the view a frame in the accent. It is a
canvas because that is what MAP §8 used to object to — a second DOM copy of
every element; a canvas is fillRect calls (0.9 ms at 3,000 notes). It redraws
once a frame at most, from `scheduleMinimap()`, which `applyView()`,
`render()` and `saveSoon()` call — so any pan, zoom, switch or edit reaches
it. Colours are read from the stylesheet once per theme (`minimapThemeChanged`
in `applyTheme`). Pointer down/drag centres the view there; the wheel zooms.
Hidden on an empty board, in focus mode, and by Settings → Canvas →
`settings.minimap`.

`noteTitle()` is the first block of a note that has text — usually its heading.
`noteText()` joins blocks with spaces, which is right for search and wrong for a
title.

## 4v. Mental Board 2.1

Nineteen changes from three lists. Each paragraph says where it lives and the one
thing about it that is not obvious from the code.

### A note has no head

`fillNote()` (items.js) builds the icon badge, the body, the pill row and the
eight handles — and nothing else. The head's five controls were all in the
right-click menu already, the whole note is the drag handle (`onPointerDown`
starts a move anywhere on a closed note), and the row cost 24px of every note.
What it *showed*, the reminder, is a pill in the status row (`.nr-pill`, opens
the reminder dialog); the backlink count became the menu's **Linked to n notes**
rows, one per note at the other end of a rope, each a "go there". The menu also
gained **Copy** (it only had Cut). The setting "Show the buttons on each note"
(`noteChrome`) is gone with them. The badge is no longer a button — change it
from the menu's Icon row.

### Ropes you follow

**Pressing a rope flies to the note at its far end** — the end further from
where you pressed, so a rope running off screen takes you to the side you
cannot see. Hovering lights up both ends. Right-click is `openRopeMenu()`: go
to either end, or remove it. `goToNote()` keeps the zoom unless it is too far
out to read the note, selects it, and `flashNote()` marks the arrival.

A rope used to be *removed* by clicking it, and that click never arrived: it
must be handled on **pointerdown**, in `onPointerDown()`, before the lasso
starts — the lasso takes pointer capture on the viewport and capture retargets
the `click` away from the rope (§7).

**The selected note's ropes are drawn over the notes.** Ropes live under the
notes, which is right at rest and wrong when you want to know where one goes —
most of a rope between two rows of cards is behind them. `drawHotRopes()` copies
the ropes of a selection of up to twelve, and the one under the pointer, into
`#ropesTop`, a layer above every note; they can be clicked from there. Copies,
not moves: the rope underneath stays mounted and culled as before.

### Links in text

**`/link` landed at the top of the note.** `applyLink()` called
`closeLinkDialog()` first, which cleared `savedRange`, so the line that put the
caret back always saw null and `editing.focus()` alone puts the caret at the
start of a contenteditable. The dialog now keeps its own context, `linkCtx` —
`savedRange` is shared with the selection toolbar and may be overwritten while
the dialog is open — and reads it before anything closes. Two more were found
on the way: Enter in the address field was not `preventDefault()`ed, so it
reached the note after the link went in and split the paragraph; and the slash
menu listed "Board link" above "Link" for `/link`, so Enter made the wrong kind
— `blockRank()` now puts an exact or prefix match on the name first. Editing a
link the caret is in changes that link instead of nesting a new one inside it.

**A link can point at a note.** Type part of a title in the address field and
the notes on your boards are offered (this board first; locked boards skipped).
It is `<a class="mb-note" data-note data-board href="#">`, kept by the sanitiser
like `mb-board`, and following it switches board if it has to and flies there.

`normalizeBody()` now drops any inline declaration containing `var(` — that is
`insertHTML` copying the *stylesheet's* look (`font-family:
var(--face-system)`, `color: var(--text)`) onto what it inserts, which froze the
theme into the text. Nothing the app writes into a body contains `var(`.

### Columns that keep their shape

Three breakers, three fixes:

- **Bigger text across columns** — `applyFontPx()` extracted the range and put
  it back inside one span, which across blocks meant a half-copy of the grid
  inside a column. It now sizes each text node where it stands
  (`textRunsIn()`), so block structure is never touched.
- **Resizing** — the CSS was `repeat(auto-fit, minmax(88px, 1fr))`, a track
  count set by the note's width: three columns became two plus one on a second
  row, with the divider rules (which assume one row) drawing a line and an
  indent at its start. It is now one row with one track per column, stacking
  into a single column — whole, with a rule between each — when the note is too
  narrow for the count (container queries on `.note-body:has(.mb-cols)`).
- **Backspace / Delete at a column edge** merged the columns. `columnEdgeKey()`
  makes the edge a wall, and `repairColumns()` (from `normalizeBody`, and on
  `input` when `columnsBroken()`) puts any block execCommand did break back
  into the one shape the CSS draws.

### Copy, cut, paste — and the paste you can see first

`copySelection()` keeps `clipLinks`: every rope touching a copied note.
`retieLinks()` re-ties them on paste — between two copies, and to a note left
behind if it is on the board the paste lands on — so **cut then paste is a
move**, ropes and all. `duplicate()` uses the same function.

**Tap Ctrl+V and the paste lands at the pointer; hold it and the copied notes
ride on the pointer as outlines, with their ropes, until the keys come up**
(`beginPasteGhost` … `commitPasteGhost`, boards.js). Escape cancels; a click puts
it down early. The ghost is inside `#world`, so it is in world coordinates and
scales with the zoom for free.

**The keydown must not be `preventDefault()`ed** (§7). It used to be, which
suppressed Chromium's paste command and with it the `paste` event — so a
screenshot pasted onto the canvas never arrived from the keyboard. Now the
`paste` event decides: an image or files win (`pasteAnything`), otherwise the
ghost starts. A 150 ms timer stands in if no paste event comes.

### A workflow locked behind the notes

`lockFrame()` (right-click a workflow → Lock). `frame.locked = true`: a lasso
passes through it, Ctrl+A leaves it out (`frameSelectable`), its title starts a
lasso instead of a drag, its handles go, and its title shows a padlock.
Right-click still reaches it, because that is where Unlock is. **`adoptBoard()`
copies frame fields one by one** — `locked` had to be added there or it would
not survive a reload (§7).

### The wheel in a long note

`onWheel()` lets a note body scroll when it can move in that direction, and
**latches** like a browser does with nested scrollers: whichever took the first
notch of a burst keeps it, so a pan across the board does not stop dead on a
long note. A gap of `WHEEL_LATCH` (260 ms) starts a new burst; Ctrl always
zooms.

### Drawing on the board — `js/ink.js`

P (or Draw on the + menu) puts the pen out; Escape or ✓ puts it away. Pen,
marker (wide, translucent), brush (width from pen pressure, or from speed with a
mouse, tapered at both ends) and eraser (whole strokes, along the whole sweep —
not just where pointer events landed). Three sizes, the theme's ink (`text`:
white on dark, black on light), the nine note colours, any colour. Shift draws a
straight line. D / M / B / E pick a tool, [ ] the size.

A stroke is `{ id, tool, color, size, pts, ws? }` in **world** coordinates; its
width is worked out from the size picked *on screen*, so a thin line drawn
zoomed out stays thin. It is the sixth field of the live mirror (§3a). Undo is
its own step kind, `ink`, which keeps only the strokes — a full step serialises
every note per stroke. Over the notes by default, behind them when the board
says so (`board.inkBehind`); only hit-testable while the pen is out. Above
`INK_CULL` strokes only those near the view are mounted. The board picture
draws it in the picture's own theme (`paintInkOnCanvas`).

**Selecting what was drawn.** The arrow on the pen's bar (V): click a stroke,
Shift+click to add or remove one, drag across empty board to lasso every stroke
with a point inside the box, Ctrl+A for all of them. Drag a selected stroke to
move the selection (a `transform` while dragging, the points shifted once on
release); Delete removes it; a colour on the bar recolours the selection and
leaves the pen's own colour alone. Each is one `ink` undo step. The dashed box
lives in its own `#inkSelSvg` so it never disturbs the stroke order.
`endInkGesture()` settles every kind of gesture, never just the first it finds —
an early return once left a stroke collecting the next stroke's points.

### Any colour on a note or a workflow

The right-click colour row has a tenth swatch, **Custom colour…**: a colour
wheel that opens the system colour window when pressed (a transparent
`<input type="color">` covers it), and wears the item's own colour once it has
one. `item.color` is then a hex instead of a COLORS name. `paintColor()`
(helpers.js) sets the same three variables a preset sets — `--nc`, `--nb`,
`--nl` — with the fill and edge mixed against the theme's default note, so a
custom colour still tints dark on a dark theme. Everything that reads a colour
goes through it or through `colorStyle()` / `colorName()`: notes, workflows, the
compass, the paste ghost, the columns view, the minimap, the focus chip, the
board picture and JSON Canvas (which takes a hex as it is). `adoptBoard()` keeps a
hex through `okItemColor()`.

### Links are blue

A link in a note is `--link` — `#6cb4ff` on dark, `#1a62d6` on light. It was
the accent, and once Mono became the default the accent *is* the text colour,
so a link looked like the words around it. A link to a note is the same blue,
dashed; a board link is a blue pill; an embed card is not underlined.

### Settings ▸ Extra, and a reset you can always reach

A tab of its own for the things nobody needs and some people love, every one
off until switched on: the menu sounds (moved here from Appearance), typing
sounds, and pinned paper. And at the foot of the Settings panel, whichever tab
is open, **Restore default settings** (`#btnResetAll` → `resetSettings()`, which
keeps the language and the backup folder, as the button in Your boards always
did).

**Typing sounds** (`keySfx`, `KEY_SWITCHES` in sound.js; `settings.keySounds`,
`keyVol`): a mechanical keyboard under every key typed into a note, a field or
a dialog — blue (clicky), brown (tactile), red (linear), black (heavy linear),
membrane, typewriter (with the bell on Enter). Synthesised per press from one
cached noise buffer, with a little random pitch and level so no two presses are
alike; Space, Enter and Backspace sound bigger. Not on canvas shortcuts, not on
modifier keys, and not on key-repeat — a switch is pressed once.

**Pinned paper** (`settings.cork`: off · cork · wood; `body[data-cork]`, mental.css
§62): the canvas becomes a corkboard or a wooden board, every note a sheet of
paper tinted by its colour, tilted a degree or so by its id (`tiltOf()`), with a
red push pin at the top. `anchor()` in links.js ties every rope to the pins
(`CORK_PIN_Y`), `ropePath()` makes it sag, and the ropes layer goes *over* the
paper — string on a board does — with each end drawn as a pin head
(`#pinGrad`). Presentation only; nothing moves.

### A rope's own colour

Right-click a rope: under the two ends is a colour row — **as set in Settings**,
the eight colours, and Custom (the colour window). It is `link.color`, a
COLORS name or a hex, kept by `adoptBoard()`, carried by copy, cut, paste and
duplicate, painted by `drawLinks()` through `linkColorCss()` (an empty inline
stroke leaves `--rope` in charge), and drawn in the board picture.

### Menu sounds — `js/sound.js`

Settings ▸ Extra ▸ Menu sounds, **off by default**. Cues in the spirit of a
game's options screen — a dry tick as the highlight moves, a low thunk with a
short metallic ring on select, a falling tone going back, air when a panel
opens — synthesised with Web Audio through a generated room reverb. No audio
files, nothing fetched, nobody else's recording. Wired by delegation
(`SFX_ITEMS`) and a MutationObserver on the panels (`SFX_PANELS`), so a new menu
makes sounds by having the classes the others have. Never on the canvas.

### Mono, and a theme change that fades

`accent: 'mono'` is the default: `accentHex()` resolves it against the theme in
force — `#ffffff` on dark, `#000000` on light. A store last written before 2.1
and still on the old default (mint) moves to it once (`versionBefore()`); the
version stamp makes that one-time.

`applyThemeFaded(ms)` wraps the change in a **View Transition**: one composited
crossfade of the window, the same cost on three thousand notes as on none. The
clock fades slowest (1.8 s), following Windows 0.9 s, a click in Settings
~0.5 s. Skipped on Light, under reduced motion, when the window is hidden, and
when the theme would not actually change.

### Icons in the middle

`tokens.css` reset a button's border and background but not its **padding**, so
every fixed-size icon button kept Chromium's `1px 6px` and its glyph overflowed
to one side — every dialog's ✕, the agenda's arrows, the find bar, the rail's
pencil and ⋯, 0.5–2.5 px off. mental.css §60 zeroes it for icon-only buttons,
found by measuring each one's content box against its glyph. The native date
and time pickers drew Windows' own calendar and clock; they are masked with the
app's glyphs (`--ico-event`, `--ico-more`, built in `paintStaticIcons()`).

---

## 4x. A phone as a drawing tablet (2.2)

Settings ▸ Extra ▸ **Pair a phone**. A QR code appears; the phone's camera
opens a page this computer serves, and from then on the pen on the phone draws
on the board here, in real time, with no cable and nothing installed on the
phone. Built for a Galaxy S22 Ultra with its S Pen; works with any phone or
tablet browser that has Pointer Events (a finger can draw too, if asked).

```
phone browser ──WebSocket over Wi-Fi──▶ src/tablet.js (main) ──IPC──▶ js/tablet.js (renderer) ──▶ js/ink.js
 src/tablet/phone.html                   checks every message      onPadMessage()               the same stroke,
 pointer events, pressure                one phone, one token      the window → world            undo step and save
```

| Piece | File | Runs in |
|---|---|---|
| The LAN server, the pairing, a 30-line WebSocket, `clean()` | `src/tablet.js` | main (plain Node — tested without Electron) |
| The QR code of the pairing address | `src/qr.js` | main (pure; byte mode, level M, versions 1–6) |
| The page the phone opens | `src/tablet/phone.html` | the phone |
| Pairing panel, the phone's region and its outline, the pictures (`padDirty` → `padPump`), strokes in, select, hover ring, pan/zoom, the phone's undo | `js/tablet.js` | the renderer |
| Photographing the region | `pad:frame` in `main.js` (`webContents.capturePage`), `sendFrame()` in `src/tablet.js` | main |
| The bridge | `window.mbPad` in `preload.js`: `start` `stop` `send` `frame` `addresses` `onState` `onMessage` | — |
| Strings | `main.pad*` (the phone page, via `MAIN_KEYS`) and `set.pad*` / `pad.*` | — |

### Where a stroke lands: the phone is a region of the window (2.2.1)

2.2 made the phone *the whole window*, letterboxed to the PC's landscape
shape — on a phone held upright that was a small box in the middle of the
screen, and the user asked for the whole screen. So since 2.2.1 the mapping
goes the other way: **the phone's drawing surface is the entire screen under
its bar, in either orientation, and it maps to the biggest rectangle of that
shape that fits in the board's viewport, centred** (`padRect()`). Held upright,
that is a tall slice down the middle of the PC window; turned sideways, most of
it. The PC outlines the rectangle while a phone is paired (`#padArea`, drawn
just *outside* it so it is never in a picture). The phone tells the PC its
shape (`size`: aspect and device-pixel width) on connect, on rotation and on
going full screen; it asks for full screen on the first pen-down, which is a
user gesture, and the ⛶ button toggles it.

A point a third of the way across the phone lands a third of the way across
that rectangle, at the zoom you are at, and at about one phone pixel per PC
pixel on an S22 Ultra held upright — notes are readable at 100%. The view is
snapshotted at pen-down (`padMap()`), so a pan from the mouse half way through
a stroke cannot bend it. Widths are the ink bar's on-screen sizes divided by
the zoom, exactly as `beginInk()` does — a stroke from the phone is
indistinguishable on disk from one drawn with the mouse. Pressure comes through
as `p` (0–1; −1 means "none", a finger or a mouse) and drives the brush through
the existing `brushWidths()`.

### What the phone sees: pictures of the region, sent when it changes

The phone shows the board under the pen, live — notes, pictures, the far-zoom
ghosts, the ink from either side, the selection box — because it is shown
**JPEG pictures of exactly that rectangle, taken by main**
(`webContents.capturePage(rect)` → `toJPEG(72)`, at most 1100 px tall).

Chosen over streaming world-coordinate geometry (note rectangles, ghost text
bars, ink paths) for three reasons. It is *right* by construction: theme,
fonts, pictures in notes, bidi text, the cork look, a menu open on the PC —
geometry would need a second renderer for each, on the phone, kept in step
forever. It is *cheap* where it matters: about 20 KB a picture for a portrait
slice, measured; and a board at rest sends **nothing**. And it carries less
than geometry would: pixels of one region, not the text of every note near
it.

What keeps it light on the Wi-Fi and the battery:

- **Change-driven, not a frame rate.** `padDirty()` is called from
  `applyView()`, `saveSoon()`, `drawInk()`, the live stroke (mouse or phone)
  and `paintInkSelection()`; a picture is taken at most every 90 ms after one,
  two animation frames later so the change is painted. A once-a-second tick
  also asks, for anything those miss (a picture finishing loading, a theme
  fading).
- **One in flight.** The next picture waits for the phone's `got`, so a slow
  network gets fewer pictures rather than a queue of stale ones (1.5 s
  timeout).
- **Identical pictures are not sent.** `sendFrame()` hashes the JPEG; the
  idle tick costs the PC one capture a second and the phone a 60-byte message.
  Measured in the sandbox: a half-second pan sent five pictures (~100 KB);
  three idle seconds sent none.

How the phone hides the round trip. Every picture comes with two numbers: the
last of the phone's pans and zooms the PC had applied (`nav`) and the last of
its strokes already drawn into it (`k`). The phone applies its own later pans
and zooms to the picture at once (`navOps`, a matrix), and draws its own later
strokes from their points (`mine`) at the width they will land with (`rw`, the
region's width in PC pixels). Both are dropped as pictures catch up. So a line
appears under the pen immediately, stays, and is replaced by the PC's own
rendering of it a picture later — there is no fading echo any more, and
nothing for it to fade from.

Considered and left: "handwrite a note" — ink that belongs to a note rather
than the board — needs a note that can hold strokes; not in this.

### Palm rejection, the pen button, the eraser

- **Only the pen draws.** `pointerType === 'pen'` (and `mouse`, so a desktop
  browser can stand in during testing). A finger moves the board unless "Let a
  finger draw" is on.
- **A touch within 600 ms of the pen being near the glass is a palm**, and so
  is a contact wider than 48 px. Both are ignored for as long as they stay
  down. The S Pen's hover is what makes the first rule work: the pen is "near"
  before it touches.
- **The S Pen's side button erases while it is held.** Chrome on Android
  reports it as the eraser on some builds (`button` 5, `buttons & 32`) and as
  the secondary button on others (`button` 2, `buttons & 2`); all of them
  count (`erasing(e)` in phone.html). Pressed or released *mid-line*, the line
  ends and the other tool carries on from the same point. The hover dot turns
  red while it is held.
- The eraser from the phone takes whole strokes along the whole sweep, like
  `eraseAt()`, and takes its undo step at the first stroke it actually
  removes, so a sweep across nothing leaves no step to pop.
- **The phone's undo takes back the phone's own last stroke** (`padMine`). It
  never touches the board's undo stack, which would let a phone undo a note
  the person at the keyboard just deleted. Ctrl+Z on the PC undoes phone
  strokes like any others (each is an `ink` step).

### Selecting, moving, recolouring, deleting from the phone

The arrow on the phone's bar is ink.js's select tool (2.1), driven with the
phone's points turned into client coordinates (`padClient()`): touch a stroke
to select it and drag to move the selection, drag across empty board to lasso.
The gesture *is* ink.js's `inkPick`, moved by `moveInkPick()` and settled by
`endInkPick()`, so a move is one `ink` undo step and saves exactly as the
mouse's does; only the hit radius is the phone's (12 px — a pen tip needs more
room than a mouse). With strokes selected, the bin and the colours on the
phone's bar send `sel` — `deleteInkSelection()` and `recolorInkSelection()`,
the latter split out of `pickInkColor()` in 2.2.1 so both bars share it.
Leaving the arrow lets go of the selection, as on the PC. The phone learns the
selection's size from `view.sel` and sees the dashed box in the pictures.

### Security: a listening socket on the LAN, made boring

All of it is in `src/tablet.js`'s header; each point has a test in
`tools/test-tablet.js`.

- **Off by default, never persisted, and it stops by itself.** Nothing listens
  until Pair. It stops on Stop, on quit, on a renderer reload or crash
  (`did-start-navigation` main frame, `render-process-gone`), five minutes
  after Pair if nobody scanned, and a minute after the phone drops off if it
  does not come back. There is no setting to leave on by accident.
- **One phone, one use of the token.** 128 random bits in the QR code open
  exactly one WebSocket. That socket is handed a second secret, `resume`, the
  only way back in after a Wi-Fi blip (the page keeps it in `sessionStorage`).
  A photo of the code taken after pairing opens nothing.
- **Bound to one private IPv4 address**, never `0.0.0.0`; a peer outside
  10/8, 172.16/12, 192.168/16 (or loopback) is dropped on connect. With more
  than one adapter the panel offers a choice; Wi-Fi is ranked first and
  Hyper-V/WSL/VPN adapters last.
- **The Origin of the upgrade must be the page's own** — a page from another
  site in a browser on the same network cannot open the socket.
- **It serves one page and no files.** The page is read once from a fixed
  path; every other URL is a 404. The page has its own CSP (`script-src` a
  per-load nonce, `connect-src` exactly its own `ws://`), and the strings are
  injected with `<` escaped so a translation cannot close the script.
- **What reaches the phone is pictures of its region, while paired.** Since
  2.2.1 the phone sees the board, so board content does cross the network:
  JPEGs of the outlined rectangle, nothing else — no note text as data, no
  board names, no files, nothing outside the rectangle. That rests on the
  pairing above (one token, one phone, gone when pairing ends) and is said in
  the Settings hint (`set.padHint`). Main photographs the region; the renderer
  never handles the JPEG, and `cleanOut()` passes the `view` message's own
  fields and nothing riding on them.
- **Every message is re-checked in main** (`clean()`): known kinds, finite
  clamped numbers, ids `[\w-]{1,24}`, colours `text`/a name/`#rrggbb`, 64 KB a
  frame, 500 messages a second. The renderer still refuses a board that
  cannot be edited (`padCanDraw()`, a toast-free `canEditHere()`).
- **Plain `http`/`ws`, on purpose.** A self-signed certificate is a full-page
  warning on the phone at every pairing, and what crosses the network is pen
  positions and pictures of a region on the user's own Wi-Fi. The cost: someone
  sniffing the same Wi-Fi could see strokes, those pictures and the token, and the phone page has no secure context —
  so no Wake Lock (keep the phone's screen awake yourself while drawing).

### The Windows firewall

Listening on a LAN address makes Windows Defender Firewall ask, the first time,
whether `Mental Board.exe` (or `electron.exe` under `npm start`) may accept
connections. The panel says what to answer — **allow on private networks**.
The app never touches firewall rules itself: no installer, no `netsh`, no
elevation (CLAUDE.md, MAP.md §6). If the dialog was dismissed, Windows blocks
the app silently and the phone just never connects; and on a network Windows
classifies as **Public** inbound connections are blocked whatever was chosen.
The fix for both is in Windows Security ▸ Firewall ▸ Allow an app. A connection
from the PC itself (a desktop browser standing in for the phone) does not go
through the firewall, so it proves nothing about this — test with a real
phone once.

### Latency

Pen events are sent the moment they arrive, each carrying every point
`getCoalescedEvents()` gathered (an S Pen samples at 240 Hz; the S22 Ultra's
screen runs at 120), not batched to a frame — a frame of batching is 8–16 ms of
lag for nothing. The server sets `setNoDelay(true)` so Nagle does not hold
small writes back, answers the page's 2-second ping itself (the RTT shown on
the phone is the network, not the renderer), and the renderer paints the live
stroke on the next animation frame. On a home Wi-Fi network the round trip is
a few milliseconds; the spikes, when they come, are the phone's Wi-Fi power
saving, which a steady stream of pen events mostly keeps awake.

### Verified

`npm test` covers the encoder (every length 1–106 read back with the RS
syndromes checked), the server (`tools/test-tablet.js` — now also `size`,
`sel`, `got`, the arrow, and pictures: numbers then JPEG, a 70 KB one arriving
whole, an identical one not re-sent, a returning phone getting it again), and
the renderer (four 2.2 tests in `test-app-features.js`: the region at a
portrait aspect, pressure, the phone's undo and eraser, pan and zoom, and
select → move → recolour → undo → lasso → delete through ink.js). By hand, in
`npm run sandbox` with the in-app browser at 375 × 812 standing in for the
phone on the PC's Wi-Fi address and pen events synthesised in the page:
the full-height portrait surface and landscape, the board live on the phone,
a brush stroke staying put, the pen button (`buttons` 32) erasing mid-line,
select/move/recolour/delete from the phone, a note added on the PC appearing
on the phone, and the bandwidth figures above.

**Only the real phone can confirm:** which `button`/`buttons` the S22 Ultra's
Chrome (or Samsung Internet) reports for the S Pen button; S Pen hover and
real pressure over Wi-Fi; palm rejection with a real hand; how full screen
and rotation behave there; picture latency on the user's Wi-Fi; and the
Windows Firewall prompt.


## 4y. Maths, chemistry and study notes (2.3)

**A formula is its LaTeX.** `span.mb-math` (in the line) or
`div.mb-math.mb-math-block` (own line, centred) with `data-tex` and
`contenteditable="false"`. KaTeX (`assets/katex`, vendored — the page still
loads nothing remote) draws it into an `.mx-face` child that `bodyHtml()`
lifts out like an embed's card, so the stored body holds `a^n`, never KaTeX's
markup. `paintMath(root)` draws every formula that has no face (or a stale
one — a WeakMap remembers what each was drawn from); `lazyImages()` calls it
for every body that is drawn, the input handler for a formula that arrives
mid-edit, the paste handler after `sanitize()` (which keeps `data-tex` on
an `.mb-math` and nothing of KaTeX's). Chemistry is the same element with
`\ce{…}` — mhchem.

Ways in: type `$x^2$` and a space (edges may not be spaces, so "$5 and $6"
stays money); `/math`, `/equation`, `/chem`; the Σ button on the
selection toolbar (the selected words become the LaTeX); Alt+=. Clicking a
formula while writing opens it in **the formula window**
(`openMathDialog` … `applyMath` in settings.js, `#mathDlg`): in the line /
own line, a live preview, and buttons for the shapes nobody can spell
(`MATH_SNIPS`). It keeps the caret exactly as the link dialog does.

`insertMath` puts an inline formula in **by hand**, not with `insertHTML`:
on a note's still-bare first line Chrome put it after a new paragraph that
held the words before it. For the same reason `normalizeBody` now wraps a
whole loose line (text and inline elements together, `LOOSE_BLOCK_RE`), not
each text node on its own.

**Superscript and subscript** are `<sup>`/`<sub>` from execCommand, now in
`ALLOWED`; buttons on the toolbar, Ctrl+Shift+= and Ctrl+=.

**Numbered lists another way**: `ol.mb-ol-la|ua|lr|ur` (a, A, i, I) —
`insertStyledList`, `/letters`, `/roman`, or type `a. ` / `I. `. A list
nested with no class steps 1 → a → i and • → ◦ → ▪ by CSS alone.

**Writing under a table.** `insertTable` always added a line after the
table, but nothing kept it: Backspace on it, or a note reopened with the table
last, left no way to write below it (the caret sat after the table at the top
level). `ensureTail(body)` appends an empty paragraph whenever a table, code
block, columns, an own-line formula or an embed is the last thing in a note —
on every input and on `enterEdit`, which now puts the caret in it.

**The checkbox** is centred on its first line with `top: calc(.5lh - 7.5px)`
and its tick is one SVG mask centred in the box (mental.css §67) — the old
`.28em` top drifted with the text size and the rotated-border tick sat left
of centre. Inline icons sit on the middle of the letters.

JSON Canvas export writes `$…$` / `$$…$$`, which Obsidian draws itself, and
the importer (`markdownToNote` / `mdInlineToHtml`) reads them back — plus
`\(…\)` and `\[…\]` — into formulas.

### Pasting from ChatGPT, Gemini and the like

`onEditorPaste` (editor.js) now tells three shapes apart, all helpers in the
"pasting from ChatGPT" block of editor.js:

- **Markdown as plain text** (a chat's copy button): `looksLikeMarkdown()`
  scores headings, lists, bold, formulas, tables and fences; at 2 or more,
  and when the HTML half (if any) has no structure of its own (`richHtml`),
  the text goes through `markdownToNote(text, () => '')` and `sanitize()`.
  Not inside a code block. One plain sentence is never reshaped.
- **HTML with KaTeX or MathJax in it** (a selection copied off the page):
  `mathFromPaste()`, called first thing in `sanitize()`, swaps every
  `.katex`/`.katex-display`/`mjx-container`/`math` for an `.mb-math`
  built from its `<annotation encoding="application/x-tex">`, and every
  `[data-math]` (Gemini) the same way. Before, `sanitize()` kept the text of
  KaTeX's MathML twin *and* its drawing, so "πr²" arrived as "πr2πr2".
  `.katex-mathml`, `<style>` and `<script>` are now dropped outright.
- **LaTeX that lost its backslashes** ("n cdot a"): `fixTex()` restores the
  backslash on a fixed list of command names (`TEX_WORDS`) that cannot be
  anything else, never inside `\text{…}`, and `ce` only before a brace.

`finishPaste()` then paints the formulas, normalises, and keeps a line under
a trailing table.

**Shell trap for whoever edits next:** in this repo's Git Bash, a quoted
heredoc still collapsed `\\` to `\`, which silently broke every LaTeX string
and regex written through one. Write such files with an editor, not a heredoc.

## 4o. Lining a note up with its neighbours

`guideCandidates()` / `guideFit()` / `drawGuides()` in `items.js`, drawn into
`#guidesSvg` — a layer of its own inside `#world`, above `#notesLayer`.

Two notes a pixel and a half out of line look wrong, and there is nothing on an
infinite canvas to aim at. Snap-to-grid does not answer it: the grid is 26px and
the note you want to match is wherever somebody put it. So while something is
dragged, the six lines it could sit on — left, centre, right, top, middle,
bottom — are compared against the same six on every item nearby; within a few
screen pixels the drag is nudged onto the match and the line is drawn.

Five decisions hold it up:

- **The candidates are gathered once, in `beginMove()`.** Nothing standing still
  moves during a drag, so recomputing them per pointermove is the same answer at
  sixty times the cost. On a board of thousands that is the difference between a
  feature and a stall.
- **Only what is inside `visibleWorldRect()` counts**, capped at `GUIDE_MAX`
  (400). Lining up with a note two screens away is not something anybody is
  trying to do, and it is not something they could see the line for either.
- **The tolerance is screen pixels converted to world** — `GUIDE_TOL / z`. A
  fixed world tolerance is unusable zoomed out (everything is within reach) and
  useless zoomed in (nothing ever is).
- **The box is the union of everything travelling.** Dragging five notes lines
  the *five* up with the neighbour, rather than lining one of them up and
  leaving the other four wherever the offset put them.
- **It nudges, it does not lock.** The correction is applied on top of that
  frame's pointer delta only; keep moving and it lets go.

**Grid snap wins when both are on**, and `beginMove()` skips gathering
candidates entirely in that case. Two snaps arguing over one drag is a note that
will not go where it is pointed, and grid snap is the more explicit of the two
requests.

The two `<line>` elements are made once and moved thereafter — the same
diff-don't-rebuild rule the compass chips follow, and for the same reason:
assigning the markup again every frame restarts the fade, so the guide would
never actually appear. `.off` hides them; nothing is removed.

`#guidesSvg` is a separate `<svg>` rather than a second `<g>` inside
`#linksSvg`, because `resetLinks()` empties that one on every render and these
have to outlive it.

Resize is deliberately not covered. It needs edge-specific logic — which of the
eight handles you are dragging decides which of the six lines can match — and
the move case is where the annoyance actually lives.

---

## 4p. Focus mode

`settings.focusMode`, `toggleFocusMode()` in `init.js`, `body.focus-mode` and
css/later.css §47. Everything that is *about* the board rather than *on* it goes:
the rail, the + dial, the zoom bar and the edge signposts.

Three things are load-bearing:

- **The titlebar stays.** It carries the window's own minimise, maximise and
  close, and a frameless window with no way to close it is not a focus mode.
- **The rail is not hidden from CSS.** `renderBoardRail()` reads `focusMode` and
  treats it as `railMode: 'off'`, which also drops `has-rail` from `<body>` —
  and that class is what insets `#stage`. Hide the nav from CSS alone and you
  leave a rail's width of empty margin down the side of a canvas that has no
  rail in it.
- **It is stored, so it survives a restart — which is why the toast is not
  optional.** Every visible way back out is one of the things this mode just
  hid. `toggleFocusMode()` names the key each time it goes on, and `init()` says
  it again on any launch that starts in it. Same rule `flashRail()` follows: a
  control that is invisible at rest has to introduce itself.

Ctrl+`.` beside Ctrl+`,` on purpose — the keys are neighbours and so are the two
things they do. It works while typing, because clearing the screen is something
you do mid-sentence and nothing in a note needs that chord.

---

## 4c. Big boards: culling, far zoom, and the save debounce

A note is roughly forty DOM nodes once its head, badges, eight handles and rich
text are counted. Two hundred notes is fine anywhere. Two thousand is eighty
thousand nodes being laid out, painted and hit-tested on what may be an
integrated GPU and a spinning disk. Several things keep that usable, and the
DOM-shaped ones are **off below `cullMin()` items** — 60 on Full, 40 on
Balanced, 24 on Light — so a small board behaves exactly as it always did and a
bug in any of them cannot reach most people.

| Mechanism | Where | What it does |
|---|---|---|
| **Viewport culling** | `syncMounted()` §5 | Only items within `cullPad()` screen px of the viewport (700 / 520 / 380 by tier) are in the document. Panning mounts and unmounts, one sweep per animation frame. |
| **Stubs filled a few at a time** | `fillStubs()` §5 | Coming back in from far zoom, the stubs that stay on screen are filled nearest the middle first, inside a per-frame budget (7 / 5 / 4 ms); the rest wait for the next frame. Only stubs are looked at, through one index — this used to be a `state.notes.find()` per visible note per frame. |
| **The viewport box, cached** | `vpRect()` §5 | `getBoundingClientRect()` forces a synchronous layout whenever the document changed, which during a pan on a big board is always. The box is cached and dropped by a ResizeObserver, `resize` and `applySettings()`. |
| **Far zoom** | `applyFarMode()` §5 + `body.far-zoom` | Below `FAR_Z` (0.34 Full, 0.42 Balanced, 0.5 Light) every note is a **stub**: its colour, its place, its status pill and the *ghost* of its text — no body, no handles, no glyphs. Culling cannot help at fit-everything zoom — every note really is on screen — but at that scale nothing is readable. |
| **The text ghost (2.2)** | `noteGhost()` `ghostBlocks()` in items.js + mental.css §66 | A stub draws each line of its text as the note's **real words, wrapped where they really wrap** — a dash per word with the gaps where the spaces are, so it reads as text and not as a rule — headings taller and darker, bullet dots, to-do boxes, a block for a picture or a code block, right-aligned for Arabic — as background layers of **one** `.note-ghost` element: one gradient per line, a hard-edged stop pair per word. No layout, no glyphs, no extra nodes. Lines come from a regex tokeniser over the stored HTML (no DOM parse), wrapped at the board's font size, density and face, so the ghost stands where the text will be on the way back in. Cached per note on body + size + metrics: all 3,000 notes of the perf board in 25–33 ms once, and no measurable change to a far-zoom pan frame (14.5 ms either way at 0.2×). Bars are `currentColor` mixed down (`--gc0..3`), so they follow the theme. |
| **Re-stubbing on the way out (2.2)** | `restubMounted()` §5, from `syncMounted()` | Notes already on screen when the view crosses `FAR_Z` used to stay finished with their body hidden by CSS — blank cards still carrying their whole text. Each sweep in far zoom turns any finished note back into a stub, except the one being edited and those a gesture holds; `exitEdit()` and `endGesture()` ask for a sweep so those follow as soon as they are let go. 0.3 ms a frame over 3,000 mounted notes. |
| **Rope culling + reuse** | `drawLinks()` §10 | One `<g>` per rope, built once and updated in place, and only the ropes near the viewport are in the document at all. Gated on the same `culling` flag. |
| **Partial rope redraw** | `drawLinks(moving)` §10 | During a drag only the ropes tied to the notes under the pointer are recomputed. Everything else is standing still. |
| **Geometry-only undo** | `pushUndoGeom()` §14b | A drag stores four numbers per item instead of the whole board as JSON. |
| **Cached note text** | `noteText()` §1 | Ctrl+F and the jump palette run over every note on every board on every keystroke; `stripHtml()` is memoised on the body string so they parse each note's HTML once, not once per letter. |
| **Graphics tiers** | `resolvedPerf()` §3 + `body[data-perf]` | Three since 2.1 — Full, Balanced, Light — and Auto picks one from the cores, the memory and the graphics chip by name (`gpuName()`, WebGL's debug extension: a software renderer is Light, an Intel integrated part before Iris Xe/Arc is Balanced). Balanced drops the backdrop blur behind menus; Light also turns blurred shadows into flat rings and stops canvas transitions. Layout, colours and type are untouched — see later.css §31 and mental.css §59. The Auto hint in Settings names the chip it saw. |
| **Containment** | styles.css §25 | `contain: layout style` on notes and frames, so moving one cannot invalidate the layout of the rest. `paint` is deliberately absent — it would clip the handles that hang outside the box. |
| **Save debounce that scales** | `saveDelay()` §2 | 450ms below the threshold, up to 2s above it, and `writeNow()` skips the write entirely when the serialised state is byte-identical to the last one that landed. **That skip only works because `serialise()` is pure** — see §7. |
| **Off-thread writes** | `mbData.saveAsync()` | The debounced save no longer blocks the UI thread on the disk. See §3. |

Three rules make culling safe, and breaking any of them is a real bug:

- **The note being edited is pinned.** Unmounting it takes the caret and
  whatever was typed since the last persist with it.
- **Nothing is unmounted mid-gesture.** Drag and resize hold element references
  for the length of the gesture.
- **`ensureMounted(id)` is how you reach an item the user cannot see.**
  `enterEdit` uses it, because "jump to this note and open it" is one gesture.

`drawLinks()` runs on every pointer move of every drag, so both of its lookups
go through a `Map` built once per call rather than a `state.notes.find()` per
link — that was O(links × notes) sixty times a second. Its click handler is
delegated once in `wireLinkClicks()` for the same reason: binding one listener
per rope per redraw meant four hundred `addEventListener` calls per frame on a
board with two hundred ropes.

It also no longer rebuilds its own markup. It used to be one `innerHTML =` over
every rope on the board on every pointer move — 2400 SVG nodes thrown away and
re-parsed sixty times a second on a board with 600 ropes. Now the elements are
reused, off-screen ropes are unmounted, and a drag only touches the ropes it is
actually moving. Measured on 1200 notes / 600 ropes: **5.04 ms → 0.09 ms per
pointer move.**

**Measured in 2.1** on the sandbox's 3,000-note board (RTX 3060, 180 Hz):
`render()` 9.1 → 2.0 ms; `syncMounted()` per frame 5–12 → 2–4 ms in far zoom
and 34–39 → 8–10 ms on the frame that leaves it; the worst drag frame 12 →
5.7 ms. Panning at 1× and dragging hold the display's frame rate. **Zooming in
from fit-everything still drops to 15–30 fps between 0.2× and 0.4×** — what is
left is the browser rasterising a few hundred DOM notes at every new scale, not
script, and taking it further means drawing far zoom on a `<canvas>` instead of
in the DOM. That is the next thing to do here, not a tweak.

The `<g>` wrapper is load-bearing, not tidiness: `.lk-hit:hover + .lk-line` is
an adjacent-sibling rule, so the hit path and the visible line must stay next to
each other whatever order the ropes mount in.

---

## 4a. Language, and why bidi is two separate things

**No user-visible string may be written into `index.html`, `src/js/`,
`src/css/` — or `src/main.js`.** They all live in `assets/lang/<id>.js`, and
`en.js` is the source of truth. If you add a feature with new text, add the key
to `en.js` *and* to every translation in the same change.

Main is the newest half of that rule and the one that was missing. It draws the
tray, the "still running" notification and the title on every native file
dialog, and it has no catalogue: those strings were English literals, and
`check:lang` could not see them because `app-source.js` reads the script list
out of `index.html` and main is not in it. So an Arabic window came with an
English tray and an English "Insert image", and the check passed the whole time.

Main now keeps `S_EN` as its fallback — it has to, the tray is built in
`whenReady()` before the renderer exists — and the **renderer tells it the rest**
through `mbWin.setStrings()`, on boot and on every language change. See
`sendMainStrings()` in `js/theme.js`; the keys are `main.*` and are written out
literally at both ends so the checker sees them.

| You are writing | Use |
|---|---|
| static markup | `data-t` (text), `data-t-title`, `data-t-ph`, `data-t-aria` |
| a JS string | `t('key')`, or `t('key', { n: 3, name: x })` |
| an HTML template | `te('key')` — same thing, HTML-escaped |
| a number the user reads | `num(v)` / `pct(v)` — never `String(v) + '%'` |

A catalogue value is a string, or a plural table keyed by CLDR category
(`zero one two few many other`). `t()` picks with `Intl.PluralRules`, so Arabic
gets all six forms and English uses two. Missing keys fall back to English, so
a half-finished translation shows English, never blanks.

**Adding a language** is one file plus one `<script>` tag in `index.html`. The
picker in Settings builds itself from whatever registered on `window.MB_LANG`.

### A shortcut is a key, not a letter

`e.key` is what the *layout* produced. On a Windows Arabic layout the F key
reports `ب`, so every `e.key.toLowerCase() === 'f'` in the app matched nothing:
Ctrl+F, Ctrl+Z, Ctrl+S, Ctrl+C/X/V, Ctrl+K, Ctrl+`,`, and the bare N, G and L
were **all dead**, and the same for Russian, Greek and Hebrew. For anyone
working in Arabic the app simply had no keyboard.

`letterKey(e)` and `chordKey(e)` in §1 are the answer, and **the order inside
them is the part to not get wrong**: `e.key` is tried first and `e.code` is the
fallback, never the other way round. On AZERTY and QWERTZ the letter printed on
the cap is the one the user means — a French A sends `key: 'a'` with
`code: 'KeyQ'` — so reading the code first would quietly move every shortcut to
a key with the wrong letter on it. Honour the label when it is Latin; fall back
to the physical position only when it is not, which is exactly the case a
non-Latin layout presents, and which matches the Latin legend printed on the
same cap of every Arabic keyboard.

Every letter shortcut goes through `letterKey()`. Punctuation and digits go
through `chordKey()`, for the same reason: an Arabic layout puts `،` on the
comma key and some variants put ٠-٩ on the digit row.

### Searching Arabic means folding it first

Arabic writes the same word several ways and people type the easy one: `أحمد`
is typed `احمد`, `مهمّة` is typed `مهمة`, a word may carry a tatweel (`مشـروع`)
for looks, and a year is as likely to be `٢٠٢٦` as `2026`. Comparing the strings
as written found none of those.

`foldSearch()` in §1 is the comparison key: harakat, hamza marks and the
superscript alef removed, tatweel dropped, the alef / ya / ta-marbuta /
hamza-carrier forms collapsed onto one letter each, Arabic-Indic and Persian
digits mapped to ASCII, NFKC for the presentation forms that arrive out of old
PDFs. **Both sides go through it** — Ctrl+F, the jump palette, the slash menu
and the template list all fold the query, and `noteTextFolded()` caches the
folded body beside the plain text so a thousand notes fold once per edit rather
than once per keystroke.

It is a comparison key and **nothing else**: what the user typed into a note is
stored and displayed exactly as written. Folding for display would be the app
correcting somebody's spelling of their own language.

The Latin path is one regex test and a `toLowerCase()`, so an English board pays
nothing.

### The two bidi mechanisms — do not confuse them

1. **Inside a note: always on, every language.** Blocks are
   `unicode-bidi: plaintext`, so each paragraph takes its direction from its
   own first strong character. An Arabic paragraph and an English one sit in
   one note and both read correctly with nothing stored. The two toolbar
   buttons write an explicit `dir` attribute for the cases that guess wrong;
   pressing the same side again removes it. That attribute is content, and it
   is saved with the note.
2. **The interface mirrors: only for an RTL language.** Keyed off
   `html[dir="rtl"]` (set by `setLang`), styled in `styles.css` §18.

**The canvas is deliberately exempt from #2.** `#viewport` is pinned to
`dir="ltr"` in `index.html`, because notes and frames are placed by *world*
coordinate — mirroring that layer would move every object on the board. Only
the chrome turns around. If you add a fixed-position control, flip it in §18;
if you add something inside `#world`, leave it alone.

`ar.js` uses Western digits (1 2 3) because that is the CLDR default for plain
`ar`, and `Intl` formats every runtime number that way. Change one and you must
change the other, or a single window shows both sets of digits.

---

## 4b. Tables and templates

Both live in the editor region (§11), because both are ultimately "some HTML in
a `contenteditable`".

### Tables

A real `<table class="mb-table">`, not a grid of divs. The browser already gives
cell-shaped hit targets, wrapping inside a cell and a caret that behaves;
reimplementing that on divs buys nothing. What it does *not* give you is Tab
between cells or any way to add a row, so those are ours:
`tableTab` `addTableRow` `addTableColumn` `delTableRow` `delTableColumn`
`delTable`, plus `#tableBar`, which shows whenever the caret is inside a table.

Four things that are load-bearing:

- **`table-layout: fixed`.** Left alone the browser sizes columns by content, so
  typing a long word makes every other column jump. In a 280px note that reads
  as the table being broken.
- **`insertTable` appends a trailing `<p>`.** A table as the last child of a note
  leaves nowhere to put the caret after it — you cannot click past it and no
  keystroke escapes it. `delTable` does the same thing for the same reason.
- **`TD|TH` are in `BLOCK_RE`**, so each cell resolves its own paragraph
  direction. An Arabic column inside an English table reads correctly with
  nothing stored.
- **`TABLE` is in `BLOCK_CHILD_RE`**, so `normalizeBody` unwraps the
  `<p><table></table></p>` that `execCommand` will eventually produce.

Deliberately absent: cell merging, column types, sorting, formulas. That is
Notion's *database*, a different feature with its own storage. Half of it would
be worse than none.

### Icons in text

`/icon` inserts one via `inlineIcon()`, which differs from `icon()` in one way
that matters: **`contenteditable="false"`**. Without it the caret can sit inside
the `<svg>`, and the next keystroke inserts a text node between the path and its
parent — it renders as nothing, cannot be selected and cannot be deleted. With
it, the glyph behaves like a character.

The picker is an overlay, so opening it collapses the selection; `pickInlineIcon`
stashes the range first and `insertInlineIcon` puts it back, the same dance the
link dialog does.

**SVG is not in `ALLOWED`.** Our own icons are inserted directly and never go
through `sanitize()`, so they survive inside the app; letting arbitrary `<svg>`
in from a paste would hand a document off the internet a much larger surface
than a note needs. The visible cost: copying a note *out* to another app and
back loses its inline icons.

### Templates are the user's own

**There are no built-in templates.** There were seven — workout, meeting,
project and friends — and they are gone on purpose. Every heading and table cell
in them needed a catalogue key in every language (96 of them at the end), and
what they produced was still somebody else's workout. What a person actually
wants back is the note they already laid out the way they like it.

So a template is a note the user saved. `state.templates` is a flat list of
`{ id, name, body, icon, color, w, h }` stored alongside the boards — global,
not per board, because a shape you reuse has nothing to do with where you
happened to be standing when you saved it.

| Function | What it does |
|---|---|
| `openTemplateDialog(noteId)` | asks for a name, pre-filled with `noteHeadline()` — the note's first heading or line |
| `addTemplate(name, note)` | stores it; **the same name replaces** rather than adding a second row |
| `adoptTemplate(raw)` | the load-time healer. Anything malformed is a *missing* template, never a broken one, exactly like `adoptBoard` |
| `applyTemplate(id, worldPt)` | inserts at the caret when a note is open, otherwise makes a new note sized and coloured like the one it came from |
| `renderTemplateList()` | the list in Settings — insert and delete per row |

They show up in four places: the slash menu (after the blocks, under their own
heading), the empty board as one-click cards, the jump palette, and Settings.

Three things worth knowing:

- **The body is stored as literal HTML**, and it is the note's own saved body —
  which has already been through `sanitize()` on the way in. A template is a
  copy of markup that is already in the app, not a new way for markup to get in.
- **`TPL_MAX_BYTES` is 200 KB.** A note with a pasted image in it would
  otherwise put a 6 MB data URL in the file that every save re-serialises.
- **`tools/check-lang.js` no longer special-cases `tpl.`.** §1b used to
  reassemble the built-in templates' keys from their `tk(...)` call sites; with
  the content gone, the only `tpl.*` keys left are ordinary literals, so the
  prefix came *off* the exemption list. The checking got stricter, not looser.

---


## 4d. Ropes

Three settings, all of them presentation, none of them stored per link:

| Setting | Values |
|---|---|
| `linkColor` | one of `COLORS`, or a literal `#rrggbb` from the picker |
| `linkStyle` | `curve` · `straight` · `thread` (a line that sags) |
| `linkAnchor` | `top` (middle of the top edge) · `edge` (nearest side) |
| `linkWidth` | 1–5 screen px |

Because nothing is per link, changing any of them restyles every rope on every
board at once and cannot move a note. `applyLinkStyle()` writes `--rope` and
`--rope-w` onto the root; `.lk-line` reads them. The variable holds either a hex
or a `var(--c-red-c)`, and both work because the value is substituted whole —
which is what lets one control accept both a swatch and a colour picker.

The default is **red**, because that is what string on a corkboard is, and
because the accent is already doing the work of marking selection and focus.

**A click on a rope does not remove it** (it never could — see §7). Since 2.1
a press flies to the far end, the right-click menu removes it, and the ropes of
a selected note are drawn over the notes. See §4v.

`ropePath()` has one branch worth knowing about. With `linkAnchor: 'top'` both
ends are pinned to the middle of the top edge, and:

- **A curve arcs *over* both pins** rather than bending between them. Bending is
  right when the ends face each other on the nearest side; with both ends on the
  top edge it sends the rope straight down through the note it just left, so on
  a column of stacked notes most of every rope is hidden behind them.
- **Two notes in a column need the side bow.** Their pins share an x, and an arc
  between two points with the same x collapses to a straight line that
  *overshoots above the higher pin* — a stray tail out of the top of the note.
  Below 30px of horizontal separation the rope bows sideways instead, far enough
  to clear the wider of the two cards. That is why `ropePath()` takes the two
  rects and not just the two points.

---

## 4e. Embeds, and the paste-as menu

One rule holds this whole feature up: **nothing reaches the network until the
user asks it to.**

The app is offline by design and the CSP says so. `frame-src` allows exactly
one thing — a page the app serves itself on 127.0.0.1 — and nothing else: no
remote scripts, no remote images, no remote fonts, no fetch. Two moments reach
the network, both of them things the user just did: choosing **Embed video**
looks the title up once, and pressing play loads the player. A board full of
embeds you never open contacts nobody, so launching the app cannot become a
list of what you have been reading.

### The player needs a real origin

A page loaded from `file://` has no web origin — Chromium reports it as the
string "null" — and YouTube's player refuses to run on one:

    Error 153 — Video player configuration error

Nothing about the video is wrong and nothing about the request is blocked. The
check is on the browsing context, not on the request, so **no header, referrer
policy or query parameter changes it.** Rewriting `Referer` and `Origin` for
the request was tried and is worse than useless: it turns 153 into 152, which
is still broken and now carries a misleading code.

So the player gets an origin. `main.js` serves one generated page on the
loopback interface — `http://127.0.0.1:<port>/p/<token>/<kind>/<id>` — and that
page holds the YouTube iframe. The app itself stays on `file://`; nothing about
how the board is loaded, stored or secured changes.

Five things keep that server from being a liability, and all five are load-bearing:

- **127.0.0.1 only**, never 0.0.0.0, so nothing off the machine can reach it and
  Windows Firewall has no reason to ask.
- **It serves no files.** There is no code path that reads the disk; the only
  response it can produce is the page string. A traversal bug needs a file read
  to traverse to.
- **A per-session token in the path**, regenerated every launch, so no other
  local process can use the app as a general-purpose embedder.
- **`kind` and `id` are validated again in main**, not trusted from the renderer
  — which is also why the renderer asks for a *URL* rather than for the port.
- **The page carries its own CSP**, so even it can only frame the two players.

It does not listen until a video is actually played, and it closes with the app.

### What a video is called

Choosing Embed video makes one oEmbed request for the title and channel, and
downloads the thumbnail **once** into `%APPDATA%/Mental Board/thumbs/`. The card
stores a `file://` path to that copy, so it draws with no network afterwards —
which is what lets the card be a poster without giving up the promise that
opening a board contacts nobody.

The lookup happens *after* the card exists, never before. Waiting on a round
trip before showing anything would make a paste feel broken on a slow
connection and fail outright offline; this way you get the plain card, which
still plays. One attempt per video per session, so a card that cannot be
described does not ask again on every remount.

**Some videos cannot be embedded at all** — the rights holder disables it, and
the player says "This video is unavailable" with no error code. That is not a
bug in this app and there is nothing to fix: clicking anywhere else on the card
opens it in the browser, which is what that case needs.

### What is stored, and what is painted

Stored, and nothing else:

```html
<div class="mb-embed" data-embed="yt" data-vid="ID" contenteditable="false">
  <a class="emb-src" href="https://…">https://…</a>
</div>
```

The visible card is painted by `paintEmbeds()` after every render, and the
player is created by `playEmbed()` on a click. `bodyHtml()` lifts both back out
before reading the note, the same trick `img-sel` uses. Three reasons that
split matters:

- An `<iframe>` in a stored body is a note that starts playing a video the
  moment the board opens, and a board file carrying a remote URL the app
  promised only to load on a click.
- The `<a>` is the payload, so **search still finds the URL** and a card whose
  script never ran is still a working link.
- A note's markup stays small enough to sit in ninety undo snapshots.

`paintEmbeds()` **rebuilds** the card rather than painting around what is there.
A card that arrived through a paste has been through `sanitize()`, which keeps
the shell and its `<a>` but strips the classes off everything inside — so the
old face is present as anonymous divs, and painting around it stacks a second
caption on the first.

### The sanitiser's part

`data-embed` and `data-vid` are on the keep-list for a `div.mb-embed`, so an
embed copied between notes keeps working. `data-vid` is re-checked against the
pattern that produced it, which is the security-relevant half: **a crafted paste
cannot smuggle a frame URL in.** It can only name a video id, and the app builds
the URL from it.

### Paste-as

A pasted URL is ambiguous — plain text, a link, a bookmark card, a player — so
the app asks instead of guessing, at the caret rather than at the pointer
(a paste can come from the keyboard). The first row is selected on open, so
Enter is "the obvious one" and Escape is "actually, just the text". Over a
selection there is no ambiguity and no menu: the selected words become the link
text, which is the only reading that does not throw them away.

`/video` reaches the same builder through `openEmbedDialog()`, and refuses a
link that is not a video rather than quietly inserting a bookmark — the menu
item said "video", and quietly doing something else is how a feature gets a
reputation for being broken.

---

---

## 5. `src/css/` — nine sheets, and the order is the cascade

`styles.css` was written as an append-only log where later rules beat earlier
ones. It is now eight files, in the same order, and **that property is
unchanged** — the `<link>` order in `index.html` is what makes `later.css` win
an argument with `tokens.css`. Nothing in the files themselves says so.

So: the link list is load-bearing, not decoration. Reordering it changes how the
app looks. Add new rules to the end of the last sheet — `mental.css` since
2.0 — the way you added them to the end of the file before.

| Sheet | Lines | What is in it |
|-------|------:|---------------|
| `tokens.css` | 265 | Reset, design tokens, the first seven theme palettes, the fourteen accents, the nine note colours |
| `chrome.css` | 116 | Titlebar; the canvas itself — viewport, world, grid background, marquee |
| `notes.css` | 209 | Notes, the eight resize handles, workflow frames, ropes, and rich text *inside* a note |
| `menus.css` | 270 | Selection toolbar, slash menu, context menu, fab, zoom bar, compass chips, toast, overlays, motion, and the **late-overrides** block |
| `icons.css` | 142 | `.mi` sizing, note/frame icon badges, the theme picker, the icon picker, image toolbar and studio |
| `lang.css` | 270 | Font stack, per-paragraph bidi, the `html[dir="rtl"]` mirror, the data-folder box, and per-context icon sizing |
| `boards.css` | 448 | The board rail, tables in notes, the empty board as onboarding, and everything added after 1.1 |
| `mental.css` | ~1040 | **The 2.0 look**, and the last sheet by design: §50 pictures on the board, §51 a board's own font/text size/background, §52 the page menu, §53 the chrome — corners, hairlines, tracked labels, selection as a bar of light, the settings nav and its footer, §54 the reference pass, §55 the date pill, §56 a clip that cannot play, §57 the minimap, the agenda and the columns, and **2.1**: §58 the reminder pill, following a rope, links to notes, a locked workflow, columns that keep their shape, the paste ghost; §59 ink, the pen's bar and the Balanced tier, the theme fade; §60 icon buttons with no stray padding and the date/time pickers' glyphs; §61 the custom-colour swatch, blue links, selected ink; §62 pinned paper on a cork or wooden board, the settings footer, a rope's colour row; and **2.2**: §63 the phone-pairing box and the pen's hover ring (§4x), §66 the ghost of a note's text at far zoom (§4c); and **2.3**: §67 formulas, the formula window, sup/sub, numbered-list styles, the centred checkbox (§4y). Wins every argument with the eight above by position. See §5c. |
| `later.css` | 1546 | Everything after that, in the order it was added: big boards, the launcher, templates, Arabic leftovers, shape and density, columns, statuses, the 1.4 themes, alignment, icons standing alone, Notion columns, ropes, embeds, the settings nav, the bin, **§30 the boards window**, **§31 the cheap-to-draw mode**, **§32 the day/night pair**, **§33 filtering the board**, **§44 the 1.5 themes**, **§45 note face, shadow and motion**, **§46 the alignment guides**, **§47 focus mode**, **§48 the sub-heading inside a pane** and **§49 finding a setting** |

The `/* ─── n. name ─── */` banners inside each sheet are the original section
numbers and still run 1–39 across the set, so a reference like "styles.css §31"
in a comment still finds its way — grep for `─── 31.` rather than guessing which
file it landed in.

### Class-name prefixes

`note-` a note (`nh-` was its head, gone in 2.1) · `nr-` the reminder pill · `frame-`/`ft-` a workflow frame ·
`rz-` resize handle · `lk-` link · `cp-` compass chip · `sm-` slash menu ·
`cm-` context menu (`cm-custom` the colour-window swatch) · `sb-` selection toolbar · `ip-` icon picker ·
`st-`/`stc` image studio · `ib-` image bar · `tc-` theme card · `br-` board rail ·
`emb-` an embed card · `ct-` the custom-palette editor · `ik-` the pen's bar ·
`pgh-` the paste ghost (not `pg-`, which is the page button) · `ln-` the link dialog's note list · `mb-` rich-text content
(`mb-code`, `mb-todo`, `mb-callout`, `mb-img`, `mb-fs`, `mb-hl`, `mb-cols`,
`mb-embed`) · `mi` a Material icon.

Icon slots: `sec-ic` a settings section heading · `row-ic` a settings row ·
`b-ic` a labelled button · `tab-ic` a settings tab · `fb-ic` the find bar ·
`eh-ic` an empty-board tip · `sel-chev` the select arrow · `tc-mode` the
light/dark badge on a theme card.

---

## 5a. Icons — one set, and all of it used

**Every glyph in the app is a Material Symbol from `assets/icons.js`.** There
are no emoji, no letters standing in for icons (`B`, `H1`, `A+`), and no
hand-drawn `<svg>` — those all existed once and all three caused the same class
of bug: they rendered in a font the theme did not control, so they were the only
things on screen that ignored the palette, the text-size setting, or both. The
emoji also changed shape between Windows versions, and the letters changed
*width* between languages, which moved the toolbar.

The one deliberate exception is the three Windows caption buttons at the top
right. Minimise / maximise / close are Windows chrome, not app chrome; Segoe
draws them as hairlines and every other window on the desktop matches. A filled
Material `close` beside them reads as a different application.

### Where a glyph name may live

| You are adding an icon to | Put the name in |
|---|---|
| static markup (`index.html`) | a `STATIC_ICONS` row — the markup gets an empty slot |
| a JS template | `icon('name')` |
| the block/slash menu | the `ic:` field of a `BLOCKS` row |
| the compass | `COMPASS_ARROWS` |
| the fab dial | `data-icon="name"` on the `.fab-item` |

Nothing else. `tools/check-icons.js` knows those five shapes and only those, so
a sixth kind of call site means teaching the checker too — otherwise the build
starts failing on a perfectly good icon.

### The two rules the checker enforces

`npm run check:icons` (part of `npm run check`, which `npm run build` runs) fails
when either half drifts:

- **downloaded but never drawn** — dead weight, and usually a sign the UI was
  meant to change and did not.
- **drawn but never downloaded** — the expensive one. `icon()` returns `''` for
  a name it does not have, and because nearly every one of these controls is
  icon-only, you get a button with no glyph *and* no label. Invisible.

Adding an icon is therefore two steps that must happen together: add the name to
`UI` in `tools/fetch-icons.js`, run `npm run icons` (needs network), then draw
it. Do only the first and the check fails; do only the second and it fails the
other way.

### Two traps

- **`applyStaticText()` writes `textContent`.** A button that carries both a
  `data-t` label and an icon must put the label on its own `<span>`, or the
  next language change wipes the icon out. That is why the sheet buttons are
  `<span class="b-ic"></span><span data-t="…"></span>` and not one element.
- **`.mi` is sized per context, never in `em`.** A global `1em` would tie glyph
  size to the surrounding `font-size`, and the text-size slider in Settings
  would then resize every toolbar in the app along with the note text.

---


---

## 5b. The settings panel is a nav, not a scroll

Nine sections in one scrolling column meant the only way to find anything was to
read past everything above it, and every group looked identical to the one
before. Each is now a pane behind a tab.

Two things keep it simple:

- **Every pane stays in the DOM.** Switching only toggles a class, so
  `syncSettingsUI()` is still one pass over controls that always exist and
  nothing anywhere has to ask which tab is open before reading a control by id.
- **The sheet has a fixed height, not a max.** Nine panes of very different
  lengths would otherwise resize the dialog on every tab change, and a dialog
  that jumps under the cursor is how you click the wrong thing.

The new **Links** tab is where the ropes and the embed switch live. Everything
else kept its section heading, so the `STATIC_ICONS` rows that target
`h3:has([data-t="set.x"]) .sec-ic` still resolve.

### Finding a setting

`filterSettings()` in settings.js, css/later.css §49. Nine tabs is a much better
answer than one long scroll and it is still the wrong answer to "where is the
thing that turns off the note buttons" — you have to already know it lives under
Notes. Typing in the box at the top of the nav shows every matching row from
every pane at once.

The grouping is the part worth understanding. A pane is a flat list of rows,
checkboxes, button strips and hint paragraphs, and a hint belongs to the control
above it — so a **unit** is one control plus every `p.set-note` that immediately
follows it, matched on their combined text. That is why searching for "shadow"
finds the Graphics row as well as the Shadow one: Graphics' own hint is what
mentions blurred shadows. Hiding a row and leaving its hint behind, or the
reverse, is what makes a filtered list look broken.

Four rules:

- **Headings follow their content.** A pane's `h3` shows when anything in it
  matched, a `.set-sub-h` when anything under it did. Results with no heading
  over them are a list of controls with no idea which part of the app they
  belong to.
- **A row the panel itself has hidden stays out of it.** `pairRow`, `clockRow`,
  `customBox` and `dailyBoardRow` carry `.hidden` when they do not apply, and
  that class is `!important` — so search could never reveal one, but it could
  count it as a match and draw a heading over nothing.
- **`sf-off`, never `.hidden`.** `.hidden` is the panel's own channel for "this
  does not apply right now", and two mechanisms writing to one flag is how a
  control ends up invisible for good.
- **Both sides go through `foldSearch()`**, so the box finds Arabic the way
  Ctrl+F does — see §4a. Typing `الظل` finds `الظِلّ`.

Clicking a tab empties the box rather than fighting it: picking a tab and
searching are two ways of doing the same thing, and only one of them can be the
answer at a time. Escape empties the box; a second Escape closes the panel.

### The two figures that are expensive to work out

`syncSettingsUI()` runs on **every** control in the panel — clicking a theme
card, nudging the rope thickness, switching a tab. Two of the things it painted
were not cheap: the word count walks every note on every board, and the file
count is a `readdirSync` plus a `statSync` per file, per board, straight through
the preload bridge on the UI thread. So a control that should feel instant paid
for a full directory scan of the attachment store and a pass over every word the
user has ever written — and `startThemeClock()` called it once a minute for free
while the panel sat open.

Neither figure can change while the panel is open unless something *in* the
panel changed it. They are computed on open (`refreshSettingsStats()`), cached as
the finished translated strings, and painted from the cache thereafter.
`markStatsStale()` nulls it, and exactly five things call it: emptying the bin,
the Erase button, cleaning up files, importing boards, and a language change.
Everything else that moves them can only happen with the panel shut, where the
next open is fresh anyway.

### What 1.5 added to the panel

| Tab | Setting | Key |
|---|---|---|
| Appearance | six more themes — see §3c | `theme` |
| Appearance | whether the app animates at all | `motion` |
| Canvas | how far one notch of the wheel goes | `zoomSpeed` |
| Canvas | line notes up with their neighbours — see §4o | `guides` |
| Canvas | focus mode — see §4p | `focusMode` |
| Notes | what the writing is set in | `noteFont` |
| Notes | how far a note sits off the paper | `noteShadow` |
| Notes | what a new note starts as | `noteColor` `noteW` `noteH` |
| Notes | ask before deleting | `confirmDelete` |
| Your board | put every setting back | `resetSettings()` |
| the nav | find a setting across all nine tabs | `filterSettings()` |

Three of them are worth a note of their own.

**`motion` has three values and `auto` writes no attribute at all.** The
stylesheet already answers that case with `@media (prefers-reduced-motion:
reduce)`, which is the operating system's own switch — resolving it in JS would
mean re-resolving it whenever Windows changed its mind. What `full` needs is to
*beat* that media query, and a rule cannot un-set an `!important` it does not
own, so the two reduced-motion blocks (css/icons.css and css/later.css §31) are
scoped `body:not([data-motion="full"])` instead. That is the whole mechanism:
an explicit choice overrides the OS, and no choice leaves the OS to it.

**`noteShadow` goes through two variables, not through the tokens.**
`--note-shadow` and `--note-shadow-hover` are defined on `<body>` in §45 and read
by the four `.note` rules in css/notes.css. Redefining `--shadow-sm` directly —
which is what `body[data-perf="lite"]` does — would have changed the rail tiles,
the menus, the theme cards and the toast along with it, and this is a setting
about notes. Restating the four rules down in §45 instead would have been worse:
source order would then put `.selected` after `.dragging`, and every dragged note
is selected.

**`resetSettings()` keeps three fields.** `backupDir` and `lastBackup`, because
forgetting a folder the user chose would silently stop the off-disk copies while
the checkbox still said they were on; and `lang`, because the toast confirming
what just happened is written in it. It replaces `state.settings` and nothing
else, so `appVersion`, `boards`, `templates` and `statuses` are untouched by
construction rather than by a list somebody has to keep in step.

### Icons stand on their own

Every icon slot in a list used to be a bordered 26–27px tile with the glyph
centred in it — the slash menu, the jump palette, the fab dial. All three are
gone, and what is left is the glyph on a fixed 20px column so a list still lines
up. The tile was a second rectangle inside a row that is already a rectangle, it
pushed the glyph off the row's optical centre, and its border competed with the
row's own hover state. `styles.css` §34.


---

## 5c. The Mental Board look

`css/mental.css` §53, and it applies to every theme. Three rules do most of it:

- **Hairlines, not shadows.** A panel is a rectangle with a 1px edge in
  `--line-2`. Nothing floats, nothing is blurred. That is also what makes the
  chrome cheap on a machine with no GPU — the old design's §31 had to switch
  its blur and shadows *off* to get there; this one never has them.
- **Corners are barely corners.** `--r: 3px` on chrome. Notes keep their own
  shape setting; a workflow frame follows it.
- **Selection is a bar of light.** The row under the pointer, the tab that is
  open, the option that is on: `--text` becomes the background and `--bg` the
  ink. One language for "this one", everywhere, needing no colour to say it.
  The accent is kept for focus rings, checks and the caret.

Labels — section headings, tab names, the titlebar, buttons — are set in
`--face-label` (Bahnschrift, which ships with Windows 10 and 11; the fallbacks
keep the tracking) in tracked uppercase.

**The settings panel explains itself beside the rows.** Every `p.set-note`
hint that used to sit under its control is hidden in the panes and shown
instead in `#setDesc` — a column to the side of the rows — for the row the
pointer or the focus is on: `wireSettingsDesc()` in settings.js, grouping a
control with the notes that follow it exactly the way `filterSettings()` does,
so the two never disagree about what belongs to what. Only content stays
inline: the stats line, the version, the backup folder. The hints are still in
the DOM, so the search box still finds them.

### What the reference does, and what was taken from it

The look was checked against the game it was asked to resemble (Capcom's
*Resident Evil Requiem*, 2026 — title, options, load and modal screens), and
§54 of mental.css is the result. What the reference does, concretely:

| Screen | What Capcom did |
|---|---|
| Options | Full black. Title top-left in condensed capitals. A **row of tabs across the top** in condensed capitals with hairlines between them and a glowing underline under the open one; a smaller sub-tab row under that. Section headers are small **slanted grey tabs**. Rows: label left in sentence case, `‹ value ›` in a fixed column with a **short bar under every option and the chosen one lit**; hairlines between rows; dependent rows indented and dimmed. The highlighted row is a **light gradient bar, brightest at the leading edge and fading across the row**, with the text left white — not an inversion. The **description sits in a column to the right**, in sentence case, ending "(Default: …)", sometimes with a preview image. Button prompts centred along the bottom. Almost no colour; the one green bar is data. |
| Title menu | A dark photograph (an evidence board — pinned photos and string). A left-hand column in a **typewriter face**; the chosen item white on a black bar with rough edges, the rest grey; a one-line description bottom-left in a plain sans, then the prompt. |
| Load game | Paper and ledger lines, typewriter text, the chosen row a paper-white bar with dark text. |
| Modals | Near-black, centred sentence-case text, thin **L-shaped corner marks** at two corners. |
| Type | ITC American Typewriter for the title and save menus; Neue Frutiger for the body; Univers Condensed for counters and prompts (per Fonts In Use). |

What the app takes from that, and where: the tab row across the top with the
underline glow and the description column (`.set-nav`, `.set-desc`); the
gradient highlight bar for rows and menu items (`--spot`, mirrored for RTL
by `--spot-edge`); options as underlined words rather than pills (`.seg`);
slanted section tabs (`.set-sub-h`, `clip-path`, mirrored for RTL); corner
marks on dialogs (`.sheet::before/::after`); a typewriter face for board names
and the app's own name, declared as `"MB Typewriter"` with a **Latin-only
`unicode-range`** so an Arabic board name falls through to the normal face
instead of a letter-spaced monospace fallback. Inversion (§53's bar of light)
is kept only where the reference inverts: the title menu, i.e. the boards
launcher when the window is open and toolbar toggles.

What was deliberately not taken: the distressed textures and brushed edges
(they need image assets and are the wrong register for a notes app), the
photograph behind the title, and centred button prompts on every screen.

Two specificity traps this sheet had to fight, because the rail's own block
(boards.css §21) sets its radii and the active tile's fill under
`body.rail-hover …`, which outweighs a bare class: the active row's inversion
and the panel's corners are matched at the same weight at the end of
mental.css. Add a rule for the rail and check it in *both* rail modes.

## 5d. Fewer colours, better shown

Two controls in the appearance pane were a wall of colour with no structure,
and the cause was the same for both: nothing said what you were looking at.

**A dozen theme cards in one grid** read as a swatch book. Nothing marked where
the light ones stopped and the dark ones started, so you scanned all twelve
every time. They are split under two headings now — the division they were
always organised by — and the light/dark badge each card used to carry is gone
with them, because the heading above the row already says it. Both halves are
always shown: hiding one would make "swap between your light and dark picks"
impossible to set up, which is the point of the two modes above it.

**Fourteen accent circles in one row** was worse, because half of them were a
shade apart from their neighbour: sky beside blue, crimson beside rose, plum
beside violet, graphite beside slate. Choosing between two colours you cannot
tell apart is not a decision anyone wants to make. `ACCENT_CHOICES` cuts the
row to eight distinct hues and one grey, and a colour picker at the end of the
row covers everything the nine miss — strictly more range in half the width.

The `ACCENTS` map still holds all fourteen, and that is what makes the cut
safe: a board saved with `crimson` still resolves to crimson, and
`buildAccentSwatches()` appends whatever preset is in force if it is not one of
the nine, so it still shows as selected. **The list decides what is offered,
never what is kept.**

`accent: 'custom'` reads `accentCustom`. The two live side by side rather than
one replacing the other, so switching to a preset and back does not lose the
colour you mixed. Ink on top of it is the one place a luminance threshold is
used — the presets are a list of two exceptions because for a fixed set you can
just look once, but a colour the user mixed has no answer waiting.

### The paper

Seven backgrounds, in `GRID_STYLES`: dots, lines, graph, crosses, ruled,
isometric, plain. Each answers a different question — dots and crosses mark
position without drawing anything between them, lines and graph give you
distance, ruled gives long text something to sit on, iso is for anything drawn
in plan.

Three things are worth knowing:

- **It is its own layer, `#grid`, not a background on `#viewport`.** Fading a
  pattern by multiplying alpha inside four gradient stops is a calculation per
  theme per style; fading a layer is one number, which is what `--grid-fade`
  and the Strength slider are. A style made of several gradients also needs
  several background-sizes, and only a dedicated element can carry them.
- **The picker samples are drawn by the same rules as the board.** A swatch
  carries `data-grid` and the selectors in css/chrome.css name both
  `body[data-grid=…] #grid` and `.paper-eg[data-grid=…]`. One rule set, so a
  preview cannot drift out of step with the thing it previews — which is what
  happens to every preview built from its own second copy of the styles.
- **The pitch steps up as you zoom out, rather than the grid being hidden.**
  A 26px pitch at 12% zoom is three pixels: not a grid, a shimmer. `paintGrid()`
  multiplies by four until it is readable again, and divides when it gets too
  sparse to be a grid at all.

`gridSize` is **also the snap step**. `GRID` is still the default, but
`gridStep()` is what `snapV()`, arrange and the arrow keys use — a snap that
ignored the visible spacing would put notes between the lines they were aimed
at.

---

## 6. Running and deploying

```bash
npm start
```

That is also the answer to "how do I look at the app without installing it".
`admin/` wraps this and the rest in double-clickable `.cmd` files.

| Want | Run |
|---|---|
| See the app, on your real board | `npm start` |
| See it on a throwaway board | `npm run sandbox` |
| All three checks, no build | `npm run check` |
| The tests (store, then the real app) | `npm test` |
| **Update the app you double-click** | **`npm run build`** |

**`npm test` is three runs.** `tools/test-store.js` requires store.js fresh per
test against a temp folder and looks at the disk. `tools/test-tablet.js` drives
the phone-as-tablet server and the QR encoder in plain Node on 127.0.0.1 (§4x). `tools/test-app.js` starts
Electron on this repo with a throwaway `--user-data-dir` and a random debug
port, seeds a board that will not parse, waits for `applySaveResult` to exist,
then evaluates each test *in the page* over CDP — any app global can be called
— and does the disk half (making `board.json` a directory so its write fails,
say) from Node. Every `Runtime.exceptionThrown`, `console.error` and `Log`
error is collected, and the last test fails on any that is not on the short
expected list. Then two more apps are launched and quit (§4k). It takes about
a minute and a half. Three tests were checked by breaking the fix they guard
and watching them fail — the hung-page quit among them; keep it that way when
adding one.

`MUST_SHIP` in build-app.js now names `src/store.js` too — every save goes
through it, and it was the one runtime file the guard did not check.

**You usually do not need to build at all** — `npm start` runs the source, on
the same real board the built copy opens. Build when you want the desktop
shortcut to pick up a change.

### There is exactly one copy of the app

`npm run build` (`tools/build-app.js`, or `admin\Build App.cmd`) runs the
checks, packages with `@electron/packager` into a staging folder, then **deletes
`App/` and moves the new build into place**. It writes `App/BUILD.txt` with the
version and the minute it was built; the version is also in the titlebar.

**It creates no shortcuts.** The app has exactly one name and it is a path:
`App\Mental Board.exe`. A shortcut is a second name for the same thing, and a
second name is where every stale-build problem in this project began.

Every part of that is load-bearing, and 1.3 is why:

- **Staged, then swapped.** A build that fails half way must not be able to
  leave `App/` neither old nor new.
- **Deleted, not merged into.** `xcopy` over an existing `App/` leaves files
  from the previous build behind, and a stale file is exactly what makes a new
  build behave like the old one.
- **No shortcuts at all.** They were repointed on every build for a while,
  which solved the rotting-link problem and created a naming one. Make your own
  if you want it one click away; this script will never touch it.
- **It refuses to run while the app is open**, because the exe is locked and a
  half-replaced `App/` is worse than no rebuild at all. Since 2.1 "the app" means
  *this* folder's `AppMental Board.exe`, found by path: a copy built in another
  project folder locks its own files, not these. If the paths cannot be read it
  falls back to refusing on the name alone.
- **Task Manager shows `FileDescription`, not the exe name**, so
  `win32metadata.FileDescription` is the product name, "Mental Board". It was the
  package description until 2.1, and the app was listed under that sentence.
- **It reads the packaged `app.asar` back and checks `MUST_SHIP` is in it.** A
  mistake in `IGNORE` produces a build that packages without complaint,
  launches, and is missing its icons or its translations — which looks like a UI
  bug, not a build bug, and costs an afternoon before anyone suspects the
  build.

### Two copies on one machine cannot both run

`main.js` takes `app.requestSingleInstanceLock()`, and that lock is keyed to the
**userData directory** — which is pinned to `%APPDATA%/Mental Board` and is the
same string in every build ever shipped. So two different builds of this app are
one instance as far as Electron is concerned: with 1.3 open, launching 1.4 failed
the lock, quit without a word, and raised 1.3's window instead.

From the outside that is indistinguishable from "the new build is the old build",
and it cost a session. The lock is right — two windows on one `board.json` both
hold the whole board in memory and the second to save wins — but it means **an
old version left installed is not inert.** It is a running app wearing the new
one's launch. There is now one copy on disk and no shortcut pointing anywhere,
which is the only arrangement where that cannot happen again.

### Why there is no installer and no updater

1.3 shipped an NSIS installer, a portable target, a GitHub Actions release
workflow and `electron-updater` pulling from GitHub Releases. That put up to
four builds of this app on one machine at once — the installed copy, the
portable target's `%TEMP%` extraction (fourteen had accumulated on one machine,
each one a complete app nobody could see), the update staged for a quit that
never came, and the folder the build script wrote. A shortcut points at one of
them. Nothing tells you which.

All of it is deleted: no `electron-builder`, no `electron-updater`, no
`build.nsis`, no `publish` target, no `.github/workflows/release.yml`, no
`RELEASING.md`. **Updating is running `npm run build`.** If that ever needs to
change, the thing to preserve is the property, not the tooling: one copy, one
path to it, and a way to read the build identity off the running app.

Two things about the packaging config in `tools/build-app.js`:

- **`IGNORE` is a denylist, and `assets/` must never end up in it.**
  `icons.js`, `lang/`, `fonts/` and `icon.png` are all read at run time. Drop
  the icons and the app starts with no glyphs; drop `lang/` and every string
  falls back to its own key.
- **`node_modules` is not ignored either.** There are no runtime dependencies
  today, so `prune: true` empties it — but add one and it has to ship. Only
  npm's leftover `.package-lock.json` is excluded by name.

`asar: true` means the packaged app is a single `resources/app.asar` archive:
**you cannot patch a built copy by dropping loose files into `App/`.** Rebuild.

Rebuild the icon after replacing `tools/icon-source.png`:

```bash
npm run icon
```

### An App\\ built somewhere else

`BUILD.txt` records the folder the build came *from*, and nothing ever read it
back. So a project copied to a new folder inherited the old folder's `App\`, and
`App\Mental Board.exe` then ran source that was somewhere else entirely — with
the titlebar showing the old version, which looks exactly like a build that
simply has not been made yet. Combined with the single-instance lock above, the
stale copy wins the launch and raises its own window.

`reportForeignBuild()` in `tools/build-app.js` compares the two paths and says
so before building. A notice, not a refusal: the build is about to replace
`App\` anyway, and what was missing was anyone ever being told.

### Verifying a UI change for real

Launch with a throwaway profile so real user data is never touched, and drive
it over the Chrome DevTools Protocol. `npm run sandbox` is exactly this — and
since 2.0 a sandbox run keeps its boards in `.sandbox\My Boards`, migrating
`.sandbox\board.json` into it on first launch, so the real `Documents\My
Boards` is never opened:

```bash
./node_modules/electron/dist/electron.exe . --user-data-dir=.sandbox --remote-debugging-port=9444
```

Then connect a CDP client to `http://127.0.0.1:9444/json/list` (Node 22's
built-in `WebSocket` works as is; Python needs `websocket-client` with
`suppress_origin=True` — Electron rejects the handshake otherwise). `Runtime.evaluate` lets you call any renderer function
directly (`addNote()`, `drawCompass()`), `Input.dispatchMouseEvent` lets you
actually drag things, and `Page.captureScreenshot` lets you look at the result.
Screenshots can lag a frame; capture twice.

Two things that will waste your time if you don't know them:

- `Input.dispatchKeyEvent` for **Enter** needs `type:"keyDown"` with
  `text:"\r"`. A bare `rawKeyDown` does nothing to a `contenteditable`.
- `toScreen()` returns **viewport-relative** coordinates. The titlebar is 38px
  tall, so client coordinates are `toScreen(...) + viewportRect.top`. Getting
  this wrong makes working code look broken.

---

## 7. Traps

Six from 2.2's phone-as-tablet first (§4x):

- **A hook into a file further down the load order is `typeof`-guarded.**
  `applyView()`, `saveSoon()` and ink.js call `padDirty()`, which lives in
  js/tablet.js, near the end of the order. Anything that runs one of them
  while the scripts are still loading would hit an undefined function, so the
  call is `if (typeof padDirty === 'function') padDirty();`.

- **An http server's sockets are half-open.** A WebSocket peer that hangs up
  is heard as `end`, and `close` never comes until this side ends too.
  `src/tablet.js` listens for both; with only `close` a dropped phone stayed
  "connected" and its minute to come back never started.
- **The bytes that arrive with a 101 are in the `upgrade` event's `head`.** A
  test client that only listens for `data` misses the server's first frame.
- **`canEditHere()` toasts.** Anything that asks it on a timer — the phone's
  once-a-second view check — shows the toast once a second on a locked board.
  `padCanDraw()` is the silent version.
- **`did-start-loading` fires for iframes.** Stopping the pairing on it would
  end it whenever a video player loaded; main stops on a main-frame
  `did-start-navigation` instead.
- **A template placeholder named in the template's own comment is replaced
  there** — `String.replace` with a string takes the first match. The phone
  page's comment describes its placeholders without spelling them.

Six from 2.1 first, because they are the freshest:

- **A `click` on anything that is not a note never arrives.** `onPointerDown()`
  starts a lasso on it, the lasso takes pointer capture on the viewport, and
  capture retargets the `click`. That is why ropes "did nothing" for a release
  — handle a press on canvas furniture in `onPointerDown()` itself, as the rope
  now is.
- **Never `preventDefault()` Ctrl+V's keydown.** It suppresses Chromium's paste
  command, and with it the `paste` event — the only place the system clipboard
  can be read. Screenshot paste on the canvas was dead from the keyboard for as
  long as it was.
- **Read a dialog's saved range before closing the dialog.** A close that
  clears state is a close that clears what you were about to use (§4v, /link).
- **`adoptBoard()` copies note and frame fields one by one.** A new field on a
  board is free (`boardPayload()` writes everything), but a new field on a
  *frame* or a *note* must be added to the map in `adoptBoard()` or it is dropped
  on the next load.
- **`insertHTML` freezes the theme into text.** It copies computed styles onto
  what it inserts; `normalizeBody()` strips any `var(` declaration for exactly
  this reason.
- **A fixed-size `<button>` holding only an icon needs `padding: 0`.** The
  UA's `1px 6px` is not reset by tokens.css, and it pushes the glyph off centre.

- **`lastWrittenBoard` is primed at load, and that is what stops a flush
  from writing every board.** `primeWritten()` records each board as read;
  without it the first save of a session found nothing "last written" and
  wrote all of them — which, after Delete everything, resurrected the boards
  from memory into the fresh folder. A board read from its .bak or renamed by
  the store is deliberately left out, so those *are* written.

- **A store call returns a status per document, and each one has to be acted
  on.** `mbData.save()` / `saveAsync()` return `{ ok, errors: [{ id, error }] }`
  and never throw. `writeNow()` stamps `lastWrittenBoard` only for the ids
  that are not in `errors`, so a board whose folder is read-only is retried on
  the next save while the others carry on — treat the whole result as one
  boolean and one bad folder silently disables saving for every board. Same
  bug as 1.3, one level down.

- **A board's folder must exist before a file can be copied into it.** The
  store makes the folder on the first save (`ensureDir` inside `saveAll`), and
  `attachFile` refuses an id it has no folder for. So an import saves the new
  board *before* adopting its files, and a delete saves the bin before
  carrying files into it. `saveNow()` exists for exactly these two places.

- **`mbf://` hosts are lowercase.** URL hosts are case-insensitive and the
  browser lowercases them; the store lowercases every id on lookup and
  `fileUrl()` lowercases on the way out. Compare ids from a URL with
  `.toLowerCase()` or a board copied from a 1.x file with an uppercase id
  will resolve nothing.

- **A dragged picture must not take the pointer.** `finishPicDrop()` asks
  `elementFromPoint()` what is under the pointer, and without
  `.note.pic.dragging { pointer-events: none }` the answer is always the
  picture itself. The gesture holds pointer capture on the viewport, so the
  picture never needed the events.

- **An unreadable board is shown and never written.** `unreadable: true` is a
  runtime flag (dropped by `boardPayload()`); `writeNow()` skips it,
  `switchBoard()` / `deleteBoard()` / `duplicateBoard()` refuse it, and
  `liveBoards()` excludes it. Add a new path that writes boards and check it
  honours the flag, or the first half-copied folder becomes a lost board.

- **The rail's active row is styled under `body.rail-hover` in boards.css,
  which outweighs a bare class.** A restyle of `.br-row.on` in the last sheet
  does nothing to the tile's own fill until it is matched at the same weight.
  See §5c.

- **`writeNow()` has two empty-looking error ids, and they mean different
  things.** `''` is the store saying `settings.json` failed. `'*'` is the
  renderer saying the call itself never arrived — a throw, a rejected
  promise — so *nothing* landed. They were once the same `''`, and a rejected
  `saveAsync()` then stamped every board as written: the failure was toasted
  but no board was retried until it changed again.

- **"Remove unused files" refuses while any board is unreadable**, as it does
  while one is locked. An unreadable board's folder is still in the store's
  id→folder map but its notes are not in memory, so every file in it looked
  unused and the sweep deleted them.

- **`migrateLegacy()` writes its marker only if every board landed**, and
  returns `{ error }` otherwise. It used to ignore `writeAtomic()`'s status,
  count the board as moved, and mark the migration done.

- **The renderer is sandboxed — keep preload.js free of Node.** `sandbox: true`
  works because preload requires only `contextBridge`, `ipcRenderer` and
  `webUtils`. Add a `require('fs')` (or `path`, or `Buffer`) there and the
  window comes up blank. Disk work belongs in store.js, behind an IPC call.

- **Permissions are deny-by-default.** `setPermissionRequestHandler` and
  `setPermissionCheckHandler` allow `notifications`, `clipboard-sanitized-write`
  and `fullscreen` and nothing else. A feature that needs another (the camera,
  say) has to be added to `ALLOWED_PERMISSIONS` in main.js, or it fails with no
  prompt.

- **`writeAtomic()` is for `.json` only.** Its backup name is the file name with
  `.json` swapped for `.bak.json`; for any other name the swap does nothing and
  the "backup" is the file itself. `writeCanvas()` once removed that "backup"
  after writing — deleting the .canvas it had just written. Non-JSON files are
  written with their own tmp + rename.

- **A copy of My Boards may not land inside My Boards.** `mirrorTo()` and
  `backupAllTo()` refuse a destination inside the store (`inside My Boards`),
  and Settings refuses to remember one. Without that, the copy recursed into
  itself about two thousand folders deep, inside a board's folder — too deep
  for Explorer, `rd` or Node's `rmSync` to delete.

- **Deleting a board removes its folder only after the bin has landed.**
  `deleteBoard()` checks `boardLanded(bin)` and that no trashed note still
  points at the board's own `mbf://` files before `removeBoardDir()`. Otherwise
  a failed write deleted the pictures while the bin pointing at them existed
  only in memory. Kept, the folder is listed again at the next launch — a
  duplicate, never a loss.

- **`applySaveResult()` reads `'*'` as "nothing landed".** Main's sync save
  handler, a rejected `saveAsync()`, a throw and an empty answer all come back
  as `{ id: '*' }`. `''` means settings.json alone.

- **The settings hints are hidden by mental.css, not removed.** They are read
  by the footer on hover and by the search box. Deleting one because "nothing
  shows it" takes the hint out of both.

- **The titlebar does not mirror.** `html[dir="rtl"] .titlebar { direction: ltr }`
  keeps the gear at the left and the three window buttons at the right in an
  Arabic window, as every other window on the desktop has them. Only the
  canvas chrome and the panels mirror. Put a new control in the titlebar and
  it stays where it is in both directions.

- **A keyboard shortcut keyed on `e.key` only works on a Latin layout.** See
  §4a. Use `letterKey()` / `chordKey()`, and note that `e.key` has to be tried
  *before* `e.code` or AZERTY and QWERTZ break instead.

- **A search that does not fold Arabic finds nothing anyone types.** See §4a.
  Fold both sides through `foldSearch()`; never fold what is stored.

- **`execCommand('styleWithCSS')` is a flag on the document, not an argument to
  the command.** `hiliteColor` needs it on — there is no HTML element for a
  background colour — and it was switched on and left on. From the first click
  of the highlighter, every later command in the session wrote CSS instead of
  tags: Ctrl+B stopped producing `<b>bold</b>` and started producing
  `<span style="font-weight: bold">`. Those spans then met the paste sanitiser,
  which keeps `background-color` and not `font-weight`, so bold applied after a
  highlight was bold that vanished on the next copy. Two bugs one line apart,
  from a flag nobody turned back. Turn it off on the next line.

- **The sanitiser strips `style`, and three features store their state there.**
  An image's size (`style.width`), a run's font size (`span.mb-fs` +
  `style.fontSize`) and a highlight (`background-color`) have no other record,
  so copying a formatted paragraph between notes silently dropped all three —
  the text arrived, the formatting did not, and nothing said so. `STYLE_OK` in
  `editor.js` is the allow-list: three properties on three tags, values
  re-parsed rather than trusted. **Anything new that stores state in an
  attribute has to be added there or it will not survive a paste.**

- **Filter a class list per class, not by testing the attribute string.**
  `/^(mb-|fs-|note-)/.test(el.className)` only ever looked at the first class,
  so `class="mb-al-center hostile"` survived whole — arbitrary classes and all —
  while `class="hostile mb-fs"` was dropped whole and took a legitimate font
  size with it. Which one happened depended on nothing but the order they were
  written in. `safeClass()` splits and filters; `al-` is on the list because
  that is the only record of an image's alignment.

- **A far-zoom note has no `.note-body` — even one that had one a moment ago.**
  Since 2.2 `restubMounted()` turns finished notes back into stubs on every
  far-zoom sweep, so an element reference taken before a zoom-out may have lost
  its body. Below `FAR_Z` notes mount as stubs —
  see §4c — so `els.get(id)` can hand back an element that is a coloured
  rectangle and nothing else. **Anything that reaches for a `.note-body`, a head
  button or a resize handle must go through `ensureMounted(id)`**, which fills a
  stub before returning it. That was already the rule for culled items; it now
  covers "mounted but not finished" as well, with the same one call.

- **Filling the stubs back in belongs in `syncMounted()`, after the cull — not
  in `applyFarMode()`.** Leaving far zoom means going from the whole board on
  screen to a screenful of it, so nearly every mounted stub is about to be
  culled. Finishing them all first measured 600ms of building notes to throw
  most of them away on the next line; doing it to the survivors is 18ms.

- **A status returned is a status that must be acted on — backups included.**
  `versionSnapshot()`'s return was ignored outright and `maybeSnapshot()` set
  its `snapped` latch *before* the call, so a failed daily snapshot was never
  retried and neither failure was ever reported. The pre-upgrade copy is written
  once, on the first launch of a build, and there is no second chance at it. See
  §3.

- **`toISOString().slice(0, 10)` is today in UTC.** It rolls over at 03:00 in
  Riyadh and 20:00 in Los Angeles, and it disagreed with `todayKey()`, which has
  always been local — so the daily snapshot and the daily note could name
  different days, and a snapshot taken at one in the morning was filed under
  yesterday and therefore not taken at all. `localDay()` in preload,
  `todayKey()` in the renderer.

- **Locking a board does not encrypt the files it carries.** See §3b. Say so
  where the user can read it, rather than letting the word "locked" imply it.

- **`Math.max(1, ...arr.map(…))` throws above ~130,000 elements** — measured,
  in this Electron build. Spread passes every element as a separate argument and
  V8 runs out of stack; same failure as the `btoa(...bytes)` entry below. It was
  in five places, and the one that mattered was `adoptBoard()`, which runs on the
  **load** path: a board that large threw while being read, `load()` caught it as
  `unreadable`, and the file was refused for ever — permanent data loss from
  nothing but a big board. `maxOf(arr, fn, seed)` and `minOf()` in helpers.js are
  the fix, and all five call sites go through them. A loop has no ceiling and is
  not measurably slower at any size this app will see. **Do not reintroduce the
  spread**; it looks tidier and it is a cliff.

- **Two files may not declare the same top-level function.** The twenty-two scripts
  share one global scope, so a second `function foo()` silently replaces the
  first — and which one wins is decided by nothing more interesting than the
  `<script>` order. `roundRectPath()` was declared in *both* media.js and
  edit-ops.js with identical bodies, which is harmless right up until somebody
  fixes a bug in the copy they happened to be reading and nothing changes,
  because the other one is the one that runs. There is one copy now, in media.js.
  The scan is four lines of node and worth running after any move of code between
  files: parse every script for `^function name` / `^const name =` and look for a
  name that appears twice.

- **Anything that adds items in bulk has to call `updateCulling()`.**
  `addNote()` and `deleteItems()` always did; `addFrame()`, `duplicate()` and
  `pasteClipboard()` did not, and all three can carry a board across the
  threshold in one gesture — duplicating a selection of forty is the obvious
  case. The symptom is mild and confusing: culling stays off until the next pan,
  so the board is briefly slower than it should be for no visible reason.

- **A settings panel that recomputes everything on every click gets slow in a
  way nobody attributes to the panel.** See §5b. The rule is the general one:
  anything in `syncSettingsUI()` that touches the disk or walks every note on
  every board has to be cached and invalidated explicitly, because that function
  is called by every control in it.

- **`btoa(String.fromCharCode(...bytes))` breaks above ~125,000 bytes.** Spread
  passes every byte as a separate argument and V8 runs out of stack — measured
  at exactly 125,000 in this app's Electron build. `b64()` in §14b now chunks at
  0x8000. This was not merely "locking a big board fails": a board is
  re-encrypted on *every save*, so locking a small board, opening it and pasting
  a screenshot into it meant every save from then on threw here, was swallowed
  by the `catch` in `reencryptOpenBoards()`, and wrote the **previous**
  ciphertext. `DATA.save()` returned ok, `writeNow()` stamped `lastWritten`, and
  every check the app has said the board was safe. The whole session went with
  the window, silently. `reencryptOpenBoards()` now *returns* the boards it
  could not encrypt and `save()` reports them — same rule as `mbData.save()`, a
  status returned is a status that must be acted on.

- **`serialise()` must stay pure, or the save path writes on every stray
  click.** `writeNow()` skips the write when the serialised state is identical
  to the last one that landed. `syncActiveBoard()` used to stamp
  `b.updatedAt = Date.now()`, and `serialise()` calls `syncActiveBoard()` — so
  every serialise produced a different string and that skip was dead code from
  the day it was written. Every `saveSoon()` after a gesture that moved nothing
  wrote the entire file; on a spinning disk with a multi-megabyte board that is
  a stutter at rest. It also meant *looking* was a change: the jump palette, the
  find bar and the Settings word count all call `syncActiveBoard()`. Stamping is
  now `touchActiveBoard()`, and `writeNow()` is the only caller — after the
  comparison, then it serialises once more with the stamp in. If you add
  anything to `serialise()`'s path, it must produce identical bytes for
  identical state.

- **An undo step is one of two shapes, and picking the wrong one loses data.**
  `pushUndo()` snapshots the whole board; `pushUndoGeom()` stores only x/y/w/h
  for items that already exist. Geometry is right for a drag, a resize, an
  arrange, an arrow-key nudge — anything where the *set* of notes, frames and
  ropes is the same before and after. It is wrong the moment something is
  created, destroyed or moved to another board. `finishBoardDrop()` is the one
  gesture that starts as one and ends as the other, and it swaps its step
  explicitly. When in doubt use `pushUndo()`: a step that restores too much is a
  surprise, a step that restores too little is data loss.

- **An undo step only knows about the board it was taken on.** Which is why
  dragging a note onto another board's tile used to duplicate it: undo put the
  note back where it came from and left the copy on the board it went to. A full
  step can carry an `other` board (`pushUndoWithBoard()`); anything that changes
  two boards at once has to use it.

- **The OS theme is `settings.themeMode`, not `settings.theme`.** `theme` is the
  id of a *palette* — `dark`, `paper`, `ocean` — and `adopt()` guarantees it is
  one of `THEMES`, so `settings.theme === 'system'` is false on every board ever
  written. Both handlers for the Windows light/dark switch tested exactly that,
  updated `systemDark`, and repainted nothing: in the default configuration the
  app did not follow Windows at all. Related: `mbTheme.set()` only understands
  `'dark' | 'light' | 'system'`, so handing it a palette id silently means
  `'system'`. `applyTheme()` is the only thing that should call it.

- **Table cells are money, and stripping every separator gets it wrong.** The
  old `parseFloat(s.replace(/[^\d.eE+-]/g, ''))` read `1.840.000,00` as `1.84`
  and `(2,400)` as `+2400`. Neither raised anything — they produced a plausible
  number and sorted a budget column into the wrong order, which is the worst
  failure a finance table has. `cellNumber()` in §11 decides which of `.` and
  `,` is the decimal separator instead: both present means the last one wins;
  one, once, with three digits after it means grouping. The one case nothing can
  resolve from the cell alone is US `1.840` meaning 1.84 — it reads as 1840, the
  same convention every spreadsheet importer uses, which keeps a column of real
  data self-consistent.

- **A label built from a variable is invisible to `check-lang`.** `t('remind.' +
  n.repeat)` is a key the checker cannot see, and it fails the build with
  `used but not in en.js: remind.` rather than guessing. Write the branches out
  — `repeatLabel()` in §14b, the quick-reminder labels beside it, and
  `COMPASS_ARROWS` all do this on purpose.

- **A border on a column is only as tall as that column.** The divider between
  columns was `border-inline-start` on the box, and a grid with
  `align-items: start` sizes each column to its own text — so two columns of
  different lengths drew a line the height of the shorter one, stopping in
  mid-air. It said nothing about where the block ended and left no way to see
  that the paragraph below was outside the columns rather than in one. The fix
  is `align-items: stretch` plus a full-bleed `::before` rather than a border:
  a border shares the box with the text, so any padding that keeps the text off
  the line shortens the line by the same amount.
- **Nothing on the canvas mirrors for an RTL language, and that now includes a
  workflow's title.** It has nine positions the user picks from; a language
  moving one of them would be the app overruling a choice somebody made. The
  fab, the zoom bar and this are all the same rule — see css/lang.css.
- **`pathToFileURL('')` does not fail.** It resolves the empty string against
  the working directory and hands back a URL for the app's own folder, so
  preload's `toUrl()` "succeeded" for every clipboard image and produced
  `<img src="file:///D:/Projects/…/">`. The data-URL fallback underneath it was
  never reached, because nothing had gone wrong as far as the code could tell.
  `getPathForFile()` returning '' is the real signal and has to be checked.
- **A `file://` page has no origin, and YouTube's player will not run on one.**
  Error 153 is about the page, not the video, and no header or query parameter
  fixes it — rewriting Referer and Origin only turns it into 152. The player
  needs a page with a real http origin, which is what the loopback server in
  main.js exists to provide. See §4e.
- **Some videos cannot be embedded anywhere.** The rights holder switches it
  off and the player says "This video is unavailable" with no code. Rick Astley
  is one, which made it a poor thing to test the origin fix against — it fails
  both before and after. Test with something known-embeddable before concluding
  anything about the player.
- **The console line about a blocked `i.ytimg.com` image while a video plays is
  not ours.** The app page holds no remote image, and widening the player
  page's `img-src` changes nothing; the message comes from inside the player's
  own frame and is surfaced under the top-level URL. Do not add a permission to
  silence it — it will not, and the permission then lies about what the page
  needs.
- **The two canvas corner controls do not mirror in RTL.** The fab was moving
  to the bottom right in Arabic and the zoom bar to the bottom left, which is
  what mirroring chrome means — and was wrong for the same reason `#viewport`
  is pinned to `dir="ltr"`: these are tools *on* the canvas, not text around
  it. Nothing about a + button reads right to left, and moving the two controls
  you reach for most under a different hand every time the language changes is
  a cost with nothing on the other side.
- **Deleting the mirror rule was not enough to move the fab back.** `#fabWrap`
  is a flex *column*, so `align-items` places its children across the inline
  axis — and `flex-start` follows the writing direction, which in Arabic is the
  right edge. The wrapper sat at left:18px while the button inside slid to the
  far side of the open menu. `direction: ltr` on the wrapper makes its own
  layout physical again; the Arabic labels inside still render right-to-left,
  because bidi resolves each run of text regardless of the box around it.
- **Chrome's UA stylesheet sets `align-items: center` on `<button>`.** A block
  child with no intrinsic width therefore collapses to its own borders inside
  one — which is why the paper samples were 2px slivers until `.paper` got an
  explicit `align-items: stretch`. A button is not a neutral box.
- **Shortening a list of presets must not shorten the map behind it.**
  `ACCENT_CHOICES` is what the picker offers; `ACCENTS` still holds all
  fourteen, so a board saved with one of the five no longer shown still
  resolves and still displays as selected. Drop a name from the map instead and
  every board using it silently becomes indigo the next time Settings is
  opened.
- **A preview built from its own copy of the styles is a preview that will
  lie.** The paper samples share the selectors that paint the board — both
  `body[data-grid=…] #grid` and `.paper-eg[data-grid=…]` are on the same rule —
  so there is no second set to keep in step after the third edit.
- **`gridSize` is the snap step as well as the pitch.** Anything that snaps
  goes through `gridStep()`, never the `GRID` constant, or notes land between
  the lines the user can actually see.
- **The load order in `index.html` is the architecture.** Fifteen plain scripts
  share one global scope, so a file may read a `const` or `let` from a file
  above it while it is *being evaluated*, and not from one below. Move a file up
  the list and a top-level line in it can land in the temporal dead zone of
  something it used to be able to see. It throws on boot rather than failing
  quietly, but the message names the file that was reached — not the one you
  moved. After `init()` runs, ordering is invisible to everything.
- **The `<link>` order is the cascade.** `styles.css` was append-only and its
  eight slices still are, collectively: `later.css` beats `tokens.css` because
  it is further down the list in `index.html`, and nothing in either file says
  so. Reordering the links restyles the app.
- **Nothing may keep a second copy of the load order.** `tools/app-source.js`
  parses `index.html` for it, and both checkers go through that. A hardcoded
  list would drift the first time a file was added — and the file that fell out
  of the list would be the newest one, which is exactly the one whose hardcoded
  English string or typo'd icon name has not been caught yet.
- **`putBack()` has to rebind when the bin is open.** `state.notes` is the live
  mirror — the same array object, not a copy — and the filters that remove the
  restored items replace `tb.notes` with new arrays. Leave the mirror pointing
  at the old ones and the next save copies them straight back over the new: the
  item ends up on its own board *and* still in the bin. `syncActiveBoard()`'s
  trap from the other side, and a real bug before it was a rule.
- **Deleting inside the bin has to be final.** `deleteItems()` checks whether
  the active board is the trash before moving anything, or the bin puts things
  back into itself and can never be emptied.
- **A PNG cannot go through `mbData.exportTo()`.** That writes UTF-8, so it
  would write the *text* of the bytes and produce a file nothing opens. The
  image export has its own preload call, `mbFiles.savePng()`, which decodes the
  data URL in main and writes a Buffer — and returns `null` / `{path}` /
  `{error}` like every other one, to be acted on.
- **The board picture is drawn from `state`, never rasterised from the DOM.**
  An `<svg><foreignObject>` would need the whole stylesheet inlined, every
  file:// image converted and every font embedded — and an SVG loaded into an
  `<img>` runs in secure static mode, where none of those external references
  are allowed. Drawing from the model has no such cliff. The cost is flattened
  typography inside a note, which is the part of a board picture nobody is
  reading anyway.
- **Ctrl+R is taken.** It reloads the window, which is how this app is
  developed — arrange is Ctrl+Shift+G, beside Ctrl+G for group.
- **A locked board that is on screen used to accept edits and throw them away.**
  `syncActiveBoard()` refuses on a locked board — correctly, it holds no
  plaintext — but nothing stopped you writing on one. The note appeared on the
  canvas, `serialise()` wrote the envelope, and it was gone at the next launch
  with no error at any point: the 1.3 shape exactly, by a different route. Two
  ways in, and both are now closed. `lockBoard()` used to leave you standing on
  the board it had just locked *with the plaintext still on screen* when there
  was no other board to switch to; it now binds the emptied one so the canvas
  matches the file. And `adopt()` can still land on a locked board when every
  board is locked, so `init()` asks for the passphrase rather than showing a
  canvas that silently refuses everything. Behind both, `canEditHere()` is the
  guard, and every path that creates or changes content calls it *before*
  touching the live mirror.
- **The pre-upgrade backup has to be the raw file.** `stampVersion()` used to
  snapshot `serialise()` — which is `state`, and `state` has already been
  through *this build's* `adopt()`. So the one file kept to answer "what did the
  board look like before this build touched it" was written by the build you
  are suspicious of: a future `adopt()` bug would quietly heal the board and
  then save the healed copy as the untouched one. It takes `JSON.stringify(raw)`
  now, and `load()` passes the parsed file in.
- **`board-.*` also matches `board-before-<version>.json`.** The daily-snapshot
  prune in `preload.js` used that pattern, and although the version snapshots
  sort after the dated ones and so were never the file `shift()` removed, they
  still counted towards the twenty — so every upgrade permanently cost a day of
  history. The filter is `board-\d{4}-\d{2}-\d{2}\.json` now. Version snapshots
  are outside the budget on purpose.
- **A confirmed import has to lift `loadFailed`.** The latch exists so an
  unreadable file is never overwritten by an empty board the app invented, but
  the user picking a file in a confirm dialog is not that. Leaving it on made
  Import the dead end at the end of the recovery instructions: it redrew the
  canvas, said "Imported", and wrote nothing.
- **`Object.assign` lets the *last* source win, and Import wants the first.**
  `adopt(raw, keepSettings)` merged the kept settings into the defaults and then
  merged the file over the top, so the parameter named `keepSettings` did the
  opposite of its name and the file's settings won: importing a board took its
  theme, its language, its perf mode and its `backupDir` — that last one
  repointing the automatic off-disk backup at a folder from whichever machine
  wrote the file. The order is defaults, file, mine. Note the second half of the
  same fix: the `railMode` heal reads the *unmerged* settings on purpose (see
  §2), so it has to read the file overlaid with the kept ones, or a file with no
  valid `railMode` forces "hover" over the setting the user is keeping.
- **A legacy-settings guard has to read the raw settings, not the merged ones.**
  `adopt()` checked `st.railMode` before reading the old `settings.rail`
  boolean — but `Object.assign` has already put the default `'hover'` there, so
  the guard was never true and the boolean was silently dropped. Someone who
  turned the rail off got it back on the next launch. Any migration written this
  way is dead code; check `raw.settings.<field>`.
- **A markdown shortcut fired inside a list needs `escapeList()` first.**
  `insertCodeBlock()` and `insertCallout()` always called it; the heading,
  quote, bullet and numbered rules did not. `formatBlock` on a caret inside an
  `<li>` wraps the whole list — `- a ⏎ # ` produced `<h1><ul><li>b</li></ul></h1>` —
  and `insertUnorderedList` inside a list *removes* it, so `- a ⏎ - ` dropped
  the item out and left `b` as a bare text node under the note body, belonging
  to no block at all. `caretBlock()` returns null for that, so every later
  shortcut on that line silently did nothing.
- **`normalizeBody()` unwraps headings as well as paragraphs, and adopts orphan
  text.** A heading wrapping a list swallows the blocks after it exactly the way
  the `<p>` case does, and text that belongs to no block is invisible in the
  markup but unreachable to everything that works on the current block.
- **The undo stack needs a byte cap, not just a depth cap.** A snapshot is the
  whole board as JSON and a pasted image is inlined as a data URL of up to 6 MB,
  so three of them in one note makes every snapshot ~18 MB — and ninety of those
  is over a gigabyte of retained strings from nothing more than ninety drags.
  Per-note history had `HIST_MAX_BYTES` for exactly this reason; undo did not.
  Both caps now apply, and `takeUndo()` exists so every pop keeps the counter
  honest.
- **The sanitiser and the CSP have to agree about images.** `sanitize()` kept
  `<img src="https://…">` and `img-src` has no http(s), so a paste from a web
  page left a permanent broken-image box and a refusal in the console. An image
  in this app is a local file or an inlined data URL, and that is now the only
  rule in both places.
- **A link in note text loses its click to pointer capture.** Same cause as the
  note-head button case (the head is gone since 2.1): pressing on a note that is not being edited went
  straight to `beginMove()`, the viewport captured the pointer, and the `click`
  handler bound to `.note-body` never fired — so a URL in a closed note did
  nothing at all when you clicked it. `onPointerDown` bails out for
  `a[href]`, `a.mb-board` and `.mb-embed` inside a note that is not open, the
  same way it already did for the head buttons. Only when it is *not* open: in
  an editor a click on a link has to place the caret, and Ctrl+click is the
  escape hatch there.
- **`reencryptOpenBoards()` needs `.finally`, not `.then`.** Nothing in it can
  realistically reject today, but if it ever did, `encWriting` would latch true
  and every later save would re-arm the debounce and never write — a board that
  looks saved and is not. That is the shape this project exists to kill, and it
  costs one word to make impossible.
- **A save that cannot run *now* must re-arm the debounce, never just return.**
  Both write paths refuse to start while one is already in flight — `asyncWriting`
  in `writeNow()` and `encWriting` in `save()`. Returning on its own loses the
  edit that arrived during the write. On the locked path that is not even a
  narrow race: `encryptBoard()` snapshots the plaintext *after* awaiting
  `deriveKey()`, so anything typed after that snapshot is not in the ciphertext
  the in-flight write is about to commit. `writeNow()` then stamps `lastWritten`
  with that stale envelope and every check the app has says the board is safe;
  stop typing there and nothing ever triggers another save; `flushSave()` on the
  way out takes the same async branch, whose `.finally` never runs before the
  window goes. Measured at a ~20ms window per save cycle, and it widens on a
  slower machine because PBKDF2 dominates the cycle. Both guards now call
  `saveSoon()` before returning.
- **A failed write must not update `lastWritten`.** This is the bug 1.4 was
  built to kill, and it is worth understanding because the shape of it will
  recur. `writeNow()` skips the write when the serialised board equals
  `lastWritten`, which is a real optimisation — `saveSoon()` fires after
  gestures that changed nothing. 1.3 stamped `lastWritten` inside a
  `try { DATA.save(json); lastWritten = json; } catch {}`, with a comment
  claiming it was only set once the write landed. It was not: preload's
  `save()` catches its own errors and **returns** the failure rather than
  throwing, so the `catch` was dead code. One failed write stamped
  `lastWritten` anyway; from then on every save saw "nothing changed" and
  returned; the session's work never reached the disk and went with the window
  at close. Reopen and the board is exactly as it was before you started —
  every time, with no error at any point. It reads as "the update wiped my
  notes". **Anything that returns a status instead of throwing must have that
  status acted on**; grep for other `try/catch` around a preload call before
  trusting it.
- **`textContent` glues block elements together.** `stripHtml()` is the plain-text
  view of a note body, and it feeds Ctrl+F, the jump palette, the history
  preview, reminder titles and the word count. Read naively,
  `<h1>Welcome</h1><p>This canvas…</p>` comes back as `WelcomeThis canvas…` —
  the palette showed the run-on, a search for any phrase spanning two blocks
  missed, and the word count read low on every multi-paragraph note. It now
  inserts a space after each block element first. If you add a block-level tag
  to the editor, add it to `BLOCK_SEL`.
- **The compass draws under the corner controls.** `#compass` is z-index 42 and
  `#zoombar` is 45, so a workflow off-screen to the bottom-right put its
  signpost *behind* the zoom bar — visible, but clicking it pressed a zoom
  button. `clearOfChrome()` slides a chip vertically clear of `#zoombar` and
  `#fabWrap`, measured at draw time rather than hard-coded (both change size
  with the text-size setting, and the zoom bar's width changes with the
  language's digits). **Vertical only** — a chip's horizontal position is what
  says which direction the workflow is in, so moving it sideways would point
  the signpost somewhere the workflow is not. Anything new pinned to a canvas
  corner has to be added to `chromeRects()`.
- **A status id outlives the status.** `adoptBoard` deliberately does not
  validate `n.status` against `state.statuses` — the two are read from the same
  file and the note list is parsed first, so pruning there would wipe every
  status on every launch. Resolution is at paint time: `statusById()` returns
  null and the note shows no pill. That is also what makes deleting a status
  recoverable, since the notes still remember which one they were in.
- **A default status has no stored name.** `statusName()` falls back to
  `t('status.' + id)`, so the four built-ins arrive in the user's language and
  follow a language change. Renaming one writes a literal name and it stops
  translating — correct, because the words are then the user's. Typing the
  built-in name back in clears the field rather than storing it, or an Arabic
  window would be left with an English status it could not undo.
- **An accent lives in one place: the `ACCENTS` map.** There used to be a
  matching `:root[data-accent="…"]` rule per accent in styles.css, and adding
  seven accents to the map without adding seven rules is exactly what happened:
  the swatches drew correctly (they are painted inline from the map), clicking
  one set `data-accent` to a value no rule matched, and `--accent` silently kept
  its old value. Half the palette looked broken and nothing errored.
  `applyTheme()` now writes `--accent` from the map. Do not reintroduce the
  rules.
- **A later section can undo a `--note-pad` rule.** Note padding is derived from
  one variable in §29, but §31 declared `.note-status { padding: … }` after it
  and won on source order, and the RTL `.note-head` rule out-specified it.
  styles.css is append-only by convention, which means a new section can quietly
  beat an old one — check what already sets a property before adding a rule for
  it.
- **The column count is never stored.** `.mb-cols` is a grid whose column count
  *is* its child count. The sanitiser strips `style` and everything outside its
  attribute allow-list, so a count in markup would survive being written and
  vanish on the first copy-paste. Add a width class and you have created that
  bug.
- **`execCommand` produces `<p><ul>…</ul></p>`.** A paragraph wrapping block
  elements swallows every block typed after it and breaks `caretBlock()`.
  `normalizeBody()` unwraps them; call it after any structural edit.
- **`insertUnorderedList` inside a list *removes* the list.** That is why
  `insertTodo()` checks for an enclosing `li` first — otherwise a second
  `[] ` on the next line drops you out of the list instead of adding an item.
- **A `<pre>` or callout inside an `<li>` gets silently stripped by Chrome.**
  `escapeList()` lifts the caret out of the list before inserting one.
- **Pointer capture eats clicks.** `beginMove()` calls `setPointerCapture` on
  the viewport, which retargets the following `click` away from whatever was
  actually under the cursor. Anything clickable inside a note must bail out of
  `onPointerDown` *before* a gesture starts — see the `.ft-icon` guard and the
  live-link and rope branches at the top of it.
- **The compass reuses its chip elements on purpose.** Rebuilding that markup
  every frame restarts each chip's fade-in animation, so the signposts stay
  invisible for as long as the view keeps moving. Diff, don't re-render.
- **`.frame` is `pointer-events: none`** except its title and handles, so a
  lasso drag still reaches the notes sitting on top of a workflow.
- **Pointer capture also eats double-clicks.** Same cause as the click case
  above: `onDblClick` and `onContextMenu` resolve their target with
  `document.elementFromPoint()`, never `e.target`. Reading `e.target` made
  double-clicking a note create a second note on top of it.
- **`execCommand('insertText', '
')` splits a `<pre>` in two** instead of
  adding a line. `insertNewlineInPre()` inserts the character by hand, with a
  trailing zero-width space so the empty last line has somewhere to put the
  caret. `cleanCodeBlocks()` strips the leftovers on exit.
- **Absolute font sizes, never relative steps.** The old em-based `fs-*`
  classes multiplied when they nested, so five clicks of A+ made text the size
  of the note. Sizes are px on a `span.mb-fs`; the innermost always wins.
- **The selection toolbar pins itself after a command.** Applying a heading
  resizes the text, which moves the selection rectangle — repositioning the bar
  then slid a different button under the user's cursor.
- **Only the `.ft-name` span is contenteditable while renaming**, not the
  `.frame-title` wrapper. Making the wrapper editable too put focus on the
  wrapper, so the Enter handler bound to the span never fired.
- **Anything that removes a focused editable needs a `settled` latch.**
  Dropping `contenteditable` fires `blur`, which re-enters the same finish
  handler — that is how Escape used to commit the text it should have thrown
  away. Both `renameFrame()` and the studio's text tool guard against it.
- **A hardcoded English string is a bug, not a shortcut.** The check that
  catches it is in §4a; run it before claiming a feature is done.
- **A hardcoded glyph is the same bug.** `icon()` returns `''` for a name it
  does not have, and almost every control that takes an icon has no text label
  — so a typo'd name is not a wrong icon, it is an invisible button.
  `npm run check:icons` is what catches it. See §5a.
- **`applyStaticText()` overwrites `textContent`**, so an icon and a `data-t`
  label cannot live on the same element. The label goes on its own `<span>`.
  Getting this wrong looks fine until the language changes, then the icon is
  gone.
- **The compass diffs its arrow too, now that the arrow is an `<svg>`.**
  Assigning `innerHTML` every frame would restart the chip's fade-in for the
  same reason rebuilding the chip did — that is what `el._arrow` guards.
- **`JSON.stringify(state)` is no longer how you write the board.** Use
  `serialise()`, or you write the live mirror as well as `boards[active]` and
  double the file. Export uses it too.
- **`--user-data-dir` *is* the userData root, not its parent.** A board for a
  sandbox goes at `<dir>/board.json`, not `<dir>/Mental Board/board.json`. Get
  this wrong while testing a migration and the app looks like it lost the file —
  which is indistinguishable from the bug you were testing for.
- **The empty-board card is `pointer-events: none` on purpose**, buttons aside.
  Making the whole card solid puts a dead rectangle in the middle of the canvas
  that swallows the double-click-to-create gesture its own tips describe.
- **A board's icon cannot be cleared to nothing** — the rail tile would have
  nothing to show, so it falls back to `sticky_note_2`. Notes and frames still
  clear to empty.
- **Changing a board's icon must not `pushUndo()`.** The undo stack holds notes,
  frames and links, so a snapshot taken for a board change restores a canvas
  identical to the one on screen — making the next Ctrl+Z look broken.
  `commitIconChange()` is where that branch lives.
- **A `.cmd` file with LF endings does not fail cleanly.** `cmd.exe` seeks
  through a batch file rather than reading it line by line, so LF-only endings
  make those seeks land mid-word and it hands you the *tails* of your own
  comments back as commands (`'ies' is not recognized…` — from "Copies"). Every
  script in `admin/` shipped broken this way once: fine in an editor, fine in
  git, fine under Git Bash, broken the moment it was double-clicked.
  `.gitattributes` pins `*.cmd` to CRLF but only governs **checkout** — a file
  written directly never passes through it. `npm run check:crlf` is the actual
  guarantee.
- **The build number is in the titlebar on purpose.** `#tbVer`, painted by
  `paintVersion()`. It is the only thing in the app that answers "is this the
  new build?" without opening anything, and not being able to answer that once
  turned three shipped changes into an argument about whether they had shipped.
  It is empty when running from source, because there is no packaged version to
  name and a wrong number is worse than none.
- **The peek corner is a coordinate test, not an element.** In hover mode the
  launcher is invisible and `pointer-events: none`, and so is `#boardRail`
  itself — a `width: max-content` container around a 34px button is a 34px dead
  square over the corner of the canvas otherwise, and a double-click there makes
  no note. `trackRailPeek()` reads the pointer position on a `pointermove` we
  are already handling and toggles `body.rail-peek`; nothing is drawn over the
  board and nothing takes a hit until the user can see it. Do not "simplify"
  this back into an invisible padded `::before` with `:hover` — that is the bug
  it was written to fix.
- **A control that is invisible at rest has to introduce itself.** `flashRail()`
  shows the launcher for ~3s at startup and after the rail mode is switched to
  hover, then lets it fade. Discoverability in time rather than in space: it
  leaves nothing on screen afterwards. Remove it and the switcher becomes a
  feature only someone who read the README knows exists.
- **Only `pinned` inserts the rail into the layout.** In `hover` mode — the
  default — it is a 34px launcher with an absolutely-positioned flyout, so the
  container's box stays 34×34 when closed. That is deliberate: a container sized
  to the open panel would be an invisible rectangle over the canvas eating
  clicks. The panel is `width: max-content` between a min and a max, so it grows
  with the boards rather than reserving room for boards that do not exist.
- **The flyout needs its `::before` bridge.** There is a 7px gap between the
  launcher and the panel; without an invisible strip spanning it, dragging the
  pointer down from the launcher crosses dead space, `:hover` is lost on both,
  and the panel shuts on the way to it.
- **Anything that outlives the pointer must `holdRail(true)`** — a rename, the
  tile menu — or the flyout closes and takes the caret with it. And anything
  that latches it open needs a way out, which is the outside-click branch in the
  document `pointerdown` handler.
- **`npm run build`, not `@electron/packager` directly.** Called directly it
  writes a *new* output folder beside the old one and touches no shortcuts, so
  you get a second complete copy of the app and the shortcut still opens the
  first. `tools/build-app.js` exists to make that impossible; see §6.
- **Sorting a table loses the caret.** Moving a row the selection lives inside
  collapses it — and `sortTable()` works out its column *from* the caret, so the
  second click on sort silently did nothing. It puts the caret back afterwards.
- **Code colouring is stripped on `enterEdit` and reapplied on `exitEdit`.**
  Highlight spans between the caret and the text cause exactly the split-node
  bugs `<pre>` already suffers from. Never leave them in an editable body.
- **An inline `<svg>` in note text needs `contenteditable="false"`.** Without it
  the caret can sit inside the glyph and the next keystroke inserts a node that
  renders as nothing and cannot be deleted. `inlineIcon()` sets it; `icon()`
  does not, because chrome icons are never in an editable.
- **A ternary in an icon slot hides the glyph from `check-icons`.** It reads
  `item(act, 'name', …)` call sites literally, so
  `item('archive', x ? 'a' : 'b', …)` makes one of them look undrawn. Write the
  branch around the whole call instead.
- **`askPass` clears the error banner, so the retry loop passes it in.** Setting
  the message and then calling `askPass` again blanked it on the way past, which
  looked exactly like a wrong passphrase being ignored.
- **Reminders are scanned, not scheduled.** A `setTimeout` per note would need
  cancelling on every edit, delete, board switch and undo, and one missed
  cancellation fires a reminder for a note that no longer exists.
- **Quick capture writes from the renderer, not from main.** Main owns the
  hotkey and raises the window; the renderer owns `state` and the debounced
  save. A second writer would race it and lose whichever side wrote last.
- **Material Symbols has no delete-row or delete-column glyph.** `remove_row`,
  `delete_row` and `column_delete` all 404. Those two buttons compose the plain
  row/column icon with a small `close` badge (`.tb-stack`) rather than
  approximating with `delete`, which would not say *what* it deletes.
- **A UTF-8 BOM used to make a perfectly good board "unreadable".**
  `JSON.parse` throws on a leading U+FEFF and half of Windows writes one —
  Notepad, `Set-Content`, `Out-File`. Since recovery means copying a backup
  over `board.json` by hand, that path has to survive whatever tool did the
  copying. `readJson()` strips it.
- **`render()` detaches the note being edited.** Anything that calls it while
  `editing` is set must `exitEdit()` first (which persists the text) and
  reopen afterwards, or the user loses whatever they typed since the last
  save and the next keystroke goes into an orphaned node. `applyLang()` is
  the one that learned this the hard way.
- **`[dir="rtl"] X` is not the same as `html[dir="rtl"] X`.** The first also
  matches any paragraph the user pinned to RTL inside a note, so a chrome rule
  written that way leaks into note content. Chrome rules use the `html` prefix.
- **The note placeholders are `::before` content**, which cannot read the
  catalogue. `applyStaticText()` passes them in as `--ph-note` /
  `--ph-note-edit` custom properties.
- **`els.get(id)` returning nothing is normal, not a bug.** Above 60 items the
  map holds only what is mounted, so every caller must guard — `?.` or an early
  return. Anything that *must* touch the element of an item the user cannot see
  calls `ensureMounted(id)` instead. See §4c.
- **Anything that replaces `state.notes` wholesale must call `updateCulling()`**
  if it can cross the 60-item threshold, or the items that should now be
  unmounted sit in the document until the next pan. `addNote` and `deleteItems`
  do; `render()` recomputes it from scratch.
- **`contain: paint` on a note makes it unresizable.** The eight handles and the
  icon badge hang outside the border box on purpose, and paint containment clips
  to it — so they become invisible *and* unhittable. `layout style` only.
- **The ghost's layers are not escaped, so nothing from the note may reach
  them but numbers.** `noteGhost()` builds a `background` string; every value
  in it is a computed px figure or a `--gcN` name. Putting a colour, a class or
  any text from `n.body` into that string would make note content CSS.
- **`body.far-zoom` must exempt the note being edited.** It works by taking the
  body out of the layout with `display: none`, and doing that to a focused
  `contenteditable` takes the caret with it — Ctrl+0 mid-sentence would throw
  away the keystroke you were in the middle of.
- **`writeNow()` records `lastWritten` only after the write succeeds.** Setting
  it first means a write that threw is never retried, because the next save sees
  identical bytes and skips.
- **A template's body is stored HTML, so it must come from a note.** Never build
  one from a string in the source: the whole point of dropping the built-in
  templates was that no catalogue key stands behind template *content* any more.
- **Later CSS wins**, especially the late-overrides block at the end.
- Everything is `file://`. No dev server, no HMR; reload the window (`Ctrl+R`,
  or F12 for DevTools) to see changes.

---

## 8. Deliberately not done yet

These were considered and left out; they are not oversights.

- **No note-level history.** Undo is a snapshot stack over
  `{notes, frames, links}` (90 deep, in memory only). It does not survive a
  restart, it does not cross a board switch, and it does not do character-level
  text undo — inside a note the browser's own undo handles that.
- **No nested workflows.** Frames do not contain frames; membership is one
  level and is computed from geometry, never stored.
- **No built-in templates, and none coming back.** Templates are notes the user
  saved. Shipping a library of them means shipping their content in every
  language the app speaks, and the content would still be a guess about somebody
  else's week. See §4b.
- **A far-zoom note is a stub, but the stub is not a virtualised body.** Below
  `FAR_Z` a note now mounts as the div, its colour, its place, its status
  pill and the ghost of its text (§4c) and nothing else — `makeNote(n, stub)` — with `fillNote()` adding the
  text, the head, the handles and the listeners on the way back in. That took
  fit-everything on 3,000 notes from 330ms to 77ms and a pan frame there from
  9.2ms to 1.5ms. What is still *not* done is virtualising the body of a note
  you can actually read: above `FAR_Z` every mounted note is built in full.
- **Culling does not virtualise the note bodies.** Below `FAR_Z` the bodies come
  out of the layout, but the note elements themselves are still built in full
  when they mount. Building a cheap stub and upgrading it on zoom-in would save
  the DOM construction as well — but it puts an element in `els` that has no
  `.note-body`, which every caller would then have to know about. Not worth it
  until a real board makes it worth it.
- **No database tables.** Tables are tables: rows, columns, text. No cell
  merging, no column types, no sorting, no formulas, no rollups. Those are
  Notion's *database*, which needs its own storage model and its own view layer;
  a half-built version would be worse than none. See §4b.
- **Boards are not shared or synced, and that is the big one.** Everything
  else on the roadmap is done. Real multi-user editing needs a server, accounts,
  hosting and conflict resolution — a project rather than a feature, and a
  half-built sync layer is the one thing that can lose boards. `id` and
  `updatedAt` exist so it does not need a migration when it is built.
- **Few per-board settings.** Theme, language, grid and the rest are global. A
  board carries its own viewport, archive flag and lock, and since 2.0 its own
  font, text size and background (§4r).
- **No column types or formulas in tables.** Sorting is in; the rest of a
  database is not. See §4b.
- **History is per note, not per board.** There is no timeline of the canvas
  itself — moving and deleting are covered by undo, which is in memory only.
- **The agenda and the columns are views, not editors.** You can tick a note
  done and drag a card to a status; anything else is done on the note itself.
  An editable list or board view would be a second editor to keep in step.
- **Pictures inside a note are not drawn in the board picture** (§4g) — only
  the ones standing on the board.
- **Electron is 31.** Current is 44. 31 has been out of security support for a
  long time; moving needs its own verification pass (execCommand, variable-font
  weights and `webUtils.getPathForFile` are the behaviours the lockfile pins
  for). Do it before a public release.
- **The studio bakes annotations in.** They are pixels after Apply, not
  editable objects. Re-opening starts from `data-orig` with a clean slate.
- **No icon upload.** Icons come from the bundled Material Symbols set; adding
  more means editing the list in `tools/fetch-icons.js` and re-running
  `npm run icons` (which needs network).
