/* Mental Board — state.js
   One mutable `state`, the boards inside it, undo, and everything that reaches the disk.

   Part 2 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 2. state + persistence ─────────────── */

/* Board ids opened with a passphrase this session. Deliberately in memory only:
   quitting re-locks, which is the entire point of locking. */
const unlocked = new Set();

/* ---- boards ----
   A board is one canvas: its own notes, frames, links and viewport. The app
   holds several and shows one at a time.

   `state.notes` / `frames` / `links` / `view` / `nextZ` are the **live** copy —
   the arrays every other region in this file reads and mutates, exactly as they
   did when there was only one board. `state.boards` holds the stored copy of
   each one. `syncActiveBoard()` copies live → stored and runs before every save
   and every switch; `bindBoard()` copies stored → live.

   Keeping the live fields where they have always been is what makes boards a
   change to this region instead of a change to all 3400 lines: nothing outside
   here has to learn that more than one board exists.

   Every board carries a stable `id` and an `updatedAt`. Neither is read yet.
   Both are here because the reason boards exist is the shared/online mode that
   comes later, and any sync layer needs to name a board and know which copy is
   newer. Storing them now is free; retrofitting ids onto boards people already
   have is a migration.

   `name: ''` means "show the default label". Storing the translated name would
   bake one language into the file — a board created in Arabic would keep its
   Arabic name after switching the interface to English. */
function makeBoard(name, icon) {
  return {
    id: uid(),
    name: typeof name === 'string' ? name : '',
    icon: icon || 'sticky_note_2',
    iconColor: 'auto',
    updatedAt: Date.now(),
    archived: false,
    /* The bin. An ordinary board in every other respect — see the trash block in
       §14 — which is what lets it save, render, cull and search through code
       that already existed. At most one board has this. */
    trash: false,
    /* When a board is locked, `enc` holds the ciphertext and notes/frames/links
       are empty until it is opened this session. See §2b. */
    enc: null,
    /* Where it sits in the rail and on disk: '' is the top level, anything
       else is a group — a sub-folder of My Boards. See "Move to…". */
    group: '',
    /* How this one board looks. Each falls back to the global setting when
       unset, so a board that never chose keeps following Settings. */
    font: '',             // '' or one of NOTE_FONTS
    smallText: false,
    bg: null,             // { file, fit, dim } — a picture in the board's own folder
    /* Drawing on the board (2.1): strokes in world coordinates, and whether
       they sit behind the notes or over them. See js/ink.js. */
    inkBehind: false,
    notes: [], frames: [], links: [], ink: [],
    view: { x: 0, y: 0, z: 1 },
    nextZ: 1
  };
}
const boardById = (id) => state.boards.find((b) => b.id === id) || null;
const activeBoard = () => boardById(state.activeBoard) || state.boards[0] || null;
const isLocked = (b) => !!(b && b.enc && !unlocked.has(b.id));
/* Boards you can actually switch to right now. Archived ones are still in
   `state.boards` and still saved — they are hidden, not deleted. */
/* The boards you switch between. The bin is not one of them: it is reachable
   from its own tile at the foot of the rail and from the jump palette, but it
   should never be what "the next board" means, what a stray drop lands on, or
   where a daily note goes. */
const liveBoards = () => state.boards.filter((b) => !b.archived && !b.trash && !b.unreadable);
/* Can what is on screen right now actually be written?

   A locked board that has not been opened this session holds no plaintext, and
   syncActiveBoard() refuses to copy the live arrays onto it — correctly, or the
   previous board's contents would land on top of its ciphertext. The catch is
   that nothing used to stop you *editing* it: the note appeared on the canvas,
   serialise() wrote the envelope, and the note was gone at the next launch with
   no error at any point. Everything that creates or changes content asks here
   first, and says why when the answer is no. */
function canEditHere() {
  const b = activeBoard();
  if (b && b.unreadable) { toast(t('msg.boardUnreadable'), 4000); return false; }
  if (!isLocked(b)) return true;
  toast(t('msg.boardIsLocked'), 3200);
  return false;
}
// the label to show: either what the user typed, or "Board n" by position
function boardLabel(b) {
  if (b && b.name) return b.name;
  const i = state.boards.indexOf(b);
  return t('board.numbered', { n: (i < 0 ? 0 : i) + 1 });
}

function bindBoard(b) {
  if (!b) return;
  state.activeBoard = b.id;
  state.notes = b.notes; state.frames = b.frames; state.links = b.links;
  state.ink = b.ink || (b.ink = []);
  state.view = b.view; state.nextZ = b.nextZ;
}
/* Copy the live fields back onto the stored board. Called before any write and
   before any switch, so it does not matter that some callers replace
   `state.notes` wholesale (deleteItems, restore, wipe) rather than mutating it
   — whatever the reference is at this moment is what gets stored. */
function syncActiveBoard() {
  const b = activeBoard();
  if (!b) return;
  /* A locked board that has not been opened this session holds no plaintext.
     Copying the live arrays onto it would write whatever board was open before
     over its (empty) contents and then serialise() would drop the ciphertext —
     losing the board. Refuse. */
  if (isLocked(b)) return;
  b.notes = state.notes; b.frames = state.frames; b.links = state.links;
  b.ink = state.ink;
  b.view = state.view; b.nextZ = state.nextZ;
}

/* When the open board last actually changed.

   This used to be a line inside syncActiveBoard(), and putting it there quietly
   broke the one optimisation the save path has. serialise() calls
   syncActiveBoard(), so every serialise stamped a new millisecond — which made
   `if (json === lastWritten) return;` in writeNow() dead code from the day it
   was written. Every saveSoon() after a gesture that moved nothing, every click
   that ended a marquee, wrote the entire file. On a spinning disk with a
   multi-megabyte board that is the difference between an app you can use and
   one that stutters at rest.

   It also meant merely *looking* was a change: the jump palette, the find bar
   and the Settings word count all call syncActiveBoard(), so opening any of
   them marked the board as freshly updated.

   Stamping is now something a caller asks for, and writeNow() is the one that
   asks — after it has compared, so it only ever fires when something really
   did change. */
function touchActiveBoard() {
  const b = activeBoard();
  if (b && !isLocked(b)) b.updatedAt = Date.now();
}

