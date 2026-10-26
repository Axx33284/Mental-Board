/* Mental Board — boards.js
   Several boards, one rail: switching, the flyout, locking, and drag-to-board.

   Part 16 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 14b. boards ───────────────
   Switching is: store what is live, bind what is next, redraw. Everything that
   makes it feel instant is already there — `render()` rebuilds from `state`, so
   there is no per-board DOM to keep around. */

async function switchBoard(id) {
  if (id === state.activeBoard) { closeBoardMenu(); return; }
  const next = boardById(id);
  if (!next) return;
  if (inkMode) toggleInk(false);        // the pen belongs to the board it was taken out on
  /* A board whose file would not parse is listed so the user knows it is
     there, and refused so nothing can be written over it. The toast names
     the folder to look in. */
  if (next.unreadable) { closeBoardMenu(); toast(t('msg.boardUnreadable'), 5000); return; }
  // a locked board asks for its passphrase before it will open
  if (isLocked(next) && !(await unlockBoard(next))) return;
  /* exitEdit() first, for the same reason applyLang() has to: render() throws
     away the note being edited, and anything typed since the last save lives
     only in that element. */
  exitEdit();
  syncActiveBoard();
  bindBoard(next);
  clearHistory();               // undo must not reach into the board you left
  clearSelection();
  closeBoardMenu();
  renderBoardRail();
  render();
  drawCompass();
  save();
}

function addBoard() {
  exitEdit();
  syncActiveBoard();
  const b = makeBoard('', 'sticky_note_2');
  state.boards.push(b);
  bindBoard(b);
  clearHistory();
  clearSelection();
  closeBoardMenu();
  renderBoardRail();
  render();
  drawCompass();
  save();
  // a brand new board is empty and unnamed; naming it is the obvious next step
  renameBoard(b.id);
}

async function duplicateBoard(id) {
  const src = boardById(id);
  if (!src || src.unreadable) return;
  syncActiveBoard();
  const copy = JSON.parse(JSON.stringify(src));
  delete copy.unreadable;
  copy.id = uid();
  copy.name = t('board.copy', { name: boardLabel(src) });
  copy.updatedAt = Date.now();
  /* The pictures go with it. The store copies the source folder's files\ into
     a folder for the new board, and every `mbf://<src>/…` in the copy is
     re-addressed to the new id — so the two boards are two whole boards, not
     one board and a set of links into it. */
  if (DATA && DATA.duplicateFiles) {
    const r = await DATA.duplicateFiles(src.id, copy.id, boardDirName(copy), copy.group || '');
    if (r && r.error) { toast(t('msg.boardDupFailed', { err: r.error }), 6000); return; }
  }
  relinkBoardHost(copy, src.id, copy.id);
  state.boards.splice(state.boards.indexOf(src) + 1, 0, copy);
  closeBoardMenu();
  renderBoardRail();
  save();
  toast(t('msg.boardDuplicated', { name: copy.name }));
}

/* Archiving is the answer to "I have finished with this board" that does not
   require deciding whether to throw it away. It stays in the file, stays in
   every backup, and comes back with one click. */
function archiveBoard(id, on) {
  const b = boardById(id);
  if (!b) return;
  closeBoardMenu();
  if (on && liveBoards().length < 2) { toast(t('msg.lastBoard')); return; }
  b.archived = !!on;
  b.updatedAt = Date.now();
  if (on && b.id === state.activeBoard) {
    // you cannot stand on a board you just archived
    exitEdit();
    syncActiveBoard();
    bindBoard(liveBoards()[0]);
    clearHistory(); clearSelection();
    render(); drawCompass();
  }
  renderBoardRail();
  save();
  toast(t(on ? 'msg.boardArchived' : 'msg.boardUnarchived', { name: boardLabel(b) }));
}

/* One board as a file, rather than the whole app's worth.
   `mbBoard` is what import checks: a single-board file and a full backup have
   different shapes and swapping them would either lose every other board or
   import one board five times. */
async function exportOneBoard(id) {
  const b = boardById(id);
  if (!b) return;
  closeBoardMenu();
  /* A board is a folder, and its export is a copy of that folder — board.json
     and every file it carries — wherever the user points. Drop the copy into
     anyone's My Boards, or Import it, and it is the whole board. A locked
     board travels locked: its folder holds the ciphertext, and it opens with
     the passphrase it was locked with. */
  if (!DATA || !DATA.exportBoard) {
    // a plain browser: the one-document JSON, as before
    const payload = JSON.stringify({ mbBoard: 1, app: 'Mental Board', board: boardPayload(b) }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = `${boardDirName(b)}.json`; a.click();
    return;
  }
  await saveNow();                    // the folder has to be current before it is copied
  const r = await DATA.exportBoard(b.id, boardDirName(b));
  if (!r) return;                     // cancelled
  if (r.error) { toast(t('msg.exportFailed'), 5000); return; }
  toast(t('msg.boardExportedTo', { path: r.path }), 6000);
}

/* Adds a board rather than replacing everything, which is the difference
   between this and Import in Settings. */
async function importOneBoard() {
  if (!DATA || !DATA.importBoard) { toast(t('msg.needDesktop')); return; }
  const r = await DATA.importBoard();
  if (!r) return;                     // cancelled
  if (r.error) { toast(t('msg.readFailed')); return; }
  if (!looksLikeBoards(r.data)) { toast(t('msg.notOurFile')); return; }
  await importBoardsFrom(r.data, r.beside || '', '');
}
/* The three shapes a board arrives in: a 2.0 board.json, a 1.x single-board
   export, or a 1.x everything-export. */
function looksLikeBoards(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.mbBoard === 2 && Array.isArray(p.notes)) return true;
  if (p.mbBoard && p.board) return true;
  return Array.isArray(p.boards) && p.boards.length > 0;
}

/* Somebody else's boards, added to yours.

   One implementation behind two doors — Import in the board menu, and dropping
   the file straight on the canvas — because they differ only in how the JSON
   arrives, and two copies of "adopt a board" would drift the first time one of
   them learned something.

   `beside` is where the file was, and it is the whole of how attachments
   travel. A board's files live in a `files/` folder next to it (see preload),
   which is exactly the shape backupNow() writes — so a backup folder copied to
   a stick and dropped on another machine brings its pictures and its videos
   with it. When there is no such folder the boards still arrive; their file
   links simply do not resolve, which is honest and visible.

   Both shapes are taken: `mbBoard` is one board, `boards` is a whole export.
   The second is deliberately *added* rather than replacing everything, because
   the user dropped a file on a canvas — Settings → Import is where "replace
   everything" lives, and it asks first. */
async function importBoardsFrom(parsed, beside, label) {
  const raws = (parsed.mbBoard === 2 && Array.isArray(parsed.notes)) ? [parsed]
             : (parsed.mbBoard && parsed.board ? [parsed.board]
             : (Array.isArray(parsed.boards) ? parsed.boards : []));
  if (!raws.length) { toast(t('msg.notABoardFile')); return; }

  const made = [];
  let files = 0;
  for (const raw of raws) {
    const b = adoptBoard(raw);
    if (!b || b.unreadable) continue;
    /* Its own id, if nothing here has it — then the URLs inside it are already
       right and only the files need copying. A fresh id otherwise, and the
       relink below re-addresses everything. */
    const oldId = b.id;
    if (!oldId || boardById(oldId)) b.id = uid();
    b.archived = false;
    b.trash = false;
    b.updatedAt = Date.now();
    state.boards.push(b);
    made.push(b);
    if (b.enc) continue;             // an envelope: nothing to relink, nothing to read
    if (oldId !== b.id) relinkBoardHost(b, oldId, b.id);
    /* The pictures. The board's folder has to exist before anything can be
       copied into it, and the store makes it on the first save. */
    if (beside && DATA && DATA.adoptFiles) {
      await saveNow();
      const urls = attachmentUrls(b);
      // the background is a file no note mentions
      const bgUrl = b.bg && b.bg.file ? `mbf://${b.id}/${encodeURIComponent(b.bg.file)}` : '';
      if (bgUrl) urls.push(bgUrl);
      if (urls.length) {
        const got = await DATA.adoptFiles(beside, urls, b.id);
        if (got && got.map) {
          relinkAttachments(b, got.map);
          files += got.copied || 0;
          // the copy may have landed under a free name
          if (bgUrl && got.map[bgUrl]) {
            const m = /\/([^/]+)$/.exec(got.map[bgUrl]);
            if (m) { try { b.bg.file = decodeURIComponent(m[1]); } catch (_) {} }
          }
        }
      }
    }
  }
  if (!made.length) { toast(t('msg.notOurFile')); return; }

  markStatsStale();          // more boards, more notes, and possibly more files
  renderBoardRail();
  save();
  const name = made.length === 1 ? boardLabel(made[0]) : (label || '');
  toast(files
    ? t('msg.boardImportedFiles', { name, n: files })
    : (made.length === 1 ? t('msg.boardImported', { name })
                         : t('msg.boardsImported', { n: made.length })), 4200);
}

