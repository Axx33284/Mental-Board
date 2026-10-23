/* Mental Board — sketch.js
   A drawing note: a note you write and draw on by hand instead of typing.

   Part of the plain scripts sharing one global scope, loaded in the order
   index.html lists them — that order is the only thing holding them together,
   so a file may use anything declared above it at load time and anything at
   all once init() runs. See MAP.md §4. */
/* ─────────────── 11f. drawing notes (2.5) ───────────────

   A note whose inside is a drawing, with a title on top. It **is** a note —
   `{ sketch: { w, h, title, strokes } }` on an ordinary note, the way a picture
   is `{ pic: true }` (pictures.js) — so moving, resizing, ropes, colour, status,
   dates, undo, copy, the trash and board-to-board drags all handle it already,
   with no second code path. What is its own:

   - how it is drawn on the board: the title, then the drawing scaled to fit
     the note (an SVG with the page as its viewBox, `meet`), never stubbed at
     far zoom — a drawing is its own landmark, like a picture;
   - its editor: a double-click opens it full screen (`openSketch`) with the
     board pen's tools — pen, marker, brush, eraser, three sizes, the same
     colours — plus undo, redo, clear and the title. Done (or Escape) puts it
     back on the board as one undo step.

   The page. `w` × `h` is the drawing's own coordinate space, fixed when the
   note is made (the size of the screen it was made on), so the drawing never
   reflows: the editor fits the page to whatever screen it opens on, the note
   fits it to whatever size the note is. A stroke is exactly a board-ink stroke
   (ink.js: `{ id, tool, color, size, pts, ws? }`) in page units, so the paths,
   the brush, the eraser test, healing a stroke off disk and painting the board
   picture are ink.js's, unchanged.

   A pen. Pressure comes from a pen (a Samsung S Pen on a Galaxy Book, a Surface
   pen, a Wacom) through ordinary pointer events; the brush reads it. Once a pen
   has touched the page, a finger no longer draws — that is the palm resting on
   the screen. The pen's eraser end, or its barrel button, erases. */

const SKETCH_MAX = 5000;            // strokes in one drawing; past this a stroke is refused
const SKETCH_TITLE_MAX = 120;

// whatever came off the disk, as a drawing this file can draw — or nothing
function okSketch(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  return {
    w: clamp(Math.round(+raw.w) || 1600, 200, 8000),
    h: clamp(Math.round(+raw.h) || 1000, 200, 8000),
    title: typeof raw.title === 'string' ? raw.title.slice(0, SKETCH_TITLE_MAX) : '',
    strokes: adoptInk(raw.strokes).slice(0, SKETCH_MAX)
  };
}

/* ---- on the board ---- */
function fillSketch(el, n) {
  delete el.dataset.stub;
  el.classList.add('sketch');
  el.innerHTML =
    `<div class="sk-title" dir="auto"></div>` +
    `<svg class="sk-svg" xmlns="${SVGNS}" preserveAspectRatio="xMidYMid meet"></svg>` +
    `<div class="note-status hidden"></div>${rzHtml()}`;
  paintSketch(el, n);
  paintNoteStatus(el, n);
}
function paintSketch(el, n) {
  const sk = n.sketch;
  const title = el.querySelector('.sk-title');
  title.textContent = sk.title || t('sketch.untitled');
  title.classList.toggle('empty', !sk.title);
  const svg = el.querySelector('.sk-svg');
  svg.setAttribute('viewBox', `0 0 ${sk.w} ${sk.h}`);
  svg.textContent = '';
  for (const s of sk.strokes) svg.appendChild(makeInkEl(s));
}
// make one, and open it straight away — a drawing note that starts empty is a page to draw on
function addSketch(worldPt) {
  if (!canEditHere()) return null;
  const w = Math.round(clamp(innerWidth, 400, 4000)), h = Math.round(clamp(innerHeight - 64, 300, 4000));
  const nw = 420;
  const n = addNote(worldPt, {
    sketch: { w, h, title: '', strokes: [] },
    w: nw, h: Math.round(nw * h / w) + 40, edit: false
  });
  if (n) openSketch(n.id);
  return n;
}

