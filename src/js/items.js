/* Mental Board — items.js
   Note and frame elements, the one drag/resize gesture engine, selection, and the camera.

   Part 6 of 22. These files are plain scripts sharing one global
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

/* A note, in two halves — and the split is what makes fit-everything zoom
   survivable on a big board.

   Culling stops helping at exactly the zoom where it is needed most: put the
   whole board on screen and every note is "visible", so every note mounts. At
   3,000 notes that was one 330ms freeze on the gesture people use most to get
   their bearings — measured, on a fast machine. `body.far-zoom` already hid the
   text, the head and the handles with `display: none`, but hiding them happens
   *after* they have been built: the markup was parsed, four icons were drawn,
   eight handles were created and about a dozen listeners were attached, for
   three thousand notes, so that CSS could then decline to paint any of it.

   Below FAR_Z a note is therefore built as a **stub**: the div, its colour, its
   place, and the status pill — which is the one child far-zoom does *not* hide,
   because a coloured pill is a landmark. Nothing else. fillNote() adds the rest,
   and it runs on the way back in.

   The rule that keeps this from becoming a trap: **a stub is only ever created
   while `farMode` is true, and anything that needs a note's insides goes
   through `ensureMounted()`, which fills one before handing it back.** That was
   already the contract for culled items (MAP.md §4c) — this widens it from "the
   element may not exist" to "the element may not be finished yet", and the same
   one call answers both. */
function makeNote(n, stub) {
  const el = document.createElement('div');
  el.className = 'note';
  el.dataset.id = n.id;
  paintColor(el, n.color, 'default');
  el.style.setProperty('--tilt', tiltOf(n.id) + 'deg');   // read only on a pinned board (mental.css §62)
  el.style.zIndex = String(n.z || 1);
  placeEl(el, n);
  /* A picture is one <img> and eight handles — cheaper than a stub would be
     worth, and a blank rectangle where a picture was reads as a broken board.
     Never stubbed. See pictures.js. */
  if (n.pic) { fillPicture(el, n); return el; }
  if (n.sketch) { fillSketch(el, n); return el; }     // a drawing note, never stubbed either (sketch.js)
  if (stub) { stubNote(el, n); return el; }
  fillNote(el, n);
  return el;
}

/* Everything makeNote() used to do inline. Called straight away for an ordinary
   mount, and later for a stub the view zoomed back in on. Safe to call twice:
   it replaces the whole subtree, so the listeners go with the nodes they were
   on and nothing is bound to the same element twice. */
/* A note's tilt on a pinned board: a degree or so either way, the same every
   time for the same note, so the board does not reshuffle on every render. */
function tiltOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.round(((((h >>> 0) % 1000) / 1000) * 3.2 - 1.6) * 100) / 100;
}

function fillNote(el, n) {
  if (n.pic) { fillPicture(el, n); return; }
  if (n.sketch) { fillSketch(el, n); return; }
  delete el.dataset.stub;
  /* No head, since 2.1. A note used to carry a row of five controls on its top
     edge — grip, icon, link, more, delete — that appeared on hover. Every one
     of them was already in the right-click menu, the whole note is the drag
     handle (onPointerDown starts a move anywhere on a closed note), and the
     row cost 24px of every note's height and a flicker on every hover. What it
     showed rather than did — the reminder — is a pill in the status row now.

     The icon badge stays: it is something the user put on the note, not
     chrome. Changing it is the right-click menu's "Icon" row. */
  el.innerHTML =
    `<div class="note-icon"></div>
     <div class="note-body" dir="auto" spellcheck="${state.settings.spell}"></div>
     <div class="note-status hidden"></div>
     ${rzHtml()}`;
  paintNoteIcon(el, n);
  paintNoteStatus(el, n);
  const body = el.querySelector('.note-body');
  body.innerHTML = n.body || '';
  lazyImages(body);
  paintCodeBlocks(body);
  paintEmbeds(body);              // the card, not the player; see the embeds block
  wireNoteBody(body, n, el);
  paintForm(el, n);               // a heart, a cloud… and where the writing sits (shapes.js)
}

/* Every picture in a note decodes off the main thread and is not fetched at
   all until the note is near the screen. Set on the element rather than in
   the stored markup, so a board written by 1.x gets it too and nothing about
   what is saved changes. A big board of screenshots used to decode every one
   of them on the first paint. */
function lazyImages(root) {
  if (!root) return;
  root.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');
  });
  watchVideos(root);          // every body that is drawn passes through here
  paintMath(root);            // and so does every formula in it (editor.js)
  paintDatabases(root);       // every database (database.js)
  paintTocs(root);            // and every table of contents (editor.js)
}

/* Redraw a note's text from `n.body` without rebuilding the whole element —
   after a history restore, after its pictures were re-addressed. A stub has
   no body to draw into and is left for unstub(); a picture is all body, so it
   is rebuilt outright. */
