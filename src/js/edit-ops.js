/* Mental Board — edit-ops.js
   Create, delete, arrange, duplicate, the trash, undo, the clipboard, find, and the image export.

   Part 13 of 17. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 14. create / delete / undo / clipboard / find ─────────────── */
/* opts: { body, color, icon, w, h, edit }. Size is a parameter because a
   template knows how big it needs to be — a seven-row table in a 280px note is
   a scrollbar, not a table. */
function addNote(worldPt, opts) {
  if (!canEditHere()) return null;
  pushUndo();
  const o = opts || {};
  const c = worldPt || viewCenterWorld();
  /* The caller's size wins, then the user's default, then the app's. A template
     knows how big it needs to be — a seven-row table in a 280px note is a
     scrollbar, not a table — so `opts` is never overruled here. */
  const s = state.settings;
  const w = Math.max(o.pic ? PIC_MIN : NOTE_MIN_W, +o.w || +s.noteW || 280);
  const h = Math.max(o.pic ? PIC_MIN : NOTE_MIN_H, +o.h || +s.noteH || 190);
  const n = {
    id: uid(),
    x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2),
    w, h,
    body: o.body || '',
    color: COLORS.includes(o.color) ? o.color : (COLORS.includes(s.noteColor) ? s.noteColor : 'default'),
    icon: okIcon(o.icon), iconColor: 'auto',
    z: ++state.nextZ,
    remindAt: 0, reminded: false, repeat: '', hist: []
  };
  // a picture on its own — see pictures.js
  if (o.pic) { n.pic = true; n.ar = +o.ar > 0 ? +o.ar : w / h; }
  state.notes.push(n);
  const el = makeNote(n);
  $('notesLayer').appendChild(el);
  els.set(n.id, el);
  updateCulling();
  updateEmpty(); refreshFrameCounts(); save();
  setSelection([n.id], false);
  if (!n.pic && (!opts || opts.edit !== false)) setTimeout(() => enterEdit(n), 20);
  return n;
}

function addFrame(worldPt) {
  if (!canEditHere()) return null;
  pushUndo();
  const c = worldPt || viewCenterWorld();
  const f = {
    id: uid(),
    x: Math.round(c.x - 320), y: Math.round(c.y - 210),
    w: 640, h: 420,
    title: t('frame.numbered', { n: state.frames.length + 1 }),
    color: COLORS[1 + (state.frames.length % (COLORS.length - 1))],
    icon: '', iconColor: 'auto', titlePos: 'tl'
  };
  state.frames.push(f);
  const el = makeFrame(f);
  $('framesLayer').appendChild(el);
  els.set(f.id, el);
  updateCulling();          // this frame may be the one that crosses the threshold
  updateEmpty(); refreshFrameCounts(); save();
  setSelection([f.id], false);
  setTimeout(() => renameFrame(f.id), 30);
  return f;
}

// wrap the current selection in a new frame
function groupSelection() {
  const items = selectedItems().filter((it) => !isFrame(it.id));
  if (!items.length) { toast(t('msg.selectFirst')); return; }
  pushUndo();
  const b = bboxOf(items);
  const p = 46;
  const f = {
    id: uid(),
    x: Math.round(b.x - p), y: Math.round(b.y - p),
    w: Math.round(b.w + p * 2), h: Math.round(b.h + p * 2),
    title: t('frame.numbered', { n: state.frames.length + 1 }),
    color: COLORS[1 + (state.frames.length % (COLORS.length - 1))],
    icon: '', iconColor: 'auto', titlePos: 'tl'
  };
  state.frames.push(f);
  const el = makeFrame(f);
  $('framesLayer').appendChild(el);
  els.set(f.id, el);
  refreshFrameCounts(); save(); updateEmpty();
  setSelection([f.id], false);
  setTimeout(() => renameFrame(f.id), 30);
}

/* --- tidy up a selection ------------------------------------------------
   Two lines of maths that save a minute of dragging. Notes only: a workflow
   frame is a container, and moving containers into a grid would drag every
   note inside them somewhere they were not put.

   Three things make this feel right rather than merely correct:

   - **Reading order is preserved.** Items are sorted top-to-bottom then
     left-to-right, banded so that two notes whose tops differ by a few pixels
     count as the same row. Sorting by raw y alone reshuffles a row that was
     already tidy, and the one thing an arrange must not do is scramble an
     order the user can see.
   - **The cell is the largest item, not the average.** Anything smaller is
     centred in its cell. Packing to the average overlaps the big ones, and an
     arrange that leaves things overlapping has done the opposite of its job.
   - **It anchors at the selection's own top-left**, so the block stays where
     it was rather than jumping to the middle of the screen. */
