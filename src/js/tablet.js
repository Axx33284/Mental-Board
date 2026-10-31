/* Mental Board — tablet.js
   A phone as a drawing tablet: the renderer's half.

   Part 22 of 23. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 10c. the phone as a tablet ───────────────

   2.2. Settings ▸ Extra ▸ Pair a phone. Main (src/tablet.js) listens on the
   LAN, the phone opens the page it serves, and every pen event on the phone
   arrives here as a checked message (`onPadMessage`). This file turns those
   into ink exactly the way ink.js turns the mouse into ink — same stroke
   shape, same widths, same undo step, same save — so a stroke from the phone
   is indistinguishable on disk from one drawn with the mouse.

   Where a stroke lands (2.2.1). **The phone is a region of this window**: the
   biggest rectangle with the shape of the phone's screen that fits in the
   board's viewport, centred, and outlined here while a phone is paired
   (#padArea). A portrait phone is a tall slice down the middle; a landscape
   one is most of the window. A point a third of the way across the phone lands
   a third of the way across that rectangle, at the zoom you are at. The view
   is taken once at the start of a stroke, so a pan from the mouse half way
   through cannot bend a line.

   What the phone sees (2.2.1). Pictures of that rectangle, taken by main
   (`mbPad.frame` → webContents.capturePage) — so the phone shows exactly what
   is here, notes, pictures, the far-zoom ghosts and the ink, in the theme it
   is in, with nothing redrawn on the phone. A picture is taken when something
   changed (`padDirty()` is called from applyView, saveSoon, drawInk, the live
   stroke and the ink selection), at most one in flight — the next waits for
   the phone to say it has the last one (`got`) — and a picture identical to
   the last is never sent. A board at rest sends nothing; one being drawn on
   sends as many as the Wi-Fi carries, and no more. MAP.md §4x says why this
   and not streamed geometry.

   Nothing here writes anything the mouse could not. A board that cannot be
   edited (locked, unreadable) is never drawn on, and the phone is told so. */

const PAD = window.mbPad || null;
let padInfo = { state: 'off' };    // the last state main reported
const padLive = new Map();         // phone stroke id -> a stroke being drawn, an eraser sweep, or a select gesture
const padMine = [];                // ids of the strokes this pairing drew, for the phone's undo
let padViewSent = '';
let padViewTimer = 0;
let padSize = { a: 0.5, px: 1080 }; // the phone's drawing area: aspect and device-pixel width
let padNav = 0;                    // the last of the phone's pans and zooms applied here
let padK = 0;                      // the last of the phone's strokes finished here
const padShot = { n: 0, busy: false, dirty: false, last: 0, timer: 0, wait: 0 };

const padOn = () => padInfo.state === 'connected';

function wirePad() {
  if (!PAD) { $('padBtn')?.closest('.set-row')?.classList.add('hidden'); return; }
  PAD.onState(onPadState);
  PAD.onMessage(onPadMessage);
  $('padBtn').addEventListener('click', () => (padInfo.state === 'off' ? startPad() : PAD.stop()));
  $('padAddr').addEventListener('change', () => startPad($('padAddr').value));
  paintPadPanel();
}
async function startPad(address) {
  $('padBtn').disabled = true;
  let r = null;
  try { r = await PAD.start(address || ''); } catch (_) {}
  $('padBtn').disabled = false;
  if (!r || !r.ok) {
    padInfo = { state: 'off' };
    toast(t(r && r.error === 'no-network' ? 'pad.noNetwork' : 'pad.failed'), 5000);
    paintPadPanel();
  }
}

function onPadState(st) {
  const was = padInfo.state;
  // `waiting` carries the address and the code; later states keep them
  padInfo = st.state === 'waiting' ? st : Object.assign({}, padInfo, st);
  if (st.state === 'connected' && was !== 'connected') {
    toast(t('pad.toastOn'));
    padViewSent = '';
    padShot.busy = false;
    sendPadView();
    clearInterval(padViewTimer);
    /* The phone has to know when the board becomes one it cannot draw on, and
       the outline has to follow the window when it is resized. Neither has an
       event of its own, and a check once a second costs nothing. The same tick
       asks for a picture: identical ones are dropped in main, so this only
       ever sends something a change missed (a picture finishing loading, a
       theme fading). */
    padViewTimer = setInterval(() => { sendPadView(); paintPadArea(); padDirty(); }, 1000);
    paintPadArea();
    padDirty();
  }
  if (st.state !== 'connected') {
    clearInterval(padViewTimer);
    padLive.forEach((k, id) => endPadStroke(id));
    hidePadCursor();
    paintPadArea();
  }
  if (st.state === 'off') {
    padMine.length = 0;
    padNav = padK = 0;
    if (was === 'connected' || was === 'away') toast(t('pad.toastOff'));
  }
  paintPadPanel();
}