function repaintNoteBody(el, n) {
  if (!el || !n || el.dataset.stub) return;
  if (n.pic || n.sketch) { fillNote(el, n); return; }
  const body = el.querySelector('.note-body');
  if (!body) return;
  body.innerHTML = n.body || '';
  lazyImages(body);
  paintCodeBlocks(body);
  paintEmbeds(body);
}

/* Finish a note that was mounted as a stub. Returns the element either way, so
   callers can chain. */
function unstub(el, n) {
  if (el && el.dataset && el.dataset.stub && n) fillNote(el, n);
  return el;
}

/* The inside of a stub: the ghost of the text, and the status pill. Also how a
   finished note goes back to being a stub when the view zooms out past FAR_Z
   (applyFarMode) — without that, every note that was already on screen kept
   its whole body in the document only for CSS to hide it, which is both the
   heavy case and the blank one. */
function stubNote(el, n) {
  el.dataset.stub = '1';
  el.innerHTML = '<div class="note-ghost"></div><div class="note-status hidden"></div>';
  paintForm(el, n);
  el.firstChild.style.background = noteGhost(n);
  paintNoteStatus(el, n);
}

/* ---- the ghost of a note's text (2.2) ----
   A stub used to be a blank coloured rectangle, and a board of blanks reads
   as a board that failed to load. Real text at 0.3× is worse: two-pixel
   glyphs, laid out and rasterised for nothing anybody can read.

   So a stub draws what text looks like from across the room — each line of
   the note's real words, wrapped where they really wrap, a dash per word with
   the gaps where the spaces are, headings taller and darker, a dot before a
   bullet, a box before a to-do, a block where a picture is. It is **one
   element** whatever the note holds: every bar is a layer of that element's
   own background (one gradient per line, a hard-edged stop pair per word), so there is
   no text layout, no glyphs and no extra nodes — the browser paints a few
   flat rectangles, which is the cheapest thing it can do.

   The lines come from the stored HTML through a tokeniser (no DOM parse: the
   first zoom-out on a 3,000-note board reads every one of them), wrapped
   against the note's width at the board's own font size, density and face,
   so a ghost stands where its text will be when you zoom back in and the
   change reads as the board coming into focus. Bars are `currentColor`
   mixed down, so they follow the theme and a dark note. Cached per note on
   everything that changes the shape. */
const GHOST_MAX = 3000;
const ghostCache = new Map();
const GHOST_TAG = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
const GHOST_BLOCK = /^(p|div|li|h[1-6]|blockquote|pre|tr|ul|ol|br|hr|img|table)$/;
const GHOST_CH = { mono: .6, wide: .58, narrow: .45, hand: .48 };   // average glyph width in ems
const GHOST_RTL = /^[^A-Za-zÀ-ɏ֐-ࣿיִ-ﻼ]*[֐-ࣿיִ-ﻼ]/;

