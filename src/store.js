/* Mental Board — store.js
   The "My Boards" folder. Runs in the main process (required by main.js);
   the renderer reaches it through preload.js and nothing else.

   Everything the user makes lives under one folder they can find, open and
   copy:

       Documents\My Boards\
         settings.json              how the app is set up, the board order
         <Board name>\              one folder per board
           board.json               the notes, frames, ropes and view
           board.bak.json           the previous good copy
           files\                   every picture, clip and document it carries
         <Group>\<Board name>\      a board inside a group ("Move to…")
         Trash\                     the bin — an ordinary board
         Backups\<Board name>\      one dated copy of a board per day

   Delete the folder and the app starts as if it had just been installed.
   Copy a board's folder anywhere and it is the whole board — the notes point
   at their files through `mbf://<boardId>/<name>`, which main serves from
   that board's own `files\`, so nothing in a note names a path on this disk.

   Two rules carried over from the 1.x store, because both were learned the
   hard way:
   - every write is atomic: .tmp → copy current to .bak → rename over the top;
   - every call returns a status ({ ok, error } or { error }), never throws,
     and the caller has to act on it. */
'use strict';
const fs = require('fs');
const path = require('path');
const fsp = fs.promises;
const { pathToFileURL, fileURLToPath } = require('url');

const SETTINGS = 'settings.json';
const BOARD = 'board.json';
const BAK = 'board.bak.json';
const FILES = 'files';
const BACKUPS = 'Backups';           // reserved: never a group or a board
const RESERVED_DIRS = new Set([BACKUPS.toLowerCase()]);

let root = '';
/* boardId -> absolute board folder. Built by scan(), kept current by every
   call that makes, renames, moves or removes a folder. The mbf:// handler in
   main reads it, so it has to be right *now*, not at the next scan. */
const dirs = new Map();
/* boardId -> { name, group } the folder was last laid out for, so a save can
   tell a rename or a move from an ordinary write. */
const laidOut = new Map();

/* ---------- tiny helpers ---------- */
function readJson(file) {
  try {
    let raw = fs.readFileSync(file, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);   // Notepad's BOM
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch (_) { return null; }
}
const exists = (p) => { try { return fs.existsSync(p); } catch (_) { return false; } };
const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } };
const errMsg = (err) => String((err && err.message) || err);

/* One folder name: no separators, none of the characters Windows refuses, no
   leading/trailing dots or spaces, not a reserved device name, not too long.
   Unlike a file name the extension is not special here. */
function safeSeg(name, fallback) {
  let n = String(name || '').replace(/[\\/]/g, '-').replace(/[:*?"<>|]/g, '')
    .replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n)) n = '_' + n;
  if (n.length > 60) n = n.slice(0, 60).trim();
  return n || (fallback == null ? 'Board' : fallback);
}
/* A file name keeps its extension, because the extension is what decides
   whether main will open it at all (see OPENABLE in main.js). */
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
/* `name`, `name (2)`, `name (3)` — never overwrite. */
function freeName(dir, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length) || 'file';
  let n = name;
  for (let i = 2; i < 1000 && exists(path.join(dir, n)); i++) n = `${base} (${i})${ext}`;
  return n;
}
function freeDir(parent, base) {
  let n = base;
  for (let i = 2; i < 1000 && exists(path.join(parent, n)); i++) n = `${base} (${i})`;
  return n;
}
const idSeg = (id) => String(id || '').replace(/[^\w-]/g, '_').slice(0, 48);
const fileUrl = (id, name) => `mbf://${idSeg(id).toLowerCase()}/${encodeURIComponent(name)}`;

/* Parse one of ours. `mbf://<id>/<name>` → { id, name }, else null. */
function parseFileUrl(url) {
  const m = /^mbf:\/\/([\w-]+)\/([^?#]+)$/i.exec(String(url || ''));
  if (!m) return null;
  try { return { id: m[1].toLowerCase(), name: decodeURIComponent(m[2]) }; }
  catch (_) { return null; }
}

/* Atomic writes. Two scratch names, because the sync writer (the way out) and
   the async one (every other save) can overlap on the same file; each renames
   its own tmp, and the last rename — the sync one, with the newer bytes —
   wins. */
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  const bak = file.replace(/\.json$/, '.bak.json');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, text, 'utf8');
    try { if (exists(file)) fs.copyFileSync(file, bak); } catch (_) {}
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) {}
    return { ok: false, error: errMsg(err) };
  }
}
async function writeAtomicAsync(file, text) {
  const tmp = file + '.async.tmp';
  const bak = file.replace(/\.json$/, '.bak.json');
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(tmp, text, 'utf8');
    try { await fsp.copyFile(file, bak); } catch (_) { /* first write */ }
    await fsp.rename(tmp, file);
    return { ok: true };
  } catch (err) {
    try { await fsp.rm(tmp, { force: true }); } catch (_) {}
    return { ok: false, error: errMsg(err) };
  }
}

