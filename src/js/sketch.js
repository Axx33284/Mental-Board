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
    if (opts.wheel && opts.wheel(e)) return;          // the owner took this notch (a book turns a page with it)
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
  // typed or pasted words on the page (2.10): where, how big, what colour, what
  const texts = (Array.isArray(raw.texts) ? raw.texts : []).slice(0, SKETCH_TEXTS_MAX)
    .filter((x) => x && typeof x.text === 'string' && x.text.trim() && Number.isFinite(+x.x) && Number.isFinite(+x.y))
    .map((x) => ({ x: r1(+x.x), y: r1(+x.y), size: r1(clamp(+x.size || 20, 1, 4000)), color: inkColorOk(x.color) ? x.color : 'text', text: x.text.slice(0, SKETCH_TEXT_MAX) }));
  if (texts.length) out.texts = texts;
  return out;
}

/* ---- words on the page (2.10) ----
   A drawing note takes text as well as ink and pictures: the T tool, a paste
   of plain text, text dropped on it, or a text note copied off the board.
   `{ x, y, size, color, text }` in the drawing's units — the top left of the
   first line, the font size, an ink colour, and the words, lines split by \n.
   It is drawn as SVG text on the note and in the editor, and with fillText()
   in the board picture, from the same numbers, so all three agree. */
