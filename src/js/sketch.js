/* Mental Board — sketch.js
   A drawing note: a note you write and draw on by hand instead of typing.
   Also the zoomable surface both hand-drawing editors stand on.

   Part of the plain scripts sharing one global scope, loaded in the order
   index.html lists them — that order is the only thing holding them together,
   so a file may use anything declared above it at load time and anything at
   all once init() runs. See MAP.md §4. */
/* ─────────────── 11e. a surface you can zoom and pan (2.6) ───────────────

   The drawing note's editor and the picture editor (media.js) are both a
   picture you draw on that you also need to get closer to. One piece of code
   moves the camera for both, so there is one set of rules to learn and one
   place for the pen-and-fingers logic to be right:

   - the wheel zooms at the pointer — always with Ctrl, and without it too
     unless Settings says the wheel pans, exactly as on the board;
   - the middle button, or Space held, drags the view;
   - two fingers pan and pinch. A second finger landing cancels whatever the
     first one started (`opts.cancel`), because that first touch was the start
     of a pinch, not a line.

   The view is `{ x, y, z }`: a point (wx, wy) of the picture is drawn at
   (x + wx·z, y + wy·z) in the surface's own box. `opts.get()` / `opts.set(v)`
   read and apply it; the surface never stores a copy. Its listener runs in the
   capture phase on the surface, so a press it takes for the camera never
   reaches the drawing handlers underneath. */
function zoomPanSurface(el, opts) {
  const zmin = opts.min || 0.05, zmax = opts.max || 16;
  const touches = new Map();
  let drag = null;          // { kind: 'pan', lx, ly, id } | { kind: 'pinch', d0, m0, v0 }
  let space = false;
  const visible = () => el.isConnected && el.getClientRects().length > 0;
  const local = (cx, cy) => { const r = el.getBoundingClientRect(); return { x: cx - r.left, y: cy - r.top }; };

  function zoomAt(cx, cy, f) {
    const v = opts.get(), p = local(cx, cy);
    const z = clamp(v.z * f, zmin, zmax);
    opts.set({ x: p.x - (p.x - v.x) / v.z * z, y: p.y - (p.y - v.y) / v.z * z, z });
  }
  function zoomCentre(f) { const r = el.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoom = e.ctrlKey || state.settings.wheel === 'zoom';
    const v = opts.get();
    if (zoom) {
      const speed = clamp(+state.settings.zoomSpeed || 100, 40, 220) / 100;
      zoomAt(e.clientX, e.clientY, clamp(Math.pow(0.999, e.deltaY * (e.ctrlKey ? 2.4 : 1.6) * speed), 0.5, 2));
    } else opts.set({ x: v.x - e.deltaX, y: v.y - e.deltaY, z: v.z });
  }, { passive: false });

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      listen();             // every finger is followed, so the pinch starts from where they really are
      if (touches.size === 2) {
        e.stopPropagation(); e.preventDefault();
        if (opts.cancel) opts.cancel();
        const [a, b] = [...touches.values()];
        drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: local((a.x + b.x) / 2, (a.y + b.y) / 2), v0: opts.get() };
      }
      return;
    }
    if (e.button === 1 || (e.button === 0 && space)) {
      e.stopPropagation(); e.preventDefault();
      drag = { kind: 'pan', lx: e.clientX, ly: e.clientY, id: e.pointerId };
      el.classList.add('zp-panning');
      listen();
    }
  }, true);

  function listen() {
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }
  function onMove(e) {
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.kind === 'pan' && e.pointerId === drag.id) {
      const v = opts.get();
      opts.set({ x: v.x + e.clientX - drag.lx, y: v.y + e.clientY - drag.ly, z: v.z });
      drag.lx = e.clientX; drag.ly = e.clientY;
    } else if (drag.kind === 'pinch' && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const v0 = drag.v0;
      const z = clamp(v0.z * Math.hypot(a.x - b.x, a.y - b.y) / drag.d0, zmin, zmax);
      // the picture point under the fingers' midpoint stays under it, wherever the fingers go
      const wx = (drag.m0.x - v0.x) / v0.z, wy = (drag.m0.y - v0.y) / v0.z;
      opts.set({ x: m.x - wx * z, y: m.y - wy * z, z });
    }
  }
  function onUp(e) {
    touches.delete(e.pointerId);
    if (drag && (drag.kind === 'pan' ? e.pointerId === drag.id : touches.size < 2)) {
      drag = null;
      el.classList.remove('zp-panning');
    }
    if (!drag && !touches.size) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    }
  }
  // the touches the surface has not heard end (a lifted finger outside it) are still forgotten
  el.addEventListener('pointerup', (e) => touches.delete(e.pointerId), true);
  el.addEventListener('pointercancel', (e) => touches.delete(e.pointerId), true);
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || !visible() || (e.target.closest && e.target.closest('input, textarea'))) return;
    e.preventDefault();
    space = true; el.classList.add('zp-space');
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { space = false; el.classList.remove('zp-space'); } });
  window.addEventListener('blur', () => { space = false; el.classList.remove('zp-space'); });

  return { zoomAt, zoomCentre, busy: () => !!drag || touches.size > 1 };
}

