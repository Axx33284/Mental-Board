/* Mental Board — media.js
   The icon picker, and images: select, size, align, and the crop/annotate studio.

   Part 10 of 15. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 11b. icon picker ─────────────── */
/* One picker, three kinds of target: a note, a workflow frame, or a board. A
   board id is prefixed `board:` so the two id spaces can never be confused —
   both are uid()s, and resolving one against the wrong collection would silently
   do nothing. */
let iconTargetId = null;

/* 'inline' is not a thing with an `icon` field — it means "put the glyph in the
   note text I am editing". It resolves to a truthy stand-in so the picker opens;
   buildIconGrid() branches on iconTargetIsInline() rather than reading it. */
const INLINE_TARGET = { inline: true, icon: '', iconColor: 'auto' };
function resolveIconTarget(id) {
  if (typeof id !== 'string' || !id) return null;
  if (id === 'inline') return editing ? INLINE_TARGET : null;
  return id.startsWith('board:') ? boardById(id.slice(6)) : itemById(id);
}
const iconTargetIsInline = () => iconTargetId === 'inline';
const iconTarget = () => resolveIconTarget(iconTargetId);
const iconTargetIsBoard = () => typeof iconTargetId === 'string' && iconTargetId.startsWith('board:');

/* A board is not on the undo stack — that holds notes, frames and links — so
   changing a board's icon must not push a snapshot. Pushing one would make the
   next Ctrl+Z appear to do nothing, because it would restore a canvas identical
   to the one already on screen. */
function commitIconChange() {
  if (iconTargetIsBoard()) { renderBoardRail(); saveSoon(); return; }
  repaintIcons(iconTargetId); saveSoon(); drawCompass();
}

function openIconPicker(id) {
  if (!resolveIconTarget(id)) return;
  iconTargetId = id;
  $('iconSearch').value = '';
  /* Inline mode has no colour and nothing to remove: the glyph goes into the
     text and takes the text's colour from there. Showing a colour row that did
     nothing would be worse than showing none. */
  const inline = iconTargetIsInline();
  $('ipColors').classList.toggle('hidden', inline);
  $('iconRemove').classList.toggle('hidden', inline);
  if (!inline) buildIconColors();
  buildIconGrid('');
  $('iconPicker').classList.remove('hidden');
  setTimeout(() => $('iconSearch').focus(), 30);
}
function closeIconPicker() { $('iconPicker').classList.add('hidden'); iconTargetId = null; }

function buildIconColors() {
  const it = iconTarget();
  const cur = (it && it.iconColor) || 'auto';
  const keys = ['auto', ...COLORS.filter((c) => c !== 'default')];
  $('ipColors').innerHTML = keys.map((k) =>
    `<button data-ic="${k}" data-color="${k === 'auto' ? 'default' : k}" class="ip-col${k === cur ? ' on' : ''}${k === 'auto' ? ' auto' : ''}" title="${k === 'auto' ? te('icon.auto') : te('colour.' + k)}"></button>`).join('');
  $('ipColors').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const target = iconTarget();
    if (!target) return;
    if (!iconTargetIsBoard()) pushUndo();
    target.iconColor = b.dataset.ic;
    commitIconChange();
    buildIconColors();
  }));
}

function buildIconGrid(q) {
  q = (q || '').trim().toLowerCase().replace(/\s+/g, '_');
  const it = iconTarget();
  const cur = it && it.icon;
  const cell = (n) => `<button class="ip-cell${n === cur ? ' on' : ''}" data-n="${n}" title="${esc(n.replace(/_/g, ' '))}">${icon(n)}</button>`;
  let html = '';
  if (q) {
    const hits = ICON_NAMES.filter((n) => n.includes(q));
    html = hits.length
      ? `<div class="ip-group">${hits.slice(0, 240).map(cell).join('')}</div>`
      : `<div class="sm-empty">${te('icon.none')}</div>`;
  } else {
    for (const [g, list] of Object.entries(ICON_GROUPS)) {
      html += `<h4 class="ip-h">${te('icons.' + g)}</h4><div class="ip-group">${list.map(cell).join('')}</div>`;
    }
  }
  const grid = $('ipGrid');
  grid.innerHTML = html;
  grid.querySelectorAll('.ip-cell').forEach((b) => b.addEventListener('click', () => {
    const target = iconTarget();
    if (!target) return;
    // inline is a one-shot insert, not a property being toggled
    if (iconTargetIsInline()) { closeIconPicker(); insertInlineIcon(b.dataset.n); return; }
    if (!iconTargetIsBoard()) pushUndo();
    /* Clicking the current icon again clears it — except on a board, where the
       tile would then have nothing to show. A board keeps a fallback glyph. */
    const same = target.icon === b.dataset.n;
    target.icon = same ? (iconTargetIsBoard() ? 'sticky_note_2' : '') : b.dataset.n;
    commitIconChange();
    buildIconGrid($('iconSearch').value);
  }));
}