const SKETCH_TEXTS_MAX = 500;
const SKETCH_TEXT_MAX = 4000;
const SK_TEXT_PX = [18, 28, 44];    // the three sizes, as they look on screen when typed
const SK_FONT = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const SK_LINE = 1.25;               // line height, in font sizes
const SK_BASE = 1.03;               // the first baseline, below the top, in font sizes — where a textarea puts it (Segoe UI's ascent)
let skMeasure = null;
// the box a text covers, measured once per object (moved or edited texts are new objects)
function sketchTextBox(t) {
  if (t._box) return t._box;
  const g = skMeasure || (skMeasure = document.createElement('canvas').getContext('2d'));
  g.font = `500 ${t.size}px ${SK_FONT}`;
  const lines = t.text.split('\n');
  let w = 0;
  for (const l of lines) w = Math.max(w, g.measureText(l).width);
  const box = { x: t.x, y: t.y, w: Math.max(w, t.size * 0.3), h: lines.length * t.size * SK_LINE };
  Object.defineProperty(t, '_box', { value: box, configurable: true });
  return box;
}
function makeSketchTextEl(t) {
  const el = document.createElementNS(SVGNS, 'text');
  el.setAttribute('class', 'sk-text');
  el.setAttribute('font-size', t.size);
  el.style.fill = inkColorCss(t.color);
  t.text.split('\n').forEach((line, i) => {
    const sp = document.createElementNS(SVGNS, 'tspan');
    sp.setAttribute('x', t.x);
    sp.setAttribute('y', r1(t.y + t.size * (SK_BASE + i * SK_LINE)));
    sp.textContent = line || ' ';
    el.appendChild(sp);
  });
  return el;
}
function paintSketchTextOnCanvas(ctx, t, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `500 ${t.size}px ${SK_FONT}`;
  ctx.textBaseline = 'alphabetic';
  t.text.split('\n').forEach((line, i) => ctx.fillText(line, t.x, t.y + t.size * (SK_BASE + i * SK_LINE)));
  ctx.restore();
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
function sketchBounds(strokes, pics, texts) {
  if ((!strokes || !strokes.length) && (!pics || !pics.length) && (!texts || !texts.length)) return null;
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
  for (const t of texts || []) {
    const b = sketchTextBox(t);
    if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y;
    if (b.x + b.w > x1) x1 = b.x + b.w; if (b.y + b.h > y1) y1 = b.y + b.h;
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
  const b = sketchBounds(s.strokes, s.pics, s.texts) || { x: 0, y: 0, w: 400, h: 250 };
  svg.setAttribute('viewBox', `${r1(b.x)} ${r1(b.y)} ${r1(b.w)} ${r1(b.h)}`);
  svg.textContent = '';
  for (const p of sketchPicsOf(n)) svg.appendChild(makeSketchPicEl(p));
  for (const tx of s.texts || []) svg.appendChild(makeSketchTextEl(tx));
  for (const st of s.strokes) svg.appendChild(makeInkEl(st));
}
/* The note takes the drawing's shape, keeping its width: a drawing that grew
   sideways makes a wider-than-tall note, one that grew down a taller one.
   Only when the shape changed — a note the user sized stays as sized while
   the drawing keeps its proportions. */
function fitSketchNote(n, before) {
  const b = sketchBounds(n.sketch.strokes, n.sketch.pics, n.sketch.texts);
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
    n, strokes: n.sketch.strokes.slice(), pics: sketchPicsOf(n), texts: (n.sketch.texts || []).slice(),
    undo: [], redo: [], live: null, erase: null, sel: new Set(), pick: null, text: null, at: null,
    penSeen: false, changed: false, view: { x: 0, y: 0, z: 1 }, before: sketchBounds(n.sketch.strokes, n.sketch.pics, n.sketch.texts)
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
/* The paper a drawing is on (3.0, Settings ▸ Drawing). Until 3.0 the paper was
   the note's colour and the ink was picked against the app's theme, so black
   ink turned white when the theme went dark and a drawing changed every evening.
   Now the ink is picked against the paper: on Light paper (the default) black
   is black and red is the same red whatever the theme, on Dark paper the other
   way round, and the colours are these literal values — mental.css §83 sets
   them on the editor and on the note, and the board picture reads this table.
   'note' keeps the old way: the note's colour, the theme's ink. */
const SK_PAPERS = {
  light: { bg: '#fbfaf6', ink: '#1c1c1c', other: '#ffffff',
    c: { default: '#8a90a5', red: '#d64545', orange: '#d67c2d', amber: '#b8901e', green: '#2d9655', teal: '#18968c', blue: '#3c78dc', violet: '#8250dc', pink: '#d64696' } },
  dark: { bg: '#17181b', ink: '#ededea', other: '#111111',
    c: { default: '#6d7288', red: '#ff7b7b', orange: '#ffa65a', amber: '#f0cc5a', green: '#69de8e', teal: '#5adcd6', blue: '#72afff', violet: '#b48cff', pink: '#ff8ccd' } }
};
const SK_PAPER_KINDS = ['light', 'dark', 'note'];
// the pattern on a drawing's paper (3.1, Settings ▸ Drawing; mental.css §90 draws it, setSketchView moves it)
const SK_GUIDES = ['dots', 'grid', 'lines', 'none'];
const skPaper = () => SK_PAPERS[state.settings.sketchPaper] || null;
// a stroke's colour on the fixed paper, as a literal; null when the theme decides ('note' paper)
function sketchInkHex(c) {
  const P = skPaper();
  if (isHex(c)) return c;
  if (!P) return null;
  return c === 'text' ? P.ink : P.c[c] || P.ink;
}
// the paper is the fixed paper, or the note's own colour, so the drawing looks the same open and closed
function sketchPaper(n) {
  const P = skPaper();
  if (P) return P.bg;
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
  if (sk.text) placeSketchText();                       // the words being typed stay on their spot
  if (typeof padDirty === 'function') padDirty();       // a paired phone sees the drawing move (js/tablet.js)
}
// everything drawn in view, never closer than 100%; an empty page at 100% with room top left
function fitSketchView() {
  const r = $('skStage').getBoundingClientRect();
  const b = sketchBounds(sk.strokes, sk.pics, sk.texts);
  if (!b) { setSketchView({ x: 60, y: 60, z: 1 }); return; }
  const z = clamp(Math.min((r.width - 80) / b.w, (r.height - 80) / b.h), 0.05, 1);
  setSketchView({ x: r.width / 2 - (b.x + b.w / 2) * z, y: r.height / 2 - (b.y + b.h / 2) * z, z });
}

/* What the editor holds goes into the note as it changes, and is saved like
   any other change — within a second, not at Done (2.7.1). It used to live
   only in the editor until Done: a crash, a power cut or the app being closed
   mid-drawing lost everything since the drawing was opened, and on the user's
   machine it did. The board's undo still sees one visit as one step: the step
   is taken at the first change (`sk.undoTaken`), before the note is touched. */
function commitSketch() {
  if (!sk || !sk.dirty) return false;
  const n = sk.n;
  if (!sk.undoTaken) { pushUndo(); sk.undoTaken = true; }
  const title = $('skTitle').value.trim().slice(0, SKETCH_TITLE_MAX);
  // a new object, never an edit in place: a copy of this note may share the old one
  n.sketch = { title, strokes: sk.strokes.slice() };
  if (sk.pics.length) n.sketch.pics = sk.pics.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
  if (sk.texts.length) n.sketch.texts = sk.texts.map((x) => ({ x: x.x, y: x.y, size: x.size, color: x.color, text: x.text }));
  // the pictures' files, in the same order, where every file-keeping pass will find them
  n.body = sk.pics.map((p) => picBody(p.url, p.name)).join('');
  sk.dirty = false;
  saveSoon();
  return true;
}
function closeSketch() {
  if (!sk) return;
  closeSketchText(true);
  if (!$('studio').classList.contains('hidden')) closeStudio();    // a picture being edited is let go, unapplied
  endSketchStroke();
  if (sk.dirty) commitSketch();
  const { n, undoTaken, before } = sk;
  sk = null;
  $('sketchDlg').classList.add('hidden');
  $('skWorld').textContent = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  padHostChanged();                 // a paired phone goes back to the board
  if (!undoTaken) return;           // nothing changed in this visit
  fitSketchNote(n, before);
  const el = els.get(n.id);
  if (el) paintSketch(el, n);
  drawLinks(); scheduleMinimap(); saveSoon();
}

function drawSketchStrokes() {
  const g = $('skWorld');
  g.textContent = '';
  // what is selected rides the drag (a transform) until it is let go; a picture being resized, its new size
  const k = sk.pick;
  const moving = (it) => k && k.kind === 'move' && sk.sel.has(it) && (k.dx || k.dy);
  for (const p of sk.pics) {
    const el = makeSketchPicEl(k && k.kind === 'resize' && k.it === p ? Object.assign({}, p, { w: k.w, h: k.h }) : p);
    if (moving(p)) el.setAttribute('transform', `translate(${k.dx} ${k.dy})`);
    g.appendChild(el);
  }
  for (const tx of sk.texts) {
    if (sk.text && sk.text.item === tx) continue;      // being typed in, in the box over it
    const el = makeSketchTextEl(k && k.kind === 'resize' && k.it === tx ? Object.assign({}, tx, { size: tx.size * k.w / k.b0.w }) : tx);
    if (moving(tx)) el.setAttribute('transform', `translate(${k.dx} ${k.dy})`);
    g.appendChild(el);
  }
  for (const s of sk.strokes) {
    const el = makeInkEl(s);
    if (moving(s)) el.setAttribute('transform', `translate(${k.dx} ${k.dy})`);
    g.appendChild(el);
  }
  paintSketchSel(g);
  const bar = $('skBar');
  bar.querySelector('[data-sk="undo"]').disabled = !sk.undo.length;
  bar.querySelector('[data-sk="redo"]').disabled = !sk.redo.length;
  bar.querySelector('[data-sk="clear"]').disabled = !sk.strokes.length;
  bar.querySelector('[data-sk="editpic"]').disabled = !sketchOnePic();
  if (typeof padDirty === 'function') padDirty();
  if (sk.dirty) commitSketch();     // every change is on its way to the disk as it lands
}
// a step is the strokes, the pictures and the words, so undo takes back an added picture too
function sketchStep() {
  sk.undo.push({ strokes: sk.strokes.slice(), pics: sk.pics.slice(), texts: sk.texts.slice() });
  if (sk.undo.length > 200) sk.undo.shift();
  sk.redo = [];
  sk.changed = sk.dirty = true;
}
function sketchUndo(back) {
  const from = back ? sk.undo : sk.redo, to = back ? sk.redo : sk.undo;
  if (!from.length) return;
  closeSketchText(false);
  to.push({ strokes: sk.strokes.slice(), pics: sk.pics.slice(), texts: sk.texts.slice() });
  const s = from.pop();
  sk.strokes = s.strokes; sk.pics = s.pics; sk.texts = s.texts || [];
  sk.sel.clear();
  sk.changed = sk.dirty = true;
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
    tool('select', icon('arrow_selector_tool'), te('sketch.select')) +
    tool('pen', icon('ink_pen'), te('ink.pen')) + tool('marker', icon('ink_highlighter'), te('ink.marker')) +
    tool('brush', icon('brush'), te('ink.brush')) + tool('eraser', icon('ink_eraser'), te('ink.eraser')) +
    tool('text', icon('title'), te('sketch.text')) +
    `<span class="ik-sep"></span>` +
    [0, 1, 2].map((i) => `<button class="ik-size${p.size === i ? ' on' : ''}" data-size="${i}" title="${sizeTips[i]}"><i style="--d:${[4, 7, 11][i]}px"></i></button>`).join('') +
    `<span class="ik-sep"></span>` +
    ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c)).map(sw).join('') +
    // on a fixed paper, the colour that is not the ink: white on light paper, black on dark (3.0)
    (skPaper() ? `<button class="ik-sw${p.color === skPaper().other ? ' on' : ''}" data-ink-color="${skPaper().other}" style="--sw:${skPaper().other}" title="${te(skPaper().other === '#ffffff' ? 'ink.white' : 'ink.black')}"></button>` : '') +
    `<label class="ik-custom${isHex(p.color) && p.color !== (skPaper() || {}).other ? ' on' : ''}" title="${te('ink.custom')}" style="--sw:${custom}"><input type="color" value="${custom}"></label>` +
    `<span class="ik-sep"></span>` +
    btn('zout', 'zoom_out', te('zoom.out')) +
    `<button class="ik-btn sk-pct" data-sk="pct" title="${te('zoom.reset')}"></button>` +
    btn('zin', 'zoom_in', te('zoom.in')) + btn('fit', 'fit_screen', te('zoom.fit')) +
    `<span class="ik-sep"></span>` +
    btn('undo', 'undo', te('menu.undo')) + btn('redo', 'redo', te('menu.redo')) +
    btn('pics', 'image', te('sketch.addFiles')) + btn('editpic', 'tune', te('sketch.editPic')) +
    btn('clear', 'delete_sweep', te('ink.clear')) + btn('full', 'open_in_full', te('sketch.fullScreen')) +
    `<button class="ik-btn ik-done" data-sk="done" title="${te('ink.done')}" aria-label="${te('ink.done')}">${icon('check')}</button>`;
  const set = (patch) => {
    state.settings.sketchPen = healSketchPen(Object.assign({}, state.settings.sketchPen, patch));
    if (sk && state.settings.sketchPen.tool !== 'select') sk.sel.clear();   // leaving the arrow lets go
    // a colour or a size picked while typing is the words' colour and size
    if (sk && sk.text && (patch.color || patch.size != null)) restyleSketchText();
    if (sk && sk.text && patch.tool && patch.tool !== 'text') closeSketchText(true);
    buildSketchBar(); saveSoon();
  };
  bar.querySelectorAll('[data-tool]').forEach((el) => onPress(el, () => set({ tool: el.dataset.tool })));
  bar.querySelectorAll('[data-size]').forEach((el) => onPress(el, () => set({ size: +el.dataset.size })));
  // with lines or words selected, a colour recolours them (as the phone's does), and the pen keeps its own
  const colour = (c) => {
    if (sk && p.tool === 'select' && [...sk.sel].some((it) => it.pts || it.text != null)) { recolorSketchSel(c); return; }
    set({ color: c, tool: p.tool === 'eraser' ? 'pen' : p.tool });
  };
  bar.querySelectorAll('[data-ink-color]').forEach((el) => onPress(el, () => colour(el.dataset.inkColor)));
  const pick = bar.querySelector('.ik-custom input');
  pick.addEventListener('input', () => { bar.querySelector('.ik-custom').style.setProperty('--sw', pick.value); });
  pick.addEventListener('change', () => colour(pick.value));
  // a press on the bar must not take the focus out of the words being typed
  bar.addEventListener('pointerdown', (e) => { if (sk && sk.text && !e.target.closest('input')) e.preventDefault(); });
  bar.querySelectorAll('[data-sk]').forEach((el) => onPress(el, () => {
    const act = el.dataset.sk;
    if (act === 'done') closeSketch();
    else if (act === 'editpic') editSketchPicture(sketchOnePic());
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
  $('sketchDlg').classList.toggle('sk-selecting', p.tool === 'select');
  $('sketchDlg').classList.toggle('sk-typing', p.tool === 'text');
  if (sk) { drawSketchStrokes(); setSketchView(sk.view); }
}
// the drawing note's pen: the board pen's tools, and the T tool, which the board pen has not
function healSketchPen(p) {
  const out = healPen(p);
  if (p && p.tool === 'text') out.tool = 'text';
  return out;
}

/* ---- a stroke on the page ---- */
// a pointer's position in drawing units, and how many screen pixels one unit is
function sketchPoint(e) {
  const r = $('skStage').getBoundingClientRect(), v = sk.view;
  return { x: (e.clientX - r.left - v.x) / v.z, y: (e.clientY - r.top - v.y) / v.z, k: v.z };
}
function onSketchDown(e) {
  if (!sk || sk.live || sk.erase || skSurface.busy()) return;
  // a press anywhere on the page keeps the words being typed, then does what it does
  if (sk.text) { closeSketchText(true); if (state.settings.sketchPen.tool === 'text') { e.preventDefault(); return; } }
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
  if (p.tool === 'select') { beginSketchPick(e, at); return; }
  if (p.tool === 'text') {
    // on words already there: type into them; anywhere else: new words, starting where it was pressed
    endSketchStroke();
    const hit = sketchHit(at);
    openSketchText(hit && hit.text != null ? hit : at, hit && hit.text != null ? hit : null);
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
  const w = inkSteady(L.raw, sketchPoint(e));
  const last = L.raw[L.raw.length - 1];
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * L.k < 0.6) return;
  L.raw.push({ x: w.x, y: w.y, p: inkPressure(e), t: e.timeStamp || performance.now() });
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
  if (sk.pick && e.pointerId === sk.pick.id) { moveSketchPick(sketchPoint(e)); return; }
  if (sk.erase && e.pointerId === sk.erase.id) { eraseSketchAt(sketchPoint(e)); return; }
  if (!sk.live || e.pointerId !== sk.live.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) evs.forEach(addSketchPoint); else addSketchPoint(e);
}
function onSketchUp(e) {
  const g = sk && (sk.live || sk.erase || sk.pick);
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
  if (sk.pick) endSketchPick();
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
  if (e.target.closest && e.target.closest('input, textarea')) return;    // the words being typed have their own keys
  const ctrl = e.ctrlKey || e.metaKey;
  const k = (e.key || '').toLowerCase();
  if (e.key === 'Escape') {
    e.preventDefault();
    if (sk.sel.size) { sk.sel.clear(); drawSketchStrokes(); sketchSelChanged(); return; }   // let go first, as on the board
    closeSketch(); return;
  }
  if (ctrl && k === 'z') { e.preventDefault(); sketchUndo(!e.shiftKey); return; }
  if (ctrl && k === 'y') { e.preventDefault(); sketchUndo(false); return; }
  // the clipboard, inside the drawing (2.10)
  const code = (e.code || '').replace(/^Key/, '').toLowerCase();
  if (ctrl && !e.shiftKey && !e.altKey) {
    if (code === 'c' && sk.sel.size) { e.preventDefault(); copySketchSel(false); return; }
    if (code === 'x' && sk.sel.size) { e.preventDefault(); copySketchSel(true); return; }
    if (code === 'a') { e.preventDefault(); selectAllSketch(); return; }
    if (code === 'd' && sk.sel.size) { e.preventDefault(); duplicateSketchSel(); return; }
    /* Ctrl+V is not prevented: Chromium's paste command is what raises the
       `paste` event, and that event is what carries a screenshot or a copied
       file (onSketchPaste). If it never comes, the drawing's own clipboard is
       pasted instead — the board does the same (MAP.md §4v). */
    if (code === 'v' && !e.repeat) {
      skPasteSeen = false;
      clearTimeout(skPasteTimer);
      skPasteTimer = setTimeout(() => { if (!skPasteSeen && sk) pasteInternalIntoSketch(sketchPastePoint()); }, 150);
      return;
    }
  }
  // the board's own zoom keys, on the drawing
  const ch = chordKey(e);
  if (ctrl && (ch === '=' || ch === '+')) { e.preventDefault(); skSurface.zoomCentre(1.25); return; }
  if (ctrl && ch === '-') { e.preventDefault(); skSurface.zoomCentre(1 / 1.25); return; }
  if (ctrl && ch === '0') { e.preventDefault(); skSurface.zoomCentre(1 / sk.view.z); return; }
  if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitSketchView(); return; }
  if (ctrl) return;
  const p = state.settings.sketchPen;
  if ((e.key === 'Delete' || e.key === 'Backspace') && sk.sel.size) { e.preventDefault(); deleteSketchSel(); return; }
  if (e.key === 'Enter' && sketchOnePic()) { e.preventDefault(); editSketchPicture(sketchOnePic()); return; }
  const tools = { v: 'select', d: 'pen', m: 'marker', b: 'brush', e: 'eraser', t: 'text' };
  const pick = tools[code];
  const set = (patch) => {
    state.settings.sketchPen = healSketchPen(Object.assign({}, p, patch));
    if (state.settings.sketchPen.tool !== 'select') sk.sel.clear();
    buildSketchBar(); saveSoon();
  };
  if (pick) { e.preventDefault(); set({ tool: pick }); return; }
  if (e.code === 'BracketLeft') { e.preventDefault(); set({ size: Math.max(0, p.size - 1) }); return; }
  if (e.code === 'BracketRight') { e.preventDefault(); set({ size: Math.min(2, p.size + 1) }); return; }
}

/* ---- selecting, moving, resizing, deleting (2.7.1) ----
   The arrow (V) in a drawing note: press a line or a picture to select it
   (Shift adds or takes away), drag to move everything selected, drag across
   empty paper to select what the box touches, the corner of a single selected
   picture to resize it (its shape kept), Delete to remove the selection. A
   line is hit before the picture under it — the ink is on top. Each move,
   resize or delete is one step of the editor's undo, and is saved like any
   other change. A moved line gets a new id: its old one may still be in an
   undo step with the old points, and ink.js caches a path per id. */
const SK_HIT_PX = 8, SK_HANDLE_PX = 14;
function sketchHit(at) {
  const r = SK_HIT_PX / at.k;
  for (let i = sk.strokes.length - 1; i >= 0; i--) if (strokeNear(sk.strokes[i], at, r)) return sk.strokes[i];
  for (let i = sk.texts.length - 1; i >= 0; i--) {
    const b = sketchTextBox(sk.texts[i]);
    if (at.x >= b.x - r && at.x <= b.x + b.w + r && at.y >= b.y - r && at.y <= b.y + b.h + r) return sk.texts[i];
  }
  for (let i = sk.pics.length - 1; i >= 0; i--) {
    const p = sk.pics[i];
    if (at.x >= p.x && at.x <= p.x + p.w && at.y >= p.y && at.y <= p.y + p.h) return p;
  }
  return null;
}
function sketchItemBox(it) {
  if (it.pts) { const b = inkBox(it); return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }; }
  if (it.text != null) return sketchTextBox(it);
  return { x: it.x, y: it.y, w: it.w, h: it.h };
}
// the one picture selected, if that is what is selected — the one Edit picture works on
function sketchOnePic() {
  if (!sk || sk.sel.size !== 1) return null;
  const it = [...sk.sel][0];
  return !it.pts && it.text == null && it.url ? it : null;
}
function beginSketchPick(e, at) {
  const sel = sk.sel, id = e.pointerId;
  const one = sel.size === 1 ? [...sel][0] : null;
  const hs = SK_HANDLE_PX / at.k;
  // a picture's corner resizes it; a text's corner makes its letters bigger or smaller
  const ob = one && !one.pts ? sketchItemBox(one) : null;
  if (ob && Math.abs(at.x - (ob.x + ob.w)) < hs && Math.abs(at.y - (ob.y + ob.h)) < hs) {
    sk.pick = { kind: 'resize', id, it: one, b0: ob, w: ob.w, h: ob.h };
    drawSketchStrokes();
    return;
  }
  const hit = sketchHit(at);
  if (hit && e.shiftKey) {
    if (sel.has(hit)) sel.delete(hit); else sel.add(hit);
    sk.pick = { kind: 'none', id };
  } else if (hit) {
    if (!sel.has(hit)) { sel.clear(); sel.add(hit); }
    sk.pick = { kind: 'move', id, at0: at, dx: 0, dy: 0 };
  } else {
    sk.pick = { kind: 'lasso', id, at0: at, at1: at, base: new Set(e.shiftKey ? sel : []) };
    if (!e.shiftKey) sel.clear();
  }
  drawSketchStrokes();
  sketchSelChanged();
}
function moveSketchPick(at) {
  const k = sk.pick;
  if (k.kind === 'move') { k.dx = at.x - k.at0.x; k.dy = at.y - k.at0.y; }
  else if (k.kind === 'resize') {
    const ar = k.b0.w / k.b0.h;
    k.w = Math.max(16 / at.k, at.x - k.b0.x, (at.y - k.b0.y) * ar);
    k.h = k.w / ar;
  } else if (k.kind === 'lasso') {
    k.at1 = at;
    const x0 = Math.min(k.at0.x, at.x), y0 = Math.min(k.at0.y, at.y), x1 = Math.max(k.at0.x, at.x), y1 = Math.max(k.at0.y, at.y);
    sk.sel = new Set(k.base);
    for (const s of sk.strokes) {
      for (let i = 0; i < s.pts.length; i += 2) {
        if (s.pts[i] >= x0 && s.pts[i] <= x1 && s.pts[i + 1] >= y0 && s.pts[i + 1] <= y1) { sk.sel.add(s); break; }
      }
    }
    for (const p of sk.pics) if (p.x < x1 && p.x + p.w > x0 && p.y < y1 && p.y + p.h > y0) sk.sel.add(p);
    for (const tx of sk.texts) { const b = sketchTextBox(tx); if (b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0) sk.sel.add(tx); }
  } else return;
  drawSketchStrokes();
}
function endSketchPick() {
  const k = sk.pick;
  sk.pick = null;
  if (k.kind === 'move' && Math.hypot(k.dx, k.dy) * sk.view.z >= 1) {
    sketchStep();
    const moved = new Set();
    const shift = (pts) => pts.map((v, i) => r1(v + (i % 2 ? k.dy : k.dx)));
    sk.strokes = sk.strokes.map((s) => {
      if (!sk.sel.has(s)) return s;
      const n = Object.assign({}, s, { id: uid(), pts: shift(s.pts) });
      moved.add(n); return n;
    });
    const slide = (p) => {
      if (!sk.sel.has(p)) return p;
      const n = Object.assign({}, p, { x: r1(p.x + k.dx), y: r1(p.y + k.dy) });
      moved.add(n); return n;
    };
    sk.pics = sk.pics.map(slide);
    sk.texts = sk.texts.map(slide);
    sk.sel = moved;
  } else if (k.kind === 'resize' && (k.w !== k.b0.w)) {
    sketchStep();
    const isText = k.it.text != null;
    const n = isText ? Object.assign({}, k.it, { size: r1(Math.max(1, k.it.size * k.w / k.b0.w)) })
                     : Object.assign({}, k.it, { w: r1(k.w), h: r1(k.h) });
    if (isText) sk.texts = sk.texts.map((x) => (x === k.it ? n : x));
    else sk.pics = sk.pics.map((p) => (p === k.it ? n : p));
    sk.sel = new Set([n]);
  }
  drawSketchStrokes();
  sketchSelChanged();
}
// the phone's bin and colours on the drawing's selection (js/tablet.js padSelection)
function padSketchSelection(m) {
  if (!sk) return;
  if (m.act === 'delete') { deleteSketchSel(); return; }
  if (m.act === 'clear') { sk.sel.clear(); drawSketchStrokes(); return; }
  if (m.act === 'color') recolorSketchSel(m.color);
}
// the selected lines and words take a colour; a picture has none to take
function recolorSketchSel(color) {
  if (!sk || !inkColorOk(color) || ![...sk.sel].some((it) => it.pts || it.text != null)) return;
  sketchStep();
  const next = new Set();
  const paint = (s) => {
    if (!sk.sel.has(s)) return s;
    const n = Object.assign({}, s, { color });
    next.add(n); return n;
  };
  sk.strokes = sk.strokes.map(paint);
  sk.texts = sk.texts.map(paint);
  for (const p of sk.pics) if (sk.sel.has(p)) next.add(p);
  sk.sel = next;
  drawSketchStrokes();
}
// a paired phone lights its bin by how much is selected
function sketchSelChanged() { if (typeof sendPadView === 'function') sendPadView(); }
function deleteSketchSel() {
  if (!sk || !sk.sel.size) return;
  sketchStep();
  sk.strokes = sk.strokes.filter((s) => !sk.sel.has(s));
  sk.pics = sk.pics.filter((p) => !sk.sel.has(p));
  sk.texts = sk.texts.filter((x) => !sk.sel.has(x));
  sk.sel.clear();
  drawSketchStrokes();
  sketchSelChanged();
}
// the dashed boxes round what is selected, the lasso, and a single picture's corner handle
function paintSketchSel(g) {
  const k = sk.pick, z = sk.view.z;
  const rect = (x, y, w, h, cls) => {
    const r = document.createElementNS(SVGNS, 'rect');
    r.setAttribute('class', cls);
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', Math.max(0, w)); r.setAttribute('height', Math.max(0, h));
    g.appendChild(r);
    return r;
  };
  const pad = 4 / z;
  for (const it of sk.sel) {
    let b = sketchItemBox(it);
    if (k && k.kind === 'move') b = { x: b.x + k.dx, y: b.y + k.dy, w: b.w, h: b.h };
    if (k && k.kind === 'resize' && k.it === it) b = { x: b.x, y: b.y, w: k.w, h: k.h };
    rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2, 'sk-selbox');
    if (sk.sel.size === 1 && !it.pts) {
      const hs = 10 / z;
      rect(b.x + b.w - hs / 2, b.y + b.h - hs / 2, hs, hs, 'sk-handle');
    }
  }
  if (k && k.kind === 'lasso') {
    rect(Math.min(k.at0.x, k.at1.x), Math.min(k.at0.y, k.at1.y), Math.abs(k.at1.x - k.at0.x), Math.abs(k.at1.y - k.at0.y), 'sk-lasso');
  }
}

/* ---- typing on the page (2.10) ----
   The T tool: press on the paper and type; press on words already there to
   change them. The box is a textarea laid over the drawing at the words' own
   place and size (it follows the zoom), so what you type is where it lands.
   Enter is a new line; Escape, Ctrl+Enter, a press anywhere else or another
   tool keeps it. Emptied words are removed. One undo step per visit. */
function openSketchText(where, item) {
  if (!sk) return;
  closeSketchText(true);
  if (!item && sk.texts.length >= SKETCH_TEXTS_MAX) { toast(t('sketch.textsFull')); return; }
  const p = state.settings.sketchPen;
  const ta = document.createElement('textarea');
  ta.className = 'sk-text-in';
  ta.dir = 'auto';
  ta.rows = 1;
  ta.spellcheck = state.settings.spell !== false;
  ta.value = item ? item.text : '';
  ta.setAttribute('aria-label', t('sketch.text'));
  sk.text = { ta, item, x: where.x, y: where.y, size: item ? item.size : r1(SK_TEXT_PX[p.size] / sk.view.z), color: item ? item.color : p.color };
  $('skStage').appendChild(ta);
  placeSketchText();
  ta.addEventListener('keydown', (e) => {
    e.stopPropagation();                // the drawing's keys (T, D, Delete…) are letters here
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); closeSketchText(true); }
  });
  ta.addEventListener('blur', () => { if (sk && sk.text && sk.text.ta === ta) closeSketchText(true); });
  drawSketchStrokes();                  // the words being changed are hidden under the box
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}
function placeSketchText() {
  const T = sk.text, v = sk.view;
  T.ta.style.left = (v.x + T.x * v.z) + 'px';
  T.ta.style.top = (v.y + T.y * v.z) + 'px';
  T.ta.style.fontSize = (T.size * v.z) + 'px';
  T.ta.style.color = inkColorCss(T.color);
}
// the pen's colour or size changed while typing: the words take it
function restyleSketchText() {
  const T = sk.text, p = state.settings.sketchPen;
  T.color = p.color;
  T.size = r1(SK_TEXT_PX[p.size] / sk.view.z);
  placeSketchText();
}
function closeSketchText(keep) {
  const T = sk && sk.text;
  if (!T) return;
  sk.text = null;
  T.ta.remove();
  const v = T.ta.value.replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, SKETCH_TEXT_MAX);
  const it = T.item;
  const changed = it ? (v !== it.text || T.color !== it.color || T.size !== it.size) : !!v.trim();
  if (keep && changed) {
    sketchStep();
    const made = v.trim() ? { x: r1(T.x), y: r1(T.y), size: r1(T.size), color: T.color, text: v } : null;
    if (it) sk.texts = sk.texts.flatMap((x) => (x === it ? (made ? [made] : []) : [x]));
    else sk.texts = sk.texts.concat([made]);
    if (it && sk.sel.has(it)) { sk.sel.delete(it); if (made) sk.sel.add(made); }
  }
  drawSketchStrokes();
}
// words from a paste or a drop, centred where they were put
function addSketchText(text, at) {
  const v = String(text || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, SKETCH_TEXT_MAX);
  if (!sk || !v.trim()) return 0;
  return pasteSketchItems({ strokes: [], pics: [], texts: [{ x: 0, y: 0, size: r1(SK_TEXT_PX[0] / sk.view.z), color: 'text', text: v }] }, at);
}