const ARRANGE_GAP = 26;
function arrangeSelection(mode) {
  if (!canEditHere()) return;
  const items = selectedItems().filter((it) => !isFrame(it.id));
  if (items.length < 2) { toast(t('msg.arrangeNeedTwo')); return; }
  pushUndoGeom(items);      // it only ever moves notes that are already there

  const rowBand = 24;
  const ordered = items.slice().sort((a, b) =>
    (Math.abs(a.y - b.y) > rowBand ? a.y - b.y : a.x - b.x));

  const b = bboxOf(ordered);
  const cw = maxOf(ordered, (n) => n.w);
  const ch = maxOf(ordered, (n) => n.h);
  const cols = mode === 'row' ? ordered.length
             : mode === 'column' ? 1
             : Math.max(1, Math.round(Math.sqrt(ordered.length)));

  ordered.forEach((n, i) => {
    const cx = b.x + (i % cols) * (cw + ARRANGE_GAP);
    const cy = b.y + Math.floor(i / cols) * (ch + ARRANGE_GAP);
    // centre anything smaller than the cell, so a row of mixed sizes lines up
    // on its middle rather than on its top-left corner
    n.x = Math.round(cx + (cw - n.w) / 2);
    n.y = Math.round(cy + (ch - n.h) / 2);
    if (state.settings.snap) {
      const g = gridStep();
      n.x = Math.round(n.x / g) * g;
      n.y = Math.round(n.y / g) * g;
    }
    const el = els.get(n.id);
    if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
  });

  updateCulling();
  drawLinks(); refreshFrameCounts(); drawCompass(); save();
  toast(t('msg.arranged', { n: ordered.length }));
}

/* --- the trash ----------------------------------------------------------
   Deleting used to be undo-or-nothing: the stack is in memory, so closing the
   window turned "I can get that back" into "that is gone". A board you can
   look in is a better promise than a dialog asking whether you are sure —
   being able to change your mind tomorrow beats being made careful today.

   The trash is an ordinary board with `trash: true`. That is the whole trick,
   and it is the same one boards themselves use: it saves, syncs, renders,
   culls and searches through the code that already exists, and there is no
   second storage shape to keep honest. It is made on demand, so anybody who
   never deletes anything never has one. */
const trashOf = () => state.boards.find((b) => b.trash) || null;
// standing in the bin changes what the verbs on screen should say
const onTrashBoard = () => { const b = activeBoard(); return !!(b && b.trash); };
function ensureTrash() {
  let b = trashOf();
  if (b) return b;
  b = makeBoard('', 'delete');
  b.trash = true;
  state.boards.push(b);
  return b;
}
// where the trash lays the next thing down, so items do not stack on one spot
function trashSpot(tb, i) {
  const per = 6;
  const n = tb.notes.length + i;
  return { x: (n % per) * 300, y: Math.floor(n / per) * 230 };
}

/* Delete, with the question in front of it if the user asked for one.

   Every visible way to remove something — the key, the note's own close button,
   the right-click menu — comes through here, so the setting is honoured
   everywhere or nowhere rather than in two places out of three.

   `pushUndo()` moved inside. It used to sit at each of the three call sites,
   which meant adding an `await` in front of any of them would have pushed the
   step *before* a dialog the user might cancel — an undo step for a delete that
   never happened, and one press of Ctrl+Z that appears to do nothing.

   Off by default, and it should stay off by default: deleting already goes to
   the bin and Ctrl+Z already puts it back, so the ordinary case has two ways
   out and does not need a third. Inside the bin it is a different question —
   that delete is final — but emptyTrash() has always asked on its own account
   and still does. */
async function askThenDelete(ids) {
  if (!ids || !ids.length) return;
  if (state.settings.confirmDelete) {
    const ok = await confirmDlg(
      t('confirm.delItemsTitle', { n: ids.length }),
      t(onTrashBoard() ? 'confirm.delItemsFinal' : 'confirm.delItemsBody'),
      t('confirm.delItemsOk'));
    if (!ok) return;
  }
  pushUndo();
  deleteItems(ids);
}

function deleteItems(ids) {
  if (editing && ids.includes(editNote?.id)) { editing = null; editNote = null; }
  const set = new Set(ids);
  const here = activeBoard();

  /* Emptying the trash is the one delete that really deletes, and deleting
     *from* the trash has to mean that too — otherwise the bin would put things
     back into itself and never empty. */
  if (!(here && here.trash)) {
    const tb = ensureTrash();
    const going = [
      ...state.notes.filter((n) => set.has(n.id)),
      ...state.frames.filter((f) => set.has(f.id))
    ];
    going.forEach((it, i) => {
      const copy = JSON.parse(JSON.stringify(it));
      /* Where it came from and when. `from` is what Put back reads; the board
         may be gone, archived or locked by then, which is why putBack() has a
         fallback — the first live, unlocked board, never the one in front of
         you. See the note there for why that distinction is not cosmetic. */
      copy.trashedFrom = here ? here.id : '';
      copy.trashedAt = Date.now();
      const at = trashSpot(tb, i);
      copy.x = at.x; copy.y = at.y;
      if (isFrame(it.id)) tb.frames.push(copy);
      else { copy.z = ++tb.nextZ; tb.notes.push(copy); }
    });
  }

  state.notes = state.notes.filter((n) => !set.has(n.id));
  state.frames = state.frames.filter((f) => !set.has(f.id));
  state.links = state.links.filter((l) => !set.has(l.from) && !set.has(l.to));
  ids.forEach((id) => { els.get(id)?.remove(); els.delete(id); selection.delete(id); });
  updateCulling();
  drawLinks(); refreshFrameCounts(); updateEmpty(); drawCompass(); renderBoardRail(); save();
}

