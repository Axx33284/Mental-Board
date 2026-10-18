/* Mental Board — ink.js
   Drawing on the board: the pen, the marker, the brush and the eraser.

   Part 8 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 10b. ink ───────────────

   A board can be drawn on (2.1). Press P, or "Draw" on the + menu, and the
   pointer becomes a pen until Escape or the ✓ on the bar.

   What is stored. `board.ink` is a list of strokes, each in **world**
   coordinates like every note — so a drawing pans and zooms with the board and
   stays where it was drawn:

     { id, tool: 'pen'|'marker'|'brush', color, size, pts: [x,y, x,y, …], ws? }

   `color` is `text` (the theme's ink: white on a dark theme, black on a light
   one), one of COLORS, or a literal hex — the same rule as an icon's colour, so
   a drawing re-tints with the theme instead of freezing one. `size` is the
   line width in world pixels, worked out from the size picked *on screen* at
   the moment of drawing, so a thin line drawn zoomed out is still thin when you
   zoom back in. A brush stroke also keeps `ws`, one width per point.

   It is the sixth field of the live mirror (MAP.md §3a): `state.ink` is the
   open board's array, bound and synced with the other five, encrypted with
   them on a locked board, and written by boardPayload() with no list to keep.

   Undo is its own step kind (`ink`, see pushUndoInk): a full step serialises
   every note on the board, and a drawing is dozens of strokes.

   Where it sits. Over the notes by default — drawing a ring round a note or an
   arrow between two is most of what people draw — and behind them when the
   board says so (`board.inkBehind`, the layers button on the bar). Either way
   it only takes the pointer while the pen is out; at any other time it is
   paint, and every click goes to whatever is under it. */

const INK_TOOLS = ['select', 'pen', 'marker', 'brush', 'eraser'];
// on-screen widths for the three sizes, per tool; the eraser's is a radius
const INK_SIZES = { select: [6, 6, 6], pen: [2, 4, 8], marker: [12, 20, 32], brush: [5, 10, 20], eraser: [8, 16, 30] };
const INK_MAX = 20000;          // strokes on one board; past this a stroke is refused, said once
const INK_CULL = 250;           // above this many strokes, only those near the view are mounted

let inkMode = false;
let inkStroke = null;           // the stroke being drawn: { s, raw:[{x,y,p,t}], el }
let inkErase = null;            // an eraser gesture: { hit: 0 }
let inkPick = null;             // a select gesture: moving the selection, or a lasso
const inkSel = new Set();       // the selected strokes, by id
const inkEls = new Map();       // stroke id -> <path>, for the strokes that are mounted
const inkPathCache = new Map(); // stroke id -> its `d`; strokes never change once drawn

function healPen(p) {
  p = p && typeof p === 'object' ? p : {};
  const size = Math.round(+p.size);
  return {
    tool: INK_TOOLS.includes(p.tool) ? p.tool : 'pen',
    color: inkColorOk(p.color) ? p.color : 'text',
    size: size >= 0 && size <= 2 ? size : 1
  };
}
const inkColorOk = (c) => c === 'text' || COLORS.includes(c) || isHex(c);
function inkColorCss(c) {
  if (isHex(c)) return c;
  if (COLORS.includes(c) && c !== 'default') return `var(--c-${c}-c)`;
  return 'var(--ink-text, var(--text))';
}

/* Whatever came off the disk, as strokes this file can draw. A malformed
   stroke is dropped rather than half-drawn; the numbers are rounded to a tenth
   of a world pixel, which is invisible and keeps a drawing's JSON small. */
function adoptInk(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const s of raw) {
    if (!s || !Array.isArray(s.pts) || s.pts.length < 2 || s.pts.length % 2) continue;
    const pts = s.pts.map((v) => Math.round((+v || 0) * 10) / 10);
    const tool = ['pen', 'marker', 'brush'].includes(s.tool) ? s.tool : 'pen';
    const st = { id: String(s.id || uid()), tool, color: inkColorOk(s.color) ? s.color : 'text', size: clamp(+s.size || 2, 0.05, 4000), pts };
    if (tool === 'brush' && Array.isArray(s.ws) && s.ws.length === pts.length / 2) st.ws = s.ws.map((w) => Math.max(0.05, +w || st.size));
    out.push(st);
    if (out.length >= INK_MAX) break;
  }
  return out;
}