// the note's blocks, in order: { k: kind, n: characters, words: [lengths], lead, rtl, done }
function ghostBlocks(html) {
  const out = [];
  let cur = null, todo = 0, quote = 0, pre = 0, text = '';
  const flush = () => {
    if (!cur) return;
    const raw = text.replace(/&[#a-z0-9]+;/gi, 'x');
    // code keeps its own line breaks; everything else is one run of words
    const parts = cur.k === 'code' ? raw.split('\n') : [raw];
    for (const part of parts) {
      const s = cur.k === 'code' ? part.replace(/\s+$/, '') : part.replace(/\s+/g, ' ').trim();
      if (s || cur.k === 'todo' || cur.k === 'li' || cur.k === 'code') {
        // the words, as lengths: a line of the ghost is these, with the gaps between
        const lead = cur.k === 'code' ? s.length - s.replace(/^\s+/, '').length : 0;
        const words = s.trim() ? s.trim().split(/\s+/).map((w) => w.length) : [];
        out.push({ k: cur.k, done: cur.done, n: s.length, words, lead, rtl: GHOST_RTL.test(s) });
      }
    }
    cur = null; text = '';
  };
  const open = (k, a) => { flush(); cur = { k, done: / class="[^"]*\bdone\b/.test(a || '') }; };
  let last = 0, m;
  GHOST_TAG.lastIndex = 0;
  while ((m = GHOST_TAG.exec(html))) {
    text += html.slice(last, m.index);
    last = GHOST_TAG.lastIndex;
    const close = m[1] === '/', tag = m[2].toLowerCase(), a = m[3];
    if (!GHOST_BLOCK.test(tag)) continue;
    if (tag === 'ul' || tag === 'ol') {
      flush();
      if (/mb-todo/.test(a)) todo += close ? -1 : 1;
      continue;
    }
    if (tag === 'blockquote') { flush(); quote += close ? -1 : 1; continue; }
    if (tag === 'pre') {
      flush();
      pre += close ? -1 : 1;
      out.push({ k: close ? 'code-end' : 'code-start' });
      if (!close) cur = { k: 'code' };
      continue;
    }
    if (tag === 'img') { flush(); out.push({ k: 'img' }); continue; }
    if (tag === 'hr') { flush(); out.push({ k: 'hr' }); continue; }
    if (tag === 'br') {                // a line break inside a block is another line of it
      if (cur) { const k = cur.k === 'todo' || cur.k === 'li' ? 'p' : cur.k; flush(); cur = { k }; }
      continue;
    }
    if (close) { flush(); continue; }
    open(tag === 'li' ? (todo > 0 ? 'todo' : 'li') :
         /^h[1-3]$/.test(tag) ? tag : pre ? 'code' : quote ? 'quote' : 'p', a);
  }
  text += html.slice(last);
  if (!cur && text.trim()) cur = { k: 'p' };
  flush();
  return out;
}

/* The ghost as geometry (2.11): every bar as { x, y, w, h, a } in px from the
   ghost's own top-left — `a` is which of --gc0..3 it wears — and a line of
   words carries `words`, the start and end of each word along the line, and
   `rtl` when they run from the right. Two things draw it: noteGhost() below
   turns it into the background layers of a DOM stub, and the far-zoom canvas
   (far.js) fills the same rectangles, so the two cannot drift apart. */
function ghostBars(n) {
  const s = state.settings || {};
  const fs = (s.fontScale || 100) / 100;
  const small = document.body.classList.contains('small-text');
  const face = document.body.dataset.notefont || '';
  const pad = ((state.settings || {}).notePad || PAD_PRESETS.cosy).l;
  const key = `${n.w}|${n.h}|${fs}|${small}|${face}|${pad}|${!!n.icon}|${document.body.dataset.cork || ''}`;
  const hit = ghostCache.get(n.id);
  if (hit && hit.body === n.body && hit.key === key) return hit;

  const f = (small ? 12 : 14) * fs;               // the body's font size, world px
  const em = GHOST_CH[face] || .5;
  const x0 = pad, W = Math.max(8, n.w - pad * 2);
  const H = n.h - pad - 12;                        // leave the bottom padding and the pill row
  let y = pad - 2 + 6 + (/cork|wood/.test(document.body.dataset.cork || '') ? 8 : 0);
  const bars = [];
  const bar = (x, yy, w, h, a) => {
    if (yy + h > H || w < 1) return false;
    bars.push({ x, y: yy, w, h, a });
    return true;
  };
  if (n.icon) { bar(x0 - 4, pad - 4, 30, 30, 2); y = pad - 4 + 32; }
  // a deterministic wobble so full lines are not all ruler-straight
  let seed = 0;
  for (let i = 0; i < n.id.length; i++) seed = (seed * 31 + n.id.charCodeAt(i)) | 0;
  const wob = () => { seed = (seed * 1103515245 + 12345) | 0; return ((seed >>> 16) % 1000) / 1000; };

  let codeTop = -1;
  const blocks = ghostBlocks(n.body || '');
  for (let bi = 0; bi < blocks.length && y < H && bars.length < 40; bi++) {
    const b = blocks[bi];
    if (b.k === 'code-start') { codeTop = y; y += .3 * f; continue; }
    if (b.k === 'code-end') {
      if (codeTop >= 0) bars.push({ x: x0, y: codeTop, w: W, h: y - codeTop + .3 * f, a: 0 });
      codeTop = -1; y += .9 * f; continue;
    }
    if (b.k === 'hr') { y += .85 * f; bar(x0, y, W, Math.max(1, f * .08), 0); y += .85 * f; continue; }
    if (b.k === 'img') { const ih = Math.min(W * .56, H - y - 4); if (ih > 6) bar(x0, y + .5 * f, W, ih, 0); y += ih + f; continue; }

    const m = b.k === 'h1' ? 1.62 : b.k === 'h2' ? 1.32 : b.k === 'h3' ? 1.12 : b.k === 'code' ? .875 : 1;
    const head = m > 1.05;
    const fz = f * m, lh = fz * (head ? 1.25 : 1.55);
    const gap = head ? .7 * fz : b.k === 'li' || b.k === 'todo' ? .18 * f : b.k === 'code' ? 0 : .38 * f;
    const ind = b.k === 'li' || b.k === 'todo' ? 1.35 * f : b.k === 'quote' ? .85 * f + 3 : b.k === 'code' ? 12 : 0;
    const bw = W - ind - (b.k === 'code' ? 12 : 0);
    const cpl = Math.max(4, Math.floor(bw / (em * fz)));
    const th = fz * (head ? .72 : .54);            // how thick a line of this text looks
    const alpha = head ? 3 : b.done || b.k === 'quote' ? 1 : 2;
    y += bi ? gap : 0;
    // mirrored for a right-to-left line: the marker and the indent on the right
    const mx = (x, w) => (b.rtl ? x0 * 2 + W - x - w : x);
    const qh = Math.min(H - y, Math.max(lh, Math.ceil(b.n / cpl) * lh) - (lh - fz * .9));
    if (b.k === 'quote') bar(mx(x0, 3), y, 3, qh, 1);
    if (b.k === 'li') bar(mx(x0 + .45 * f, f * .28), y + lh / 2 - f * .14, f * .28, f * .28, 2);
    if (b.k === 'todo') bar(mx(x0 + .2 * f, f * .72), y + lh / 2 - f * .36, f * .72, f * .72, b.done ? 3 : 1);
    /* Wrap the real words at the note's width, then draw each line as **one**
       bar with the words marked along it, so the gaps fall where the spaces
       are. That is what makes it read as text from across the room rather
       than as a rule — the eye picks up word shapes long before it can read a
       letter — and in CSS it costs no more than a plain bar. */
    const cw = em * fz, sp = cw * .62;            // one character, one space
    const lines = [];
    let line = [], used = 0;
    const lead = Math.min(cpl - 4, b.lead || 0);
    for (let wl of b.words) {
      while (wl > 0) {
        const room = cpl - lead - used - (line.length ? 1 : 0);
        if (wl <= room) { line.push(wl); used += wl + (line.length > 1 ? 1 : 0); wl = 0; break; }
        if (line.length && wl <= cpl - lead) { lines.push(line); line = []; used = 0; continue; }
        const part = Math.max(1, room);            // a word longer than the line breaks anywhere
        line.push(part); lines.push(line); line = []; used = 0; wl -= part;
      }
    }
    if (line.length || !lines.length) lines.push(line);
    for (const words of lines) {
      if (words.length) {
        let x = 0;
        const marks = [];
        words.forEach((wl, i) => {
          const w = wl * cw * (.9 + wob() * .2 - .1);
          if (i) x += sp;
          marks.push(x, x + w);
          x += w;
        });
        const w = Math.min(bw - lead * cw, x);
        const bx = mx(x0 + ind + lead * cw, w);
        const yy = y + (lh - th) / 2;
        if (yy + th > H) { y = H; break; }
        bars.push({ x: bx, y: yy, w, h: th, a: alpha, words: marks, rtl: b.rtl });
      }
      y += lh;
    }
  }
  const g = { body: n.body, key, bars, css: null };
  if (ghostCache.size > GHOST_MAX) ghostCache.clear();
  ghostCache.set(n.id, g);
  return g;
}

/* The ghost as the background of a DOM stub's one `.note-ghost` element: a
   layer per bar, and for a line of words one gradient with a hard-edged stop
   pair per word. */
function noteGhost(n) {
  const g = ghostBars(n);
  if (g.css == null) g.css = g.bars.map(ghostLayer).join(',');
  return g.css;
}
function ghostLayer(b) {
  const box = `${b.x.toFixed(1)}px ${b.y.toFixed(1)}px/${b.w.toFixed(1)}px ${b.h.toFixed(1)}px no-repeat`;
  const c = `var(--gc${b.a})`;
  if (!b.words) return `linear-gradient(${c},${c}) ${box}`;
  const stops = [];
  for (let i = 0; i < b.words.length; i += 2) {
    if (i) stops.push(`transparent ${b.words[i - 1].toFixed(1)}px ${b.words[i].toFixed(1)}px`);
    stops.push(`${c} ${b.words[i].toFixed(1)}px ${b.words[i + 1].toFixed(1)}px`);
  }
  return `linear-gradient(${b.rtl ? 'to left' : 'to right'},${stops.join(',')}) ${box}`;
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
  paintColor(el, f.color, 'blue');
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
  paintFrameLock(el, f);
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

/* A workflow locked behind the notes (2.1). It stays exactly where it is and
   stops being something the pointer can catch: a lasso drawn across it picks
   up the notes and not the frame, Ctrl+A leaves it out, its title will not
   drag, and its handles go. That is the whole point — a big workflow is the
   thing a lasso across its notes kept grabbing, and dragging the selection
   then dragged the frame and every note inside it.

   Right-click still reaches it (frameAt() hit-tests by geometry), because
   that is where Unlock is. Stored on the frame as `locked: true`; a frame
   without it is unlocked, so nothing needs healing on load. */
function lockFrame(id) {
  const f = state.frames.find((x) => x.id === id);
  if (!f) return;
  pushUndo();
  if (f.locked) delete f.locked; else f.locked = true;
  const el = els.get(id);
  if (el) paintFrameLock(el, f);
  if (f.locked && selection.has(id)) { selection.delete(id); syncSelectionClasses(); }
  saveSoon();
  toast(t(f.locked ? 'msg.frameLocked' : 'msg.frameUnlocked'));
}
function paintFrameLock(el, f) {
  el.classList.toggle('locked', !!f.locked);
  const t0 = el.querySelector('.frame-title');
  let lk = t0 && t0.querySelector('.ft-lock');
  if (f.locked && t0 && !lk) {
    lk = document.createElement('span');
    lk.className = 'ft-lock';
    lk.innerHTML = icon('lock');
    t0.appendChild(lk);
  } else if (!f.locked && lk) lk.remove();
}
// what a lasso, Ctrl+A or a click on a title can pick up
const frameSelectable = (f) => !f.locked;

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

/* One pass over the notes, not one per frame.

   This runs on every animation frame of a pan (syncMounted calls it), and it
   used to call notesInFrame() per frame — which is `state.notes.filter(...)`,
   so a board with a dozen workflows on screen walked every note a dozen times
   and allocated a dozen arrays, sixty times a second, to write a number that
   almost never changes. Counting into a map costs one walk and no arrays.

   Only mounted frames are counted, as before: an unmounted one has nothing to
   write the number into, and it gets its count when it mounts. */
function refreshFrameCounts() {
  const live = [];
  for (const f of state.frames) {
    const el = els.get(f.id);
    if (!el) continue;
    const cnt = el.querySelector('.frame-count');
    if (cnt) live.push({ f, cnt, n: 0 });
  }
  if (!live.length) return;
  for (const n of state.notes) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    for (const e of live) {
      const f = e.f;
      if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) e.n++;
    }
  }
  for (const e of live) e.cnt.textContent = e.n ? `· ${num(e.n)}` : '';
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

/* A gesture is anchored to the board, not to the screen (2.4.1).

   Every gesture used to remember where the press was *on screen* and the zoom
   at that moment, and turn the pointer's screen travel into world travel with
   that frozen zoom. Correct until the camera moves under the pointer — a wheel
   zoom or a wheel pan in the middle of a drag, which the app has always
   allowed. Then a note dragged at 100% and zoomed out to 50% moved half as far
   as the pointer from then on and slid away from under it; a lasso's first
   corner stayed on the screen while the board moved beneath it; a pan threw
   the zoom's own translation away on the next pointermove.

   So the press is kept as the world point under it (`w0`), each move is
   measured as world point minus `w0`, and the camera telling us it moved
   (`followCamera()`, from applyView) replays the last pointer event, so the
   thing being dragged stays under the pointer even when the pointer itself
   is still. A pan is the one gesture that *is* the camera: it runs on its
   own increments and is never replayed. */
function gestureDelta(g, e) {
  const w = toWorld(e.clientX, e.clientY);
  return { dx: w.x - g.w0.x, dy: w.y - g.w0.y };
}
let replaying = false;
function followCamera() {
  if (replaying) return;
  replaying = true;
  try {
    if (gesture && gesture.kind !== 'pan' && gesture.last) onGestureMove(gesture.last);
    if (typeof followInkCamera === 'function') followInkCamera();
  } finally { replaying = false; }
}

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
  const min = minOf(state.notes, (x) => x.z || 1, 1);
  n.z = min - 1;
  const el = els.get(id);
  if (el) el.style.zIndex = String(n.z);
}

