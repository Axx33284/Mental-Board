/* Mental Board — far.js
   The far-zoom canvas: the notes and ropes of a big board drawn on one <canvas>.

   After links.js. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4c. */
/* ─────────────── 10b. the far-zoom canvas (2.11) ───────────────
   Below FAR_Z a big board used to be thousands of DOM stubs — a coloured box
   and the ghost of its text as gradient layers — and a rope layer of two
   thousand SVG paths. Nothing in the script was slow any more (2.10); what was
   left was the browser rasterising all of that again at every new scale,
   ~80% of a zoom frame on the 3,000-note board.

   So now nothing of that is in the document. One viewport-sized <canvas>
   inside #world, between the ropes and the notes, draws every note that has
   no element — its colour, its place, its status and date pills and the same
   ghost (items.js ghostBars) — and, below FAR_Z, every rope. It is redrawn
   from the model once per frame that needs it; a zoom frame is one canvas
   draw and one composite, not a re-raster of the board.

   What still is an element draws itself over the canvas: the note being
   edited, anything a gesture is holding, pictures and drawing notes (never
   stubbed, see makeNote), and the frames, which sit under it. Between FAR_Z
   and 1× the canvas also stands in for notes that are on screen but not yet
   mounted — mountSome() in view.js finishes a few per frame — so leaving far
   zoom reads as the board coming into focus, not as a stall.

   The canvas never takes the pointer. A press that lands on no element asks
   farNoteAt() / farRopeAt() what is drawn there (init.js), and everything a
   note can do at far zoom — click, Shift+click, drag, lasso, double-click,
   right-click, link — then runs the ordinary code with that note's id. None
   of it needs an element: the gesture engine already guards `els.get()`
   because culling unmounts notes, and the canvas follows the model on the
   next frame. */
let farCv = null, farCtx = null;
let farRaf = 0;
let farShown = false;
let farLastDraw = 0;            // ms the last draw took, for the tests and MAP §4c

function farCanvas() {
  if (farCv && farCv.isConnected) return farCv;
  farCv = document.createElement('canvas');
  farCv.id = 'farCanvas';
  farCv.setAttribute('aria-hidden', 'true');
  farCv.style.display = 'none';
  // under the notes and over the ropes' SVG; the frames are under both
  $('world').insertBefore(farCv, $('notesLayer'));
  farCtx = farCv.getContext('2d', { alpha: true });
  farShown = false;
  return farCv;
}

/* One draw per frame however many things ask. A sweep that is about to run
   (cullRaf) draws at its end, after it has mounted and unmounted, so the
   canvas never draws the frame before the document catches up. */
function requestFar() {
  if (!culling && !farShown) return;
  if (farRaf) return;
  farRaf = requestAnimationFrame(() => { farRaf = 0; if (!cullRaf) drawFar(); });
}
function hideFar() {
  if (!farShown) return;
  farShown = false;
  farCv.style.display = 'none';
}

/* ---- the colours, read from the stylesheet ----
   The canvas has to look like the DOM stub it replaces, in twenty themes,
   pinned paper, a custom palette and any hex on a note. Rather than restate
   all of that in JS, a probe — a real `.note` with a ghost and the pills in
   it — is put in the notes layer for an instant and its computed colours are
   read back. Cached per colour; applyTheme()/applySettings()/applyBoardLook()
   drop the cache. */
