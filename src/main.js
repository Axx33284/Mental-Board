/* Mental Board — Electron main process.
   Owns the window, the on-disk data folder, and the native theme. The renderer
   never touches Node directly; everything goes through preload.js + these IPC
   handlers. */
const { app, BrowserWindow, Menu, Tray, nativeImage, Notification, ipcMain, dialog,
        shell, screen, nativeTheme, globalShortcut, protocol, net, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const store = require('./store.js');
const tablet = require('./tablet.js');

/* ---------- mbf:// — a board's own files ----------
   A note never names a path on this disk. A picture it carries is
   `mbf://<boardId>/<name>`, and this process answers that from the board's
   own `files\` folder — so a board folder copied to another machine still
   shows its pictures, and a crafted board cannot ask for a file outside the
   folder it belongs to (store.resolveFile refuses anything else).

   Registered before `ready`, as Electron requires. `standard` so the URL has
   a host and a path; `stream` so a video can seek. */
protocol.registerSchemesAsPrivileged([
  { scheme: 'mbf', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let mainWindow = null;

/* ---------- running with the window shut ----------
   Closing the window used to end the app: `window-all-closed` quits, and there
   was no tray. Which meant every reminder you had set was dead the moment you
   closed the window, and the global capture hotkey with it — the two features
   that are only worth anything when the app is *not* in front of you.

   So the close button hides, a tray icon keeps the app reachable, and quitting
   is something you ask for. `runInBackground` mirrors the renderer's own
   setting (Settings → Habits), because somebody who does not want a tray icon
   should get the old behaviour exactly: close means quit.

   `quitting` is the latch that lets a real quit through the close handler. */
let tray = null;
let quitting = false;
let runInBackground = true;

/* ---------- what main is allowed to say ----------
   Every string this process shows — the tray menu, the "still running"
   notification, the title on each native file dialog — used to be an English
   literal sitting in the middle of the code. The app has a full catalogue and a
   rule that no user-visible string may be written into a source file, and this
   process was outside both: an Arabic window came with an English tray and
   English file dialogs, and `npm run check:lang` passed the whole time, because
   tools/app-source.js reads the script list out of index.html and neither
   main.js nor preload.js is in it.

   The renderer owns the language — it is where the catalogue is loaded and
   where the picker lives — so it *tells* main, exactly the way it already tells
   it about `background`. Until it does, these English defaults stand; they have
   to, because the tray is built in whenReady() and the renderer has not
   finished loading yet. When the strings arrive the tray is rebuilt in place.

   Keys are written out literally at every call site so check-lang can see them.
   That is also why this is a t() and not a bare object lookup. */
const S_EN = {
  'main.trayOpen': 'Open Mental Board',
  'main.trayCapture': 'Quick capture ({key})',
  'main.trayQuit': 'Quit',
  'main.stillRunningTitle': 'Mental Board is still running',
  'main.stillRunningBody': 'It sits in the tray so reminders and quick capture keep working. Right-click the tray icon to quit.',
  'main.exportBoard': 'Export board — choose where to put the copy',
  'main.importBoard': 'Import board — pick its board.json',
  'main.exportCanvas': 'Export for Obsidian — save as .canvas',
  'main.importCanvas': 'Import a .canvas board',
  'main.filterCanvas': 'JSON Canvas',
  'main.importSamsung': 'Import from Samsung Notes',
  'main.filterSamsungAll': 'Samsung Notes and its exports',
  'main.filterSamsung': 'Samsung Notes',
  'main.exportImage': 'Export board as image',
  'main.backupFolder': 'Choose a backup folder',
  'main.insertImage': 'Insert image',
  'main.pickBackground': 'Choose a background image',
  'main.filterJson': 'Board files',
  'main.filterPng': 'PNG image',
  'main.filterImages': 'Images',
  'main.crashTitle': 'Mental Board stopped responding',
  'main.crashBody': 'The window has been reloaded from the last save on disk. Anything typed in the few seconds before it stopped may not be there.',
  'main.crashOk': 'Reload',
  'main.padTitle': 'Mental Board — drawing pad',
  'main.padConnecting': 'Connecting…',
  'main.padConnected': 'Connected',
  'main.padAway': 'Reconnecting…',
  'main.padEnded': 'This pairing has ended. Pair again from Settings on the computer.',
  'main.padReadonly': 'The board open on the computer cannot be drawn on.',
  'main.padPen': 'Pen',
  'main.padMarker': 'Marker',
  'main.padBrush': 'Brush',
  'main.padEraser': 'Eraser (or hold the pen button)',
  'main.padUndo': 'Undo the last stroke from this phone (or tap with two fingers)',
  'main.padFingers': 'Let a finger draw too',
  'main.padFull': 'Full screen',
  'main.padSelect': 'Select — touch a stroke or drag round several, then drag to move them',
  'main.padDelete': 'Delete the selected strokes'
};
let STRINGS = {};
function t(key, vars) {
  const v = STRINGS[key] || S_EN[key] || key;
  return vars ? String(v).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : vars[k])) : v;
}

/* ---------- userData ----------
   %APPDATA%/Mental Board/ holds only what is not the user's: Chromium's own
   files, the window rect, the tray-notice marker — and, from a 1.x install,
   the old board.json that migrateLegacy() reads once. The boards themselves
   live in Documents\My Boards; see boardsRoot() below.

   The path is PINNED here, not derived, because the single-instance lock is
   keyed to it and the 1.x file has to be found where 1.x left it.

   By default Electron puts userData at appData/<productName>, so renaming the
   product in package.json — or switching packager — silently moves every
   existing user's board to a folder the new build never looks at. From the
   user's side that is indistinguishable from the update having deleted their
   work. Setting it explicitly means the folder is a promise: this string is
   the contract with everyone who already has the app installed, and it must
   never change again, whatever the app is called later. */
/* …except when someone deliberately asked for a different folder.
   --user-data-dir is how the app is driven in testing (MAP.md §6) and how a
   portable build would point at a stick. Pinning the path unconditionally
   silently overrode that switch, which sent a sandbox run straight at the real
   board — exactly the accident this whole block exists to prevent. Honour the
   switch when it is there; pin only when it is not. */
const userDataOverridden =
  app.commandLine.hasSwitch('user-data-dir') ||
  process.argv.some((a) => a === '--user-data-dir' || a.startsWith('--user-data-dir='));

app.setName('Mental Board');
if (!userDataOverridden) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Mental Board'));

  /* Chromium's own scratch space — Cache, GPUCache, Local Storage, Network and
     friends — used to land in that same folder, putting ~2.5 MB of throwaway
     files next to a board.json measured in kilobytes, and roaming all of it
     between machines on a domain profile. Send it to LOCALAPPDATA so the
     folder the user is told to look in holds only their own files. A run with
     an explicit --user-data-dir keeps everything together instead, so a
     sandbox stays one self-contained directory. */
  try {
    const local = process.env.LOCALAPPDATA || app.getPath('temp');
    app.setPath('sessionData', path.join(local, 'Mental Board', 'chromium'));
  } catch (_) {}
}

/* ---------- where the boards live ----------
   Documents\My Boards. Not %APPDATA%: that folder is hidden, and the whole
   point of 2.0's layout is that a person can find their boards, copy one to a
   stick, and delete the folder to start again. userData above still exists —
   it holds only Chromium's own files, the window rect and the tray marker —
   and the single-instance lock is still keyed to it, so two builds of this
   app still cannot run at once.

   A sandbox run (--user-data-dir) keeps its boards inside that folder, so a
   test never touches the real ones. */
function boardsRoot() {
  if (userDataOverridden) return path.join(app.getPath('userData'), 'My Boards');
  let docs = '';
  try { docs = app.getPath('documents'); } catch (_) {}
  if (!docs) docs = app.getPath('home');
  return path.join(docs, 'My Boards');
}
/* Read once, before the window exists: the one setting main has to know
   before `ready`. Software rendering is for the machine whose graphics driver
   makes Chromium worse than no driver at all; it is off unless asked for. */
function earlySettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(boardsRoot(), 'settings.json'), 'utf8'));
    return (raw && raw.settings) || {};
  } catch (_) { return {}; }
}
const EARLY = earlySettings();
if (EARLY.softwareRender === true) {
  try { app.disableHardwareAcceleration(); } catch (_) {}
}

