# Mental Board 3.3 — a full review

A judgement of the whole app as it stands at 3.3.0, area by area, each score
backed by something measured or read rather than a feeling. Where this
review found a fault it could fix safely, it was fixed in the same change; the
rest is at the end, ranked. Never shipped: `tools/build-app.js` leaves this
file out of the package.

## The verdict

| Area | Score | In one line |
|---|---|---|
| Data safety | **9** | Atomic writes, a backup copy, unreadable files never overwritten, every save's status acted on. |
| Security | **8.5** | Sandboxed, locked to one page, no remote content; the phone's LAN server is careful. Unsigned binaries and plain `http` on the LAN are the honest limits. |
| The phone as a tablet | **8.5** (was 7) | Right by construction (pictures, not geometry); now survives a sleeping phone and keeps out of the pen's way. |
| The live wallpaper | **8.5** (was 6) | Now a place rather than a picture, at a cost measured per frame. |
| Install and update | **9** (was 6) | A setup file and a zip, both to one place, both tested on Windows before a release. |
| Performance | **8.5** | 2,000 notes pan at 60 frames a second even drawing without a GPU. |
| Accessibility | **6.5** | Text contrast is excellent; the tertiary text colour is not, and the board itself is a pointer-first surface. |
| Code health | **7** | Disciplined and almost free of dead code, but one global scope of 1,805 names, a few very long functions, and an editor on a deprecated API. |
| Tests | **8.5** | 144 tests that drive the real app; CI runs them on Windows — but only for a release. |
| Documentation | **7** | `MAP.md` explains the why of nearly everything, and drifts because of its size. |
| **Overall** | **8** | A careful, thoughtful app whose remaining risks are structural, not careless. |

## Data safety — 9

- Every write is atomic (`.tmp` → keep the old file as `.bak` → rename), every
  store call returns a status per board and the renderer acts on it
  (`applySaveResult`), and a file that will not parse is never written over.
- Fixed in this release cycle: a Quit save that a late debounced save could
  overwrite with older bytes; two boards with one name sharing (and pruning)
  one backup folder. Both have tests in `tools/test-store.js` (29 tests).
- Not done: no `fsync` before the rename. The `.bak` fallback covers most
  crash cases, so this is low.

## Security — 8.5

- The page is sandboxed with context isolation, a strict CSP
  (`script-src 'self'`), no navigation and no new windows; local documents
  open only for an allow-list of types.
- `file://` loads that name another machine are refused in main, because on
  Windows they hand the user's NTLM hash to that machine.
- The phone server listens only after Pair, on one private address, for one
  phone with a one-use 128-bit token, checks every message, and stops by
  itself. 3.3 lengthened how long it waits for a phone that dropped (1 → 30
  minutes); the way back in is still only the 128-bit `resume` secret.
- Electron 44 is in security support until Electron 47 ships.
- Limits: the setup and the exe are not code-signed (SmartScreen warns), and
  the phone traffic is plain `http`/`ws` on the user's own network, a
  documented trade for not showing a certificate warning at every pairing.

## The phone as a tablet — 8.5 (was 7)

Judged against how a phone is really used. Fixed in 3.3, each with a test:

| Before | Now |
|---|---|
| The pairing ended if the phone slept: the PC waited 1 minute, the page gave up after ~8 s. | The PC waits 30 minutes; the page retries for as long, at once on wake or Wi-Fi return, and replaces a socket gone quiet for 7 s. The server lets that phone take over its own half-open socket. |
| A 1.2 s line triggered **14** pictures — each a capture and encode on the thread reading the pen. | **At most 4**; one arrives as the pen lifts. |
| One JPEG quality (72): visible blocks and fringes once the phone scales the picture 2–3×. | Quality 90 once the board is still (39 KB vs 28 KB, once per pause); identical pictures are still never re-sent. |
| No redo; the gestures were invisible. | Redo (button and three-finger tap), haptics, a gesture card at connect. |
| Pairing was three clicks deep. | The pen bar's phone button and the palette start it with the code on screen. |

Also found: the pairing panel's explanation never showed — its key was
written twice in each language file and the note-padding hint won. Fixed, and
`npm run check:lang` now fails on any key written twice.

Not done, and why: the pictures are only as sharp as the PC's screen pixels
(a phone has 2–3× more), because super-sampling would mean rendering the
board twice; and the phone cannot keep its own screen awake over `http`.

## The live wallpaper — 8.5 (was 6)

The rain was a painted picture behind glass and the snow was flakes over a
gradient. Now: depth (layers move apart as the pointer leans and the board
pans), a city behind fogged glass that drops wipe clear, rain falling
outside, breathing lights and passing cars, rare distant lightning (a glow,
never a flash), gusting snow with frost on the window, a new night sky with
an aurora, and sound made as it plays (rain, wind, crickets), off by default.

Measured script time per frame at 1400 × 860:

| Scene | Lite tier | Full tier, no GPU |
|---|---|---|
| Rain | 1.3 ms (was 1.2) | 5.4 ms (15.5 before the fog was halved) |
| Snow | 0.35 ms (was 0.6) | 0.35 ms |
| Night sky | 0.46 ms | 1.0 ms |

It stops when the window is hidden and stands still under reduced motion.

## Install and update — 9 (was 6)

`Mental-Board-Setup-<version>.exe` installs per user, with no administrator,
to the same single folder as the zip; it replaces rather than merges, refuses
while the app runs, adds one Start-menu entry, and its uninstaller leaves
`Documents\My Boards` alone. Every release runs the setup for real on a
Windows runner (install, update, refusal, uninstall) and the zip's PowerShell
instructions too, before anything is published. One point off: unsigned.

## Performance — 8.5

On a board of 2,000 notes, drawing without a GPU (the worst case):

| | |
|---|---|
| First draw | 7 ms |
| Panning | 16.8 ms per frame median, 31.7 ms at the 95th percentile |
| Switching to far zoom | 31 ms |
| Serialising the board (273 KB) | 2 ms |

Off-screen notes are not in the document, and far zoom draws the board on one
canvas.

## Accessibility — 6.5

- **Text contrast is excellent.** Measured in all 19 themes against WCAG:
  body text 9.5:1 to 21:1 (AAA everywhere), secondary text (`--dim`)
  5.1:1 to 13.2:1 (AA everywhere).
- **Tertiary text is not.** `--dimmer` is 3.0:1 to 3.8:1 in 18 of 19 themes —
  2.99:1 in the default — and it colours real words: a setting's value
  ("60%"), sub-row labels, menu section labels, hints. Below AA (4.5:1), and in
  the default theme below even the 3:1 asked of icons.
- **Fixed in this review:** three kinds of control had no accessible name —
  the custom accent colour, a status's name field (both built after their
  labels were applied), and every ‹ value › row in Settings, which a screen
  reader announced as its words with nothing saying it could be changed. The
  25 rows are now sliders with a name and the option as words
  (`aria-valuetext`), updated as they change. A scan of every Settings tab now
  finds no unnamed control.
- The board is a spatial, pointer-first surface; notes can be moved with the
  arrow keys, but a screen reader has no model of the canvas. That is the
  nature of the app more than a defect.

## Code health — 7

- **Clean:** 1,238 top-level functions, none unreferenced after this review
  removed the last two (`touchActiveBoard`, `resetInk`). Values that reach
  the DOM are escaped (`esc`) or sanitised (`sanitize`), consistently.
- **One global scope of 1,805 names** across 31 scripts: it already cost two
  releases of a broken editor (a second `placeCaret` replaced the first).
  `npm run check:dupes` now guards it; the structure remains a risk.
- **Long functions:** `init` 603 lines, `openCtxMenu` 340, `paintBoardCanvas`
  186, `syncSettingsUI` 174, `onKeyDown` 165.
- **109 empty `catch` blocks** (45 in the page, 64 on the main side). Most are
  deliberate best-effort around the OS; together they make a failure easy to
  miss.
- **The editor is `document.execCommand`** (35 calls), deprecated and kept
  alive by browsers for compatibility. `MAP.md` documents the workarounds;
  it is still the largest long-term risk in the code.

## Tests — 8.5

144 tests: 29 for the store, 7 groups for the phone server and the QR
encoder, and 108 that launch the real app and drive it — including, since
3.3, a phone over a real socket against the running app, and the wallpaper's
depth, fog and sound. Every release runs them on Windows, plus the setup and
the zip's instructions for real. They have caught real faults: this cycle,
four editor tests exposed the shadowed `placeCaret`, and Windows exposed a
browser that misreports points on a curve. Missing: they run on a version
tag, not on every pull request.

## Documentation — 7

`MAP.md` (5,500 lines) records why almost everything is the way it is, and
`CLAUDE.md` turns the hard lessons into rules — rare and valuable. Its size is
also why it drifts: this cycle found it saying databases did not exist (they
arrived in 2.8), a build script promising there was no installer and that
notes live in `%APPDATA%`, and a pane description missing a scene.

## What to do next, ranked

1. **Raise `--dimmer` to 4.5:1 wherever it carries text** — for example split
   it into a text colour and an icon colour — in all 19 themes.
2. **Run `npm run check` and `npm test` on every pull request** on the
   Windows runner, not only on a release tag.
3. **Plan the way off `execCommand`**: a small editor model of its own for
   the blocks the app already understands.
4. **Code-sign the setup and the exe** so SmartScreen stops warning.
5. **Break up `init()` and `openCtxMenu()`** into the pieces they already
   contain (wiring per feature, menu sections).
6. **Move Electron again before 47 ships**, with the same Windows pass this
   cycle used to prove 31 → 44.
