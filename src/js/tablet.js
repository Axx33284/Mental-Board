/* Mental Board — tablet.js
   A phone as a drawing tablet: the renderer's half.

   Part 21 of 22. These files are plain scripts sharing one global
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

   Where a stroke lands. **The phone is the window.** Its drawing area has the
   shape of the board's viewport on this screen, and a point a third of the
   way across the phone lands a third of the way across what you can see here,
   at the zoom you are looking at. That is how a drawing tablet works, and it
   is the only mapping that needs no second picture of the board on the phone:
   you look at the computer, the pen's hover shows as a ring where it would
   land, and one finger pans the board under it, two zoom. The view is taken
   once at the start of a stroke, so a pan from the mouse half way through
   cannot bend a line.

   Nothing here writes anything the mouse could not. A board that cannot be
   edited (locked, the trash, a read-only view) is never drawn on, and the
   phone is told so. */

const PAD = window.mbPad || null;
let padInfo = { state: 'off' };    // the last state main reported
const padLive = new Map();         // phone stroke id -> a stroke being drawn, or an eraser sweep
const padMine = [];                // ids of the strokes this pairing drew, for the phone's undo
let padViewSent = '';
let padViewTimer = 0;

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
    sendPadView();
    clearInterval(padViewTimer);
    /* The phone has to know when the window changes shape or the board
       becomes one it cannot draw on. Neither has an event of its own, and a
       comparison once a second while a phone is paired costs nothing. */
    padViewTimer = setInterval(sendPadView, 1000);
  }
  if (st.state !== 'connected') {
    clearInterval(padViewTimer);
    padLive.forEach((k, id) => endPadStroke(id));
    hidePadCursor();
  }
  if (st.state === 'off') {
    padMine.length = 0;
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

/* canEditHere() without its toast — it is asked once a second while a phone is
   paired, and a locked board would say so once a second. The stroke itself
   still goes through canEditHere(), so a pen put down there says why once. */
function padCanDraw() { const b = activeBoard(); return !(b && (b.unreadable || isLocked(b))); }

/* ---- what the phone is told: the window's shape, whether it may draw, the colours ---- */
function padPalette() {
  const probe = document.createElement('i');
  document.body.appendChild(probe);
  const out = ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c)).map((k) => {
    probe.style.color = inkColorCss(k);
    return { k, c: getComputedStyle(probe).color };
  });
  probe.remove();
  return out;
}
function sendPadView() {
  if (padInfo.state !== 'connected') return;
  const r = vpRect();
  const m = { t: 'view', a: Math.round((r.width / Math.max(1, r.height)) * 1000) / 1000, ro: !padCanDraw(), pal: padPalette() };
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
  else if (m.t === 'pan') padPan(m.dx, m.dy);
  else if (m.t === 'zoom') { const r = vpRect(); zoomAt(r.left + m.x * r.width, r.top + m.y * r.height, m.f); }
  else if (m.t === 'undo') padUndo();
}

/* A phone point → world. `map` is the viewport as it was when the stroke
   began: its size on screen and the view's x, y and zoom. */
function padWorld(map, x, y) { return { x: (x * map.w - map.vx) / map.z, y: (y * map.h - map.vy) / map.z }; }

function beginPadStroke(m) {
  if (padLive.has(m.id)) endPadStroke(m.id);
  if (!canEditHere()) { sendPadView(); return; }
  const r = vpRect(), v = state.view;
  const map = { w: r.width, h: r.height, vx: v.x, vy: v.y, z: v.z, board: state.activeBoard };
  hidePadCursor();
  if (m.tool === 'eraser') {
    padLive.set(m.id, { erase: true, map, r: INK_SIZES.eraser[m.size] / v.z, last: null, pushed: false });
    padErase(padLive.get(m.id), m.x, m.y);
    return;
  }
  if ((state.ink || []).length >= INK_MAX) { toast(t('ink.full')); return; }
  const color = inkColorOk(m.color) ? m.color : 'text';
  const s = { id: uid(), tool: m.tool, color, size: Math.round(INK_SIZES[m.tool][m.size] / v.z * 100) / 100, pts: [] };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + s.tool + ' ink-live');
  const c = inkColorCss(s.color);
  if (s.tool === 'brush') el.style.fill = c;
  else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  $('inkSvg').appendChild(el);
  const k = { s, raw: [], el, frame: 0, map };
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
    if (k.erase) padErase(k, pts[i], pts[i + 1]); else addPadPoint(k, pts[i], pts[i + 1], pts[i + 2]);
  }
}
function paintPadStroke(k) {
  k.frame = 0;
  if (!k.el.isConnected) $('inkSvg').appendChild(k.el);     // a render() in between empties the layer
  const { raw, pts } = inkPoints(k);
  k.el.setAttribute('d', k.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(raw, k.s.size)) : inkLinePath(pts));
}
function endPadStroke(id) {
  const k = padLive.get(id);
  padLive.delete(id);
  if (!k || k.erase) {
    if (k && k.pushed) { updateEmpty(); saveSoon(); }
    return;
  }
  if (k.frame) cancelAnimationFrame(k.frame);
  k.el.remove();
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
  const r = vpRect();
  state.view.x += dx * r.width;
  state.view.y += dy * r.height;
  applyView(); saveSoon();
}

/* ---- the ring where the pen would land ---- */
let padCursorTimer = 0;
function showPadCursor(x, y) {
  let c = $('padCursor');
  if (!c) { c = document.createElement('div'); c.id = 'padCursor'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c); }
  const r = vpRect();
  c.style.transform = `translate(${r.left + x * r.width}px, ${r.top + y * r.height}px)`;
  c.classList.remove('hidden');
  clearTimeout(padCursorTimer);
  padCursorTimer = setTimeout(hidePadCursor, 1500);
}
function hidePadCursor() { const c = $('padCursor'); if (c) c.classList.add('hidden'); }
