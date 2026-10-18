/* Mental Board — items.js
   Note and frame elements, the one drag/resize gesture engine, selection, and the camera.

   Part 6 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 6. note + frame elements ─────────────── */
const RZ = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
const rzHtml = () => RZ.map((d) => `<span class="rz rz-${d}" data-rz="${d}"></span>`).join('');

function placeEl(el, it) {
  el.style.left = it.x + 'px'; el.style.top = it.y + 'px';
  el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
}

/* A note, in two halves — and the split is what makes fit-everything zoom
   survivable on a big board.

   Culling stops helping at exactly the zoom where it is needed most: put the
   whole board on screen and every note is "visible", so every note mounts. At
   3,000 notes that was one 330ms freeze on the gesture people use most to get
   their bearings — measured, on a fast machine. `body.far-zoom` already hid the
   text, the head and the handles with `display: none`, but hiding them happens
   *after* they have been built: the markup was parsed, four icons were drawn,
   eight handles were created and about a dozen listeners were attached, for
   three thousand notes, so that CSS could then decline to paint any of it.

   Below FAR_Z a note is therefore built as a **stub**: the div, its colour, its
   place, and the status pill — which is the one child far-zoom does *not* hide,
   because a coloured pill is a landmark. Nothing else. fillNote() adds the rest,
   and it runs on the way back in.

   The rule that keeps this from becoming a trap: **a stub is only ever created
   while `farMode` is true, and anything that needs a note's insides goes
   through `ensureMounted()`, which fills one before handing it back.** That was
   already the contract for culled items (MAP.md §4c) — this widens it from "the
   element may not exist" to "the element may not be finished yet", and the same
   one call answers both. */
function makeNote(n, stub) {
  const el = document.createElement('div');
  el.className = 'note';
  el.dataset.id = n.id;
  paintColor(el, n.color, 'default');
  el.style.setProperty('--tilt', tiltOf(n.id) + 'deg');   // read only on a pinned board (mental.css §62)
  el.style.zIndex = String(n.z || 1);
  placeEl(el, n);
  /* A picture is one <img> and eight handles — cheaper than a stub would be
     worth, and a blank rectangle where a picture was reads as a broken board.
     Never stubbed. See pictures.js. */
  if (n.pic) { fillPicture(el, n); return el; }
  if (stub) {
    el.dataset.stub = '1';
    el.innerHTML = '<div class="note-status hidden"></div>';
    paintNoteStatus(el, n);
    return el;
  }
  fillNote(el, n);
  return el;
}

/* Everything makeNote() used to do inline. Called straight away for an ordinary
   mount, and later for a stub the view zoomed back in on. Safe to call twice:
   it replaces the whole subtree, so the listeners go with the nodes they were
   on and nothing is bound to the same element twice. */
/* A note's tilt on a pinned board: a degree or so either way, the same every
   time for the same note, so the board does not reshuffle on every render. */
function tiltOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.round(((((h >>> 0) % 1000) / 1000) * 3.2 - 1.6) * 100) / 100;
}

function fillNote(el, n) {
  if (n.pic) { fillPicture(el, n); return; }
  delete el.dataset.stub;
  /* No head, since 2.1. A note used to carry a row of five controls on its top
     edge — grip, icon, link, more, delete — that appeared on hover. Every one
     of them was already in the right-click menu, the whole note is the drag
     handle (onPointerDown starts a move anywhere on a closed note), and the
     row cost 24px of every note's height and a flicker on every hover. What it
     showed rather than did — the reminder — is a pill in the status row now.

     The icon badge stays: it is something the user put on the note, not
     chrome. Changing it is the right-click menu's "Icon" row. */
  el.innerHTML =
    `<div class="note-icon"></div>
     <div class="note-body" dir="auto" spellcheck="${state.settings.spell}"></div>
     <div class="note-status hidden"></div>
     ${rzHtml()}`;
  paintNoteIcon(el, n);
  paintNoteStatus(el, n);
  const body = el.querySelector('.note-body');
  body.innerHTML = n.body || '';
  lazyImages(body);
  paintCodeBlocks(body);
  paintEmbeds(body);              // the card, not the player; see the embeds block
  wireNoteBody(body, n, el);
}

