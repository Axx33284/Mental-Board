/* Mental Board — preload.
   The single bridge between the renderer and the machine. Everything the
   renderer can do to disk, the shell or the window is on one of the five
   globals below; there is no other route.

   Since 2.0 this file does no disk work of its own. The store — the My Boards
   folder, the atomic writes, the files a board carries — lives in
   src/store.js and runs in main, so the id→folder map that mbf:// URLs are
   served from is in one process and cannot drift. What is left here is a
   list of IPC calls, and the two that are synchronous are synchronous for a
   reason: `load()` runs before anything is drawn, and `save()` runs on
   `beforeunload`, where a promise never settles. */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const PATHS = ipcRenderer.sendSync('store:paths');   // { root, userData, exeDir, version }

contextBridge.exposeInMainWorld('mbData', {
  /* { root, settings: { data, status }, boards: [{ id, renamedFrom, dir, group,
     data, status, from }] }. Every `status` is 'ok' | 'empty' | 'unreadable',
     and 'unreadable' means a file IS there and must never be written over —
     see store.readWithBackup(). */
  load: () => ipcRenderer.sendSync('store:load'),
  /* payload = { settings: json|null, boards: [{ id, name, group, json }] }.
     Both return { ok, errors: [{ id, error }], dirs } — per board, never a
     bare boolean, never thrown — and the renderer has to act on it. `save`
     blocks and is for the way out; `saveAsync` is for everything else. */
  save: (payload) => ipcRenderer.sendSync('store:save-sync', payload),
  saveAsync: (payload) => ipcRenderer.invoke('store:save', payload),
  /* { ok, path } / { ok: true, skipped: true } / { ok: false, error } */
  snapshot: (id, json, day) => ipcRenderer.sendSync('store:snapshot', id, json, day),
  versionSnapshot: (id, json, label) => ipcRenderer.sendSync('store:version-snapshot', id, json, label),
  paths: () => ({ ...PATHS }),
  openDataFolder: () => ipcRenderer.send('shell:open-data-folder'),
  openBoardFolder: (id) => ipcRenderer.send('shell:open-board-dir', id || ''),
  /* A mirror of the whole My Boards folder somewhere else. `pickBackupDir`
     asks once; `backupTo` copies what is new or changed. Both return null /
     { error } rather than throwing. */
  pickBackupDir: () => ipcRenderer.invoke('file:backup-dir'),
  backupTo: (dir) => ipcRenderer.invoke('file:backup', dir),
  /* A complete dated copy wherever the user points (asks where itself), and
     the way to start again: everything to the Recycle Bin, then an empty
     store. `tally` is what the confirm dialog counts. */
  backupAll: () => ipcRenderer.invoke('file:backup-all'),
  tally: () => ipcRenderer.sendSync('store:tally'),
  eraseAll: () => ipcRenderer.invoke('store:erase-all'),
  /* Whole boards. `exportBoard` asks where and copies the folder there;
     `importBoard` asks for a board.json and reads it, handing back where it
     was so `adoptFiles` can bring its pictures in. */
  exportBoard: (id, name) => ipcRenderer.invoke('board:export', id, name),
  importBoard: () => ipcRenderer.invoke('board:import'),
  readExternal: (p) => ipcRenderer.invoke('board:read-external', p),
  adoptFiles: (beside, urls, toId) => ipcRenderer.invoke('board:adopt-files', beside, urls, toId),
  /* JSON Canvas (Obsidian). pickCanvasPath asks where; writeCanvas writes the
     JSON and copies the named files into `folder` beside it. importCanvas
     asks for one and reads it; readCanvas reads a dropped one; resolveCanvas
     finds the files it names. See js/canvas.js. */
  pickCanvasPath: (suggested) => ipcRenderer.invoke('canvas:pick-save', suggested),
  writeCanvas: (file, json, id, names, folder) => ipcRenderer.invoke('canvas:write', file, json, id, names, folder),
  importCanvas: () => ipcRenderer.invoke('canvas:import'),
  readCanvas: (p) => ipcRenderer.invoke('canvas:read', p),
  resolveCanvas: (dir, rels) => ipcRenderer.invoke('canvas:resolve', dir, rels),
  /* Samsung Notes. pickSamsung asks for files (an .sdocx, or a PDF, picture or
     .txt it exported) and hands back paths; readSamsung reads one for a board,
     writing the pictures in it into that board's folder. See js/samsung.js. */
  pickSamsung: () => ipcRenderer.invoke('samsung:pick'),
  readSamsung: (p, boardId) => ipcRenderer.invoke('samsung:read', p, boardId),
  duplicateFiles: (fromId, toId, name, group) => ipcRenderer.invoke('board:duplicate-files', fromId, toId, name, group),
  removeBoardDir: (id) => ipcRenderer.invoke('board:remove-dir', id)
});