/* Put something back where it came from. The board it came from may have been
   deleted, archived away or locked since, so every item also needs a fallback.

   The fallback may not be "the board in front of us", which is what it used to
   be. Put back is only ever offered while you are standing in the bin — see the
   onTrashBoard() guard in §12 — so `state.notes` *is* `tb.notes`, the same array
   object, and pushing onto it put the item straight back into the bin. The
   filter below then removed it along with the copy it was meant to replace: the
   item landed on no board at all, the toast said it had been put back, and only
   Ctrl+Z could tell you otherwise. Same trap syncActiveBoard() exists for, one
   more time: the live mirror and the stored board are one array, not two.

   So an item with no usable origin goes to the first live board instead. A
   locked board is never a candidate in either position — it holds no plaintext,
   and syncActiveBoard() would refuse to store whatever we pushed into it, which
   is the same disappearance by a longer route. When there is no candidate at
   all, the item stays in the bin and we say so; the bin is the one place it is
   still safe. */
function putBack(ids) {
  const tb = trashOf();
  if (!tb) return;
  const set = new Set(ids);
  const items = [...tb.notes.filter((n) => set.has(n.id)), ...tb.frames.filter((f) => set.has(f.id))];
  if (!items.length) return;

  const spare = liveBoards().find((b) => !isLocked(b)) || null;
  const homeOf = (it) => {
    const b = boardById(it.trashedFrom);
    return (b && !b.trash && !isLocked(b)) ? b : spare;
  };
  const going = items.filter(homeOf);
  if (!going.length) { toast(t('msg.putBackNowhere'), 4200); return; }

  pushUndo();
  let restored = 0, elsewhere = 0;
  going.forEach((it) => {
    const target = homeOf(it);
    // only a return to its *own* board earns the "on its own board" message
    const ownBoard = boardById(it.trashedFrom) === target;
    delete it.trashedFrom; delete it.trashedAt;
    if (target.id !== state.activeBoard) {
      if (isFrame(it.id)) target.frames.push(it); else { it.z = ++target.nextZ; target.notes.push(it); }
      if (ownBoard) elsewhere++;
    } else {
      /* Onto the board in front of us, in the middle of what we are looking at.
         Unreachable from the bin — `target` is never the bin — and kept for a
         caller that puts something back while standing somewhere else. */
      const c = viewCenterWorld();
      it.x = Math.round(c.x - it.w / 2 + restored * 24);
      it.y = Math.round(c.y - it.h / 2 + restored * 24);
      if (isFrame(it.id)) state.frames.push(it); else { it.z = ++state.nextZ; state.notes.push(it); }
      restored++;
    }
  });
  /* What actually moved, not what was asked for. Anything left behind is still
     in the bin and must not be filtered out of it. */
  const moved = new Set(going.map((it) => it.id));
  tb.notes = tb.notes.filter((n) => !moved.has(n.id));
  tb.frames = tb.frames.filter((f) => !moved.has(f.id));
  /* Rebind when the bin is what is on screen. `state.notes` is the *live
     mirror* of the open board — the same array object, not a copy — and the
     two filters above replaced `tb.notes` with new arrays rather than mutating
     them. Leave the mirror pointing at the old ones and the next save copies
     them straight back over the new ones, so the item you just put back is on
     its own board *and* still in the bin. Same trap `syncActiveBoard()` was
     written for, from the other side. */
  if (state.activeBoard === tb.id) bindBoard(tb);
  moved.forEach((id) => { els.get(id)?.remove(); els.delete(id); selection.delete(id); });
  render(); drawCompass(); renderBoardRail(); save();
  toast(elsewhere ? t('msg.putBackBoards', { n: going.length }) : t('msg.putBack', { n: going.length }));
  /* The pictures follow. A note that came out of a deleted board points at
     the bin's copies; one going to a board that is not its own points at its
     old board's. Either way the file is copied into the board it now sits on
     and the note re-addressed, once the copy lands. */
  const byBoard = new Map();
  going.forEach((it) => {
    if (isFrame(it.id)) return;
    const target = homeOf(it);
    if (!target) return;
    if (!byBoard.has(target.id)) byBoard.set(target.id, []);
    byBoard.get(target.id).push(it);
  });
  byBoard.forEach((notes, boardId) => {
    carryNotesTo(notes, boardId).then((n) => { if (n) { if (boardId === state.activeBoard) render(); saveSoon(); } });
  });
}