/* ─────────────── 11c. images: select, size, align, studio ─────────────── */
let selImg = null;
let imgGrip = null;

function ensureGrip() {
  if (imgGrip) return imgGrip;
  imgGrip = document.createElement('div');
  imgGrip.id = 'imgGrip';
  imgGrip.className = 'hidden';
  document.body.appendChild(imgGrip);
  imgGrip.addEventListener('pointerdown', startImgResize);
  return imgGrip;
}

function selectImage(img) {
  clearImageSel();
  selImg = img;
  img.classList.add('img-sel');
  placeImgChrome();
}
function clearImageSel() {
  if (selImg) selImg.classList.remove('img-sel');
  selImg = null;
  $('imgBar').classList.add('hidden');
  if (imgGrip) imgGrip.classList.add('hidden');
}
function placeImgChrome() {
  if (!selImg) return;
  const r = selImg.getBoundingClientRect();
  const bar = $('imgBar');
  bar.classList.remove('hidden');
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  bar.style.left = clamp(r.left + r.width / 2 - bw / 2, 8, innerWidth - bw - 8) + 'px';
  bar.style.top = clamp(r.top - bh - 8, 44, innerHeight - bh - 8) + 'px';
  $('imgSize').textContent = Math.round(r.width / state.view.z) + 'px';
  const g = ensureGrip();
  g.classList.remove('hidden');
  /* The grip goes on the trailing corner, which is the left one in an RTL
     window. An image in an Arabic note is aligned to the right edge of the
     text, so a grip pinned to `right` sat under the note's own border and could
     not be grabbed at all. */
  g.style.left = (RTL ? r.left - 7 : r.right - 7) + 'px';
  g.style.top = (r.bottom - 7) + 'px';
}

function imgWidthPx() {
  if (!selImg) return 0;
  return Math.round(selImg.getBoundingClientRect().width / state.view.z);
}
function setImgWidth(px) {
  if (!selImg) return;
  selImg.style.width = clamp(Math.round(px), 40, 4000) + 'px';
  selImg.style.height = 'auto';
  persistEdit();
  placeImgChrome();
}

let imgResize = null;
function startImgResize(e) {
  if (!selImg) return;
  e.preventDefault(); e.stopPropagation();
  imgResize = { sx: e.clientX, w0: selImg.getBoundingClientRect().width / state.view.z };
  window.addEventListener('pointermove', onImgResize);
  window.addEventListener('pointerup', endImgResize);
}
function onImgResize(e) {
  if (!imgResize) return;
  // dragging outwards makes it bigger, and outwards is leftwards in RTL
  const d = (e.clientX - imgResize.sx) * (RTL ? -1 : 1);
  setImgWidth(imgResize.w0 + d / state.view.z);
}
function endImgResize() {
  imgResize = null;
  window.removeEventListener('pointermove', onImgResize);
  window.removeEventListener('pointerup', endImgResize);
  persistEdit();
}

function alignImage(side) {
  if (!selImg) return;
  selImg.classList.remove('al-left', 'al-center', 'al-right');
  selImg.classList.add('al-' + side);
  persistEdit();
  placeImgChrome();
}