/* Every picture in a note decodes off the main thread and is not fetched at
   all until the note is near the screen. Set on the element rather than in
   the stored markup, so a board written by 1.x gets it too and nothing about
   what is saved changes. A big board of screenshots used to decode every one
   of them on the first paint. */
function lazyImages(root) {
  if (!root) return;
  root.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
  });
  watchVideos(root);          // every body that is drawn passes through here
}

/* Redraw a note's text from `n.body` without rebuilding the whole element —
   after a history restore, after its pictures were re-addressed. A stub has
   no body to draw into and is left for unstub(); a picture is all body, so it
   is rebuilt outright. */
function repaintNoteBody(el, n) {
  if (!el || !n || el.dataset.stub) return;
  if (n.pic) { fillNote(el, n); return; }
  const body = el.querySelector('.note-body');
  if (!body) return;
  body.innerHTML = n.body || '';
  lazyImages(body);
  paintCodeBlocks(body);
  paintEmbeds(body);
}

/* Finish a note that was mounted as a stub. Returns the element either way, so
   callers can chain. */
function unstub(el, n) {
  if (el && el.dataset && el.dataset.stub && n) fillNote(el, n);
  return el;
}

// the icon shown on a note: a badge above the text, Notion-style
function paintNoteIcon(el, n) {
  const btn = el.querySelector('.note-icon');
  if (!btn) return;
  el.classList.toggle('has-icon', !!n.icon);
  btn.innerHTML = n.icon ? icon(n.icon) : '';
  btn.style.color = iconColorVar(n.iconColor);
}

function makeFrame(f) {
  const el = document.createElement('div');
  el.className = 'frame';
  el.dataset.id = f.id;
  paintColor(el, f.color, 'blue');
  el.dataset.title = TITLE_POS.includes(f.titlePos) ? f.titlePos : 'tl';
  placeEl(el, f);
  el.innerHTML =
    `<div class="frame-title" spellcheck="false">
       <button class="ft-icon" title="${te('frame.icon')}"></button>
       <span class="ft-name" dir="auto"></span>
       <span class="frame-count"></span>
     </div>
     ${rzHtml()}`;
  el.querySelector('.ft-name').textContent = f.title || t('frame.default');
  paintFrameIcon(el, f);
  paintFrameLock(el, f);
  el.querySelector('.ft-icon').addEventListener('click', (e) => { e.stopPropagation(); openIconPicker(f.id); });
  return el;
}

/* Move a workflow's title. Presentation only — the frame's own geometry is
   untouched, so this can never move the frame or the notes inside it, and it
   costs one attribute rather than a re-render. */
function setTitlePos(id, pos) {
  const f = state.frames.find((x) => x.id === id);
  if (!f || !TITLE_POS.includes(pos) || f.titlePos === pos) return;
  /* No pushUndo(). The undo stack holds notes, frames and links, so a snapshot
     taken for this would restore a canvas identical to the one on screen and
     make the next Ctrl+Z look broken — the same branch commitIconChange() has
     for a board's icon. */
  f.titlePos = pos;
  const el = els.get(id);
  if (el) el.dataset.title = pos;
  saveSoon();
}

/* A workflow locked behind the notes (2.1). It stays exactly where it is and
   stops being something the pointer can catch: a lasso drawn across it picks
   up the notes and not the frame, Ctrl+A leaves it out, its title will not
   drag, and its handles go. That is the whole point — a big workflow is the
   thing a lasso across its notes kept grabbing, and dragging the selection
   then dragged the frame and every note inside it.

   Right-click still reaches it (frameAt() hit-tests by geometry), because
   that is where Unlock is. Stored on the frame as `locked: true`; a frame
   without it is unlocked, so nothing needs healing on load. */