/* ---- the path a stroke draws ---- */
// a smooth line through the points: quadratic segments through the midpoints
function inkLinePath(pts) {
  const n = pts.length / 2;
  if (n === 1) return `M ${pts[0]} ${pts[1]} l 0.01 0`;
  let d = `M ${pts[0]} ${pts[1]}`;
  if (n === 2) return d + ` L ${pts[2]} ${pts[3]}`;
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const mx = (x + pts[i * 2 + 2]) / 2, my = (y + pts[i * 2 + 3]) / 2;
    d += ` Q ${r1(x)} ${r1(y)} ${r1(mx)} ${r1(my)}`;
  }
  return d + ` L ${pts[pts.length - 2]} ${pts[pts.length - 1]}`;
}
const r1 = (v) => Math.round(v * 10) / 10;
/* A brush stroke is an outline, filled: the left edge out along the stroke,
   a round end, the right edge back. Each point is offset along the normal by
   half its own width, which is what makes the line swell and thin. */
function inkBrushPath(pts, ws) {
  const n = pts.length / 2;
  if (n < 3) {
    const w = (ws && ws[0]) || 2;
    return `M ${pts[0] - w / 2} ${pts[1]} a ${w / 2} ${w / 2} 0 1 0 ${w} 0 a ${w / 2} ${w / 2} 0 1 0 ${-w} 0`;
  }
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let tx = pts[b * 2] - pts[a * 2], ty = pts[b * 2 + 1] - pts[a * 2 + 1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    const h = ws[i] / 2;
    L.push([pts[i * 2] - ty * h, pts[i * 2 + 1] + tx * h]);
    R.push([pts[i * 2] + ty * h, pts[i * 2 + 1] - tx * h]);
  }
  // the segments after P[0], for a pen already standing on P[0]
  const run = (P) => {
    let d = '';
    for (let i = 1; i < P.length - 1; i++) {
      d += ` Q ${r1(P[i][0])} ${r1(P[i][1])} ${r1((P[i][0] + P[i + 1][0]) / 2)} ${r1((P[i][1] + P[i + 1][1]) / 2)}`;
    }
    const e = P[P.length - 1];
    return d + ` L ${r1(e[0])} ${r1(e[1])}`;
  };
  const endR = ws[n - 1] / 2, startR = ws[0] / 2;
  const back = R.slice().reverse();
  return `M ${r1(L[0][0])} ${r1(L[0][1])}` + run(L) +
    ` A ${r1(endR)} ${r1(endR)} 0 0 1 ${r1(back[0][0])} ${r1(back[0][1])}` + run(back) +
    ` A ${r1(startR)} ${r1(startR)} 0 0 1 ${r1(L[0][0])} ${r1(L[0][1])} Z`;
}
function inkPath(s) {
  let d = inkPathCache.get(s.id);
  if (!d) {
    d = s.tool === 'brush' && s.ws ? inkBrushPath(s.pts, s.ws) : inkLinePath(s.pts);
    inkPathCache.set(s.id, d);
  }
  return d;
}
// the stroke's box, grown by its width — what culling and the eraser test first
function inkBox(s) {
  if (s._box) return s._box;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.pts.length; i += 2) {
    const x = s.pts[i], y = s.pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = (s.ws ? Math.max(...s.ws) : s.size) / 2 + 1;
  // not enumerable: never written to the file, never copied by JSON
  Object.defineProperty(s, '_box', { value: { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }, configurable: true });
  return s._box;
}

/* ---- drawing what is stored ---- */
function makeInkEl(s) {
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('class', 'ink ink-' + s.tool);
  p.setAttribute('d', inkPath(s));
  const c = inkColorCss(s.color);
  if (s.tool === 'brush') p.style.fill = c;
  else { p.style.stroke = c; p.style.strokeWidth = s.size + 'px'; }
  p.dataset.id = s.id;
  return p;
}
/* A full pass: mount what should be, drop what should not. Called by render()
   and after every change; syncInk() is the cheap per-frame version for a pan,
   and only does anything on a board with enough strokes to cull. */