/* One-time tidy for anyone updating from a build that mixed the two. These are
   Chromium's own directory names and nothing else; the board files are not in
   this list and are never touched. Everything here is a cache and regenerates
   on the next launch. */
const CHROMIUM_LEFTOVERS = [
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'blob_storage', 'Local Storage', 'Session Storage', 'Shared Dictionary',
  'Network', 'SharedStorage', 'SharedStorage-wal', 'Local State',
  'DevToolsActivePort', 'Preferences'
];
function tidyOldCache() {
  if (userDataOverridden) return;    // a sandbox keeps its cache where it is
  const dir = dataDir();
  const marker = path.join(dir, '.tidied');
  try {
    if (fs.existsSync(marker)) return;
    for (const name of CHROMIUM_LEFTOVERS) {
      const p = path.join(dir, name);
      try { if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
    }
    fs.writeFileSync(marker, 'chromium cache moved to LOCALAPPDATA\n', 'utf8');
  } catch (_) {}
}

// whatever is actually in effect — pinned above, or the switch that overrode it
function dataDir() { return app.getPath('userData'); }

/* ---------- persisted window rect ---------- */
const winStateFile = () => path.join(dataDir(), 'window-state.json');
function loadWinState() {
  try { return JSON.parse(fs.readFileSync(winStateFile(), 'utf8')); } catch (_) { return {}; }
}
// true if the saved rect still overlaps a connected display (monitors get unplugged)
function onScreen(s) {
  try {
    return screen.getAllDisplays().some((d) => {
      const b = d.workArea;
      return s.x < b.x + b.width && s.x + (s.width || 0) > b.x &&
             s.y < b.y + b.height && s.y + (s.height || 0) > b.y;
    });
  } catch (_) { return false; }
}
function saveWinState(win) {
  try {
    const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(winStateFile(), JSON.stringify({
      width: b.width, height: b.height, x: b.x, y: b.y, isMaximized: win.isMaximized()
    }));
  } catch (_) {}
}

// window/taskbar icon: a user-dropped Icon.png next to the exe wins, so it can
// be swapped without a rebuild; otherwise the bundled one.
function findIcon() {
  const cands = [
    path.join(path.dirname(process.execPath), 'Icon.png'),
    path.join(__dirname, 'assets', 'icon.png')
  ];
  for (const p of cands) { try { if (fs.existsSync(p)) return p; } catch (_) {} }
  return undefined;
}

function createWindow() {
  const saved = loadWinState();
  const opts = {
    width: saved.width || 1320,
    height: saved.height || 880,
    minWidth: 720,
    minHeight: 520,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#12131a' : '#f4f5f8',
    title: 'Mental Board',
    icon: findIcon(),
    frame: false,            // custom titlebar lives in index.html
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      /* Sandboxed. preload.js asks main for everything over IPC and requires
         nothing but contextBridge, ipcRenderer and webUtils — all of which a
         sandboxed preload has — so the page and its preload run with no Node
         at all. It used to be off because the 1.x preload read the board file
         itself; since 2.0 that is store.js, here in main. */
      sandbox: true,
      spellcheck: true,
      /* Chromium throttles timers in a hidden window to about one a minute, and
         the reminder ticker is a timer in the renderer — so with the window in
         the tray a reminder could arrive a minute late or, worse, in a clump.
         The renderer does nothing while idle but that one 20s tick and a 60s
         theme check, so turning throttling off costs almost nothing and is what
         makes reminders trustworthy while the window is away. */
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js')
    }
  };
  if (Number.isInteger(saved.x) && Number.isInteger(saved.y) && onScreen(saved)) { opts.x = saved.x; opts.y = saved.y; }

  const win = new BrowserWindow(opts);
  mainWindow = win;
  if (saved.isMaximized) win.maximize();

  Menu.setApplicationMenu(null);          // clean look; DevTools still on F12
  /* Resolved against this file, not the working directory. A bare
     loadFile('index.html') happens to work when the app is launched from the
     project root and fails the moment it is not — which, once the source moved
     into src/, is every launch. */
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  setTimeout(() => { if (!win.isDestroyed() && !win.isVisible()) win.show(); }, 3000);

  /* Hide, do not close — unless this is a real quit, or the user has asked for
     the old behaviour. The rect is saved either way, because "close" is where
     the window still has one. */
  win.on('close', (e) => {
    saveWinState(win);
    /* A real close is the start of a quit, whichever way it came — so the
       watchdog is armed here too, not only in before-quit: with Run in
       background off, before-quit only fires after this close completes, and
       a page that never answers beforeunload means it never does. (Not on a
       Mac, where closing the last window does not quit.) */
    if (quitting || !runInBackground) {
      if (quitting || process.platform !== 'darwin') armQuitWatchdog();
      return;
    }
    e.preventDefault();
    win.hide();
    noteStillRunning();
  });
  win.on('closed', () => { mainWindow = null; });

  /* ---------- the renderer died ----------
     Nothing used to watch for this, and it is the one failure in the app that
     takes the *whole* board with it: `state` lives in the renderer, so a
     process that goes takes everything since the last debounced save. What the
     user saw was a white rectangle where their board had been, with no way to
     tell whether any of it had reached the disk.

     Reloading is right, and it is safe: the store holds everything up to the
     last save, and load() will read it back exactly as it would on a cold
     start. What must not happen is doing it silently — the few seconds between
     the last save and the crash are genuinely gone, and somebody who is told
     that will retype a sentence, while somebody who is not will trust a board
     that quietly lost one.

     `clean-exit` is not a crash: it is the normal teardown on the way out. */
  /* A phone paired to a page that is about to be replaced would go on drawing
     into nothing, with no Stop button anywhere: a reload or a crash ends the
     pairing (src/tablet.js, MAP.md §4w). The main frame only: a video player
     loading in an iframe is a navigation too, and must not end it. */
  win.webContents.on('did-start-navigation', (_e, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) tablet.stop('reload');
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    tablet.stop('reload');
    const reason = (details && details.reason) || 'unknown';
    console.error('renderer gone:', reason, details);
    if (reason === 'clean-exit' || quitting) return;
    try { win.webContents.reload(); } catch (_) {}
    try {
      dialog.showMessageBox(win, {
        type: 'warning',
        title: t('main.crashTitle'),
        message: t('main.crashTitle'),
        detail: t('main.crashBody'),
        buttons: [t('main.crashOk')],
        noLink: true
      });
    } catch (_) {}
  });
  /* Hung, not dead. Logged and left alone on purpose: this fires for a long
     synchronous stretch as well as for a real hang — a save on a slow disk with
     a very large board can trip it — and killing the renderer to "fix" a window
     that was about to come back is the one response guaranteed to lose work. */
  win.on('unresponsive', () => { console.error('renderer unresponsive; leaving it to recover'); hangLog('renderer unresponsive'); });
  win.on('responsive', () => { console.log('renderer responsive again'); hangLog('renderer responsive again'); });

  const sendMax = () => { if (!win.isDestroyed()) win.webContents.send('win:maximized', win.isMaximized()); };
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);

  // F12 / Ctrl+Shift+I toggle DevTools even though there's no menu
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      win.webContents.toggleDevTools();
      e.preventDefault();
    }
  });

  /* Spelling (2.4.1). Chromium knows which word under a right-click is
     misspelled and what it should be, and tells only main, in this event. The
     page draws its own menu, so the answer is passed on to it (spell:menu) and
     the page puts the suggestions at the top of the note's menu. It only fires
     when the page lets the contextmenu event through — init.js does that for
     a right-click in the text of the note being edited, and nowhere else. */
  win.webContents.on('context-menu', (_e, p) => {
    if (!p.isEditable) return;
    win.webContents.send('spell:menu', {
      word: String(p.misspelledWord || '').slice(0, 64),
      suggestions: (p.dictionarySuggestions || []).slice(0, 6).map((s) => String(s).slice(0, 64))
    });
  });

  /* This window shows one file and nothing else, ever. A link in a note goes to
     the system browser through shell:open-external, which vets the scheme —
     nothing is allowed to navigate the app window itself or spawn a second
     one. Without these, a crafted href pasted into a note could replace the
     whole application with a remote page wearing its frameless titlebar. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    try { if (/^https?:\/\//i.test(url)) shell.openExternal(url); } catch (_) {}
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());
}

/* ---------- the player needs a real origin ----------
   A page loaded from `file://` has no web origin — Chromium reports it as the
   string "null" — and YouTube's player refuses to start for one:

       Error 153 — Video player configuration error

   Nothing about the video is wrong and nothing about the request is blocked.
   The player simply will not run on a page it cannot attribute, and there is
   no header, referrer policy or query parameter that changes that; the check
   is on the browsing context, not on the request. (Rewriting Referer and
   Origin for the request was tried. It turns 153 into 152, which is worse:
   still broken, and now with a misleading code.)

   So the player gets an origin of its own. This serves exactly one generated
   page, on the loopback interface, on a port the OS picks:

       http://127.0.0.1:<port>/p/<token>/<kind>/<id>

   and that page holds the YouTube iframe. Its origin is a real http one, so
   the player runs; the app itself stays on file:// and nothing about how the
   board is loaded, stored or secured changes.

   Five things keep the server from being a liability:

   - **127.0.0.1 only.** Never 0.0.0.0, so nothing off this machine can reach
     it and Windows Firewall has no reason to ask about it.
   - **It serves no files.** There is no path that reads the disk — the only
     response it can produce is the string built below. A traversal bug needs a
     file read to traverse to.
   - **A per-session token in the path.** Regenerated every launch, so another
     local process cannot quietly use the app as a general-purpose embedder.
   - **`kind` and `id` are re-validated here**, not trusted from the renderer.
   - **The page has its own CSP** naming the two player origins, so even that
     one page cannot load anything else.

   It listens only once a video is actually played, and closes with the app. */