/* ---- the editor ---- */
let sk = null;      // the open editor: { n, strokes, title, undo, redo, live, erase, penSeen, changed }

const sketchOpen = () => !!sk;

function openSketch(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.sketch || !canEditHere()) return;
  if (editing) exitEdit();
  if (inkMode) toggleInk(false);
  closeCtxMenu();
  sk = {
    n, strokes: n.sketch.strokes.slice(), title: n.sketch.title,
    undo: [], redo: [], live: null, erase: null, penSeen: false, changed: false
  };
  const dlg = $('sketchDlg');
  dlg.classList.remove('hidden');
  dlg.style.setProperty('--sk-bg', sketchPaper(n));
  $('skTitle').value = sk.title;
  buildSketchBar();
  const svg = $('skSvg');
  svg.setAttribute('viewBox', `0 0 ${n.sketch.w} ${n.sketch.h}`);
  $('skPage').setAttribute('width', n.sketch.w);
  $('skPage').setAttribute('height', n.sketch.h);
  drawSketchStrokes();
  /* Full screen, as asked for — the page gets the whole display. Inside a
     click or a double-click, so the browser allows it; if it says no, the
     editor still covers the window. */
  if (state.settings.sketchFull !== false) enterSketchFull();
}
// the paper is the note's own colour, so the drawing looks the same open and closed
function sketchPaper(n) {
  const el = els.get(n.id);
  const bg = el ? getComputedStyle(el).getPropertyValue('--nb').trim() : '';
  return bg || 'var(--surface)';
}
function enterSketchFull() {
  const dlg = $('sketchDlg');
  if (document.fullscreenElement || !dlg.requestFullscreen) return;
  dlg.requestFullscreen().catch(() => {});
}
function toggleSketchFull() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else enterSketchFull();
  state.settings.sketchFull = !document.fullscreenElement;   // what the next one opens as
  saveSoon();
}

function closeSketch() {
  if (!sk) return;
  endSketchStroke();
  const { n, strokes, changed } = sk;
  const title = $('skTitle').value.trim().slice(0, SKETCH_TITLE_MAX);
  sk = null;
  $('sketchDlg').classList.add('hidden');
  $('skSvg').querySelectorAll('.ink').forEach((p) => p.remove());
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!changed && title === n.sketch.title) return;
  pushUndo();
  // a new object, never an edit in place: a copy of this note may share the old one
  n.sketch = { w: n.sketch.w, h: n.sketch.h, title, strokes };
  const el = els.get(n.id);
  if (el) paintSketch(el, n);
  drawLinks(); scheduleMinimap(); saveSoon();
}

function drawSketchStrokes() {
  const svg = $('skSvg');
  svg.querySelectorAll('.ink').forEach((p) => p.remove());
  for (const s of sk.strokes) svg.appendChild(makeInkEl(s));
  const bar = $('skBar');
  bar.querySelector('[data-sk="undo"]').disabled = !sk.undo.length;
  bar.querySelector('[data-sk="redo"]').disabled = !sk.redo.length;
  bar.querySelector('[data-sk="clear"]').disabled = !sk.strokes.length;
}
function sketchStep() {
  sk.undo.push(sk.strokes.slice());
  if (sk.undo.length > 200) sk.undo.shift();
  sk.redo = [];
  sk.changed = true;
}
function sketchUndo(back) {
  const from = back ? sk.undo : sk.redo, to = back ? sk.redo : sk.undo;
  if (!from.length) return;
  to.push(sk.strokes.slice());
  sk.strokes = from.pop();
  sk.changed = true;
  drawSketchStrokes();
}
async function clearSketch() {
  if (!sk || !sk.strokes.length) return;
  const ok = await confirmDlg(t('sketch.clearTitle'), t('sketch.clearBody', { n: sk.strokes.length }), t('ink.clearOk'));
  if (!ok || !sk) return;
  sketchStep();
  sk.strokes = [];
  drawSketchStrokes();
}

