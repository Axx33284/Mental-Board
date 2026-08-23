# Mental Board

An infinite canvas for your head. Drop a note anywhere, write in it properly,
drag it about, rope it to another, and fence groups of them into named
workflows you can jump between from anywhere on the board.

![the board](src/assets/icon.png)

## Getting it running

```bash
npm install
npm start
```

`npm start` is the everyday way in. It runs the code as it is on disk right
now, against your real board — no build step, no install, and edits show up on
`Ctrl+R`.

To build the app you double-click:

```bash
npm run build
```

That writes **`App\Mental Board.exe`**. Double-click it. No installer, no
shortcut, nothing in Add/Remove Programs, and your board stays in
`%APPDATA%\Mental Board`.

If you want it one click away, make a shortcut to that exe yourself — the build
never creates, moves or overwrites one, so it stays yours.

`admin\` has all of it as double-clickable scripts: **Build App**, **Run Mental
Board**, **Run Sandbox**, **Check Everything**, **Backup Board**, **Open Data
Folder**. Each one explains itself in its own first few lines.

## Updating

**Run `admin\Build App.cmd`.** That is the whole update mechanism.

It deletes `App\` and rebuilds it from the current source, so the thing you
double-click is always the code in this folder.
`App\BUILD.txt` records the version and the minute it was built, and the
version sits in the titlebar, so you can always confirm you are looking at the
build you just made.

Nothing downloads anything. There is no installer, no auto-updater and no
release feed, and that is deliberate.

> **What went wrong in 1.3.** It shipped an NSIS installer, a portable exe that
> self-extracted to `%TEMP%` on every launch, and an auto-updater that staged a
> new version from GitHub Releases. Between them, one machine could be holding
> four different builds of this app at once — and a shortcut opens exactly one
> of them, with nothing on screen to say which. Rebuilding looked like it did
> nothing.
>
> Worse, a bug in the save path meant that once a single write to `board.json`
> failed, the app quietly decided nothing had changed and stopped saving for the
> rest of the session — with no error, ever. Close the window and the work went
> with it. Reopen and the board was exactly as you left it *before* you started,
> which reads as "the update wiped my notes".
>
> 1.4 deletes the first problem — one copy, one path, one command — and fixes
> the second: a write that fails is retried, and says so on screen instead of
> failing silently.

## What's in it

**Boards.** A small window in the top-left corner holds one row per board — one
for work, one for the gym, one that is nobody else's business. Click a row to
switch. Hover it and three buttons appear at its end: an icon picker, a pencil
that renames it in place, and a ⋯ for everything else — duplicate, archive,
lock, export, delete. None of that is behind a right-click any more, though
right-click still works everywhere it used to. `Ctrl+B` opens the window from
the keyboard. Each board keeps its own notes and its own viewport, so switching
puts you back exactly where you left off.

Settings has three ways to show it. **On hover** is the default, and it gets
out of the way completely: at rest there is nothing in the corner at all. Move
the pointer to the top-left of the canvas and the boards button fades in; keep
going and the list flies out, sized to exactly what is in it and growing as you
add boards, never a panel with empty space in it. Move away and it is gone
again. Click the button to latch it open. It shows itself for a couple of
seconds when the app starts so you know it is there. **Always** gives you the
full column down the edge instead, and **Hidden** takes it away entirely.

**The canvas.** Pans and zooms forever. Scroll to zoom, hold space (or the
middle button, or Alt) and drag to pan. Nothing is ever off the edge of
anything.

**It stays quick when the board gets big.** Past about sixty items only the
notes near what you are looking at are actually in the page, and they mount and
unmount as you pan; the ropes between them are culled the same way, and a drag
only redraws the ones it is actually moving. Zoom far enough out that the text
is unreadable and the text stops being drawn at all, leaving the coloured shapes
you were looking for. Moving a note remembers four numbers rather than a copy of
the whole board, so an afternoon of dragging things around does not slowly eat
your memory. Find and the jump palette read each note once instead of once per
keystroke. The save is debounced longer on a big board, skipped entirely when
nothing changed, and written off the interface thread so a slow disk never
freezes the window mid-sentence. Thousands of notes on an old laptop with a
spinning disk is the case this is built for.

**A copy that is not on this disk.** Settings → Your board → *Backup copy*.
Choose a folder once — a synced drive, a stick, a share — and the app writes a
dated copy there, once a day when it starts, keeping the newest ten. Everything
else the app does to protect your board sits in the same folder as the board,
which protects it from you and not from the drive. This is the other half. It
tells you where the copies go and when the last one landed, and if it ever
fails it says so rather than going quiet.

**Files and documents.** Drop a spreadsheet, a PDF or a deck on the canvas and
you get a note that links to it where it already lives — a link, not a copy, so
your filing stays where it is. `Ctrl+K` accepts a path like
`C:\\Reports\\Q3.xlsx` as well as a web address. Documents open in whatever
Windows uses for them; anything that could *run* is shown in its folder
instead, never launched.

**Pictures of a board.** *Save as image…* draws the whole board — every note,
its colour, its status, and the ropes between them. It is drawn in a light
theme by default even if you work in a dark one, because a picture is for
somewhere else: a deck, an email, a printer. Settings → Your board → *Board
picture* changes that, including back to matching the app.

**Graphics.** Settings → Canvas has **Auto · Full · Light**. Auto looks at the
machine and picks. Light keeps the layout, the colours, the type and the
spacing exactly as they are and only stops doing the expensive per-pixel work —
blurred shadows become crisp edges, background blur goes, canvas animation
stops. It is the same design drawn with cheaper ink, not a stripped-down mode,
and Auto will tell you which one it chose for you.

**Notes.** Hit `+` bottom-left, press `N`, or double-click empty space.
Double-click a note to write in it.

**Your own templates.** Lay a note out the way you like it — a workout table, a
meeting sheet, whatever you actually use — then right-click it and choose **Save
as template**. It comes back as a one-click card on any empty board, in the `/`
menu mid-sentence, and in the jump palette. Settings lists them all with a
button to insert and a button to delete. There are no templates in the box: the
ones you get are the ones you make.

**Writing.** A Notion-style block editor. Type `/` for the block menu —
headings, to-do checkboxes, code blocks, quotes, callouts, dividers, tables,
images, icons, links, and your own templates. Or use the markdown shortcuts:
`# `, `## `, `### `, `- `, `1. `, `[] `, `> `, ` ``` `, `---`. Select text and a
toolbar appears for bold, italic, underline, strikethrough, inline code,
headings, highlighting, and text size — step it with A−/A+ or type an exact
pixel value in the box between them. Headings toggle: click H1 again to go back
to plain text. `Ctrl+K` adds a link.

