/* Mental Board — state.js
   One mutable `state`, the boards inside it, undo, and everything that reaches the disk.

   Part 2 of 15. These files are plain scripts sharing one global
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
    notes: [], frames: [], links: [],
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
const liveBoards = () => state.boards.filter((b) => !b.archived && !b.trash);
/* Can what is on screen right now actually be written?

   A locked board that has not been opened this session holds no plaintext, and
   syncActiveBoard() refuses to copy the live arrays onto it — correctly, or the
   previous board's contents would land on top of its ciphertext. The catch is
   that nothing used to stop you *editing* it: the note appeared on the canvas,
   serialise() wrote the envelope, and the note was gone at the next launch with
   no error at any point. Everything that creates or changes content asks here
   first, and says why when the answer is no. */
function canEditHere() {
  if (!isLocked(activeBoard())) return true;
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
    v: 2,
    appVersion: '',       // the build that last wrote this file; see stampVersion()
    boards: [first],
    activeBoard: first.id,
    /* the live mirror of the active board — see the note above. It is not
       written to the file; serialise() drops it. */
    notes: first.notes, frames: first.frames, links: first.links,
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
      theme: 'dark',        // any id from THEMES
      matchSystem: true,    // kept in step with themeMode; see adoptThemeMode()
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
      lightTheme: 'light',  // which theme "light" means for this user
      darkTheme: 'dark',
      /* The user's own palette, used when `theme` is 'custom'. Three colours
         and a mode is the whole input: everything else a theme needs — the
         raised surfaces, the dimmed text, the hairlines, the grid, the shadows
         — is derived from these in customVars(), so there is no way to build a
         palette whose text cannot be read on its own background. */
      customTheme: { mode: 'dark', bg: '#12131a', surface: '#1b1d27', text: '#e8eaf2' },
      accent: 'indigo',
      /* Used when `accent` is 'custom'. Kept beside it rather than replacing it,
         so switching to a preset and back does not lose the colour you mixed. */
      accentCustom: '#6b8afd',
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
      /* How much the canvas may spend on looking good — see PERF_MODES and
         resolvedPerf(). 'auto' asks the machine. */
      perf: 'auto',
      snap: false,
      compass: true,
      spell: true,
      railMode: 'hover',    // 'pinned' | 'hover' | 'off' — see RAIL_MODES
      noteShape: 'round',   // 'round' | 'soft' | 'square' — see NOTE_SHAPES
      noteDensity: 'cosy',  // 'cosy' | 'thin' — padding and line-height on a note
      noteChrome: true,     // the icon/link/more/close row on a note's top edge
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
const NOTE_DENSITIES = ['thin', 'cosy', 'roomy'];

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
const PERF_MODES = ['auto', 'full', 'lite'];
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
const isDone = (n) => { const s = statusOf(n); return !!(s && s.done); };

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

/* Set when a board file exists but could not be read. While it is on, every
   write is refused — see save(). Losing the session is annoying; overwriting a
   file that might still be recoverable is not survivable. */
let loadFailed = false;

const APP_VERSION = (() => {
  try { return (DATA && DATA.paths && DATA.paths().version) || ''; } catch (_) { return ''; }
})();

function load() {
  let res = null;
  try {
    if (DATA) {
      res = DATA.load();
    } else {
      const raw = localStorage.getItem('mental-board');
      res = { board: raw ? JSON.parse(raw) : null, status: raw ? 'ok' : 'empty' };
    }
  } catch (_) { res = { board: null, status: 'unreadable' }; }

  // an older preload handed back the board itself; keep working with it
  if (res && !('status' in res)) res = { board: res, status: res ? 'ok' : 'empty' };
  if (!res) res = { board: null, status: 'empty' };

  loadFailed = res.status === 'unreadable';
  if (loadFailed) return;                    // leave defaults, write nothing
  adopt(res.board);
  stampVersion(res.board);
}

/* First launch on a new build: copy the board aside before this version has
   written a single byte to it. If an update ever mangles something, the
   previous version's board is sitting in backups/ named after the build it
   came from. Costs one file write, once per upgrade. */
/* Set when this launch is the first one on a build the file has not seen.
   Read once by init() to say so out loud — see the toast there. */
let versionChanged = false;

/* The build number in the titlebar, permanently. Running from source there is
   no packaged version to show, so the slot stays empty rather than lying. */
function paintVersion() {
  const el = $('tbVer');
  if (!el) return;
  el.textContent = APP_VERSION || '';
  el.classList.toggle('hidden', !APP_VERSION);
}

function stampVersion(raw) {
  if (!APP_VERSION) return;
  const was = state.appVersion;
  state.appVersion = APP_VERSION;
  /* Deliberately true for `was === ''` as well. A board written before this
     field existed is exactly the case where the user has no way at all to tell
     which build just opened, so it is the case that most needs telling. */
  versionChanged = was !== APP_VERSION;
  if (!was || was === APP_VERSION) return;
  try {
    /* The *raw* file, not serialise(). This snapshot exists to answer "what
       did the board look like before this build touched it", and serialise()
       writes `state` — which has already been through this build's adopt().
       Snapshotting that would mean a future adopt() bug quietly healed the
       board and then saved the healed version as the untouched one, so the
       one file kept for recovery would be the damaged copy. */
    if (DATA && DATA.versionSnapshot && raw) {
      DATA.versionSnapshot(JSON.stringify(raw, null, 2), was);
    }
  } catch (_) {}
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
    w: Math.max(NOTE_MIN_W, +n.w || 260), h: Math.max(NOTE_MIN_H, +n.h || 180),
    body: typeof n.body === 'string' ? n.body : '',
    color: COLORS.includes(n.color) ? n.color : 'default',
    icon: okIcon(n.icon), iconColor: okIconColor(n.iconColor),
    z: +n.z || 1,
    remindAt: +n.remindAt || 0,
    reminded: !!n.reminded,
    // '' is once; anything else is a REPEATS id. See nextOccurrence() in §14b.
    repeat: REPEATS.includes(n.repeat) ? n.repeat : '',
    /* A status id, or '' for "not tracked". Deliberately not validated against
       state.statuses here: adoptBoard runs per board while the status list is
       being read from the same file, and a note whose status was pruned because
       the list had not been parsed yet would lose it permanently. Resolution
       happens at paint time instead — statusById() returns null for an unknown
       id and the note simply shows no pill, so deleting a status and undoing it
       gives every note its status back. */
    status: typeof n.status === 'string' ? n.status : '',
    hist: adoptHistory(n.hist),
    // set only on notes the daily-note setting made; the value is its date key
    daily: typeof n.daily === 'string' ? n.daily : undefined,
    /* Only on something sitting in the trash: which board it came from, and
       when it went in. Dropping these on the way in would turn Put back into
       a guess, so they are named here like every other field that survives. */
    trashedFrom: typeof n.trashedFrom === 'string' ? n.trashedFrom : undefined,
    trashedAt: +n.trashedAt || undefined
  }));
  b.frames = (Array.isArray(raw.frames) ? raw.frames : []).filter((f) => f && f.id).map((f) => ({
    id: String(f.id), x: +f.x || 0, y: +f.y || 0,
    w: Math.max(FRAME_MIN_W, +f.w || 600), h: Math.max(FRAME_MIN_H, +f.h || 420),
    title: typeof f.title === 'string' ? f.title : t('frame.default'),
    color: COLORS.includes(f.color) ? f.color : 'blue',
    icon: okIcon(f.icon), iconColor: okIconColor(f.iconColor),
    titlePos: TITLE_POS.includes(f.titlePos) ? f.titlePos : 'tl',
    trashedFrom: typeof f.trashedFrom === 'string' ? f.trashedFrom : undefined,
    trashedAt: +f.trashedAt || undefined
  }));
  const ids = new Set(b.notes.map((n) => n.id));
  b.links = (Array.isArray(raw.links) ? raw.links : [])
    .filter((l) => l && ids.has(String(l.from)) && ids.has(String(l.to)))
    .map((l) => ({ id: String(l.id || uid()), from: String(l.from), to: String(l.to) }));

  const v = raw.view && typeof raw.view === 'object' ? raw.view : {};
  b.view = { x: +v.x || 0, y: +v.y || 0, z: clamp(+v.z || 1, ZOOM_MIN, ZOOM_MAX) };
  b.nextZ = Math.max(1, ...b.notes.map((n) => n.z || 1)) + 1;
  return b;
}