function drawInk() {
  const svg = $('inkSvg');
  if (!svg) return;
  const b = activeBoard();
  svg.classList.toggle('behind', !!(b && b.inkBehind));
  const ink = state.ink || [];
  const keep = new Set();
  const R = ink.length > INK_CULL ? inkViewRect() : null;
  for (const s of ink) {
    if (R && !inkInRect(s, R)) continue;
    keep.add(s.id);
    if (!inkEls.has(s.id)) { const el = makeInkEl(s); inkEls.set(s.id, el); svg.appendChild(el); }
  }
  inkEls.forEach((el, id) => { if (!keep.has(id)) { el.remove(); inkEls.delete(id); } });
  // an undo, an erase or a cull may have taken selected strokes away
  for (const id of inkSel) if (!ink.some((x) => x.id === id)) inkSel.delete(id);
  paintInkSelection();
  // keep the drawing order: a stroke drawn later is on top of one drawn earlier
  if (R || svg.childElementCount !== keep.size) return;
  let i = 0, ordered = true;
  for (const s of ink) { if (svg.children[i++] !== inkEls.get(s.id)) { ordered = false; break; } }
  if (!ordered) ink.forEach((s) => { const el = inkEls.get(s.id); if (el) svg.appendChild(el); });
  if (typeof padDirty === 'function') padDirty();
}
function resetInk() { inkEls.clear(); const svg = $('inkSvg'); if (svg) svg.textContent = ''; }
function inkViewRect() {
  const r = visibleWorldRect();
  const m = (r.x1 - r.x0) * 0.25;
  return { x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m };
}
function inkInRect(s, R) { const b = inkBox(s); return b.x0 < R.x1 && b.x1 > R.x0 && b.y0 < R.y1 && b.y1 > R.y0; }
let inkSyncPending = false;
function syncInk() {
  if (!state.ink || state.ink.length <= INK_CULL || inkSyncPending) return;
  inkSyncPending = true;
  requestAnimationFrame(() => { inkSyncPending = false; drawInk(); });
}

/* ---- the pen ---- */
function toggleInk(on) {
  const want = on == null ? !inkMode : !!on;
  if (want === inkMode) return;
  if (want && !canEditHere()) return;
  inkMode = want;
  if (inkMode) {
    if (editing) exitEdit();
    clearSelection();
    cancelLinking();
    buildInkBar();
    hint(t('ink.hint'));
  } else {
    endInkGesture();
    inkSel.clear(); paintInkSelection();
    hint('');
  }
  document.body.classList.toggle('inking', inkMode);
  document.body.classList.toggle('ink-select', inkMode && state.settings.pen.tool === 'select');
  $('inkBar').classList.toggle('hidden', !inkMode);
  $('inkCursor').classList.add('hidden');
  paintInkCursor();
}
function setPen(patch) {
  state.settings.pen = healPen(Object.assign({}, state.settings.pen, patch));
  // leaving the select tool lets go of the selection
  if (state.settings.pen.tool !== 'select' && inkSel.size) { inkSel.clear(); paintInkSelection(); }
  document.body.classList.toggle('ink-select', inkMode && state.settings.pen.tool === 'select');
  buildInkBar(); paintInkCursor(); saveSoon();
}
const penSizePx = () => INK_SIZES[state.settings.pen.tool][state.settings.pen.size];