function defaults() {
  const first = makeBoard('', 'sticky_note_2');
  return {
    v: 3,
    appVersion: '',       // the build that last wrote this file; see stampVersion()
    boards: [first],
    activeBoard: first.id,
    /* the live mirror of the active board — see the note above. It is not
       written to the file; serialise() drops it. */
    notes: first.notes, frames: first.frames, links: first.links, ink: first.ink,
    view: first.view, nextZ: first.nextZ,
    /* The user's own templates. Global rather than per-board: a template is a
       shape you reuse, and the board you happened to be on when you saved it
       says nothing about where you will want it next. */
    templates: [],
    /* The user's own status list — see DEFAULT_STATUSES. Global, like
       templates, and written to the file so it survives every board. */
    statuses: DEFAULT_STATUSES(),
    settings: {
      lang: 'auto',         // 'auto' follows Windows, else an id from assets/lang
      theme: 'mental',      // any id from THEMES
      matchSystem: true,    // kept in step with themeMode; healed in adopt()
      /* What decides which theme is showing.
           fixed  — `theme`, and nothing changes it
           system — follow Windows, swapping lightTheme / darkTheme
           clock  — follow the time of day, swapping at dayAt / nightAt
         `matchSystem` was the boolean this replaced. It is still written, and
         still read on the way in, so a board that moves between builds keeps
         the choice either way round. */
      themeMode: 'system',
      dayAt: '07:00',       // 24h "HH:MM" — when the light theme takes over
      nightAt: '19:00',     // and when the dark one does
      lightTheme: 'mental-light',  // which theme "light" means for this user
      darkTheme: 'mental',
      /* The user's own palette, used when `theme` is 'custom'. Three colours
         and a mode is the whole input: everything else a theme needs — the
         raised surfaces, the dimmed text, the hairlines, the grid, the shadows
         — is derived from these in customVars(), so there is no way to build a
         palette whose text cannot be read on its own background. */
      customTheme: { mode: 'dark', bg: '#0d0f11', surface: '#16191c', text: '#e8e4da' },
      accent: 'mono',       // white on a dark theme, black on a light one — see ACCENTS
      /* What a note's text is set in. The UI keeps its own face whatever this
         says — this is about the writing, not about the app. See NOTE_FONTS. */
      noteFont: 'frutiger',
      /* How a note sits on the canvas: the shadow under it. Presentation only,
         like shape and density. See NOTE_SHADOWS. */
      noteShadow: 'flat',
      /* Whether the app animates at all. 'auto' honours the operating system's
         own "reduce motion" setting and is the right default, because someone
         who has already asked Windows for less movement should not have to ask
         again here. See MOTION_MODES. */
      motion: 'auto',
      /* Used when `accent` is 'custom'. Kept beside it rather than replacing it,
         so switching to a preset and back does not lose the colour you mixed. */
      accentCustom: '#7fd6c8',
      /* The ropes between notes. Red by default because that is what string on
         a corkboard is, and because the accent — which they used to borrow —
         is already doing the job of marking selection and focus. */
      linkColor: 'red',     // a COLORS name, or a literal #rrggbb
      linkStyle: 'curve',   // 'curve' | 'straight' | 'thread'
      linkAnchor: 'top',    // 'top' (centre of the top edge) | 'edge' (facing side)
      linkWidth: 2,         // stroke width in screen px, 1–5
      embeds: true,         // let a pasted video link become a playable card
      grid: 'dots',         // one of GRID_STYLES
      gridSize: 26,         // the pitch in world px, 12–96; also the snap step
      gridFade: 100,        // how strongly the paper shows, 20–160 (%)
      fontScale: 100,
      wheel: 'zoom',        // 'zoom' | 'pan'
      // how far one notch of the wheel goes, 40-220 (%). 100 is what it was.
      zoomSpeed: 100,
      /* Line a note up with its neighbours while you drag it. The lines are
         drawn, and the drag is nudged onto them — see alignGuides() in §7. */
      guides: true,
      /* How much the canvas may spend on looking good — see PERF_MODES and
         resolvedPerf(). 'auto' asks the machine. */
      perf: 'auto',
      /* Draw without the GPU at all. Read by main *before* the window exists
         (app.disableHardwareAcceleration must run before ready), so changing
         it takes a restart. For the machine whose graphics driver makes
         Chromium worse than no driver; off unless asked for. */
      softwareRender: false,
      snap: false,
      compass: true,
      minimap: true,        // the map at the bottom right — js/views.js
      /* The pen as it was last put down (2.1, js/ink.js): which tool, which
         colour (`text`, a COLORS name or a hex), and which of three sizes. */
      pen: { tool: 'pen', color: 'text', size: 1 },
      // the same, for drawing notes (2.5, js/sketch.js), and whether one opens full screen
      sketchPen: { tool: 'pen', color: 'text', size: 1 },
      sketchFull: true,
      // the book reader's pen (3.0, js/book.js): the hand to read, or a pen, its colour and size
      bookPen: { tool: 'hand', color: 'text', size: 1 },
      /* Settings ▸ Drawing and Settings ▸ Books (3.1). A drawing note's
         pattern ('dots' 'grid' 'lines' 'none'), whether a pen's pressure
         widens a line (drawing notes, books and the board), and how much a
         line is steadied as it is drawn ('off' 'some' 'more'). A book's
         first view, how a page turns ('curl' 'slide' 'fade' 'none') and how
         fast, whether a page's corner can be dragged over and the wheel turns
         it, whether it opens full screen, its page numbers, and how sharp a
         PDF page is drawn ('sharp' or 'quick'). What a new notebook is: its
         paper, its page ('a4' 'letter' 'square' 'wide') and how many pages. */
      skGuide: 'dots', inkPressure: true, skSmooth: 'off',
      // the cursor glides as you type, as Word's does (3.1.1, editor.js paintCaret)
      smoothCaret: true,
      bookView: 'book', bookTurnFx: 'curl', bookSpeed: 'normal', bookDrag: true, bookWheel: true,
      bookFull: true, bookNumbers: true, bookQuality: 'sharp',
      nbPaper: 'ruled', nbShape: 'a4', nbPages: 12,
      /* What a drawing is drawn on (3.0): 'light' or 'dark' paper whose ink keeps
         its colour whatever the theme, or 'note' — the note's colour and the
         theme's ink, as before 3.0. See SK_PAPERS in sketch.js. */
      sketchPaper: 'light',
      /* Handwrite it (3.0, js/handwrite.js): the hand it writes in, the language
         the picture is read in ('auto' tries every one Windows has), whether
         it is written stroke by stroke, and whether what cannot be drawn stays. */
      hwHand: 'ink', hwLang: 'auto', hwAnimate: true, hwKeep: true,
      /* A live wallpaper behind the board (3.0, js/wallpaper.js): what it is,
         a YouTube link for 'youtube', and how it sits — opacity, a darkening
         veil, blur, how much rain or snow, and whether the video has sound. */
      wpKind: 'none', wpUrl: '', wpOpacity: 100, wpDim: 25, wpBlur: 0, wpAmount: 60, wpSound: false, wpGrid: true,
      wpVolume: 50, wpDepth: true,       // 3.3: the drawn kinds' own sound, and their layers moving apart
      /* the face the app is set in (3.0.1, mental.css §84): 'clean' — the
         reference's Neue Frutiger and Univers Condensed — 'typewriter', or 'system' */
      uiFont: 'clean',
      // the names of the font files picked for each face (main.js keeps the files in userData\fonts)
      uiFontNames: { frutiger: '', condensed: '', typewriter: '' },
      // minutes between the saves that happen whatever else does (2.10) — one of AUTOSAVE_MINUTES
      autosaveMin: 5,
      // menu sounds (2.1, js/sound.js): off unless asked for, and how loud
      sounds: false,
      soundVol: 60,
      /* Extra (2.1): a mechanical keyboard under your typing (KEY_SOUNDS, off by
         default) and notes as paper pinned to a board (CORK_MODES). */
      keySounds: 'off',
      keyVol: 60,
      cork: 'off',
      spell: true,
      railMode: 'hover',    // 'pinned' | 'hover' | 'off' — see RAIL_MODES
      noteShape: 'soft',    // 'round' | 'soft' | 'square' — see NOTE_SHAPES
      noteDensity: 'cosy',  // which preset notePad came from, or 'custom' — see NOTE_DENSITIES
      /* The space between a note's writing and its own edge, per side, in
         world px (2.4). The three presets fill it in; the four sliders in
         Settings ▸ Notes set it exactly. See PAD_PRESETS and applyNotePad(). */
      notePad: { t: 12, r: 14, b: 12, l: 14 },
      /* What a brand-new note starts as. Three fields rather than one, because
         "my notes are always this colour and about this big" is one preference
         that happens to need three numbers. Nothing here touches a note that
         already exists. */
      noteColor: 'default',
      noteW: 280,
      noteH: 190,
      /* Ask before a delete. Off by default: deleting is already reversible —
         it goes to the bin, and Ctrl+Z puts it back — so a dialog every time
         would be a prompt that trains people to click through prompts. It is
         here for anyone who would rather be asked. */
      confirmDelete: false,
      /* The canvas with nothing on it but the canvas: no rail, no + button, no
         zoom bar, no signposts. Stored, so it survives a restart — and init()
         says how to get back out, because a control that is invisible at rest
         has to introduce itself. */
      focusMode: false,
      showArchived: false,  // list archived boards in the flyout anyway
      daily: false,         // drop a dated note on `dailyBoard` each morning
      dailyBoard: '',       // '' means the board that was open when it was switched on
      capture: true,        // the global hotkey; see main.js
      /* Which theme a picture of the board is drawn in — 'app' for whatever is
         on screen, otherwise a THEMES id. Defaults to Paper rather than to the
         app, because the thing a board picture is for is going somewhere else:
         a deck, an email, a printer. A near-black PNG is the wrong answer to
         all three, and it was the only answer available. */
      exportTheme: 'paper',
      /* A copy of everything, in a folder the user picked — a synced drive, a
         stick, a share. Everything else the app does to protect a board lands
         on the same disk as the board, which is no protection against the disk. */
      backupDir: '',
      backupAuto: true,     // one a day on launch, once a folder is chosen
      lastBackup: 0,
      /* Closing the window hides it to the tray instead of ending the app, so
         reminders and the capture hotkey keep working. Off puts back the old
         behaviour exactly: close means quit. See main.js. */
      background: true
    }
  };
}

/* How the board rail behaves.
   pinned — always there, and it insets the canvas so nothing hides under it.
   hover  — a thin strip at the edge that slides out when the pointer reaches
            it, floating over the canvas.
   off    — gone; boards are still there, you just switch them another way. */
const RAIL_MODES = ['pinned', 'hover', 'off'];