/* The only irreversible delete in the app, and the only one that asks. */
async function emptyTrash() {
  const tb = trashOf();
  const n = tb ? tb.notes.length + tb.frames.length : 0;
  if (!n) { toast(t('msg.trashEmpty')); return; }
  const ok = await confirmDlg(t('confirm.emptyTrashTitle'), t('confirm.emptyTrashBody', { n }), t('confirm.emptyTrashOk'));
  if (!ok) return;
  pushUndo();
  tb.notes = []; tb.frames = []; tb.links = []; tb.nextZ = 1;
  if (state.activeBoard === tb.id) { bindBoard(tb); clearSelection(); }
  markStatsStale();
  render(); drawCompass(); renderBoardRail(); save();
  toast(t('msg.trashEmptied', { n }));
}

function duplicate(ids) {
  if (!canEditHere()) return;
  pushUndo();
  const made = [];
  ids.forEach((id) => {
    const it = itemById(id);
    if (!it) return;
    const copy = JSON.parse(JSON.stringify(it));
    copy.id = uid(); copy.x += 34; copy.y += 34;
    if (isFrame(id)) {
      copy.title = t('frame.copy', { title: it.title });
      state.frames.push(copy);
      const el = makeFrame(copy); $('framesLayer').appendChild(el); els.set(copy.id, el);
    } else {
      copy.z = ++state.nextZ;
      state.notes.push(copy);
      const el = makeNote(copy); $('notesLayer').appendChild(el); els.set(copy.id, el);
    }
    made.push(copy.id);
  });
  /* Duplicating a selection can add dozens of items at once, so it is at least
     as likely as addNote() to be the call that carries the board over the
     culling threshold. Without this the items that should now be unmounted sit
     in the document until the next pan. Same for updateEmpty() and the compass:
     the board just changed shape. */
  updateCulling();
  refreshFrameCounts(); updateEmpty(); drawCompass(); save();
  setSelection(made, false);
}

function selectAll() { setSelection([...state.notes.map((n) => n.id), ...state.frames.map((f) => f.id)], false); }

/* --- an image pasted onto the canvas ------------------------------------
   Take a screenshot, click the board, Ctrl+V — and there it is, in a note of
   its own, sized to the picture.

   Inside a note this already worked: the editor's own paste handler catches an
   image on the clipboard and inserts it. On the canvas nothing did, because
   Ctrl+V there meant the app's *internal* clipboard — the notes you last cut
   or copied — and a screenshot is not one of those. So the most natural way
   anybody would try to get a picture in did nothing at all, twice over: the
   editor path was inserting a broken image (see preload's toUrl) and the
   canvas path was not listening.

   The note is sized from the image once it decodes, capped so a 4K screenshot
   does not arrive as a note the width of the board. */
/* Where the pointer last was, in world coordinates. A paste has no position of
   its own — the keyboard does not have a cursor on the canvas — so without
   this every pasted image would land in the middle of the viewport regardless
   of where you were looking. Updated on the pointermove the rail peek is
   already handling, so it costs two multiplications and no extra listener. */
let lastCanvasPoint = null;
function trackCanvasPoint(e) {
  if (e.target && e.target.closest && e.target.closest('.overlay, .titlebar, #boardRail')) return;
  lastCanvasPoint = toWorld(e.clientX, e.clientY);
}

const PASTED_IMG_MAX = 620;

/* A picture, as a note of its own — from a drop, a paste, or a screenshot.

   `taken` is the already-filed copy when the caller has one (the canvas drop
   files the whole batch before it starts making notes). Without it the file is
   taken in here, so a pasted screenshot lands in the board's folder like
   everything else instead of being inlined as a six-megabyte data URL in the
   board file — which is what this used to do, and what made every keystroke
   re-serialise those six megabytes. */
/* A picture dropped or pasted onto the canvas becomes a picture standing on
   the board — not a note with a picture in it. Drag it onto a note to put it
   inside one. See pictures.js. */
async function noteFromImage(file, worldPt, taken) {
  if (!canEditHere()) return null;
  if (!file) return null;
  const got = taken || await takeFileIn(file);
  if (!got) return null;
  return addPicture(worldPt, got);
}

/* The clipboard, whatever is on it. An image wins over the internal clipboard
   because if you have just taken a screenshot, that is plainly what you meant
   — the notes you copied twenty minutes ago are still there afterwards.

   Everything goes through the same filing as a drop, so a screenshot pasted on
   the canvas and a clip dragged onto it end up in the same place and are backed
   up by the same rule. */
function pasteAnything(e, worldPt) {
  const dt = e && (e.clipboardData || e.originalEvent?.clipboardData);
  const item = dt ? [...(dt.items || [])].find((i) => i.kind === 'file' && i.type && i.type.startsWith('image/')) : null;
  if (item) {
    const f = item.getAsFile();
    if (f) { e.preventDefault(); noteFromImage(f, worldPt); return true; }
  }
  /* Files on the clipboard — copying something in Explorer puts the file
     itself there, not its pixels. Not only images any more: a copied video or
     document pastes onto the canvas exactly as it drops onto it. */
  const files = dt && dt.files ? [...dt.files] : [];
  if (files.length) {
    e.preventDefault();
    (async () => {
      let i = 0;
      for (const f of files) {
        await noteFromDroppedFile(f, { x: worldPt.x + i * 40, y: worldPt.y + i * 40 });
        i++;
      }
    })();
    return true;
  }
  return false;
}

