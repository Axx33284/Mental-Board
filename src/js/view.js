/* Mental Board — view.js
   The world transform, render(), and viewport culling.

   Part 4 of 15. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 4. view transform ─────────────── */
/* Text sharpness while zooming.
   The whole world is one scaled layer. If that layer is promoted (will-change,
   or a long-lived composited transform) Chromium rasterises it once and then
   just stretches the bitmap, so text goes soft as you zoom in. Promote it only
   while the view is actually moving — dropping the hint afterwards forces a
   re-raster at the scale you ended up at, which is what makes the text crisp
   again. */
let zoomSettleTimer = null;
function markMoving() {
  document.body.classList.add('view-moving');
  clearTimeout(zoomSettleTimer);
  zoomSettleTimer = setTimeout(() => {
    document.body.classList.remove('view-moving');
    // nudge the layer so it is definitely re-rastered at the final scale
    const w = $('world');
    if (w) { w.style.willChange = 'auto'; void w.offsetHeight; w.style.willChange = ''; }
  }, 180);
}

/* Size and place the paper under the board.

   Two things this has to get right. The pattern must sit still relative to the
   *world*, not the screen, or panning slides the notes across a grid that is
   not moving with them — that is what the background-position is for.

   And it must stay readable at every zoom. A 26px pitch at 12% zoom is three
   pixels: not a grid, a texture, and one that shimmers as you move. Rather
   than hiding it, step *up* a level — four times the pitch, as many times as
   it takes — which is what a drawing program does and what keeps a coarse
   reference visible when you are looking at the whole board. Zoomed far in the
   same rule stops the pitch growing past a useful size. */
function gridStep() { return clamp(+state.settings.gridSize || GRID, 12, 96); }
function paintGrid(x, y, z) {
  const el = $('grid');
  if (!el) return;
  const style = state.settings.grid;
  if (!el.dataset.on || el.dataset.on !== style) el.dataset.on = style;
  if (style === 'plain') return;

  let g = gridStep() * z;
  while (g < 9) g *= 4;            // too dense to read — one level coarser
  while (g > 260) g /= 4;          // and too sparse to be a grid at all

  const px = (v) => `${v}px ${v}px`;
  if (style === 'graph') {
    // fine, fine, coarse, coarse — the layer order the stylesheet declares
    el.style.backgroundSize = `${px(g)}, ${px(g)}, ${px(g * 5)}, ${px(g * 5)}`;
  } else if (style === 'iso') {
    /* The two angled families are repeating gradients, so their spacing is a
       length inside the gradient rather than a background-size — and the
       vertical family is an ordinary layer. `--iso-step` carries the first. */
    el.style.setProperty('--iso-step', `${g}px`);
    el.style.backgroundSize = `auto, auto, ${px(g)}`;
  } else {
    el.style.backgroundSize = px(g);
  }
  const pos = `${x}px ${y}px`;
  el.style.backgroundPosition = style === 'graph'
    ? `${pos}, ${pos}, ${pos}, ${pos}`
    : (style === 'iso' ? `${pos}, ${pos}, ${pos}` : pos);
  if (style === 'cross') {
    el.style.webkitMaskSize = px(g);
    el.style.maskSize = px(g);
    el.style.webkitMaskPosition = pos;
    el.style.maskPosition = pos;
  }
}

function applyView() {
  const { x, y, z } = state.view;
  const world = $('world');
  world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  paintGrid(x, y, z);
  const lvl = $('zLevel');
  if (lvl) lvl.textContent = pct(Math.round(z * 100));
  markMoving();
  if (selImg) placeImgChrome();     // its chrome is in screen coords
  scheduleCompass();
  applyFarMode();                   // too far out to read? drop the text
  scheduleMount();                  // pan/zoom changes which notes are on screen
}
function vpRect() { return $('viewport').getBoundingClientRect(); }
// screen pixel -> world coordinate
function toWorld(clientX, clientY) {
  const r = vpRect(), v = state.view;
  return { x: (clientX - r.left - v.x) / v.z, y: (clientY - r.top - v.y) / v.z };
}
// world coordinate -> screen pixel (relative to the viewport box)
function toScreen(wx, wy) {
  const v = state.view;
  return { x: wx * v.z + v.x, y: wy * v.z + v.y };
}
function viewCenterWorld() {
  const r = vpRect();
  return toWorld(r.left + r.width / 2, r.top + r.height / 2);
}