function buildInkBar() {
  const bar = $('inkBar');
  const p = state.settings.pen;
  const b = activeBoard();
  // literal keys, so check-lang.js can see every one of them
  const tool = (k, glyph, tip) => `<button class="ik-tool${p.tool === k ? ' on' : ''}" data-tool="${k}" title="${tip}" aria-label="${tip}">${glyph}</button>`;
  const sw = (c) => `<button class="ik-sw${p.color === c ? ' on' : ''}" data-ink-color="${c}" style="--sw:${inkColorCss(c)}" title="${c === 'text' ? te('ink.colorText') : te('colour.' + c)}"></button>`;
  const custom = isHex(p.color) ? p.color : '#e05a5a';
  const sizeTips = [te('ink.size0'), te('ink.size1'), te('ink.size2')];
  bar.innerHTML =
    tool('select', icon('arrow_selector_tool'), te('ink.select')) +
    tool('pen', icon('ink_pen'), te('ink.pen')) + tool('marker', icon('ink_highlighter'), te('ink.marker')) +
    tool('brush', icon('brush'), te('ink.brush')) + tool('eraser', icon('ink_eraser'), te('ink.eraser')) +
    `<span class="ik-sep"></span>` +
    [0, 1, 2].map((i) => `<button class="ik-size${p.size === i ? ' on' : ''}" data-size="${i}" title="${sizeTips[i]}"><i style="--d:${[4, 7, 11][i]}px"></i></button>`).join('') +
    `<span class="ik-sep"></span>` +
    ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c)).map(sw).join('') +
    `<label class="ik-custom${isHex(p.color) ? ' on' : ''}" title="${te('ink.custom')}" style="--sw:${custom}"><input type="color" value="${custom}"></label>` +
    `<span class="ik-sep"></span>` +
    `<button class="ik-btn" data-ik="layer" title="${te(b && b.inkBehind ? 'ink.toFront' : 'ink.toBack')}">${icon(b && b.inkBehind ? 'flip_to_front' : 'flip_to_back')}</button>` +
    `<button class="ik-btn${inkSel.size ? '' : ' hidden'}" data-ik="delsel" title="${te('ink.deleteSel')}">${icon('delete')}</button>` +
    `<button class="ik-btn" data-ik="clear" title="${te('ink.clear')}">${icon('delete_sweep')}</button>` +
    `<button class="ik-btn ik-done" data-ik="done" title="${te('ink.done')}">${icon('check')}</button>`;
  bar.querySelectorAll('[data-tool]').forEach((el) => el.addEventListener('click', () => setPen({ tool: el.dataset.tool })));
  bar.querySelectorAll('[data-size]').forEach((el) => el.addEventListener('click', () => setPen({ size: +el.dataset.size })));
  bar.querySelectorAll('[data-ink-color]').forEach((el) => el.addEventListener('click', () => pickInkColor(el.dataset.inkColor)));
  const pick = bar.querySelector('.ik-custom input');
  pick.addEventListener('input', () => { bar.querySelector('.ik-custom').style.setProperty('--sw', pick.value); });
  pick.addEventListener('change', () => pickInkColor(pick.value));
  bar.querySelectorAll('[data-ik]').forEach((el) => el.addEventListener('click', () => {
    const act = el.dataset.ik;
    if (act === 'done') toggleInk(false);
    else if (act === 'layer') toggleInkLayer();
    else if (act === 'clear') clearInk();
    else if (act === 'delsel') deleteInkSelection();
  }));
}
function toggleInkLayer() {
  const b = activeBoard();
  if (!b) return;
  b.inkBehind = !b.inkBehind;
  drawInk(); buildInkBar(); saveSoon();
  toast(t(b.inkBehind ? 'ink.nowBehind' : 'ink.nowFront'));
}
async function clearInk() {
  if (!state.ink || !state.ink.length) return;
  const ok = await confirmDlg(t('ink.clearTitle'), t('ink.clearBody', { n: state.ink.length }), t('ink.clearOk'));
  if (!ok) return;
  pushUndoInk();
  state.ink = [];
  drawInk(); updateEmpty(); saveSoon();
}

/* The eraser's circle, which is the only honest cursor for it: the size you
   picked is a radius on screen, and a crosshair says nothing about that. */
