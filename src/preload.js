/* Mental Board — preload.
   The single bridge between the renderer and the machine. Everything the
   renderer can do to disk, the shell or the window is on one of the four
   globals below; there is no other route. */
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

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
/* The two writers get two scratch files, and that is not tidiness.

   `saveBoardAsync` chains its calls precisely because two overlapping writes
   would both be writing the same `.tmp` and both renaming it — see the note
   below. The synchronous writer is not in that chain and cannot be: it exists
   for `beforeunload`, where there is nothing to await. So the one case the
   chain does not cover is exactly the one that matters most — a debounced
   async write still in flight when the window closes and `flushSave()` writes
   synchronously over the top of it. The async one then renames a file the sync
   one has already renamed away, gets ENOENT, and reports a failed save that
   did not fail. Ctrl+S reaches the same race without closing anything.

   Separate names make the two independent. Both still write a whole file and
   rename it over `board.json`, so the atomicity guarantee is untouched and the
   last rename wins — which is the sync one, because it is the newer content. */
const TMP_SYNC = BOARD + '.tmp';
const TMP_ASYNC = BOARD + '.async.tmp';

function saveBoard(json) {
  try {
    fs.mkdirSync(PATHS.userData, { recursive: true });
    fs.writeFileSync(TMP_SYNC, json, 'utf8');
    try { if (fs.existsSync(BOARD)) fs.copyFileSync(BOARD, BAK); } catch (_) {}
    fs.renameSync(TMP_SYNC, BOARD);
    return { ok: true };
  } catch (err) {
    try { fs.rmSync(TMP_SYNC, { force: true }); } catch (_) {}
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
    const tmp = TMP_ASYNC;
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

/* ---------- the files a board has ---------------------------------------
   A board is not only text any more: drop a video, a picture or a document on
   it and the file becomes part of the board. So it has to live *with* the
   board, not wherever it happened to be when it was dropped.

       %APPDATA%/Mental Board/files/<boardId>/<name>

   One folder per board, named by the board's own id — which is why boards were
   given stable ids long before anything read them (§3a). That layout is the
   whole of the organisation: it makes "what does this board carry?" a
   directory listing, it makes a backup a copy of two things rather than a
   crawl of the user's whole disk, and it makes a board sent to somebody else
   arrive with its pictures instead of with dead links.

   This reverses the link-not-copy rule §4m used to state, and the reason it
   gave — a note holding a stale copy of a model is worse than no note — is
   still true of a working document. It is not true of the screenshot, the clip
   or the scan that most drops actually are, and it was never true of a board
   you wanted to send anywhere. The original is never touched, moved or locked.

   Nothing here deletes. A board's folder outlives the board, because deleting
   a board puts its notes in the bin and the bin is meant to be reversible —
   taking the pictures out from under it would make that a half-recovery. */
const FILES_DIR = path.join(PATHS.userData, 'files');

/* A board id is made by uid() and is already [a-z0-9]+, but it arrives here
   from a file that anything could have written, so it is treated as untrusted
   and reduced to one path segment. */
const boardDir = (boardId) =>
  path.join(FILES_DIR, String(boardId || 'loose').replace(/[^\w-]/g, '_').slice(0, 48) || 'loose');

/* One path segment: no separators, no leading or trailing dots, none of the
   characters Windows refuses, and not a reserved device name. The extension is
   kept deliberately — it is what decides whether main will open the file at
   all (see OPENABLE), so dropping it would quietly turn a document into
   something only Explorer can reach. */
function safeName(name) {
  let n = String(name || '').replace(/[\\/]/g, '_').replace(/[:*?"<>|]/g, '_');
  n = n.replace(/[\x00-\x1f]/g, '').replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(n)) n = '_' + n;
  if (!n) n = 'file';
  if (n.length > 90) {
    const ext = path.extname(n).slice(0, 12);
    n = n.slice(0, 90 - ext.length) + ext;
  }
  return n;
}

/* `name`, then `name (2)`, then `name (3)`. Never overwrite: two files called
   screenshot.png from two different folders are two different files, and the
   second silently replacing the first is a picture disappearing out of a note
   written months ago. */
function freeName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length) || 'file';
  let n = name;
  for (let i = 2; i < 500 && fs.existsSync(path.join(dir, n)); i++) n = base + ' (' + i + ')' + ext;
  return n;
}

const MAX_ATTACH = 2 * 1024 * 1024 * 1024;      // 2 GB — a video, not a disk image

// is `p` already inside our own files folder?
function isOurs(p) {
  try {
    const root = path.resolve(FILES_DIR) + path.sep;
    return path.resolve(p).toLowerCase().startsWith(root.toLowerCase());
  } catch (_) { return false; }
}

/* Copy one file into a board's folder and hand back the URL to store.

   Async, and that is not incidental: a copy is the one disk operation here
   that can genuinely take a while, and blocking the renderer for the length of
   a video copy is exactly the stall saveBoardAsync() exists to avoid. */
async function attachFile(srcPath, boardId, suggested) {
  try {
    const src = String(srcPath || '');
    if (!src) return { error: 'no file' };
    /* Already ours — a file dragged from one note to another, or a board
       re-importing its own attachment. Copying would leave a second identical
       file behind on every drop. */
    if (isOurs(src)) {
      return { url: pathToFileURL(src).href, name: path.basename(src), path: src, reused: true };
    }
    const st = await fsp.stat(src);
    if (!st.isFile()) return { error: 'not a file' };
    if (st.size > MAX_ATTACH) return { error: 'too big' };
    const dir = boardDir(boardId);
    await fsp.mkdir(dir, { recursive: true });
    const name = freeName(dir, safeName(suggested || path.basename(src)));
    const dest = path.join(dir, name);
    await fsp.copyFile(src, dest);
    return { url: pathToFileURL(dest).href, name, path: dest };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/* The same, for bytes the renderer already holds — a pasted screenshot has no
   path because it has never been a file. This is what keeps a 6 MB data URL
   out of the board file, which is the single largest thing a board carries. */
async function attachBytes(dataUrl, boardId, suggested) {
  try {
    const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
    if (!m) return { error: 'not a data url' };
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_ATTACH) return { error: 'too big' };
    const dir = boardDir(boardId);
    await fsp.mkdir(dir, { recursive: true });
    const name = freeName(dir, safeName(suggested || 'pasted'));
    const dest = path.join(dir, name);
    await fsp.writeFile(dest, buf);
    return { url: pathToFileURL(dest).href, name, path: dest };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/* Attachments that arrived with somebody else's board.

   The rule is one line and it is what makes a board portable: **a board file's
   attachments live in a `files/` folder beside it.** That is exactly the shape
   backupTo() writes, so a backup folder is the transportable unit — copy it to
   a stick, drop the .json on another machine, and the pictures come too.

   `urls` are the file: URLs found in the incoming board. Each is looked for at
   `<beside>/files/<theirBoardId>/<name>` and then anywhere under
   `<beside>/files/` by name, and whatever turns up is copied into the folder of
   the board being created. Anything not found is left exactly as it was: a link
   that does not resolve is honest, and rewriting it to something that does not
   exist either would only hide that. */
async function adoptAttachments(besidePath, urls, boardId) {
  const map = {};
  let copied = 0;
  try {
    const root = path.join(path.dirname(String(besidePath || '')), 'files');
    if (!fs.existsSync(root)) return { map, copied };
    let index = null;
    const findByName = (name) => {
      if (!index) {
        index = new Map();
        for (const sub of fs.readdirSync(root, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          for (const f of fs.readdirSync(path.join(root, sub.name))) {
            if (!index.has(f)) index.set(f, path.join(root, sub.name, f));
          }
        }
      }
      return index.get(name) || null;
    };
    for (const url of (urls || [])) {
      try {
        const p = fileURLToPath(url);
        const name = path.basename(p);
        const theirs = path.basename(path.dirname(p));
        const exact = path.join(root, theirs, name);
        const found = fs.existsSync(exact) ? exact : findByName(name);
        if (!found) continue;
        const r = await attachFile(found, boardId, name);
        if (r && r.url) { map[url] = r.url; copied++; }
      } catch (_) { /* not a file: URL we can resolve — leave it alone */ }
    }
  } catch (_) {}
  return { map, copied };
}

/* ---------- files nothing points at any more ----------------------------
   Attachments are never removed on their own — a board's folder outlives the
   board, because deleting a board puts its notes in the bin and the bin is
   meant to be reversible. The price is that a folder slowly fills with files
   no note mentions: emptied bins, deleted notes, a video dropped by mistake.
   This is the one thing that clears them, and it only ever runs because
   somebody asked it to.

   **The renderer says what to keep, never what to delete.** It hands over every
   file: URL it can still see and this works out the difference; no path crosses
   the bridge as an instruction. So the worst a confused caller can do is keep
   too much, and a caller that has gone wrong in the other direction — one that
   forgot a board — is guarded against in `cleanUpFiles()` on the far side,
   which refuses to run at all while any board's contents are unreadable.

   `apply` is the whole difference between the count in the dialog and the
   deletion. The scan is identical either way, so what the dialog promises and
   what happens cannot drift. */
function cleanupFiles(keepUrls, apply) {
  const kept = new Set();
  for (const u of (keepUrls || [])) {
    /* Compared as resolved paths, not as URL strings. The same file can be
       written `file:///C:/x/a%20b.png` or `file:///C:/x/a b.png` depending on
       who wrote it, and a string compare would call one of those unused. */
    try { kept.add(path.resolve(fileURLToPath(u)).toLowerCase()); } catch (_) {}
  }
  const out = { files: 0, bytes: 0, names: [], error: '' };
  try {
    if (!fs.existsSync(FILES_DIR)) return out;
    for (const sub of fs.readdirSync(FILES_DIR, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const dir = path.join(FILES_DIR, sub.name);
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          if (kept.has(path.resolve(full).toLowerCase())) continue;
          out.files++;
          out.bytes += st.size;
          if (out.names.length < 12) out.names.push(name);
          /* Deleted, not moved to a holding pen. The board's own bin is the
             undo for a note; this is the sweep that runs after you have already
             emptied that, and a second bin nobody empties is how the problem
             this solves came back. The confirm dialog says so. */
          if (apply) fs.rmSync(full, { force: true });
        } catch (_) {}
      }
      // an empty folder left behind by the sweep is just noise
      if (apply) { try { if (!fs.readdirSync(dir).length) fs.rmdirSync(dir); } catch (_) {} }
    }
  } catch (err) {
    out.error = String((err && err.message) || err);
  }
  return out;
}

/* Everything a board carries, for the backup and for the folder view. */
function listAttachments(boardId) {
  try {
    const dir = boardDir(boardId);
    return fs.readdirSync(dir).map((f) => {
      try {
        const st = fs.statSync(path.join(dir, f));
        return { name: f, size: st.size, url: pathToFileURL(path.join(dir, f)).href };
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
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
  /* Board *and* the files its boards carry. The renderer says which board
     folders to bring; main writes the JSON, copies the folders beside it and
     prunes the old sets. A backup folder is then the whole board, portable —
     which is what adoptAttachments() above reads on the way back in. */
  backupTo: (dir, json, name, boardIds) =>
    ipcRenderer.invoke('file:backup', dir, json, name, boardIds || [], FILES_DIR)
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
  /* Show me where this actually is. Separate from openLocal because "open
     it" and "where is it" are different questions, and this one can never
     run anything: main answers it with showItemInFolder and nothing else,
     whatever it is handed. */
  revealLocal: (url) => ipcRenderer.send('shell:reveal-local', url),

  /* ---- the files a board carries; see the block above ---- */
  attach: (srcPath, boardId, name) => attachFile(srcPath, boardId, name),
  attachBytes: (dataUrl, boardId, name) => attachBytes(dataUrl, boardId, name),
  adoptAttachments: (beside, urls, boardId) => adoptAttachments(beside, urls, boardId),
  listAttachments: (boardId) => listAttachments(boardId),
  /* Two calls with one implementation: `apply:false` counts, `apply:true`
     removes. The renderer passes the URLs it still wants *kept* — it never
     names a file to delete. See the block above. */
  unusedFiles: (keepUrls) => cleanupFiles(keepUrls, false),
  removeUnusedFiles: (keepUrls) => cleanupFiles(keepUrls, true),
  filesDir: (boardId) => (boardId ? boardDir(boardId) : FILES_DIR),
  // the board's own folder, so "where does the app keep this?" is answerable
  openFilesDir: (boardId) => ipcRenderer.send('shell:open-path', boardId ? boardDir(boardId) : FILES_DIR),
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