/* ─────────────── 5. render ─────────────── */
const els = new Map();   // id -> element, for the items that are MOUNTED

/* ---- viewport culling ------------------------------------------------------
   A note is ~40 DOM nodes once its head, badges, handles and rich text are
   counted. At a hundred notes that is fine; at a thousand it is forty thousand
   nodes, and every one of them is laid out, painted and hit-tested on a machine
   that may be a spinning disk and an integrated GPU. So above a threshold only
   the items near the viewport are in the document at all, and panning mounts
   and unmounts as you go.

   Below the threshold nothing is culled, so a small board behaves exactly as it
   always did — the whole mechanism is dead code for most people, and a bug in
   it cannot reach them.

   Three rules keep it honest:
     · `els` is the map of *mounted* items, not of all items. Everything that
       reads it already guards with `?.` or `if (!el)`, because unmounting is
       indistinguishable from an item that has been deleted.
     · The note being edited is pinned. Unmounting it would take the caret and
       whatever was typed since the last persist with it.
     · Nothing is unmounted during a gesture. Drag and resize hold direct
       references to elements for the length of the gesture. */
/* Items on the board before culling turns on at all — lower on a machine that
   needs the help, because the threshold is really "how many notes can this
   computer afford to have in the document at once", and that is not the same
   number everywhere. The mechanism is identical either way; only when it starts
   changes. */
const CULL_MIN_FULL = 60, CULL_MIN_LITE = 24;
const cullMin = () => (document.body.dataset.perf === 'lite' ? CULL_MIN_LITE : CULL_MIN_FULL);
const CULL_PAD = 700;      // screen px of margin kept mounted around the viewport
let culling = false;
let cullRaf = 0;

function visibleWorldRect() {
  const r = vpRect(), v = state.view;
  const pad = CULL_PAD / v.z;
  return {
    x0: (0 - v.x) / v.z - pad, y0: (0 - v.y) / v.z - pad,
    x1: (r.width - v.x) / v.z + pad, y1: (r.height - v.y) / v.z + pad
  };
}
const inRect = (it, R) => it.x < R.x1 && it.x + it.w > R.x0 && it.y < R.y1 && it.y + it.h > R.y0;

function mountNote(n, layer) {
  const el = makeNote(n);
  layer.appendChild(el);
  els.set(n.id, el);
  if (selection.has(n.id)) el.classList.add('selected');
  /* Culling mounts notes as you pan, and one that arrives while a filter is on
     has to arrive dimmed — otherwise panning slowly repopulates the board with
     bright notes that the filter should have hidden. */
  if (focusKind && noteMatchesFocus(n)) el.classList.add('focus-hit');
}
function mountFrame(f, layer) {
  const el = makeFrame(f);
  layer.appendChild(el);
  els.set(f.id, el);
  if (selection.has(f.id)) el.classList.add('selected');
}

/* Bring one item into the document whatever the view is doing — used by
   anything that has to touch an element for an item the user cannot see, such
   as opening a note the find bar just landed on. */
function ensureMounted(id) {
  if (els.has(id)) return els.get(id);
  const n = state.notes.find((x) => x.id === id);
  if (n) { mountNote(n, $('notesLayer')); return els.get(id); }
  const f = state.frames.find((x) => x.id === id);
  if (f) { mountFrame(f, $('framesLayer')); return els.get(id); }
  return null;
}