function paintInkCursor() {
  const c = $('inkCursor');
  if (!c) return;
  const er = inkMode && state.settings.pen.tool === 'eraser';
  c.classList.toggle('select', state.settings.pen.tool === 'select');
  c.classList.toggle('eraser', er);
  const d = er ? penSizePx() * 2 : Math.max(4, penSizePx());
  c.style.width = c.style.height = d + 'px';
  c.style.setProperty('--ink', inkColorCss(state.settings.pen.color));
}
function moveInkCursor(e) {
  if (!inkMode) return;
  const c = $('inkCursor');
  if (e.target && e.target.closest && e.target.closest('#inkBar, .overlay, .titlebar, #zoombar, #fabWrap, #pageBtn, #pageMenu')) { c.classList.add('hidden'); return; }
  c.classList.remove('hidden');
  c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
}

/* ---- a stroke ---- */
function beginInk(e) {
  if (!canEditHere()) { toggleInk(false); return; }
  // a press never lands on top of a gesture still open (a lost pointerup, a second pointer)
  if (inkStroke || inkPick || inkErase) endInkGesture();
  const p = state.settings.pen;
  try { $('viewport').setPointerCapture(e.pointerId); } catch (_) {}
  window.addEventListener('pointermove', onInkMove);
  window.addEventListener('pointerup', endInkGesture);
  window.addEventListener('pointercancel', endInkGesture);
  if (p.tool === 'select') { beginInkPick(e); return; }
  if (p.tool === 'eraser') {
    pushUndoInk();
    inkErase = { hit: 0 };
    eraseAt(e);
    return;
  }
  if ((state.ink || []).length >= INK_MAX) { toast(t('ink.full')); return; }
  const z = state.view.z;
  const s = { id: uid(), tool: p.tool, color: p.color, size: Math.round(penSizePx() / z * 100) / 100, pts: [] };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + s.tool + ' ink-live');
  const c = inkColorCss(s.color);
  if (s.tool === 'brush') el.style.fill = c;
  else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  $('inkSvg').appendChild(el);
  inkStroke = { s, raw: [], el, shift: e.shiftKey, frame: 0 };
  addInkPoint(e);
}
function addInkPoint(e) {
  const k = inkStroke;
  const w = toWorld(e.clientX, e.clientY);
  const last = k.raw[k.raw.length - 1];
  // closer than half a screen pixel to the last point adds nothing you could see
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * state.view.z < 0.6) return;
  /* A pen tablet reports real pressure. A mouse reports 0.5 while a button is
     down and nothing else — that is not pressure, so it is not used as such. */
  const pr = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : null;
  k.raw.push({ x: w.x, y: w.y, p: pr, t: e.timeStamp || performance.now() });
  if (!k.frame) k.frame = requestAnimationFrame(paintLiveInk);
}
function onInkMove(e) {
  if (inkPick) { moveInkPick(e); return; }
  if (inkErase) { eraseAt(e); return; }
  if (!inkStroke) return;
  // events the browser coalesced between frames, so a fast stroke stays round
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) evs.forEach(addInkPoint); else addInkPoint(e);
  if (e.shiftKey) inkStroke.shift = true;
}
// the stroke's points as stored: the raw ones, or just the two ends for a ruler line
function inkPoints(k) {
  const raw = k.shift && k.raw.length > 1 ? [k.raw[0], k.raw[k.raw.length - 1]] : k.raw;
  const pts = [];
  raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  return { raw, pts };
}
/* Widths for a brush. Real pressure when there is a pen; otherwise speed —
   a quick flick thins the line, a slow drag swells it, the way a loaded brush
   behaves — and both ends taper over the first and last few points. The
   widths are smoothed, or every jitter of the hand shows as a bead. */