async function deleteBoard(id) {
  const b = boardById(id);
  if (!b) return;
  closeBoardMenu();
  /* A board whose file would not parse may still be recoverable by hand;
     deleting its folder from here would end that. It is refused, and the
     toast says where to look. */
  if (b.unreadable) { toast(t('msg.boardUnreadable'), 5000); return; }
  /* Emptying the bin is the one delete that means it. */
  if (b.trash) { emptyTrash(); return; }
  /* The last board cannot go. An app with no board has nowhere to put a note,
     and "delete everything" already exists as Erase board in Settings. */
  if (liveBoards().length < 2) { toast(t('msg.lastBoard')); return; }
  const n = b.notes.length + b.frames.length;
  /* A locked board holds no plaintext to move, so its contents cannot be put
     in the bin — deleting it really does delete them, and the dialog has to
     say so rather than promising a recovery that is not there. */
  const keepable = n && !isLocked(b);
  const ok = await confirmDlg(
    t('confirm.delBoardTitle', { name: boardLabel(b) }),
    keepable ? t('confirm.delBoardKept', { n })
             : (n ? t('confirm.delBoardBody', { n }) : t('confirm.delBoardEmpty')),
    t('confirm.delBoardOk'), keepable ? 'safe' : '');
  if (!ok) return;
  /* The board goes, its contents do not. Everything on it moves to the bin
     first, tagged with the board it came from — so "I deleted the wrong board"
     costs you the board's name and nothing else. */
  if (keepable) {
    const tb = ensureTrash();
    const items = [...b.notes, ...b.frames];
    items.forEach((it, i) => {
      it.trashedFrom = b.id;
      it.trashedAt = Date.now();
      const at2 = trashSpot(tb, i);
      it.x = at2.x; it.y = at2.y;
      if (b.frames.includes(it)) tb.frames.push(it); else { it.z = ++tb.nextZ; tb.notes.push(it); }
    });
    /* The board's folder is about to go, and its pictures with it — so they
       are copied into the bin's own folder first and the trashed notes are
       pointed at the copies. The bin has to exist on disk to receive them,
       hence the save in between. */
    if (b.notes.length) {
      await saveNow();
      await carryNotesTo(b.notes, tb.id);
    }
  }
  const wasActive = b.id === state.activeBoard;
  const at = state.boards.indexOf(b);
  state.boards.splice(at, 1);
  if (wasActive) {
    exitEdit();
    /* Land on a board you can work on. `state.boards[at]` is whatever slid into
       the gap, and that can now be the bin — dropping the user into it after
       deleting a board would look like the delete had gone somewhere strange. */
    const live = liveBoards();
    const near = state.boards[Math.min(at, state.boards.length - 1)];
    bindBoard((near && !near.trash && !near.archived) ? near : (live[0] || state.boards[0]));
    clearHistory();
    clearSelection();
    render();
    drawCompass();
  }
  renderBoardRail();
  /* The bin is written *before* the folder is removed. A crash between the two
     leaves an orphan folder, which the next launch simply lists as a board
     again — the opposite order could lose the pictures the bin now points at. */
  await saveNow();
  /* …and only if it really was written, and every file the trashed notes
     show was carried out first. saveNow() reports a failure but does not
     return one, and a folder removed after a failed write takes its pictures
     with it while the bin that points at them exists only in memory. Kept, the
     folder is listed again at the next launch: a duplicate, never a loss. */
  if (keepable) {
    const tb = state.boards.find((x) => x.trash);
    const own = `mbf://${String(b.id).toLowerCase()}/`;
    const stillHere = notesFileUrls(b.notes).some((u) => u.toLowerCase().startsWith(own));
    if (!tb || !boardLanded(tb.id) || stillHere) { toast(t('msg.boardDirKept'), 7000); return; }
  }
  forgetWritten(b.id);
  if (DATA && DATA.removeBoardDir) {
    const r = await DATA.removeBoardDir(b.id);
    if (r && r.ok === false) toast(t('msg.boardDirStuck', { err: r.error || '?' }), 6000);
  }
  toast(keepable ? t('msg.boardDeletedKept', { n }) : t('msg.boardDeleted'));
}

/* Rename in place on the rail tile, the same way a workflow frame renames —
   including the `settled` latch, because dropping contenteditable fires blur
   and would otherwise re-enter this and commit the text Escape threw away. */
function renameBoard(id) {
  const b = boardById(id);
  if (!b) return;
  closeBoardMenu();
  // renaming happens on the tile, so the rail has to be on screen to do it
  if (state.settings.railMode === 'off') { state.settings.railMode = 'hover'; applySettings(); }
  holdRail(true);
  const tile = document.querySelector(`.br-tile[data-board="${id}"]`);
  const label = tile && tile.querySelector('.br-name');
  if (!label) return;
  const before = b.name;
  label.textContent = boardLabel(b);
  label.setAttribute('contenteditable', 'plaintext-only');
  label.focus();
  const sel = getSelection();
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(label);
  sel.addRange(r);

  let settled = false;
  const finish = (keep) => {
    if (settled) return;
    settled = true;
    label.removeAttribute('contenteditable');
    if (keep) {
      const typed = (label.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      // typing the default label back is the same as having no name at all
      b.name = (typed && typed !== t('board.numbered', { n: state.boards.indexOf(b) + 1 })) ? typed : '';
      b.updatedAt = Date.now();
      save();
    } else {
      b.name = before;
    }
    holdRail(false);
    renderBoardRail();
    $('viewport').focus();
  };
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  label.addEventListener('blur', () => finish(true));
}

/* --- undo -------------------------------------------------------------- */
const undoStack = [], redoStack = [];
const UNDO_MAX = 90;
/* A depth cap alone is not a memory cap. A snapshot is the whole board as JSON,
   and a pasted image is inlined as a data URL of up to 6 MB — so three of them
   in one note makes every snapshot ~18 MB and ninety of those is over a
   gigabyte of retained strings, from nothing more than ninety drags. Per-note
   history already had HIST_MAX_BYTES for exactly this; undo did not. Depth
   still bounds the common case; this bounds the expensive one. */
const UNDO_MAX_BYTES = 24 * 1024 * 1024;
let undoBytes = 0;

/* ---- two shapes of undo step ------------------------------------------
   A step used to be one thing: the whole board as JSON. That is the honest
   answer for anything structural — a delete, a paste, an import — because the
   *shape* of the board changed and nothing smaller describes it.

   It is a terrible answer for a drag. Dragging a note changes four numbers, and
   paying for it with a full serialise of every note, frame and rope means the
   start of every drag stalls for as long as JSON.stringify takes, and ninety
   drags retain ninety copies of the board. Measured on a board of 1200 notes:
   1.6 ms and 1.1 MB per drag, so twenty drags was 23 MB of retained strings for
   twenty gestures that between them moved a few hundred bytes' worth of x and
   y. On a machine with 2 GB of RAM that is the difference between the app being
   usable and the app being the reason nothing else is.

   So a step is now either:

     { kind: 'full', json }              the board, as before
     { kind: 'geom', items: [{id,x,y,w,h}] }   only what moved

   A geom step also *undoes* faster, because putting four numbers back does not
   need render() — it needs the elements repositioned and the ropes redrawn, and
   nothing else on screen was different in the first place.

   The rule for choosing is simple and worth keeping simple: if the set of
   notes, frames and ropes is the same before and after, it is geom. If anything
   was created, destroyed or moved between boards, it is full. When in doubt it
   is full — a step that restores too much is a surprise, a step that restores
   too little is data loss. */
function clearHistory() { undoStack.length = 0; redoStack.length = 0; undoBytes = 0; }
function snapshot() { return JSON.stringify({ notes: state.notes, frames: state.frames, links: state.links, ink: state.ink, nextZ: state.nextZ }); }
// what a step costs to keep, so the byte cap means something for both shapes
const stepBytes = (s) =>
  (s.kind === 'full' ? s.json.length + (s.other ? s.other.json.length : 0) : s.kind === 'ink' ? s.json.length : s.items.length * 64);

/* One board's contents as JSON, and back again. A step normally only has to
   describe the board you are looking at — that is the only one anything can
   change. Dragging a note onto another board's tile is the exception, and it
   is why `other` exists on a full step: without it, undo put the note back on
   the board it came from and left the copy sitting on the board it went to, so
   one Ctrl+Z turned one note into two. */
const boardJson = (b) => JSON.stringify({ notes: b.notes, frames: b.frames, links: b.links, ink: b.ink || [], nextZ: b.nextZ });
function loadBoardJson(b, json) {
  const o = JSON.parse(json);
  b.notes = o.notes; b.frames = o.frames; b.links = o.links; b.ink = o.ink || []; b.nextZ = o.nextZ || 1;
  // the live mirror points at the old arrays; rebind or the next save undoes this
  if (b.id === state.activeBoard) bindBoard(b);
}

function pushStep(step) {
  undoStack.push(step);
  undoBytes += stepBytes(step);
  while (undoStack.length > UNDO_MAX || (undoBytes > UNDO_MAX_BYTES && undoStack.length > 1)) {
    undoBytes -= stepBytes(undoStack.shift());
  }
  redoStack.length = 0;
}
function pushUndo() { pushStep({ kind: 'full', json: snapshot() }); }
/* A stroke drawn or erased (2.1). Only the ink is kept: a full step would
   serialise every note on the board for each stroke, and a drawing is dozens
   of strokes. */
function pushUndoInk() { pushStep({ kind: 'ink', json: JSON.stringify(state.ink) }); }

/* A full step that also remembers a second board, for the one gesture that
   changes two of them at once. `other` is captured before the move, so undoing
   restores both sides and the note is on exactly one board again. */
function pushUndoWithBoard(other) {
  pushStep({ kind: 'full', json: snapshot(), other: { id: other.id, json: boardJson(other) } });
}

// the geometry of a list of notes/frames, right now
const geomOf = (items) => items.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h }));
/* For a gesture that only moves or resizes things that already exist. Callers
   must not use this if the gesture can also add, remove or re-home an item —
   see finishBoardDrop(), which swaps its step for a full one precisely because
   it can. */