/* ---- the panel in Settings ▸ Extra ---- */
function paintPadPanel() {
  const st = padInfo.state;
  const on = st !== 'off';
  $('padBtnLabel').textContent = t(on ? 'set.padStop' : 'set.padStart');
  $('padBox').classList.toggle('hidden', !on);
  if (!on) { $('padQr').textContent = ''; return; }
  if (padInfo.qr && $('padQr').dataset.url !== padInfo.url) {
    $('padQr').innerHTML = qrSvg(padInfo.qr);
    $('padQr').dataset.url = padInfo.url;
  }
  $('padQr').classList.toggle('done', st === 'connected');
  $('padUrl').textContent = padInfo.url || '';
  const status = st === 'connected' ? t('pad.connected', { device: padInfo.device || '—' })
    : st === 'away' ? t('pad.away') : t('pad.waiting');
  $('padStatus').textContent = status;
  const addrs = padInfo.addresses || [];
  $('padAddrRow').classList.toggle('hidden', addrs.length < 2 || st === 'connected');
  const sel = $('padAddr');
  sel.innerHTML = addrs.map((a) => `<option value="${esc(a.address)}">${esc(a.address)} — ${esc(a.name)}</option>`).join('');
  sel.value = padInfo.address || '';
}
// the module rows as an SVG, with the four-module quiet zone a camera needs
function qrSvg(rows) {
  const n = rows.length, q = 4;
  let d = '';
  rows.forEach((r, y) => { for (let x = 0; x < n; x++) if (r[x] === '1') d += `M${x + q} ${y + q}h1v1h-1z`; });
  return `<svg viewBox="0 0 ${n + q * 2} ${n + q * 2}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/* ---- what the phone draws on (2.6.2) ----
   The board — or, while one is open, a drawing note's editor (sketch.js) or
   the picture editor (media.js). Both editors have a view in exactly the
   board's form ({ x, y, z } relative to their own stage), so the phone's
   region, its pictures, the mapping of a pen point and its pan and zoom are
   the same arithmetic on a different box. Before 2.6.2 the phone only ever
   knew the board: with a drawing note open, its pen drew on the board behind
   it, which is to say not where anybody was looking. `id` tells a stroke
   whether what it began on is still open. A book (book.js, 3.0.2) is a
   fourth: its camera has the same form, and a stroke lands on the page under
   the pen. */
function padHost() {
  // the picture editor first: since 2.10 it can be open over a drawing note
  if (ST.img && !$('studio').classList.contains('hidden')) {
    const r = $('studioStage').getBoundingClientRect();
    return { kind: 'studio', id: ST.target, r, v: ST.view };
  }
  if (typeof sketchOpen === 'function' && sketchOpen()) {
    const r = $('skStage').getBoundingClientRect();
    return { kind: 'sketch', id: sk.n.id, r, v: sk.view };
  }
  if (typeof bookOpen === 'function' && bookOpen()) {
    const r = $('bkStage').getBoundingClientRect();
    return { kind: 'book', id: bk.n.id, r, v: bk.cam };
  }
  return { kind: 'board', id: state.activeBoard, r: vpRect(), v: state.view };
}
// an editor opened or closed: the outline, the phone's view and its picture follow
function padHostChanged() {
  if (!padOn()) return;
  paintPadArea(); sendPadView(); padDirty();
}
// in full screen only the full-screen element is drawn, so the outline and the ring live in it
const padLayer = () => document.fullscreenElement || document.body;

/* ---- the region of this window the phone is ---- */
// relative to what it draws on (the board's viewport, or an editor's stage), in screen pixels
function padRect() {
  const r = padHost().r, a = padSize.a;
  let w = r.width, h = r.width / a;
  if (h > r.height) { h = r.height; w = h * a; }
  return { x: Math.round((r.width - w) / 2), y: Math.round((r.height - h) / 2), w: Math.round(w), h: Math.round(h) };
}
/* The outline. Drawn just *outside* the rectangle, so the pictures taken of
   the rectangle never contain it. */
function paintPadArea() {
  let el = $('padArea');
  if (!padOn()) { if (el) el.classList.add('hidden'); return; }
  if (!el) { el = document.createElement('div'); el.id = 'padArea'; el.setAttribute('aria-hidden', 'true'); }
  if (el.parentNode !== padLayer()) padLayer().appendChild(el);
  const r = padHost().r, p = padRect();
  el.style.left = r.left + p.x + 'px'; el.style.top = r.top + p.y + 'px';
  el.style.width = p.w + 'px'; el.style.height = p.h + 'px';
  el.classList.remove('hidden');
}

/* ---- the pictures ---- */
function padDirty() {
  if (!padOn()) return;
  padShot.dirty = true;
  if (!padShot.timer) padShot.timer = setTimeout(padPump, Math.max(0, 90 - (performance.now() - padShot.last)));
}
async function padPump() {
  padShot.timer = 0;
  if (!padOn() || padShot.busy || !padShot.dirty) return;
  padShot.dirty = false;
  padShot.busy = true;
  padShot.last = performance.now();
  /* The ring where the pen hovers is for this screen only. The phone has the
     S Pen's own pointer, and a picture of this ring under it was a second
     circle there (2.10) — so it is hidden while the picture is taken. */
  const ring = $('padCursor');
  if (ring) ring.style.visibility = 'hidden';
  // two frames, so what changed has been painted before main photographs it
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  const r = padHost().r, p = padRect();
  const n = ++padShot.n;
  let res = null;
  try { res = await PAD.frame({ n, nav: padNav, k: padK, rect: { x: r.left + p.x, y: r.top + p.y, width: p.w, height: p.h } }); } catch (_) {}
  if (ring) ring.style.visibility = '';
  if (!res || !res.sent) { padShot.busy = false; if (padShot.dirty) padDirty(); return; }
  // sent: wait for the phone to say it has it, but never for ever
  clearTimeout(padShot.wait);
  padShot.wait = setTimeout(() => padGot(n), 1500);
}
function padGot(n) {
  if (n !== padShot.n) return;
  clearTimeout(padShot.wait);
  padShot.busy = false;
  if (padShot.dirty) padDirty();
}

/* ---- what the phone is told: whether it may draw, the colours, the selection ---- */
/* The ink colours as the phone should show them: resolved inside whatever is
   open, not on <body>. A drawing note and a book fix their ink to the paper
   (mental.css §83 and §87), so there "ink" is black whatever the theme — and
   until 3.1 the phone was told the theme's text colour instead, so in a dark
   theme its black swatch and the line it drew were white. Kept until the
   host, the theme or the paper changes, since the view is sent every second. */
const PAD_HOST_EL = { studio: 'studio', sketch: 'sketchDlg', book: 'bookDlg' };
const padHostEl = (kind) => (PAD_HOST_EL[kind] && $(PAD_HOST_EL[kind])) || document.body;
function padPalette(kind) {
  const root = document.documentElement, key = [kind, root.dataset.theme, root.dataset.mode, root.style.getPropertyValue('--accent'), document.body.dataset.skpaper].join('|');
  if (padPalette.key === key) return padPalette.out;
  const probe = document.createElement('i');
  padHostEl(kind).appendChild(probe);
  const read = (css) => { probe.style.color = css; return getComputedStyle(probe).color; };
  padPalette.out = ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c))
    .map((k) => ({ k, c: read(inkColorCss(k)) }));
  // the app's own surfaces, so the phone's bar wears the theme the app is in
  document.body.appendChild(probe);
  padPalette.theme = { bg: read('var(--bg)'), panel: read('var(--surface)'), line: read('var(--line-2)'), text: read('var(--text)'), dim: read('var(--dim)'), mode: root.dataset.mode === 'light' ? 'light' : 'dark' };
  probe.remove();
  padPalette.key = key;
  return padPalette.out;
}
// what is open, for the phone's bar: a board, a drawing, a book (and where in it), or a picture
function padWhere(kind) {
  if (kind === 'book') return { k: 'book', title: bk.n.book.title || t('book.untitled'), at: bk.at + 1, n: bk.n.book.pages };
  if (kind === 'sketch') return { k: 'sketch', title: sk.n.sketch.title || '' };
  if (kind === 'studio') return { k: 'studio', title: '' };
  const b = activeBoard();
  return { k: 'board', title: b ? b.name || '' : '' };
}
/* canEditHere() without its toast — it is asked once a second while a phone is
   paired, and a locked board would say so once a second. The stroke itself
   still goes through canEditHere(), so a pen put down there says why once. */
function padCanDraw() { const b = activeBoard(); return !(b && (b.unreadable || isLocked(b))); }
function sendPadView() {
  if (!padOn()) return;
  // rw: how many screen pixels wide the phone's region is here, so the phone draws its own line at the width it will land
  const kind = padHost().kind, board = kind === 'board';
  // how much is selected, where the phone is — its bin is lit by this
  const sel = board ? inkSel.size : kind === 'sketch' ? sk.sel.size : 0;
  const pal = padPalette(kind);
  const m = { t: 'view', ro: board && !padCanDraw(), pal, sel, rw: padRect().w, book: kind === 'book', theme: padPalette.theme, where: padWhere(kind) };
  const key = JSON.stringify(m);
  if (key === padViewSent) return;
  padViewSent = key;
  PAD.send(m);
}

/* ---- what the phone says ---- */
function onPadMessage(m) {
  if (!m || !m.t) return;
  if (m.t === 'down') beginPadStroke(m);
  else if (m.t === 'move') movePadStroke(m.id, m.pts);
  else if (m.t === 'up') endPadStroke(m.id);
  else if (m.t === 'hover') showPadCursor(m.x, m.y);
  else if (m.t === 'leave') hidePadCursor();
  else if (m.t === 'pan') { padPan(m.dx, m.dy); padNav = Math.max(padNav, m.n || 0); }
  else if (m.t === 'zoom') {
    const h = padHost(), p = padRect();
    const cx = h.r.left + p.x + m.x * p.w, cy = h.r.top + p.y + m.y * p.h;
    if (h.kind === 'sketch') skSurface.zoomAt(cx, cy, m.f);
    else if (h.kind === 'studio') stSurface.zoomAt(cx, cy, m.f);
    else if (h.kind === 'book') bkSurface.zoomAt(cx, cy, m.f);
    else zoomAt(cx, cy, m.f);
    padNav = Math.max(padNav, m.n || 0);
  }
  else if (m.t === 'undo') {
    const kind = padHost().kind;
    if (kind === 'sketch') sketchUndo(true);
    else if (kind === 'studio') studioUndo(true);
    else if (kind === 'book') bookUndo(true);
    else padUndo();
  }
  else if (m.t === 'sel') padSelection(m);
  // the phone's arrows turn a book's pages
  else if (m.t === 'page') { if (padHost().kind === 'book') bookGo(m.d); }
  else if (m.t === 'size') { padSize = { a: m.a, px: m.px }; paintPadArea(); sendPadView(); padDirty(); }
  else if (m.t === 'got') padGot(m.n);
}

/* A phone point → world. `map` is the phone's region as it was when the
   stroke began: where it sits in the viewport, its size, and the view. */
function padMap() {
  const h = padHost(), p = padRect(), v = h.v;
  return { rx: p.x, ry: p.y, rw: p.w, rh: p.h, vx: v.x, vy: v.y, z: v.z, board: state.activeBoard, kind: h.kind, id: h.id };
}
function padWorld(map, x, y) { return { x: (map.rx + x * map.rw - map.vx) / map.z, y: (map.ry + y * map.rh - map.vy) / map.z }; }
// the same point as a pointer event's client coordinates, for ink.js's select gesture
// — and the world point, from the map the stroke began with, so a pan on the PC mid-gesture cannot move it
function padClient(map, x, y) { const r = vpRect(); return { clientX: r.left + map.rx + x * map.rw, clientY: r.top + map.ry + y * map.rh, shiftKey: false, world: padWorld(map, x, y) }; }

function beginPadStroke(m) {
  if (padLive.has(m.id)) endPadStroke(m.id);
  const map = padMap();
  if (map.kind !== 'board') { beginPadEditorStroke(m, map); return; }
  if (!canEditHere()) { sendPadView(); return; }
  const z = map.z;
  hidePadCursor();
  if (m.tool === 'select') { beginPadPick(m, map); return; }
  if (m.tool === 'eraser') {
    padLive.set(m.id, { erase: true, map, r: INK_SIZES.eraser[m.size] / z, last: null, pushed: false, k: m.k });
    padErase(padLive.get(m.id), m.x, m.y);
    return;
  }
  if ((state.ink || []).length >= INK_MAX) { toast(t('ink.full')); return; }
  const color = inkColorOk(m.color) ? m.color : 'text';
  const s = { id: uid(), tool: m.tool, color, size: Math.round(INK_SIZES[m.tool][m.size] / z * 100) / 100, pts: [] };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + s.tool + ' ink-live');
  const c = inkColorCss(s.color);
  if (s.tool === 'brush') el.style.fill = c;
  else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  $('inkSvg').appendChild(el);
  const k = { s, raw: [], el, frame: 0, map, k: m.k };
  padLive.set(m.id, k);
  addPadPoint(k, m.x, m.y, m.p);
}
function addPadPoint(k, x, y, p) {
  const w = padWorld(k.map, x, y);
  const last = k.raw[k.raw.length - 1];
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * k.map.z < 0.6) return;
  // -1 is the phone's "no pressure": a finger, or a mouse standing in for the pen
  k.raw.push({ x: w.x, y: w.y, p: p != null && p > 0 ? p : null, t: performance.now() });
  if (!k.frame) k.frame = requestAnimationFrame(() => paintPadStroke(k));
}
function movePadStroke(id, pts) {
  const k = padLive.get(id);
  if (!k) return;
  for (let i = 0; i < pts.length; i += 3) {
    if (k.ed) {
      if (k.book) padBookPoint(k, pts[i], pts[i + 1], pts[i + 2]);
      else if (k.pick) { if (sk && sk.pick && padHostAlive(k.map)) moveSketchPick(Object.assign(padWorld(k.map, pts[i], pts[i + 1]), { k: k.map.z })); }
      else if (k.erase) padEditorErase(k, pts[i], pts[i + 1]);
      else addPadEditorPoint(k, pts[i], pts[i + 1], pts[i + 2]);
    }
    else if (k.pick) { if (inkPick === k.pick) moveInkPick(padClient(k.map, pts[i], pts[i + 1])); }
    else if (k.erase) padErase(k, pts[i], pts[i + 1]);
    else addPadPoint(k, pts[i], pts[i + 1], pts[i + 2]);
  }
}
function paintPadStroke(k) {
  k.frame = 0;
  if (!k.el.isConnected) $('inkSvg').appendChild(k.el);     // a render() in between empties the layer
  const { raw, pts } = inkPoints(k);
  k.el.setAttribute('d', k.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(raw, k.s.size)) : inkLinePath(pts));
  padDirty();
}
function endPadStroke(id) {
  const k = padLive.get(id);
  padLive.delete(id);
  if (!k) return;
  padK = Math.max(padK, k.k || 0);
  if (k.ed) { endPadEditorStroke(k); return; }
  if (k.pick) { if (inkPick === k.pick) endInkPick(); sendPadView(); padDirty(); return; }
  if (k.erase) {
    if (k.pushed) { updateEmpty(); saveSoon(); }
    padDirty();
    return;
  }
  if (k.frame) cancelAnimationFrame(k.frame);
  k.el.remove();
  padDirty();
  // the board changed under the pen, or became one that cannot be drawn on
  if (k.map.board !== state.activeBoard || !padCanDraw()) return;
  const { raw, pts } = inkPoints(k);
  if (!pts.length) return;
  k.s.pts = pts;
  if (k.s.tool === 'brush') k.s.ws = brushWidths(raw, k.s.size);
  pushUndoInk();
  state.ink.push(k.s);
  padMine.push(k.s.id);
  drawInk(); updateEmpty(); saveSoon();
}
/* The eraser from the phone: whole strokes, along the whole sweep, as in
   eraseAt(). Its undo step is taken at the first stroke it actually takes,
   not when the pen goes down — a sweep across nothing leaves no step, and
   nothing has to be popped off a stack the mouse may have pushed onto since. */
function padErase(k, x, y) {
  if (k.map.board !== state.activeBoard || !padCanDraw()) return;
  const w = padWorld(k.map, x, y);
  const from = k.last || w;
  k.last = w;
  const steps = Math.max(1, Math.ceil(Math.hypot(w.x - from.x, w.y - from.y) / (k.r * 0.5)));
  const gone = new Set();
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    eraseNear({ x: from.x + (w.x - from.x) * f, y: from.y + (w.y - from.y) * f }, k.r, gone);
  }
  if (!gone.size) return;
  if (!k.pushed) { pushUndoInk(); k.pushed = true; }
  state.ink = state.ink.filter((s) => !gone.has(s.id));
  gone.forEach((id) => inkPathCache.delete(id));
  drawInk();
}

/* ---- selecting from the phone (2.2.1) ----
   The phone's arrow is ink.js's select tool, driven with the phone's points
   turned into client coordinates: a touch on a stroke selects it (and a drag
   from there moves the whole selection), a drag across empty board lassos.
   The gesture is ink.js's own `inkPick`, moved by moveInkPick() and settled by
   endInkPick(), so the move is one `ink` undo step and saves like the mouse's.
   Only the hit radius is the phone's: a pen tip needs more room than the arrow
   on the ink bar gives a mouse. Delete and colour arrive as `sel` and go to
   deleteInkSelection() and recolorInkSelection(). */
const PAD_PICK_PX = 12;
function beginPadPick(m, map) {
  if (inkPick || inkStroke || inkErase) return;       // the mouse is in the middle of something
  const e = padClient(map, m.x, m.y);
  const id = inkHit(padWorld(map, m.x, m.y), PAD_PICK_PX / map.z);
  if (id) {
    if (!inkSel.has(id)) { inkSel.clear(); inkSel.add(id); }
    paintInkSelection();
    inkPick = { kind: 'move', sx: e.clientX, sy: e.clientY, w0: e.world, moved: false, dx: 0, dy: 0 };
  } else {
    inkPick = { kind: 'lasso', sx: e.clientX, sy: e.clientY, w0: e.world, base: new Set() };
    inkSel.clear(); paintInkSelection();
  }
  padLive.set(m.id, { pick: inkPick, map, k: m.k });
  sendPadView();
}
function padSelection(m) {
  // with a drawing note open, the phone's selection is the drawing's (sketch.js); the picture editor has none
  const kind = padHost().kind;
  if (kind === 'sketch') { padSketchSelection(m); sendPadView(); padDirty(); return; }
  if (kind !== 'board') return;
  if (m.act === 'delete') deleteInkSelection();
  else if (m.act === 'color') recolorInkSelection(m.color);
  else if (m.act === 'clear') { inkSel.clear(); paintInkSelection(); }
  sendPadView();
  padDirty();
}

/* The phone's undo takes back the last stroke *the phone* drew that is still
   there. It never reaches for the board's own undo stack: that would let a
   phone undo a note the person at the keyboard just deleted. */
function padUndo() {
  if (!padCanDraw()) return;
  while (padMine.length) {
    const id = padMine.pop();
    if (!state.ink.some((s) => s.id === id)) continue;
    pushUndoInk();
    state.ink = state.ink.filter((s) => s.id !== id);
    inkPathCache.delete(id);
    drawInk(); updateEmpty(); saveSoon();
    return;
  }
}
function padPan(dx, dy) {
  const h = padHost(), p = padRect();
  const v = { x: h.v.x + dx * p.w, y: h.v.y + dy * p.h, z: h.v.z };
  if (h.kind === 'sketch') { setSketchView(v); return; }
  if (h.kind === 'studio') { setStudioView(v); return; }
  if (h.kind === 'book') { setBookView(v); return; }
  state.view.x = v.x; state.view.y = v.y;
  applyView(); saveSoon();
}

/* ---- the phone drawing in an open editor (2.6.2) ----
   The same messages, landing in the drawing note's strokes or the picture
   editor's marks through the editors' own steps — so the editor's undo, its
   eraser rule, and Done / Apply treat a phone line exactly like one from the
   mouse or a pen on this PC. The phone's tools map across: in a drawing note
   they are the board pen's own (a stroke is a board-ink stroke); in the
   picture editor the pen and the brush are its pen (with the pressure, when
   the phone sends one) and the marker its highlighter. The phone's arrow has
   nothing to select in either, and draws nothing. */
const padHostAlive = (map) => { const h = padHost(); return h.kind === map.kind && h.id === map.id; };
// a phone colour (text, a name, a hex) as the concrete colour the picture editor burns in
function padColorCss(c) {
  const probe = document.createElement('i');
  probe.style.color = inkColorCss(inkColorOk(c) ? c : 'text');
  padLayer().appendChild(probe);
  const out = getComputedStyle(probe).color;
  probe.remove();
  return out;
}
function beginPadEditorStroke(m, map) {
  hidePadCursor();
  if (map.kind === 'book') { beginPadBookStroke(m, map); return; }
  if (m.tool === 'select') {
    // the drawing note's arrow, from the phone (the picture editor has nothing to select)
    if (map.kind !== 'sketch' || sk.live || sk.erase || sk.pick) return;
    const at = Object.assign(padWorld(map, m.x, m.y), { k: map.z });
    beginSketchPick({ pointerId: 'pad:' + m.id, shiftKey: false }, at);
    padLive.set(m.id, { ed: true, pick: true, map, k: m.k });
    return;
  }
  if (m.tool === 'eraser') {
    const k = { ed: true, erase: true, map, k: m.k, E: { r: INK_SIZES.eraser[m.size] / map.z, last: null, hit: 0 } };
    padLive.set(m.id, k);
    padEditorErase(k, m.x, m.y);
    return;
  }
  const tool = INK_SIZES[m.tool] ? m.tool : 'pen';
  const size = Math.round(INK_SIZES[tool][m.size] / map.z * 100) / 100;
  const k = { ed: true, map, k: m.k, raw: [], frame: 0 };
  if (map.kind === 'sketch') {
    if (sk.strokes.length >= SKETCH_MAX) { toast(t('sketch.full')); return; }
    k.s = { id: uid(), tool, color: inkColorOk(m.color) ? m.color : 'text', size };
    k.el = document.createElementNS(SVGNS, 'path');
    k.el.setAttribute('class', 'ink ink-' + tool);
    const c = inkColorCss(k.s.color);
    if (tool === 'brush') k.el.style.fill = c; else { k.el.style.stroke = c; k.el.style.strokeWidth = size + 'px'; }
    $('skWorld').appendChild(k.el);
  } else {
    studioStep();
    k.mark = { type: tool === 'marker' ? 'marker' : 'pen', pts: [], color: padColorCss(m.color), w: tool === 'marker' ? size / 3 : size };
    ST.marks.push(k.mark);
  }
  padLive.set(m.id, k);
  addPadEditorPoint(k, m.x, m.y, m.p);
}
function addPadEditorPoint(k, x, y, p) {
  if (!padHostAlive(k.map)) return;
  const w = padWorld(k.map, x, y);
  const last = k.raw[k.raw.length - 1];
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * k.map.z < 0.6) return;
  k.raw.push({ x: w.x, y: w.y, p: p != null && p > 0 ? p : null, t: performance.now() });
  if (k.mark) {
    k.mark.pts.push([w.x, w.y]);
    if (k.mark.type === 'pen' && k.raw.some((q) => q.p != null)) k.mark.ws = brushWidths(k.raw, k.mark.w, k.map.z);
    drawStudio();
  } else if (!k.frame) k.frame = requestAnimationFrame(() => {
    k.frame = 0;
    const pts = [];
    k.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
    k.el.setAttribute('d', k.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(k.raw, k.s.size, k.map.z)) : inkLinePath(pts));
    padDirty();
  });
}
function endPadEditorStroke(k) {
  padDirty();
  if (k.book) {
    if (!padHostAlive(k.map)) { if (k.L) { k.L.done = true; k.L.el.remove(); } return; }
    if (k.E) bookEraseEnd(k.E); else bookStrokeEnd(k.L);
    return;
  }
  if (k.pick) { if (sk && sk.pick && padHostAlive(k.map)) endSketchPick(); return; }
  if (k.erase) return;
  if (k.mark) {
    if (!k.mark.pts.length && ST.marks[ST.marks.length - 1] === k.mark) { ST.marks.pop(); ST.undo.pop(); }
    if (ST.img) { buildStudioChrome(); drawStudio(); }
    return;
  }
  if (k.frame) cancelAnimationFrame(k.frame);
  k.el.remove();
  if (!padHostAlive(k.map) || !k.raw.length) return;
  const pts = [];
  k.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  k.s.pts = pts;
  if (k.s.tool === 'brush') k.s.ws = brushWidths(k.raw, k.s.size, k.map.z);
  sketchStep();
  sk.strokes = sk.strokes.concat([k.s]);
  drawSketchStrokes();
}
function padEditorErase(k, x, y) {
  if (!padHostAlive(k.map)) return;
  const w = padWorld(k.map, x, y);
  if (k.map.kind === 'sketch') eraseSketchAt(w, k.E);
  else studioErase(w, k.E);
}

/* ---- the phone in a book (3.0.2) ----
   The stroke goes to the page under the pen when it went down, in that page's
   units, through book.js's own steps — so the book's undo, its eraser and its
   save treat a phone line exactly like one from the mouse. The page's place is
   taken once, with the view (padMap), so a pan or a zoom on either side half
   way through cannot bend the line; one that ends off the page is clipped by
   the page, as the mouse's is. The arrow has nothing to select in a book. */
function bookPageUnder(w) {
  const h = padHost(), v = h.v;
  for (const pg of document.querySelectorAll('#bkSpread > .bk-side > .bk-page, #bkScroll .bk-page')) {
    const r = pg.getBoundingClientRect();
    // the page's box in the camera's own units (before the zoom), where padWorld() answers
    const x = (r.left - h.r.left - v.x) / v.z, y = (r.top - h.r.top - v.y) / v.z, w2 = r.width / v.z, h2 = r.height / v.z;
    if (w.x >= x && w.x <= x + w2 && w.y >= y && w.y <= y + h2) return { page: +pg.dataset.p, x, y, u: w2 / BOOK_U };
  }
  return null;
}
function beginPadBookStroke(m, map) {
  if (bk.turning && typeof bookTurnSettle === 'function' && !(bk.turn && bk.turn.dragging)) bookTurnSettle();
  if (m.tool === 'select' || bk.turning || bk.live || bk.erase) return;
  const at = bookPageUnder(padWorld(map, m.x, m.y));
  if (!at) return;
  const k = { ed: true, book: true, map, k: m.k, at };
  if (m.tool === 'eraser') k.E = bookEraseBegin(at.page, m.size, at.u * map.z);
  else {
    k.L = bookStrokeBegin(at.page, INK_SIZES[m.tool] ? m.tool : 'pen', inkColorOk(m.color) ? m.color : 'text', m.size, at.u * map.z);
    if (!k.L) return;
  }
  padLive.set(m.id, k);
  padBookPoint(k, m.x, m.y, m.p);
}
function padBookPoint(k, x, y, p) {
  if (!padHostAlive(k.map)) return;
  const w = padWorld(k.map, x, y), at = k.at;
  const q = { x: (w.x - at.x) / at.u, y: (w.y - at.y) / at.u };
  if (k.E) bookEraseAt(k.E, q);
  else bookStrokeAdd(k.L, q.x, q.y, p != null && p > 0 ? p : null, performance.now());
}

/* ---- the ring where the pen would land ---- */
let padCursorTimer = 0;
function showPadCursor(x, y) {
  let c = $('padCursor');
  if (!c) { c = document.createElement('div'); c.id = 'padCursor'; c.setAttribute('aria-hidden', 'true'); }
  if (c.parentNode !== padLayer()) padLayer().appendChild(c);
  const r = padHost().r, p = padRect();
  c.style.transform = `translate(${r.left + p.x + x * p.w}px, ${r.top + p.y + y * p.h}px)`;
  c.classList.remove('hidden');
  clearTimeout(padCursorTimer);
  padCursorTimer = setTimeout(hidePadCursor, 1500);
}
function hidePadCursor() { const c = $('padCursor'); if (c) c.classList.add('hidden'); }