function brushWidths(raw, size) {
  const n = raw.length;
  const ws = new Array(n);
  let prev = size;
  for (let i = 0; i < n; i++) {
    let w;
    if (raw[i].p != null) w = size * (0.25 + raw[i].p * 1.25);
    else if (i === 0) w = size;
    else {
      const dt = Math.max(1, raw[i].t - raw[i - 1].t);
      const v = Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y) * state.view.z / dt;   // screen px per ms
      w = size * clamp(1.4 - v * 0.38, 0.4, 1.4);
    }
    prev = prev + (w - prev) * 0.35;
    ws[i] = prev;
  }
  const taper = Math.min(6, Math.floor(n / 3));
  for (let i = 0; i < taper; i++) {
    const k = (i + 1) / (taper + 1);
    ws[i] *= 0.35 + 0.65 * k;
    ws[n - 1 - i] *= 0.2 + 0.8 * k;
  }
  return ws.map((w) => Math.round(Math.max(0.1, w) * 100) / 100);
}
function paintLiveInk() {
  const k = inkStroke;
  if (!k) return;
  k.frame = 0;
  const { raw, pts } = inkPoints(k);
  k.el.setAttribute('d', k.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(raw, k.s.size)) : inkLinePath(pts));
  if (typeof padDirty === 'function') padDirty();   // the phone sees a mouse stroke as it is drawn
}
function finishInkStroke() {
  const k = inkStroke;
  inkStroke = null;
  if (!k) return;
  if (k.frame) cancelAnimationFrame(k.frame);
  k.el.remove();
  const { raw, pts } = inkPoints(k);
  if (!pts.length) return;
  k.s.pts = pts;
  if (k.s.tool === 'brush') k.s.ws = brushWidths(raw, k.s.size);
  pushUndoInk();
  state.ink.push(k.s);
  drawInk(); updateEmpty(); saveSoon();
}
function endInkGesture() {
  window.removeEventListener('pointermove', onInkMove);
  window.removeEventListener('pointerup', endInkGesture);
  window.removeEventListener('pointercancel', endInkGesture);
  /* Every kind of gesture is settled, never just the first one found: an early
     return here once left a stroke unfinished behind a select gesture that
     had not been cleared, and that stroke went on collecting the points of
     the next one. */
  if (inkPick) endInkPick();
  if (inkErase) {
    const hit = inkErase.hit;
    inkErase = null;
    if (!hit) popUndo(); else { updateEmpty(); saveSoon(); }
  }
  finishInkStroke();
}

/* The eraser takes whole strokes: anything whose line passes within the
   eraser's radius of the pointer. Whole strokes rather than pixels because a
   stroke is the thing the user drew, and half a ring is never what anybody
   meant to leave behind. */
function eraseAt(e) {
  const w = toWorld(e.clientX, e.clientY);
  const r = penSizePx() / state.view.z;
  /* The whole way from the last event to this one, not just where events
     landed: a quick sweep arrives as points far apart, and a line that ran
     between two of them used to survive being swept right across. */
  const from = inkErase.last || w;
  inkErase.last = w;
  const steps = Math.max(1, Math.ceil(Math.hypot(w.x - from.x, w.y - from.y) / (r * 0.5)));
  const gone = new Set();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    eraseNear({ x: from.x + (w.x - from.x) * k, y: from.y + (w.y - from.y) * k }, r, gone);
  }
  if (!gone.size) return;
  inkErase.hit += gone.size;
  state.ink = state.ink.filter((s) => !gone.has(s.id));
  gone.forEach((id) => inkPathCache.delete(id));
  drawInk();
}
function eraseNear(w, r, gone) {
  for (const s of state.ink) if (!gone.has(s.id) && strokeNear(s, w, r)) gone.add(s.id);
}
// does a stroke's line pass within r (plus its own half-width) of a world point?
function strokeNear(s, w, r) {
  const b = inkBox(s);
  if (w.x < b.x0 - r || w.x > b.x1 + r || w.y < b.y0 - r || w.y > b.y1 + r) return false;
  const half = (s.ws ? Math.max(...s.ws) : s.size) / 2;
  const lim = (r + half) * (r + half);
  const P = s.pts;
  if (P.length === 2) return (P[0] - w.x) ** 2 + (P[1] - w.y) ** 2 <= lim;
  for (let i = 0; i < P.length - 2; i += 2) {
    if (segDist2(w.x, w.y, P[i], P[i + 1], P[i + 2], P[i + 3]) <= lim) return true;
  }
  return false;
}
function segDist2(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + t * dx - px, y = ay + t * dy - py;
  return x * x + y * y;
}

