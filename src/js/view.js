/* Mental Board — view.js
   The world transform, render(), and viewport culling.

   Part 5 of 22. These files are plain scripts sharing one global
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
  syncInk();                        // and which strokes, on a board with many
  scheduleMinimap();
  if (typeof padDirty === 'function') padDirty();   // a paired phone sees the board move (js/tablet.js)
  followCamera();                   // a drag in progress stays under the pointer (js/items.js)
}
/* The viewport's box, cached (2.1).

   Every toWorld(), every culling sweep and every minimap draw asked the
   browser for this, and getBoundingClientRect() is a *synchronous layout*
   whenever anything in the document has changed since the last one — which,
   during a pan or a zoom on a big board, is always: the previous frame
   mounted and unmounted notes. Measured at up to 30 ms a frame on three
   thousand notes, all of it spent laying out the notes layer to answer a
   question whose answer had not changed.

   The box only changes when the window does, or when something beside the
   canvas comes or goes (the rail pinned, focus mode); a ResizeObserver hears
   every one of those as a size change, and applySettings() drops the cache
   as well for the position-only case. */
let vpCache = null;
function vpRect() {
  if (vpCache) return vpCache;
  const r = $('viewport').getBoundingClientRect();
  vpCache = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.x, y: r.y };
  return vpCache;
}
function forgetVpRect() { vpCache = null; }
function watchVpRect() {
  window.addEventListener('resize', forgetVpRect);
  if (window.ResizeObserver) new ResizeObserver(forgetVpRect).observe($('viewport'));
}
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
const CULL_MIN = { full: 60, balanced: 40, lite: 24 };
const cullMin = () => CULL_MIN[document.body.dataset.perf] || CULL_MIN.full;
/* Screen px of margin kept mounted around the viewport. Narrower on a machine
   that needs the help: the margin is what makes a pan look seamless, and a
   slow machine is better served by fewer notes in the document than by a
   wider apron of them. */
const CULL_PAD = { full: 700, balanced: 520, lite: 380 };
const cullPad = () => CULL_PAD[document.body.dataset.perf] || CULL_PAD.full;
let culling = false;
let cullRaf = 0;

function visibleWorldRect() {
  const r = vpRect(), v = state.view;
  const pad = cullPad() / v.z;
  return {
    x0: (0 - v.x) / v.z - pad, y0: (0 - v.y) / v.z - pad,
    x1: (r.width - v.x) / v.z + pad, y1: (r.height - v.y) / v.z + pad
  };
}
const inRect = (it, R) => it.x < R.x1 && it.x + it.w > R.x0 && it.y < R.y1 && it.y + it.h > R.y0;