function pushUndoGeom(items) {
  if (!items || !items.length) return;
  pushStep({ kind: 'geom', items: geomOf(items) });
}

function takeUndo() { const s = undoStack.pop(); if (s) undoBytes -= stepBytes(s); return s; }
function popUndo() { takeUndo(); }          // the gesture turned out to be a no-op

// the step that would put things back the way they are this instant
function currentStepFor(step) {
  if (step.kind === 'ink') return { kind: 'ink', json: JSON.stringify(state.ink) };
  if (step.kind === 'geom') {
    const live = step.items.map((g) => itemById(g.id)).filter(Boolean);
    return { kind: 'geom', items: geomOf(live) };
  }
  const now = { kind: 'full', json: snapshot() };
  // redo has to be able to put the second board back too, or it only half-works
  if (step.other) {
    const b = boardById(step.other.id);
    if (b) now.other = { id: b.id, json: boardJson(b) };
  }
  return now;
}

function restore(step) {
  if (!step) return;
  if (step.kind === 'ink') { state.ink = JSON.parse(step.json); drawInk(); updateEmpty(); save(); return; }
  if (step.kind === 'geom') {
    step.items.forEach((g) => {
      const it = itemById(g.id);
      if (!it) return;
      it.x = g.x; it.y = g.y; it.w = g.w; it.h = g.h;
      const el = els.get(g.id);
      if (el) placeEl(el, it);           // unmounted items are placed when they mount
    });
    /* No render(). Nothing was created or destroyed, so the document is already
       correct apart from four numbers per item — and on a big board a render is
       an order of magnitude more expensive than the move it is undoing. */
    drawLinks(); refreshFrameCounts(); drawCompass(); save();
    return;
  }
  /* The other board first. It cannot be the active one — you only ever drop
     onto a board you are not standing on — so this never fights the mirror
     assignment below, and doing it first keeps the two writes in a fixed order
     rather than an accidental one. */
  if (step.other) {
    const b = boardById(step.other.id);
    if (b && !isLocked(b)) loadBoardJson(b, step.other.json);
  }
  const o = JSON.parse(step.json);
  state.notes = o.notes; state.frames = o.frames; state.links = o.links; state.ink = o.ink || []; state.nextZ = o.nextZ || 1;
  editing = null; editNote = null;
  selection = new Set();
  render(); drawCompass(); renderBoardRail(); save();
}
function undo() {
  if (!undoStack.length) { toast(t('msg.nothingUndo')); return; }
  const step = undoStack[undoStack.length - 1];
  redoStack.push(currentStepFor(step));
  restore(takeUndo());
  toast(t('msg.undone'));
}
function redo() {
  if (!redoStack.length) { toast(t('msg.nothingRedo')); return; }
  const step = redoStack.pop();
  const back = currentStepFor(step);
  undoStack.push(back); undoBytes += stepBytes(back);
  restore(step);
  toast(t('msg.redone'));
}

/* --- internal clipboard ------------------------------------------------ */
let clipboard = [];
/* The ropes that went with the last copy or cut (2.1). Every rope touching a
   copied note is kept, not only the ones between two copied notes: a rope
   between two of them is re-tied between their copies, and a rope to a note
   that was left behind is re-tied to that same note if it is on the board the
   paste lands on. That is what makes Cut then Paste a *move* — before, cutting
   a note deleted its ropes along with it and pasting brought back a note with
   none, so a note could not be carried across the board without being
   re-roped by hand. */
let clipLinks = [];
function copySelection(cut) {
  const items = selectedItems();
  if (!items.length) return;
  clipboard = items.map((it) => ({ frame: isFrame(it.id), data: JSON.parse(JSON.stringify(it)) }));
  const ids = new Set(items.map((it) => it.id));
  clipLinks = state.links.filter((l) => ids.has(l.from) || ids.has(l.to)).map((l) => ({ from: l.from, to: l.to, color: l.color }));
  /* The internal clipboard above is what Ctrl+V on the canvas pastes, and it is
     unchanged. This is the *other* half, added because "copy what this note
     says and put it in an email" had no answer at all: the same selection also
     goes to the system clipboard as text and as HTML. Not awaited — the copy
     has already happened as far as the board is concerned, and a clipboard
     permission prompt must not hold up the toast. */
  toSystemClipboard(itemsToText(items), itemsToHtml(items));
  markInternalCopy('board');      // so a drawing note knows this is the newer copy (sketch.js onSketchPaste)
  toast(t(cut ? 'msg.cut' : 'msg.copied', { n: items.length }));
  if (cut) { pushUndo(); deleteItems(items.map((i) => i.id)); }
}
function pasteClipboard(worldPt) {
  if (!clipboard.length) return;
  if (!canEditHere()) return;
  pushUndo();
  const b = bboxOf(clipboard.map((c) => c.data));
  const c0 = worldPt || viewCenterWorld();
  const dx = Math.round(c0.x - (b.x + b.w / 2)), dy = Math.round(c0.y - (b.y + b.h / 2));
  const made = [];
  const newId = new Map();
  clipboard.forEach(({ frame, data }) => {
    const copy = JSON.parse(JSON.stringify(data));
    newId.set(copy.id, copy.id = uid());
    copy.x += dx; copy.y += dy;
    if (frame) { state.frames.push(copy); const el = makeFrame(copy); $('framesLayer').appendChild(el); els.set(copy.id, el); }
    else { copy.z = ++state.nextZ; state.notes.push(copy); const el = makeNote(copy); $('notesLayer').appendChild(el); els.set(copy.id, el); }
    made.push(copy.id);
  });
  retieLinks(clipLinks, newId);
  updateCulling();          // a paste of many notes can cross the threshold
  refreshFrameCounts(); updateEmpty(); drawCompass(); drawLinks(); save();
  setSelection(made, false);
  /* Notes copied off another board still point at that board's pictures.
     They show straight away — the other board's folder is still there — and
     are re-addressed to copies in this board's folder as soon as those land,
     so this board stays a whole board. */
  const notes = made.map((id) => state.notes.find((n) => n.id === id)).filter(Boolean);
  carryNotesTo(notes, state.activeBoard).then((n) => {
    if (!n) return;
    notes.forEach((nt) => { const el = els.get(nt.id); if (el && !el.classList.contains('editing')) repaintNoteBody(el, nt); });
    saveSoon();
  });
}