/* --- a note, as something you can paste somewhere else -------------------
   Ctrl+C on the canvas filled `clipboard` — an array of note objects — and
   nothing else. That is exactly right for pasting notes back onto a board and
   completely useless for the thing people actually do a dozen times a day:
   copy what a note says and put it in an email, a message, a document. There
   was no way to do it at all without opening the note, selecting the text by
   hand and copying that.

   So a copy now also puts the notes on the **system** clipboard, in two
   flavours, and the internal clipboard is untouched — Ctrl+V on the canvas
   still duplicates notes exactly as it did.

     text/plain — markdown-ish. Headings keep their level, checkboxes survive
                  as [ ] and [x], lists keep their bullets.
     text/html  — the note's own markup, so Outlook and Word keep the bold and
                  the lists rather than flattening them.

   Tables become **tab-separated** rows in the plain-text half. That is not a
   detail: tab-separated is what Excel and Sheets parse into cells, so copying a
   note with a table in it and pasting into a spreadsheet lands as a grid rather
   than as one string in one cell. */
const inlineText = (el) => {
  const c = el.cloneNode(true);
  c.querySelectorAll('ul, ol, table').forEach((x) => x.remove());   // handled on their own
  return (c.textContent || '').replace(/\s+/g, ' ').trim();
};

function noteToText(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  const lines = [];

  const walk = (root, depth) => {
    for (const node of root.children) {
      const tag = node.tagName;
      const pad = '  '.repeat(depth);

      if (tag === 'UL' || tag === 'OL') {
        const todo = node.classList.contains('mb-todo');
        [...node.children].forEach((li, i) => {
          const mark = todo ? (li.classList.contains('done') ? '[x] ' : '[ ] ')
                            : (tag === 'OL' ? (i + 1) + '. ' : '- ');
          const body = inlineText(li);
          if (body) lines.push(pad + mark + body);
          walk(li, depth + 1);            // a list inside a list item
        });
        continue;
      }
      if (tag === 'TABLE') {
        // tab-separated: what a spreadsheet parses into cells
        [...node.rows].forEach((r) => {
          lines.push(pad + [...r.cells].map((c) => (c.textContent || '').replace(/\s+/g, ' ').trim()).join('\t'));
        });
        continue;
      }
      if (tag === 'HR') { lines.push(pad + '---'); continue; }
      if (tag === 'PRE') { lines.push('```'); lines.push(node.textContent.replace(/​/g, '')); lines.push('```'); continue; }
      if (tag === 'DIV' && (node.classList.contains('mb-cols') || node.classList.contains('mb-col'))) { walk(node, depth); continue; }
      if (tag === 'DIV' && node.classList.contains('mb-embed')) {
        const a = node.querySelector('a');
        lines.push(pad + (node.dataset.title ? node.dataset.title + ' — ' : '') + ((a && a.getAttribute('href')) || ''));
        continue;
      }
      // copied out of the app, a video is its name: the file is not going with it
      if (tag === 'DIV' && node.classList.contains('mb-file')) {
        lines.push(pad + (node.dataset.name || ''));
        continue;
      }
      const body = inlineText(node);
      if (!body) { walk(node, depth); continue; }
      if (/^H[123]$/.test(tag)) lines.push(pad + '#'.repeat(+tag[1]) + ' ' + body);
      else if (tag === 'BLOCKQUOTE' || node.classList.contains('mb-callout')) lines.push(pad + '> ' + body);
      else lines.push(pad + body);
      // a paragraph can still hold a nested list in markup execCommand produced
      walk(node, depth);
    }
  };
  walk(d, 0);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* A frame has no body, so it contributes its name — copying a workflow and a
   handful of notes should not silently drop the workflow. */
function itemsToText(items) {
  return items.map((it) => (isFrame(it.id) ? (it.title || '') : noteToText(it.body)))
              .filter(Boolean).join('\n\n');
}
function itemsToHtml(items) {
  return items.map((it) => (isFrame(it.id) ? `<h3>${esc(it.title || '')}</h3>` : (it.body || '')))
              .filter(Boolean).join('<hr>');
}

/* Best effort, and deliberately never throws. A copy that cannot reach the
   system clipboard must still leave the internal one working — losing the rich
   flavour is a nuisance, losing Ctrl+V on the canvas would be a regression. */
async function toSystemClipboard(text, html) {
  if (!text) return false;
  try {
    if (html && window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/plain': new Blob([text], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' })
      })]);
      return true;
    }
  } catch (_) { /* fall through to plain text */ }
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
  return false;
}