/* ---- copy, cut, paste, duplicate, select all (2.10) ----
   Inside a drawing, Ctrl+C / X / V / D / A work on what the arrow selected.
   A copy is kept here (`skClip`) as the lines, pictures and words themselves,
   and also goes to the system clipboard as a picture, so a piece of a
   drawing can be pasted into anything else.

   Ctrl+V has four sources, and which was meant is a question of time. The
   system clipboard can only have changed behind this app's back while the
   window was not in front, or by a copy in a text field (`sysClipAt`). So a
   copy made here — in a drawing, or of notes on the board — since then is
   what was meant, and pastes as itself: lines stay lines, a picture note
   becomes a picture under the ink, a drawing note its drawing, a text note
   its words. Otherwise the system clipboard wins: files (a copied PDF or
   picture in Explorer), a screenshot's pixels, or plain text, which become
   words on the page. */
let skClip = null;
let skPasteSeen = false, skPasteTimer = 0;
const lastCopy = { board: 0, sketch: 0 };   // when each of the app's own clipboards was last filled
let sysClipAt = 0;                          // when the system clipboard last could have changed without us
function markInternalCopy(kind) { lastCopy[kind] = performance.now(); }

function sketchSelClip() {
  return {
    strokes: sk.strokes.filter((s) => sk.sel.has(s)).map((s) => Object.assign({}, s)),
    pics: sk.pics.filter((p) => sk.sel.has(p)).map((p) => Object.assign({}, p)),
    texts: sk.texts.filter((x) => sk.sel.has(x)).map((x) => Object.assign({}, x))
  };
}
function copySketchSel(cut) {
  if (!sk || !sk.sel.size) return;
  const n = sk.sel.size;
  skClip = sketchSelClip();
  markInternalCopy('sketch');
  sketchClipImage(skClip);              // not awaited: the copy has happened as far as the drawing is concerned
  toast(t(cut ? 'msg.cut' : 'msg.copied', { n }));
  if (cut) deleteSketchSel();
}
function selectAllSketch() {
  if (!sk) return;
  if (state.settings.sketchPen.tool !== 'select') {
    state.settings.sketchPen = healSketchPen(Object.assign({}, state.settings.sketchPen, { tool: 'select' }));
    buildSketchBar(); saveSoon();
  }
  sk.sel = new Set([...sk.strokes, ...sk.pics, ...sk.texts]);
  drawSketchStrokes(); sketchSelChanged();
}
// a copy of the selection a little down and right of it, selected; the clipboard is not touched
function duplicateSketchSel() {
  const clip = sketchSelClip();
  const b = sketchBounds(clip.strokes, clip.pics, clip.texts);
  if (!b) return;
  const off = 24 / sk.view.z;
  pasteSketchItems(clip, { x: b.x + b.w / 2 + off, y: b.y + b.h / 2 + off });
}
// where a paste lands: under the pointer when it is over the page, else the middle of the view
function sketchPastePoint() {
  const r = $('skStage').getBoundingClientRect(), v = sk.view, a = sk.at;
  const inside = a && a.x >= r.left && a.x <= r.right && a.y >= r.top && a.y <= r.bottom;
  const cx = inside ? a.x - r.left : r.width / 2, cy = inside ? a.y - r.top : r.height / 2;
  return { x: (cx - v.x) / v.z, y: (cy - v.y) / v.z };
}
/* Copies of `clip` (lines, pictures, words), centred on `at`, one undo step,
   left selected with the arrow out so they can be put where they belong.
   Returns how many landed. */