/* Take an arbitrary saved or imported shape and make it a valid state.

   `keepSettings` is passed by Import and by nothing else, and it means what it
   says: these settings survive the import. The order below is the whole of it —
   defaults, then the file, then mine — and it used to be the other way round,
   so importing a board file quietly took the *file's* theme, language, perf mode
   and `backupDir`. That last one is the one that mattered: it repointed the
   automatic off-disk backup at a folder from whichever machine wrote the file.
   The confirm dialog offers to replace every board, and says so in those words;
   it does not offer to replace how the app is set up. */
function adopt(raw, keepSettings) {
  if (!raw || typeof raw !== 'object') return;
  const d = defaults();
  const rawSet = raw.settings || {};
  const kept = keepSettings || {};
  state = {
    v: 2,
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    settings: Object.assign(d.settings, rawSet, kept),
    boards: [], activeBoard: '',
    // anything malformed is a missing template, never a broken one
    templates: (Array.isArray(raw.templates) ? raw.templates : []).map(adoptTemplate).filter(Boolean),
    /* An absent list means a board written before statuses existed, so it gets
       the starting four. An empty *array* is a deliberate choice to have none
       and is left alone — `raw.statuses || d.statuses` would quietly undo it on
       every launch. */
    statuses: Array.isArray(raw.statuses)
      ? raw.statuses.map(adoptStatus).filter(Boolean)
      : DEFAULT_STATUSES(),
    notes: [], frames: [], links: [], view: { x: 0, y: 0, z: 1 }, nextZ: 1
  };
  // settings written before themes were split out said theme:'system'
  const st = state.settings;
  // a board saved with a language that is no longer shipped falls back to auto
  if (typeof st.lang !== 'string' || (st.lang !== 'auto' && !LANGS[st.lang])) st.lang = 'auto';
  if (st.theme === 'system') { st.matchSystem = true; st.theme = 'dark'; }
  if (!THEMES.some((t) => t.id === st.theme)) st.theme = 'dark';
  if (!THEMES.some((t) => t.id === st.lightTheme)) st.lightTheme = 'light';
  if (!THEMES.some((t) => t.id === st.darkTheme)) st.darkTheme = 'dark';

  /* themeMode and matchSystem say the same thing in different alphabets, and a
     file can arrive with either. Read the mode when it is there and honest,
     otherwise fall back to the boolean — then write both, so a board opened by
     an older build still finds the answer where it expects it. */
  if (!THEME_MODES.includes(st.themeMode)) st.themeMode = st.matchSystem ? 'system' : 'fixed';
  st.matchSystem = st.themeMode === 'system';
  st.dayAt = okClock(st.dayAt, '07:00');
  st.nightAt = okClock(st.nightAt, '19:00');

  // three colours and a mode; anything missing or malformed falls back per field
  const ct = (st.customTheme && typeof st.customTheme === 'object') ? st.customTheme : {};
  st.customTheme = {
    mode: ct.mode === 'light' ? 'light' : 'dark',
    bg: isHex(ct.bg) ? ct.bg : '#12131a',
    surface: isHex(ct.surface) ? ct.surface : '#1b1d27',
    text: isHex(ct.text) ? ct.text : '#e8eaf2'
  };

  // ropes
  if (!(COLORS.includes(st.linkColor) || isHex(st.linkColor))) st.linkColor = 'red';
  if (!LINK_STYLES.includes(st.linkStyle)) st.linkStyle = 'curve';
  if (!LINK_ANCHORS.includes(st.linkAnchor)) st.linkAnchor = 'top';
  st.linkWidth = clamp(Math.round(+st.linkWidth || 2), 1, 5);
  st.embeds = st.embeds !== false;
  /* The rail was a boolean for one version. Read it rather than dropping it —
     somebody who turned the rail off should not find it back on after an
     update, which is exactly the kind of small betrayal that makes settings
     feel unreliable.

     `true` maps to 'hover', not 'pinned'. The boolean only ever meant "show the
     rail"; nobody chose a full-height column over a flyout, because there was
     nothing to choose between. Mapping it to the new default is honouring the
     choice that was actually made. */
  /* Read the *unmerged* settings, not `st`. Object.assign has already put the
     default ('hover') into st.railMode by the time we get here, so a guard on
     the merged value is never true and the boolean was silently dropped —
     someone who turned the rail off got it back on the next launch, which is
     exactly what the paragraph above says must not happen.

     `said` is the file overlaid with anything Import is keeping, in the same
     order as the merge above. Reading `rawSet` alone would let a file with no
     valid railMode force 'hover' over the setting the user is keeping — which
     is the betrayal this block exists to prevent, arriving by the other door. */
  const said = Object.assign({}, rawSet, kept);
  if (!RAIL_MODES.includes(said.railMode)) {
    st.railMode = ('rail' in said) ? (said.rail ? 'hover' : 'off') : 'hover';
  }
  delete st.rail;
  if (!PERF_MODES.includes(st.perf)) st.perf = 'auto';
  if (!GRID_STYLES.includes(st.grid)) st.grid = 'dots';
  st.gridSize = clamp(Math.round(+st.gridSize || 26), 12, 96);
  st.gridFade = clamp(Math.round(+st.gridFade || 100), 20, 160);
  if (!isHex(st.accentCustom)) st.accentCustom = '#6b8afd';
  if (!NOTE_SHAPES.includes(st.noteShape)) st.noteShape = 'round';
  if (!NOTE_DENSITIES.includes(st.noteDensity)) st.noteDensity = 'cosy';
  st.noteChrome = st.noteChrome !== false;
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

     Reading the old shape into a single board is the whole migration, and it is
     the one thing in this function that must not be got wrong: treat a 1.0.x
     file as "no boards" and the app opens empty, then saves that emptiness over
     somebody's entire board on the next keystroke. So the fallback is not an
     empty board — it is the old top-level fields. */
  const legacy = { name: '', icon: 'sticky_note_2', notes: raw.notes, frames: raw.frames, links: raw.links, view: raw.view, nextZ: raw.nextZ };
  const list = (Array.isArray(raw.boards) && raw.boards.length) ? raw.boards : [legacy];
  state.boards = list.map(adoptBoard).filter(Boolean);
  if (!state.boards.length) state.boards = [makeBoard('', 'sticky_note_2')];

  // two boards must never share an id, or boardById picks the wrong one forever
  const seen = new Set();
  state.boards.forEach((b) => { while (seen.has(b.id)) b.id = uid(); seen.add(b.id); });

  /* Reopen on the board you left, unless it is archived or locked — landing on
     an empty canvas that will not accept a note is a worse first impression
     than landing on a different board. */
  const usable = (b) => b && !b.archived && !isLocked(b);
  const wanted = state.boards.find((b) => b.id === raw.activeBoard);
  bindBoard(usable(wanted) ? wanted : (state.boards.find(usable) || state.boards[0]));
}