**Tables.** `/table` drops in a real table. `Tab` moves to the next cell and
falls off the end into a new row; `Shift+Tab` goes back. A toolbar appears while
the caret is inside one, for adding and removing rows and columns and for
sorting by the column you are in — numbers sort as numbers, text sorts in your
own language, blanks sink. Paste a table in from a web page or a spreadsheet and
it stays a table.

**Finding things.** `Ctrl+F` searches **every** board, not just the one you are
looking at, and switches when you land on a hit somewhere else. `Ctrl+P` opens a
jump palette: type a few words to go to any note, any board, or an action.

**Getting things in.** `Ctrl+Alt+N` anywhere in Windows opens a one-line box on
top of whatever you are doing; what you type lands on a board of your choosing.
Turn on a **daily note** and each morning starts with a dated one.

**Not forgetting.** Right-click a note for *Remind me* — in an hour, tomorrow
morning, or a time you pick — and Windows tells you when it is due. Set it to
**repeat** daily, on weekdays, weekly or monthly; a monthly one set on the 31st
stays on month end rather than sliding back to the 28th. The app keeps running
in the tray when you close the window, so reminders still arrive; anything that
fell due while you were away comes as one notification saying how many, not one
per note. Every note also keeps its own recent versions: *Earlier versions* puts
one back without touching anything else on the board.

**Keeping it straight.** A note shows how many other notes link **to** it, and
clicking that badge takes you to them. `/board` drops in a link to another board.
Code blocks are coloured.

**Filtering.** Right-click → *Show only this colour* fades everything else back
so you can look at one thread of a busy board without moving a note. *Show only
this status* does the same by status — everything blocked, everything in
review, or everything nobody has picked up yet. A chip in the corner says what
you are looking at; click it or press `Esc` to come back to the whole board.

**Boards, in and out.** Right-click a board tile to **archive** it (hidden, not
deleted), **send it as a file** for someone else to import, or **lock** it
behind a passphrase — encrypted on disk and in every backup, with no recovery if
you forget it. Drag a note onto a tile to move it to that board.

**Icons.** 423 of them. Give any note, workflow or board one — in any of nine
colours, or set to track the note's own colour — from the icon badge on a note,
the dot on a workflow's label, or *Icon…* in the right-click menu. `/icon` drops
one straight into the text, mid-sentence, where it behaves like a character.

**Images.** Drop, paste, or insert one with `/image`. Click it to get a
toolbar: resize by dragging the corner or with +/−, align it left, centre or
right, or open the studio to **crop** it, draw on it, box or arrow something,
and drop text notes right onto the picture.

**Resizing.** Grab any edge or corner, exactly like a Windows window. Right
edge for width, bottom edge for height, corners for both.

**Selecting.** Drag a box across empty space to lasso several notes, then move
them all at once. `Shift`-click to add to the selection.

**Colour.** Right-click any note (or a whole selection) for the palette, plus
duplicate, layer order, linking and delete.

**Workflows.** Select some notes and press `Ctrl+G` to fence them into a
titled, translucent group. Double-click the label to rename it, right-click
anywhere inside it to recolour it, and drag it by its label — everything inside
travels with it.