/* How a note is drawn. Both are pure presentation — they set a `data-` on
   <body> and CSS does the rest — so neither touches a note's stored geometry
   and switching between them can never move or resize anything. */
const NOTE_SHAPES = ['round', 'soft', 'square'];
/* Spacing between a note's text and its own edge. Three steps, because two
   were not distinguishable enough to be worth choosing between — 14px vs 10px
   of padding is a difference you can measure and not one you can see. */
const NOTE_DENSITIES = ['thin', 'cosy', 'roomy', 'custom'];
/* What each of those means since 2.4, when the space became four numbers.
   The values are the ones the CSS used to derive from one --note-pad (6, 14
   and 28, with the top and bottom 2px less), so a board looks exactly the same
   the first time it opens in a build that has sliders. */
const PAD_PRESETS = {
  thin:  { t: 4,  r: 6,  b: 4,  l: 6 },
  cosy:  { t: 12, r: 14, b: 12, l: 14 },
  roomy: { t: 26, r: 28, b: 26, l: 28 }
};
const PAD_MAX = 64;
const PAD_SIDES = ['t', 'r', 'b', 'l'];
function healPad(p, density) {
  const base = PAD_PRESETS[density] || PAD_PRESETS.cosy;
  const o = (p && typeof p === 'object') ? p : base;
  const out = {};
  PAD_SIDES.forEach((k) => { out[k] = clamp(Math.round(Number.isFinite(+o[k]) ? +o[k] : base[k]), 0, PAD_MAX); });
  return out;
}
// the preset a padding is, or 'custom'
function padPreset(p) {
  return Object.keys(PAD_PRESETS).find((k) => PAD_SIDES.every((s) => PAD_PRESETS[k][s] === p[s])) || 'custom';
}
/* What a note's *text* is set in — never the interface, which keeps one face
   whatever this says. Four, and each is a different kind of reading rather than
   a different taste: the system UI face, a serif for long prose, a monospace
   for anything that is really a list of values, and a rounded face for a board
   that is mostly short handwriting-shaped notes.

   Every stack keeps "Noto Sans Arabic" in front of it. That face carries a
   unicode-range covering only Arabic, so it costs Latin text nothing and it is
   the only thing standing between an Arabic note and a system fallback that
   may not be installed. Drop it from one of these stacks and Arabic notes
   silently change face when the setting changes — see css/lang.css. */
const NOTE_FONTS = ['frutiger', 'typewriter', 'system', 'serif', 'wide', 'mono', 'rounded', 'narrow', 'hand'];
/* The shadow under a note. `flat` is not "no shadow" — it is a hairline ring,
   because a note with neither a shadow nor an edge stops being an object on a
   surface and becomes a coloured patch of the surface. */
const NOTE_SHADOWS = ['soft', 'flat', 'lift'];
/* Whether the app moves. 'auto' asks the operating system through
   prefers-reduced-motion, which is the only one of the three that can be right
   without being told anything. */
const MOTION_MODES = ['auto', 'full', 'reduced'];

/* Where a workflow's title sits, per frame.

   Two letters: the edge, then the side. `t`/`b` is above or below the frame,
   `i` is inside the top edge — useful when a frame is up against the top of
   what you can see, or when two frames are stacked closely enough that a title
   hanging above one lands on the one over it. `l`/`c`/`r` is the side.

   Physical left and right, not logical, and deliberately so: a workflow is
   placed by world coordinate like everything else on the canvas, and the canvas
   does not mirror for an RTL language. A title the user put on the left should
   be on the left in every language, the same way the + is. */
const TITLE_POS = ['tl', 'tc', 'tr', 'il', 'ic', 'ir', 'bl', 'bc', 'br'];

/* What the canvas is drawn on. Six, and each one answers a different question:
   dots and crosses mark position without drawing anything between, lines and
   graph give you distance, ruled gives long text something to sit on, and iso
   is for anything drawn in plan. `plain` is the answer for people who want the
   board and nothing else. See css/chrome.css. */
const GRID_STYLES = ['dots', 'lines', 'graph', 'cross', 'ruled', 'iso', 'plain'];

/* How often a reminder comes back. '' is once, which is what every reminder
   written before this existed was, so an old board needs no migration.

   `weekdays` is here and "every other week" is not, on purpose: the cadences
   people actually run a team on are daily, working days, weekly and monthly,
   and each extra option is one more thing to read past in a five-button row. */
const REPEATS = ['', 'daily', 'weekdays', 'weekly', 'monthly'];

/* What picks the theme. See `themeMode` in defaults(). */
const THEME_MODES = ['fixed', 'system', 'clock'];

/* How much work the canvas is allowed to do to look good.

     full — every note casts a real blurred shadow, menus blur what is behind
            them, everything that moves is animated. This is the app as
            designed and it is what a machine built this decade should show.
     lite — the same layout, the same colours, the same type. What goes is the
            per-pixel work: blurred shadows become flat rings, backdrop blur is
            dropped, and canvas transitions stop. Nothing is *missing* — it is
            the same design drawn with cheaper ink.
     auto — pick one by asking the machine, once, at boot.

   The point of keeping `full` and `lite` as one design rather than two is that
   nobody should be able to tell which one they are looking at without being
   told. A "low quality mode" that looks low quality is a mode people turn off
   and then blame the app for being slow. */
// the switches a typing sound can be (js/sound.js), and the board under pinned notes
const KEY_SOUNDS = ['off', 'blue', 'brown', 'red', 'black', 'membrane', 'typewriter'];
const CORK_MODES = ['off', 'cork', 'wood'];
const PERF_MODES = ['auto', 'full', 'balanced', 'lite'];
/* How a rope between two notes is drawn.
     curve    — the S-bend it has always been
     straight — a plain line, shortest path
     thread   — a line that sags, the way string on a corkboard does */
const LINK_STYLES = ['curve', 'straight', 'thread'];
const LINK_ANCHORS = ['top', 'edge'];
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
// "HH:MM" in 24h, or null. Stored as a string so the file stays readable.
function okClock(v, fallback) {
  if (typeof v !== 'string') return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return fallback;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
const clockMinutes = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : 0; };

/* ---- statuses -----------------------------------------------------------
   A note can carry one status, from a list the user owns outright: rename it,
   recolour it, reorder it, add one, delete one. The four below are only what a
   brand-new board starts with — nothing in the app treats them as special, and
   deleting every one of them is allowed.

   Global rather than per board, for the same reason templates are: "In review"
   means the same thing on the work board and the side-project board, and
   maintaining two lists that drift apart is worse than one that is slightly
   too general.

   `done: true` marks the statuses that mean finished. That is the one piece of
   meaning the app reads rather than just displays — it is what lets a note be
   struck through when it is done, and what the counter counts. The user sets it
   per status, so "Shipped" or "Archived" can mean done just as much as "Done".

   The id is what a note stores, so it must never be reused or renumbered:
   renaming a status keeps every note pointing at it, which is the whole reason
   this is a list of objects and not a list of strings. */
const DEFAULT_STATUSES = () => ([
  { id: 'todo', name: '', color: 'default', done: false },
  { id: 'doing', name: '', color: 'blue', done: false },
  { id: 'blocked', name: '', color: 'red', done: false },
  { id: 'done', name: '', color: 'green', done: true }
]);
/* A default status has no stored name — it is looked up in the catalogue, so it
   arrives in the user's own language and follows a language change. The moment
   it is renamed it gets a literal name and stops translating, which is correct:
   the words are then theirs, not the app's. */
const statusName = (s) => (s && s.name) || (s && FALLBACK['status.' + s.id] !== undefined ? t('status.' + s.id) : '') || (s ? s.id : '');
const statusById = (id) => (id ? state.statuses.find((s) => s.id === id) || null : null);
const statusOf = (n) => statusById(n && n.status);

/* A note's date, beside its status: a calendar day, 'YYYY-MM-DD' in local
   time, or '' for none. A day and not a timestamp on purpose — "due Friday"
   has no hour in it, and a timestamp would move the day under anyone who
   crosses a time zone. Reminders are the timed thing; this is the plain one.
   A declaration, not a const, so adoptBoard() can call it whatever the load
   order. See MAP.md §4s. */
function okDateKey(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const [y, m, d] = v.split('-').map(Number);
  const x = new Date(y, m - 1, d);
  return (x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d) ? v : '';
}

function adoptStatus(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 40) : '',
    color: COLORS.includes(raw.color) ? raw.color : 'default',
    done: !!raw.done
  };
}

let state = defaults();