/* ─────────────── 11f. drawing notes (2.5, an infinite page since 2.6) ───────────────

   A note whose inside is a drawing, with a title on top. It **is** a note —
   `{ sketch: { title, strokes } }` on an ordinary note, the way a picture is
   `{ pic: true }` (pictures.js) — so moving, resizing, ropes, colour, status,
   dates, undo, copy, the trash and board-to-board drags all handle it already.
   What is its own:

   - on the board: the title, then the drawing scaled to fit the note, never
     stubbed at far zoom — a drawing is its own landmark, like a picture;
   - its editor: a double-click opens it full screen with the board pen's
     tools, zoom and pan (the surface above), undo, redo, clear and the title.
     Done (or Escape) puts it back on the board as one undo step.

   **There is no page** (2.6). The drawing is as big as what has been drawn:
   the editor is an infinite surface like the board, and what the note shows
   — and all that is kept — is the box round the strokes (`sketchBounds`).
   Draw in 800×400 and the note is 800×400 of drawing; draw on past its edge
   next time and it grows to take that in. Nobody picks a size. When the
   drawing's shape changes, the note takes the new shape (`fitSketchNote`),
   keeping its width. A 2.5.0 drawing had a fixed `w` × `h` page; its strokes
   are already in the same units, so it opens unchanged and the page is
   simply forgotten.

   A stroke is exactly a board-ink stroke (ink.js: `{ id, tool, color, size,
   pts, ws? }`), so the paths, the brush, the eraser test, healing off disk and
   the board picture are ink.js's, unchanged.

   A pen. Pressure comes from a pen (a Samsung S Pen on a Galaxy Book, a
   Surface pen, a Wacom) through ordinary pointer events; the brush reads it.
   Once a pen has touched the page one finger no longer draws — that is the
   palm on the screen — and two fingers move and pinch the view. The pen's
   eraser end, or its barrel button, erases. */

const SKETCH_MAX = 5000;            // strokes in one drawing; past this a stroke is refused
const SKETCH_TITLE_MAX = 120;

// whatever came off the disk, as a drawing this file can draw — or nothing
function okSketch(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const out = {
    title: typeof raw.title === 'string' ? raw.title.slice(0, SKETCH_TITLE_MAX) : '',
    strokes: adoptInk(raw.strokes).slice(0, SKETCH_MAX)
  };
  // where each picture under the ink sits (2.7); its file is in the note's body, in the same order
  const pics = (Array.isArray(raw.pics) ? raw.pics : []).slice(0, SKETCH_PICS_MAX)
    .map((p) => p && ({ x: +p.x, y: +p.y, w: +p.w, h: +p.h }))
    .filter((p) => p && [p.x, p.y, p.w, p.h].every(Number.isFinite) && p.w > 0 && p.h > 0)
    .map((p) => ({ x: r1(p.x), y: r1(p.y), w: r1(p.w), h: r1(p.h) }));
  if (pics.length) out.pics = pics;
  return out;
}

/* ---- pictures under the ink (2.7) ----
   Turn a picture, a photo or a PDF into something to draw over: the drawing
   note carries pictures, laid in its own coordinates under the strokes.

   Where each one's file is, is in the note's **body**, as the same
   `<img class="mb-img" src="mbf://…">` a picture note stores — one per
   picture, in order — and only where it sits is in `sketch.pics`. That is on
   purpose: everything that keeps a board's files whole reads bodies (the
   clean-up's list of files in use, carrying files to another board, relinking
   an imported or duplicated board, "show me where it is"), so a picture under a
   drawing is kept, carried and relinked by all of them with no change to any.
   One copy of the address, so the two can never disagree.

   A PDF becomes a picture per page, drawn here by pdf.js (assets/pdfjs,
   vendored, loaded only the first time a PDF is opened) and written into the
   board's folder like any picture. */