const http = require('http');
const crypto = require('crypto');

const PLAYER_FRAME = {
  yt: (id) => `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
  vimeo: (id) => `https://player.vimeo.com/video/${id}?autoplay=1`
};
/* The page holds one iframe and a style block, so it needs nothing else.

   Playing a video does log one "refused to load the image" line for a ytimg
   preview. It is not this policy: the app page contains no remote image, and
   widening img-src here changes nothing — the message comes from inside the
   player's own frame and is surfaced under the top-level URL. Left alone
   rather than papered over with a permission that does not apply. */
const PLAYER_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; " +
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com';

let playerServer = null, playerPort = 0;
const playerToken = crypto.randomBytes(16).toString('hex');

function playerPage(kind, id) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PLAYER_CSP}">
<title>player</title>
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
iframe{display:block;width:100%;height:100%;border:0}</style>
</head><body><iframe src="${PLAYER_FRAME[kind](id)}"
 allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
 referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></body></html>`;
}

function startPlayerServer() {
  if (playerServer) return Promise.resolve(playerPort);
  return new Promise((done) => {
    const srv = http.createServer((req, res) => {
      const m = new RegExp(`^/p/${playerToken}/(yt|vimeo)/([\\w-]{1,20})$`).exec((req.url || '').split('?')[0]);
      if (!m || !PLAYER_FRAME[m[1]]) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('no');
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(playerPage(m[1], m[2]));
    });
    srv.on('error', () => done(0));
    srv.listen(0, '127.0.0.1', () => {
      playerServer = srv;
      playerPort = srv.address().port;
      done(playerPort);
    });
  });
}

// the renderer asks for a URL, not for a port — it never builds one itself
ipcMain.handle('embed:player-url', async (_e, kind, id) => {
  if (!PLAYER_FRAME[kind] || !/^[\w-]{1,20}$/.test(String(id || ''))) return null;
  const port = await startPlayerServer();
  if (!port) return null;
  return `http://127.0.0.1:${port}/p/${playerToken}/${kind}/${id}`;
});