/* Set when the store itself could not be read — not one board, the folder.
   While it is on, every write is refused. One board whose file would not
   parse is a different, smaller thing: it arrives with `unreadable: true`,
   is shown in the rail so the user knows, and is simply never written. */
let loadFailed = false;

const APP_VERSION = (() => {
  try { return (DATA && DATA.paths && DATA.paths().version) || ''; } catch (_) { return ''; }
})();

/* ---- reading the store ----
   Since 2.0 the store is a folder: settings.json and one board.json per
   board (see src/store.js). preload hands over what it found as
   { settings: { data, status }, boards: [{ id, group, dir, data, status }] },
   and adoptStore() folds that into the one-document shape adopt() has always
   taken — so the healing, the legacy 1.0.x path and Import all stay one
   function. */
function load() {
  let res = null;
  try {
    if (DATA) res = DATA.load();
    else {
      // a plain browser: the 1.x single document in localStorage, if any
      const raw = localStorage.getItem('mental-board');
      const parsed = raw ? JSON.parse(raw) : null;
      res = parsed ? legacyToStore(parsed) : null;
    }
  } catch (_) { res = { error: 'load threw' }; }
  if (!res) res = { settings: { data: null, status: 'empty' }, boards: [] };
  if (res.error) { loadFailed = true; return; }
  adoptStore(res);
  primeWritten(res);
  stampVersion(res);
}

/* What is on disk is what was just read, so record it as written. Without
   this the first save of every session — usually the flush on the way out —
   found no "last written" for any board and wrote all of them, whether or
   not anything had changed. A board the store renamed (`renamedFrom`) or one
   read from its .bak is left out on purpose: those *should* be written. */
function primeWritten(res) {
  const rows = new Map((res.boards || []).map((r) => [r.id, r]));
  state.boards.forEach((b) => {
    const row = rows.get(b.id);
    if (!row || row.status !== 'ok' || row.renamedFrom || row.from === 'backup' || b.unreadable) return;
    lastWrittenBoard.set(b.id, serialiseBoard(b));
  });
}
// the 1.x document, read as if it were a folder — browser fallback only
function legacyToStore(parsed) {
  const list = (Array.isArray(parsed.boards) && parsed.boards.length) ? parsed.boards
             : [{ notes: parsed.notes, frames: parsed.frames, links: parsed.links, view: parsed.view, nextZ: parsed.nextZ }];
  return {
    settings: { data: parsed, status: 'ok' },
    boards: list.map((b) => ({ id: (b && b.id) || uid(), group: '', dir: '', data: b, status: 'ok' }))
  };
}
const folderName = (dir) => String(dir || '').split(/[\\/]/).filter(Boolean).pop() || '';

function adoptStore(res) {
  const s = (res.settings && res.settings.data) || {};
  const order = Array.isArray(s.boardOrder) ? s.boardOrder.map(String) : [];
  const rows = Array.isArray(res.boards) ? res.boards : [];
  /* The rail order lives in settings.json. A board the order does not know —
     a folder somebody copied in by hand — goes to the end, by name. */
  const rank = (row) => { const i = order.indexOf(row.id); return i < 0 ? order.length : i; };
  const nameOf = (row) => String((row.data && row.data.name) || folderName(row.dir));
  rows.sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)));
  const boards = rows.map((row) => {
    if (row.status !== 'ok' || !row.data) {
      /* A folder is there and its board.json would not parse — and neither
         would its .bak. Shown, named after its folder, never written. */
      return { id: row.id, name: folderName(row.dir) || row.id, icon: 'warning', unreadable: true,
               group: row.group || '', notes: [], frames: [], links: [], ink: [] };
    }
    const d = Object.assign({}, row.data, { id: row.id, group: row.group || '' });
    /* The store gave this board a new id — its folder was a copy wearing
       another board's id, or had none. Its own file URLs still name the old
       one; adopt() rewrites them once it has the board. */
    if (row.renamedFrom) d._renamedFrom = row.renamedFrom;
    return d;
  });
  adopt({
    v: 3, appVersion: s.appVersion, settings: s.settings, templates: s.templates,
    statuses: s.statuses, activeBoard: s.activeBoard, boards
  });
}

/* `mbf://<from>/…` → `mbf://<to>/…` through every body a board holds. Used
   when a board changes id (a duplicate, a copied-in folder, an import that
   collided) — the files went with the folder, so only the host changes. */
function relinkBoardHost(b, from, to) {
  if (!b || !from || !to || from === to) return 0;
  const needle = `mbf://${String(from).toLowerCase()}/`, repl = `mbf://${String(to).toLowerCase()}/`;
  let n = 0;
  const swap = (html) => {
    if (!html || html.indexOf(needle) < 0) return html;
    n++;
    return html.split(needle).join(repl);
  };
  (b.notes || []).forEach((note) => {
    note.body = swap(note.body);
    (note.hist || []).forEach((h) => { h.body = swap(h.body); });
  });
  return n;
}

/* First launch on a new build: copy every board aside before this version has
   written a single byte to it. If an update ever mangles something, the
   previous version's boards are in Backups\ named after the build they came
   from. Costs one file write per board, once per upgrade. */
/* Set when this launch is the first one on a build the file has not seen.
   Read once by init() to say so out loud — see the toast there. */
let versionChanged = false;
/* Set when the pre-upgrade snapshot could not be written. Read once by init(),
   which tells the user — see stampVersion(). */
let versionSnapshotError = '';

/* The build number in the titlebar, permanently. Running from source there is
   no packaged version to show, so the slot stays empty rather than lying. */
function paintVersion() {
  const el = $('tbVer');
  if (!el) return;
  el.textContent = APP_VERSION || '';
  el.classList.toggle('hidden', !APP_VERSION);
}

// is version `a` older than `b`? '' (a store from before versions were written) is older than anything
function versionBefore(a, b) {
  if (!a) return true;
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0); }
  return false;
}
function stampVersion(res) {
  if (!APP_VERSION) return;
  const was = state.appVersion;
  state.appVersion = APP_VERSION;
  /* Deliberately true for `was === ''` as well. A store written before this
     field existed is exactly the case where the user has no way at all to tell
     which build just opened, so it is the case that most needs telling. */
  versionChanged = was !== APP_VERSION;
  if (!was || was === APP_VERSION || !DATA || !DATA.versionSnapshot) return;
  /* The *raw* files, not serialise(): this snapshot exists to answer "what
     did the board look like before this build touched it". And the status is
     acted on — this file is written once, there is no second chance at it,
     and a failure nobody hears about is a recovery story that quietly is not
     there when it is needed. */
  try {
    for (const row of (res.boards || [])) {
      if (row.status !== 'ok' || !row.data) continue;
      const r = DATA.versionSnapshot(row.id, JSON.stringify(row.data, null, 2), was);
      if (r && r.ok === false) {
        versionSnapshotError = r.error || '?';
        console.error('pre-upgrade snapshot failed:', row.id, versionSnapshotError);
      }
    }
  } catch (err) {
    versionSnapshotError = String((err && err.message) || err);
    console.error('pre-upgrade snapshot threw:', err);
  }
}

const okIcon = (v) => (typeof v === 'string' && ICONS[v]) ? v : '';
const okIconColor = (v) => (v === 'auto' || COLORS.includes(v)) ? v : 'auto';

/* ---- per-note history ----
   A note keeps its own recent bodies so one note can be put back without
   restoring the whole file over the top of every other board.

   Both caps matter. HIST_MAX bounds the count; HIST_MAX_BYTES drops any single
   version too big to be worth keeping, which in practice means one with a
   pasted image in it — a 6 MB data URL times twelve versions times every note
   would turn a board file into something that takes a visible moment to save,
   and the debounce would start landing on top of typing. */
const HIST_MAX = 12;
const HIST_MAX_BYTES = 40000;
function adoptHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof h.body === 'string' && h.body.length <= HIST_MAX_BYTES)
    .map((h) => ({ t: +h.t || 0, body: h.body }))
    .slice(-HIST_MAX);
}
function pushHistory(n, previousBody) {
  if (!n || typeof previousBody !== 'string') return;
  if (previousBody === n.body) return;                    // nothing changed
  if (previousBody.length > HIST_MAX_BYTES) return;
  if (!Array.isArray(n.hist)) n.hist = [];
  const last = n.hist[n.hist.length - 1];
  if (last && last.body === previousBody) return;         // already the top of the stack
  n.hist.push({ t: Date.now(), body: previousBody });
  while (n.hist.length > HIST_MAX) n.hist.shift();
}