function lockFrame(id) {
  const f = state.frames.find((x) => x.id === id);
  if (!f) return;
  pushUndo();
  if (f.locked) delete f.locked; else f.locked = true;
  const el = els.get(id);
  if (el) paintFrameLock(el, f);
  if (f.locked && selection.has(id)) { selection.delete(id); syncSelectionClasses(); }
  saveSoon();
  toast(t(f.locked ? 'msg.frameLocked' : 'msg.frameUnlocked'));
}
function paintFrameLock(el, f) {
  el.classList.toggle('locked', !!f.locked);
  const t0 = el.querySelector('.frame-title');
  let lk = t0 && t0.querySelector('.ft-lock');
  if (f.locked && t0 && !lk) {
    lk = document.createElement('span');
    lk.className = 'ft-lock';
    lk.innerHTML = icon('lock');
    t0.appendChild(lk);
  } else if (!f.locked && lk) lk.remove();
}
// what a lasso, Ctrl+A or a click on a title can pick up
const frameSelectable = (f) => !f.locked;

function paintFrameIcon(el, f) {
  const b = el.querySelector('.ft-icon');
  if (!b) return;
  b.classList.toggle('is-dot', !f.icon);
  b.innerHTML = f.icon ? icon(f.icon) : '';
  b.style.color = iconColorVar(f.iconColor);
}

function repaintIcons(id) {
  const el = els.get(id);
  const it = itemById(id);
  if (!el || !it) return;
  if (isFrame(id)) paintFrameIcon(el, it); else paintNoteIcon(el, it);
}

/* One pass over the notes, not one per frame.

   This runs on every animation frame of a pan (syncMounted calls it), and it
   used to call notesInFrame() per frame — which is `state.notes.filter(...)`,
   so a board with a dozen workflows on screen walked every note a dozen times
   and allocated a dozen arrays, sixty times a second, to write a number that
   almost never changes. Counting into a map costs one walk and no arrays.

   Only mounted frames are counted, as before: an unmounted one has nothing to
   write the number into, and it gets its count when it mounts. */
function refreshFrameCounts() {
  const live = [];
  for (const f of state.frames) {
    const el = els.get(f.id);
    if (!el) continue;
    const cnt = el.querySelector('.frame-count');
    if (cnt) live.push({ f, cnt, n: 0 });
  }
  if (!live.length) return;
  for (const n of state.notes) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    for (const e of live) {
      const f = e.f;
      if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) e.n++;
    }
  }
  for (const e of live) e.cnt.textContent = e.n ? `· ${num(e.n)}` : '';
}
// a note belongs to a frame when its centre sits inside it
function notesInFrame(f) {
  return state.notes.filter((n) => {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
  });
}

function renameFrame(id) {
  const el = els.get(id);
  const f = state.frames.find((x) => x.id === id);
  if (!el || !f) return;
  const title = el.querySelector('.frame-title');
  const name = title.querySelector('.ft-name');
  /* Only the name span becomes editable. Marking the wrapper editable too put
     the focus — and therefore every key event — on the wrapper, so the Enter
     handler bound to the span never ran and the new name was never committed.
     The wrapper just gets a class for the focus ring. */
  title.classList.add('renaming');
  name.setAttribute('contenteditable', 'true');
  name.focus();
  const r = document.createRange(); r.selectNodeContents(name);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  // Dropping contenteditable blurs the span, which would re-enter this through
  // the blur handler and commit the very text Escape was meant to discard.
  let settled = false;
  const finish = (commit) => {
    if (settled) return;
    settled = true;
    title.classList.remove('renaming');
    name.removeAttribute('contenteditable');
    if (commit) {
      const v = (name.textContent || '').trim().slice(0, 80) || t('frame.default');
      if (v !== f.title) { pushUndo(); f.title = v; saveSoon(); }
      name.textContent = f.title;
    } else name.textContent = f.title;
    drawCompass();
    name.removeEventListener('blur', onBlur);
    name.removeEventListener('keydown', onKey);
  };
  const onBlur = () => finish(true);
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); name.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
  name.addEventListener('blur', onBlur);
  name.addEventListener('keydown', onKey);
}

/* ─────────────── 7. drag + resize ─────────────── */
let gesture = null;   // { kind:'move'|'resize'|'pan'|'marquee', ... }