/* Tie `links` again after their notes were copied. `newId` maps each copied
   id to its copy; an end that was not copied keeps its own id, and the rope is
   kept only if that note is on this board. Never a rope from a note to itself,
   and never a second rope where one already runs. Shared by paste and
   duplicate. */
function retieLinks(links, newId) {
  const here = new Set(state.notes.map((n) => n.id));
  const has = (a, b) => state.links.some((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
  let n = 0;
  for (const l of links) {
    const from = newId.get(l.from) || l.from, to = newId.get(l.to) || l.to;
    if (from === to || !here.has(from) || !here.has(to) || has(from, to)) continue;
    state.links.push(l.color ? { id: uid(), from, to, color: l.color } : { id: uid(), from, to });
    n++;
  }
  return n;
}

/* ---- holding Ctrl+V: see where it will land (2.1) ----------------------

   A tap of Ctrl+V pastes at the pointer. *Holding* it shows the paste first —
   every copied note and workflow as a faint outline, with its ropes, riding
   on the pointer — and lets go where you let go of the keys. Escape while
   holding cancels; a click puts it down early.

   The ghost lives inside #world, so it is drawn in world coordinates and
   scales with the zoom for free, and moving it is one transform on its
   container. It is built once per hold, from the clipboard; the only thing
   recomputed per pointer move is the rope to any note that stayed behind.

   It starts from the `paste` event (see init.js), not from the keydown: the
   paste event is where we learn whether the system clipboard holds a
   screenshot, and a screenshot wins. */
let pasteGhost = null;      // { el, svg, box, at, ext:[{line, ox, oy, to}] }
function beginPasteGhost() {
  if (pasteGhost || !clipboard.length || !canEditHere()) return;
  const datas = clipboard.map((c) => c.data);
  const box = bboxOf(datas);
  const el = document.createElement('div');
  el.id = 'pasteGhost';
  let html = '';
  for (const { frame, data } of clipboard) {
    const x = data.x - box.x, y = data.y - box.y;
    const label = frame ? (data.title || '') : (data.pic ? '' : noteTitle(data));
    html += `<div class="pgh-item${frame ? ' pgh-frame' : ''}" data-color="${esc(isHex(data.color) ? 'custom' : data.color || (frame ? 'blue' : 'default'))}" style="${colorStyle(data.color)};left:${x}px;top:${y}px;width:${data.w}px;height:${data.h}px"><span>${esc(label)}</span></div>`;
  }
  // ropes: between two copied notes they move with the ghost; to a note left
  // behind, one end is fixed and the line is redrawn as the ghost moves
  const inGhost = new Map(datas.map((d) => [d.id, d]));
  const here = new Map(state.notes.map((n) => [n.id, n]));
  let svg = `<svg class="pgh-ropes" xmlns="${SVGNS}">`;
  const ext = [];
  for (const l of clipLinks) {
    const a = inGhost.get(l.from), b = inGhost.get(l.to);
    if (a && b) {
      svg += `<line x1="${a.x - box.x + a.w / 2}" y1="${a.y - box.y + a.h / 2}" x2="${b.x - box.x + b.w / 2}" y2="${b.y - box.y + b.h / 2}"/>`;
    } else {
      const mine = a || b, other = here.get(a ? l.to : l.from);
      if (mine && other) ext.push({ ox: mine.x - box.x + mine.w / 2, oy: mine.y - box.y + mine.h / 2, to: other });
    }
  }
  svg += '</svg>';
  el.innerHTML = html + svg;
  // the ropes to notes left behind are in world space, outside the moving group
  const extSvg = document.createElementNS(SVGNS, 'svg');
  extSvg.setAttribute('class', 'pgh-ropes pgh-ext');
  ext.forEach((x) => { x.line = document.createElementNS(SVGNS, 'line'); extSvg.appendChild(x.line); });
  $('world').appendChild(extSvg);
  $('world').appendChild(el);
  pasteGhost = { el, extSvg, box, ext, at: null };
  document.body.classList.add('paste-ghosting');
  movePasteGhost(lastCanvasPoint || viewCenterWorld());
  window.addEventListener('pointermove', onPasteGhostMove);
  window.addEventListener('pointerdown', onPasteGhostDown, true);
  window.addEventListener('blur', cancelPasteGhost);
}
function movePasteGhost(pt) {
  const g = pasteGhost;
  if (!g) return;
  g.at = pt;
  const x = pt.x - g.box.w / 2, y = pt.y - g.box.h / 2;
  g.el.style.transform = `translate(${x}px, ${y}px)`;
  for (const e of g.ext) {
    e.line.setAttribute('x1', x + e.ox); e.line.setAttribute('y1', y + e.oy);
    e.line.setAttribute('x2', e.to.x + e.to.w / 2); e.line.setAttribute('y2', e.to.y + e.to.h / 2);
  }
}
function onPasteGhostMove(e) {
  if (e.target && e.target.closest && e.target.closest('.overlay, .titlebar')) return;
  movePasteGhost(toWorld(e.clientX, e.clientY));
}
function onPasteGhostDown(e) {
  if (!pasteGhost) return;
  e.preventDefault(); e.stopPropagation();
  movePasteGhost(toWorld(e.clientX, e.clientY));
  commitPasteGhost();
}
function endPasteGhost() {
  const g = pasteGhost;
  pasteGhost = null;
  window.removeEventListener('pointermove', onPasteGhostMove);
  window.removeEventListener('pointerdown', onPasteGhostDown, true);
  window.removeEventListener('blur', cancelPasteGhost);
  document.body.classList.remove('paste-ghosting');
  if (g) { g.el.remove(); g.extSvg.remove(); }
  return g;
}
function commitPasteGhost() {
  const g = endPasteGhost();
  if (g) pasteClipboard(g.at);
}
function cancelPasteGhost() { endPasteGhost(); }

/* --- find -------------------------------------------------------------- */
let findHits = [], findIdx = 0;
function openFind() {
  $('findBar').classList.remove('hidden');
  const i = $('findInput'); i.focus(); i.select();
}
function closeFind() {
  $('findBar').classList.add('hidden');
  document.querySelectorAll('.note.find-hit').forEach((e) => e.classList.remove('find-hit'));
  findHits = [];
}
/* Find searches every board, not just the open one.

   It used to search `state.notes`, which was the whole app when there was one
   canvas. With several it quietly became a search of one fifth of your notes
   with no indication the rest existed — the worst kind of wrong answer, because
   it looks like a right one. Hits on the board you are on come first, since
   that is usually what you meant; the rest are labelled with their board and
   switch to it when you land on them.

   Locked boards are skipped. There is nothing to search — the plaintext is not
   in memory — and silently returning nothing from them is honest, because the
   count says how many boards were looked at. */
/* `q` arrives already folded — see runFind() and openPalette(). Both sides of
   the comparison have to go through foldSearch() or an Arabic search is
   comparing two spellings of the same word and finding neither. */
function searchBoards(q) {
  if (!q) return [];
  const here = [], elsewhere = [];
  syncActiveBoard();
  state.boards.forEach((b) => {
    if (isLocked(b) || (b.archived && !state.settings.showArchived)) return;
    b.notes.forEach((n) => {
      if (!noteTextFolded(n).includes(q)) return;
      (b.id === state.activeBoard ? here : elsewhere).push({ note: n, board: b });
    });
  });
  return here.concat(elsewhere);
}

function runFind() {
  const q = foldSearch($('findInput').value.trim());
  document.querySelectorAll('.note.find-hit').forEach((e) => e.classList.remove('find-hit'));
  findHits = searchBoards(q);
  findHits.forEach((h) => { if (h.board.id === state.activeBoard) els.get(h.note.id)?.classList.add('find-hit'); });
  findIdx = 0;
  const other = findHits.filter((h) => h.board.id !== state.activeBoard).length;
  $('findCount').textContent = !q ? ''
    : findHits.length ? `${num(1)}/${num(findHits.length)}` + (other ? ' ' + t('find.elsewhere', { n: other }) : '')
    : t('find.none');
  if (findHits.length) gotoHit(0);
}

async function gotoHit(i) {
  if (!findHits.length) return;
  findIdx = (i + findHits.length) % findHits.length;
  const hit = findHits[findIdx];
  const other = findHits.filter((h) => h.board.id !== state.activeBoard).length;
  $('findCount').textContent = `${num(findIdx + 1)}/${num(findHits.length)}` + (other ? ' ' + t('find.elsewhere', { n: other }) : '');
  await revealNote(hit.note, hit.board);
}

/* Fly to a note, switching board first when it is somewhere else. Everything
   that jumps to a note goes through here — find, the palette, a board link,
   a reminder — so they all behave the same way. */
async function revealNote(note, board) {
  if (!note) return false;
  if (board && board.id !== state.activeBoard) {
    await switchBoard(board.id);
    if (board.id !== state.activeBoard) return false;     // locked and cancelled
  }
  const live = state.notes.find((n) => n.id === note.id);
  if (!live) return false;
  flyTo({ x: live.x + live.w / 2, y: live.y + live.h / 2 }, Math.max(state.view.z, 0.75), 450);
  setSelection([live.id], false);
  const el = els.get(live.id);
  if (el) {
    el.classList.add('find-hit');
    setTimeout(() => el.classList.remove('find-hit'), 1400);
  }
  return true;
}

/* --- one note's history -------------------------------------------------
   Recovery used to mean finding a dated backup and copying it over board.json,
   which puts *every* board back — so undoing one bad edit cost you everything
   else done since. This puts one note back and touches nothing else. */
let histTargetId = null;
function openHistory(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.hist || !n.hist.length) { toast(t('hist.none')); return; }
  histTargetId = id;
  const list = $('histList');
  // newest first: the version you want back is nearly always the last one
  list.innerHTML = n.hist.slice().reverse().map((h, i) => {
    const idx = n.hist.length - 1 - i;
    const preview = stripHtml(h.body).slice(0, 110) || t('hist.empty');
    return `<button class="hist-row" data-i="${idx}">
        <span class="hist-when">${esc(fmtWhen(h.t))}</span>
        <span class="hist-prev">${esc(preview)}</span>
        <span class="hist-go">${icon('history')}</span>
      </button>`;
  }).join('');
  list.querySelectorAll('.hist-row').forEach((b) => b.addEventListener('click', () => restoreHistory(+b.dataset.i)));
  $('histDlg').classList.remove('hidden');
}
function restoreHistory(i) {
  const n = state.notes.find((x) => x.id === histTargetId);
  $('histDlg').classList.add('hidden');
  if (!n || !n.hist || !n.hist[i]) return;
  exitEdit();
  pushUndo();
  /* The version being replaced becomes a history entry itself, so restoring is
     reversible by restoring again. Without this, picking the wrong version once
     would throw away the text you actually wanted. */
  const current = n.body;
  n.body = n.hist[i].body;
  pushHistory(n, current);
  /* ensureMounted(), not els.get(): this writes straight into the .note-body,
     and a note can be mounted without one — culled notes have no element at all
     and far-zoom ones are stubs. Both are answered by the same call. */
  const el = ensureMounted(n.id);
  if (el) {
    const body = el.querySelector('.note-body');
    body.innerHTML = n.body;
    paintCodeBlocks(body);
    paintEmbeds(body);
    paintDatabases(body);
    paintTocs(body);
  }
  repaintMarks(n.id);
  save();
  toast(t('hist.restored'));
}

/* --- locking a board ----------------------------------------------------
   AES-GCM over the board's contents, with the key derived from a passphrase by
   PBKDF2. All of it is WebCrypto, which ships with Chromium — no dependency,
   and nothing here invents any cryptography.

   The honest limits, because they matter more than the algorithm:

   - There is no recovery. No hint, no reset, no back door. Forgetting the
     passphrase means the board is gone, and the confirm dialog says so in
     those words rather than in a euphemism.
   - It protects the board *at rest* — the file on disk, and any backup copy of
     it. An unlocked board is plaintext in memory like every other, so this is
     protection from someone reading your disk, not from someone at your
     unlocked machine.
   - Locking re-encrypts on every save, so `updatedAt` changes even when the
     contents did not. That is unavoidable with a random IV per write, and a
     random IV per write is the part you cannot skip.

   ENC_ITER is deliberately high; this runs once per unlock, and a slow unlock
   is the entire defence against someone trying passphrases in a loop. */
const ENC_ITER = 310000;
/* Base64, in chunks, and the chunking is the whole point.

   This used to be `btoa(String.fromCharCode(...new Uint8Array(buf)))`. Spread
   passes every byte as a separate argument, and V8 runs out of stack at about
   125,000 of them — measured, not guessed. So a board bigger than ~125 KB
   could not be encrypted at all, and the failure was a RangeError thrown from
   somewhere three calls down.

   That mattered far more than "locking a big board fails", because a board is
   only re-encrypted on *save*: lock a small board, open it, paste a
   screenshot into it, and every save from then on threw here, was swallowed by
   the catch in reencryptOpenBoards(), and wrote the previous ciphertext. The
   session went to disk as the board you had before you started, with nothing
   said at any point. 0x8000 bytes per call is far below the limit and costs
   one loop. */
function b64(buf) {
  const bytes = new Uint8Array(buf);
  const STEP = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += STEP) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(s);
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ENC_ITER, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptBoard(b, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const payload = JSON.stringify({ notes: b.notes, frames: b.frames, links: b.links, ink: b.ink || [], view: b.view, nextZ: b.nextZ });
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(payload));
  return { v: 1, salt: b64(salt), iv: b64(iv), data: b64(data) };
}
async function decryptBoard(enc, pass) {
  const key = await deriveKey(pass, unb64(enc.salt));
  // AES-GCM is authenticated: a wrong passphrase throws here rather than
  // returning plausible rubbish, which is what makes "wrong passphrase" a
  // reliable message instead of a guess
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, key, unb64(enc.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

async function lockBoard(id) {
  const b = boardById(id);
  if (!b || b.enc) return;
  if (b.id === state.activeBoard) { exitEdit(); syncActiveBoard(); }
  const pass = await askPass({
    title: t('pass.lockTitle', { name: boardLabel(b) }),
    body: t('pass.lockBody'),
    ok: t('pass.lockOk'),
    confirm: true
  });
  if (!pass) return;

  try {
    const enc = await encryptBoard(b, pass);
    /* Prove it before trusting it. Decrypting what was just encrypted and
       checking the note count round-trips means a bug in this code cannot
       silently replace a board with an envelope that will not open. Only after
       that passes does the plaintext go. */
    const back = await decryptBoard(enc, pass);
    if (!back || !Array.isArray(back.notes) || back.notes.length !== b.notes.length) {
      throw new Error('round-trip mismatch');
    }
    b.enc = enc;
    b.notes = []; b.frames = []; b.links = []; b.ink = [];
    b.view = { x: 0, y: 0, z: 1 }; b.nextZ = 1;
    b.updatedAt = Date.now();
    unlocked.delete(b.id);
    if (b.id === state.activeBoard) {
      const other = liveBoards().find((x) => x.id !== b.id) || state.boards.find((x) => x.id !== b.id);
      /* Somewhere else to stand, or nowhere. Both branches have to leave the
         live mirror pointing at something writable-or-visibly-empty: leaving it
         on the plaintext arrays of the board just locked would show a normal
         canvas that syncActiveBoard() then refuses to store, so every edit made
         from here on would be dropped without a word. That is the exact shape
         of the bug this app was rebuilt over. */
      if (other) { bindBoard(other); }
      else { bindBoard(b); }        // b's arrays are the empty ones set above
      clearHistory(); clearSelection(); render(); drawCompass();
    }
    renderBoardRail();
    save();
    toast(t('msg.boardLocked', { name: boardLabel(b) }));
  } catch (err) {
    // nothing has been changed at this point — the board is exactly as it was
    toast(t('msg.lockFailed'));
  }
}

/* Ask for the passphrase and put the contents back. Returns true when the
   board is open. */
async function unlockBoard(b) {
  if (!b || !b.enc) return true;
  if (unlocked.has(b.id)) return true;
  let err = '';
  for (;;) {
    const pass = await askPass({
      title: t('pass.openTitle', { name: boardLabel(b) }),
      body: t('pass.openBody'),
      ok: t('pass.openOk'),
      confirm: false,
      err
    });
    if (!pass) return false;
    try {
      const plain = await decryptBoard(b.enc, pass);
      const healed = adoptBoard(Object.assign({}, plain, {
        id: b.id, name: b.name, icon: b.icon, iconColor: b.iconColor, archived: b.archived
      }));
      b.notes = healed.notes; b.frames = healed.frames; b.links = healed.links; b.ink = healed.ink;
      b.view = healed.view; b.nextZ = healed.nextZ;
      unlocked.add(b.id);
      /* Keep the envelope. The board is still a locked board — it re-encrypts
         on save, and quitting locks it again. Dropping `enc` here is how you
         would accidentally turn "open it for a moment" into "unlock it
         forever". */
      passOf.set(b.id, pass);
      renderBoardRail();
      return true;
    } catch (_) {
      err = t('pass.wrong');   // shown by the next askPass, not cleared by it
      // loop and ask again — a typo should not close the dialog
    }
  }
}
// passphrases for boards opened this session, so save() can re-encrypt
const passOf = new Map();

/* Take the lock off entirely. Separate from unlocking, and it asks first,
   because "I want to read this now" and "I no longer want this protected" are
   different intentions and only one of them is reversible for free. */
async function removeBoardLock(id) {
  const b = boardById(id);
  if (!b || !b.enc) return;
  if (!(await unlockBoard(b))) return;
  const ok = await confirmDlg(t('confirm.unlockTitle', { name: boardLabel(b) }), t('confirm.unlockBody'), t('confirm.unlockOk'), 'safe');
  if (!ok) return;
  b.enc = null;
  unlocked.delete(b.id);
  passOf.delete(b.id);
  b.updatedAt = Date.now();
  renderBoardRail();
  save();
  toast(t('msg.boardUnlocked', { name: boardLabel(b) }));
}

/* The passphrase dialog. Resolves to the string, or '' when cancelled. */
let passResolve = null;
function passErr(msg) {
  const e = $('passErr');
  e.textContent = msg || '';
  e.classList.toggle('hidden', !msg);
}
function askPass(opts) {
  $('passTitle').textContent = opts.title;
  $('passBody').textContent = opts.body;
  $('passOk').textContent = opts.ok;
  $('passTwoWrap').classList.toggle('hidden', !opts.confirm);
  $('passOne').value = ''; $('passTwo').value = '';
  /* `err` carries a message in from the previous attempt. The retry loop in
     unlockBoard() calls askPass again immediately, so setting the error before
     that call and clearing it here would blank it out on the way past — which
     looked exactly like the dialog ignoring a wrong passphrase. */
  passErr(opts.err || '');
  $('passDlg').classList.remove('hidden');
  $('passDlg').dataset.confirm = opts.confirm ? '1' : '';
  setTimeout(() => $('passOne').focus(), 30);
  return new Promise((res) => { passResolve = res; });
}
function submitPass() {
  const one = $('passOne').value;
  const two = $('passTwo').value;
  const needsTwo = $('passDlg').dataset.confirm === '1';
  if (!one) { passErr(t('pass.empty')); return; }
  if (needsTwo && one !== two) { passErr(t('pass.mismatch')); return; }
  if (needsTwo && one.length < 8) { passErr(t('pass.short')); return; }
  $('passDlg').classList.add('hidden');
  if (passResolve) { passResolve(one); passResolve = null; }
}
function cancelPass() {
  $('passDlg').classList.add('hidden');
  if (passResolve) { passResolve(''); passResolve = null; }
}

/* --- focus one colour ---------------------------------------------------
   Colours and icons were already on every note and did nothing but decorate.
   This makes them a filter: pick a colour and everything else fades back,
   without a single note moving. Not stored — it is a way of looking at the
   board for a minute, not a property of it. */
/* One mechanism, two questions: "show me the red ones" and "show me everything
   that is blocked".

   Colour focus used to enumerate every colour in the stylesheet —
   `body.focusing[data-focus-color="red"] .note[data-color="red"]` and eight
   more. That cannot extend to statuses, because status ids are the user's own
   and there is no list to enumerate. So the *match* moves into JavaScript: a
   note that survives the filter gets `.focus-hit`, and the stylesheet only has
   to know "dim, except the hits".

   Which is also why `syncFocusClasses()` has to run after anything that mounts
   a note. Culling puts notes into the document as you pan, and a note that
   arrived after the filter was set would otherwise come in bright. */
let focusKind = '';        // '' | 'colour' | 'status' | 'date'
let focusValue = '';

function noteMatchesFocus(n) {
  if (!focusKind) return true;
  if (focusKind === 'colour') return (n.color || 'default') === focusValue;
  // 'due' is the only date filter: gone or today, and not finished
  if (focusKind === 'date') { const w = dateState(n); return w === 'late' || w === 'today'; }
  return (n.status || '') === focusValue;
}
function syncFocusClasses() {
  requestFar();          // the canvas dims what the filter does not match (far.js)
  if (!focusKind) { els.forEach((el) => el.classList.remove('focus-hit')); return; }
  els.forEach((el, id) => {
    const n = state.notes.find((x) => x.id === id);
    el.classList.toggle('focus-hit', !!n && noteMatchesFocus(n));
  });
}

function setFocus(kind, value) {
  const same = focusKind === kind && focusValue === value;
  focusKind = same ? '' : kind;
  focusValue = same ? '' : (value == null ? '' : value);
  document.body.classList.toggle('focusing', !!focusKind);
  if (focusKind === 'colour') document.body.dataset.focusColor = focusValue;
  else delete document.body.dataset.focusColor;
  syncFocusClasses();
  const chip = $('focusChip');
  chip.classList.toggle('hidden', !focusKind);
  if (!focusKind) return;
  const n = state.notes.filter(noteMatchesFocus).length;
  if (focusKind === 'colour') {
    paintColor(chip, focusValue);
    $('focusLabel').textContent = t('focus.on', { name: colorName(focusValue), n });
  } else if (focusKind === 'date') {
    paintColor(chip, 'red');
    $('focusLabel').textContent = t('focus.on', { name: t('date.due'), n });
  } else {
    const s = statusById(focusValue);
    paintColor(chip, s ? s.color : 'default');
    $('focusLabel').textContent = t('focus.on', { name: s ? statusName(s) : t('status.none'), n });
  }
}
const setColourFocus = (c) => setFocus('colour', c || 'default');
/* '' is a real answer here — "show me the ones nobody has given a status to" is
   the question a manager asks on a board that has drifted. */
const setStatusFocus = (id) => setFocus('status', id == null ? '' : id);
const setDueFocus = () => setFocus('date', 'due');
const clearFocus = () => { if (focusKind) setFocus(focusKind, focusValue); };

/* --- reminders ----------------------------------------------------------
   A to-do checkbox that nothing ever tells you about is a list you have to
   remember to read. `remindAt` is a plain timestamp on the note; a ticker
   checks it. `reminded` stops it firing twice — including across a restart,
   because it is saved with the note.

   The check runs every 20s rather than on a per-note timer: a timer per note
   would need cancelling on every edit, delete, board switch and undo, and
   getting one of those wrong means a reminder for a note that no longer
   exists. Scanning is cheap and cannot drift out of sync with the model. */
const REMIND_TICK = 20000;

/* When a repeating reminder is next due.

   Two things here are the whole point, and both are about the app having been
   *shut*:

   - **It rolls forward past now, in a loop.** A daily reminder and a fortnight
     away means fourteen occurrences went by. Advancing by one would fire it,
     advance one day, fire it again on the next tick, and keep going until it
     caught up — fourteen notifications for one recurring task. Skipping
     straight to the next one that has not happened yet is what somebody
     returning from leave actually wants: the reminder is due today, not
     fourteen times over.
   - **Month arithmetic is clamped.** `setMonth(+1)` on the 31st of January
     gives the 3rd of March, because February has no 31st and JavaScript rolls
     over rather than clamping. A monthly reminder set on the 31st would walk
     forward through the calendar a few days at a time. Clamping to the last day
     of the target month keeps "the 31st, or the last day if there isn't one",
     which is what a month-end task means. */
/* Written out as literal t() calls rather than built from the id, so
   tools/check-lang.js can see all four — the same reason the quick-reminder
   labels next door are spelled out. A `remind.` prefix exemption would be one
   line shorter and would stop the checker looking at any of them. */
function repeatLabel(rep) {
  if (rep === 'daily') return t('remind.daily');
  if (rep === 'weekdays') return t('remind.weekdays');
  if (rep === 'weekly') return t('remind.weekly');
  if (rep === 'monthly') return t('remind.monthly');
  return '';
}

function nextOccurrence(ms, repeat) {
  if (!REPEATS.includes(repeat) || !repeat || !ms) return 0;
  const step = (d) => {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekdays') { do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6); }
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') {
      const day = d.getDate();
      const lastHere = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(1);                                   // never overflow while moving month
      d.setMonth(d.getMonth() + 1);
      const lastThere = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      /* "The 31st" and "the last day of the month" are the same intention, and
         clamping alone loses it: Jan 31 → Feb 28 → Mar 28 → Apr 28, so a
         month-end task quietly walks back to the 28th and stays there. If the
         reminder is *on* the last day of its month, it moves to the last day of
         the next one — Jan 31 → Feb 28 → Mar 31 → Apr 30. An ordinary date like
         the 15th just clamps, which only ever matters for 29–31. */
      d.setDate(day === lastHere ? lastThere : Math.min(day, lastThere));
    }
  };
  const d = new Date(ms);
  const now = Date.now();
  // at most a few thousand steps even for a daily reminder abandoned for years
  for (let i = 0; i < 4000; i++) {
    step(d);
    if (d.getTime() > now) return d.getTime();
  }
  return 0;                                            // give up rather than loop
}
function startReminders() {
  watchDayChange();                        // the date pills' "Today" goes stale at midnight
  setInterval(checkReminders, REMIND_TICK);
  setTimeout(checkReminders, 3000);
}
function checkReminders() {
  const now = Date.now();
  let dirty = false;
  /* Gather first, notify second. One pass used to fire a notification per note
     as it found it, which is fine while the app is running — at most one or two
     come due in any twenty-second tick — and awful on the first tick after a
     launch, where *everything* that fell due while the app was shut comes due
     at once. Three days away meant three notifications stacking up on top of
     each other, for things one, two and three days stale, and a wall of
     notifications is one you dismiss without reading. */
  const due = [];
  state.boards.forEach((b) => {
    if (isLocked(b)) return;                 // cannot read it, cannot remind on it
    const notes = b.id === state.activeBoard ? state.notes : b.notes;
    notes.forEach((n) => {
      if (!n.remindAt || n.reminded || n.remindAt > now) return;
      dirty = true;
      /* A repeating reminder is never "done" — it moves to its next occurrence
         and stays armed. `reminded` is only latched for a one-off, which is
         what stops it firing twice, including across a restart. */
      const next = nextOccurrence(n.remindAt, n.repeat);
      if (next) { n.remindAt = next; n.reminded = false; } else { n.reminded = true; }
      due.push({ n, b });
      markDueNow(n, b);
    });
  });
  if (due.length === 1) fireReminder(due[0].n, due[0].b);
  else if (due.length > 1) fireGroupedReminder(due);
  if (dirty) { repaintAllMarks(); saveSoon(); }
}

// the note itself glows, whether it was announced on its own or in a group
function markDueNow(n, board) {
  if (board.id !== state.activeBoard) return;
  const el = els.get(n.id);
  if (el) { el.classList.add('due-now'); setTimeout(() => el.classList.remove('due-now'), 6000); }
}

const reminderTitle = (n) => noteText(n).slice(0, 60) || t('remind.untitled');

function fireReminder(n, board) {
  const title = reminderTitle(n);
  const body = board.id === state.activeBoard ? '' : t('remind.onBoard', { name: boardLabel(board) });
  try {
    const notif = new Notification(title, { body, silent: false });
    notif.onclick = () => { if (WIN && WIN.show) WIN.show(); revealNote(n, board); };
  } catch (_) {
    // notifications denied or unavailable — say it in the window instead
    toast(t('remind.due', { name: title }), 6000);
  }
}

/* Several at once — which in practice means "these fell due while you were
   away". One notification that says how many and names the first couple, rather
   than one per note. Clicking it opens the app on the first of them; the rest
   are findable because every one of them is still marked on its own note. */
function fireGroupedReminder(due) {
  const names = due.slice(0, 3).map(({ n }) => reminderTitle(n));
  const more = due.length - names.length;
  const body = names.join('\n') + (more > 0 ? '\n' + t('remind.andMore', { n: more }) : '');
  const title = t('remind.whileAway', { n: due.length });
  try {
    const notif = new Notification(title, { body, silent: false });
    notif.onclick = () => { if (WIN && WIN.show) WIN.show(); revealNote(due[0].n, due[0].b); };
  } catch (_) {
    toast(title, 8000);
  }
  toast(title, 6000);
}
function repaintAllMarks() { state.notes.forEach((n) => repaintMarks(n.id)); }

let remindTargetId = null;
function openRemindDialog(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  remindTargetId = id;
  const now = new Date();
  /* The labels are written out as literal t() calls rather than built from the
     key, so check-lang can see them. A `remind.` prefix exemption would have
     been one line shorter and would have stopped checking the whole group. */
  const at9 = (days) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(9, 0, 0, 0); return d.getTime(); };
  const opts = [
    { k: 'in1h', label: t('remind.in1h'), at: () => Date.now() + 3600e3 },
    { k: 'in3h', label: t('remind.in3h'), at: () => Date.now() + 3 * 3600e3 },
    { k: 'tomorrow', label: t('remind.tomorrow'), at: () => at9(1) },
    { k: 'nextWeek', label: t('remind.nextWeek'), at: () => at9(7) }
  ];
  $('rmQuick').innerHTML = opts.map((o) =>
    `<button class="rm-opt" data-k="${o.k}">${icon('schedule')}<span>${esc(o.label)}</span></button>`).join('');
  $('rmQuick').querySelectorAll('.rm-opt').forEach((b) => b.addEventListener('click', () => {
    const o = opts.find((x) => x.k === b.dataset.k);
    if (o) setReminder(o.at(), pickedRepeat());
  }));
  /* The repeat row is a plain segmented control with no handler of its own —
     it is *read* when the reminder is set, so choosing "Weekly" and then a
     quick option works the same way as choosing a custom time. */
  const rep = REPEATS.includes(n.repeat) ? n.repeat : '';
  $('rmRepeat').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', (b.dataset.rep || '') === rep);
    b.onclick = () => $('rmRepeat').querySelectorAll('button')
      .forEach((x) => x.classList.toggle('on', x === b));
  });
  $('remindNow').textContent = n.remindAt
    ? t('remind.current', { when: fmtWhen(n.remindAt) }) + (n.repeat ? ' · ' + repeatLabel(n.repeat) : '')
    : t('remind.none');
  // datetime-local wants local time with no zone, so offset before slicing
  const seed = new Date(n.remindAt || (Date.now() + 3600e3));
  $('rmWhen').value = new Date(seed.getTime() - seed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  $('remindDlg').classList.remove('hidden');
}
// which repeat the row is showing right now
function pickedRepeat() {
  const on = $('rmRepeat') && $('rmRepeat').querySelector('button.on');
  const v = on ? (on.dataset.rep || '') : '';
  return REPEATS.includes(v) ? v : '';
}