function mountNote(n, layer) {
  // below FAR_Z this is a coloured rectangle and nothing else — see makeNote()
  const el = makeNote(n, farMode);
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
/* Bring one item into the document whatever the view is doing — and, since
   far zoom mounts notes as stubs, make sure what comes back is a *finished*
   note. Every caller that reaches for a `.note-body`, a head button or a resize
   handle has to come through here; `els.get()` alone promises an element, this
   promises a complete one. */
function ensureMounted(id) {
  if (els.has(id)) {
    const el = els.get(id);
    return unstub(el, state.notes.find((x) => x.id === id));
  }
  const n = state.notes.find((x) => x.id === id);
  if (n) { mountNote(n, $('notesLayer')); return unstub(els.get(id), n); }
  const f = state.frames.find((x) => x.id === id);
  if (f) { mountFrame(f, $('framesLayer')); return els.get(id); }
  return null;
}

function syncMounted() {
  const nl = $('notesLayer'), fl = $('framesLayer');
  if (!culling) {
    state.frames.forEach((f) => { if (!els.has(f.id)) mountFrame(f, fl); });
    state.notes.forEach((n) => { if (!els.has(n.id)) mountNote(n, nl); });
    if (!farMode) state.notes.forEach((n) => unstub(els.get(n.id), n));
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
  /* Any stub that survived the cull becomes a real note now that the text is
     going to be readable again — **after** the removals above, which is the
     whole point of doing it here rather than in applyFarMode(). Zooming out to
     the whole board and back in mounts thousands of stubs and keeps a
     screenful; filling them before the cull built every one of them for
     nothing. */
  if (!farMode) fillStubs(want, R);
  else restubMounted();
  /* The ropes are culled to the same rectangle, so panning has to sweep them
     too or a rope stays mounted for a note that left the document — or worse,
     never appears for one that arrived. Cheap: the test is four comparisons per
     rope and only the visible handful are redrawn. */
  drawLinks();
  refreshFrameCounts();
}

/* The other direction (2.2). Going out past FAR_Z, the notes already on
   screen are finished ones, and far-zoom CSS only hid their text: a blank card
   that still carried its whole body. Each goes back to being a stub, so it
   shows the ghost of its text (items.js noteGhost) and the document sheds the
   body. Here rather than in applyFarMode() because the exemptions end later:
   the note being edited keeps its caret until the edit closes, and nothing a
   gesture is holding is touched until it lets go — after either, the next
   sweep catches it. A picture is never a stub. Measured at 0.3 ms a frame over
   3,000 mounted notes, almost all of them already stubs. */
function restubMounted() {
  let byId = null;
  els.forEach((el, id) => {
    if (el.dataset.stub || el.classList.contains('frame') || el.classList.contains('pic')) return;
    if (editNote && editNote.id === id) return;
    if (gesture && ((gesture.it && gesture.it.id === id) ||
        (gesture.items && gesture.items.some(({ it }) => it.id === id)))) return;
    const n = (byId || (byId = noteIndex())).get(id);
    if (n && !n.pic) stubNote(el, n);
  });
}

/* Finish the stubs that are staying on screen — a few at a time (2.1).

   This used to be `want.forEach(id => unstub(el, state.notes.find(...)))`,
   run on every frame of every pan: a linear search of the whole board for
   every note on screen, whether or not it was a stub — about a million
   comparisons a frame on a board of three thousand. And on the frame the view
   left far zoom it built every stub still on screen at once, which measured
   at a 100–145 ms stall on the way back in from fit-everything.

   Now only stubs are looked at, through one index, and they are filled
   nearest the middle of the screen first within a time budget per frame; what
   is left waits for the next frame, which scheduleMount() asks for. A stub
   is a coloured card in its right place, so for the two or three frames this
   takes the board looks like it is focusing rather than like it froze — and
   anything that needs a note's insides still gets them at once through
   ensureMounted(), so the contract in §4c is unchanged. */
const STUB_BUDGET = { full: 7, balanced: 5, lite: 4 };     // ms of filling per frame
function fillStubs(ids, R) {
  let stubs = null;
  for (const id of ids) {
    const el = els.get(id);
    if (el && el.dataset.stub) (stubs || (stubs = [])).push(el);
  }
  if (!stubs) return;
  const byId = noteIndex();
  /* The middle of the view from the rectangle syncMounted() measured *before*
     it changed the document. Asking the viewport again here, after the cull
     has added and removed notes, forced a synchronous layout of the whole
     layer — 30 ms of it on the frame that leaves far zoom. */
  const c = R ? { x: (R.x0 + R.x1) / 2, y: (R.y0 + R.y1) / 2 } : viewCenterWorld();
  const d2 = (el) => {
    const n = byId.get(el.dataset.id);
    if (!n) return Infinity;
    const dx = n.x + n.w / 2 - c.x, dy = n.y + n.h / 2 - c.y;
    return dx * dx + dy * dy;
  };
  if (stubs.length > 1) stubs.sort((a, b) => d2(a) - d2(b));
  const budget = STUB_BUDGET[document.body.dataset.perf] || STUB_BUDGET.full;
  const t0 = performance.now();
  let i = 0;
  while (i < stubs.length) {
    unstub(stubs[i], byId.get(stubs[i].dataset.id));
    i++;
    if (performance.now() - t0 > budget) break;
  }
  if (i < stubs.length) scheduleMount();
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
const FAR_Z = { full: 0.34, balanced: 0.42, lite: 0.5 };
let farMode = false;
function applyFarMode() {
  const farZ = FAR_Z[document.body.dataset.perf] || FAR_Z.full;
  const far = culling && state.view.z < farZ;
  if (far === farMode) return;
  farMode = far;
  document.body.classList.toggle('far-zoom', far);
  /* Filling the stubs back in is deliberately **not** done here. Leaving far
     zoom means going from the whole board on screen to a screenful of it, so
     almost every mounted stub is about to be culled — finishing them all first
     was 600ms of building notes to throw most of them away on the very next
     line. syncMounted() does it instead, after the cull, to the handful that
     survive. Every path that changes the zoom already ends there. */
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
  scheduleMinimap();
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
  drawInk();
  refreshFrameCounts();
  updateEmpty();
  syncSelectionClasses();
  syncFocusClasses();          // a render throws the classes away with the elements
  applyBoardLook();            // this board's own font, text size and background
}
function updateEmpty() {
  const empty = state.notes.length + state.frames.length + (state.ink ? state.ink.length : 0) === 0;
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
  const date = okDateKey(n.date);
  const due = n.remindAt && n.remindAt > Date.now();
  wrap.classList.toggle('hidden', !s && !date && !due);
  el.classList.toggle('is-done', !!(s && s.done));
  el.dataset.status = n.status || '';      // on the element too, for anything keying off it
  el.dataset.when = date ? dateState(n) : '';
  let html = '';
  if (s) html += `<button class="ns-pill" data-color="${esc(s.color)}"><span class="ns-dot"></span><span class="ns-name">${esc(statusName(s))}</span></button>`;
  /* The date pill sits beside the status pill and opens the same menu. Its
     colour is what the day means — red once it has gone, amber on the day —
     and plain on a finished note, because "late" stops being true of a note
     the moment it is done. */
  if (date) {
    const when = dateState(n);
    html += `<button class="nd-pill${when ? ' ' + when : ''}" title="${esc(fmtDay(date))}">${icon('event')}<span class="ns-name">${esc(dateLabel(date))}</span></button>`;
  }
  /* A reminder still to come. It sat in the note's head until 2.1 removed the
     head; it is information, not a control, so it joins the other two pills and
     opens the reminder dialog rather than the menu. */
  if (due) {
    const when = t('note.remindAt', { when: fmtWhen(n.remindAt) }) + (n.repeat ? ' · ' + repeatLabel(n.repeat) : '');
    html += `<button class="nr-pill" data-mark="due" title="${esc(when)}">${icon(n.repeat ? 'restart_alt' : 'alarm')}</button>`;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.dataset.mark === 'due') { openRemindDialog(n.id); return; }
    const r = e.currentTarget.getBoundingClientRect();
    openCtxMenu(r.left, r.bottom + 6, n.id);
  }));
}