function bringToFront(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  n.z = ++state.nextZ;
  const el = els.get(id);
  if (el) el.style.zIndex = String(n.z);
}
function sendToBack(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  const min = minOf(state.notes, (x) => x.z || 1, 1);
  n.z = min - 1;
  const el = els.get(id);
  if (el) el.style.zIndex = String(n.z);
}

/* Snap to the grid that is drawn, not to a constant. GRID is still the default
   pitch; gridStep() is whatever the user set it to, and a snap that did not
   follow it would put notes between the lines they were aiming at. */
function snapV(v) { const g = gridStep(); return state.settings.snap ? Math.round(v / g) * g : Math.round(v); }

/* ---- lining a note up with its neighbours -------------------------------

   Dragging a note next to another one and getting it *almost* level is the
   most common small annoyance on a canvas like this: two notes a pixel and a
   half out of line look wrong, and there is nothing to aim at. Snap-to-grid
   does not answer it — the grid is 26px and the note you want to match is
   wherever somebody put it.

   So while something is dragged, the six lines it could line up on — its left,
   centre and right, its top, middle and bottom — are compared against the same
   six on every item nearby. Within a few screen pixels the drag is nudged onto
   the match, and the line is drawn so you can see what it caught on.

   Four decisions worth keeping:

   - **The candidates are gathered once, at the start of the drag.** Nothing
     standing still moves while you drag, so recomputing them per pointermove
     would be the same answer at sixty times the cost. On a board of thousands
     that is the difference between a feature and a stall.
   - **Only what is near the viewport counts**, and at most GUIDE_MAX of those.
     Lining up with a note two screens away is not something anybody is trying
     to do, and it is not something they could see the line for either.
   - **The tolerance is in screen pixels, converted to world.** A fixed world
     tolerance would be unusable zoomed out — everything within reach — and
     useless zoomed in, where nothing ever is. Six screen pixels is the same
     six pixels of pointer travel at every zoom.
   - **It nudges, it does not lock.** The offset is applied on top of the
     pointer delta for that frame only; keep moving and it lets go. A snap you
     have to fight is worse than no snap at all.

   Grid snap wins when it is on. It is an explicit "put things on the grid", and
   two snaps arguing over one drag is a note that will not go where it is
   pointed. */
const GUIDE_TOL = 6;        // screen px, converted to world at the current zoom
const GUIDE_MAX = 400;      // candidate items considered
let guideEls = null;        // the two <line>s, reused rather than rebuilt

/* The static items a drag could line up against, and the coordinates they
   offer. Frames count: a workflow's edge is exactly the thing you want a note
   flush against. */
function guideCandidates(movingIds) {
  const R = visibleWorldRect();
  const xs = [], ys = [];
  let n = 0;
  const take = (it) => {
    if (n >= GUIDE_MAX || movingIds.has(it.id) || !inRect(it, R)) return;
    n++;
    xs.push(it.x, it.x + it.w / 2, it.x + it.w);
    ys.push(it.y, it.y + it.h / 2, it.y + it.h);
  };
  state.notes.forEach(take);
  state.frames.forEach(take);
  return { xs, ys, n };
}

/* The nudge, and the two lines to draw for it. `box` is where the dragged set
   would land unaided. Returns the correction and the world coordinates that
   matched, with null for an axis that found nothing. */
function guideFit(box, cand, tol) {
  const edgesX = [box.x, box.x + box.w / 2, box.x + box.w];
  const edgesY = [box.y, box.y + box.h / 2, box.y + box.h];
  let bestX = null, bestY = null;
  for (let i = 0; i < cand.xs.length; i++) {
    const c = cand.xs[i];
    for (let j = 0; j < 3; j++) {
      const d = c - edgesX[j];
      if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: c };
    }
  }
  for (let i = 0; i < cand.ys.length; i++) {
    const c = cand.ys[i];
    for (let j = 0; j < 3; j++) {
      const d = c - edgesY[j];
      if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: c };
    }
  }
  return {
    dx: bestX ? bestX.d : 0, dy: bestY ? bestY.d : 0,
    vx: bestX ? bestX.at : null, hy: bestY ? bestY.at : null
  };
}