/* --- the board as a picture ---------------------------------------------
   Everything on the board is already in world coordinates with a known
   bounding box, so a picture of it is one transform and a draw loop. What it
   is *not* is a screenshot: the notes are drawn onto a canvas from `state`,
   not rasterised out of the DOM.

   That is a deliberate choice and the reason this works at all. Rendering the
   real DOM would mean an `<svg><foreignObject>` carrying the whole stylesheet,
   with every file:// image inlined and every font embedded — and an SVG loaded
   into an `<img>` runs in secure static mode, where none of the external
   references it would then need are allowed. Drawing from the model instead
   has no such cliff: it always produces a picture, it never taints the canvas,
   and it needs nothing from the network or the disk.

   What you lose is exact typography inside a note — a heading is drawn bigger
   and bolder, a list gets bullets, and the finer formatting is flattened. What
   you get is the thing a board picture is actually for: where everything is,
   what colour it is, and what is joined to what. */
const IMG_PAD = 70;
const IMG_MAX_PX = 40e6;          // ~40 megapixels, about a 6300×6300 image

/* Run something with a different theme in force, and put it back.

   The board picture reads its colours out of the live stylesheet, which is what
   keeps it looking like the app — and also what made every export a near-black
   PNG for anybody using a dark theme. That is the wrong picture for the thing a
   board picture is *for*: pasting into a deck, mailing to someone, printing.
   The only way to get a light one was to change your own theme, export, and
   change back.

   Themes are `html[data-theme=…]` rules, so only the root can carry one — there
   is no way to ask for "the Paper values" without putting Paper on the root for
   a moment. Everything between the swap and the restore is synchronous, so the
   browser never gets a frame in which to paint the intermediate state: no
   flash, no flicker, nothing on screen changes.

   The custom palette needs the extra step. It is inline properties on the root,
   and an inline value beats any rule — so leaving them in place would tint the
   light theme with the user's own colours. They are lifted and put back. */
function withTheme(id, fn) {
  const root = document.documentElement;
  if (!id || id === 'app') return fn();
  const th = themeById(id);
  const prev = { theme: root.dataset.theme, mode: root.dataset.mode };
  const inline = CUSTOM_VAR_NAMES.map((k) => [k, root.style.getPropertyValue(k)]);
  inline.forEach(([k]) => root.style.removeProperty(k));
  if (th.id === 'custom') Object.entries(customVars(state.settings.customTheme)).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.theme = th.id;
  root.dataset.mode = th.mode;
  try {
    return fn();
  } finally {
    CUSTOM_VAR_NAMES.forEach((k) => root.style.removeProperty(k));
    inline.forEach(([k, v]) => { if (v) root.style.setProperty(k, v); });
    root.dataset.theme = prev.theme;
    root.dataset.mode = prev.mode;
  }
}

/* Which theme a picture of the board should be drawn in.
   'app' follows whatever is on screen; anything else is a THEMES id. */
function pictureTheme() {
  const p = state.settings.exportTheme;
  if (p === 'app') return 'app';
  return THEMES.some((th) => th.id === p) ? p : 'paper';
}

// the colours the export uses, read from the live theme so it matches the app
function exportPalette() {
  const cs = getComputedStyle(document.documentElement);
  const g = (v, fb) => (cs.getPropertyValue(v).trim() || fb);
  return {
    bg: g('--bg', '#101118'),
    text: g('--text', '#e8eaf2'),
    dim: g('--dim', '#9aa0b4'),
    line: g('--line-2', 'rgba(255,255,255,.18)'),
    rope: isHex(state.settings.linkColor) ? state.settings.linkColor : g(`--c-${state.settings.linkColor}-c`, '#e05a5a'),
    noteBg: (c) => g(`--c-${c}-b`, g('--surface', '#191b25')),
    noteLine: (c) => g(`--c-${c}-l`, g('--line', 'rgba(255,255,255,.10)')),
    noteInk: (c) => g(`--c-${c}-c`, g('--dim', '#9aa0b4'))
  };
}

/* A note body as a short list of drawable lines. Walks the block elements
   rather than reading `textContent`, so a heading stays a heading — the same
   reason stripHtml() exists, one level less flattened. */