/* What a board's background can be. `fit` says how the picture sits behind
   the canvas; `dim` (0–90) is how much of the canvas colour is laid over it so
   notes stay readable on a busy photograph. The picture itself is a file in
   the board's own folder, named here and never by path. */
const BG_FITS = ['cover', 'contain', 'tile', 'center'];
function adoptBg(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.file !== 'string' || !raw.file) return null;
  return {
    file: raw.file.slice(0, 120),
    fit: BG_FITS.includes(raw.fit) ? raw.fit : 'cover',
    dim: clamp(Math.round(+raw.dim || 0), 0, 90)
  };
}

/* Heal one board. Anything missing falls back to a default, anything malformed
   is dropped, and links pointing at notes that no longer exist are pruned. */
function adoptBoard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const b = makeBoard(typeof raw.name === 'string' ? raw.name : '', okIcon(raw.icon) || 'sticky_note_2');
  if (typeof raw.id === 'string' && raw.id) b.id = raw.id;
  b.iconColor = okIconColor(raw.iconColor);
  b.updatedAt = +raw.updatedAt || Date.now();
  b.archived = !!raw.archived;
  b.trash = !!raw.trash;
  /* How this board looks, on its own. All three are presentation and all
     three fall back to the global setting when unset — see applyBoardLook(). */
  b.group = typeof raw.group === 'string' ? raw.group.slice(0, 60) : '';
  b.font = NOTE_FONTS.includes(raw.font) ? raw.font : '';
  b.smallText = !!raw.smallText;
  b.bg = adoptBg(raw.bg);
  if (raw.unreadable) { b.unreadable = true; b.icon = okIcon(raw.icon) || 'warning'; return b; }

  /* A locked board arrives as ciphertext and nothing else. Keep the envelope
     exactly as written — re-deriving any part of it would make the payload
     undecryptable — and leave the arrays empty until a passphrase opens it. */
  if (raw.enc && typeof raw.enc === 'object' &&
      typeof raw.enc.data === 'string' && typeof raw.enc.salt === 'string' && typeof raw.enc.iv === 'string') {
    b.enc = { v: +raw.enc.v || 1, salt: raw.enc.salt, iv: raw.enc.iv, data: raw.enc.data };
    b.view = { x: 0, y: 0, z: 1 };
    return b;
  }

  b.notes = (Array.isArray(raw.notes) ? raw.notes : []).filter((n) => n && n.id).map((n) => ({
    id: String(n.id), x: +n.x || 0, y: +n.y || 0,
    w: Math.max(n.pic ? PIC_MIN : NOTE_MIN_W, +n.w || 260), h: Math.max(n.pic ? PIC_MIN : NOTE_MIN_H, +n.h || 180),
    body: typeof n.body === 'string' ? n.body : '',
    color: okItemColor(n.color, 'default'),
    icon: okIcon(n.icon), iconColor: okIconColor(n.iconColor),
    z: +n.z || 1,
    remindAt: +n.remindAt || 0,
    reminded: !!n.reminded,
    // '' is once; anything else is a REPEATS id. See nextOccurrence() in §14b.
    repeat: REPEATS.includes(n.repeat) ? n.repeat : '',
    /* A status id, or '' for "not tracked". Deliberately not validated against
       state.statuses here: adoptBoard runs per board while the status list is
       being read, and a note whose status was pruned because the list had not
       been parsed yet would lose it permanently. Resolution happens at paint
       time instead. */
    status: typeof n.status === 'string' ? n.status : '',
    date: okDateKey(n.date),
    hist: adoptHistory(n.hist),
    // set only on notes the daily-note setting made; the value is its date key
    daily: typeof n.daily === 'string' ? n.daily : undefined,
    /* A picture standing on the board by itself — no note around it. The body
       is one <img>; `ar` is its width over its height, kept so a resize keeps
       the shape without waiting for the picture to decode. See pictures.js. */
    pic: n.pic ? true : undefined,
    ar: n.pic && +n.ar > 0 ? +n.ar : undefined,
    /* Its shape and where its writing sits in it (2.4, shapes.js). All four
       are absent on an ordinary note, so a board written before them reads
       back unchanged and one written after reads in an older build as plain. */
    /* A drawing note (2.5, sketch.js): its page size, its title and its
       strokes. Absent on every other note; an older build reads one as an
       empty note. */
    sketch: n.pic ? undefined : okSketch(n.sketch),
    book: n.pic || n.sketch ? undefined : okBook(n.book),      // a book (3.0, book.js)
    form: n.pic || n.sketch || n.book ? undefined : okForm(n.form),
    textAt: n.pic || n.sketch || n.book ? undefined : okTextAt(n.textAt),
    tx: n.pic || n.sketch || n.book ? undefined : okNudge(n.tx),
    ty: n.pic || n.sketch || n.book ? undefined : okNudge(n.ty),
    /* Only on something sitting in the trash: which board it came from, and
       when it went in. */
    trashedFrom: typeof n.trashedFrom === 'string' ? n.trashedFrom : undefined,
    trashedAt: +n.trashedAt || undefined
  }));
  b.frames = (Array.isArray(raw.frames) ? raw.frames : []).filter((f) => f && f.id).map((f) => ({
    id: String(f.id), x: +f.x || 0, y: +f.y || 0,
    w: Math.max(FRAME_MIN_W, +f.w || 600), h: Math.max(FRAME_MIN_H, +f.h || 420),
    title: typeof f.title === 'string' ? f.title : t('frame.default'),
    color: okItemColor(f.color, 'blue'),
    icon: okIcon(f.icon), iconColor: okIconColor(f.iconColor),
    titlePos: TITLE_POS.includes(f.titlePos) ? f.titlePos : 'tl',
    // pinned behind the notes, out of reach of a lasso (2.1, lockFrame())
    locked: f.locked ? true : undefined,
    // its signpost switched off in the workflows list (2.4, page.js)
    noCompass: f.noCompass ? true : undefined,
    trashedFrom: typeof f.trashedFrom === 'string' ? f.trashedFrom : undefined,
    trashedAt: +f.trashedAt || undefined
  }));
  const ids = new Set(b.notes.map((n) => n.id));
  b.links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l) => l && ids.has(String(l.from)) && ids.has(String(l.to)))
    .map((l) => ({ id: String(l.id || uid()), from: String(l.from), to: String(l.to), color: okItemColor(l.color, undefined) }));

  const v = raw.view && typeof raw.view === 'object' ? raw.view : {};
  b.view = { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, ZOOM_MIN, ZOOM_MAX) };
  b.ink = adoptInk(raw.ink);
  b.inkBehind = !!raw.inkBehind;
  b.nextZ = maxOf(b.notes, (n) => n.z || 1, 1) + 1;   // a loop, not a spread — see maxOf()
  if (raw._renamedFrom) relinkBoardHost(b, raw._renamedFrom, b.id);
  return b;
}

/* Take an arbitrary saved or imported shape and make it a valid state.

   `keepSettings` is passed by Import and by nothing else, and it means what it
   says: these settings survive the import. The order below is the whole of it
   — defaults, then the file, then mine. */