/* What actually goes in the file.

   The live mirror is dropped: it is the same data as `boards[active]`, so
   writing both would double every board on disk and hand a future reader two
   copies that can disagree. Note this removes five *named* fields rather than
   whitelisting the rest — add a new top-level field and it still persists by
   itself, which is the property save() has always had. */
const MIRROR_KEYS = ['notes', 'frames', 'links', 'view', 'nextZ'];
function serialise(pretty, overrides) {
  syncActiveBoard();
  const out = {};
  Object.keys(state).forEach((k) => { if (!MIRROR_KEYS.includes(k)) out[k] = state[k]; });
  /* A locked board is written as its envelope and nothing else — even while it
     is open in front of you. This is a belt-and-braces rule, on purpose: the
     re-encryption below is what keeps `enc` current, but if it ever failed or
     was skipped, the worst case must be "the file has a slightly older
     ciphertext", never "the file has the plaintext of the board you locked". */
  out.boards = state.boards.map((b) => b.enc
    ? Object.assign({}, b, { notes: [], frames: [], links: [], view: { x: 0, y: 0, z: 1 }, nextZ: 1 })
    : b);
  if (overrides) Object.assign(out, overrides);
  return pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
}

/* Refresh the ciphertext of every locked board that is open this session, so
   what serialise() writes reflects the edits just made. Async because WebCrypto
   is; see save() for why the normal path never has to wait for it.

   Returns the names of the boards that could NOT be re-encrypted, and that
   return value is the whole reason this is not a `void` function.

   Keeping the last good envelope on failure is correct — the alternative is
   writing the plaintext of a board somebody deliberately locked, which is
   worse than a stale copy. But it means a failure here is *invisible* from the
   disk's point of view: serialise() writes an envelope, DATA.save() returns
   ok, writeNow() stamps lastWritten, and every check the app has says the
   board is safe. It is not. Everything typed since the last successful
   encryption is only in memory and goes with the window.

   So the failure has to come back out and be said out loud. Same rule as
   mbData.save(): a call that returns a status must have that status acted on
   — see §7 and the note on writeNow(). */
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