/* ---------- a phone as a drawing tablet (2.2) ----------
   src/tablet.js does the listening; see its header and MAP.md §4w for why it
   is safe to have a socket on the LAN at all. Main only wires it to the
   window: Pair starts it, Stop and every way the renderer can go away stop it,
   and what the phone draws is passed to the renderer as checked messages. The
   renderer never learns the token and cannot open a port of its own. */
function padStrings() {
  return {
    title: t('main.padTitle'), connecting: t('main.padConnecting'), connected: t('main.padConnected'),
    away: t('main.padAway'), ended: t('main.padEnded'), readonly: t('main.padReadonly'),
    pen: t('main.padPen'), marker: t('main.padMarker'), brush: t('main.padBrush'), eraser: t('main.padEraser'),
    undo: t('main.padUndo'), fingers: t('main.padFingers'), full: t('main.padFull'),
    select: t('main.padSelect'), del: t('main.padDelete')
  };
}
const padSend = (ch, m) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(ch, m); };
const fromMain = (e) => mainWindow && !mainWindow.isDestroyed() && e.sender === mainWindow.webContents;
ipcMain.handle('pad:start', (e, address) => {
  if (!fromMain(e)) return { ok: false, error: 'sender' };
  return tablet.start({
    address: typeof address === 'string' ? address : '',
    strings: padStrings(),
    onMessage: (m) => padSend('pad:msg', m),
    onState: (s) => padSend('pad:state', s)
  });
});
ipcMain.on('pad:stop', () => tablet.stop('stopped'));
ipcMain.on('pad:send', (e, m) => { if (fromMain(e)) tablet.send(m); });
// "Add to dictionary": one word, no spaces — the dictionary is the user's, across every app session
ipcMain.on('spell:learn', (e, w) => {
  if (!fromMain(e) || typeof w !== 'string' || !w || w.length > 64 || /\s/.test(w)) return;
  try { e.sender.session.addWordToSpellCheckerDictionary(w); } catch (_) {}
});
ipcMain.handle('pad:addresses', () => tablet.addresses());
/* The phone sees the board (2.2.1): the renderer names the region of its own
   window the phone maps to, main photographs exactly that and hands it to
   tablet.js, which sends it unless it is the picture the phone already has.
   Captured here because only main can; the renderer never sees the JPEG. The
   region is clamped to the window, and the picture to at most PAD_MAX_H pixels
   tall — a portrait slice of a 1080p window is about 450 × 1000 and 60 KB. */
const PAD_MAX_H = 1100;
ipcMain.handle('pad:frame', async (e, req) => {
  if (!fromMain(e) || !req || !req.rect) return { sent: false };
  const meta = { n: req.n, nav: req.nav, k: req.k };
  try {
    const [W, H] = mainWindow.getContentSize();
    const r = req.rect;
    const x = Math.max(0, Math.min(W - 1, Math.round(+r.x || 0))), y = Math.max(0, Math.min(H - 1, Math.round(+r.y || 0)));
    const width = Math.max(1, Math.min(W - x, Math.round(+r.width || 0))), height = Math.max(1, Math.min(H - y, Math.round(+r.height || 0)));
    let img = await mainWindow.webContents.capturePage({ x, y, width, height });
    if (img.isEmpty()) return tablet.sendFrame(meta, null);
    const size = img.getSize();
    if (size.height > PAD_MAX_H) img = img.resize({ height: PAD_MAX_H, quality: 'good' });
    return tablet.sendFrame(meta, img.toJPEG(72));
  } catch (_) { return tablet.sendFrame(meta, null); }
});

/* ---------- what a video is called ----------
   One oEmbed request when a video card is made, and one download of its
   thumbnail. After that the card is local: the picture lives beside the board
   and is referenced as a file:// URL, so opening a board full of videos still
   contacts nobody. That is the same promise the click-to-play rule makes, kept
   for the artwork as well as the player.

   Everything here fails soft. No network, a private video, a changed API — the
   card falls back to the plain one with the link on it, which is what it was
   before any of this existed. A title is a nicety; a broken note is not. */