function pasteSketchItems(clip, at) {
  if (!sk) return 0;
  const b = sketchBounds(clip.strokes, clip.pics, clip.texts);
  if (!b) return 0;
  const over = (have, max, n) => n > 0 && have + n > max;
  if (over(sk.strokes.length, SKETCH_MAX, clip.strokes.length)) { toast(t('sketch.full')); return 0; }
  if (over(sk.pics.length, SKETCH_PICS_MAX, clip.pics.length)) { toast(t('sketch.picsFull')); return 0; }
  if (over(sk.texts.length, SKETCH_TEXTS_MAX, clip.texts.length)) { toast(t('sketch.textsFull')); return 0; }
  closeSketchText(true);
  const dx = r1(at.x - (b.x + b.w / 2)), dy = r1(at.y - (b.y + b.h / 2));
  sketchStep();
  const made = new Set();
  const add = (o) => { made.add(o); return o; };
  const slide = (o) => add(Object.assign({}, o, { x: r1(o.x + dx), y: r1(o.y + dy) }));
  sk.strokes = sk.strokes.concat(clip.strokes.map((s) => add(Object.assign({}, s, { id: uid(), pts: s.pts.map((v, i) => r1(v + (i % 2 ? dy : dx))) }))));
  sk.pics = sk.pics.concat(clip.pics.map(slide));
  sk.texts = sk.texts.concat(clip.texts.map(slide));
  if (state.settings.sketchPen.tool !== 'select') {
    state.settings.sketchPen = healSketchPen(Object.assign({}, state.settings.sketchPen, { tool: 'select' }));
    buildSketchBar(); saveSoon();
  }
  sk.sel = made;
  drawSketchStrokes(); sketchSelChanged();
  carrySketchPics();
  return made.size;
}
/* Notes copied on the board, pasted into a drawing: each as what it looks
   like, where it sat relative to the others. A picture note is its picture;
   a drawing note is its drawing, scaled to the note as the board shows it; a
   text note is its words. Workflows have nothing to draw. */
