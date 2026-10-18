/* Mental Board — pictures.js
   A picture standing on the board by itself: no note around it.

   Part 13 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 11d. pictures on the board ───────────────
   Drop a screenshot on an empty patch of canvas and what you get is the
   screenshot — not a note with a screenshot in it. It moves, resizes, ropes,
   groups, copies, goes to the bin and comes back exactly as a note does,
   because it IS a note: `{ pic: true }` on an ordinary note whose body is one
   <img>. Every part of the app that already handles notes — the gesture
   engine, undo, the clipboard, culling, board-to-board drags, the export —
   handles pictures with no second code path to keep honest. What changes is
   only how it is drawn (no head, no body, no status) and three gestures:

   - a resize keeps the picture's shape, from any handle;
   - a double-click opens the studio (crop, draw, arrow, text) on it;
   - dragging it onto a note drops it *into* that note, as a note picture.

   The stored markup is the same `<img class="mb-img" src="mbf://…">` a note
   picture uses, so search, the file clean-up and relinking all see it. */
const PIC_MAX = 720;           // longest side a new picture starts at, in world px

/* The <img> markup a picture note holds. `data-name` is what the studio names
   its edited copy after. */
function picBody(url, name) {
  return `<img class="mb-img" src="${esc(url)}"${name ? ` data-name="${esc(name)}"` : ''}>`;
}
// the one URL in a picture's body
function picSrc(n) {
  const m = /<img[^>]*\ssrc="([^"]*)"/i.exec((n && n.body) || '');
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
}
function picName(n) {
  const m = /<img[^>]*\sdata-name="([^"]*)"/i.exec((n && n.body) || '');
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : '';
}

/* The element. makeNote() hands a `pic` note here instead of fillNote(). */
function fillPicture(el, n) {
  delete el.dataset.stub;
  el.classList.add('pic');
  el.innerHTML =
    `<img class="pic-img" src="${esc(picSrc(n))}" alt="" draggable="false" decoding="async"` +
    `${picName(n) ? ` data-name="${esc(picName(n))}"` : ''}>${rzHtml()}`;
  const img = el.querySelector('img');
  img.addEventListener('load', () => {
    el.classList.remove('pic-broken');
    // a picture that arrived without a shape learns it the first time it draws
    if (!n.ar && img.naturalWidth && img.naturalHeight) n.ar = img.naturalWidth / img.naturalHeight;
  });
  img.addEventListener('error', () => el.classList.add('pic-broken'));
}

/* Measure, then make. Creating it at a default size and resizing after the
   picture decodes makes it jump; a picture that changes size a beat after it
   appears reads as a glitch rather than as fitting. */
function measureImage(url) {
  return new Promise((res) => {
    const probe = new Image();
    probe.onload = () => res({ w: probe.naturalWidth || probe.width, h: probe.naturalHeight || probe.height });
    probe.onerror = () => res(null);
    probe.src = url;
  });
}
async function addPicture(worldPt, taken) {
  if (!canEditHere() || !taken || !taken.url) return null;
  const size = await measureImage(taken.url);
  let w = 320, h = 240;
  if (size && size.w && size.h) {
    const k = Math.min(1, PIC_MAX / Math.max(size.w, size.h));
    w = Math.max(PIC_MIN, Math.round(size.w * k));
    h = Math.max(PIC_MIN, Math.round(size.h * k));
  }
  const n = addNote(worldPt, {
    pic: true, ar: w / h, w, h, edit: false, color: 'default',
    body: picBody(taken.url, taken.name)
  });
  if (n) toast(t('msg.pictureAdded'));
  return n;
}

/* ---- resizing keeps the shape ----
   Called by the gesture engine with the box a free resize would have produced.
   Which side gives way depends on the handle: a corner follows the larger of
   the two pulls, a horizontal edge sets the width and the height follows,
   a vertical edge the other way round. The anchored corner stays put. */
function fitPictureBox(g, box) {
  const ar = g.it.ar || (g.ow / g.oh) || 1;
  const d = g.dir;
  let { x, y, w, h } = box;
  const horiz = d === 'e' || d === 'w', vert = d === 'n' || d === 's';
  if (horiz || (!vert && Math.abs(w - g.ow) * (1 / ar) >= Math.abs(h - g.oh))) h = w / ar; else w = h * ar;
  if (w < PIC_MIN) { w = PIC_MIN; h = w / ar; }
  if (h < PIC_MIN) { h = PIC_MIN; w = h * ar; }
  // re-anchor the side that was not being pulled
  if (d.includes('w')) x = g.ox + g.ow - w; else x = g.ox;
  if (d.includes('n')) y = g.oy + g.oh - h; else y = g.oy;
  // a vertical edge grows sideways from the centre, a horizontal one downwards from the middle
  if (vert) x = g.ox + (g.ow - w) / 2;
  if (horiz) y = g.oy + (g.oh - h) / 2;
  return { x, y, w, h };
}

/* ---- dropping a picture into a note ----
   While a single picture is being dragged, whatever note is under the pointer
   is lit up as the place it would land. On release it lands: the <img> goes to
   the end of that note's text and the picture leaves the board. It is the same
   file — nothing is copied or renamed — so the note now carries it. */