/* Snap to the grid that is drawn, not to a constant. GRID is still the default
   pitch; gridStep() is whatever the user set it to, and a snap that did not
   follow it would put notes between the lines they were aiming at. */
function snapV(v) { const g = gridStep(); return state.settings.snap ? Math.round(v / g) * g : Math.round(v); }

/* ---- lining a note up with its neighbours -------------------------------

   Dragging a note next to another one and getting it *almost* level is the
   most common small annoyance on a canvas like this: two notes a pixel and a
   half out of line look wrong, and there is nothing to aim at. Snap-to-grid
   does not answer it — the grid is 26px and the note you want to match is
   wherever somebody put it.

   So while something is dragged, the six lines it could line up on — its left,
   centre and right, its top, middle and bottom — are compared against the same
   six on every item nearby. Within a few screen pixels the drag is nudged onto
   the match, and the line is drawn so you can see what it caught on.

   Four decisions worth keeping:

   - **The candidates are gathered once, at the start of the drag.** Nothing
     standing still moves while you drag, so recomputing them per pointermove
     would be the same answer at sixty times the cost. On a board of thousands
     that is the difference between a feature and a stall.
   - **Only what is near the viewport counts**, and at most GUIDE_MAX of those.
     Lining up with a note two screens away is not something anybody is trying
     to do, and it is not something they could see the line for either.
   - **The tolerance is in screen pixels, converted to world.** A fixed world
     tolerance would be unusable zoomed out — everything within reach — and
     useless zoomed in, where nothing ever is. Six screen pixels is the same
     six pixels of pointer travel at every zoom.
   - **It nudges, it does not lock.** The offset is applied on top of the
     pointer delta for that frame only; keep moving and it lets go. A snap you
     have to fight is worse than no snap at all.

   Grid snap wins when it is on. It is an explicit "put things on the grid", and
   two snaps arguing over one drag is a note that will not go where it is
   pointed. */