contextBridge.exposeInMainWorld('mbFiles', {
  /* A dropped File → its real path, or '' for a File the clipboard made (a
     pasted screenshot has never been a file). The renderer takes the bytes
     the other way in that case — see takeFileIn(). */
  pathOf: (file) => { try { return webUtils.getPathForFile(file) || ''; } catch (_) { return ''; } },
  // a path, not a URL: the renderer attaches it so the note owns its copy
  pickImage: (purpose) => ipcRenderer.invoke('file:pick-image', purpose || ''),
  pickVideo: () => ipcRenderer.invoke('file:pick-video'),
  /* Write a canvas out as a real PNG. null when cancelled, { path } when it
     landed, { error } when it did not — and the renderer acts on which. */
  savePng: (dataUrl, suggested) => ipcRenderer.invoke('file:save-image', dataUrl, suggested),
  describeEmbed: (kind, id) => ipcRenderer.invoke('embed:describe', kind, id),
  playerUrl: (kind, id) => ipcRenderer.invoke('embed:player-url', kind, id),
  openExternal: (url) => ipcRenderer.send('shell:open-external', url),
  /* A document on this machine — mbf:// or file://. Main vets the extension
     and reveals rather than opens anything it does not recognise. */
  openLocal: (url) => ipcRenderer.send('shell:open-local', url),
  // "show me where it is": showItemInFolder and nothing else
  revealLocal: (url) => ipcRenderer.send('shell:reveal-url', url),

  /* ---- the files a board carries; see store.js ---- */
  attach: (srcPath, boardId, name) => ipcRenderer.invoke('files:attach', srcPath, boardId, name),
  attachBytes: (dataUrl, boardId, name) => ipcRenderer.invoke('files:attach-bytes', dataUrl, boardId, name),
  // copy the files behind these URLs into another board; returns { map, copied }
  carry: (urls, toId) => ipcRenderer.invoke('files:carry', urls, toId),
  listAttachments: (boardId) => ipcRenderer.sendSync('files:list', boardId),
  /* Two calls, one scan: `unusedFiles` counts, `removeUnusedFiles` removes.
     The renderer passes the URLs it still wants KEPT — it never names a file
     to delete. */
  unusedFiles: (keepUrls, onlyId) => ipcRenderer.invoke('files:unused', keepUrls, onlyId || ''),
  removeUnusedFiles: (keepUrls, onlyId) => ipcRenderer.invoke('files:remove-unused', keepUrls, onlyId || ''),
  filesDir: (boardId) => ipcRenderer.sendSync('files:dir', boardId || ''),
  openFilesDir: (boardId) => ipcRenderer.send('shell:open-board-dir', boardId || ''),
  /* An image back as a data URL, for the studio: a picture from another
     origin taints a canvas, and a tainted canvas refuses toDataURL(). */
  readImage: (url) => ipcRenderer.sendSync('files:read-image', url)
});

contextBridge.exposeInMainWorld('mbWin', {
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggle-maximize'),
  close: () => ipcRenderer.send('win:close'),
  // Ctrl+Q: main hears the key, the page saves, then this ends the app (2.5.1)
  quit: () => ipcRenderer.send('win:quit'),
  onQuitKey: (cb) => ipcRenderer.on('win:quit-key', () => cb()),
  show: () => ipcRenderer.send('win:show'),
  /* Whether closing the window should hide it to the tray or end the app. The
     renderer owns the setting; this is how main is told. */
  setBackground: (on) => ipcRenderer.send('win:background', !!on),
  /* The `main.` slice of the catalogue, resolved: the tray, the notification
     and every native dialog title. Sent on boot and on every language change. */
  setStrings: (table) => ipcRenderer.send('win:strings', table),
  isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
  onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(v)),
  onCapture: (cb) => ipcRenderer.on('capture:open', () => cb()),
  /* Spelling: what Chromium found under a right-click in a note being edited
     ({ word, suggestions }), and the word to stop calling wrong. See menus.js. */
  onSpell: (cb) => ipcRenderer.on('spell:menu', (_e, v) => cb(v)),
  learnWord: (w) => ipcRenderer.send('spell:learn', String(w || ''))
});

contextBridge.exposeInMainWorld('mbTheme', {
  set: (theme) => ipcRenderer.send('theme:set', theme),
  isDark: () => ipcRenderer.invoke('theme:dark'),
  onSystemChange: (cb) => ipcRenderer.on('theme:system-changed', (_e, dark) => cb(dark))
});

/* What the machine is. `software` is true when Chromium is compositing
   without a GPU — the one thing the renderer cannot find out for itself — and
   it is what turns the graphics mode down without being asked. */
contextBridge.exposeInMainWorld('mbSys', {
  info: () => ipcRenderer.sendSync('sys:info')
});

/* A phone as a drawing tablet (2.2, src/tablet.js, MAP.md §4w). `start` opens
   the pairing and resolves { ok, url, qr, address, addresses, until } or
   { ok: false, error }; the renderer is never told the token by any other
   route and cannot choose a port. `onState` hears waiting / connected / away /
   off, `onMessage` hears the phone's strokes, already checked in main. `send`
   tells the phone the window's shape and colours — nothing else gets through. */
contextBridge.exposeInMainWorld('mbPad', {
  start: (address) => ipcRenderer.invoke('pad:start', address || ''),
  stop: () => ipcRenderer.send('pad:stop'),
  send: (msg) => ipcRenderer.send('pad:send', msg),
  addresses: () => ipcRenderer.invoke('pad:addresses'),
  // photograph this region of the window for the phone; resolves { sent }
  frame: (req) => ipcRenderer.invoke('pad:frame', req),
  onState: (cb) => ipcRenderer.on('pad:state', (_e, s) => cb(s)),
  onMessage: (cb) => ipcRenderer.on('pad:msg', (_e, m) => cb(m))
});