/* The bar. The board pen's own buttons and classes (ink.js buildInkBar), and
   the board pen's own setting is not touched — the drawing note keeps its
   tool, size and colour in `settings.sketchPen`. */
function buildSketchBar() {
  const bar = $('skBar');
  const p = state.settings.sketchPen;
  const tool = (k, glyph, tip) => `<button class="ik-tool${p.tool === k ? ' on' : ''}" data-tool="${k}" title="${tip}" aria-label="${tip}">${glyph}</button>`;
  const sw = (c) => `<button class="ik-sw${p.color === c ? ' on' : ''}" data-ink-color="${c}" style="--sw:${inkColorCss(c)}" title="${c === 'text' ? te('ink.colorText') : te('colour.' + c)}"></button>`;
  const custom = isHex(p.color) ? p.color : '#e05a5a';
  const sizeTips = [te('ink.size0'), te('ink.size1'), te('ink.size2')];
  const btn = (k, ic, tip) => `<button class="ik-btn" data-sk="${k}" title="${tip}" aria-label="${tip}">${icon(ic)}</button>`;
  bar.innerHTML =
    tool('pen', icon('ink_pen'), te('ink.pen')) + tool('marker', icon('ink_highlighter'), te('ink.marker')) +
    tool('brush', icon('brush'), te('ink.brush')) + tool('eraser', icon('ink_eraser'), te('ink.eraser')) +
    `<span class="ik-sep"></span>` +
    [0, 1, 2].map((i) => `<button class="ik-size${p.size === i ? ' on' : ''}" data-size="${i}" title="${sizeTips[i]}"><i style="--d:${[4, 7, 11][i]}px"></i></button>`).join('') +
    `<span class="ik-sep"></span>` +
    ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c)).map(sw).join('') +
    `<label class="ik-custom${isHex(p.color) ? ' on' : ''}" title="${te('ink.custom')}" style="--sw:${custom}"><input type="color" value="${custom}"></label>` +
    `<span class="ik-sep"></span>` +
    btn('undo', 'undo', te('menu.undo')) + btn('redo', 'redo', te('menu.redo')) +
    btn('clear', 'delete_sweep', te('ink.clear')) + btn('full', 'open_in_full', te('sketch.fullScreen')) +
    `<button class="ik-btn ik-done" data-sk="done" title="${te('ink.done')}" aria-label="${te('ink.done')}">${icon('check')}</button>`;
  const set = (patch) => {
    state.settings.sketchPen = healPen(Object.assign({}, state.settings.sketchPen, patch));
    buildSketchBar(); saveSoon();
  };
  bar.querySelectorAll('[data-tool]').forEach((el) => el.addEventListener('click', () => set({ tool: el.dataset.tool })));
  bar.querySelectorAll('[data-size]').forEach((el) => el.addEventListener('click', () => set({ size: +el.dataset.size })));
  bar.querySelectorAll('[data-ink-color]').forEach((el) => el.addEventListener('click', () => set({ color: el.dataset.inkColor, tool: p.tool === 'eraser' ? 'pen' : p.tool })));
  const pick = bar.querySelector('.ik-custom input');
  pick.addEventListener('input', () => { bar.querySelector('.ik-custom').style.setProperty('--sw', pick.value); });
  pick.addEventListener('change', () => set({ color: pick.value, tool: p.tool === 'eraser' ? 'pen' : p.tool }));
  bar.querySelectorAll('[data-sk]').forEach((el) => el.addEventListener('click', () => {
    const act = el.dataset.sk;
    if (act === 'done') closeSketch();
    else if (act === 'undo') sketchUndo(true);
    else if (act === 'redo') sketchUndo(false);
    else if (act === 'clear') clearSketch();
    else if (act === 'full') toggleSketchFull();
  }));
  if (sk) drawSketchStrokes();
}