**Never getting lost.** When a workflow is off-screen, a signpost with its name
appears on the edge of the window pointing at it. Click the signpost and the
canvas glides over and frames it.

**Your language.** The interface ships in English and Arabic and picks up
Windows' language on first run; change it any time in Settings, with no
restart. Arabic mirrors the whole interface — menus, dialogs, the create dial,
the zoom bar — and comes with its own bundled font, so it looks the same on
every machine.

**Writing in any script.** Notes handle direction per paragraph, not per note.
Write an Arabic paragraph and an English one in the same note and each sits on
its own side, with its bullets, checkboxes and quote bars on the correct edge —
you do not have to set anything. The two arrow buttons in the text toolbar
force a paragraph one way when the automatic choice is wrong; press the same
one again to hand it back.

## Keyboard

| | |
|---|---|
| `N` / `G` / `L` | New note · new workflow · link selected note |
| Double-click | Edit a note · rename a workflow |
| `Esc` | Stop editing, clear selection, close anything |
| Space + drag, middle-drag | Pan |
| Drag empty space | Lasso-select |
| Scroll | Zoom · `Ctrl 0` reset · `Shift 1` fit everything |
| `Ctrl D` / `Ctrl G` | Duplicate · group |
| `Ctrl C` `Ctrl V` `Ctrl X` | Copy · paste · cut |
| `Delete` | Delete selection |
| `Ctrl Z` / `Ctrl Shift Z` | Undo · redo |
| `Ctrl F` | Find across every board |
| `Ctrl P` | Jump to any note, board or command |
| `Ctrl B` | Open the boards window |
| `Ctrl ,` | Settings |
| Arrow keys | Nudge selection (`Shift` for a bigger step) |

## Settings

Top-left gear. **Language** — English, العربية, or *Match Windows*.

**Twelve themes** — Light, Paper, Sand, Mono and Mist on the light side; Dark,
Dim, Ocean, Midnight (true black), Forest and Plum on the dark side; plus
**Custom**, where you choose three colours and the app derives the rest so you
cannot build a palette whose text you cannot read.

**Theme follows** is a three-way choice. *My pick* stays on the one you chose.
*Windows* swaps with the OS. *Time of day* swaps on your own clock — you set
when the day starts and when the night does.

For both of the swapping modes you say outright **which two themes** the app
moves between: a day theme and a night theme, each picked from the full list
with its colours shown beside the name. Any theme can go in either slot — they
mean *your* day one and *your* night one, so Dim by day and Midnight at 2am is a
perfectly good answer and the app will not argue with it.

Plus accent colour, canvas background, text size, graphics mode, whether the
wheel zooms or pans, snap-to-grid, edge signposts and spell-check — and export,
import, and a link straight to the data folder.

## Where your board lives

```
C:\Users\<you>\AppData\Roaming\Mental Board\
```

Settings shows you that path, with **Open folder** and **Copy path** next to
it. Four files matter:

| | |
|---|---|
| `board.json` | Your board. This is the file. |
| `board.bak.json` | The copy from before the last save. |
| `backups\board-YYYY-MM-DD.json` | One a day, newest 20 kept. |
| `backups\board-before-1.0.0.json` | Taken once, before a new version first writes anything. |

**Rebuilding never touches this folder.** The app writes to a fixed path that
does not depend on the version or on what the app is called — so a new build
opens the same board the old one left. Before a new version writes anything at
all, it copies your board aside under the old version number.

Writes are atomic: a temporary file, then the current board copied to
`.bak.json`, then a rename over the top. Pulling the plug mid-save cannot leave
a half-written board. If `board.json` is ever unreadable, the app falls back to
`board.bak.json` by itself; if neither can be read, it **refuses to save
anything at all** for that session rather than write over a file you might
still recover, and tells you where to look.

Chromium's own caches live in `%LOCALAPPDATA%\Mental Board\` instead, so the
folder above holds nothing but your own files.

**Backing it up yourself:** *Export to file…* writes a plain JSON copy
anywhere you like, and *Import from file…* brings it back — that is also how
you move a board to another machine.

## Translating it

One file. Copy `src/assets/lang/en.js` to `src/assets/lang/<code>.js`, translate the
right-hand side, set `_native` to the language's own name for itself, set
`_rtl: true` if it reads right to left, and add a `<script>` tag next to the
others at the bottom of `src/index.html`. The picker in Settings finds it by
itself. Anything you leave untranslated falls back to English rather than
showing blank, so a partial translation is worth shipping.

Then check it:

```bash
npm run check:lang
```

That verifies every key the code asks for exists, that your file matches
English key for key, and that plural tables carry every form your language
actually uses — Arabic needs six, English needs two.

## Building on it

`MAP.md` is the map of the source — read that before opening `src/js/`.
§4a covers the language layer and the two separate bidi mechanisms.