const https = require('https');
const OEMBED = {
  yt: (id) => `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`,
  vimeo: (id) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent('https://vimeo.com/' + id)}`
};
const thumbDir = () => path.join(dataDir(), 'thumbs');

function getJson(url, ms) {
  return new Promise((done) => {
    const req = https.get(url, { timeout: ms || 7000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return done(null); }
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { b += c; if (b.length > 200000) req.destroy(); });
      res.on('end', () => { try { done(JSON.parse(b)); } catch (_) { done(null); } });
    });
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
  });
}
// download to a file and hand back its path, or null
function getFile(url, dest, ms) {
  return new Promise((done) => {
    const req = https.get(url, { timeout: ms || 9000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return done(null); }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > 3 * 1024 * 1024) { req.destroy(); return done(null); }   // a thumbnail, not a photo album
        chunks.push(c);
      });
      res.on('end', () => {
        try {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.concat(chunks));
          done(dest);
        } catch (_) { done(null); }
      });
    });
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
  });
}

ipcMain.handle('embed:describe', async (_e, kind, id) => {
  /* The id came from a pattern match in the renderer, but this is the process
     that can reach the network — so it is checked again here rather than
     trusted. A value that is not a plain video id cannot be turned into a
     request at all. */
  if (!OEMBED[kind] || !/^[\w-]{1,20}$/.test(String(id || ''))) return null;
  try {
    const cached = path.join(thumbDir(), `${kind}-${id}.jpg`);
    let thumb = fs.existsSync(cached) ? cached : null;
    const meta = await getJson(OEMBED[kind](id));
    if (!meta && !thumb) return null;
    if (!thumb && meta && typeof meta.thumbnail_url === 'string' && /^https:\/\//.test(meta.thumbnail_url)) {
      thumb = await getFile(meta.thumbnail_url, cached);
    }
    return {
      title: meta && typeof meta.title === 'string' ? meta.title.slice(0, 160) : '',
      author: meta && typeof meta.author_name === 'string' ? meta.author_name.slice(0, 80) : '',
      thumb: thumb ? require('url').pathToFileURL(thumb).href : ''
    };
  } catch (_) { return null; }
});

/* ---------- the tray ----------
   One icon, one menu, and it is the only thing standing between "the window is
   shut" and "the app might as well not be installed". Built on demand and
   destroyed on quit.

   The icon is the app's own PNG scaled down. Windows wants 16px; handing it the
   full-size one gives a blurry tray icon on every machine that is not at 100%
   scaling. */
function trayImage() {
  const p = findIcon();
  if (!p) return nativeImage.createEmpty();
  try { return nativeImage.createFromPath(p).resize({ width: 16, height: 16 }); }
  catch (_) { return nativeImage.createEmpty(); }
}

/* Rebuilt rather than relabelled when the language changes — an Electron menu
   is immutable once built, so there is nothing to edit in place. */
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: t('main.trayOpen'), click: () => showMain() },
    /* CAPTURE_ACCEL is declared below this function but read at click time,
       long after the module has finished evaluating. 'Control' is Electron's
       spelling; Windows calls it Ctrl on every label a user ever reads. */
    { label: t('main.trayCapture', { key: CAPTURE_ACCEL.replace('Control', 'Ctrl') }), click: () => {
      const win = showMain();
      if (win) win.webContents.send('capture:open');
    } },
    { type: 'separator' },
    /* The only way out, and it has to be here: with the close button hiding
       the window, an app with no visible quit is one people kill in Task
       Manager — which is the one exit that skips the final save. */
    { label: t('main.trayQuit'), click: () => { quitting = true; app.quit(); } }
  ]);
}

function buildTray() {
  if (tray || !runInBackground) return;
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('Mental Board');
    tray.setContextMenu(trayMenu());
    tray.on('click', () => showMain());
    tray.on('double-click', () => showMain());
  } catch (err) {
    /* No tray means closing the window would hide it with no way back. Fall
       back to the old behaviour rather than trapping the app off screen. */
    console.log('tray unavailable, closing will quit instead:', err && err.message);
    tray = null;
    runInBackground = false;
  }
}
function destroyTray() { try { if (tray) tray.destroy(); } catch (_) {} tray = null; }

/* ---------- a quit always ends the process ----------
   app.quit() closes the window, and Chromium will not finish closing it until
   the page has answered `beforeunload` — that is where flushSave() writes the
   last of the board. A page that never answers (hung in a loop, or stuck in a
   sendSync whose handler threw) therefore stalls the quit for ever: before-quit
   has fired, will-quit never does, the tray icon and the LAN server stay up,
   and all four processes sit there — with the window still on screen if it was
   showing. 2.2.1 did exactly that twice in one day, and a process that will not
   go blocks the rebuild (tools/build-app.js refuses while it runs) until it is
   killed — which is the one exit that skips the final save anyway.

   So the quit gets a deadline. A page that answers writes in milliseconds and
   the process is gone long before it; QUIT_GRACE_MS is generous so that a page
   which is merely busy (a big paste, an import) still gets to land its save.
   Past it, the page is not coming back: what it holds since the last save is
   lost whatever happens next, and keeping the process alive saves none of it.
   Tear down what will-quit would have, and exit. tools/test-app.js quits a
   page that never answers and checks every process goes. */
const QUIT_GRACE_MS = 8000;
let quitTimer = null;
function armQuitWatchdog() {
  if (quitTimer) return;
  quitTimer = setTimeout(() => {
    console.error(`quit: the page did not let the window close in ${QUIT_GRACE_MS / 1000} s; exiting without it`);
    hangLog(`quit stalled ${QUIT_GRACE_MS / 1000} s on the page; forced exit`);
    teardown();
    app.exit(0);
  }, QUIT_GRACE_MS);
}
// will-quit, or the watchdog in its place; every step is safe to repeat
function teardown() {
  try { globalShortcut.unregisterAll(); } catch (_) {}
  try { if (playerServer) playerServer.close(); } catch (_) {}
  try { tablet.stop('quit'); } catch (_) {}
  destroyTray();
}

/* Why the page stopped answering is still unknown — it could not be made to
   happen again on purpose. So the built app writes down when Chromium calls the page hung and
   when a quit had to be forced, with the time, next to window-state.json. A
   few lines a year at most; trimmed when it passes 64 KB. */
function hangLog(what) {
  try {
    const file = path.join(dataDir(), 'hangs.log');
    let size = 0;
    try { size = fs.statSync(file).size; } catch (_) {}
    if (size > 64 * 1024) fs.writeFileSync(file, '', 'utf8');
    fs.appendFileSync(file, `${new Date().toISOString()} ${app.getVersion()} ${what}\n`, 'utf8');
  } catch (_) {}
}

/* Say it once, ever. A window that vanishes into a tray without a word is
   indistinguishable from an app that closed, and the user finds out their
   reminders "did not work" days later. The marker sits beside the board so it
   survives an upgrade — this is a thing you need telling once in the life of
   the install, not once a session. */
function noteStillRunning() {
  const marker = path.join(dataDir(), '.tray-notice');
  try {
    if (fs.existsSync(marker)) return;
    fs.writeFileSync(marker, 'tray notice shown', 'utf8');
  } catch (_) { return; }
  try {
    if (!Notification.isSupported()) return;
    new Notification({
      title: t('main.stillRunningTitle'),
      body: t('main.stillRunningBody')
    }).show();
  } catch (_) {}
}

/* The renderer owns the setting; main is told what it is. Turning it off makes
   the close button quit again and takes the tray away in the same breath. */
ipcMain.on('win:background', (_e, on) => {
  runInBackground = !!on;
  if (runInBackground) buildTray(); else destroyTray();
});

/* The renderer resolved the catalogue; this is main being told what it may say.
   Sent on boot and on every language change — see applyLang(). Only the `main.`
   keys cross, so this is a dozen short strings and not the whole catalogue, and
   only keys main already knows about are accepted. The tray is rebuilt because
   its labels are the ones already on screen. */
ipcMain.on('win:strings', (_e, table) => {
  if (!table || typeof table !== 'object') return;
  STRINGS = {};
  for (const k of Object.keys(S_EN)) {
    if (typeof table[k] === 'string' && table[k]) STRINGS[k] = table[k];
  }
  try { if (tray) tray.setContextMenu(trayMenu()); } catch (_) {}
});

/* ---------- IPC: window controls ---------- */
ipcMain.on('win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:toggle-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return;
  w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win:show', () => showMain());
ipcMain.handle('win:is-maximized', (e) => !!BrowserWindow.fromWebContents(e.sender)?.isMaximized());

/* ---------- IPC: paths + theme ---------- */
onSync('paths:sync', () => ({
  userData: dataDir(),
  exeDir: path.dirname(process.execPath),
  version: app.getVersion()
}), { userData: '', exeDir: '', version: '' });

// 'system' | 'dark' | 'light' — drives the native window chrome + background
ipcMain.on('theme:set', (_e, theme) => {
  nativeTheme.themeSource = (theme === 'dark' || theme === 'light') ? theme : 'system';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#12131a' : '#f4f5f8');
  }
});
ipcMain.handle('theme:dark', () => nativeTheme.shouldUseDarkColors);
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:system-changed', nativeTheme.shouldUseDarkColors);
  }
});

/* A synchronous call always gets an answer. The page is frozen inside
   sendSync until main sets returnValue, and a handler that throws first never
   sets it — so the page stays frozen for good, and a frozen page cannot answer
   beforeunload, which stalls any quit (see armQuitWatchdog). Each sync handler
   below goes through here with the answer it gives when it fails. */
function onSync(channel, fn, fallback) {
  ipcMain.on(channel, (e, ...args) => {
    try { e.returnValue = fn(...args); }
    catch (err) {
      console.error(`${channel} threw:`, err);
      try { e.returnValue = typeof fallback === 'function' ? fallback(err) : fallback; } catch (_) { e.returnValue = null; }
    }
  });
}
const errText = (err) => String((err && err.message) || err);

/* ---------- IPC: the store ----------
   Every call here returns a status the renderer has to act on; none throws.
   `store:load` and `store:save-sync` are synchronous on purpose — the first
   runs before anything is drawn, the second on the way out, where a promise
   never settles. Everything else is off the renderer's thread. */
ipcMain.on('store:load', (e) => {
  try { e.returnValue = store.scan(); }
  catch (err) { e.returnValue = { error: String((err && err.message) || err), boards: [], settings: { data: null, status: 'empty' } }; }
});
ipcMain.on('store:save-sync', (e, payload) => {
  try { e.returnValue = store.saveAll(payload); }
  // '*', not '': the call failed as a whole, so no board landed (MAP.md §7)
  catch (err) { e.returnValue = { ok: false, errors: [{ id: '*', error: String((err && err.message) || err) }] }; }
});
ipcMain.handle('store:save', (_e, payload) => store.saveAllAsync(payload));
onSync('store:snapshot', (id, json, day) => store.snapshot(id, json, day), (err) => ({ ok: false, error: errText(err) }));
onSync('store:version-snapshot', (id, json, label) => store.versionSnapshot(id, json, label), (err) => ({ ok: false, error: errText(err) }));
onSync('store:paths', () => ({ root: store.rootDir(), userData: dataDir(), exeDir: path.dirname(process.execPath), version: app.getVersion() }),
  () => ({ root: '', userData: '', exeDir: '', version: '' }));

/* the files a board carries */
ipcMain.handle('files:attach', (_e, src, id, name) => store.attachFile(src, id, name));
ipcMain.handle('files:attach-bytes', (_e, dataUrl, id, name) => store.attachBytes(dataUrl, id, name));
onSync('files:list', (id) => store.listFiles(id), []);
ipcMain.handle('files:carry', (_e, urls, toId) => store.carryFiles(urls, toId));
ipcMain.handle('files:unused', (_e, keep, onlyId) => store.cleanup(keep, false, onlyId));
ipcMain.handle('files:remove-unused', (_e, keep, onlyId) => store.cleanup(keep, true, onlyId));
onSync('files:read-image', (url) => store.readImage(url), null);
onSync('files:dir', (id) => (id ? store.filesDir(id) : store.rootDir()), '');

/* whole boards */
ipcMain.handle('board:duplicate-files', (_e, fromId, toId, name, group) => store.duplicateFiles(fromId, toId, name, group));
ipcMain.handle('board:remove-dir', (_e, id) => store.removeBoardDir(id));
ipcMain.handle('board:adopt-files', (_e, beside, urls, toId) => store.adoptExternalFiles(beside, urls, toId));
/* Export = copy the board's folder somewhere the user picks. */
ipcMain.handle('board:export', async (e, id, name) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.exportBoard'), properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return store.exportBoard(id, filePaths[0], name);
});
/* Import = pick a board.json (inside a board folder) or a 1.x .json export.
   The data comes back with where it was, so its files can be brought in. */
ipcMain.handle('board:import', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.importBoard'), properties: ['openFile'],
    filters: [{ name: t('main.filterJson'), extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  return store.readExternal(filePaths[0]);
});
ipcMain.handle('board:read-external', (_e, p) => store.readExternal(p));
/* JSON Canvas: Obsidian's board format. See js/canvas.js and MAP.md §4t. */
ipcMain.handle('canvas:pick-save', async (e, suggested) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: t('main.exportCanvas'),
    defaultPath: suggested || 'board.canvas',
    filters: [{ name: t('main.filterCanvas'), extensions: ['canvas'] }]
  });
  return canceled || !filePath ? null : filePath;
});
ipcMain.handle('canvas:write', (_e, file, json, id, names, folder) => store.writeCanvas(file, json, id, names, folder));
ipcMain.handle('canvas:import', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.importCanvas'), properties: ['openFile'],
    filters: [{ name: t('main.filterCanvas'), extensions: ['canvas'] }]
  });
  if (canceled || !filePaths.length) return null;
  return store.readCanvas(filePaths[0]);
});
ipcMain.handle('canvas:read', (_e, p) => store.readCanvas(p));
ipcMain.handle('canvas:resolve', (_e, dir, rels) => store.resolveCanvasFiles(dir, rels));
/* Samsung Notes: its own file, and the exports it can make. Paths come back;
   the renderer reads each for the open board. See js/samsung.js, MAP.md §4w. */
ipcMain.handle('samsung:pick', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.importSamsung'), properties: ['openFile', 'multiSelections'],
    filters: [
      { name: t('main.filterSamsungAll'), extensions: ['sdocx', 'pdf', 'png', 'jpg', 'jpeg', 'txt'] },
      { name: t('main.filterSamsung'), extensions: ['sdocx'] }
    ]
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('samsung:read', (_e, p, id) => store.readSamsung(p, id));

/* Save a board picture. Takes a data: URL because that is what a canvas
   produces, and decodes it here so the renderer never holds a Buffer. */
ipcMain.handle('file:save-image', async (e, dataUrl, suggested) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'not a png data url' };
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: t('main.exportImage'),
    defaultPath: suggested || 'board.png',
    filters: [{ name: t('main.filterPng'), extensions: ['png'] }]
  });
  if (canceled || !filePath) return null;
  try { fs.writeFileSync(filePath, Buffer.from(m[1], 'base64')); return { path: filePath }; }
  catch (err) { return { error: String(err) }; }
});

/* ---------- a mirror somewhere that is not this disk ----------
   Everything the app does to protect a board lands beside the board. This is
   the one thing that puts a copy on another drive: pick a folder once, and the
   whole My Boards folder is mirrored into it — new and changed files only, so
   a clip that has not changed is not copied twice, and nothing in the mirror
   is ever deleted. */
ipcMain.handle('file:backup-dir', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.backupFolder'), properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});
ipcMain.handle('file:backup', (_e, dir) => store.mirrorTo(dir));
/* A complete, dated copy somewhere the user points. */
ipcMain.handle('file:backup-all', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.backupFolder'), properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return store.backupAllTo(filePaths[0]);
});
/* ---------- start again ----------
   Everything the user has — every board, every file, the settings — goes to
   the Recycle Bin, and the store starts empty. The Recycle Bin, not rm: the
   renderer has asked twice by the time this runs, and a folder that can still
   be put back from the desktop costs nothing to keep that way. The renderer
   reloads afterwards so nothing in memory is written over the fresh start. */
onSync('store:tally', () => store.tally(), { boards: 0, files: 0, bytes: 0 });
ipcMain.handle('store:erase-all', async () => {
  try {
    const root = store.rootDir();
    if (!root) return { ok: false, error: 'no store' };
    try { await shell.trashItem(root); }
    catch (err) {
      // the Recycle Bin refused (a network drive, say): remove for real
      try { fs.rmSync(root, { recursive: true, force: true }); }
      catch (err2) { return { ok: false, error: String((err2 && err2.message) || err2) }; }
    }
    store.reset();
    return { ok: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

/* ---------- where is this, actually? ----------
   Neither of these can start a program: `reveal` only ever calls
   showItemInFolder, and `open-board-dir` opens a *directory* inside My Boards. */
ipcMain.on('shell:reveal-url', (_e, url) => {
  try {
    const p = store.pathOfUrl(url);
    if (p) shell.showItemInFolder(p);
  } catch (_) {}
});
ipcMain.on('shell:open-board-dir', (_e, id) => {
  try {
    const p = id ? store.boardDir(id) : store.rootDir();
    if (!p) return;
    const root = path.resolve(store.rootDir()).toLowerCase();
    if (!path.resolve(p).toLowerCase().startsWith(root)) return;
    if (fs.statSync(p).isDirectory()) shell.openPath(p);
  } catch (_) {}
});
ipcMain.on('shell:open-data-folder', () => { try { shell.openPath(store.rootDir()); } catch (_) {} });

/* image pickers — a path comes back, and the renderer takes the file into the
   board (store.attachFile), so the note points at the board's own copy */
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'];
ipcMain.handle('file:pick-image', async (e, purpose) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: purpose === 'background' ? t('main.pickBackground') : t('main.insertImage'),
    properties: ['openFile'],
    filters: [{ name: t('main.filterImages'), extensions: IMAGE_EXT }]
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

/* The same for a video, so a clip can be added without a drag — from the +
   menu, the right-click menu and /video. The list is the renderer's VIDEO_EXT;
   a format Chromium cannot decode is still taken and the player says so. */
const VIDEO_EXT = ['mp4', 'webm', 'ogv', 'ogg', 'm4v', 'mov', 'mkv', 'avi'];
ipcMain.handle('file:pick-video', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: t('main.insertVideo'),
    properties: ['openFile'],
    filters: [{ name: t('main.filterVideos'), extensions: VIDEO_EXT }]
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

ipcMain.on('shell:open-external', (_e, url) => {
  try { if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url); } catch (_) {}
});
/* ---------- a document on this machine ----------
   The strict door. shell:open-external above vets a *scheme*; this vets an
   extension as well, because opening a local path is the only route in the
   app that can *run* a program — shell.openPath on a .exe, .bat, .cmd, .lnk,
   .ps1 or .msi executes it. A board is a document that gets mailed around
   and the sanitiser lets file: and mbf: hrefs through, so the guard lives
   here, where nothing in the page can reach around it.

   An allow-list: anything not on it is *revealed* in Explorer rather than
   opened, which still puts the user in front of their file and cannot run a
   thing. */
const OPENABLE = new Set([
  '.txt', '.md', '.rtf', '.pdf', '.csv', '.tsv', '.json', '.xml', '.log', '.ini', '.yml', '.yaml',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg', '.tif', '.tiff', '.heic',
  '.mp3', '.wav', '.flac', '.m4a', '.ogg', '.opus',
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v'
]);
ipcMain.on('shell:open-local', (_e, url) => {
  try {
    const p = store.pathOfUrl(url);
    if (!p) return;
    let isDir = false;
    try { isDir = fs.statSync(p).isDirectory(); } catch (_) {}
    if (isDir || OPENABLE.has(path.extname(p).toLowerCase())) shell.openPath(p);
    else shell.showItemInFolder(p);
  } catch (_) {}
});

/* ---------- what this machine can afford ----------
   The renderer decides the graphics mode, but only main can ask Chromium
   whether there is a GPU behind the window at all. `gpu_compositing` reads
   'disabled_software' on a machine with no usable graphics driver, and that
   is the machine every blurred shadow and backdrop filter was hurting. */
function gpuInfo() {
  let compositing = '';
  try { compositing = String((app.getGPUFeatureStatus() || {}).gpu_compositing || ''); } catch (_) {}
  const software = /software|disabled/i.test(compositing) || EARLY.softwareRender === true;
  return { compositing, software, softwareRender: EARLY.softwareRender === true };
}
onSync('sys:info', () => gpuInfo(), { compositing: '', software: false, softwareRender: false });

/* ---------- there is no updater ----------
   1.3 downloaded updates from a GitHub Releases feed and staged an NSIS
   installer to be swapped in on quit. Between that staged copy, the installed
   copy, the portable build's %TEMP% extraction and the folder the build script
   wrote, one machine could hold four builds of this app, and a shortcut only
   ever points at one of them. Every "I updated it and it came back the same"
   traced to that.

   Updating is now: run admin\Build App.cmd. It deletes App\ and writes the
   current source into it, and the shortcuts already point there. One copy, one
   path, and App\BUILD.txt says which build it is. Nothing arrives behind your
   back and nothing is staged for later. */

/* ---------- boot ---------- */
/* Only ever one copy. Two windows on one store both hold the whole board
   in memory and both write it back on a timer, so the second one to save wins
   and silently throws away everything the other did. Hand the launch over to
   the window that already exists instead. */
/* Bring the window to the front and make sure it is actually usable — minimised
   and hidden are different states and both have to be undone. */
function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return mainWindow;
}

/* Quick capture: one global hotkey that brings the app up with a capture box
   open. The note is written by the *renderer*, not from here — the renderer
   holds the board in memory and a second writer would race its debounced save
   and lose whichever side got there last.

   Ctrl+Alt+N rather than anything with Win in it: Windows reserves most Win
   chords and silently refuses the rest. register() returns false when something
   else already owns the combination, which is normal and not worth a dialog —
   the app simply does not get that hotkey. */
const CAPTURE_ACCEL = 'Control+Alt+N';
function registerCapture() {
  try {
    const ok = globalShortcut.register(CAPTURE_ACCEL, () => {
      const win = showMain();
      if (win) win.webContents.send('capture:open');
    });
    if (!ok) console.log(`quick capture: ${CAPTURE_ACCEL} is taken by something else`);
  } catch (err) {
    console.log('quick capture unavailable:', err && err.message);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMain());

  app.whenReady().then(() => {
    /* Permissions: what the app uses, and nothing else. Reminders are
       notifications, Copy writes the clipboard, and a video or an embedded
       player can go full screen. A crafted board cannot ask for the camera,
       the microphone, the location or anything else — the answer is no
       without a prompt. */
    const ALLOWED_PERMISSIONS = new Set(['notifications', 'clipboard-sanitized-write', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED_PERMISSIONS.has(permission)));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
    try { fs.mkdirSync(dataDir(), { recursive: true }); } catch (_) {}
    tidyOldCache();
    store.init(boardsRoot());
    /* A 1.x board in %APPDATA% and an empty My Boards: lay it out the new way,
       once. The old file is left where it was. */
    try {
      const m = store.migrateLegacy(dataDir());
      if (m && m.error) console.error('migration failed:', m.error);
      else if (m && m.migrated) console.log(`migrated ${m.migrated} board(s) from ${m.from}`);
    } catch (err) { console.error('migration threw:', err); }
    /* mbf://<boardId>/<name> → that board's files\<name>. Range headers are
       passed through so a video can seek; anything the store will not resolve
       is a 404 and nothing more. */
    protocol.handle('mbf', (req) => {
      try {
        const u = new URL(req.url);
        const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
        const p = store.resolveFile(u.hostname, name);
        if (!p) return new Response('', { status: 404 });
        const headers = {};
        const range = req.headers.get('range');
        if (range) headers.Range = range;
        return net.fetch(pathToFileURL(p).href, { headers });
      } catch (_) { return new Response('', { status: 400 }); }
    });
    createWindow();
    buildTray();
    registerCapture();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  // anything that ends the app comes through here, so the latch is set once
  app.on('before-quit', () => { quitting = true; armQuitWatchdog(); });

  app.on('will-quit', teardown);

  /* Only quit here when the window really closed, which with the tray on it
     never does — `close` hides it instead. With the setting off this is the
     old behaviour, unchanged. */
  app.on('window-all-closed', () => {
    if (runInBackground) return;
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { boardsRoot };