const GUIDE_TOL = 6;        // screen px, converted to world at the current zoom
const GUIDE_MAX = 400;      // candidate items considered
let guideEls = null;        // the two <line>s, reused rather than rebuilt

/* The static items a drag could line up against, and the coordinates they
   offer. Frames count: a workflow's edge is exactly the thing you want a note
   flush against. */
function guideCandidates(movingIds) {
  const R = visibleWorldRect();
  const xs = [], ys = [];
  let n = 0;
  const take = (it) => {
    if (n >= GUIDE_MAX || movingIds.has(it.id) || !inRect(it, R)) return;
    n++;
    xs.push(it.x, it.x + it.w / 2, it.x + it.w);
    ys.push(it.y, it.y + it.h / 2, it.y + it.h);
  };
  state.notes.forEach(take);
  state.frames.forEach(take);
  return { xs, ys, n };
}

/* The nudge, and the two lines to draw for it. `box` is where the dragged set
   would land unaided. Returns the correction and the world coordinates that
   matched, with null for an axis that found nothing. */
function guideFit(box, cand, tol) {
  const edgesX = [box.x, box.x + box.w / 2, box.x + box.w];
  const edgesY = [box.y, box.y + box.h / 2, box.y + box.h];
  let bestX = null, bestY = null;
  for (let i = 0; i < cand.xs.length; i++) {
    const c = cand.xs[i];
    for (let j = 0; j < 3; j++) {
      const d = c - edgesX[j];
      if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: c };
    }
  }
  for (let i = 0; i < cand.ys.length; i++) {
    const c = cand.ys[i];
    for (let j = 0; j < 3; j++) {
      const d = c - edgesY[j];
      if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: c };
    }
  }
  return {
    dx: bestX ? bestX.d : 0, dy: bestY ? bestY.d : 0,
    vx: bestX ? bestX.at : null, hy: bestY ? bestY.at : null
  };
}