function wireImgBar() {
  const bar = $('imgBar');
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => alignImage(b.dataset.align)));
  bar.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', () => {
    switch (b.dataset.img) {
      case 'wider': setImgWidth(imgWidthPx() * 1.15 + 8); break;
      case 'narrower': setImgWidth(imgWidthPx() / 1.15 - 8); break;
      case 'full': if (selImg) { selImg.style.width = ''; selImg.style.height = ''; persistEdit(); placeImgChrome(); } break;
      case 'studio': openStudio(); break;
      case 'delete': if (selImg) { const im = selImg; clearImageSel(); im.remove(); persistEdit(); } break;
    }
  }));
}

/* ---- the studio: crop, draw, annotate ---------------------------------- */
const ST = {
  img: null,          // HTMLImageElement of the working source
  src: '',            // data url of the working source
  crop: null,         // {x,y,w,h} in image pixels
  marks: [],          // annotations, in image pixels
  tool: 'crop',
  color: '#ff5252',
  weight: 4,
  scale: 1,           // canvas px per image px
  drag: null,
  target: null        // the <img> in the note being edited
};
const ST_COLORS = ['#ff5252', '#ffb300', '#ffe94d', '#43d17a', '#41c9e2', '#5b8cff', '#b07cff', '#ffffff', '#101014'];

// file:// images taint a canvas, so read the bytes through preload instead
async function toDataUrl(src) {
  if (/^data:/i.test(src)) return src;
  if (FILES && FILES.readImage) {
    const d = await FILES.readImage(src);
    if (d) return d;
  }
  return src;
}

async function openStudio() {
  if (!selImg) return;
  ST.target = selImg;
  const src = selImg.dataset.orig || selImg.src;
  const dataUrl = await toDataUrl(src);
  const img = new Image();
  img.onload = () => {
    ST.img = img; ST.src = dataUrl;
    ST.crop = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    ST.marks = []; ST.tool = 'crop';
    $('studio').classList.remove('hidden');
    buildStudioChrome();
    requestAnimationFrame(fitStudio);
  };
  img.onerror = () => toast(t('msg.imageFailed'));
  img.src = dataUrl;
}
function closeStudio() { $('studio').classList.add('hidden'); ST.img = null; ST.target = null; }

function buildStudioChrome() {
  $('stColors').innerHTML = ST_COLORS.map((c) =>
    `<button data-c="${c}" class="${c === ST.color ? 'on' : ''}" style="background:${c}"></button>`).join('');
  $('stColors').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    ST.color = b.dataset.c; buildStudioChrome();
  }));
  $('stTools').querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === ST.tool));
  $('stHint').textContent = ST.tool ? t('studio.hint.' + ST.tool) : '';
}

function fitStudio() {
  if (!ST.img) return;
  const stage = $('studioStage').getBoundingClientRect();
  const maxW = stage.width - 48, maxH = stage.height - 48;
  ST.scale = Math.min(maxW / ST.img.naturalWidth, maxH / ST.img.naturalHeight, 1);
  const c = $('stCanvas');
  c.width = Math.round(ST.img.naturalWidth * ST.scale);
  c.height = Math.round(ST.img.naturalHeight * ST.scale);
  $('stWrap').style.width = c.width + 'px';
  $('stWrap').style.height = c.height + 'px';
  drawStudio();
}

function drawStudio() {
  const c = $('stCanvas');
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(ST.img, 0, 0, c.width, c.height);
  ST.marks.forEach((m) => drawMark(g, m, ST.scale, 0, 0));
  // dim everything outside the crop
  const k = ST.scale, cr = ST.crop;
  if (cr && (cr.x || cr.y || cr.w !== ST.img.naturalWidth || cr.h !== ST.img.naturalHeight) || ST.tool === 'crop') {
    g.save();
    g.fillStyle = 'rgba(0,0,0,.5)';
    g.beginPath();
    g.rect(0, 0, c.width, c.height);
    g.rect(cr.x * k, cr.y * k, cr.w * k, cr.h * k);
    g.fill('evenodd');
    g.restore();
    g.strokeStyle = '#fff'; g.lineWidth = 1;
    g.strokeRect(cr.x * k + .5, cr.y * k + .5, cr.w * k - 1, cr.h * k - 1);
  }
  positionCropHandles();
}
function positionCropHandles() {
  const box = $('stCrop'), k = ST.scale, cr = ST.crop;
  if (!cr) return;
  box.classList.toggle('hidden', ST.tool !== 'crop');
  box.style.left = (cr.x * k) + 'px'; box.style.top = (cr.y * k) + 'px';
  box.style.width = (cr.w * k) + 'px'; box.style.height = (cr.h * k) + 'px';
}