function setReminder(ms, repeat) {
  const n = state.notes.find((x) => x.id === remindTargetId);
  $('remindDlg').classList.add('hidden');
  if (!n) return;
  n.repeat = REPEATS.includes(repeat) ? repeat : '';
  n.remindAt = ms || 0;
  if (!ms) { n.repeat = ''; n.reminded = true; }
  else if (ms <= Date.now() && n.repeat) {
    /* Setting a repeating reminder to a time that has already passed means
       "this cadence, starting from then" — so move it to the next occurrence
       rather than firing immediately and looking broken. */
    n.remindAt = nextOccurrence(ms, n.repeat) || ms;
    n.reminded = false;
  } else {
    n.reminded = ms <= Date.now();
  }
  repaintMarks(n.id);
  save();
  if (!ms) { toast(t('remind.cleared')); return; }
  toast(t('remind.saved', { when: fmtWhen(n.remindAt) }) + (n.repeat ? ' · ' + repeatLabel(n.repeat) : ''));
}

/* --- a note for today ---------------------------------------------------
   One dated note per day on a chosen board. Checked on launch rather than on a
   midnight timer: the app is not always running at midnight, and "it appears
   the first time you open it that day" is both simpler and what people
   actually expect. */
function todayKey(d) {
  const x = d || new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function maybeDailyNote() {
  const s = state.settings;
  if (!s.daily) return;
  const b = boardById(s.dailyBoard) || activeBoard();
  if (!b || isLocked(b) || b.archived) return;
  const key = todayKey();
  const notes = b.id === state.activeBoard ? state.notes : b.notes;
  if (notes.some((n) => n.daily === key)) return;

  let dateLabel;
  try {
    dateLabel = new Intl.DateTimeFormat(LANG._locale || LANG_ID, { dateStyle: 'full' }).format(new Date());
  } catch (_) { dateLabel = key; }

  const body = `<h2>${esc(dateLabel)}</h2><ul class="mb-todo"><li></li></ul>`;
  const n = {
    id: uid(),
    x: 0, y: 0, w: 320, h: 240,
    body, color: 'blue', icon: 'today', iconColor: 'auto',
    z: ++b.nextZ, remindAt: 0, reminded: false, repeat: '', hist: [], daily: key
  };
  /* Stack the day's notes down the left of wherever that board's content
     starts, so they do not land on top of yesterday's. */
  const others = notes.filter((x) => x.daily);
  n.x = others.length ? others[0].x : 60;
  n.y = others.length ? maxOf(others, (o) => o.y + o.h) + 24 : 60;
  notes.push(n);
  b.updatedAt = Date.now();
  if (b.id === state.activeBoard) { render(); drawCompass(); }
  renderBoardRail();
  save();
}

/* --- quick capture ------------------------------------------------------
   A global hotkey (registered in main.js) shows the window and opens this. It
   deliberately routes through the renderer rather than writing to the store
   from the main process: the renderer holds `state` in memory, and a second
   writer would race the debounced save and lose whichever side wrote last. */
function openCapture() {
  const b = boardById(state.settings.dailyBoard) || activeBoard();
  if (!b) return;
  $('capTo').textContent = t('cap.to', { name: boardLabel(b) });
  $('capInput').value = '';
  $('capture').classList.remove('hidden');
  setTimeout(() => $('capInput').focus(), 30);
}
function closeCapture() { $('capture').classList.add('hidden'); }
function saveCapture() {
  const text = $('capInput').value.trim();
  closeCapture();
  if (!text) return;
  const target = boardById(state.settings.dailyBoard) || activeBoard();
  if (!target || isLocked(target)) { toast(t('msg.captureFailed')); return; }
  const body = text.split(/\n+/).map((line) => `<p>${esc(line)}</p>`).join('');
  if (target.id === state.activeBoard) {
    addNote(null, { body, color: 'amber', icon: 'bolt', edit: false });
  } else {
    const n = {
      id: uid(), x: 60, y: 60 + target.notes.length * 24, w: 280, h: 190,
      body, color: 'amber', icon: 'bolt', iconColor: 'auto',
      z: ++target.nextZ, remindAt: 0, reminded: false, repeat: '', hist: []
    };
    target.notes.push(n);
    target.updatedAt = Date.now();
    renderBoardRail();
  }
  save();
  toast(t('cap.added', { name: boardLabel(target) }));
}

/* --- the jump palette ---------------------------------------------------
   Ctrl+P: type a few words, land on the thing. Notes across every board,
   boards themselves, and the handful of commands worth reaching without
   remembering a chord.

   Deliberately not fuzzy in the subsequence sense ("nb" matching "note board").
   That scores well on demos and badly in use — on a board with hundreds of
   notes, subsequence matching returns a screen of things that merely contain
   the right letters somewhere. Word-prefix and substring matching return fewer
   results and the right ones. */
const palette = { open: false, items: [], sel: 0 };

function paletteCommands() {
  return [
    { kind: 'cmd', ic: 'add', label: t('pal.newNote'), run: () => addNote() },
    { kind: 'cmd', ic: 'select_all', label: t('pal.newFrame'), run: () => addFrame() },
    { kind: 'cmd', ic: 'space_dashboard', label: t('board.add'), run: () => addBoard() },
    { kind: 'cmd', ic: 'search', label: t('pal.find'), run: () => openFind() },
    { kind: 'cmd', ic: 'fit_screen', label: t('menu.fit'), run: () => zoomToFitAll() },
    { kind: 'cmd', ic: 'settings', label: t('set.title'), run: () => openSettings() },
    ...userTemplates().map((x) => ({
      kind: 'cmd', ic: x.icon || 'sticky_note_2', label: t('pal.template', { name: templateName(x) }),
      run: () => applyTemplate(x.id)
    }))
  ];
}

/* **Both arguments are already folded.** Folding here instead would mean
   re-folding every note's text on every keystroke, which is the work
   noteTextFolded()'s cache exists to avoid — so the contract is that callers
   hand over comparison keys, not raw text. See foldSearch() in §1. */
function scoreHit(s, q) {
  if (s === q) return 0;
  if (s.startsWith(q)) return 1;
  /* A word inside it starting with the query beats the same letters mid-word.
     `\b` is ASCII-only in JavaScript, so between two Arabic letters there is no
     boundary and this rung never fires for Arabic — the includes() below still
     matches, the hit just sorts one place lower. Correct enough, and the fix
     would be a lookbehind that Chromium supports and nothing else needs. */
  if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(s)) return 2;
  return s.includes(q) ? 3 : -1;
}