/* Said once per session, like reportSaveFailure() and for the same reason: the
   user is about to close a window believing work is on disk when it is not,
   and repeating it on every debounce would train them to dismiss it. */
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
let lastWritten = '';
/* Set once a write has failed, so the failure is reported exactly once instead
   of on every keystroke's worth of debounce. */
let saveBroken = false;

/* The write itself, and the one place that decides whether it landed.

   This used to read:

       try { DATA.save(json); lastWritten = json; } catch (_) {}

   with a comment claiming lastWritten was only set once the write landed. It
   was not. preload's save() catches its own errors and *returns* the failure —
   it never throws — so the catch was dead code and lastWritten was stamped
   whether or not a single byte reached the disk. From that moment on every
   later save saw `json === lastWritten`, decided there was nothing to write,
   and returned. One failed write silently disabled saving for the rest of the
   session, and the whole session went with the window at close: reopen, and
   the board is exactly as it was before you started, every time, with nothing
   having warned you. That is the bug this project was reworked over.

   So: the return value decides. A failed write leaves lastWritten alone so the
   next save retries, and says so out loud. */
/* True while an off-thread write is in flight. One writer at a time: preload
   queues them anyway, but starting a second serialise while the first is still
   going is work with nothing to show for it. */
let asyncWriting = false;