function adopt(raw, keepSettings) {
  if (!raw || typeof raw !== 'object') return;
  const d = defaults();
  const rawSet = raw.settings || {};
  const kept = keepSettings || {};
  state = {
    v: 3,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    settings: Object.assign(d.settings, rawSet, kept),
    boards: [], activeBoard: '',
    // anything malformed is a missing template, never a broken one
    templates: (Array.isArray(raw.templates) ? raw.templates : []).map(adoptTemplate).filter(Boolean),
    /* An absent list means a board written before statuses existed, so it gets
       the starting four. An empty *array* is a deliberate choice to have none
       and is left alone. */
    statuses: Array.isArray(raw.statuses)
      ? raw.statuses.map(adoptStatus).filter(Boolean)
      : DEFAULT_STATUSES(),
    notes: [], frames: [], links: [], ink: [], view: { x: 0, y: 0, z: 1 }, nextZ: 1
  };
  const st = state.settings;
  // a board saved with a language that is no longer shipped falls back to auto
  if (typeof st.lang !== 'string' || (st.lang !== 'auto' && !LANGS[st.lang])) st.lang = 'auto';
  if (st.theme === 'system') { st.matchSystem = true; st.theme = 'mental'; }
  if (!THEMES.some((t) => t.id === st.theme)) st.theme = 'mental';
  if (!THEMES.some((t) => t.id === st.lightTheme)) st.lightTheme = 'mental-light';
  if (!THEMES.some((t) => t.id === st.darkTheme)) st.darkTheme = 'mental';

  /* themeMode and matchSystem say the same thing in different alphabets, and a
     file can arrive with either. Read the mode when it is there and honest,
     otherwise fall back to the boolean — then write both. */
  if (!THEME_MODES.includes(st.themeMode)) st.themeMode = st.matchSystem ? 'system' : 'fixed';
  st.matchSystem = st.themeMode === 'system';
  st.dayAt = okClock(st.dayAt, '07:00');
  st.nightAt = okClock(st.nightAt, '19:00');

  // three colours and a mode; anything missing or malformed falls back per field
  const ct = (st.customTheme && typeof st.customTheme === 'object') ? st.customTheme : {};
  st.customTheme = {
    mode: ct.mode === 'light' ? 'light' : 'dark',
    bg: isHex(ct.bg) ? ct.bg : '#0d0f11',
    surface: isHex(ct.surface) ? ct.surface : '#16191c',
    text: isHex(ct.text) ? ct.text : '#e8e4da'
  };

  // ropes
  if (!(COLORS.includes(st.linkColor) || isHex(st.linkColor))) st.linkColor = 'red';
  if (!LINK_STYLES.includes(st.linkStyle)) st.linkStyle = 'curve';
  if (!LINK_ANCHORS.includes(st.linkAnchor)) st.linkAnchor = 'top';
  st.linkWidth = clamp(Math.round(+st.linkWidth || 2), 1, 5);
  st.embeds = st.embeds !== false;
  /* The rail was a boolean for one version. Read the *unmerged* settings —
     Object.assign has already put the default into st.railMode — so somebody
     who turned the rail off does not find it back on after an update. */
  const said = Object.assign({}, rawSet, kept);
  if (!RAIL_MODES.includes(said.railMode)) {
    st.railMode = ('rail' in said) ? (said.rail ? 'hover' : 'off') : 'hover';
  }
  delete st.rail;
  if (!PERF_MODES.includes(st.perf)) st.perf = 'auto';
  st.softwareRender = st.softwareRender === true;
  if (!GRID_STYLES.includes(st.grid)) st.grid = 'dots';
  st.gridSize = clamp(Math.round(+st.gridSize || 26), 12, 96);
  st.gridFade = clamp(Math.round(+st.gridFade || 100), 20, 160);
  if (!isHex(st.accentCustom)) st.accentCustom = '#7fd6c8';
  /* 2.1 made Mono the default accent. A store last written by an older build
     and still on the old default — mint — never chose it, so it moves to the
     new default once. The stamp on the way out (stampVersion) makes this a
     one-time step: anyone who picks mint again afterwards keeps it. */
  if (st.accent === 'mint' && versionBefore(state.appVersion, '2.1.0')) st.accent = 'mono';
  if (!NOTE_SHAPES.includes(st.noteShape)) st.noteShape = 'soft';
  if (!NOTE_DENSITIES.includes(st.noteDensity)) st.noteDensity = 'cosy';
  /* A store from before 2.4 has a density and no numbers: the numbers are the
     preset it named, so nothing on the board moves. */
  st.notePad = healPad(rawSet.notePad || kept.notePad || null, st.noteDensity);
  st.noteDensity = padPreset(st.notePad);
  if (!NOTE_FONTS.includes(st.noteFont)) st.noteFont = 'frutiger';
  /* The default face has moved twice: 3.0.0 made it the typewriter (moving a
     store that never chose — 'system' — onto it), and 3.0.1 made it the
     reference's Frutiger, because the typewriter read as a costume. A store
     on either old default moves once, and is marked. */
  if (!(st.fontV >= 3)) { if (st.noteFont === 'system') st.noteFont = 'frutiger'; }
  if (!(st.fontV >= 4)) {
    if (st.noteFont === 'typewriter') st.noteFont = 'frutiger';
    if (st.uiFont === 'typewriter') st.uiFont = 'clean';
    st.fontV = 4;
  }
  if (!NOTE_SHADOWS.includes(st.noteShadow)) st.noteShadow = 'flat';
  if (!MOTION_MODES.includes(st.motion)) st.motion = 'auto';
  st.zoomSpeed = clamp(Math.round(+st.zoomSpeed || 100), 40, 220);
  st.guides = st.guides !== false;
  st.minimap = st.minimap !== false;
  st.pen = healPen(st.pen);
  st.sketchPen = healSketchPen(st.sketchPen);
  st.sketchFull = st.sketchFull !== false;
  { const bp = st.bookPen || {}; st.bookPen = { tool: ['hand', 'pen', 'marker', 'brush', 'eraser', 'note'].includes(bp.tool) ? bp.tool : 'hand', color: inkColorOk(bp.color) ? bp.color : 'text', size: [0, 1, 2].includes(bp.size) ? bp.size : 1 }; }
  if (!SK_PAPER_KINDS.includes(st.sketchPaper)) st.sketchPaper = 'light';
  // 3.1: Settings ▸ Drawing and ▸ Books. A book opened full screen when a drawing note did, so that is where bookFull starts.
  if (!SK_GUIDES.includes(st.skGuide)) st.skGuide = 'dots';
  st.inkPressure = st.inkPressure !== false;
  st.smoothCaret = st.smoothCaret !== false;
  if (!INK_SMOOTH[st.skSmooth]) st.skSmooth = 'off';
  if (!BOOK_VIEWS.includes(st.bookView)) st.bookView = 'book';
  if (!BOOK_TURNS.includes(st.bookTurnFx)) st.bookTurnFx = 'curl';
  if (!BOOK_SPEEDS[st.bookSpeed]) st.bookSpeed = 'normal';
  st.bookDrag = st.bookDrag !== false;
  st.bookWheel = st.bookWheel !== false;
  st.bookFull = typeof st.bookFull === 'boolean' ? st.bookFull : st.sketchFull;
  st.bookNumbers = st.bookNumbers !== false;
  if (!['sharp', 'quick'].includes(st.bookQuality)) st.bookQuality = 'sharp';
  if (!BOOK_PAPERS.includes(st.nbPaper)) st.nbPaper = 'ruled';
  if (!NB_SHAPES[st.nbShape]) st.nbShape = 'a4';
  st.nbPages = clamp(Math.round(+st.nbPages || 12), 1, 200);
  if (!HW_HANDS.includes(st.hwHand)) st.hwHand = 'ink';
  st.hwLang = /^(auto|[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*)$/.test(String(st.hwLang)) ? String(st.hwLang) : 'auto';
  st.hwAnimate = st.hwAnimate !== false;
  st.hwKeep = st.hwKeep !== false;
  if (!WP_KINDS.includes(st.wpKind)) st.wpKind = 'none';
  st.wpUrl = typeof st.wpUrl === 'string' ? st.wpUrl.slice(0, 500) : '';
  st.wpOpacity = clamp(Math.round(+st.wpOpacity || 0), 10, 100);
  st.wpDim = clamp(Math.round(+st.wpDim || 0), 0, 90);
  st.wpBlur = clamp(Math.round(+st.wpBlur || 0), 0, 20);
  st.wpAmount = clamp(Math.round(+st.wpAmount || 0), 5, 100);
  st.wpSound = !!st.wpSound;
  st.wpVolume = clamp(Math.round(Number.isFinite(+st.wpVolume) ? +st.wpVolume : 50), 0, 100);
  st.wpDepth = st.wpDepth !== false;
  st.wpGrid = st.wpGrid !== false;
  if (!['clean', 'typewriter', 'system'].includes(st.uiFont)) st.uiFont = 'clean';
  {
    // 3.0.0 kept { latin, arabic }: the typewriter file and the Frutiger file
    const fn = st.uiFontNames || {}, str = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
    st.uiFontNames = { frutiger: str(fn.frutiger || fn.arabic), condensed: str(fn.condensed), typewriter: str(fn.typewriter || fn.latin) };
  }
  st.autosaveMin = AUTOSAVE_MINUTES.includes(+st.autosaveMin) ? +st.autosaveMin : 5;
  st.sounds = !!st.sounds;
  st.soundVol = clamp(Math.round(+st.soundVol || 60), 5, 100);
  if (!KEY_SOUNDS.includes(st.keySounds)) st.keySounds = 'off';
  st.keyVol = clamp(Math.round(+st.keyVol || 60), 5, 100);
  if (!CORK_MODES.includes(st.cork)) st.cork = 'off';
  if (!COLORS.includes(st.noteColor)) st.noteColor = 'default';
  st.noteW = clamp(Math.round(+st.noteW || 280), NOTE_MIN_W, 900);
  st.noteH = clamp(Math.round(+st.noteH || 190), NOTE_MIN_H, 900);
  st.confirmDelete = !!st.confirmDelete;
  st.focusMode = !!st.focusMode;
  st.showArchived = !!st.showArchived;
  st.daily = !!st.daily;
  st.capture = st.capture !== false;
  st.background = st.background !== false;
  if (st.exportTheme !== 'app' && !THEMES.some((th) => th.id === st.exportTheme)) st.exportTheme = 'paper';
  if (typeof st.backupDir !== 'string') st.backupDir = '';
  st.backupAuto = st.backupAuto !== false;
  st.lastBackup = +st.lastBackup || 0;
  if (typeof st.dailyBoard !== 'string') st.dailyBoard = '';

  /* Two shapes reach here. A file written by 1.0.x keeps notes/frames/links at
     the top level and has no `boards`; anything written since has `boards`.
     The fallback is not an empty board — it is the old top-level fields.
     Treat a 1.0.x file as "no boards" and the app opens empty, then saves that
     emptiness over somebody's entire board on the next keystroke. */
  const legacy = { name: '', icon: 'sticky_note_2', notes: raw.notes, frames: raw.frames, links: raw.links, view: raw.view, nextZ: raw.nextZ };
  const list = (Array.isArray(raw.boards) && raw.boards.length) ? raw.boards : [legacy];
  state.boards = list.map(adoptBoard).filter(Boolean);
  if (!state.boards.length) state.boards = [makeBoard('', 'sticky_note_2')];

  // two boards must never share an id, or boardById picks the wrong one forever
  const seen = new Set();
  state.boards.forEach((b) => { while (seen.has(b.id)) b.id = uid(); seen.add(b.id); });

  /* Reopen on the board you left, unless it is archived, locked or unreadable
     — landing on an empty canvas that will not accept a note is a worse first
     impression than landing on a different board. */
  const usable = (b) => b && !b.archived && !b.trash && !b.unreadable && !isLocked(b);
  const wanted = state.boards.find((b) => b.id === raw.activeBoard);
  bindBoard(usable(wanted) ? wanted : (state.boards.find(usable) || state.boards[0]));
}

/* ---- what actually goes on disk ----
   Two documents now: settings.json, and one board.json per board. A board is
   written on its own, so typing on a board of ten notes never re-serialises
   the four thousand on the others — which is most of what made a big store
   feel slow to save. */
const BOARD_RUNTIME = ['unreadable', '_renamedFrom'];
function boardPayload(b) {
  const out = { mbBoard: 2 };
  Object.keys(b).forEach((k) => { if (!BOARD_RUNTIME.includes(k)) out[k] = b[k]; });
  /* A locked board is written as its envelope and nothing else — even while
     it is open in front of you. Belt and braces: re-encryption keeps `enc`
     current, but if that ever failed the worst case must be "an older
     ciphertext on disk", never "the plaintext of the board you locked". */
  if (b.enc) Object.assign(out, { notes: [], frames: [], links: [], ink: [], view: { x: 0, y: 0, z: 1 }, nextZ: 1 });
  return out;
}
const serialiseBoard = (b, pretty) => (pretty ? JSON.stringify(boardPayload(b), null, 2) : JSON.stringify(boardPayload(b)));
function settingsPayload() {
  return {
    v: 3, appVersion: state.appVersion, settings: state.settings,
    templates: state.templates, statuses: state.statuses,
    boardOrder: state.boards.map((b) => b.id), activeBoard: state.activeBoard
  };
}
const serialiseSettings = (pretty) => (pretty ? JSON.stringify(settingsPayload(), null, 2) : JSON.stringify(settingsPayload()));
/* Everything as one document — the 1.x shape. Still what the browser fallback
   writes and what a full JSON export produces, and still readable by Import. */
function serialise(pretty, overrides) {
  syncActiveBoard();
  const out = Object.assign(settingsPayload(), { boards: state.boards.filter((b) => !b.unreadable).map(boardPayload) });
  if (overrides) Object.assign(out, overrides);
  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}
/* The folder a board gets. The bin's is fixed; an unnamed board's is the
   label the rail shows for it. Purely for the human — the store addresses
   boards by id and renames the folder when this changes. */
const boardDirName = (b) => (b.trash ? t('board.trash') : boardLabel(b));

/* Refresh the ciphertext of every locked board that is open this session, so
   what is written reflects the edits just made. Returns the names of the
   boards that could NOT be re-encrypted — a failure here is invisible from
   the disk's point of view, so it has to come back out and be said. */
async function reencryptOpenBoards() {
  const failed = [];
  for (const b of state.boards) {
    if (!b.enc || !unlocked.has(b.id)) continue;
    const pass = passOf.get(b.id);
    if (!pass) continue;
    if (b.id === state.activeBoard) syncActiveBoard();
    try {
      b.enc = await encryptBoard(b, pass);
    } catch (err) {
      console.error('re-encrypting a locked board failed:', boardLabel(b), err);
      failed.push(boardLabel(b));
    }
  }
  return failed;
}

/* Said once per session, like reportSaveFailure() and for the same reason. */
let encBroken = false;
function reportEncryptFailure(names) {
  if (encBroken || !names.length) return;
  encBroken = true;
  try {
    confirmDlg(t('msg.encFailedTitle'), t('msg.encFailedBody', { name: names.join(', ') }),
               t('msg.saveFailedOpen'), 'safe').then((ok) => {
      if (ok && DATA && DATA.openDataFolder) DATA.openDataFolder();
    });
  } catch (_) {
    try { toast(t('msg.encFailedTitle'), 8000); } catch (_) {}
  }
}

let saveTimer = null;
let encWriting = false;
/* What last landed, per document, so a save that changes nothing writes
   nothing. That only works because serialiseBoard() is pure — `updatedAt` is
   stamped *after* the comparison, by writeNow(), and nowhere else. */
const lastWrittenBoard = new Map();
let lastWrittenSettings = '';
/* Set once a write has failed, so the failure is reported exactly once instead
   of on every keystroke's worth of debounce. */
let saveBroken = false;
/* True while an off-thread write is in flight. One writer at a time. */
let asyncWriting = false;

/* Which documents differ from what is on disk. */
function dirtyDocs() {
  syncActiveBoard();
  const boards = [];
  for (const b of state.boards) {
    if (b.unreadable) continue;                  // never write over a file we could not read
    const json = serialiseBoard(b);
    if (json === lastWrittenBoard.get(b.id)) continue;
    boards.push(b);
  }
  const sj = serialiseSettings();
  return { boards, settings: sj === lastWrittenSettings ? null : sj };
}

/* What a save call answered, acted on — per document. Its own function so
   tools/test-app.js can hand it every shape of answer (MAP.md §7).

   '' is the store saying settings.json failed; '*' is this side, or main,
   saying the call itself never got there — a throw, a rejected promise, an
   empty answer — so nothing landed. Reading '*' as '' once stamped every board
   as written after a failed call, and none of them was retried. Returns the
   set of board ids that did land. */
function applySaveResult(payload, raw) {
  let res = raw;
  if (typeof res === 'boolean') res = { ok: res, errors: res ? [] : [{ id: '*', error: '?' }] };
  if (!res || typeof res !== 'object') res = { ok: false, errors: [{ id: '*', error: 'no answer from the store' }] };
  const errors = Array.isArray(res.errors) ? res.errors : [];
  if (!res.ok && !errors.length) errors.push({ id: '*', error: res.error || '?' });
  const failed = new Set(errors.map((e) => e.id));
  const none = failed.has('*');
  const landed = new Set();
  if (payload.settings && !failed.has('') && !none) lastWrittenSettings = payload.settings;
  (payload.boards || []).forEach((row) => {
    if (none || failed.has(row.id)) return;
    lastWrittenBoard.set(row.id, row.json);
    landed.add(row.id);
    maybeSnapshot(row.id, row.json);
  });
  if (errors.length) {
    reportSaveFailure(errors.map((e) => e.error).filter(Boolean).join('; ') || res.error);
    return landed;
  }
  if (saveBroken) { saveBroken = false; toast(t('msg.saveRecovered')); }
  return landed;
}

/* The write itself, and the one place that decides whether it landed.

   The store returns { ok, errors: [{ id, error }] } per document and never
   throws — so the return value is the *only* signal that a write failed.
   1.3 wrapped the call in try/catch, assumed success, stamped lastWritten,
   and one failed write silently disabled saving for the rest of the session.
   So: the return value decides, per board. A board whose write failed keeps
   its old lastWritten and is retried on the next save, and the failure is
   said out loud once. */
function writeNow(sync) {
  const d = dirtyDocs();
  if (!d.boards.length && !d.settings) return;

  /* Something genuinely changed on these boards, so record when — after the
     comparison, so the stamp cannot make every save look like a change — and
     build the bytes again with the stamp in them. */
  const now = Date.now();
  const boards = d.boards.map((b) => {
    if (!isLocked(b)) b.updatedAt = now;
    return { id: b.id, name: boardDirName(b), group: b.group || '', json: serialiseBoard(b) };
  });
  const payload = { settings: d.settings, boards };
  const settle = (raw) => applySaveResult(payload, raw);

  /* The ordinary, debounced save goes off-thread. `sync` is only true on the
     way out — flushSave() runs from beforeunload, and a promise there never
     settles because the window does not wait for it. */
  if (!sync && DATA && DATA.saveAsync) {
    /* A write is already going. Re-arm the debounce rather than dropping this
       one: by the time it fires the disk is free. */
    if (asyncWriting) { saveSoon(); return; }
    asyncWriting = true;
    let p;
    try { p = DATA.saveAsync(payload); }
    catch (err) { asyncWriting = false; settle({ ok: false, errors: [{ id: '*', error: String((err && err.message) || err) }] }); return; }
    /* Handed back so a caller that has to know the bytes landed — deleting a
       board's folder, exporting one — can wait for it. Nothing else does. */
    return Promise.resolve(p)
      .then(settle, (err) => settle({ ok: false, errors: [{ id: '*', error: String((err && err.message) || err) }] }))
      .finally(() => { asyncWriting = false; });
  }

  let res;
  try {
    if (DATA) res = DATA.save(payload);
    else { localStorage.setItem('mental-board', serialise()); res = { ok: true, errors: [] }; }
  } catch (err) {
    res = { ok: false, errors: [{ id: '*', error: String((err && err.message) || err) }] };
  }
  settle(res);
}

/* Say it once, and say it in a way that cannot be missed — the user is about
   to lose everything they do from here on if they close the window believing
   it is saved. */
function reportSaveFailure(err) {
  if (saveBroken) return;
  saveBroken = true;
  console.error('board save failed:', err);
  try {
    confirmDlg(t('msg.saveFailedTitle'), t('msg.saveFailedBody', { err: err || '?' }),
               t('msg.saveFailedOpen'), 'safe').then((ok) => {
      if (ok && DATA && DATA.openDataFolder) DATA.openDataFolder();
    });
  } catch (_) {
    try { toast(t('msg.saveFailedTitle'), 8000); } catch (_) {}
  }
}
/* `sync` is passed only by flushSave(), i.e. on the way out of the app. Every
   other caller wants the off-thread write — see writeNow().

   Returns a promise **only** on the async branch, and only so a caller that can
   still wait — closeAndQuit(), which owns the close button — is able to. */
function save(sync) {
  if (loadFailed) return;        // never write over a store we could not read
  /* The common path is entirely synchronous. Only a session with an open
     locked board takes the async branch — and on the way out it must not:
     WebCrypto does not finish before the window goes, and taking this branch
     from beforeunload once wrote nothing at all, for every board. So the way
     out writes now, with the envelope the last debounced save left.
     serialiseBoard() writes `enc` and never the plaintext, so this cannot
     leak a locked board. closeAndQuit() closes even that gap for the close
     button, which is the one exit the renderer gets to wait on. */
  if (state.boards.some((b) => b.enc && unlocked.has(b.id))) {
    if (sync) { writeNow(true); return; }
    /* A re-encryption is already in flight and has already snapshotted the
       plaintext it will write; an edit made from here on is not in it, so
       re-arm the debounce rather than dropping the save. */
    if (encWriting) { saveSoon(); return; }
    encWriting = true;
    let encFailed = [];
    return reencryptOpenBoards()
      .then((failed) => { encFailed = failed || []; })
      .catch((err) => { console.error('re-encryption threw:', err); encFailed = [boardLabel(activeBoard())]; })
      .finally(() => {
        encWriting = false;
        writeNow(sync);
        if (encFailed.length) reportEncryptFailure(encFailed);
      });
  }
  return writeNow(sync);
}
/* Write now and wait for it. For the few places that must know the disk is
   current before the next step — removing a board's folder, copying it
   somewhere — where "it will be there in half a second" is not enough. */
async function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  // an off-thread write already going holds the lock; let it finish first
  while (asyncWriting) await new Promise((r) => setTimeout(r, 30));
  await save();
}
/* The debounce grows with the board. Serialising ten notes is free and 450ms
   is the right feel; serialising two thousand is tens of milliseconds of JSON
   plus a write that, on a spinning disk, can take longer than the gap between
   keystrokes. Capped at 2s, and flushSave() on close means nothing is ever
   lost by waiting. Only the open board counts now — the others are not
   re-serialised unless they changed. */