/* ---- dates on notes (MAP.md §4s) ---- */
// 'YYYY-MM-DD' for today plus `days`, in local time
function dayKeyIn(days) { const d = new Date(); d.setDate(d.getDate() + days); return todayKey(d); }
// whole days from today to the key; negative is the past
function daysUntil(key) {
  const [y, m, d] = key.split('-').map(Number);
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
}
// 'late' | 'today' | 'done' | '' — what the day means for this note right now
function dateState(n) {
  const key = okDateKey(n && n.date);
  if (!key) return '';
  const s = statusOf(n);
  if (s && s.done) return 'done';
  const d = daysUntil(key);
  return d < 0 ? 'late' : d === 0 ? 'today' : '';
}
function fmtDate(key, opts) {
  const [y, m, d] = key.split('-').map(Number);
  try { return new Intl.DateTimeFormat(LANG._locale || LANG_ID, opts).format(new Date(y, m - 1, d)); }
  catch (_) { return key; }
}
// the long form, for the tooltip and the toast
const fmtDay = (key) => fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
/* The short form on the pill. Near days by name, the coming week by weekday
   (a weekday reads faster than a number when it is this week), and anything
   further as a day and month, with the year only when it is not this one. */
function dateLabel(key) {
  const d = daysUntil(key);
  if (d === 0) return t('date.today');
  if (d === 1) return t('date.tomorrow');
  if (d === -1) return t('date.yesterday');
  if (d > 1 && d < 7) return fmtDate(key, { weekday: 'long' });
  const opts = { day: 'numeric', month: 'short' };
  if (+key.slice(0, 4) !== new Date().getFullYear()) opts.year = 'numeric';
  return fmtDate(key, opts);
}

/* Set, or clear with ''. A list for the same reason setStatus takes one. */
function setNoteDate(ids, key) {
  key = okDateKey(key);
  let changed = 0;
  ids.forEach((id) => {
    const n = state.notes.find((x) => x.id === id);
    if (!n || n.pic || (n.date || '') === key) return;
    n.date = key;
    changed++;
    const el = els.get(id);
    if (el) paintNoteStatus(el, n);
  });
  if (!changed) return;
  if (focusKind === 'date') syncFocusClasses();
  saveSoon();
  toast(key ? t('date.set', { when: fmtDay(key), n: changed }) : t('date.cleared', { n: changed }));
}

/* A pill says "Today" on the day and "Yesterday" on the next, so the labels go
   stale at midnight. Repaint the mounted ones when the day turns over; a note
   mounted later is painted fresh anyway. */
let paintedDay = '';
function watchDayChange() {
  paintedDay = todayKey();
  setInterval(() => {
    const k = todayKey();
    if (k === paintedDay) return;
    paintedDay = k;
    state.notes.forEach((n) => { if (n.date) { const el = els.get(n.id); if (el) paintNoteStatus(el, n); } });
    if (focusKind === 'date') syncFocusClasses();
  }, 60e3);
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

/* The marks (a reminder) live in the pill row since the head went; the
   backlink count moved to the right-click menu's "Linked notes" rows. */
function repaintMarks(id) {
  const el = els.get(id), n = state.notes.find((x) => x.id === id);
  if (el && n) paintNoteStatus(el, n);
}
// a short, locale-aware "when" for reminder labels
function fmtWhen(ms) {
  try {
    return new Intl.DateTimeFormat(LANG._locale || LANG_ID, {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date(ms));
  } catch (_) { return new Date(ms).toLocaleString(); }
}