let farPalCache = null;
function forgetFarPalette() { farPalCache = null; requestFar(); }
function farProbe(build) {
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:-99999px;visibility:hidden;pointer-events:none';
  host.innerHTML = build;
  $('notesLayer').appendChild(host);
  return host;
}
function farPal() {
  if (farPalCache) return farPalCache;
  const host = farProbe(
    '<i class="fp-accent" style="color:var(--accent)"></i>' +
    '<svg><g><path class="lk-line" d="M0 0"></path><circle class="lk-dot" r="3.5"></circle></g></svg>');
  const ac = getComputedStyle(host.querySelector('.fp-accent')).color;
  const lc = getComputedStyle(host.querySelector('.lk-line'));
  const dc = getComputedStyle(host.querySelector('.lk-dot'));
  farPalCache = {
    accent: ac,
    rope: {
      color: lc.stroke, alpha: +lc.opacity || .72, width: parseFloat(lc.strokeWidth) || 2,
      cap: lc.strokeLinecap || 'butt', dash: lc.strokeDasharray && lc.strokeDasharray !== 'none'
        ? lc.strokeDasharray.split(/[\s,]+/).map(parseFloat).filter((x) => x >= 0) : null,
      dot: dc.fill && dc.fill.startsWith('url') ? lc.stroke : dc.fill, dotA: +dc.opacity || .9,
      dotR: parseFloat(dc.r) || 3.5
    },
    notes: new Map(),
    inks: new Map(),
    pills: new Map()
  };
  host.remove();
  return farPalCache;
}
// a note's colours: fill, border, corner, the stripe down its left, and the ghost's ink
function farNoteColors(c) {
  const pal = farPal();
  const k = c || 'default';
  let v = pal.notes.get(k);
  if (v) return v;
  const host = farProbe('<div class="note" data-stub="1"><div class="note-ghost"></div></div>');
  const el = host.firstChild;
  paintColor(el, c, 'default');
  const cs = getComputedStyle(el), st = getComputedStyle(el, '::before');
  v = {
    bg: cs.backgroundColor, line: cs.borderTopColor, lw: parseFloat(cs.borderTopWidth) || 0,
    r: parseFloat(cs.borderTopLeftRadius) || 0,
    stripe: st.content !== 'none' && +st.opacity > 0 ? st.backgroundColor : '', stripeA: +st.opacity || 0,
    ghost: getComputedStyle(el.firstChild).color
  };
  host.remove();
  pal.notes.set(k, v);
  return v;
}
// one of the note colours as a plain colour (a status, a rope's own colour)
function farInk(c) {
  const pal = farPal();
  let v = pal.inks.get(c);
  if (v) return v;
  const host = farProbe(`<i style="color:${isHex(c) ? c : `var(--c-${COLORS.includes(c) ? c : 'default'}-c)`}"></i>`);
  v = getComputedStyle(host.firstChild).color;
  host.remove();
  pal.inks.set(c, v);
  return v;
}
// a pill's look: what its fill, border and dot are, for a status colour or a date's state
function farPill(kind) {
  const pal = farPal();
  let v = pal.pills.get(kind);
  if (v) return v;
  const [type, val] = kind.split(':');
  const host = farProbe(type === 'date'
    ? `<div class="note-status"><button class="nd-pill ${val}"></button></div>`
    : '<div class="note-status"><button class="ns-pill"><span class="ns-dot"></span></button></div>');
  const b = host.querySelector('button');
  if (type !== 'date') paintColor(b, val, 'default');
  const cs = getComputedStyle(b);
  v = { bg: cs.backgroundColor, line: cs.borderTopColor, r: parseFloat(cs.borderTopLeftRadius) || 0,
        dot: type === 'date' ? '' : getComputedStyle(b.firstChild).backgroundColor, alpha: +cs.opacity || 1 };
  host.remove();
  pal.pills.set(kind, v);
  return v;
}

/* ---- the ropes, as paths kept between frames ----
   A rope only changes when one of its notes moves, its colour does, or the
   rope settings do, so its Path2D is kept — for the hit test — and all of
   them are joined into one path per colour, stroked in one call. On a pan or
   a zoom nothing here is rebuilt; a drag rebuilds what it moves and joins the
   set again. Two thousand separate strokes were ~5 ms of a fit-everything
   frame. */