function paletteItems(raw) {
  const q = foldSearch(raw.trim());
  const out = [];
  syncActiveBoard();

  state.boards.forEach((b) => {
    if (b.archived && !state.settings.showArchived) return;
    const label = boardLabel(b);
    const sc = q ? scoreHit(foldSearch(label), q) : 2;
    if (sc >= 0) out.push({ kind: 'board', ic: isLocked(b) ? 'lock' : (b.icon || 'sticky_note_2'), label, sub: t('pal.board'), score: sc, board: b });
    if (isLocked(b)) return;                       // nothing readable inside
    b.notes.forEach((n) => {
      const text = noteText(n);
      if (!text) return;
      // the folded copy is already cached beside the text, so this is a lookup
      const sc2 = q ? scoreHit(noteTextFolded(n), q) : -1;
      if (sc2 < 0) return;
      out.push({
        kind: 'note', ic: n.icon || 'sticky_note_2',
        label: text.slice(0, 90), sub: boardLabel(b),
        score: sc2 + (b.id === state.activeBoard ? 0 : 0.5),   // this board first
        note: n, board: b
      });
    });
  });

  paletteCommands().forEach((c) => {
    const sc = q ? scoreHit(foldSearch(c.label), q) : 1.5;
    if (sc >= 0) out.push(Object.assign({ sub: t('pal.command'), score: sc + 0.2 }, c));
  });

  out.sort((a, b) => a.score - b.score);
  return out.slice(0, 60);
}