/* ---- a stroke on the page ---- */
// a pointer's position in page units, and how many screen pixels one page unit is
function sketchPoint(e) {
  const svg = $('skSvg');
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0, k: 1 };
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y, k: m.a || 1 };
}
function onSketchDown(e) {
  if (!sk || sk.live || sk.erase) return;
  if (e.pointerType === 'pen') sk.penSeen = true;
  else if (e.pointerType === 'touch' && sk.penSeen) return;     // a palm, once a pen has been used
  if (e.button !== 0 && e.button !== 5) return;
  e.preventDefault();
  /* Moves and the release are heard on the window, as ink.js does: pointer
     capture alone was dropped by the mouse right after it was taken, which
     ended a mouse stroke at its first point. */
  try { $('skSvg').setPointerCapture(e.pointerId); } catch (_) {}
  window.addEventListener('pointermove', onSketchMove);
  window.addEventListener('pointerup', onSketchUp);
  window.addEventListener('pointercancel', onSketchUp);
  const p = state.settings.sketchPen;
  const at = sketchPoint(e);
  // the eraser tool, the pen's eraser end (button 5) or its barrel button (buttons 2) erases
  if (p.tool === 'eraser' || e.button === 5 || (e.pointerType === 'pen' && (e.buttons & 2))) {
    sk.erase = { r: INK_SIZES.eraser[p.size] / at.k, last: null, hit: 0, id: e.pointerId };
    eraseSketchAt(at);
    return;
  }
  if (sk.strokes.length >= SKETCH_MAX) { toast(t('sketch.full')); return; }
  const tool = p.tool === 'select' ? 'pen' : p.tool;
  const s = { id: uid(), tool, color: p.color, size: Math.round(INK_SIZES[tool][p.size] / at.k * 100) / 100 };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + tool);
  const c = inkColorCss(s.color);
  if (tool === 'brush') el.style.fill = c;
  else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  $('skSvg').appendChild(el);
  sk.live = { s, raw: [], el, k: at.k, frame: 0, id: e.pointerId };
  addSketchPoint(e);
}
function addSketchPoint(e) {
  const L = sk.live;
  const w = sketchPoint(e);
  const last = L.raw[L.raw.length - 1];
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * L.k < 0.6) return;
  const pr = e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : null;
  L.raw.push({ x: w.x, y: w.y, p: pr, t: e.timeStamp || performance.now() });
  if (!L.frame) L.frame = requestAnimationFrame(paintSketchLive);
}
function paintSketchLive() {
  const L = sk && sk.live;
  if (!L) return;
  L.frame = 0;
  const pts = [];
  L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  L.el.setAttribute('d', L.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(L.raw, L.s.size, L.k)) : inkLinePath(pts));
}
function onSketchMove(e) {
  if (!sk) return;
  if (sk.erase && e.pointerId === sk.erase.id) { eraseSketchAt(sketchPoint(e)); return; }
  if (!sk.live || e.pointerId !== sk.live.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) evs.forEach(addSketchPoint); else addSketchPoint(e);
}
function onSketchUp(e) {
  const g = sk && (sk.live || sk.erase);
  if (g && e.pointerId !== g.id) return;     // a second finger lifting is not the pen
  endSketchStroke();
}
function endSketchStroke() {
  window.removeEventListener('pointermove', onSketchMove);
  window.removeEventListener('pointerup', onSketchUp);
  window.removeEventListener('pointercancel', onSketchUp);
  if (!sk) return;
  sk.erase = null;
  const L = sk.live;
  if (!L) return;
  sk.live = null;
  if (L.frame) cancelAnimationFrame(L.frame);
  L.el.remove();
  if (!L.raw.length) return;
  const pts = [];
  L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  L.s.pts = pts;
  if (L.s.tool === 'brush') L.s.ws = brushWidths(L.raw, L.s.size, L.k);
  sketchStep();
  sk.strokes = sk.strokes.concat([L.s]);
  drawSketchStrokes();
}
// whole strokes, along the whole sweep since the last event — ink.js's rule, on the page
function eraseSketchAt(w) {
  const E = sk.erase;
  const from = E.last || w;
  E.last = w;
  const steps = Math.max(1, Math.ceil(Math.hypot(w.x - from.x, w.y - from.y) / (E.r * 0.5)));
  const gone = new Set();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const q = { x: from.x + (w.x - from.x) * k, y: from.y + (w.y - from.y) * k };
    for (const s of sk.strokes) if (!gone.has(s.id) && strokeNear(s, q, E.r)) gone.add(s.id);
  }
  if (!gone.size) return;
  if (!E.hit) sketchStep();       // one undo step per sweep, and none for a sweep that took nothing
  E.hit += gone.size;
  sk.strokes = sk.strokes.filter((s) => !gone.has(s.id));
  drawSketchStrokes();
}