function writeNow(sync) {
  /* Nothing changed since the last write, so there is nothing to write. This is
     not a micro-optimisation: saveSoon() fires after gestures that often move
     nothing (a click that ends a drag, a selection change), and on a big board
     on a spinning disk each of those was a full re-serialise and a file write.

     For this to mean anything, serialise() has to be *pure* — see
     touchActiveBoard(). It was not, and this line did nothing for a long time. */
  if (serialise(false) === lastWritten) return;

  /* Something genuinely changed, so record when, and build the bytes again with
     that stamp in them. Yes, that is a second serialise — a few milliseconds of
     CPU set against a multi-megabyte write to disk, and only on the saves that
     were going to happen anyway. Stamping before the comparison is what broke
     the comparison; stamping after it and not re-serialising would leave the
     file one save behind and make the *next* save differ again, for ever. */
  touchActiveBoard();
  const json = serialise(false);

  /* Whatever route the bytes took, this is the one place that decides whether
     they landed — and `lastWritten` is stamped here and nowhere else. */
  const settle = (raw) => {
    // an older preload handed back a bare boolean, or nothing at all
    let res = raw;
    if (typeof res === 'boolean') res = { ok: res };
    if (!res) res = { ok: true };
    if (!res.ok) {
      reportSaveFailure(res.error);
      return;                    // lastWritten untouched — the next save retries
    }
    lastWritten = json;
    if (saveBroken) { saveBroken = false; toast(t('msg.saveRecovered')); }
    maybeSnapshot(json);
  };

  /* The ordinary, debounced save goes off-thread. `sync` is only true on the
     way out — flushSave() runs from beforeunload, and a promise there never
     settles because the window does not wait for it. See preload's two
     writers. */
  if (!sync && DATA && DATA.saveAsync) {
    /* A write is already going. Re-arm the debounce rather than dropping this
       one: by the time it fires the disk is free, and the alternative is losing
       the last edit before a pause because nothing came along to trigger
       another save. */
    if (asyncWriting) { saveSoon(); return; }
    asyncWriting = true;
    let p;
    try { p = DATA.saveAsync(json); }
    catch (err) { asyncWriting = false; settle({ ok: false, error: String((err && err.message) || err) }); return; }
    Promise.resolve(p)
      .then(settle, (err) => settle({ ok: false, error: String((err && err.message) || err) }))
      .finally(() => { asyncWriting = false; });
    return;
  }

  let res;
  try {
    res = DATA ? DATA.save(json) : (localStorage.setItem('mental-board', json), { ok: true });
  } catch (err) {
    res = { ok: false, error: String((err && err.message) || err) };
  }
  settle(res);
}