/* Two <line>s, made once and moved thereafter — the same diff-don't-rebuild
   rule the compass chips follow, and for the same reason: assigning the markup
   again every frame restarts the fade-in, so the guide would never appear.

   `SVGNS` is declared in links.js, which loads *after* this file. That is fine
   and it is worth saying why: the load order only governs what a file can read
   while it is being **evaluated**, and this is a function body that first runs
   during a drag, long after init(). Reading it at the top level of this file
   would be the temporal dead zone. See MAP.md §4. */
function drawGuides(fit, box) {
  const svg = $('guidesSvg');
  if (!svg) return;
  if (!guideEls) {
    const mk = () => {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('class', 'guide-line off');
      svg.appendChild(l);
      return l;
    };
    guideEls = { v: mk(), h: mk() };
  }
  const span = 90;      // world px of overhang past the block, so a line reads as one
  const { v, h } = guideEls;
  if (fit.vx == null) v.setAttribute('class', 'guide-line off');
  else {
    v.setAttribute('class', 'guide-line');
    v.setAttribute('x1', fit.vx); v.setAttribute('x2', fit.vx);
    v.setAttribute('y1', box.y - span); v.setAttribute('y2', box.y + box.h + span);
  }
  if (fit.hy == null) h.setAttribute('class', 'guide-line off');
  else {
    h.setAttribute('class', 'guide-line');
    h.setAttribute('y1', fit.hy); h.setAttribute('y2', fit.hy);
    h.setAttribute('x1', box.x - span); h.setAttribute('x2', box.x + box.w + span);
  }
}
function clearGuides() {
  if (!guideEls) return;
  guideEls.v.setAttribute('class', 'guide-line off');
  guideEls.h.setAttribute('class', 'guide-line off');
}

function beginMove(e, id) {
  if (!selection.has(id)) setSelection([id], e.shiftKey);
  bringToFront(id);
  // everything that travels with this drag
  const ids = new Set(selection);
  // dragging a frame carries the notes sitting inside it
  [...ids].forEach((sid) => {
    const f = state.frames.find((x) => x.id === sid);
    if (f) notesInFrame(f).forEach((n) => ids.add(n.id));
  });
  const items = [...ids].map((i) => itemById(i)).filter(Boolean);
  if (!items.length) return;
  gesture = {
    kind: 'move', sx: e.clientX, sy: e.clientY, moved: false,
    z: state.view.z,
    items: items.map((it) => ({ it, ox: it.x, oy: it.y })),
    /* Which ropes this drag can possibly move. Worked out once here rather than
       per pointermove, so the drag loop can redraw those and leave every other
       rope on the board alone — see drawLinks(). */
    ids: new Set(items.map((it) => it.id)),
    /* One picture on its own can be dropped into a note — see pictures.js.
       Only alone: five things dragged at once are being moved, not filed. */
    pic: (items.length === 1 && items[0].pic) ? items[0] : null
  };
  items.forEach((it) => els.get(it.id)?.classList.add('dragging'));
  /* Worked out once, here, because nothing standing still moves during a drag.
     Skipped entirely when the feature is off or grid snap is on, so neither
     costs anything it does not use. */
  gesture.guides = (state.settings.guides && !state.settings.snap)
    ? guideCandidates(gesture.ids) : null;
  /* Geometry only: a drag moves things that already exist and creates nothing.
     The one exception is dropping onto a board tile, and finishBoardDrop()
     swaps this step for a full one when that happens. */
  pushUndoGeom(items);
  captureGesture(e);
}

function beginResize(e, id, dir) {
  const it = itemById(id);
  if (!it) return;
  setSelection([id], false);
  const frame = isFrame(id);
  gesture = {
    kind: 'resize', dir, it, frame,
    ids: new Set([id]),
    sx: e.clientX, sy: e.clientY, z: state.view.z,
    ox: it.x, oy: it.y, ow: it.w, oh: it.h,
    minW: frame ? FRAME_MIN_W : (it.pic ? PIC_MIN : NOTE_MIN_W),
    minH: frame ? FRAME_MIN_H : (it.pic ? PIC_MIN : NOTE_MIN_H),
    kids: frame ? [] : null
  };
  els.get(id)?.classList.add('dragging');
  pushUndoGeom([it]);
  captureGesture(e);
}

