/* Mental Board — items.js
   Note and frame elements, the one drag/resize gesture engine, selection, and the camera.

   Part 5 of 15. These files are plain scripts sharing one global
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

function makeNote(n) {
  const el = document.createElement('div');
  el.className = 'note';
  el.dataset.id = n.id;
  el.dataset.color = n.color || 'default';
  el.style.zIndex = String(n.z || 1);
  placeEl(el, n);
  el.innerHTML =
    `<div class="note-head">
       <span class="nh-grip">${icon('drag_indicator')}</span>
       <span class="nh-marks"></span>
       <button class="nh-btn ico" title="${te('note.icon')}">${icon('mood')}</button>
       <button class="nh-btn lk" title="${te('note.link')}">${icon('link')}</button>
       <button class="nh-btn more" title="${te('note.more')}">${icon('more_horiz')}</button>
       <button class="nh-btn del" title="${te('note.delete')}">${icon('close')}</button>
     </div>
     <button class="note-icon" title="${te('note.changeIcon')}"></button>
     <div class="note-body" dir="auto" spellcheck="${state.settings.spell}"></div>
     <div class="note-status hidden"></div>
     ${rzHtml()}`;
  paintNoteIcon(el, n);
  paintNoteMarks(el, n);
  paintNoteStatus(el, n);
  el.querySelector('.note-icon').addEventListener('click', (e) => { e.stopPropagation(); openIconPicker(n.id); });
  el.querySelector('.nh-btn.ico').addEventListener('click', (e) => { e.stopPropagation(); openIconPicker(n.id); });
  const body = el.querySelector('.note-body');
  body.innerHTML = n.body || '';
  paintCodeBlocks(body);
  paintEmbeds(body);              // the card, not the player; see the embeds block
  wireNoteBody(body, n, el);
  el.querySelector('.nh-btn.del').addEventListener('click', (e) => { e.stopPropagation(); pushUndo(); deleteItems([n.id]); });
  el.querySelector('.nh-btn.lk').addEventListener('click', (e) => { e.stopPropagation(); startLinking(n.id); });
  el.querySelector('.nh-btn.more').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openCtxMenu(r.left, r.bottom + 6, n.id);
  });
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
  el.dataset.color = f.color || 'blue';
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

function refreshFrameCounts() {
  state.frames.forEach((f) => {
    const el = els.get(f.id);
    if (!el) return;
    const c = notesInFrame(f).length;
    const cnt = el.querySelector('.frame-count');
    if (cnt) cnt.textContent = c ? `· ${num(c)}` : '';
  });
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
  const min = Math.min(1, ...state.notes.map((x) => x.z || 1));
  n.z = min - 1;
  const el = els.get(id);
  if (el) el.style.zIndex = String(n.z);
}

/* Snap to the grid that is drawn, not to a constant. GRID is still the default
   pitch; gridStep() is whatever the user set it to, and a snap that did not
   follow it would put notes between the lines they were aiming at. */
function snapV(v) { const g = gridStep(); return state.settings.snap ? Math.round(v / g) * g : Math.round(v); }

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
    ids: new Set(items.map((it) => it.id))
  };
  items.forEach((it) => els.get(it.id)?.classList.add('dragging'));
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
    minW: frame ? FRAME_MIN_W : NOTE_MIN_W,
    minH: frame ? FRAME_MIN_H : NOTE_MIN_H,
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
    const dx = (e.clientX - g.sx) / g.z, dy = (e.clientY - g.sy) / g.z;
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    g.moved = true;
    g.items.forEach(({ it, ox, oy }) => {
      it.x = snapV(ox + dx); it.y = snapV(oy + dy);
      const el = els.get(it.id);
      if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    });
    drawLinks(g.ids); scheduleCompass();
    trackBoardDrop(e);
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
    state.frames.forEach((f) => { if (test(f)) hit.push(f.id); });
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
  $('marquee').classList.add('hidden');
  $('viewport').classList.remove('panning');
  // dropped on a board tile? that ends the gesture as a move-to-board instead
  if (g.kind === 'move' && g.moved && finishBoardDrop(g)) return;
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

function onWheel(e) {
  e.preventDefault();
  const zoomIntent = e.ctrlKey || state.settings.wheel === 'zoom';
  if (zoomIntent) {
    const f = Math.pow(0.999, e.deltaY * (e.ctrlKey ? 2.4 : 1.6));
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
  const all = [...state.notes, ...state.frames];
  if (!all.length) { flyTo({ x: 0, y: 0 }, 1); return; }
  fitTo(all);
}