function syncMounted() {
  const nl = $('notesLayer'), fl = $('framesLayer');
  if (!culling) {
    state.frames.forEach((f) => { if (!els.has(f.id)) mountFrame(f, fl); });
    state.notes.forEach((n) => { if (!els.has(n.id)) mountNote(n, nl); });
    return;
  }
  const R = visibleWorldRect();
  const want = new Set();
  state.frames.forEach((f) => { if (inRect(f, R)) want.add(f.id); });
  state.notes.forEach((n) => { if (inRect(n, R)) want.add(n.id); });
  if (editNote) want.add(editNote.id);                       // never pull the caret out
  if (gesture && gesture.items) gesture.items.forEach(({ it }) => want.add(it.id));
  if (gesture && gesture.it) want.add(gesture.it.id);

  els.forEach((el, id) => { if (!want.has(id)) { el.remove(); els.delete(id); } });
  state.frames.forEach((f) => { if (want.has(f.id) && !els.has(f.id)) mountFrame(f, fl); });
  state.notes.forEach((n) => { if (want.has(n.id) && !els.has(n.id)) mountNote(n, nl); });
  /* The ropes are culled to the same rectangle, so panning has to sweep them
     too or a rope stays mounted for a note that left the document — or worse,
     never appears for one that arrived. Cheap: the test is four comparisons per
     rope and only the visible handful are redrawn. */
  drawLinks();
  refreshFrameCounts();
}

/* ---- zoomed far out ----
   Culling stops helping at the one zoom where it is needed most: fit-everything
   puts the whole board on screen, so every note is "visible" and every note is
   mounted. But at that scale the text is two pixels tall and nobody is reading
   it — what you are looking at is the shape of the board, which is the coloured
   rectangles.

   So below FAR_Z the note bodies and their chrome come out of the layout
   entirely. That is the expensive part of a note: the rich text, the eight
   handles, the head buttons. The rectangle stays, in its colour, where it was.

   Only on a board that is already over the culling threshold — zooming out on
   twenty notes costs nothing, and having them turn into blanks would just look
   broken. */
// and drop the text sooner too — the same reasoning, one zoom level earlier
const FAR_Z_FULL = 0.34, FAR_Z_LITE = 0.5;
let farMode = false;
function applyFarMode() {
  const farZ = document.body.dataset.perf === 'lite' ? FAR_Z_LITE : FAR_Z_FULL;
  const far = culling && state.view.z < farZ;
  if (far === farMode) return;
  farMode = far;
  document.body.classList.toggle('far-zoom', far);
}

/* Adding or deleting can carry a board across the threshold in either
   direction. Turning culling *on* has to sweep straight away, or the notes that
   should now be unmounted stay in the document until the next pan. */
function updateCulling() {
  const want = (state.notes.length + state.frames.length) > cullMin();
  if (want === culling) return;
  culling = want;
  document.body.classList.toggle('big-board', culling);
  applyFarMode();
  syncMounted();
}

/* Panning fires applyView() on every pointer move; remounting there would run
   the whole sweep sixty times a second. One per frame is enough, and a frame
   of lag at the very edge of a 700px margin is invisible. */
function scheduleMount() {
  if (!culling || cullRaf) return;
  cullRaf = requestAnimationFrame(() => { cullRaf = 0; syncMounted(); });
}

function render() {
  const nl = $('notesLayer'), fl = $('framesLayer');
  nl.innerHTML = ''; fl.innerHTML = ''; els.clear();
  // the ropes are their own layer and their own map; empty both or a board
  // switch leaves the previous board's ropes attached under the new one
  resetLinks();
  culling = (state.notes.length + state.frames.length) > cullMin();
  document.body.classList.toggle('big-board', culling);
  syncMounted();
  applyView();
  drawLinks();
  refreshFrameCounts();
  updateEmpty();
  syncSelectionClasses();
  syncFocusClasses();          // a render throws the classes away with the elements
}
function updateEmpty() {
  const empty = state.notes.length + state.frames.length === 0;
  $('emptyHint').classList.toggle('hidden', !empty);
  if (empty) renderEmptyStarts();
}

/* The empty board offers a blank note, and every template the user has made, as
   one click each. There are no built-in templates any more, so on a first run
   this is one button and the three tips beneath it — which is honest: the app
   has nothing to show off that the user did not put there.

   Rebuilt each time the board empties rather than once, because the labels are
   translated and the language can change underneath it. */
function renderEmptyStarts() {
  const wrap = $('ehStarts');
  if (!wrap) return;
  const card = (kind, id, ic, name) =>
    `<button class="eh-start" data-kind="${kind}" data-id="${esc(id)}" title="${esc(name)}">
       <span class="ehs-ic">${icon(ic)}</span><span class="ehs-name">${esc(name)}</span>
     </button>`;
  wrap.innerHTML =
    card('blank', '', 'sticky_note_2', t('empty.blank')) +
    userTemplates().map((x) => card('tpl', x.id, x.icon || 'sticky_note_2', templateName(x))).join('');
  wrap.querySelectorAll('.eh-start').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.kind === 'blank') addNote();
    else applyTemplate(b.dataset.id);
  }));
}
function itemById(id) {
  return state.notes.find((n) => n.id === id) || state.frames.find((f) => f.id === id) || null;
}
const isFrame = (id) => state.frames.some((f) => f.id === id);