// Pan and lasso do not touch the model, so they deliberately do NOT push an
// undo step — only beginMove/beginResize do, and a click that never moved
// takes its step back in endGesture().
function captureGesture(e) {
  try { $('viewport').setPointerCapture(e.pointerId); } catch (_) {}
  window.addEventListener('pointermove', onGestureMove);
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
}

function onGestureMove(e) {
  if (!gesture) return;
  const g = gesture;

  if (g.kind === 'move') {
    let dx = (e.clientX - g.sx) / g.z, dy = (e.clientY - g.sy) / g.z;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    g.moved = true;
    /* Line the whole dragged block up with what is around it. The box is the
       union of everything travelling, so dragging five notes lines the five up
       with the neighbour rather than lining one of them up and leaving the rest
       wherever the offset happened to put them. */
    if (g.guides && g.guides.n) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      g.items.forEach(({ it, ox, oy }) => {
        const x = ox + dx, y = oy + dy;
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x + it.w > x2) x2 = x + it.w;
        if (y + it.h > y2) y2 = y + it.h;
      });
      const box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      const fit = guideFit(box, g.guides, GUIDE_TOL / g.z);
      dx += fit.dx; dy += fit.dy;
      box.x += fit.dx; box.y += fit.dy;
      drawGuides(fit, box);
    }
    g.items.forEach(({ it, ox, oy }) => {
      it.x = snapV(ox + dx); it.y = snapV(oy + dy);
      const el = els.get(it.id);
      if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    });
    drawLinks(g.ids); scheduleCompass();
    trackBoardDrop(e);
    if (g.pic) trackPicTarget(e, g);
    return;
  }

  if (g.kind === 'resize') {
    const dx = (e.clientX - g.sx) / g.z, dy = (e.clientY - g.sy) / g.z;
    const d = g.dir, it = g.it;
    let x = g.ox, y = g.oy, w = g.ow, h = g.oh;
    if (d.includes('e')) w = Math.max(g.minW, g.ow + dx);
    if (d.includes('s')) h = Math.max(g.minH, g.oh + dy);
    if (d.includes('w')) { const nw = Math.max(g.minW, g.ow - dx); x = g.ox + (g.ow - nw); w = nw; }
    if (d.includes('n')) { const nh = Math.max(g.minH, g.oh - dy); y = g.oy + (g.oh - nh); h = nh; }
    // a picture keeps its shape, whichever handle is pulled
    if (it.pic) ({ x, y, w, h } = fitPictureBox(g, { x, y, w, h }));
    it.x = snapV(x); it.y = snapV(y); it.w = snapV(w); it.h = snapV(h);
    const el = els.get(it.id);
    if (el) placeEl(el, it);
    drawLinks(g.ids); scheduleCompass();
    return;
  }

  if (g.kind === 'pan') {
    state.view.x = g.ox + (e.clientX - g.sx);
    state.view.y = g.oy + (e.clientY - g.sy);
    applyView();
    return;
  }

  if (g.kind === 'marquee') {
    const r = vpRect();
    const x1 = Math.min(g.sx, e.clientX) - r.left, y1 = Math.min(g.sy, e.clientY) - r.top;
    const x2 = Math.max(g.sx, e.clientX) - r.left, y2 = Math.max(g.sy, e.clientY) - r.top;
    const m = $('marquee');
    m.classList.remove('hidden');
    m.style.left = x1 + 'px'; m.style.top = y1 + 'px';
    m.style.width = (x2 - x1) + 'px'; m.style.height = (y2 - y1) + 'px';
    const a = toWorld(Math.min(g.sx, e.clientX), Math.min(g.sy, e.clientY));
    const b = toWorld(Math.max(g.sx, e.clientX), Math.max(g.sy, e.clientY));
    const hit = [];
    const test = (it) => (it.x < b.x && it.x + it.w > a.x && it.y < b.y && it.y + it.h > a.y);
    state.notes.forEach((n) => { if (test(n)) hit.push(n.id); });
    state.frames.forEach((f) => { if (frameSelectable(f) && test(f)) hit.push(f.id); });
    setSelection(g.base.concat(hit), false);
  }
}