/* Say it once, and say it in a way that cannot be missed or mistaken for a
   cosmetic hiccup — the user is about to lose everything they do from here on
   if they close the window believing it is saved. */
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
   still wait — closeAndQuit(), which owns the close button — is able to. Nothing
   else looks at the return value. */
function save(sync) {
  if (loadFailed) return;        // never write over a board we could not read
  /* The common path is entirely synchronous, which matters: flushSave() runs on
     beforeunload, and an await there would not finish before the window went.
     Only a session with an open locked board takes the async branch. */
  if (state.boards.some((b) => b.enc && unlocked.has(b.id))) {
    /* ...and on the way out it must not take it either.

       WebCrypto is async and PBKDF2 at ENC_ITER is not fast, so the .finally
       below does not run before the window goes. Taking this branch from
       flushSave() therefore wrote **nothing at all** — not the locked board,
       and not the other four boards either, whose work has nothing whatever to
       do with the encryption. Every close threw away everything since the last
       debounce, for every board, and said nothing: writeNow() never ran, so
       neither did the one place that reports a failed write.

       So the way out writes now, synchronously, with the envelope the last
       debounced save left on the board. serialise() writes `enc` and never the
       plaintext, so this cannot leak a locked board — the cost is at most the
       last few seconds of typing *into a locked board*, which is the worst case
       the debounce has always had. closeAndQuit() closes even that gap for the
       close button, which is the one exit the renderer gets to wait on. */
    if (sync) { writeNow(true); return; }
    /* A re-encryption is already in flight — and it has already snapshotted the
       plaintext it is going to write, because encryptBoard() builds its payload
       only after awaiting deriveKey(). An edit made from here on is therefore
       *not* in that ciphertext, and re-arming the debounce is what gets it to
       the disk. Dropping the save instead means the edit lands only if some
       later change happens to trigger another one — and if the user stops
       typing at this moment, nothing ever does. writeNow() then stamps
       lastWritten with the stale envelope, so every check the app has says the
       board is saved when it is not. The edit is gone, and nothing said so.

       Same reasoning as the asyncWriting guard in writeNow(), and the same
       one-line fix. Only the debounce reaches here now — the way out returned
       above. */
    if (encWriting) { saveSoon(); return; }
    encWriting = true;
    /* .finally, not .then: if this ever rejected, encWriting would stay true
       and every later save would re-arm the debounce without ever writing — a
       board that looks saved and is not. Same shape as the 1.3 bug.

       The write still happens when a board failed to re-encrypt: the other
       boards' work has to reach the disk either way, and refusing the whole
       write would turn one board's problem into everybody's. What must not
       happen is the write going ahead *quietly*. */
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
  writeNow(sync);
}
/* The debounce grows with the board. Serialising ten notes is free and 450ms is
   the right feel; serialising two thousand is tens of milliseconds of JSON plus
   a write that, on a spinning disk, can take longer than the gap between
   keystrokes — at which point every save lands on top of typing. Capped at 2s,
   and flushSave() on close means nothing is ever lost by waiting. */
function saveDelay() {
  const n = state.notes.length + state.frames.length;
  return n > cullMin() ? Math.min(2000, 450 + n * 2) : 450;
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, saveDelay()); }
// the close path, and the only caller that wants the blocking write
function flushSave() { clearTimeout(saveTimer); saveTimer = null; save(true); }

// one dated backup per launch-day, handled by preload (cheap no-op if it exists)
let snapped = false;
function maybeSnapshot(json) {
  if (snapped || !DATA || !DATA.snapshot) return;
  snapped = true;
  try { DATA.snapshot(json); } catch (_) {}
}