function exportBlocks(html, max) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  const out = [];
  const walk = (el, depth) => {
    for (const node of el.children) {
      if (out.length >= max) return;
      const tag = node.tagName;
      if (tag === 'UL' || tag === 'OL') {
        [...node.children].forEach((li, i) => {
          if (out.length >= max) return;
          const tick = node.classList.contains('mb-todo') ? (li.classList.contains('done') ? '☑ ' : '☐ ') : '• ';
          out.push({ text: tick + (li.textContent || '').trim(), size: 1, bold: false, dim: li.classList.contains('done'), indent: depth + 1 });
        });
        continue;
      }
      if (tag === 'DIV' && node.classList.contains('mb-cols')) { walk(node, depth); continue; }
      if (tag === 'DIV' && node.classList.contains('mb-col')) { walk(node, depth); continue; }
      if (tag === 'DIV' && node.classList.contains('mb-embed')) {
        out.push({ text: '▶ ' + hostOf((node.querySelector('a') || {}).href || ''), size: 1, bold: false, dim: true, indent: depth });
        continue;
      }
      /* A video is drawn as its name with a play mark, for the same reason a
         table is drawn as "(table)": the picture is drawn from the model, and
         there is no frame of the video in the model to draw. */
      if (tag === 'DIV' && node.classList.contains('mb-file')) {
        const mark = node.classList.contains('mb-video') ? '▶ ' : '♪ ';
        out.push({ text: mark + (node.dataset.name || ''), size: 1, bold: false, dim: true, indent: depth });
        continue;
      }
      if (tag === 'TABLE') { out.push({ text: t('export.table'), size: 1, bold: false, dim: true, indent: depth }); continue; }
      if (tag === 'HR') { out.push({ rule: true, indent: depth }); continue; }
      const txt = (node.textContent || '').trim();
      if (!txt) continue;
      const size = tag === 'H1' ? 1.5 : tag === 'H2' ? 1.28 : tag === 'H3' ? 1.12 : 1;
      out.push({ text: txt, size, bold: /^H[123]$/.test(tag), dim: tag === 'BLOCKQUOTE', indent: depth });
    }
  };
  walk(d, 0);
  return out;
}

/* roundRectPath() lives in media.js, which draws the other canvas in this app.
   It used to be declared here as well, with an identical body — and these files
   share one global scope, so the second declaration silently replaced the
   first. Two copies of a function nobody could tell apart is only harmless
   while they stay identical: fix a bug in the one you happen to be reading and
   nothing changes, because the other one is the one that runs. One copy. */

/* Draw one board onto a fresh canvas and hand back the element. Kept separate
   from the save so it can be called for a preview, or for a board that is not
   the one on screen. */