let picTarget = null;
function markPicTarget(el) {
  if (picTarget === el) return;
  if (picTarget) picTarget.classList.remove('pic-target');
  picTarget = el;
  if (picTarget) picTarget.classList.add('pic-target');
}
function trackPicTarget(e, g) {
  if (!g.pic) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const host = under && under.closest('.note');
  const ok = host && !host.classList.contains('pic') && host.dataset.id !== g.pic.id &&
             state.notes.some((n) => n.id === host.dataset.id);
  markPicTarget(ok ? host : null);
}
/* Returns true when the drop was taken, so endGesture() stops there. */
function finishPicDrop(g) {
  const host = picTarget;
  markPicTarget(null);
  if (!host || !g.pic) return false;
  const target = state.notes.find((n) => n.id === host.dataset.id);
  const pic = g.pic;
  if (!target || target.pic || !canEditHere()) return false;
  /* beginMove() pushed a geometry-only step; this changes what exists, so the
     step is swapped for a full snapshot taken with the drag's start position
     back in place — see finishBoardDrop() for the same dance. */
  popUndo();
  const { ox, oy } = g.items[0];
  const nx = pic.x, ny = pic.y;
  pic.x = ox; pic.y = oy;
  pushUndo();
  pic.x = nx; pic.y = ny;

  const prev = target.body;
  target.body = (target.body || '') + picBody(picSrc(pic), picName(pic)).replace('class="mb-img"', 'class="mb-img" loading="lazy" decoding="async"') + '<p><br></p>';
  pushHistory(target, prev);
  state.notes = state.notes.filter((n) => n.id !== pic.id);
  state.links = state.links.filter((l) => l.from !== pic.id && l.to !== pic.id);
  els.get(pic.id)?.remove(); els.delete(pic.id); selection.delete(pic.id);
  const tel = els.get(target.id);
  if (tel && !tel.classList.contains('editing')) repaintNoteBody(tel, target);
  updateCulling(); drawLinks(); refreshFrameCounts(); drawCompass();
  setSelection([target.id], false);
  save();
  toast(t('msg.pictureIntoNote'));
  return true;
}

/* ---- the studio, on a picture ---- */
function editPicture(id) {
  const n = state.notes.find((x) => x.id === id && x.pic);
  const el = n && ensureMounted(id);
  const img = el && el.querySelector('img.pic-img');
  if (!img) return;
  if (picName(n)) img.dataset.name = picName(n);
  openStudio(img);
}
/* applyStudio() lands here for an <img> that is not inside a note body: the
   picture's body is rewritten to the edited file, and its shape re-measured so
   a crop changes the box to match rather than squashing the result into the
   old one. */
async function pictureEdited(img, url) {
  const el = img.closest('.note.pic');
  const n = el && state.notes.find((x) => x.id === el.dataset.id);
  if (!n) return;
  pushUndo();
  const prev = n.body;
  const name = (picName(n) || 'picture').replace(/\.[a-z0-9]+$/i, '') + '.png';
  n.body = picBody(url, name);
  pushHistory(n, prev);
  const size = await measureImage(url);
  if (size && size.w && size.h) {
    const ar = size.w / size.h;
    // keep the width, let the height follow the new shape
    n.h = Math.max(PIC_MIN, Math.round(n.w / ar));
    n.ar = ar;
  }
  const cur = els.get(n.id);
  if (cur) { placeEl(cur, n); fillPicture(cur, n); }
  drawLinks(); refreshFrameCounts(); save();
}

/* Swap the file behind a picture for another one, keeping its place and its
   width. Through the same door a dropped file uses, so the new one is a copy
   in the board's folder like the old one. */
async function replacePicture(id) {
  const n = state.notes.find((x) => x.id === id && x.pic);
  if (!n || !FILES || !FILES.pickImage || !FILES.attach) { if (!FILES) toast(t('msg.needDesktop')); return; }
  const p = await FILES.pickImage();
  if (!p) return;
  const r = await FILES.attach(p, state.activeBoard, '');
  if (!r || r.error) { toast(t('msg.fileFailed', { name: p.split(/[\\/]/).pop() }), 5000); return; }
  pushUndo();
  n.body = picBody(r.url, r.name);
  const size = await measureImage(r.url);
  if (size && size.w && size.h) { n.ar = size.w / size.h; n.h = Math.max(PIC_MIN, Math.round(n.w / n.ar)); }
  const el = els.get(n.id);
  if (el) { placeEl(el, n); fillPicture(el, n); }
  drawLinks(); save();
}

/* A picture that is inside a note, taken back out onto the board beside it.
   The other direction of the drop above, from the image toolbar. */
function pictureOutOfNote(img) {
  const host = img && img.closest('.note');
  const n = host && state.notes.find((x) => x.id === host.dataset.id);
  if (!n || !canEditHere()) return;
  const src = img.getAttribute('src') || '';
  if (!src) return;
  const name = img.dataset.name || '';
  exitEdit();
  pushUndo();
  const prev = n.body;
  img.remove();
  n.body = bodyHtml(host.querySelector('.note-body'));
  pushHistory(n, prev);
  const el = els.get(n.id);
  if (el) repaintNoteBody(el, n);
  const w = Math.min(PIC_MAX, Math.max(PIC_MIN, Math.round(n.w)));
  addPicture({ x: n.x + n.w + 24 + w / 2, y: n.y + n.h / 2 }, { url: src, name });
}