const SKETCH_PICS_MAX = 200;        // pictures under one drawing
const SKETCH_PDF_MAX = 60;          // pages read from one PDF
const SKETCH_PDF_PX = 1800;         // a page is drawn this wide; it is placed at half, so zooming in stays sharp
const SKETCH_PIC_MAX = 1600;        // the longest side a picture is placed at, in drawing units

// the files of a drawing's pictures, from the note's body, in order
function sketchPicFiles(n) {
  if (!n || !n.body || n.body.indexOf('<img') < 0) return [];
  const tpl = document.createElement('template');
  tpl.innerHTML = n.body;
  return [...tpl.content.querySelectorAll('img')].map((i) => ({ url: i.getAttribute('src') || '', name: i.getAttribute('data-name') || '' }));
}
// the pictures as the editor holds them: where, and which file
function sketchPicsOf(n) {
  const files = sketchPicFiles(n);
  return ((n.sketch && n.sketch.pics) || []).map((p, i) => files[i] && Object.assign({}, p, files[i])).filter((p) => p && p.url);
}
function makeSketchPicEl(p) {
  const im = document.createElementNS(SVGNS, 'image');
  im.setAttribute('class', 'sk-pic');
  im.setAttribute('href', p.url);
  im.setAttribute('x', p.x); im.setAttribute('y', p.y);
  im.setAttribute('width', p.w); im.setAttribute('height', p.h);
  im.setAttribute('preserveAspectRatio', 'none');
  return im;
}

/* The box round what has been drawn, with a little air, or null when nothing
   has. This is the drawing's whole size: nothing outside it is shown or kept. */
function sketchBounds(strokes, pics) {
  if ((!strokes || !strokes.length) && (!pics || !pics.length)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes || []) {
    const b = inkBox(s);
    if (b.x0 < x0) x0 = b.x0; if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1; if (b.y1 > y1) y1 = b.y1;
  }
  // a picture under the ink is part of the drawing's size too (2.7)
  for (const p of pics || []) {
    if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
    if (p.x + p.w > x1) x1 = p.x + p.w; if (p.y + p.h > y1) y1 = p.y + p.h;
  }
  const pad = Math.max(8, Math.max(x1 - x0, y1 - y0) * 0.04);
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/* ---- on the board ---- */
const SKETCH_TITLE_H = 40;          // the title row and the room round the drawing, in note px
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
  const s = n.sketch;
  const title = el.querySelector('.sk-title');
  title.textContent = s.title || t('sketch.untitled');
  title.classList.toggle('empty', !s.title);
  const svg = el.querySelector('.sk-svg');
  const b = sketchBounds(s.strokes, s.pics) || { x: 0, y: 0, w: 400, h: 250 };
  svg.setAttribute('viewBox', `${r1(b.x)} ${r1(b.y)} ${r1(b.w)} ${r1(b.h)}`);
  svg.textContent = '';
  for (const p of sketchPicsOf(n)) svg.appendChild(makeSketchPicEl(p));
  for (const st of s.strokes) svg.appendChild(makeInkEl(st));
}
/* The note takes the drawing's shape, keeping its width: a drawing that grew
   sideways makes a wider-than-tall note, one that grew down a taller one.
   Only when the shape changed — a note the user sized stays as sized while
   the drawing keeps its proportions. */
function fitSketchNote(n, before) {
  const b = sketchBounds(n.sketch.strokes, n.sketch.pics);
  if (!b) return;
  const ar = b.w / b.h;
  if (before && Math.abs(before.w / before.h - ar) / ar < 0.08) return;
  const inner = n.w - 12;
  const h = clamp(Math.round(inner / ar + SKETCH_TITLE_H), NOTE_MIN_H, 1400);
  n.h = h;
  const el = els.get(n.id);
  if (el) placeEl(el, n);
}
// make one, and open it straight away — a drawing note that starts empty is a page to draw on
function addSketch(worldPt) {
  if (!canEditHere()) return null;
  const n = addNote(worldPt, { sketch: { title: '', strokes: [] }, w: 420, h: 300, edit: false });
  if (n) openSketch(n.id);
  return n;
}