/* Two <line>s, made once and moved thereafter — the same diff-don't-rebuild
   rule the compass chips follow, and for the same reason: assigning the markup
   again every frame restarts the fade-in, so the guide would never appear.

   `SVGNS` is declared in links.js, which loads *after* this file. That is fine
   and it is worth saying why: the load order only governs what a file can read
   while it is being **evaluated**, and this is a function body that first runs
   during a drag, long after init(). Reading it at the top level of this file
   would be the temporal dead zone. See MAP.md §4. */
function drawGuides(fit, box) {
  const svg = $('guidesSvg');
  if (!svg) return;
  if (!guideEls) {
    const mk = () => {
      const l = document.createElementNS(SVGNS, 'line');
      l.setAttribute('class', 'guide-line off');
      svg.appendChild(l);
      return l;
    };
    guideEls = { v: mk(), h: mk() };
  }
  const span = 90;      // world px of overhang past the block, so a line reads as one
  const { v, h } = guideEls;
  if (fit.vx == null) v.setAttribute('class', 'guide-line off');
  else {
    v.setAttribute('class', 'guide-line');
    v.setAttribute('x1', fit.vx); v.setAttribute('x2', fit.vx);
    v.setAttribute('y1', box.y - span); v.setAttribute('y2', box.y + box.h + span);
  }
  if (fit.hy == null) h.setAttribute('class', 'guide-line off');
  else {
    h.setAttribute('class', 'guide-line');
    h.setAttribute('y1', fit.hy); h.setAttribute('y2', fit.hy);
    h.setAttribute('x1', box.x - span); h.setAttribute('x2', box.x + box.w + span);
  }
}
function clearGuides() {
  if (!guideEls) return;
  guideEls.v.setAttribute('class', 'guide-line off');
  guideEls.h.setAttribute('class', 'guide-line off');
}

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
    w0: toWorld(e.clientX, e.clientY),
    items: items.map((it) => ({ it, ox: it.x, oy: it.y })),
    /* Which ropes this drag can possibly move. Worked out once here rather than
       per pointermove, so the drag loop can redraw those and leave every other
       rope on the board alone — see drawLinks(). */
    ids: new Set(items.map((it) => it.id)),
    /* One picture on its own can be dropped into a note — see pictures.js.
       Only alone: five things dragged at once are being moved, not filed. */
    pic: (items.length === 1 && items[0].pic) ? items[0] : null
  };
  items.forEach((it) => els.get(it.id)?.classList.add('dragging'));
  /* Worked out once, here, because nothing standing still moves during a drag.
     Skipped entirely when the feature is off or grid snap is on, so neither
     costs anything it does not use. */
  gesture.guides = (state.settings.guides && !state.settings.snap)
    ? guideCandidates(gesture.ids) : null;
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
    sx: e.clientX, sy: e.clientY, w0: toWorld(e.clientX, e.clientY),
    ox: it.x, oy: it.y, ow: it.w, oh: it.h,
    minW: frame ? FRAME_MIN_W : (it.pic ? PIC_MIN : NOTE_MIN_W),
    minH: frame ? FRAME_MIN_H : (it.pic ? PIC_MIN : NOTE_MIN_H),
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
  g.last = e;             // replayed by followCamera() when the board moves under it

  if (g.kind === 'move') {
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return;
    let { dx, dy } = gestureDelta(g, e);
    g.moved = true;
    /* Line the whole dragged block up with what is around it. The box is the
       union of everything travelling, so dragging five notes lines the five up
       with the neighbour rather than lining one of them up and leaving the rest
       wherever the offset happened to put them. */
    if (g.guides && g.guides.n) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      g.items.forEach(({ it, ox, oy }) => {
        const x = ox + dx, y = oy + dy;
        if (x < x1) x1 = x;
        if (y < y1) y1 = y;
        if (x + it.w > x2) x2 = x + it.w;
        if (y + it.h > y2) y2 = y + it.h;
      });
      const box = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      const fit = guideFit(box, g.guides, GUIDE_TOL / state.view.z);
      dx += fit.dx; dy += fit.dy;
      box.x += fit.dx; box.y += fit.dy;
      drawGuides(fit, box);
    }
    g.items.forEach(({ it, ox, oy }) => {
      it.x = snapV(ox + dx); it.y = snapV(oy + dy);
      const el = els.get(it.id);
      if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    });
    drawLinks(g.ids); scheduleCompass();
    trackBoardDrop(e);
    if (g.pic) trackPicTarget(e, g);
    return;
  }

  if (g.kind === 'resize') {
    const { dx, dy } = gestureDelta(g, e);
    const d = g.dir, it = g.it;
    let x = g.ox, y = g.oy, w = g.ow, h = g.oh;
    if (d.includes('e')) w = Math.max(g.minW, g.ow + dx);
    if (d.includes('s')) h = Math.max(g.minH, g.oh + dy);
    if (d.includes('w')) { const nw = Math.max(g.minW, g.ow - dx); x = g.ox + (g.ow - nw); w = nw; }
    if (d.includes('n')) { const nh = Math.max(g.minH, g.oh - dy); y = g.oy + (g.oh - nh); h = nh; }
    // a picture keeps its shape, whichever handle is pulled
    if (it.pic) ({ x, y, w, h } = fitPictureBox(g, { x, y, w, h }));
    it.x = snapV(x); it.y = snapV(y); it.w = snapV(w); it.h = snapV(h);
    const el = els.get(it.id);
    if (el) placeEl(el, it);
    drawLinks(g.ids); scheduleCompass();
    return;
  }

  if (g.kind === 'pan') {
    // increments, not "start + travel": a wheel zoom mid-pan moves the view too
    state.view.x += e.clientX - g.lx;
    state.view.y += e.clientY - g.ly;
    g.lx = e.clientX; g.ly = e.clientY;
    applyView();
    return;
  }

  if (g.kind === 'marquee') {
    const r = vpRect();
    // the first corner is a point on the board, so it travels with a zoom
    const s = toScreen(g.w0.x, g.w0.y), cx = e.clientX - r.left, cy = e.clientY - r.top;
    const x1 = Math.min(s.x, cx), y1 = Math.min(s.y, cy);
    const x2 = Math.max(s.x, cx), y2 = Math.max(s.y, cy);
    const m = $('marquee');
    m.classList.remove('hidden');
    m.style.left = x1 + 'px'; m.style.top = y1 + 'px';
    m.style.width = (x2 - x1) + 'px'; m.style.height = (y2 - y1) + 'px';
    const w = toWorld(e.clientX, e.clientY);
    const a = { x: Math.min(g.w0.x, w.x), y: Math.min(g.w0.y, w.y) };
    const b = { x: Math.max(g.w0.x, w.x), y: Math.max(g.w0.y, w.y) };
    const hit = [];
    const test = (it) => (it.x < b.x && it.x + it.w > a.x && it.y < b.y && it.y + it.h > a.y);
    state.notes.forEach((n) => { if (test(n)) hit.push(n.id); });
    state.frames.forEach((f) => { if (frameSelectable(f) && test(f)) hit.push(f.id); });
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
  if (farMode) scheduleMount();   // what it held may go back to being a ghost now
  document.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
  clearGuides();
  $('marquee').classList.add('hidden');
  $('viewport').classList.remove('panning');
  // dropped on a board tile? that ends the gesture as a move-to-board instead
  if (g.kind === 'move' && g.moved && finishBoardDrop(g)) return;
  // a picture let go over a note goes into the note
  if (g.kind === 'move' && g.moved && g.pic && finishPicDrop(g)) return;
  markPicTarget(null);
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
  drawHotRopes();         // a selected note shows its ropes above the notes
  requestFar();           // and a note on the far-zoom canvas its ring (far.js)
}
function selectedItems() { return [...selection].map(itemById).filter(Boolean); }