// every key while the editor is open: nothing reaches the board's shortcuts
function onSketchKey(e) {
  if (e.target === $('skTitle')) {
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); $('skTitle').blur(); }
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  const k = (e.key || '').toLowerCase();
  if (e.key === 'Escape') { e.preventDefault(); closeSketch(); return; }
  if (ctrl && k === 'z') { e.preventDefault(); sketchUndo(!e.shiftKey); return; }
  if (ctrl && k === 'y') { e.preventDefault(); sketchUndo(false); return; }
  if (ctrl) return;
  const p = state.settings.sketchPen;
  const tools = { d: 'pen', m: 'marker', b: 'brush', e: 'eraser' };
  const code = (e.code || '').replace(/^Key/, '').toLowerCase();
  const pick = tools[code];
  const set = (patch) => { state.settings.sketchPen = healPen(Object.assign({}, p, patch)); buildSketchBar(); saveSoon(); };
  if (pick) { e.preventDefault(); set({ tool: pick }); return; }
  if (e.code === 'BracketLeft') { e.preventDefault(); set({ size: Math.max(0, p.size - 1) }); return; }
  if (e.code === 'BracketRight') { e.preventDefault(); set({ size: Math.min(2, p.size + 1) }); return; }
}

function wireSketch() {
  const svg = $('skSvg');
  svg.addEventListener('pointerdown', onSketchDown);
  svg.addEventListener('contextmenu', (e) => e.preventDefault());   // the pen's button is the eraser here
  $('skTitle').addEventListener('input', () => { if (sk) sk.changed = true; });
  // the window's own fullscreen ending (F11, Escape) leaves the editor open, just not full screen
  document.addEventListener('fullscreenchange', () => {
    const b = $('skBar').querySelector('[data-sk="full"]');
    if (b) b.classList.toggle('on', !!document.fullscreenElement);
  });
}

/* ---- the board picture (edit-ops.js paintBoardCanvas) ---- */
function paintSketchOnCanvas(ctx, n, pal, inkColor, font) {
  const sk = n.sketch;
  const titleH = 34;
  ctx.save();
  ctx.fillStyle = pal.noteInk(n.color);
  ctx.font = `600 15px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(sk.title || t('sketch.untitled'), n.x + 14, n.y + titleH / 2 + 2, n.w - 28);
  const room = { x: n.x + 6, y: n.y + titleH, w: n.w - 12, h: n.h - titleH - 6 };
  const k = Math.min(room.w / sk.w, room.h / sk.h);
  ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
  ctx.translate(room.x + (room.w - sk.w * k) / 2, room.y + (room.h - sk.h * k) / 2);
  ctx.scale(k, k);
  paintInkOnCanvas(ctx, sk.strokes, inkColor);
  ctx.restore();
}