/* ---- the editor ---- */
let sk = null;      // the open editor: { n, strokes, undo, redo, live, erase, penSeen, changed, view, before }
let skSurface = null;

const sketchOpen = () => !!sk;

function openSketch(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.sketch || !canEditHere()) return;
  if (editing) exitEdit();
  if (inkMode) toggleInk(false);
  closeCtxMenu();
  sk = {
    n, strokes: n.sketch.strokes.slice(), pics: sketchPicsOf(n), undo: [], redo: [], live: null, erase: null,
    penSeen: false, changed: false, view: { x: 0, y: 0, z: 1 }, before: sketchBounds(n.sketch.strokes, n.sketch.pics)
  };
  const dlg = $('sketchDlg');
  dlg.classList.remove('hidden');
  dlg.style.setProperty('--sk-bg', sketchPaper(n));
  $('skTitle').value = n.sketch.title;
  buildSketchBar();
  drawSketchStrokes();
  /* Full screen, as asked for — the page gets the whole display. Inside a
     click or a double-click, so the browser allows it; if it says no, the
     editor still covers the window. The view is fitted once the screen has
     its final size. */
  if (state.settings.sketchFull !== false) enterSketchFull();
  requestAnimationFrame(() => requestAnimationFrame(() => { if (sk) fitSketchView(); padHostChanged(); }));
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