function saveDelay() {
  const n = state.notes.length + state.frames.length;
  return n > cullMin() ? Math.min(2000, 450 + n * 2) : 450;
}
/* Every change to the board ends here, which makes it the place a paired phone
   hears that its picture is out of date (js/tablet.js, MAP.md §4x). */
/* Every change to the board ends here (CLAUDE.md: mutate, draw, saveSoon), so
   this is also where the far-zoom canvas hears that something it draws may
   have changed — a status set from the menu on a note that has no element.
   One draw per frame however often it is asked (far.js). */
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, saveDelay()); scheduleMinimap(); if (typeof padDirty === 'function') padDirty(); if (typeof requestFar === 'function') requestFar(); }
// the close path, and the only caller that wants the blocking write
function flushSave() { clearTimeout(saveTimer); saveTimer = null; save(true); }

/* Every few minutes, whatever happens, everything is saved (2.7.1). Every
   change already saves within a second or two (saveSoon) and a drawing note
   now saves as it is drawn, so this is the backstop for anything that ever
   slips past them — an editor open for an hour, a change some path forgot to
   announce. save() writes only the boards whose JSON differs from what is on
   disk, so a tick with nothing new costs one serialise and no write.

   How many minutes is Settings ▸ Board (2.10): 4, 5, 6 or 10, 5 unless
   chosen. Choosing restarts the clock, so the next save is that far away. */