/* Read a file, or its .bak. Three answers, and the third is the one that
   matters: 'unreadable' means a file IS there and would not parse, and nothing
   may ever be written over it. Collapsing that into 'empty' is how one locked
   or half-copied file becomes permanent loss — the app treats it as a first
   run and saves emptiness over it. */
function readWithBackup(file) {
  const bak = file.replace(/\.json$/, '.bak.json');
  const data = readJson(file);
  if (data) return { data, status: 'ok', from: 'file' };
  const b = readJson(bak);
  if (b) return { data: b, status: 'ok', from: 'backup' };
  return { data: null, status: (exists(file) || exists(bak)) ? 'unreadable' : 'empty' };
}

/* Copy a folder. Returns the file count. */
function copyDir(from, to, skip) {
  let n = 0;
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip && skip(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) n += copyDir(a, b, null);
    else if (e.isFile()) { fs.copyFileSync(a, b); n++; }
  }
  return n;
}

/* ---------- the root ---------- */
function init(rootPath) {
  root = rootPath;
  try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
  return root;
}
const rootDir = () => root;
const settingsFile = () => path.join(root, SETTINGS);
const backupsDir = () => path.join(root, BACKUPS);
const boardDir = (id) => dirs.get(String(id || '').toLowerCase()) || '';
const filesDir = (id) => { const d = boardDir(id); return d ? path.join(d, FILES) : ''; };

/* Where a board named `name` in `group` should live. */
function wantedDir(name, group) {
  const g = safeSeg(group, '');
  const parent = (g && !RESERVED_DIRS.has(g.toLowerCase())) ? path.join(root, g) : root;
  return { parent, base: safeSeg(name, 'Board') };
}

/* ---------- scanning ----------
   A board is any folder holding a board.json, at the top level or one level
   down inside a group. The Backups folder is skipped by name. Nothing else
   in the tree is read, so a stray file the user drops in does no harm. */
function scan() {
  dirs.clear();
  laidOut.clear();
  const out = { root, settings: null, boards: [] };
  out.settings = readWithBackup(settingsFile());
  /* A settings file that will not parse is set aside under a dated name, not
     written over: the next save would otherwise copy the broken file to .bak
     and the one chance of reading it by hand would be gone. Losing settings
     is a nuisance; a board is what the no-write rule is for. */
  if (out.settings.status === 'unreadable') {
    try { fs.renameSync(settingsFile(), path.join(root, `settings.broken-${Date.now()}.json`)); } catch (_) {}
  }

  const seen = new Set();
  const take = (dir, group) => {
    const r = readWithBackup(path.join(dir, BOARD));
    if (r.status === 'empty') return;
    let id = r.data && typeof r.data.id === 'string' ? r.data.id.toLowerCase() : '';
    /* No id, or a copied folder wearing another board's id: give it one. The
       id is what the files are addressed by, so the board's own file URLs are
       rewritten by the renderer when it sees `renamedFrom`. */
    let renamedFrom = '';
    if (!id || seen.has(id) || !/^[\w-]+$/.test(id)) {
      renamedFrom = id;
      id = newId();
    }
    seen.add(id);
    dirs.set(id, dir);
    laidOut.set(id, { name: path.basename(dir), group });
    out.boards.push({ id, renamedFrom, dir, group, data: r.data, status: r.status, from: r.from || '' });
  };
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) {}
  for (const e of entries) {
    if (!e.isDirectory() || RESERVED_DIRS.has(e.name.toLowerCase())) continue;
    const dir = path.join(root, e.name);
    if (exists(path.join(dir, BOARD)) || exists(path.join(dir, BAK))) { take(dir, ''); continue; }
    let subs = [];
    try { subs = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) {}
    for (const s of subs) {
      if (!s.isDirectory()) continue;
      const sub = path.join(dir, s.name);
      if (exists(path.join(sub, BOARD)) || exists(path.join(sub, BAK))) take(sub, e.name);
    }
  }
  return out;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- laying a board out on disk ----------
   Makes the folder for a board that has none, and renames or moves one whose
   name or group changed. A rename that fails — Explorer has the folder open,
   say — is not an error: the board keeps its old folder and the next save
   tries again. The id→folder map is what the app trusts; the folder name is
   for the human. */