/* ---- the camera ---- */
function setSketchView(v) {
  if (!sk) return;
  sk.view = { x: v.x, y: v.y, z: v.z };
  $('skWorld').setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.z})`);
  // the dots of the paper move and scale with the drawing, as the board's do
  const stage = $('skStage');
  const g = 28 * v.z;
  const step = g < 9 ? g * Math.ceil(9 / g) : g;
  stage.style.backgroundSize = `${step}px ${step}px`;
  stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
  const pctEl = $('skBar').querySelector('[data-sk="pct"]');
  if (pctEl) pctEl.textContent = pct(Math.round(v.z * 100));
  if (typeof padDirty === 'function') padDirty();       // a paired phone sees the drawing move (js/tablet.js)
}
// everything drawn in view, never closer than 100%; an empty page at 100% with room top left
function fitSketchView() {
  const r = $('skStage').getBoundingClientRect();
  const b = sketchBounds(sk.strokes, sk.pics);
  if (!b) { setSketchView({ x: 60, y: 60, z: 1 }); return; }
  const z = clamp(Math.min((r.width - 80) / b.w, (r.height - 80) / b.h), 0.05, 1);
  setSketchView({ x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z, z });
}

function closeSketch() {
  if (!sk) return;
  endSketchStroke();
  const { n, strokes, pics, changed, before } = sk;
  const title = $('skTitle').value.trim().slice(0, SKETCH_TITLE_MAX);
  sk = null;
  $('sketchDlg').classList.add('hidden');
  $('skWorld').textContent = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  padHostChanged();                 // a paired phone goes back to the board
  if (!changed && title === n.sketch.title) return;
  pushUndo();
  // a new object, never an edit in place: a copy of this note may share the old one
  n.sketch = { title, strokes };
  if (pics.length) n.sketch.pics = pics.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
  // the pictures' files, in the same order, where every file-keeping pass will find them
  n.body = pics.map((p) => picBody(p.url, p.name)).join('');
  fitSketchNote(n, before);
  const el = els.get(n.id);
  if (el) paintSketch(el, n);
  drawLinks(); scheduleMinimap(); saveSoon();
}

function drawSketchStrokes() {
  const g = $('skWorld');
  g.textContent = '';
  for (const p of sk.pics) g.appendChild(makeSketchPicEl(p));
  for (const s of sk.strokes) g.appendChild(makeInkEl(s));
  const bar = $('skBar');
  bar.querySelector('[data-sk="undo"]').disabled = !sk.undo.length;
  bar.querySelector('[data-sk="redo"]').disabled = !sk.redo.length;
  bar.querySelector('[data-sk="clear"]').disabled = !sk.strokes.length;
  if (typeof padDirty === 'function') padDirty();
}
// a step is the strokes and the pictures, so undo takes back an added picture too
function sketchStep() {
  sk.undo.push({ strokes: sk.strokes.slice(), pics: sk.pics.slice() });
  if (sk.undo.length > 200) sk.undo.shift();
  sk.redo = [];
  sk.changed = true;
}
function sketchUndo(back) {
  const from = back ? sk.undo : sk.redo, to = back ? sk.redo : sk.undo;
  if (!from.length) return;
  to.push({ strokes: sk.strokes.slice(), pics: sk.pics.slice() });
  const s = from.pop();
  sk.strokes = s.strokes; sk.pics = s.pics;
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
    btn('zout', 'zoom_out', te('zoom.out')) +
    `<button class="ik-btn sk-pct" data-sk="pct" title="${te('zoom.reset')}"></button>` +
    btn('zin', 'zoom_in', te('zoom.in')) + btn('fit', 'fit_screen', te('zoom.fit')) +
    `<span class="ik-sep"></span>` +
    btn('undo', 'undo', te('menu.undo')) + btn('redo', 'redo', te('menu.redo')) +
    btn('pics', 'image', te('sketch.addFiles')) +
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
    else if (act === 'pics') sketchAddFiles();
    else if (act === 'zin') skSurface.zoomCentre(1.25);
    else if (act === 'zout') skSurface.zoomCentre(1 / 1.25);
    else if (act === 'pct') skSurface.zoomCentre(1 / sk.view.z);
    else if (act === 'fit') fitSketchView();
  }));
  if (sk) { drawSketchStrokes(); setSketchView(sk.view); }
}

/* ---- a stroke on the page ---- */
// a pointer's position in drawing units, and how many screen pixels one unit is
function sketchPoint(e) {
  const r = $('skStage').getBoundingClientRect(), v = sk.view;
  return { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z, k: v.z };
}
function onSketchDown(e) {
  if (!sk || sk.live || sk.erase || skSurface.busy()) return;
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
  $('skWorld').appendChild(el);
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
  if (typeof padDirty === 'function') padDirty();
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
// the stroke being drawn is dropped, not kept: a second finger made it the start of a pinch
function cancelSketchStroke() {
  if (!sk || !sk.live) return;
  if (sk.live.frame) cancelAnimationFrame(sk.live.frame);
  sk.live.el.remove();
  sk.live = null;
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
// `E` is the sweep: the mouse's or the pen's (sk.erase), or a paired phone's (js/tablet.js)
function eraseSketchAt(w, E) {
  E = E || sk.erase;
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
  // the board's own zoom keys, on the drawing
  const ch = chordKey(e);
  if (ctrl && (ch === '=' || ch === '+')) { e.preventDefault(); skSurface.zoomCentre(1.25); return; }
  if (ctrl && ch === '-') { e.preventDefault(); skSurface.zoomCentre(1 / 1.25); return; }
  if (ctrl && ch === '0') { e.preventDefault(); skSurface.zoomCentre(1 / sk.view.z); return; }
  if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitSketchView(); return; }
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

/* ---- bringing pictures and PDFs in (2.7) ---- */
let pdfjsReady = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsReady) pdfjsReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/pdfjs/pdf.min.js';
    s.onload = () => {
      const L = window.pdfjsLib;
      if (!L) { pdfjsReady = null; rej(new Error('pdf.js did not load')); return; }
      L.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.js';
      res(L);
    };
    s.onerror = () => { pdfjsReady = null; rej(new Error('pdf.js did not load')); };
    document.head.appendChild(s);
  });
  return pdfjsReady;
}
// a PDF's pages as pictures: { pages: [{ dataUrl, w, h }], total }
async function pdfPages(bytes, onPage) {
  const L = await loadPdfJs();
  // no eval (the page's CSP has none), and its own fonts and character maps from the app
  const doc = await L.getDocument({
    data: bytes, isEvalSupported: false,
    cMapUrl: 'assets/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'assets/pdfjs/standard_fonts/'
  }).promise;
  const n = Math.min(doc.numPages, SKETCH_PDF_MAX);
  const pages = [];
  try {
    for (let i = 1; i <= n; i++) {
      if (onPage) onPage(i, n);
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: SKETCH_PDF_PX / page.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);    // paper, not a hole
      await page.render({ canvasContext: g, viewport: vp }).promise;
      pages.push({ dataUrl: c.toDataURL('image/png'), w: c.width, h: c.height });
      page.cleanup();
    }
  } finally { doc.destroy(); }
  return { pages, total: doc.numPages };
}
const IMG_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml' };
function bytesToDataUrl(bytes, type) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(new Blob([bytes], { type }));
  });
}
// a picture into the board's folder; the data URL itself where there is no folder (a plain browser)
async function keepSketchPicture(dataUrl, name) {
  if (FILES && FILES.attachBytes && state.activeBoard) {
    try { const r = await FILES.attachBytes(dataUrl, state.activeBoard, name); if (r && r.url) return r.url; } catch (_) {}
  }
  return dataUrl;
}
/* Files → pictures under the drawing, one below another, starting under
   whatever is already there (or at the top left of an empty page). One undo
   step for the lot. `items` is what files:pick-drawing hands back, or the
   same built from files dropped on the editor. */
async function sketchImport(items) {
  if (!sk || !items || !items.length) return 0;
  const n0 = sk.n;
  const placed = [];
  for (const it of items) {
    if (!sk || sk.n !== n0) break;                         // closed while reading
    if (it.error) { toast(t(it.error === 'too-big' ? 'sketch.fileTooBig' : 'sketch.fileFailed', { name: it.name })); continue; }
    const base = String(it.name || 'picture').replace(/\.[a-z0-9]+$/i, '');
    try {
      if (it.kind === 'pdf') {
        const r = await pdfPages(it.bytes, (i, n) => toast(t('sketch.readingPdf', { i, n }), 1500));
        if (r.total > r.pages.length) toast(t('sketch.pdfCut', { n: r.pages.length, total: r.total }), 5000);
        for (let i = 0; i < r.pages.length; i++) {
          const pg = r.pages[i];
          const name = `${base} p${i + 1}.png`;
          placed.push({ url: await keepSketchPicture(pg.dataUrl, name), name, w: pg.w / 2, h: pg.h / 2 });
        }
      } else {
        const dataUrl = it.dataUrl || await bytesToDataUrl(it.bytes, IMG_MIME[it.ext] || 'image/png');
        const size = await measureImage(dataUrl);
        if (!size || !size.w || !size.h) { toast(t('sketch.fileFailed', { name: it.name })); continue; }
        const k = Math.min(1, SKETCH_PIC_MAX / Math.max(size.w, size.h));
        const name = it.name || base + '.png';
        placed.push({ url: await keepSketchPicture(dataUrl, name), name, w: size.w * k, h: size.h * k });
      }
    } catch (err) {
      console.error('drawing note: could not read', it.name, err);
      toast(t('sketch.fileFailed', { name: it.name }));
    }
  }
  if (!sk || sk.n !== n0 || !placed.length) return 0;
  const room = SKETCH_PICS_MAX - sk.pics.length;
  if (room <= 0) { toast(t('sketch.picsFull')); return 0; }
  sketchStep();
  // under everything already there, lined up with the pictures (sketchBounds' box has air round it)
  let x = sk.pics.length ? Math.min(...sk.pics.map((p) => p.x)) : 0, y = -Infinity;
  for (const p of sk.pics) y = Math.max(y, p.y + p.h);
  for (const s of sk.strokes) y = Math.max(y, inkBox(s).y1);
  if (!sk.pics.length && sk.strokes.length) x = Math.min(...sk.strokes.map((s) => inkBox(s).x0));
  y = Number.isFinite(y) ? y + 40 : 0;
  for (const p of placed.slice(0, room)) {
    sk.pics.push({ x: r1(x), y: r1(y), w: r1(p.w), h: r1(p.h), url: p.url, name: p.name });
    y += p.h + 40;
  }
  drawSketchStrokes();
  fitSketchView();
  // and again once the layout has settled — a file dialog or a toast can still be moving things
  requestAnimationFrame(() => { if (sk && sk.n === n0) fitSketchView(); });
  return placed.length;
}
async function sketchAddFiles() {
  if (!sk) return;
  if (!FILES || !FILES.pickDrawing) { toast(t('msg.needDesktop')); return; }
  let items = [];
  try { items = await FILES.pickDrawing(); } catch (_) {}
  await sketchImport(items || []);
}
// + ▸ Draw on a picture or PDF: a new drawing note, open, and the files asked for straight away
async function addSketchFromFiles(worldPt) {
  const n = addSketch(worldPt);
  if (n) await sketchAddFiles();
  return n;
}
/* A picture on the board becomes a drawing note with that picture under the
   ink (right-click ▸ Draw on it). Its body already is that picture's <img>,
   which is exactly where a drawing keeps its pictures' files, so nothing is
   copied: the note just changes what it is. One undo step. Synchronous, so
   the editor can still go full screen on the click that asked. */
function pictureToSketch(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.pic || !canEditHere()) return;
  pushUndo();
  const ar = n.ar || n.w / n.h || 1;
  const w = Math.min(SKETCH_PIC_MAX, n.w * 2);
  delete n.pic; delete n.ar;
  n.sketch = { title: picName(n).replace(/\.[a-z0-9]+$/i, ''), strokes: [], pics: [{ x: 0, y: 0, w: r1(w), h: r1(w / ar) }] };
  n.h = Math.round(n.h + SKETCH_TITLE_H);       // room for the title over the same picture
  const el = els.get(n.id);
  if (el) { el.classList.remove('pic', 'pic-broken'); placeEl(el, n); fillNote(el, n); }
  saveSoon();
  openSketch(n.id);
}

function wireSketch() {
  const svg = $('skSvg');
  // pictures and PDFs dropped on the editor go under the drawing, like the button's
  const stage = $('skStage');
  stage.addEventListener('dragover', (e) => { if (sk) { e.preventDefault(); e.stopPropagation(); } });
  stage.addEventListener('drop', async (e) => {
    if (!sk) return;
    e.preventDefault(); e.stopPropagation();
    const items = [];
    for (const f of [...(e.dataTransfer && e.dataTransfer.files || [])].slice(0, 40)) {
      const ext = (/\.([a-z0-9]+)$/i.exec(f.name || '') || ['', ''])[1].toLowerCase();
      const kind = ext === 'pdf' || f.type === 'application/pdf' ? 'pdf' : (/^image\//.test(f.type) || IMG_MIME[ext]) ? 'image' : '';
      if (!kind) continue;
      try { items.push({ name: f.name, kind, ext, bytes: new Uint8Array(await f.arrayBuffer()) }); }
      catch (_) { items.push({ name: f.name, kind, error: 'read' }); }
    }
    await sketchImport(items);
  });
  svg.addEventListener('pointerdown', onSketchDown);
  svg.addEventListener('contextmenu', (e) => e.preventDefault());   // the pen's button is the eraser here
  skSurface = zoomPanSurface($('skStage'), {
    get: () => (sk ? sk.view : { x: 0, y: 0, z: 1 }), set: setSketchView,
    min: 0.05, max: 12, cancel: cancelSketchStroke
  });
  $('skTitle').addEventListener('input', () => { if (sk) sk.changed = true; });
  // the window's own fullscreen ending (F11, Escape) leaves the editor open, just not full screen
  document.addEventListener('fullscreenchange', () => {
    const b = $('skBar').querySelector('[data-sk="full"]');
    if (b) b.classList.toggle('on', !!document.fullscreenElement);
  });
}

/* ---- the board picture (edit-ops.js paintBoardCanvas) ---- */
function paintSketchOnCanvas(ctx, n, pal, inkColor, font, pictures) {
  const s = n.sketch;
  ctx.save();
  ctx.fillStyle = pal.noteInk(n.color);
  ctx.font = `600 15px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(s.title || t('sketch.untitled'), n.x + 14, n.y + 34 / 2 + 2, n.w - 28);
  const b = sketchBounds(s.strokes, s.pics);
  if (b) {
    const room = { x: n.x + 6, y: n.y + 34, w: n.w - 12, h: n.h - 34 - 6 };
    const k = Math.min(room.w / b.w, room.h / b.h);
    ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
    ctx.translate(room.x + (room.w - b.w * k) / 2 - b.x * k, room.y + (room.h - b.h * k) / 2 - b.y * k);
    ctx.scale(k, k);
    // the pictures under the ink, read by loadExportPictures() (edit-ops.js) as `<note id>#<index>`
    (s.pics || []).forEach((p, i) => {
      const img = pictures && pictures.get(n.id + '#' + i);
      if (img) { try { ctx.drawImage(img, p.x, p.y, p.w, p.h); } catch (_) {} }
    });
    paintInkOnCanvas(ctx, s.strokes, inkColor);
  }
  ctx.restore();
}