function openPalette() {
  exitEdit();
  palette.open = true; palette.sel = 0;
  $('palette').classList.remove('hidden');
  const inp = $('palInput');
  inp.value = '';
  renderPalette();
  setTimeout(() => inp.focus(), 20);
}
function closePalette() {
  palette.open = false;
  $('palette').classList.add('hidden');
}
function renderPalette() {
  palette.items = paletteItems($('palInput').value);
  const list = $('palList');
  if (!palette.items.length) {
    list.innerHTML = `<div class="sm-empty">${te('pal.none')}</div>`;
    return;
  }
  if (palette.sel >= palette.items.length) palette.sel = 0;
  list.innerHTML = palette.items.map((it, i) =>
    `<button class="pal-item${i === palette.sel ? ' sel' : ''}" data-i="${i}">
       <span class="pal-ic">${icon(it.ic)}</span>
       <span class="pal-tx"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></span>
     </button>`).join('');
  list.querySelectorAll('.pal-item').forEach((el) => {
    el.addEventListener('mousedown', (e) => { e.preventDefault(); runPalette(+el.dataset.i); });
    el.addEventListener('mouseenter', () => { palette.sel = +el.dataset.i; markPaletteSel(); });
  });
}
function markPaletteSel() {
  $('palList').querySelectorAll('.pal-item').forEach((el, i) => {
    el.classList.toggle('sel', i === palette.sel);
    if (i === palette.sel) el.scrollIntoView({ block: 'nearest' });
  });
}
async function runPalette(i) {
  const it = palette.items[i];
  closePalette();
  if (!it) return;
  if (it.kind === 'note') { await revealNote(it.note, it.board); return; }
  if (it.kind === 'board') { await switchBoard(it.board.id); return; }
  it.run();
}
function paletteKey(e) {
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); $('viewport').focus(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!palette.items.length) return;
    palette.sel = (palette.sel + (e.key === 'ArrowDown' ? 1 : -1) + palette.items.length) % palette.items.length;
    markPaletteSel();
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); runPalette(palette.sel); }
}