function ensureDir(id, name, group) {
  const key = String(id || '').toLowerCase();
  if (!key) return { error: 'no id' };
  const want = wantedDir(name, group);
  const cur = dirs.get(key);
  if (!cur) {
    try {
      fs.mkdirSync(want.parent, { recursive: true });
      const dir = path.join(want.parent, freeDir(want.parent, want.base));
      fs.mkdirSync(dir, { recursive: true });
      dirs.set(key, dir);
      laidOut.set(key, { name, group });
      return { dir, made: true };
    } catch (err) { return { error: errMsg(err) }; }
  }
  const was = laidOut.get(key) || {};
  if (was.name === name && was.group === group) return { dir: cur };
  // the folder it would get if made fresh; keep the current one if that is it
  const curParent = path.dirname(cur), curBase = path.basename(cur);
  const sameParent = path.resolve(curParent).toLowerCase() === path.resolve(want.parent).toLowerCase();
  const sameBase = curBase.toLowerCase() === want.base.toLowerCase() ||
                   new RegExp('^' + want.base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\(\\d+\\)$', 'i').test(curBase);
  if (sameParent && sameBase) { laidOut.set(key, { name, group }); return { dir: cur }; }
  try {
    fs.mkdirSync(want.parent, { recursive: true });
    const dest = path.join(want.parent, freeDir(want.parent, want.base));
    fs.renameSync(cur, dest);
    dirs.set(key, dest);
    laidOut.set(key, { name, group });
    // an emptied group folder is noise
    if (!sameParent) { try { if (curParent !== root && !fs.readdirSync(curParent).length) fs.rmdirSync(curParent); } catch (_) {} }
    return { dir: dest, moved: true };
  } catch (err) {
    return { dir: cur, moveError: errMsg(err) };
  }
}

/* ---------- saving ----------
   payload = { settings: json|null, boards: [{ id, name, group, json }] }
   Returns { ok, errors: [{ id, error }], dirs: { id: dir } } — per board, so
   one board's folder being read-only does not stop the others landing, and the
   renderer knows exactly which ones did. */
function saveAll(payload) {
  const out = { ok: true, errors: [], dirs: {} };
  const p = payload || {};
  if (typeof p.settings === 'string') {
    const r = writeAtomic(settingsFile(), p.settings);
    if (!r.ok) { out.ok = false; out.errors.push({ id: '', error: r.error }); }
  }
  for (const b of (Array.isArray(p.boards) ? p.boards : [])) {
    const d = ensureDir(b.id, b.name, b.group);
    if (!d.dir) { out.ok = false; out.errors.push({ id: b.id, error: d.error || '?' }); continue; }
    const r = writeAtomic(path.join(d.dir, BOARD), b.json);
    if (!r.ok) { out.ok = false; out.errors.push({ id: b.id, error: r.error }); }
    out.dirs[b.id] = d.dir;
  }
  return out;
}
let chain = Promise.resolve();
function saveAllAsync(payload) {
  const run = async () => {
    const out = { ok: true, errors: [], dirs: {} };
    const p = payload || {};
    if (typeof p.settings === 'string') {
      const r = await writeAtomicAsync(settingsFile(), p.settings);
      if (!r.ok) { out.ok = false; out.errors.push({ id: '', error: r.error }); }
    }
    for (const b of (Array.isArray(p.boards) ? p.boards : [])) {
      const d = ensureDir(b.id, b.name, b.group);      // sync, but it is one mkdir/rename
      if (!d.dir) { out.ok = false; out.errors.push({ id: b.id, error: d.error || '?' }); continue; }
      const r = await writeAtomicAsync(path.join(d.dir, BOARD), b.json);
      if (!r.ok) { out.ok = false; out.errors.push({ id: b.id, error: r.error }); }
      out.dirs[b.id] = d.dir;
    }
    return out;
  };
  chain = chain.then(run, run);
  return chain;
}

/* ---------- snapshots ----------
   Backups\<Board name>\<day>.json — one per board per day, newest 14 kept —
   and Backups\<Board name>\before-<version>.json, kept apart so it never
   ages out. Keyed by the folder's current name so a person can find it. */
const KEEP_DAYS = 14;
function snapshotDir(id) {
  const d = boardDir(id);
  return path.join(backupsDir(), d ? path.basename(d) : idSeg(id));
}
function snapshot(id, json, day) {
  try {
    const dir = snapshotDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${String(day).replace(/[^\d-]/g, '')}.json`);
    if (exists(file)) return { ok: true, skipped: true, path: file };
    fs.writeFileSync(file, json, 'utf8');
    const old = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (old.length > KEEP_DAYS) { try { fs.unlinkSync(path.join(dir, old.shift())); } catch (_) {} }
    return { ok: true, path: file };
  } catch (err) { return { ok: false, error: errMsg(err) }; }
}
function versionSnapshot(id, json, label) {
  try {
    const dir = snapshotDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `before-${String(label || 'unknown').replace(/[^\w.\-]/g, '_')}.json`);
    if (exists(file)) return { ok: true, skipped: true, path: file };
    fs.writeFileSync(file, json, 'utf8');
    return { ok: true, path: file };
  } catch (err) { return { ok: false, error: errMsg(err) }; }
}

/* ---------- the files a board carries ---------- */
const MAX_ATTACH = 2 * 1024 * 1024 * 1024;      // 2 GB — a video, not a disk image

/* The absolute path behind an mbf:// URL, or '' — and only ever a path inside
   that board's own files folder, whatever the name tried to say. */
function resolveFile(id, name) {
  const dir = filesDir(id);
  if (!dir) return '';
  const p = path.resolve(dir, safeName(name));
  if (!p.toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep)) return '';
  return exists(p) ? p : '';
}
function isInside(p, dir) {
  try { return path.resolve(p).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep); }
  catch (_) { return false; }
}

async function attachFile(srcPath, id, suggested) {
  try {
    const src = String(srcPath || '');
    if (!src) return { error: 'no file' };
    const key = String(id || '').toLowerCase();
    if (!boardDir(key)) return { error: 'no board' };
    const dir = filesDir(key);
    // already this board's own file — a picture dragged from one note to another
    if (isInside(src, dir)) return { url: fileUrl(key, path.basename(src)), name: path.basename(src), path: src, reused: true };
    const st = await fsp.stat(src);
    if (!st.isFile()) return { error: 'not a file' };
    if (st.size > MAX_ATTACH) return { error: 'too big' };
    await fsp.mkdir(dir, { recursive: true });
    const name = freeName(dir, safeName(suggested || path.basename(src)));
    const dest = path.join(dir, name);
    await fsp.copyFile(src, dest);
    return { url: fileUrl(key, name), name, path: dest };
  } catch (err) { return { error: errMsg(err) }; }
}
async function attachBytes(dataUrl, id, suggested) {
  try {
    const m = /^data:([\w.+-]+\/[\w.+-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''));
    if (!m) return { error: 'not a data url' };
    const key = String(id || '').toLowerCase();
    if (!boardDir(key)) return { error: 'no board' };
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_ATTACH) return { error: 'too big' };
    const dir = filesDir(key);
    await fsp.mkdir(dir, { recursive: true });
    const name = freeName(dir, safeName(suggested || 'pasted.png'));
    const dest = path.join(dir, name);
    await fsp.writeFile(dest, buf);
    return { url: fileUrl(key, name), name, path: dest };
  } catch (err) { return { error: errMsg(err) }; }
}
function listFiles(id) {
  try {
    const dir = filesDir(id);
    if (!dir) return [];
    return fs.readdirSync(dir).map((f) => {
      try {
        const st = fs.statSync(path.join(dir, f));
        return st.isFile() ? { name: f, size: st.size, url: fileUrl(id, f) } : null;
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}

/* Files travelling with notes from one board to another: the drag onto a rail
   tile, a delete into the bin, a put-back out of it. Copied, never moved —
   another note on the source board may still show the same picture. Returns
   a map of old URL → new URL for the renderer to write through the markup. */
async function carryFiles(urls, toId) {
  const map = {};
  let copied = 0;
  const to = String(toId || '').toLowerCase();
  if (!boardDir(to)) return { map, copied };
  for (const url of (Array.isArray(urls) ? urls : [])) {
    const ref = parseFileUrl(url);
    if (!ref || ref.id === to) continue;
    const src = resolveFile(ref.id, ref.name);
    if (!src) continue;
    const r = await attachFile(src, to, ref.name);
    if (r && r.url) { map[url] = r.url; copied++; }
  }
  return { map, copied };
}

/* Files nothing points at. The renderer says what to KEEP; this works out the
   difference inside each board's own files folder and removes only there.
   `apply:false` counts, `apply:true` removes — one scan, two uses, so what the
   dialog promises and what happens cannot drift. */
function cleanup(keepUrls, apply, onlyId) {
  const kept = new Set();
  for (const u of (keepUrls || [])) {
    const ref = parseFileUrl(u);
    if (ref) kept.add(ref.id + '/' + ref.name.toLowerCase());
  }
  const out = { files: 0, bytes: 0, names: [], error: '' };
  try {
    for (const [id, dir] of dirs) {
      if (onlyId && id !== String(onlyId).toLowerCase()) continue;
      const fd = path.join(dir, FILES);
      if (!isDir(fd)) continue;
      for (const name of fs.readdirSync(fd)) {
        const full = path.join(fd, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) continue;
          if (kept.has(id + '/' + name.toLowerCase())) continue;
          out.files++; out.bytes += st.size;
          if (out.names.length < 12) out.names.push(name);
          if (apply) fs.rmSync(full, { force: true });
        } catch (_) {}
      }
    }
  } catch (err) { out.error = errMsg(err); }
  return out;
}

const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml'
};
/* A picture as a data URL, for the studio: an image from another origin
   taints a canvas, and a tainted canvas refuses toDataURL(). */
function readImage(url) {
  try {
    const u = String(url || '');
    if (/^data:/i.test(u)) return u;
    let p = '';
    const ref = parseFileUrl(u);
    if (ref) p = resolveFile(ref.id, ref.name);
    else if (/^file:/i.test(u)) p = fileURLToPath(u);
    if (!p) return null;
    const mime = IMG_MIME[path.extname(p).toLowerCase()];
    if (!mime) return null;
    if (fs.statSync(p).size > 40 * 1024 * 1024) return null;
    return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
  } catch (_) { return null; }
}
// the real path behind an mbf:// or file:// URL, for "show me where it is"
function pathOfUrl(url) {
  const u = String(url || '');
  const ref = parseFileUrl(u);
  if (ref) return resolveFile(ref.id, ref.name);
  if (/^file:/i.test(u)) { try { return fileURLToPath(u); } catch (_) { return ''; } }
  return '';
}

/* ---------- whole boards ---------- */
/* Copy one board's files folder to a new board id (the board.json is written
   by the next save). The renderer rewrites `mbf://<from>/` → `mbf://<to>/`. */
function duplicateFiles(fromId, toId, name, group) {
  try {
    const from = filesDir(fromId);
    const d = ensureDir(toId, name, group);
    if (!d.dir) return { error: d.error || '?' };
    let n = 0;
    if (isDir(from)) n = copyDir(from, path.join(d.dir, FILES));
    return { dir: d.dir, files: n };
  } catch (err) { return { error: errMsg(err) }; }
}

/* Remove a board's folder for good. Called only after its contents have been
   moved into the bin and the bin has been written — the renderer sequences
   that, this just deletes. */
function removeBoardDir(id) {
  const key = String(id || '').toLowerCase();
  const dir = dirs.get(key);
  if (!dir) return { ok: true, skipped: true };
  try {
    if (!isInside(dir, root)) return { ok: false, error: 'outside My Boards' };
    fs.rmSync(dir, { recursive: true, force: true });
    dirs.delete(key); laidOut.delete(key);
    const parent = path.dirname(dir);
    try { if (parent !== root && !fs.readdirSync(parent).length) fs.rmdirSync(parent); } catch (_) {}
    return { ok: true };
  } catch (err) { return { ok: false, error: errMsg(err) }; }
}

/* A copy of the board's folder somewhere else — a stick, a share, a mail
   attachment. The copy is a complete board: drop it into anyone's My Boards
   folder, or Import it, and the pictures are in it. */
function exportBoard(id, destParent, name) {
  try {
    const dir = boardDir(id);
    if (!dir) return { error: 'no board' };
    fs.mkdirSync(destParent, { recursive: true });
    const dest = path.join(destParent, freeDir(destParent, safeSeg(name, 'Board')));
    const files = copyDir(dir, dest, (n) => n === BAK || /\.tmp$/i.test(n));
    return { path: dest, files };
  } catch (err) { return { error: errMsg(err) }; }
}

/* Read a board somebody handed us: a board.json, or a folder holding one, or
   a 1.x export (.json with `mbBoard`/`boards` and a `files\` beside it).
   Returns the parsed data and where it was, so its files can be brought in. */
function readExternal(p) {
  try {
    let file = String(p || '');
    if (isDir(file)) file = path.join(file, BOARD);
    const data = readJson(file);
    if (!data) return { error: 'unreadable' };
    return { data, file, beside: path.dirname(file) };
  } catch (err) { return { error: errMsg(err) }; }
}

/* Bring an imported board's files in. Each URL the board mentions is looked
   for beside where it came from — `<beside>\files\<name>` for one of our
   folders, `<beside>\files\<theirId>\<name>` or anywhere under it by name for
   a 1.x export — and copied into the new board's own folder. Returns the
   old→new URL map; whatever was not found is left alone, which is honest. */
async function adoptExternalFiles(beside, urls, toId) {
  const map = {};
  let copied = 0;
  try {
    const rootF = path.join(String(beside || ''), FILES);
    if (!isDir(rootF)) return { map, copied };
    let index = null;
    const byName = (name) => {
      if (!index) {
        index = new Map();
        const walk = (d, depth) => {
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const full = path.join(d, e.name);
            if (e.isDirectory()) { if (depth < 2) walk(full, depth + 1); }
            else if (!index.has(e.name)) index.set(e.name, full);
          }
        };
        walk(rootF, 0);
      }
      return index.get(name) || null;
    };
    for (const url of (urls || [])) {
      let name = '', theirs = '';
      const ref = parseFileUrl(url);
      if (ref) { name = ref.name; theirs = ref.id; }
      else if (/^file:/i.test(url)) {
        try { const fp = fileURLToPath(url); name = path.basename(fp); theirs = path.basename(path.dirname(fp)); }
        catch (_) { continue; }
      } else continue;
      const direct = path.join(rootF, name);
      const nested = theirs ? path.join(rootF, theirs, name) : '';
      const found = exists(direct) ? direct : (nested && exists(nested) ? nested : byName(name));
      if (!found) continue;
      const r = await attachFile(found, toId, name);
      if (r && r.url) { map[url] = r.url; copied++; }
    }
  } catch (_) {}
  return { map, copied };
}

/* ---------- a mirror somewhere that is not this disk ----------
   Everything under My Boards, copied into `<dir>\Mental Board backup\`. New
   and changed files are copied; nothing in the mirror is ever deleted, so a
   mistake here can only leave too much behind. Big clips that have not
   changed are not copied again. */
function mirrorTo(destRoot) {
  const out = { files: 0, bytes: 0, error: '' };
  try {
    const dest = path.join(String(destRoot || ''), 'Mental Board backup');
    if (!destRoot) return { error: 'no folder' };
    const walk = (from, to) => {
      fs.mkdirSync(to, { recursive: true });
      for (const e of fs.readdirSync(from, { withFileTypes: true })) {
        if (/\.tmp$/i.test(e.name)) continue;
        const a = path.join(from, e.name), b = path.join(to, e.name);
        if (e.isDirectory()) { walk(a, b); continue; }
        if (!e.isFile()) continue;
        const sa = fs.statSync(a);
        let same = false;
        try { const sb = fs.statSync(b); same = sb.size === sa.size && Math.abs(sb.mtimeMs - sa.mtimeMs) < 2000; } catch (_) {}
        if (same) continue;
        fs.copyFileSync(a, b);
        try { fs.utimesSync(b, sa.atime, sa.mtime); } catch (_) {}
        out.files++; out.bytes += sa.size;
      }
    };
    walk(root, dest);
    out.path = dest;
  } catch (err) { out.error = errMsg(err); }
  return out;
}

/* A complete, dated copy of My Boards somewhere the user points. Unlike the
   mirror above it is a new folder every time, so it can be handed to
   somebody or kept as "how things were before I tried that". */
function backupAllTo(destParent) {
  try {
    if (!destParent) return { error: 'no folder' };
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}${p2(d.getMinutes())}`;
    const dest = path.join(destParent, freeDir(destParent, `My Boards ${stamp}`));
    const files = copyDir(root, dest, (n) => /\.tmp$/i.test(n));
    return { path: dest, files };
  } catch (err) { return { error: errMsg(err) }; }
}

/* What is in the store, for the dialog that offers to remove it. */
function tally() {
  let boards = 0, files = 0, bytes = 0;
  for (const [, dir] of dirs) {
    boards++;
    const fd = path.join(dir, FILES);
    if (!isDir(fd)) continue;
    for (const name of fs.readdirSync(fd)) {
      try { const st = fs.statSync(path.join(fd, name)); if (st.isFile()) { files++; bytes += st.size; } } catch (_) {}
    }
  }
  return { boards, files, bytes };
}

/* After the folder has been sent to the Recycle Bin (main does that — it has
   `shell`), start again with an empty one. */
function reset() {
  dirs.clear(); laidOut.clear();
  try { fs.mkdirSync(root, { recursive: true }); } catch (_) {}
}

/* ---------- 1.x → 2.0 ----------
   The old store was one board.json in %APPDATA%\Mental Board with every
   board inside it and the files in files\<boardId>\. On the first launch with
   an empty My Boards folder, that file is read once and laid out the new way:
   settings.json, one folder per board, files copied beside their board, and
   every `file:///…/files/<id>/<name>` in the notes rewritten to
   `mbf://<id>/<name>`. The old file is left exactly where it was. */
function migrateLegacy(oldDir) {
  try {
    if (!oldDir) return null;
    const file = path.join(oldDir, 'board.json');
    /* Once. The marker sits beside the old file, so "Delete everything" —
       which empties My Boards — does not bring the 1.x board back on the
       next launch as if it were new. */
    const marker = path.join(oldDir, '.migrated-to-my-boards');
    if (exists(marker)) return null;
    const r = readWithBackup(file);
    if (!r.data) return null;
    // only into an empty store — never over boards that already exist here
    if (exists(settingsFile()) || scan().boards.length) return null;
    const raw = r.data;
    const list = (Array.isArray(raw.boards) && raw.boards.length) ? raw.boards
               : [{ name: '', icon: 'sticky_note_2', notes: raw.notes, frames: raw.frames, links: raw.links, view: raw.view, nextZ: raw.nextZ }];
    const oldFiles = path.join(oldDir, 'files');
    const settings = {
      v: 3, appVersion: raw.appVersion || '',
      settings: raw.settings || {}, templates: raw.templates || [], statuses: raw.statuses,
      boardOrder: [], activeBoard: raw.activeBoard || ''
    };
    let n = 0, i = 0;
    for (const b of list) {
      if (!b || typeof b !== 'object') continue;
      i++;
      const id = (typeof b.id === 'string' && b.id) ? b.id.toLowerCase() : newId();
      b.id = id;
      const name = b.trash ? 'Trash' : (b.name || `Board ${i}`);
      const d = ensureDir(id, name, '');
      if (!d.dir) continue;
      // the files, then the markup that points at them
      const from = path.join(oldFiles, idSeg(id));
      if (isDir(from)) copyDir(from, path.join(d.dir, FILES));
      let json = JSON.stringify(b);
      json = json.replace(/file:\/\/\/[^"\\]*?\/files\/([\w-]+)\/([^"\\/]+)/g, (m, bid, fname) => {
        let name2 = fname;
        try { name2 = decodeURIComponent(fname); } catch (_) {}
        return `mbf://${String(bid).toLowerCase()}/${encodeURIComponent(name2)}`;
      });
      writeAtomic(path.join(d.dir, BOARD), json);
      settings.boardOrder.push(id);
      n++;
    }
    writeAtomic(settingsFile(), JSON.stringify(settings, null, 2));
    try { fs.writeFileSync(marker, `migrated ${n} board(s) into ${root}
`, 'utf8'); } catch (_) {}
    return { migrated: n, from: file };
  } catch (err) { return { error: errMsg(err) }; }
}

module.exports = {
  init, rootDir, scan, saveAll, saveAllAsync, snapshot, versionSnapshot,
  boardDir, filesDir, resolveFile, parseFileUrl, fileUrl, safeName,
  attachFile, attachBytes, listFiles, carryFiles, cleanup, readImage, pathOfUrl,
  duplicateFiles, removeBoardDir, exportBoard, readExternal, adoptExternalFiles,
  mirrorTo, backupAllTo, tally, reset, migrateLegacy, settingsFile, backupsDir
};