function endGesture() {
  window.removeEventListener('pointermove', onGestureMove);
  window.removeEventListener('pointerup', endGesture);
  window.removeEventListener('pointercancel', endGesture);
  if (!gesture) return;
  const g = gesture;
  gesture = null;
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  clearGuides();
  $('marquee').classList.add('hidden');
  $('viewport').classList.remove('panning');
  // dropped on a board tile? that ends the gesture as a move-to-board instead
  if (g.kind === 'move' && g.moved && finishBoardDrop(g)) return;
  // a picture let go over a note goes into the note
  if (g.kind === 'move' && g.moved && g.pic && finishPicDrop(g)) return;
  markPicTarget(null);
  if (g.kind === 'move' && !g.moved) popUndo();     // a plain click shouldn't cost an undo step
  if (g.kind === 'move' || g.kind === 'resize') {
    refreshFrameCounts();
    /* One full pass at the end. The drag only ever touched the ropes it was
       moving, so this is where any rope that scrolled into view during it gets
       mounted and any that left gets dropped. */
    drawLinks();
  }
  saveSoon();
}

/* ─────────────── 8. selection ─────────────── */
let selection = new Set();

function setSelection(ids, additive) {
  const next = additive ? new Set(selection) : new Set();
  ids.forEach((i) => next.add(i));
  selection = next;
  syncSelectionClasses();
}
function toggleSelection(id) {
  if (selection.has(id)) selection.delete(id); else selection.add(id);
  syncSelectionClasses();
}
function clearSelection() { selection = new Set(); syncSelectionClasses(); }
function syncSelectionClasses() {
  els.forEach((el, id) => el.classList.toggle('selected', selection.has(id)));
  drawHotRopes();         // a selected note shows its ropes above the notes
}
function selectedItems() { return [...selection].map(itemById).filter(Boolean); }

/* ─────────────── 9. pan / zoom / fly-to ─────────────── */
let spaceHeld = false;

function beginPan(e) {
  gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, ox: state.view.x, oy: state.view.y };
  $('viewport').classList.add('panning');
  captureGesture(e);
}

function zoomAt(clientX, clientY, factor) {
  const v = state.view;
  const r = vpRect();
  const cx = clientX - r.left, cy = clientY - r.top;
  const z = clamp(v.z * factor, ZOOM_MIN, ZOOM_MAX);
  v.x = cx - ((cx - v.x) / v.z) * z;
  v.y = cy - ((cy - v.y) / v.z) * z;
  v.z = z;
  applyView();
  saveSoon();
}
function zoomCentre(factor) {
  const r = vpRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}
function resetZoom() {
  const c = viewCenterWorld();
  flyTo({ x: c.x, y: c.y }, 1);
}

/* The wheel over a note that has more text than it shows scrolls the note.

   It used to pan the canvas unconditionally, so the only way to read the end
   of a long note was to resize it or open it. Now the note gets the wheel when
   it can actually move in that direction — the browser's own nested-scroll
   rule — and the board gets it back at either end.

   **Latched, the way a browser latches nested scrollers.** Without that, a
   wheel pan across the board stops dead the moment the pointer passes over a
   long note, which would make this feature a trap. So whichever of the two
   took the first notch of a burst keeps the burst: panning carries on over a
   note, and scrolling a note does not spill into the canvas when it reaches the
   bottom. A gap of WHEEL_LATCH ms starts a new burst. Ctrl always zooms. */