/* ---- selecting what was drawn ----

   The arrow on the pen's bar (V). Click a stroke to select it, Shift+click to
   add or take one away, drag across empty board to lasso every stroke that has
   a point inside the box. Drag a selected stroke to move the whole selection;
   Delete removes it; a colour on the bar recolours it instead of changing the
   pen. Each of the three is one undo step (`ink`).

   A move is a `transform` on the selected paths while the pointer is down —
   nothing is rebuilt per frame — and the points themselves are shifted once,
   when it lets go. The dashed box round the selection lives in its own little
   <svg> above the ink, so it never disturbs the order of the strokes. */
function inkSelSvg() {
  let svg = $('inkSelSvg');
  if (!svg) {
    svg = document.createElementNS(SVGNS, 'svg');
    svg.id = 'inkSelSvg';
    svg.setAttribute('aria-hidden', 'true');
    $('world').appendChild(svg);
  }
  return svg;
}
function inkSelBox() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of state.ink || []) {
    if (!inkSel.has(s.id)) continue;
    const b = inkBox(s);
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
function paintInkSelection(dx, dy) {
  inkEls.forEach((el, id) => {
    el.classList.toggle('ink-sel', inkSel.has(id));
    if (dx == null || !inkSel.has(id)) el.removeAttribute('transform');
    else el.setAttribute('transform', `translate(${dx} ${dy})`);
  });
  const svg = $('inkSelSvg') || (inkSel.size ? inkSelSvg() : null);
  if (!svg) return;
  const b = inkSel.size ? inkSelBox() : null;
  if (!b) { svg.textContent = ''; }
  else {
    const pad = 6 / state.view.z;
    let r = svg.firstChild;
    if (!r) { r = document.createElementNS(SVGNS, 'rect'); r.setAttribute('class', 'ink-selbox'); svg.appendChild(r); }
    r.setAttribute('x', b.x0 - pad + (dx || 0)); r.setAttribute('y', b.y0 - pad + (dy || 0));
    r.setAttribute('width', b.x1 - b.x0 + pad * 2); r.setAttribute('height', b.y1 - b.y0 + pad * 2);
  }
  const del = $('inkBar') && $('inkBar').querySelector('[data-ik="delsel"]');
  if (del) del.classList.toggle('hidden', !inkSel.size);
  if (typeof padDirty === 'function') padDirty();
}
// the topmost stroke under a point — the last drawn wins, as it is drawn on top
function inkHit(w, r) {
  const ink = state.ink || [];
  for (let i = ink.length - 1; i >= 0; i--) if (strokeNear(ink[i], w, r)) return ink[i].id;
  return null;
}
function beginInkPick(e) {
  const w = toWorld(e.clientX, e.clientY);
  const id = inkHit(w, penSizePx() / state.view.z);
  if (id) {
    if (e.shiftKey) {
      if (inkSel.has(id)) inkSel.delete(id); else inkSel.add(id);
      paintInkSelection();
      inkPick = { kind: 'none' };
      return;
    }
    if (!inkSel.has(id)) { inkSel.clear(); inkSel.add(id); }
    paintInkSelection();
    inkPick = { kind: 'move', sx: e.clientX, sy: e.clientY, z: state.view.z, moved: false, dx: 0, dy: 0 };
    return;
  }
  // empty board: a lasso, added to the selection with Shift
  inkPick = { kind: 'lasso', sx: e.clientX, sy: e.clientY, base: e.shiftKey ? new Set(inkSel) : new Set() };
  if (!e.shiftKey) { inkSel.clear(); paintInkSelection(); }
}
function moveInkPick(e) {
  const g = inkPick;
  if (g.kind === 'move') {
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    if (!g.moved) { g.moved = true; pushUndoInk(); }
    g.dx = (e.clientX - g.sx) / g.z; g.dy = (e.clientY - g.sy) / g.z;
    paintInkSelection(g.dx, g.dy);
    return;
  }
  if (g.kind !== 'lasso') return;
  const r = vpRect();
  const m = $('marquee');
  m.classList.remove('hidden');
  m.style.left = Math.min(g.sx, e.clientX) - r.left + 'px'; m.style.top = Math.min(g.sy, e.clientY) - r.top + 'px';
  m.style.width = Math.abs(e.clientX - g.sx) + 'px'; m.style.height = Math.abs(e.clientY - g.sy) + 'px';
  const a = toWorld(Math.min(g.sx, e.clientX), Math.min(g.sy, e.clientY));
  const b = toWorld(Math.max(g.sx, e.clientX), Math.max(g.sy, e.clientY));
  inkSel.clear();
  g.base.forEach((id) => inkSel.add(id));
  for (const s of state.ink) {
    const q = inkBox(s);
    if (q.x1 < a.x || q.x0 > b.x || q.y1 < a.y || q.y0 > b.y) continue;
    for (let i = 0; i < s.pts.length; i += 2) {
      const x = s.pts[i], y = s.pts[i + 1];
      if (x >= a.x && x <= b.x && y >= a.y && y <= b.y) { inkSel.add(s.id); break; }
    }
  }
  paintInkSelection();
}
function endInkPick() {
  const g = inkPick;
  inkPick = null;
  $('marquee').classList.add('hidden');
  if (!g || g.kind !== 'move' || !g.moved) return;
  const dx = r1(g.dx), dy = r1(g.dy);
  for (const s of state.ink) {
    if (!inkSel.has(s.id)) continue;
    for (let i = 0; i < s.pts.length; i += 2) { s.pts[i] = r1(s.pts[i] + dx); s.pts[i + 1] = r1(s.pts[i + 1] + dy); }
    delete s._box;
    inkPathCache.delete(s.id);
    const el = inkEls.get(s.id);
    if (el) { el.remove(); inkEls.delete(s.id); }      // rebuilt by drawInk() from the moved points
  }
  drawInk(); saveSoon();
}
function deleteInkSelection() {
  if (!inkSel.size) return;
  pushUndoInk();
  state.ink = state.ink.filter((s) => !inkSel.has(s.id));
  inkSel.forEach((id) => inkPathCache.delete(id));
  inkSel.clear();
  drawInk(); updateEmpty(); saveSoon();
}
/* A colour on the bar. With strokes selected it recolours them and leaves the
   pen alone; otherwise it is the pen's colour, and picking one with the eraser
   or the arrow in hand takes the pen back up. */
function pickInkColor(c) {
  if (state.settings.pen.tool === 'select' && inkSel.size) { recolorInkSelection(c); return; }
  const tool = state.settings.pen.tool;
  setPen({ color: c, tool: tool === 'eraser' || tool === 'select' ? 'pen' : tool });
}
// one undo step; also what the phone's colours do with strokes selected (js/tablet.js)
function recolorInkSelection(c) {
  if (!inkSel.size || !inkColorOk(c)) return;
  pushUndoInk();
  for (const s of state.ink) {
    if (!inkSel.has(s.id)) continue;
    s.color = c;
    const el = inkEls.get(s.id);
    if (el) { if (s.tool === 'brush') el.style.fill = inkColorCss(c); else el.style.stroke = inkColorCss(c); }
  }
  saveSoon();
}
function selectAllInk() {
  (state.ink || []).forEach((s) => inkSel.add(s.id));
  paintInkSelection();
}

/* For the board picture (paintBoardCanvas). `colorOf` turns a stroke's colour
   token into something a canvas can paint — the picture may be in a theme
   other than the one on screen. */
function paintInkOnCanvas(ctx, ink, colorOf) {
  for (const s of ink || []) {
    const path = new Path2D(inkPath(s));
    ctx.save();
    if (s.tool === 'marker') ctx.globalAlpha = 0.38;
    if (s.tool === 'brush') { ctx.fillStyle = colorOf(s.color); ctx.fill(path); }
    else {
      ctx.strokeStyle = colorOf(s.color); ctx.lineWidth = s.size;
      ctx.lineCap = s.tool === 'marker' ? 'square' : 'round'; ctx.lineJoin = 'round';
      ctx.stroke(path);
    }
    ctx.restore();
  }
}