function pasteBoardNotesIntoSketch(at) {
  const notes = (clipboard || []).filter((c) => !c.frame).map((c) => c.data);
  const clip = { strokes: [], pics: [], texts: [] };
  for (const n of notes) {
    if (n.pic) {
      const url = picSrc(n);
      if (url) clip.pics.push({ x: n.x, y: n.y, w: n.w, h: n.h, url, name: picName(n) });
    } else if (n.sketch) {
      const s = okSketch(n.sketch);
      const b = s && sketchBounds(s.strokes, s.pics, s.texts);
      if (!b) continue;
      const room = { x: n.x + 6, y: n.y + SKETCH_TITLE_H, w: Math.max(10, n.w - 12), h: Math.max(10, n.h - SKETCH_TITLE_H - 6) };
      const k = Math.min(room.w / b.w, room.h / b.h);
      const ox = room.x + (room.w - b.w * k) / 2 - b.x * k, oy = room.y + (room.h - b.h * k) / 2 - b.y * k;
      for (const st of s.strokes) {
        const c = Object.assign({}, st, { size: r1(Math.max(0.05, st.size * k)), pts: st.pts.map((v, i) => r1((i % 2 ? oy : ox) + v * k)) });
        if (st.ws) c.ws = st.ws.map((w) => Math.round(Math.max(0.05, w * k) * 100) / 100);
        clip.strokes.push(c);
      }
      for (const p of sketchPicsOf(Object.assign({}, n, { sketch: s }))) clip.pics.push(Object.assign({}, p, { x: ox + p.x * k, y: oy + p.y * k, w: p.w * k, h: p.h * k }));
      for (const x of s.texts || []) clip.texts.push(Object.assign({}, x, { x: ox + x.x * k, y: oy + x.y * k, size: r1(x.size * k) }));
    } else {
      // its words as lines; a heading's # marks are for Markdown, not for a page
      const text = noteToText(n.body).replace(/^#{1,6} /gm, '').trim().slice(0, SKETCH_TEXT_MAX);
      if (text) clip.texts.push({ x: n.x + 14, y: n.y + 12, size: 16, color: 'text', text });
    }
  }
  return pasteSketchItems(clip, at);
}
function pasteInternalIntoSketch(at) {
  const board = clipboard && clipboard.some((c) => !c.frame);
  if (board && (lastCopy.board > lastCopy.sketch || !skClip)) return pasteBoardNotesIntoSketch(at);
  if (skClip) return pasteSketchItems(skClip, at);
  return 0;
}
// the document's paste event, while a drawing note is open (init.js)
function onSketchPaste(e) {
  if (!sk) return;
  if (e.target.closest && e.target.closest('input, textarea')) return;    // the title, words being typed
  e.preventDefault();
  skPasteSeen = true; clearTimeout(skPasteTimer);
  const at = sketchPastePoint();
  if (Math.max(lastCopy.board, lastCopy.sketch) > sysClipAt && pasteInternalIntoSketch(at)) return;
  const dt = e.clipboardData;
  const files = dt && dt.files ? [...dt.files] : [];
  if (!files.length && dt) for (const it of dt.items || []) if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
  if (files.length) { sketchItemsFromFiles(files).then((items) => sketchImport(items, at)); return; }
  const text = dt ? dt.getData('text/plain') : '';
  if (text && text.trim()) { addSketchText(text, at); return; }
  pasteInternalIntoSketch(at);
}
/* Pictures pasted from another board still point at that board's folder;
   they are copied into this one and re-addressed, so this board stays whole
   (the same as pasteClipboard() does for notes). */
async function carrySketchPics() {
  if (!sk || !FILES || !FILES.carry || !state.activeBoard) return;
  const mine = `mbf://${String(state.activeBoard).toLowerCase()}/`;
  const urls = [...new Set(sk.pics.map((p) => p.url).filter((u) => /^mbf:/i.test(u) && !u.toLowerCase().startsWith(mine)))];
  if (!urls.length) return;
  const n0 = sk.n;
  let got = null;
  try { got = await FILES.carry(urls, state.activeBoard); } catch (_) {}
  if (!got || !got.map || !sk || sk.n !== n0) return;
  const sel = new Set();
  sk.pics = sk.pics.map((p) => {
    const to = got.map[p.url];
    const q = to ? Object.assign({}, p, { url: to }) : p;
    if (sk.sel.has(p)) sel.add(q);
    return q;
  });
  for (const it of sk.sel) if (it.pts || it.text != null) sel.add(it);
  sk.sel = sel;
  sk.dirty = true;
  drawSketchStrokes();
}
/* The copy as a picture on the system clipboard, on the drawing's own paper,
   twice as sharp as at 100% (at most 4096 px a side). Pictures are read as
   data, so the canvas is never tainted. */
async function sketchClipImage(clip) {
  try {
    const b = sketchBounds(clip.strokes, clip.pics, clip.texts);
    if (!b) return;
    const k = Math.min(2, 4096 / Math.max(b.w, b.h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(b.w * k)); c.height = Math.max(1, Math.ceil(b.h * k));
    const g = c.getContext('2d');
    g.fillStyle = getComputedStyle($('skStage')).backgroundColor;
    g.fillRect(0, 0, c.width, c.height);
    g.scale(k, k); g.translate(-b.x, -b.y);
    for (const p of clip.pics) {
      const img = new Image();
      img.src = await toDataUrl(p.url);
      try { await img.decode(); g.drawImage(img, p.x, p.y, p.w, p.h); } catch (_) {}
    }
    const colours = new Map();
    const colorOf = (cc) => {
      if (!colours.has(cc)) {
        const probe = document.createElement('i');
        probe.style.color = inkColorCss(cc);
        $('sketchDlg').appendChild(probe);
        colours.set(cc, getComputedStyle(probe).color);
        probe.remove();
      }
      return colours.get(cc);
    };
    for (const x of clip.texts) paintSketchTextOnCanvas(g, x, colorOf(x.color));
    paintInkOnCanvas(g, clip.strokes, colorOf);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return !!blob && await toSystemClipboardImage(blob);
  } catch (err) { console.warn('drawing note: the copy did not reach the system clipboard', err); return false; }
}

/* ---- a picture under the drawing, edited (2.10) ----
   Select one picture and press Edit picture (or Enter, or double-click it):
   the picture editor opens over the drawing — crop, colours, marks — and
   Apply puts the edited copy in its place, keeping its width; the shape
   follows a crop. One undo step of the drawing; the original file is kept. */
function editSketchPicture(p) {
  if (!sk || !p || !sk.pics.includes(p)) return;
  closeSketchText(true);
  const img = new Image();
  img.src = p.url;
  if (p.name) img.dataset.name = p.name;
  const n0 = sk.n;
  openStudio(img, {
    inside: $('sketchDlg'),            // full screen shows only the full-screen element and what is in it
    onApply: async (url, name) => {
      if (!sk || sk.n !== n0 || !sk.pics.includes(p)) return;
      const size = await measureImage(url);
      if (!sk || sk.n !== n0 || !sk.pics.includes(p)) return;
      sketchStep();
      const h = size && size.w && size.h ? p.w * size.h / size.w : p.h;
      const q = Object.assign({}, p, { url, name: name || p.name, h: r1(h) });
      sk.pics = sk.pics.map((x) => (x === p ? q : x));
      sk.sel = new Set([q]);
      drawSketchStrokes(); sketchSelChanged();
    }
  });
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
   same built from files dropped on the editor. With `at` (a drop, a paste)
   they start there instead, and the view stays where it is. */
async function sketchImport(items, at) {
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
  closeSketchText(true);
  sketchStep();
  let { x, y } = at || sketchNextSpot(sk.strokes, sk.pics, sk.texts);
  for (const p of placed.slice(0, room)) {
    sk.pics.push({ x: r1(x), y: r1(y), w: r1(p.w), h: r1(p.h), url: p.url, name: p.name });
    y += p.h + 40;
  }
  drawSketchStrokes();
  if (at) return placed.length;
  fitSketchView();
  // and again once the layout has settled — a file dialog or a toast can still be moving things
  requestAnimationFrame(() => { if (sk && sk.n === n0) fitSketchView(); });
  return placed.length;
}
// under everything already there, lined up with the pictures (sketchBounds' box has air round it)
function sketchNextSpot(strokes, pics, texts) {
  let x = pics.length ? Math.min(...pics.map((p) => p.x)) : 0, y = -Infinity;
  for (const p of pics) y = Math.max(y, p.y + p.h);
  for (const s of strokes) y = Math.max(y, inkBox(s).y1);
  for (const tx of texts || []) { const b = sketchTextBox(tx); y = Math.max(y, b.y + b.h); }
  if (!pics.length && strokes.length) x = Math.min(...strokes.map((s) => inkBox(s).x0));
  return { x, y: Number.isFinite(y) ? y + 40 : 0 };
}
/* Dropped files, as what sketchImport() takes — and the names of what a
   drawing cannot hold, so the drop can say so instead of doing nothing. */
async function sketchItemsFromFiles(files) {
  const items = [], refused = [];
  for (const f of [...(files || [])].slice(0, 40)) {
    const ext = (/\.([a-z0-9]+)$/i.exec(f.name || '') || ['', ''])[1].toLowerCase();
    const kind = ext === 'pdf' || f.type === 'application/pdf' ? 'pdf' : (/^image\//.test(f.type) || IMG_MIME[ext]) ? 'image' : '';
    if (!kind) { refused.push(f.name || '?'); continue; }
    try { items.push({ name: f.name, kind, ext, bytes: new Uint8Array(await f.arrayBuffer()) }); }
    catch (_) { items.push({ name: f.name, kind, error: 'read' }); }
  }
  if (refused.length) toast(t('sketch.cannotHold', { names: refused.join(', ') }), 6000);
  return items;
}
// files dropped on a drawing note on the board: it opens, and they go under its drawing
async function dropIntoSketch(id, files) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.sketch || !canEditHere()) return false;
  const items = await sketchItemsFromFiles(files);
  if (!items.length) return true;
  if (!sk || sk.n !== n) { if (sk) closeSketch(); openSketch(id); }
  await sketchImport(items);
  return true;
}
/* A picture note dragged onto a drawing note on the board goes under its
   drawing, below what is there — the same file, nothing copied, the picture
   note gone. Called by finishPicDrop() (pictures.js), whose undo dance has
   already been done; one step. */
function pictureIntoSketch(target, pic) {
  const s = target.sketch;
  const files = sketchPicFiles(target);
  const spot = sketchNextSpot(s.strokes, s.pics || [], s.texts);
  const ar = pic.ar || pic.w / pic.h || 1;
  const w = Math.min(SKETCH_PIC_MAX, pic.w * 2);
  const pics = (s.pics || []).slice(0, files.length);
  pics.push({ x: r1(spot.x), y: r1(spot.y), w: r1(w), h: r1(w / ar) });
  target.sketch = Object.assign({}, s, { pics });
  target.body = files.map((f) => picBody(f.url, f.name)).join('') + picBody(picSrc(pic), picName(pic));
  fitSketchNote(target, null);
  const el = els.get(target.id);
  if (el) { placeEl(el, target); paintSketch(el, target); }
}

/* ---- the title, renamed on the board (2.7.1) ----
   Double-click a drawing note's title, or right-click ▸ Rename: the title
   becomes editable where it is, as a workflow's does (renameFrame). Enter
   keeps it, Escape puts it back; one undo step. */
function renameSketch(id) {
  const n = state.notes.find((x) => x.id === id);
  // the note may be culled on a big board — mounting it is part of renaming it, as for enterEdit()
  const el = n && n.sketch && canEditHere() && ensureMounted(id);
  if (!el) return;
  const title = el.querySelector('.sk-title');
  title.textContent = n.sketch.title;
  title.classList.remove('empty');
  title.classList.add('renaming');
  title.setAttribute('contenteditable', 'true');
  title.focus();
  const r = document.createRange(); r.selectNodeContents(title);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  let settled = false;
  const finish = (commit) => {
    if (settled) return;
    settled = true;
    title.removeAttribute('contenteditable');
    title.classList.remove('renaming');
    title.removeEventListener('blur', onBlur);
    title.removeEventListener('keydown', onKey);
    const v = (title.textContent || '').replace(/\s+/g, ' ').trim().slice(0, SKETCH_TITLE_MAX);
    if (commit && v !== n.sketch.title) {
      pushUndo();
      n.sketch = Object.assign({}, n.sketch, { title: v });
      saveSoon(); drawLinks();
    }
    paintSketch(el, n);
  };
  const onBlur = () => finish(true);
  // Enter keeps it directly — not by blurring, which does nothing to a window that is not in front
  const onKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); title.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); title.blur(); }
  };
  title.addEventListener('blur', onBlur);
  title.addEventListener('keydown', onKey);
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
  // …where they were dropped (2.10); and text dropped from anywhere becomes words on the page
  stage.addEventListener('drop', async (e) => {
    if (!sk) return;
    e.preventDefault(); e.stopPropagation();
    const at = sketchPoint(e), dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) { await sketchImport(await sketchItemsFromFiles(dt.files), at); return; }
    const text = dt ? dt.getData('text/plain') : '';
    if (text && text.trim()) addSketchText(text, at);
  });
  // where a paste lands (sketchPastePoint)
  stage.addEventListener('pointermove', (e) => { if (sk) sk.at = { x: e.clientX, y: e.clientY }; });
  // a double-click on words types in them; on a picture, edits it
  svg.addEventListener('dblclick', (e) => {
    if (!sk || !['select', 'text'].includes(state.settings.sketchPen.tool)) return;
    const hit = sketchHit(sketchPoint(e));
    if (hit && hit.text != null) openSketchText(hit, hit);
    else if (hit && hit.url) editSketchPicture(hit);
  });
  // what can change the system clipboard behind the app's back (onSketchPaste)
  window.addEventListener('blur', () => { sysClipAt = performance.now(); });
  const typedCopy = (e) => { if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) sysClipAt = performance.now(); };
  document.addEventListener('copy', typedCopy, true);
  document.addEventListener('cut', typedCopy, true);
  svg.addEventListener('pointerdown', onSketchDown);
  svg.addEventListener('contextmenu', (e) => e.preventDefault());   // the pen's button is the eraser here
  skSurface = zoomPanSurface($('skStage'), {
    get: () => (sk ? sk.view : { x: 0, y: 0, z: 1 }), set: setSketchView,
    min: 0.05, max: 12, cancel: cancelSketchStroke
  });
  $('skTitle').addEventListener('input', () => {
    if (!sk) return;
    sk.changed = sk.dirty = true;
    clearTimeout(sk.titleTimer);
    sk.titleTimer = setTimeout(commitSketch, 600);      // typing settles, then it is saved
  });
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
  ctx.fillStyle = skPaper() ? skPaper().ink : pal.noteInk(n.color);
  ctx.font = `600 15px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(s.title || t('sketch.untitled'), n.x + 14, n.y + 34 / 2 + 2, n.w - 28);
  const b = sketchBounds(s.strokes, s.pics, s.texts);
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
    // on a fixed paper the ink is its literal colour, as on screen (3.0)
    const ink = (c) => sketchInkHex(c) || inkColor(c);
    for (const x of s.texts || []) paintSketchTextOnCanvas(ctx, x, ink(x.color));
    paintInkOnCanvas(ctx, s.strokes, ink);
  }
  ctx.restore();
}