const farRopes = new Map();     // link id -> { ax…bh: the two boxes it was drawn for, style, color, path, p1, p2, x0…y1 }
let farRopeVer = 0;             // bumped whenever any rope is rebuilt or recoloured
let farRopeSet = null;          // { ver, links, n, pal, colors: Map(css -> { line, dots }) }
function farRopeStyle() {
  return (corkMode() ? 'cork' : state.settings.linkStyle) + '|' + state.settings.linkAnchor;
}
function farRopeOf(l, byId, style) {
  const a = byId.get(l.from), b = byId.get(l.to);
  if (!a || !b) return null;
  let r = farRopes.get(l.id);
  if (r && r.style === style && r.ax === a.x && r.ay === a.y && r.aw === a.w && r.ah === a.h &&
      r.bx === b.x && r.by === b.y && r.bw === b.w && r.bh === b.h) {
    if (r.color !== l.color) { r.color = l.color; farRopeVer++; }
    return r;
  }
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const p1 = anchor(a, cb), p2 = anchor(b, ca);
  let path;
  try { path = new Path2D(ropePath(p1, p2, a, b)); } catch (_) { path = new Path2D(); }
  r = { ax: a.x, ay: a.y, aw: a.w, ah: a.h, bx: b.x, by: b.y, bw: b.w, bh: b.h, style, color: l.color, path, p1, p2,
        x0: Math.min(a.x, b.x) - ROPE_SLACK, y0: Math.min(a.y, b.y) - ROPE_SLACK,
        x1: Math.max(a.x + a.w, b.x + b.w) + ROPE_SLACK, y1: Math.max(a.y + a.h, b.y + b.h) + ROPE_SLACK };
  farRopes.set(l.id, r);
  farRopeVer++;
  return r;
}
const farRopeColor = (l, pal) => (linkColorCss(l.color) ? farInk(l.color) : pal.color);
// every rope on the board, joined per colour; rebuilt only when one of them changed
function farRopePaths(byId, style, pal, pinned) {
  const ver = farRopeVer;
  for (const l of state.links) farRopeOf(l, byId, style);
  const s = farRopeSet;
  if (s && farRopeVer === ver && s.ver === ver && s.links === state.links && s.n === state.links.length && s.pal === pal) return s.colors;
  const colors = new Map();
  const rad = corkMode() ? 7 : pal.dotR;
  for (const l of state.links) {
    const r = farRopes.get(l.id);
    if (!r || !byId.has(l.from) || !byId.has(l.to)) continue;
    const c = farRopeColor(l, pal);
    let g = colors.get(c);
    if (!g) colors.set(c, g = { line: new Path2D(), dots: pinned ? new Path2D() : null });
    g.line.addPath(r.path);
    if (g.dots) {
      g.dots.moveTo(r.p1.x + rad, r.p1.y); g.dots.arc(r.p1.x, r.p1.y, rad, 0, 6.2832);
      g.dots.moveTo(r.p2.x + rad, r.p2.y); g.dots.arc(r.p2.x, r.p2.y, rad, 0, 6.2832);
    }
  }
  farRopeSet = { ver: farRopeVer, links: state.links, n: state.links.length, pal, colors };
  return colors;
}
function drawFarRopes(ctx, byId, V, z, only) {
  const pal = farPal().rope;
  const style = farRopeStyle();
  const pinned = state.settings.linkAnchor === 'top' || corkMode();
  // the few ropes of the selection, drawn again over the notes, are stroked one by one
  const groups = new Map();
  if (only) {
    for (const l of state.links) {
      if (!only.has(l.id)) continue;
      const r = farRopeOf(l, byId, style);
      if (!r || r.x0 > V.x1 || r.x1 < V.x0 || r.y0 > V.y1 || r.y1 < V.y0) continue;
      const c = farRopeColor(l, pal);
      let g = groups.get(c);
      if (!g) groups.set(c, g = []);
      g.push(r);
    }
    if (!groups.size) return;
  }
  const all = only ? null : farRopePaths(byId, style, pal, pinned);
  ctx.save();
  /* World units, as the SVG ropes were: their non-scaling stroke only undoes
     the SVG's own transform, not #world's CSS scale, so at 0.12× a 2px rope
     was a quarter of a pixel — a faint thread under the notes, not a cable
     over them. */
  ctx.lineWidth = only ? pal.width + 1 : pal.width;
  ctx.lineCap = pal.cap;
  ctx.setLineDash(pal.dash || []);
  ctx.globalAlpha = focusKind ? .15 : (only ? .95 : pal.alpha);
  if (only) {
    groups.forEach((rs, c) => {
      ctx.strokeStyle = c;
      for (const r of rs) ctx.stroke(r.path);
    });
  } else {
    all.forEach((g, c) => { ctx.strokeStyle = c; ctx.stroke(g.line); });
    if (pinned) {
      ctx.setLineDash([]);
      ctx.globalAlpha = focusKind ? .15 : pal.dotA;
      all.forEach((g, c) => { ctx.fillStyle = corkMode() ? '#c0392b' : c; ctx.fill(g.dots); });
    }
  }
  ctx.restore();
}

