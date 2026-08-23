/* Mental Board — preload.
   The single bridge between the renderer and the machine. Everything the
   renderer can do to disk, the shell or the window is on one of the four
   globals below; there is no other route. */
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const PATHS = ipcRenderer.sendSync('paths:sync');   // { userData, exeDir }
const BOARD = path.join(PATHS.userData, 'board.json');
const BAK = path.join(PATHS.userData, 'board.bak.json');
const BACKUPS = path.join(PATHS.userData, 'backups');

/* ---------- board file -------------------------------------------------
   Written atomically: text goes to a .tmp beside the real file, the current
   file is copied to board.bak.json, then the tmp is renamed over the top. A
   crash mid-write therefore can never leave a half-written board.json, and if
   one somehow appears, load() falls back to the .bak.                     */
function readJson(file) {
  try {
    let raw = fs.readFileSync(file, 'utf8');
    /* Strip a UTF-8 BOM. JSON.parse throws on a leading U+FEFF, and half of
       Windows writes one: Notepad, Set-Content, Out-File, plenty of editors.
       Since the recovery instructions tell people to copy a backup over
       board.json by hand, a board that came back through any of those tools
       would otherwise be declared unreadable when it is perfectly fine. */
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}

/* Returns { board, status } — and the status is the important half.

   This used to return the board or null, which made "there is no board yet"
   and "the board is there but I could not read it" the same answer. The
   renderer treated both as a first run: fresh empty board, welcome note,
   save — straight over the file it had just failed to read. One locked or
   half-copied file and the user's work was gone.

     'empty'      no board file at all. A genuine first run.
     'ok'         parsed. `board` is it.
     'unreadable' a file exists and neither it nor the backup would parse.
                  The renderer must refuse to write anything in this state. */
function loadBoard() {
  const board = readJson(BOARD);
  if (board) return { board, status: 'ok', from: 'board' };
  const bak = readJson(BAK);
  if (bak) return { board: bak, status: 'ok', from: 'backup' };
  const existed = (() => {
    try { return fs.existsSync(BOARD) || fs.existsSync(BAK); } catch (_) { return false; }
  })();
  return { board: null, status: existed ? 'unreadable' : 'empty' };
}

/* Returns { ok: true } or { ok: false, error }. Not a bare boolean, and never a
   silent false: the renderer has to be able to tell the user *why* the board
   is not reaching the disk, and "false" is not something you can put in a
   message. A save that fails and says nothing is how a session's work
   disappears at close with no warning at any point before it. */
function saveBoard(json) {
  try {
    fs.mkdirSync(PATHS.userData, { recursive: true });
    const tmp = BOARD + '.tmp';
    fs.writeFileSync(tmp, json, 'utf8');
    try { if (fs.existsSync(BOARD)) fs.copyFileSync(BOARD, BAK); } catch (_) {}
    fs.renameSync(tmp, BOARD);
    return { ok: true };
  } catch (err) {
    try { fs.rmSync(BOARD + '.tmp', { force: true }); } catch (_) {}
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/* The same write, off the renderer's thread.

   `saveBoard()` above is `writeFileSync` + `copyFileSync` + `renameSync`, and
   preload runs *in the renderer process* — so every one of those blocks the UI
   thread for as long as the disk takes. On an SSD that is a millisecond nobody
   notices. On a spinning disk, a few megabytes of board plus a copy for the
   .bak is comfortably a tenth of a second, every few seconds, for the whole
   time somebody is typing: the window stops, the caret stops, keystrokes queue
   up and arrive in a burst. That is the single biggest reason this app felt
   bad on an old machine, and none of it is CPU.

   fs.promises hands the work to libuv's thread pool, so the renderer keeps
   painting while the bytes go out. Everything else is identical — same .tmp,
   same .bak, same rename over the top, same atomicity guarantee.

   The chain is not optional. Two overlapping writes would both be writing the
   same .tmp path and both renaming it, and the loser would rename a file that
   is no longer there — or worse, rename a half-written one into place. Queuing
   them keeps "one writer at a time", which is what the sync version got for
   free by blocking.

   `run` is passed to both arms of .then so a rejected predecessor does not stop
   the queue: one failed write must not disable saving for the session. That is
   the bug this whole project was reworked over, in a new place. */
const fsp = fs.promises;
let writeChain = Promise.resolve();
function saveBoardAsync(json) {
  const run = async () => {
    const tmp = BOARD + '.tmp';
    try {
      await fsp.mkdir(PATHS.userData, { recursive: true });
      await fsp.writeFile(tmp, json, 'utf8');
      try { await fsp.copyFile(BOARD, BAK); } catch (_) { /* no board yet — nothing to back up */ }
      await fsp.rename(tmp, BOARD);
      return { ok: true };
    } catch (err) {
      try { await fsp.rm(tmp, { force: true }); } catch (_) {}
      return { ok: false, error: String((err && err.message) || err) };
    }
  };
  writeChain = writeChain.then(run, run);
  return writeChain;
}

// one dated snapshot per day, newest 20 kept
function snapshot(json) {
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(BACKUPS, `board-${day}.json`);
    if (fs.existsSync(file)) return null;
    fs.writeFileSync(file, json, 'utf8');
    /* Dated files only. `board-.*` also matched board-before-<version>.json,
       and although those sort after the dated ones and so were never the file
       shift() removed, they still counted towards the 20 — so every upgrade
       permanently cost one day of history and the window kept shrinking. The
       version snapshots are deliberately outside this budget. */
    const old = fs.readdirSync(BACKUPS).filter((f) => /^board-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (old.length > 20) { try { fs.unlinkSync(path.join(BACKUPS, old.shift())); } catch (_) {} }
    return file;
  } catch (_) { return null; }
}

/* A snapshot taken because the app version changed, kept apart from the daily
   ones so it never ages out of the 20 and so its name says why it exists.
   This is what makes "I updated and lost everything" recoverable rather than
   a support conversation: the board as it was on the last build is still on
   disk, under the version number it was written by. */
function versionSnapshot(json, label) {
  try {
    fs.mkdirSync(BACKUPS, { recursive: true });
    const safe = String(label || 'unknown').replace(/[^\w.\-]/g, '_');
    const file = path.join(BACKUPS, `board-before-${safe}.json`);
    if (fs.existsSync(file)) return null;      // only the first launch on a version
    fs.writeFileSync(file, json, 'utf8');
    return file;
  } catch (_) { return null; }
}

contextBridge.exposeInMainWorld('mbData', {
  load: loadBoard,
  /* Two writers, and the renderer picks by *when* it is writing, not by taste.
     `save` is synchronous and is what the close path needs — a promise handed
     back on `beforeunload` never settles, because the window is already gone.
     `saveAsync` is what every other save should use. Both return the same
     { ok, error }; saveAsync returns it inside a promise. */
  save: saveBoard,
  saveAsync: saveBoardAsync,
  snapshot,
  versionSnapshot,
  paths: () => ({ ...PATHS, board: BOARD, backups: BACKUPS }),
  exportTo: (json, suggested) => ipcRenderer.invoke('file:export', json, suggested),
  importFrom: () => ipcRenderer.invoke('file:import'),
  openDataFolder: () => ipcRenderer.send('shell:open-data-folder'),
  /* A copy of everything, somewhere that is not this disk. `pickBackupDir`
     asks for the folder once; `backupTo` writes a dated file into it and keeps
     the newest few. Both return null / { error } rather than throwing, and the
     renderer has to act on that — same rule as save(). */
  pickBackupDir: () => ipcRenderer.invoke('file:backup-dir'),
  backupTo: (dir, json, name) => ipcRenderer.invoke('file:backup', dir, json, name),
  reveal: (p) => ipcRenderer.send('shell:reveal', p)
});

const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml'
};

contextBridge.exposeInMainWorld('mbFiles', {
  /* A **dropped** File -> file:// url, so a big image costs nothing to store.

     Returns null for anything that is not a real file on disk, and that guard
     is the whole point of the line. `getPathForFile()` gives back an empty
     string for a File the clipboard made — a pasted screenshot has no path
     because it has never been a file — and `pathToFileURL('')` does not throw
     or return null, it resolves '' against the working directory and hands
     back a URL for **the app's own folder**. So every pasted screenshot became
     `<img src="file:///D:/Projects/…/">`: a broken image, silently, with no
     error anywhere and no clue that the fallback path which would have inlined
     it as a data URL was never reached. */
  toUrl: (file) => {
    try {
      const p = webUtils.getPathForFile(file);
      if (!p) return null;                 // clipboard image: no path, no URL
      return pathToFileURL(p).href;
    } catch (_) { return null; }
  },
  pickImage: () => ipcRenderer.invoke('file:pick-image'),
  /* Write a canvas out as a real PNG. Returns null when the save dialog was
     cancelled, `{ path }` when it landed, `{ error }` when it did not — and
     like save() above, the *renderer* has to act on which of the three it got.
     Silence on a failed export is a smaller loss than a failed board write, but
     it is the same shape of bug. */
  savePng: (dataUrl, suggested) => ipcRenderer.invoke('file:save-image', dataUrl, suggested),
  /* Title, channel and a locally cached thumbnail for a video card. Resolves to
     null whenever it cannot say — offline, private video, changed API — and the
     renderer draws the plain card instead. */
  describeEmbed: (kind, id) => ipcRenderer.invoke('embed:describe', kind, id),
  /* The URL of the local page that hosts the player. Built in main, never here:
     the port and the session token are its business, and a renderer that could
     assemble the URL itself could be talked into assembling a different one. */
  playerUrl: (kind, id) => ipcRenderer.invoke('embed:player-url', kind, id),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  /* A document on this machine. Separate from openExternal on purpose: that one
     vets a *scheme*, this one vets an extension as well, because opening a
     local path is the one route that can run a program. See main.js. */
  openLocal: (url) => ipcRenderer.send('shell:open-local', url),
  // a dropped File -> the real path, so a note can link to it rather than inline it
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (_) { return ''; } },

  /* Read a file:// image back as a data URL.
     The renderer needs this for the crop/annotate studio: drawing a file://
     image into a canvas taints it, and a tainted canvas refuses toDataURL().
     Loading the bytes here and handing over a data URL keeps the canvas clean. */
  readImage: (url) => {
    try {
      if (/^data:/i.test(url)) return url;
      if (!/^file:/i.test(url)) return null;
      const p = require('url').fileURLToPath(url);
      const mime = IMG_MIME[path.extname(p).toLowerCase()];
      if (!mime) return null;
      const stat = fs.statSync(p);
      if (stat.size > 40 * 1024 * 1024) return null;
      return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
    } catch (_) { return null; }
  }
});

contextBridge.exposeInMainWorld('mbWin', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  show: () => ipcRenderer.send('win:show'),
  /* Whether closing the window should hide it to the tray or end the app. The
     renderer owns the setting; this is how main is told. Sent on boot and on
     every change, so the two can never disagree. */
  setBackground: (on) => ipcRenderer.send('win:background', !!on),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
  /* The global capture hotkey fired. Main has already raised the window; the
     renderer opens the box and owns the write, because it owns the board. */
  onCapture: (cb) => ipcRenderer.on('capture:open', () => cb())
});

contextBridge.exposeInMainWorld('mbTheme', {
  // 'system' | 'dark' | 'light' — tells the OS chrome which way to go
  set: (theme) => ipcRenderer.send('theme:set', theme),
  isDark: () => ipcRenderer.invoke('theme:dark'),
  onSystemChange: (cb) => ipcRenderer.on('theme:system-changed', (_e, dark) => cb(dark))
});