/* ─────────────── 9. pan / zoom / fly-to ─────────────── */
let spaceHeld = false;

function beginPan(e) {
  stopFlight();
  gesture = { kind: 'pan', sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY };
  $('viewport').classList.add('panning');
  captureGesture(e);
}

function zoomAt(clientX, clientY, factor) {
  stopFlight();           // a fly-to still running would drag the view off the cursor next frame
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

/* The wheel over a note that has more text than it shows scrolls the note.

   It used to pan the canvas unconditionally, so the only way to read the end
   of a long note was to resize it or open it. Now the note gets the wheel when
   it can actually move in that direction — the browser's own nested-scroll
   rule — and the board gets it back at either end.

   **Latched, the way a browser latches nested scrollers.** Without that, a
   wheel pan across the board stops dead the moment the pointer passes over a
   long note, which would make this feature a trap. So whichever of the two
   took the first notch of a burst keeps the burst: panning carries on over a
   note, and scrolling a note does not spill into the canvas when it reaches the
   bottom. A gap of WHEEL_LATCH ms starts a new burst. Ctrl always zooms. */
const WHEEL_LATCH = 260;
let wheelLatch = { to: null, at: 0 };
function scrollableNoteBody(e) {
  const body = e.target.closest && e.target.closest('.note-body');
  if (!body) return null;
  const dy = e.deltaY, dx = e.deltaX;
  const canY = body.scrollHeight > body.clientHeight + 1 &&
    (dy > 0 ? body.scrollTop + body.clientHeight < body.scrollHeight - 1 : dy < 0 ? body.scrollTop > 0 : false);
  const canX = body.scrollWidth > body.clientWidth + 1 &&
    (dx > 0 ? body.scrollLeft + body.clientWidth < body.scrollWidth - 1 : dx < 0 ? body.scrollLeft > 0 : false);
  return (canY || canX) ? body : null;
}
function onWheel(e) {
  if (!e.ctrlKey) {
    const now = performance.now();
    const fresh = now - wheelLatch.at > WHEEL_LATCH;
    wheelLatch.at = now;
    if (fresh) wheelLatch.to = scrollableNoteBody(e);
    if (wheelLatch.to && wheelLatch.to.isConnected && wheelLatch.to.contains(e.target)) return;   // the note scrolls itself
    if (wheelLatch.to) wheelLatch.to = null;   // left the note mid-burst: the canvas has it from here
  } else wheelLatch.to = null;
  e.preventDefault();
  const zoomIntent = e.ctrlKey || state.settings.wheel === 'zoom';
  if (zoomIntent) {
    /* How far one notch goes. A multiplier on the exponent rather than on the
       resulting factor, because the factor is already exponential — scaling it
       directly would make the fast end runaway and the slow end never arrive.
       The clamp afterwards is unchanged and is what stops a trackpad's
       hundred-pixel deltas from crossing the whole zoom range in one flick. */
    const speed = clamp(+state.settings.zoomSpeed || 100, 40, 220) / 100;
    const f = Math.pow(0.999, e.deltaY * (e.ctrlKey ? 2.4 : 1.6) * speed);
    zoomAt(e.clientX, e.clientY, clamp(f, 0.5, 2));
  } else {
    stopFlight();
    state.view.x -= e.deltaX;
    state.view.y -= e.deltaY;
    applyView();
    saveSoon();
  }
}

/* Smoothly move the camera so that world point (cx,cy) sits in the middle of
   the viewport at zoom `z`. Used by the compass chips and find. */
let flight = null;
function stopFlight() {
  if (!flight) return;
  cancelAnimationFrame(flight);
  flight = null;
  saveSoon();
}
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
  // a drawing is part of the board, so "everything" includes it (2.1)
  const ink = (state.ink || []).map((s) => { const q = inkBox(s); return { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 }; });
  const all = [...state.notes, ...state.frames, ...ink];
  if (!all.length) { flyTo({ x: 0, y: 0 }, 1); return; }
  fitTo(all);
}