/* ---- a note ---- */
const FAR_GC = [.09, .38, .68, .90];          // --gc0..3 in mental.css §66
function drawFarNote(ctx, n, z, dpr, wordsOn) {
  const col = farNoteColors(n.color);
  const form = okForm(n.form);
  const shape = form ? formPath2D(n, form) : null;
  const tilt = corkMode() ? tiltOf(n.id) : 0;
  const dim = focusKind && !noteMatchesFocus(n);
  // save/restore only for what needs undoing — a turn, a clip; per note they were 2 ms a frame
  const saved = tilt || shape;
  if (saved) ctx.save();
  ctx.globalAlpha = dim ? .12 : 1;
  if (tilt) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    ctx.translate(cx, cy); ctx.rotate(tilt * Math.PI / 180); ctx.translate(-cx, -cy);
  }
  // the card
  const r = col.r * z * dpr >= 1 ? col.r : 0;
  ctx.fillStyle = col.bg;
  if (shape) ctx.fill(shape);
  else if (r) { ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, n.h, r); ctx.fill(); }
  else ctx.fillRect(n.x, n.y, n.w, n.h);
  const big = Math.min(n.w, n.h) * z * dpr;    // device px across its short side
  /* The border, down to an eighth of a pixel: on a light theme it is all that
     separates a white note from the white page, and the DOM drew it that thin
     too. Below that only the batched tiny notes are left anyway. */
  if (col.lw && col.lw * z * dpr >= .12) {
    ctx.strokeStyle = col.line; ctx.lineWidth = col.lw;
    if (shape) ctx.stroke(shape);
    else { ctx.beginPath(); ctx.roundRect(n.x + col.lw / 2, n.y + col.lw / 2, n.w - col.lw, n.h - col.lw, r); ctx.stroke(); }
  }
  if (col.stripe && !shape && n.h > 24 && 3 * z * dpr >= .5) {
    ctx.globalAlpha = (dim ? .12 : 1) * col.stripeA;
    ctx.fillStyle = col.stripe;
    ctx.fillRect(n.x + col.lw, n.y + col.lw + 10, 3, n.h - col.lw * 2 - 20);
    ctx.globalAlpha = dim ? .12 : 1;
  }
  if (big > 10) {
    const gx = n.x + col.lw, gy = n.y + col.lw;
    if (shape) ctx.clip(shape);
    const done = !!(statusOf(n) || {}).done;
    const g = ghostBars(n);
    ctx.fillStyle = col.ghost;
    // one path per shade, so a note is at most four fills whatever it holds
    for (let a = 0; a < 4; a++) {
      let any = false;
      ctx.beginPath();
      for (const b of g.bars) {
        if (b.a !== a) continue;
        any = true;
        if (!b.words || !wordsOn) { ctx.rect(gx + b.x, gy + b.y, b.w, b.h); continue; }
        for (let i = 0; i < b.words.length; i += 2) {
          const s = b.words[i], e = Math.min(b.words[i + 1], b.w);
          if (s >= b.w) break;
          ctx.rect(b.rtl ? gx + b.x + b.w - e : gx + b.x + s, gy + b.y, e - s, b.h);
        }
      }
      if (!any) continue;
      ctx.globalAlpha = (dim ? .12 : 1) * FAR_GC[a] * (done ? .55 : 1);
      ctx.fill();
    }
    ctx.globalAlpha = dim ? .12 : 1;
    if (20 * z * dpr >= 3.5) drawFarPills(ctx, n, col);     // a pill under four pixels tall is a speck
  }
  if (selection.has(n.id)) {
    // two screen pixels whatever the zoom: a 2px ring at 0.1× is a fifth of a pixel
    ctx.globalAlpha = 1;
    ctx.strokeStyle = farPal().accent; ctx.lineWidth = 2 / z;
    if (shape) ctx.stroke(shape);
    else { ctx.beginPath(); ctx.roundRect(n.x - 1 / z, n.y - 1 / z, n.w + 2 / z, n.h + 2 / z, r + 1 / z); ctx.stroke(); }
  }
  if (saved) ctx.restore();
  ctx.globalAlpha = 1;
}
function drawFarTiny(ctx, groups, z, dpr) {
  ctx.save();
  const ring = [];
  groups.forEach((g) => {
    const col = farNoteColors(g.color);
    const round = col.r * z * dpr >= 1.5;
    const dim = g.dim ? .12 : 1;
    /* fillRect, not one path of rects: the GPU draws a run of rectangles as
       quads in a batch, but a single path of thirty thousand of them has to
       be tessellated — 7 ms of script either way, and 6 or 25 ms of frame. */
    ctx.globalAlpha = dim;
    ctx.fillStyle = col.bg;
    if (round) {
      ctx.beginPath();
      for (const n of g.notes) ctx.roundRect(n.x, n.y, n.w, n.h, col.r);
      ctx.fill();
    } else for (const n of g.notes) ctx.fillRect(n.x, n.y, n.w, n.h);
    for (const n of g.notes) if (selection.has(n.id)) ring.push(n);
    // the ghost's lines, whole (a word is under a pixel here): it still reads as a board of writing
    ctx.fillStyle = col.ghost;
    for (let a = 0; a < 4; a++) {
      ctx.globalAlpha = dim * FAR_GC[a];
      for (const n of g.notes) {
        if (Math.min(n.w, n.h) * z * dpr < 4) continue;          // a speck; its lines would be noise
        const gx = n.x + col.lw, gy = n.y + col.lw;
        for (const b of ghostBars(n).bars) if (b.a === a) ctx.fillRect(gx + b.x, gy + b.y, b.w, b.h);
      }
    }
  });
  if (ring.length) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = farPal().accent; ctx.lineWidth = 2 / z;
    ctx.beginPath();
    for (const n of ring) ctx.rect(n.x - 1 / z, n.y - 1 / z, n.w + 2 / z, n.h + 2 / z);
    ctx.stroke();
  }
  ctx.restore();
}
// the status and date pills, bottom-left where the DOM puts them (later.css §31, mental.css)
const farPillW = new Map();
function drawFarPills(ctx, n, col) {
  const s = statusOf(n), date = okDateKey(n.date);
  if (!s && !date) return;
  const pad = (state.settings.notePad || PAD_PRESETS.cosy);
  let x = n.x + col.lw + pad.l;
  const y = n.y + n.h - col.lw - Math.max(0, pad.b - 3) - 20;
  const pill = (p, w) => {
    if (x + w > n.x + n.w - col.lw) w = n.x + n.w - col.lw - x;
    if (w < 8) return;
    ctx.save();
    ctx.globalAlpha *= p.alpha;
    ctx.fillStyle = p.bg; ctx.strokeStyle = p.line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x + .5, y + .5, w - 1, 19, Math.min(p.r, 10)); ctx.fill(); ctx.stroke();
    if (p.dot) { ctx.fillStyle = p.dot; ctx.beginPath(); ctx.arc(x + 11.5, y + 10, 3.5, 0, 6.2832); ctx.fill(); }
    ctx.restore();
    x += w + 6;
  };
  const textW = (label) => {
    let w = farPillW.get(label);
    if (w == null) {
      ctx.save(); ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
      w = ctx.measureText(label).width; ctx.restore();
      if (farPillW.size > 500) farPillW.clear();
      farPillW.set(label, w);
    }
    return w;
  };
  if (s) pill(farPill('status:' + (s.color || 'default')), textW(statusName(s)) + 7 + 6 + 16 + 2);
  if (date) pill(farPill('date:' + (dateState(n) || 'plain')), textW(dateLabel(date)) + 12 + 5 + 15 + 2);
}