function paintBoardCanvas(board, scale) {
  const notes = board.notes, frames = board.frames, links = board.links;
  const all = [...notes, ...frames];
  if (!all.length) return null;
  const b = bboxOf(all);
  const pal = exportPalette();

  let z = clamp(+scale || 2, 0.4, 4);
  const wantW = (b.w + IMG_PAD * 2), wantH = (b.h + IMG_PAD * 2);
  // a board wide enough to blow past the canvas limit gets scaled down rather
  // than failing — a smaller picture beats a blank one
  if (wantW * wantH * z * z > IMG_MAX_PX) z = Math.sqrt(IMG_MAX_PX / (wantW * wantH));

  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(wantW * z));
  cv.height = Math.max(1, Math.round(wantH * z));
  const ctx = cv.getContext('2d');
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(z, 0, 0, z, -(b.x - IMG_PAD) * z, -(b.y - IMG_PAD) * z);
  ctx.textBaseline = 'top';
  const FONT = '"Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif';

  // frames first — they sit under everything, the way they do on the canvas
  frames.forEach((f) => {
    ctx.save();
    ctx.fillStyle = pal.noteBg(f.color);
    ctx.globalAlpha = 0.35;
    roundRectPath(ctx, f.x, f.y, f.w, f.h, 18); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.noteInk(f.color); ctx.lineWidth = 2;
    roundRectPath(ctx, f.x, f.y, f.w, f.h, 18); ctx.stroke();
    ctx.fillStyle = pal.noteInk(f.color);
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(f.title || '', f.x + 16, f.y + 12, f.w - 32);
    ctx.restore();
  });

  // then the ropes, from the same path builder the app draws with
  ctx.save();
  ctx.strokeStyle = pal.rope;
  ctx.lineWidth = Math.max(1.5, state.settings.linkWidth || 2);
  ctx.globalAlpha = 0.75;
  const byId = new Map(notes.map((n) => [n.id, n]));
  links.forEach((l) => {
    const a = byId.get(l.from), c = byId.get(l.to);
    if (!a || !c) return;
    const p1 = anchor(a, { x: c.x + c.w / 2, y: c.y + c.h / 2 });
    const p2 = anchor(c, { x: a.x + a.w / 2, y: a.y + a.h / 2 });
    try { ctx.stroke(new Path2D(ropePath(p1, p2, a, c))); } catch (_) {}
  });
  ctx.restore();

  // and the notes on top, in z order so overlaps come out the same way
  notes.slice().sort((n1, n2) => (n1.z || 0) - (n2.z || 0)).forEach((n) => {
    /* A picture on the board. The picture itself cannot be drawn — an image
       from the board's own folder would taint the canvas and the export would
       refuse to save — so its place is: a box in the paper's colour with a
       frame, where the picture sits, at its size. */
    if (n.pic) {
      ctx.save();
      ctx.fillStyle = pal.surface2 || pal.noteBg('default');
      ctx.fillRect(n.x, n.y, n.w, n.h);
      ctx.strokeStyle = pal.line; ctx.lineWidth = 1.5;
      ctx.strokeRect(n.x + .75, n.y + .75, n.w - 1.5, n.h - 1.5);
      if (ICONS.image) {
        ctx.fillStyle = pal.dim;
        const k = Math.min(48, n.w * .3, n.h * .3);
        ctx.translate(n.x + n.w / 2 - k / 2, n.y + n.h / 2 - k / 2);
        ctx.scale(k / 960, k / 960);
        ctx.translate(0, 960);
        try { ctx.fill(new Path2D(ICONS.image)); } catch (_) {}
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.fillStyle = pal.noteBg(n.color);
    roundRectPath(ctx, n.x, n.y, n.w, n.h, 14); ctx.fill();
    ctx.strokeStyle = pal.noteLine(n.color); ctx.lineWidth = 1.5;
    roundRectPath(ctx, n.x, n.y, n.w, n.h, 14); ctx.stroke();

    // the icon badge, drawn from the same path data the app uses on screen
    let top = n.y + 16;
    if (n.icon && ICONS[n.icon]) {
      ctx.save();
      ctx.fillStyle = n.iconColor && n.iconColor !== 'auto' ? pal.noteInk(n.iconColor) : pal.noteInk(n.color);
      // the glyphs are on a 960 grid whose origin sits 960 above the baseline
      ctx.translate(n.x + 16, top);
      ctx.scale(20 / 960, 20 / 960);
      ctx.translate(0, 960);
      try { ctx.fill(new Path2D(ICONS[n.icon])); } catch (_) {}
      ctx.restore();
      top += 26;
    }

    // clip so a long note cannot spill out of its own box
    ctx.save();
    roundRectPath(ctx, n.x, n.y, n.w, n.h, 14); ctx.clip();
    const left = n.x + 16, wrapW = n.w - 32;
    exportBlocks(n.body, 40).forEach((blk) => {
      if (top > n.y + n.h - 10) return;
      if (blk.rule) {
        ctx.strokeStyle = pal.line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, top + 6); ctx.lineTo(left + wrapW, top + 6); ctx.stroke();
        top += 14; return;
      }
      const px = Math.round(13.5 * blk.size);
      ctx.font = `${blk.bold ? '700' : '400'} ${px}px ${FONT}`;
      ctx.fillStyle = blk.dim ? pal.dim : pal.text;
      const x0 = left + blk.indent * 14;
      // word wrap, measured against the note's own width
      let lineText = '';
      const flush = () => { if (lineText) { ctx.fillText(lineText, x0, top); top += px * 1.45; lineText = ''; } };
      for (const word of blk.text.split(/\s+/)) {
        const next = lineText ? lineText + ' ' + word : word;
        if (ctx.measureText(next).width > wrapW - blk.indent * 14 && lineText) { flush(); lineText = word; }
        else lineText = next;
        if (top > n.y + n.h - 10) { lineText = ''; break; }
      }
      flush();
      top += px * 0.28;
    });
    ctx.restore();

    // the status pill, bottom-left, where it sits on the real note
    const st = statusById(n.status);
    if (st) {
      const label = statusName(st);
      ctx.font = `600 11px ${FONT}`;
      const pw = ctx.measureText(label).width + 26;
      const py = n.y + n.h - 26;
      ctx.fillStyle = pal.noteInk(st.color); ctx.globalAlpha = 0.18;
      roundRectPath(ctx, n.x + 14, py, pw, 18, 9); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.noteInk(st.color);
      ctx.beginPath(); ctx.arc(n.x + 23, py + 9, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillText(label, n.x + 31, py + 4);
    }
    ctx.restore();
  });

  return cv;
}

async function exportBoardImage(id) {
  const board = id ? boardById(id) : activeBoard();
  if (!board) return;
  closeBoardMenu();
  if (isLocked(board) && !(await unlockBoard(board))) return;
  if (board.id === state.activeBoard) syncActiveBoard();
  /* Drawn in the picture's own theme, not the one on screen. exportPalette()
     reads the live stylesheet, so the swap has to be in force for the whole of
     paintBoardCanvas() — which is why withTheme() takes a callback rather than
     handing back a colour set. Everything inside is synchronous, so no frame is
     ever painted in the swapped theme. */
  const cv = withTheme(pictureTheme(), () => paintBoardCanvas(board, 2));
  if (!cv) { toast(t('msg.exportEmpty')); return; }
  const name = (boardLabel(board).replace(/[^\w؀-ۿ -]+/g, '').trim() || 'board').slice(0, 40);
  const dataUrl = cv.toDataURL('image/png');

  if (FILES && FILES.savePng) {
    const r = await FILES.savePng(dataUrl, `${name}.png`);
    // null means the save dialog was cancelled, which is not a failure
    if (r && r.error) toast(t('msg.exportFailed'));
    else if (r) toast(t('msg.imageExported'));
    return;
  }
  // the browser fallback, same shape as the JSON export below it
  const a = document.createElement('a');
  a.href = dataUrl; a.download = `${name}.png`; a.click();
}