/* Notes that rope *into* this one. The ropes were always drawn but only ever
   readable in one direction — you could see that a line existed without being
   able to ask "what points at this?" from the note itself. */
const backlinksTo = (id) => state.links.filter((l) => l.to === id).map((l) => l.from);

/* The little badges in a note's head: how many things link to it, whether it
   has a reminder set, whether it has history to go back to. Painted separately
   from the note so a reminder can appear without a full re-render. */
/* The status pill, on the note itself rather than in the head.

   The head fades in on hover and can be switched off entirely, and a status you
   have to hover to read is not a status — the whole value of it is glancing at
   a board and seeing what is where. So it lives under the body, always on, and
   is simply absent when the note has no status.

   Clicking it opens the same context menu the right-click does, positioned on
   the pill: the fastest possible path from "this is in progress" to "this is
   done" is one click on the thing already showing you the answer. */
function paintNoteStatus(el, n) {
  const wrap = el.querySelector('.note-status');
  if (!wrap) return;
  const s = statusOf(n);
  wrap.classList.toggle('hidden', !s);
  el.classList.toggle('is-done', !!(s && s.done));
  el.dataset.status = n.status || '';      // on the element too, for anything keying off it
  if (!s) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `<button class="ns-pill" data-color="${esc(s.color)}"><span class="ns-dot"></span><span class="ns-name">${esc(statusName(s))}</span></button>`;
  wrap.querySelector('.ns-pill').addEventListener('click', (e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    openCtxMenu(r.left, r.bottom + 6, n.id);
  });
}

/* Set, or clear with ''. Takes a list because a lasso-select then one click is
   how a dozen notes get moved to "Done" at the end of a week. */
function setStatus(ids, statusId) {
  let changed = 0;
  ids.forEach((id) => {
    const n = state.notes.find((x) => x.id === id);
    if (!n || n.status === statusId) return;
    n.status = statusId;
    changed++;
    const el = els.get(id);
    if (el) paintNoteStatus(el, n);
  });
  if (!changed) return;
  // a note whose status just changed may have left (or joined) a live filter
  if (focusKind === 'status') syncFocusClasses();
  saveSoon();
  const s = statusById(statusId);
  toast(s ? t('status.set', { name: statusName(s), n: changed }) : t('status.cleared', { n: changed }));
}

function paintNoteMarks(el, n) {
  const wrap = el.querySelector('.nh-marks');
  if (!wrap) return;
  const back = backlinksTo(n.id).length;
  const due = n.remindAt && n.remindAt > Date.now();
  let html = '';
  if (back) html += `<button class="nh-mark back" data-mark="back" title="${te('note.backlinks', { n: back })}">${icon('hub')}<span>${num(back)}</span></button>`;
  if (due) {
    const when = t('note.remindAt', { when: fmtWhen(n.remindAt) }) + (n.repeat ? ' · ' + repeatLabel(n.repeat) : '');
    html += `<button class="nh-mark due${n.repeat ? ' rep' : ''}" data-mark="due" title="${esc(when)}">${icon(n.repeat ? 'restart_alt' : 'alarm')}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('.nh-mark').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.dataset.mark === 'back') {
      const ids = backlinksTo(n.id);
      if (ids.length) { setSelection(ids, false); fitTo(ids.map((i) => itemById(i)).filter(Boolean)); }
    } else {
      openRemindDialog(n.id);
    }
  }));
}
function repaintMarks(id) {
  const el = els.get(id), n = state.notes.find((x) => x.id === id);
  if (el && n) paintNoteMarks(el, n);
}
// a short, locale-aware "when" for reminder labels
function fmtWhen(ms) {
  try {
    return new Intl.DateTimeFormat(LANG._locale || LANG_ID, {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date(ms));
  } catch (_) { return new Date(ms).toLocaleString(); }
}