/* ---- the draw ---- */
function drawFar() {
  if (farRaf) { cancelAnimationFrame(farRaf); farRaf = 0; }
  if (!culling || !$('world')) { hideFar(); return; }
  const t0 = performance.now();
  const r = vpRect(), v = state.view, z = v.z;
  const V = { x0: -v.x / z, y0: -v.y / z, x1: (r.width - v.x) / z, y1: (r.height - v.y) / z };
  // a tilted card on pinned paper can poke a little past its box
  const m = corkMode() ? 12 : 2;
  const list = [];
  for (const n of state.notes) {
    if (n.x - m > V.x1 || n.x + n.w + m < V.x0 || n.y - m > V.y1 || n.y + n.h + m < V.y0) continue;
    if (n.pic || n.sketch || els.has(n.id)) continue;     // an element draws itself
    list.push(n);
  }
  const ropes = farMode && state.links.length > 0;
  if (!list.length && !ropes) { hideFar(); return; }

  const cv = farCanvas(), ctx = farCtx;
  const dpr = Math.min(window.devicePixelRatio || 1, document.body.dataset.perf === 'lite' ? 1 : 2);
  const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  /* Placed in world units, so the stale picture of a frame that has not been
     redrawn yet still sits on the board where it was drawn — it moves with
     the world's own transform and only ever lags at the edges. */
  cv.style.left = V.x0 + 'px'; cv.style.top = V.y0 + 'px';
  cv.style.width = (r.width / z) + 'px'; cv.style.height = (r.height / z) + 'px';
  if (!farShown) { cv.style.display = ''; farShown = true; }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * v.x, dpr * v.y);
  const byId = ropes ? noteIndex() : null;
  if (ropes && !corkMode()) drawFarRopes(ctx, byId, V, z);
  if (list.length > 1) list.sort((a, b) => (a.z || 0) - (b.z || 0));
  // what a drag is carrying is on top, as `.note.dragging` is
  if (gesture && gesture.ids && gesture.kind === 'move') {
    const held = list.filter((n) => gesture.ids.has(n.id));
    if (held.length) { const rest = list.filter((n) => !gesture.ids.has(n.id)); list.length = 0; list.push(...rest, ...held); }
  }
  // a space under half a pixel wide is no gap at all; the line is drawn whole
  const wordsOn = z * dpr * 4.3 >= .45;
  /* A note a few pixels across is a coloured box with its lines whole — no
     words, no pills, a border thinner than a pixel — so those are drawn
     together, a colour at a time (drawFarTiny), rather than a note at a time:
     at fit-everything that is three thousand of them a frame. */
  const tiny = new Map();
  for (const n of list) {
    if (Math.min(n.w, n.h) * z * dpr > 12 || n.form || corkMode()) { drawFarNote(ctx, n, z, dpr, wordsOn); continue; }
    const dim = focusKind && !noteMatchesFocus(n);
    const k = (n.color || 'default') + (dim ? '\n' : '');
    let g = tiny.get(k);
    if (!g) tiny.set(k, g = { color: n.color, dim, notes: [] });
    g.notes.push(n);
  }
  if (tiny.size) drawFarTiny(ctx, tiny, z, dpr);
  if (ropes && corkMode()) drawFarRopes(ctx, byId, V, z);
  // the ropes of a small selection, over the notes, as #ropesTop does (links.js drawHotRopes)
  if (ropes && selection.size && selection.size <= HOT_MAX) {
    const hot = new Set();
    for (const l of state.links) if (selection.has(l.from) || selection.has(l.to)) hot.add(l.id);
    if (hot.size) drawFarRopes(ctx, byId, V, z, hot);
  }
  farLastDraw = performance.now() - t0;
}

