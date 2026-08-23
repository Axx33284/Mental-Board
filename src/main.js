/* Mental Board — Electron main process.
   Owns the window, the on-disk data folder, and the native theme. The renderer
   never touches Node directly; everything goes through preload.js + these IPC
   handlers. */
const { app, BrowserWindow, Menu, Tray, nativeImage, Notification,
        ipcMain, dialog, shell, screen, nativeTheme, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

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

/* ---------- where user data lives ----------
   %APPDATA%/Mental Board/
     board.json          the board itself
     board.bak.json      previous good copy (written before every overwrite)
     backups/            dated snapshots, plus one taken before each new version

   The path is PINNED here, not derived.

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
function boardFile() { return path.join(dataDir(), 'board.json'); }
function bakFile() { return path.join(dataDir(), 'board.bak.json'); }

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
      sandbox: false,        // preload needs fs for the board file
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
    if (quitting || !runInBackground) return;
    e.preventDefault();
    win.hide();
    noteStillRunning();
  });
  win.on('closed', () => { mainWindow = null; });

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

function buildTray() {
  if (tray || !runInBackground) return;
  try {
    tray = new Tray(trayImage());
    tray.setToolTip('Mental Board');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Mental Board', click: () => showMain() },
      /* CAPTURE_ACCEL is declared below this function but read at click time,
         long after the module has finished evaluating. 'Control' is Electron's
         spelling; Windows calls it Ctrl on every label a user ever reads. */
      { label: 'Quick capture (' + CAPTURE_ACCEL.replace('Control', 'Ctrl') + ')', click: () => {
        const win = showMain();
        if (win) win.webContents.send('capture:open');
      } },
      { type: 'separator' },
      /* The only way out, and it has to be here: with the close button hiding
         the window, an app with no visible quit is one people kill in Task
         Manager — which is the one exit that skips the final save. */
      { label: 'Quit', click: () => { quitting = true; app.quit(); } }
    ]));
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
      title: 'Mental Board is still running',
      body: 'It sits in the tray so reminders and quick capture keep working. Right-click the tray icon to quit.'
    }).show();
  } catch (_) {}
}

/* The renderer owns the setting; main is told what it is. Turning it off makes
   the close button quit again and takes the tray away in the same breath. */
ipcMain.on('win:background', (_e, on) => {
  runInBackground = !!on;
  if (runInBackground) buildTray(); else destroyTray();
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
ipcMain.on('paths:sync', (e) => {
  e.returnValue = {
    userData: dataDir(),
    exeDir: path.dirname(process.execPath),
    version: app.getVersion()
  };
});

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

/* ---------- IPC: export / import dialogs ---------- */
ipcMain.handle('file:export', async (e, json, suggested) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: 'Export board',
    defaultPath: suggested || 'mental-board.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return null;
  try { fs.writeFileSync(filePath, json, 'utf8'); return filePath; } catch (err) { return { error: String(err) }; }
});

ipcMain.handle('file:import', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: 'Import board',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePaths.length) return null;
  try { return { json: fs.readFileSync(filePaths[0], 'utf8') }; } catch (err) { return { error: String(err) }; }
});

/* Save a board picture. Separate from file:export rather than folded into it,
   because that one writes UTF-8 — handing it a PNG would write the *text* of
   the bytes and produce a file no viewer will open. Takes a data: URL because
   that is what a canvas produces, and decodes it here so the renderer never
   has to hold a Buffer it has no way to make. */
ipcMain.handle('file:save-image', async (e, dataUrl, suggested) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return { error: 'not a png data url' };
  const { canceled, filePath } = await dialog.showSaveDialog(w, {
    title: 'Export board as image',
    defaultPath: suggested || 'board.png',
    filters: [{ name: 'PNG image', extensions: ['png'] }]
  });
  if (canceled || !filePath) return null;
  try { fs.writeFileSync(filePath, Buffer.from(m[1], 'base64')); return { path: filePath }; }
  catch (err) { return { error: String(err) }; }
});

/* ---------- backups somewhere that is not this disk ----------
   The app already keeps twenty dated snapshots and a copy before every
   version — and every one of them sits in %APPDATA%, next to the file they are
   protecting. That is exactly the right shape for "I broke my board" and no use
   at all for a dead drive, a stolen laptop or a reinstall. For anybody keeping
   work in here that is the largest risk in the app, and until now nothing in
   the interface even mentioned it.

   So: pick a folder once — a synced drive, a stick, a share — and the app
   writes a dated copy there. `file:backup-dir` asks for the folder;
   `file:backup` does the write and prunes to the newest few. */
ipcMain.handle('file:backup-dir', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: 'Choose a backup folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (canceled || !filePaths.length) return null;
  return filePaths[0];
});

const BACKUP_KEEP = 10;
ipcMain.handle('file:backup', async (_e, dir, json, name) => {
  try {
    if (!dir || typeof dir !== 'string') return { error: 'no folder' };
    fs.mkdirSync(dir, { recursive: true });
    const safe = String(name || 'mental-board').replace(/[^\w.\- ]/g, '_').slice(0, 60);
    const file = path.join(dir, safe);
    /* Written to a .tmp and renamed, the same way the board itself is. A backup
       half-written because the stick was pulled out is worse than no backup:
       it looks like one. */
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, file);
    // keep the newest few and no more, so a synced folder does not grow forever
    try {
      const old = fs.readdirSync(dir)
        .filter((f) => /^mental-board-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
      while (old.length > BACKUP_KEEP) fs.unlinkSync(path.join(dir, old.shift()));
    } catch (_) {}
    return { path: file };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
});

ipcMain.on('shell:reveal', (_e, p) => { try { if (p) shell.openPath(String(p)); } catch (_) {} });

// image picker for the note editor — returns a file:// url, no copying involved
ipcMain.handle('file:pick-image', async (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(w, {
    title: 'Insert image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'] }]
  });
  if (canceled || !filePaths.length) return null;
  return require('url').pathToFileURL(filePaths[0]).href;
});

ipcMain.on('shell:open-external', (_e, url) => {
  try { if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url); } catch (_) {}
});
ipcMain.on('shell:open-data-folder', () => { try { shell.openPath(dataDir()); } catch (_) {} });

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
/* Only ever one copy. Two windows on one board.json both hold the whole board
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
    try { fs.mkdirSync(dataDir(), { recursive: true }); } catch (_) {}
    tidyOldCache();
    createWindow();
    buildTray();
    registerCapture();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  // anything that ends the app comes through here, so the latch is set once
  app.on('before-quit', () => { quitting = true; });

  app.on('will-quit', () => {
    try { globalShortcut.unregisterAll(); } catch (_) {}
    try { if (playerServer) playerServer.close(); } catch (_) {}
    destroyTray();
  });

  /* Only quit here when the window really closed, which with the tray on it
     never does — `close` hides it instead. With the setting off this is the
     old behaviour, unchanged. */
  app.on('window-all-closed', () => {
    if (runInBackground) return;
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { boardFile, bakFile };