const AUTOSAVE_MINUTES = [4, 5, 6, 10];
let autosaveTimer = 0;
function startAutosave() {
  clearInterval(autosaveTimer);
  const min = AUTOSAVE_MINUTES.includes(state.settings.autosaveMin) ? state.settings.autosaveMin : 5;
  autosaveTimer = setInterval(() => {
    if (typeof sketchOpen === 'function' && sketchOpen()) commitSketch();
    save();
  }, min * 60 * 1000);
}

/* One dated copy per board per launch-day, in Backups\, handled by the store
   — a cheap no-op once today's file exists.

   `snapped` holds a board id only **after** a successful call. Latching first
   meant a snapshot that failed — a full disk, a folder gone read-only — was
   never retried for the session and said nothing. The next save retries now,
   and the failure is reported once. A skip is a success. */
const snapped = new Set();
let snapshotBroken = false;
function maybeSnapshot(id, json) {
  if (snapped.has(id) || !DATA || !DATA.snapshot) return;
  let r;
  try { r = DATA.snapshot(id, json, todayKey()); }
  catch (err) { r = { ok: false, error: String((err && err.message) || err) }; }
  if (!r || typeof r !== 'object') { snapped.add(id); return; }
  if (r.ok === false) {
    if (!snapshotBroken) {
      snapshotBroken = true;
      console.error('daily snapshot failed:', r.error);
      try { toast(t('msg.snapshotFailed'), 7000); } catch (_) {}
    }
    return;                       // not latched — the next save tries again
  }
  snapped.add(id);
}
/* A board that just got its id from somewhere new — a duplicate, an import —
   has no "last written" yet, which is exactly right: its first save writes it.
   A board that is gone must not keep one either, or a later board reusing the
   id (it cannot, but) would be skipped. */
function forgetWritten(id) { lastWrittenBoard.delete(id); snapped.delete(id); }
/* True when what is on disk for this board is what is in memory — the same
   comparison dirtyDocs() makes. For a caller about to do something that is
   only safe once a write has landed (deleteBoard() removing a folder). */
function boardLanded(id) {
  syncActiveBoard();
  const b = boardById(id);
  return !!b && lastWrittenBoard.get(b.id) === serialiseBoard(b);
}