/* ---- what is under the pointer ----
   Only for what the canvas drew: a press on an element never gets here. The
   topmost note wins, as the DOM's z-order would have it. */
function farNoteAt(clientX, clientY) {
  if (!farShown) return null;
  const p = toWorld(clientX, clientY);
  let best = null;
  for (const n of state.notes) {
    if (p.x < n.x || p.x > n.x + n.w || p.y < n.y || p.y > n.y + n.h) continue;
    if (n.pic || n.sketch || els.has(n.id)) continue;
    if (!best || (n.z || 0) >= (best.z || 0)) best = n;
  }
  return best;
}
// a rope near the pointer, at far zoom where the ropes are on the canvas
function farRopeAt(clientX, clientY) {
  if (!farShown || !farMode || !farCtx) return null;
  const p = toWorld(clientX, clientY), z = state.view.z;
  const slack = 8 / z;                          // .lk-hit is 16px wide, so 8 either side
  const ctx = farCtx;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.lineWidth = slack * 2;
  let hit = null;
  for (let i = state.links.length - 1; i >= 0 && !hit; i--) {
    const l = state.links[i], r = farRopes.get(l.id);
    if (!r || p.x < r.x0 - slack || p.x > r.x1 + slack || p.y < r.y0 - slack || p.y > r.y1 + slack) continue;
    if (ctx.isPointInStroke(r.path, p.x, p.y)) hit = l;
  }
  ctx.restore();
  return hit;
}