function drawMark(g, m, k, ox, oy) {
  g.save();
  g.strokeStyle = m.color; g.fillStyle = m.color;
  g.lineWidth = Math.max(1, m.w * k);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const X = (v) => (v - ox) * k, Y = (v) => (v - oy) * k;
  if (m.type === 'pen' && m.pts.length > 1) {
    g.beginPath(); g.moveTo(X(m.pts[0][0]), Y(m.pts[0][1]));
    for (let i = 1; i < m.pts.length; i++) g.lineTo(X(m.pts[i][0]), Y(m.pts[i][1]));
    g.stroke();
  } else if (m.type === 'box') {
    g.strokeRect(X(m.x), Y(m.y), m.w2 * k, m.h2 * k);
  } else if (m.type === 'arrow') {
    const x1 = X(m.x1), y1 = Y(m.y1), x2 = X(m.x2), y2 = Y(m.y2);
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1), head = Math.max(9, m.w * k * 3.2);
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
    g.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
    g.closePath(); g.fill();
  } else if (m.type === 'text') {
    const size = Math.max(10, m.size * k);
    g.font = `600 ${size}px "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif`;
    g.textBaseline = 'top';
    const pad = size * 0.32;
    const tw = g.measureText(m.text).width;
    g.fillStyle = 'rgba(0,0,0,.62)';
    roundRectPath(g, X(m.x) - pad, Y(m.y) - pad, tw + pad * 2, size * 1.28 + pad, size * 0.3);
    g.fill();
    g.fillStyle = m.color;
    g.fillText(m.text, X(m.x), Y(m.y));
  }
  g.restore();
}
function roundRectPath(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// canvas pixel -> image pixel
function stPoint(e) {
  const r = $('stCanvas').getBoundingClientRect();
  return {
    x: clamp((e.clientX - r.left) / ST.scale, 0, ST.img.naturalWidth),
    y: clamp((e.clientY - r.top) / ST.scale, 0, ST.img.naturalHeight)
  };
}

function studioDown(e) {
  if (!ST.img || e.button !== 0) return;
  const handle = e.target.closest('.stc');
  const p = stPoint(e);
  e.preventDefault();
  if (ST.tool === 'crop') {
    ST.drag = handle ? { kind: 'crop-h', corner: [...handle.classList].find((c) => /^(nw|ne|sw|se)$/.test(c)), c0: { ...ST.crop } }
                     : { kind: 'crop-new', ox: p.x, oy: p.y };
    if (ST.drag.kind === 'crop-new') ST.crop = { x: p.x, y: p.y, w: 0, h: 0 };
  } else if (ST.tool === 'pen') {
    ST.marks.push({ type: 'pen', pts: [[p.x, p.y]], color: ST.color, w: ST.weight });
    ST.drag = { kind: 'pen' };
  } else if (ST.tool === 'box') {
    ST.marks.push({ type: 'box', x: p.x, y: p.y, w2: 0, h2: 0, color: ST.color, w: ST.weight });
    ST.drag = { kind: 'box', ox: p.x, oy: p.y };
  } else if (ST.tool === 'arrow') {
    ST.marks.push({ type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: ST.color, w: ST.weight });
    ST.drag = { kind: 'arrow' };
  } else if (ST.tool === 'text') {
    openStudioText(p);
    return;
  }
  window.addEventListener('pointermove', studioMove);
  window.addEventListener('pointerup', studioUp);
  drawStudio();
}
function studioMove(e) {
  if (!ST.drag) return;
  const p = stPoint(e);
  const d = ST.drag;
  const last = ST.marks[ST.marks.length - 1];
  if (d.kind === 'crop-new') {
    ST.crop = { x: Math.min(d.ox, p.x), y: Math.min(d.oy, p.y), w: Math.abs(p.x - d.ox), h: Math.abs(p.y - d.oy) };
  } else if (d.kind === 'crop-h') {
    const c = d.c0;
    const x1 = c.x, y1 = c.y, x2 = c.x + c.w, y2 = c.y + c.h;
    const nx1 = d.corner[1] === 'w' ? p.x : x1, nx2 = d.corner[1] === 'e' ? p.x : x2;
    const ny1 = d.corner[0] === 'n' ? p.y : y1, ny2 = d.corner[0] === 's' ? p.y : y2;
    ST.crop = { x: Math.min(nx1, nx2), y: Math.min(ny1, ny2), w: Math.abs(nx2 - nx1), h: Math.abs(ny2 - ny1) };
  } else if (d.kind === 'pen') {
    last.pts.push([p.x, p.y]);
  } else if (d.kind === 'box') {
    last.x = Math.min(d.ox, p.x); last.y = Math.min(d.oy, p.y);
    last.w2 = Math.abs(p.x - d.ox); last.h2 = Math.abs(p.y - d.oy);
  } else if (d.kind === 'arrow') {
    last.x2 = p.x; last.y2 = p.y;
  }
  drawStudio();
}
function studioUp() {
  window.removeEventListener('pointermove', studioMove);
  window.removeEventListener('pointerup', studioUp);
  const d = ST.drag; ST.drag = null;
  if (!d) return;
  // a click rather than a drag: keep the whole image, drop the empty mark
  if (d.kind === 'crop-new' && (ST.crop.w < 8 || ST.crop.h < 8)) {
    ST.crop = { x: 0, y: 0, w: ST.img.naturalWidth, h: ST.img.naturalHeight };
  }
  const last = ST.marks[ST.marks.length - 1];
  if (last && ((last.type === 'box' && (last.w2 < 4 || last.h2 < 4)) ||
               (last.type === 'arrow' && Math.hypot(last.x2 - last.x1, last.y2 - last.y1) < 6) ||
               (last.type === 'pen' && last.pts.length < 2))) ST.marks.pop();
  drawStudio();
}

function openStudioText(p) {
  const holder = $('stMarks');
  const inp = document.createElement('input');
  inp.className = 'st-text-in';
  inp.style.left = (p.x * ST.scale) + 'px';
  inp.style.top = (p.y * ST.scale) + 'px';
  inp.style.color = ST.color;
  inp.placeholder = t('studio.notePlaceholder');
  holder.appendChild(inp);
  inp.focus();
  // Enter commits and removes the field, which then fires blur — without this
  // latch the blur handler tries to remove it a second time and throws.
  let settled = false;
  const finish = (keep) => {
    if (settled) return;
    settled = true;
    const v = inp.value.trim();
    inp.remove();
    if (keep && v) {
      ST.marks.push({ type: 'text', x: p.x, y: p.y, text: v, color: ST.color, size: Math.max(14, ST.weight * 5) });
      drawStudio();
    }
  };
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  const commit = () => finish(true);
  inp.addEventListener('blur', commit);
}

function rotateStudio() {
  const c = document.createElement('canvas');
  c.width = ST.img.naturalHeight; c.height = ST.img.naturalWidth;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate(Math.PI / 2);
  g.drawImage(ST.img, -ST.img.naturalWidth / 2, -ST.img.naturalHeight / 2);
  const url = c.toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    ST.img = img; ST.src = url;
    ST.crop = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    ST.marks = [];                 // annotations were positioned for the old orientation
    fitStudio();
  };
  img.src = url;
}

function applyStudio() {
  if (!ST.img || !ST.target) { closeStudio(); return; }
  const cr = ST.crop;
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(cr.w));
  out.height = Math.max(1, Math.round(cr.h));
  const g = out.getContext('2d');
  g.drawImage(ST.img, cr.x, cr.y, cr.w, cr.h, 0, 0, out.width, out.height);
  ST.marks.forEach((m) => drawMark(g, m, 1, cr.x, cr.y));
  let url;
  try { url = out.toDataURL('image/png'); } catch (_) { toast(t('msg.imageNoEdit')); closeStudio(); return; }
  const img = ST.target;
  // remember where it came from so a second edit starts from the original
  if (!img.dataset.orig && !/^data:/i.test(img.src)) img.dataset.orig = img.src;
  img.src = url;
  closeStudio();
  persistEdit();
  setTimeout(placeImgChrome, 60);
  toast(t('msg.imageUpdated'));
}