const WHEEL_LATCH = 260;
let wheelLatch = { to: null, at: 0 };
function scrollableNoteBody(e) {
  const body = e.target.closest && e.target.closest('.note-body');
  if (!body) return null;
  const dy = e.deltaY, dx = e.deltaX;
  const canY = body.scrollHeight > body.clientHeight + 1 &&
    (dy > 0 ? body.scrollTop + body.clientHeight < body.scrollHeight - 1 : dy < 0 ? body.scrollTop > 0 : false);
  const canX = body.scrollWidth > body.clientWidth + 1 &&
    (dx > 0 ? body.scrollLeft + body.clientWidth < body.scrollWidth - 1 : dx < 0 ? body.scrollLeft > 0 : false);
  return (canY || canX) ? body : null;
}
function onWheel(e) {
  if (!e.ctrlKey) {
    const now = performance.now();
    const fresh = now - wheelLatch.at > WHEEL_LATCH;
    wheelLatch.at = now;
    if (fresh) wheelLatch.to = scrollableNoteBody(e);
    if (wheelLatch.to && wheelLatch.to.isConnected && wheelLatch.to.contains(e.target)) return;   // the note scrolls itself
    if (wheelLatch.to) wheelLatch.to = null;   // left the note mid-burst: the canvas has it from here
  } else wheelLatch.to = null;
  e.preventDefault();
  const zoomIntent = e.ctrlKey || state.settings.wheel === 'zoom';
  if (zoomIntent) {
    /* How far one notch goes. A multiplier on the exponent rather than on the
       resulting factor, because the factor is already exponential — scaling it
       directly would make the fast end runaway and the slow end never arrive.
       The clamp afterwards is unchanged and is what stops a trackpad's
       hundred-pixel deltas from crossing the whole zoom range in one flick. */
    const speed = clamp(+state.settings.zoomSpeed || 100, 40, 220) / 100;
    const f = Math.pow(0.999, e.deltaY * (e.ctrlKey ? 2.4 : 1.6) * speed);
    zoomAt(e.clientX, e.clientY, clamp(f, 0.5, 2));
  } else {
    state.view.x -= e.deltaX;
    state.view.y -= e.deltaY;
    applyView();
    saveSoon();
  }
}

/* Smoothly move the camera so that world point (cx,cy) sits in the middle of
   the viewport at zoom `z`. Used by the compass chips and find. */
let flight = null;
function flyTo(centre, z, ms) {
  const r = vpRect();
  const target = {
    z: clamp(z || state.view.z, ZOOM_MIN, ZOOM_MAX)
  };
  target.x = r.width / 2 - centre.x * target.z;
  target.y = r.height / 2 - centre.y * target.z;
  const from = { x: state.view.x, y: state.view.y, z: state.view.z };
  const dur = ms || 620;
  const t0 = performance.now();
  if (flight) cancelAnimationFrame(flight);
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const step = (now) => {
    const t = clamp((now - t0) / dur, 0, 1);
    const k = ease(t);
    state.view.x = from.x + (target.x - from.x) * k;
    state.view.y = from.y + (target.y - from.y) * k;
    state.view.z = from.z + (target.z - from.z) * k;
    applyView();
    if (t < 1) flight = requestAnimationFrame(step);
    else { flight = null; saveSoon(); }
  };
  flight = requestAnimationFrame(step);
}

function bboxOf(items) {
  if (!items.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  items.forEach((it) => {
    x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y);
    x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + it.h);
  });
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}
function fitTo(items, pad, maxZoom) {
  const b = bboxOf(items);
  if (!b) return;
  const r = vpRect();
  const p = pad == null ? 90 : pad;
  const z = clamp(Math.min((r.width - p * 2) / Math.max(b.w, 1), (r.height - p * 2) / Math.max(b.h, 1)), ZOOM_MIN, maxZoom == null ? 1.2 : maxZoom);
  flyTo({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, z);
}
function zoomToFitAll() {
  // a drawing is part of the board, so "everything" includes it (2.1)
  const ink = (state.ink || []).map((s) => { const q = inkBox(s); return { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 }; });
  const all = [...state.notes, ...state.frames, ...ink];
  if (!all.length) { flyTo({ x: 0, y: 0 }, 1); return; }
  fitTo(all);
}
