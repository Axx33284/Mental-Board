/* A book (3.0) — a PDF of any length, or a blank notebook, read and written in.

   + ▸ Book from a PDF… or + ▸ Notebook (and the canvas's right-click menu).
   On the board it is its cover, its title and how many pages it has; a
   double-click opens it full screen, where it reads two ways:

   - **book** — two pages side by side, the first one alone on the right as a
     cover is, and a page turns over like paper (a leaf with the old right
     page on its front and the new left page on its back, `bookTurn`). One
     page at a time when the window is too narrow for two.
   - **scroll** — every page one under the other, as a PDF reader shows them;
     only the pages near the screen are drawn (`bookFillNear`), so a 200-page
     PDF costs what a few pages cost.

   Every page takes ink — the drawing note's pen, marker, brush and eraser,
   pressure and all (ink.js does the drawing; nothing here has a second
   copy of it). With the hand (H) a mouse turns and scrolls; a pen always
   writes. Strokes are kept per page in page units — a page is BOOK_U wide —
   so they sit on the same words at any zoom.

   **It is a note**, `{ book: { title, kind, pages, ar, paper, view, at, ink } }`,
   the way a drawing note is (sketch.js): the gesture engine, undo, the
   clipboard, the bin and the save path have no second branch. Its files —
   the PDF and the cover picture — are in its **body** (`bookBody`), an
   `<img>` and an `<a>`, so every pass that keeps, carries and relinks a
   board's files sees them unchanged. The PDF is copied into the board's
   folder once, read from there through mbf://, and drawn by pdf.js a page
   at a time as pages come into view.

   Saving is the drawing note's: every change goes into the note and through
   saveSoon() as it lands (`commitBook`), and one visit is one step of the
   board's undo. */
const BOOK_PAGES_MAX = 3000;
const BOOK_INK_MAX = 3000;       // strokes on one page
const BOOK_U = 1000;             // a page is this many units wide
const BOOK_PAPERS = ['ruled', 'dots', 'grid', 'plain'];
const BOOK_VIEWS = ['book', 'scroll'];
const BOOK_TOOLS = ['hand', 'pen', 'marker', 'brush', 'eraser'];
const BOOK_TITLE_H = 44;         // the title under the cover on the board, in note px

function okBook(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const pages = clamp(Math.round(+raw.pages || 1), 1, BOOK_PAGES_MAX);
  const ink = {};
  if (raw.ink && typeof raw.ink === 'object') {
    for (const k of Object.keys(raw.ink)) {
      const i = +k;
      if (!Number.isInteger(i) || i < 0 || i >= pages) continue;
      const st = adoptInk(raw.ink[k]).slice(0, BOOK_INK_MAX);
      if (st.length) ink[i] = st;
    }
  }
  return {
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
    kind: raw.kind === 'pdf' ? 'pdf' : 'blank',
    pages,
    ar: clamp(+raw.ar || 1.414, 0.2, 5),
    paper: BOOK_PAPERS.includes(raw.paper) ? raw.paper : 'ruled',
    view: BOOK_VIEWS.includes(raw.view) ? raw.view : 'book',
    at: clamp(Math.round(+raw.at || 0), 0, pages - 1),
    ink
  };
}
// the book's files, from its body: the cover picture and (for a PDF) the PDF
function bookFiles(n) {
  const tpl = document.createElement('template');
  tpl.innerHTML = (n && n.body) || '';
  const img = tpl.content.querySelector('img'), a = tpl.content.querySelector('a.mb-file');
  return { cover: img ? img.getAttribute('src') || '' : '', pdf: a ? a.getAttribute('href') || '' : '', name: a ? a.getAttribute('data-name') || '' : '' };
}
function bookBody(cover, pdf, name) {
  return (cover ? `<img class="mb-img" src="${esc(cover)}" data-name="${esc((name || 'book').replace(/\.pdf$/i, '') + ' cover.png')}">` : '') +
    (pdf ? `<a class="mb-file" href="${esc(pdf)}" data-name="${esc(name || 'book.pdf')}">${esc(name || 'book.pdf')}</a>` : '');
}

/* ---- making one ---- */
function addNotebook(worldPt) {
  if (!canEditHere()) return null;
  const n = addNote(worldPt, { book: { title: '', kind: 'blank', pages: 12, ar: 1.414, paper: 'ruled' }, w: 220, h: Math.round(220 * 1.3) + BOOK_TITLE_H, edit: false });
  if (n) openBook(n.id);
  return n;
}
async function addBookFromPdf(worldPt) {
  if (!canEditHere() || !FILES || !FILES.pickBook) return null;
  const at = worldPt || viewCenterWorld();
  const pick = await FILES.pickBook();
  if (!pick) return null;
  if (pick.error) { toast(t('book.cannotOpen')); return null; }
  return bookFromFile(pick, at);
}
// `pick` is { path, name }: the PDF is copied into the board's folder, measured, and its first page is the cover
async function bookFromFile(pick, at) {
  toast(t('book.making', { name: pick.name }));
  const r = await FILES.attach(pick.path, state.activeBoard, pick.name);
  if (!r || r.error || !r.url) { toast(t('msg.fileFailed', { name: pick.name })); return null; }
  let doc;
  try { doc = await bookOpenPdf(r.url); } catch (err) { console.warn('book: pdf.js could not read it', err); toast(t('book.cannotOpen')); return null; }
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const ar = v1.height / v1.width;
    // the cover: page one, 480 px wide, into the board's folder like any picture
    const vp = page.getViewport({ scale: 480 / v1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const cover = await keepSketchPicture(c.toDataURL('image/png'), pick.name.replace(/\.pdf$/i, '') + ' cover.png');
    const pages = Math.min(doc.numPages, BOOK_PAGES_MAX);
    const w = 220;
    const n = addNote(at, {
      book: { title: pick.name.replace(/\.pdf$/i, ''), kind: 'pdf', pages, ar, paper: 'plain' },
      body: bookBody(cover, r.url, pick.name), w, h: Math.round(w * Math.min(ar, 1.8)) + BOOK_TITLE_H, edit: false
    });
    if (doc.numPages > BOOK_PAGES_MAX) toast(t('book.tooLong', { n: BOOK_PAGES_MAX }));
    else toast(t('book.made', { n: pages }));
    return n;
  } finally { doc.destroy(); }
}
/* pdf.js on a file in the board's folder. pdf.js streams only http(s) — on any
   other scheme it asks XMLHttpRequest, which reads mbf:// as status 0 and
   gives up — so the bytes are fetched here (mbf is registered with fetch) and
   handed over whole. Pages are still drawn one at a time, as they are shown. */
async function bookOpenPdf(url) {
  const L = await loadPdfJs();
  const res = await fetch(url);
  if (!res.ok) throw new Error('the PDF is not in the board\'s folder (' + res.status + ')');
  const data = new Uint8Array(await res.arrayBuffer());
  return L.getDocument({
    data, isEvalSupported: false,
    cMapUrl: 'assets/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'assets/pdfjs/standard_fonts/'
  }).promise;
}

/* ---- on the board ---- */
function fillBook(el, n) {
  delete el.dataset.stub;
  el.classList.add('book');
  const B = n.book, f = bookFiles(n);
  el.dataset.paper = B.paper;
  el.innerHTML =
    `<div class="bk-face">` +
      `<div class="bk-cover${f.cover ? '' : ' blank'}">${f.cover ? `<img src="${esc(f.cover)}" alt="" draggable="false">` : `<span class="bk-cover-title" dir="auto"></span><i class="bk-band"></i>`}</div>` +
      `<div class="bk-meta"><span class="bk-title" dir="auto"></span><span class="bk-count"></span></div>` +
    `</div><div class="note-status hidden"></div>${rzHtml()}`;
  paintBook(el, n);
  paintNoteStatus(el, n);
}
function paintBook(el, n) {
  const B = n.book;
  const title = B.title || t('book.untitled');
  el.querySelector('.bk-title').textContent = title;
  el.querySelector('.bk-title').classList.toggle('empty', !B.title);
  const ct = el.querySelector('.bk-cover-title');
  if (ct) ct.textContent = B.title || '';
  const inked = Object.keys(B.ink || {}).length;
  el.querySelector('.bk-count').textContent = t('book.pages', { n: B.pages }) + (inked ? ' · ' + t('book.written', { n: inked }) : '');
}
// the board picture (edit-ops.js paintBoardCanvas): the cover, or a plain cover, and the title
function paintBookOnCanvas(ctx, n, pal, font, pictures) {
  const img = pictures && pictures.get(n.id);
  const room = { x: n.x + 8, y: n.y + 8, w: n.w - 16, h: n.h - BOOK_TITLE_H - 8 };
  ctx.fillStyle = pal.noteBg(n.color);
  ctx.fillRect(n.x, n.y, n.w, n.h);
  if (img) {
    const k = Math.min(room.w / img.naturalWidth, room.h / img.naturalHeight);
    const w = img.naturalWidth * k, h = img.naturalHeight * k;
    try { ctx.drawImage(img, room.x + (room.w - w) / 2, room.y + (room.h - h) / 2, w, h); } catch (_) {}
  } else {
    ctx.fillStyle = pal.noteInk(n.color);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(room.x, room.y, room.w, room.h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = pal.text;
  ctx.font = `600 14px ${font}`;
  ctx.textBaseline = 'middle';
  ctx.fillText(n.book.title || t('book.untitled'), n.x + 12, n.y + n.h - BOOK_TITLE_H / 2, n.w - 24);
}

/* ---- the reader ---- */
let bk = null;     // { n, doc, ink, undo, redo, view, at, zoom, tool, color, size, live, erase, dirty, undoTaken, turning }
const bookOpen = () => !!bk;

function openBook(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.book) return;
  if (editing) exitEdit();
  if (inkMode) toggleInk(false);
  closeCtxMenu();
  const B = n.book, p = state.settings.bookPen || {};
  bk = {
    n, doc: null, docP: null, ink: Object.assign({}, B.ink), undo: [], redo: [], view: B.view, at: B.at, zoom: 1,
    tool: BOOK_TOOLS.includes(p.tool) ? p.tool : 'hand', color: inkColorOk(p.color) ? p.color : 'text', size: [0, 1, 2].includes(p.size) ? p.size : 1,
    live: null, erase: null, dirty: false, undoTaken: false, turning: false, cache: new Map(), penSeen: false
  };
  const dlg = $('bookDlg');
  dlg.classList.remove('hidden');
  dlg.dataset.paper = B.paper;
  $('bkTitle').value = B.title;
  const f = bookFiles(n);
  if (B.kind === 'pdf' && f.pdf) {
    bk.docP = bookOpenPdf(f.pdf).then((doc) => { if (bk && bk.n === n) { bk.doc = doc; bookLayout(); } else doc.destroy(); return doc; })
      .catch((err) => { console.warn('book: the PDF did not open', err); bookSay(t('book.cannotOpen')); });
  }
  buildBookBar();
  if (state.settings.sketchFull !== false && dlg.requestFullscreen && !document.fullscreenElement) dlg.requestFullscreen().catch(() => {});
  requestAnimationFrame(() => requestAnimationFrame(() => { if (bk) bookLayout(); }));
}
function closeBook() {
  if (!bk) return;
  endBookStroke();
  if (bk.dirty) commitBook();
  const { n, undoTaken, doc } = bk;
  bk = null;
  if (doc) doc.destroy();
  $('bookDlg').classList.add('hidden');
  $('bkSpread').textContent = '';
  $('bkScroll').textContent = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const el = els.get(n.id);
  if (el) paintBook(el, n);
  if (undoTaken) { drawLinks(); scheduleMinimap(); }
  saveSoon();
}
// into the note as it changes; one step of the board's undo per visit (sketch.js commitSketch)
function commitBook() {
  if (!bk) return;
  const n = bk.n;
  if (!bk.undoTaken) { pushUndo(); bk.undoTaken = true; }
  const ink = {};
  for (const k of Object.keys(bk.ink)) if (bk.ink[k] && bk.ink[k].length) ink[k] = bk.ink[k];
  n.book = Object.assign({}, n.book, { title: $('bkTitle').value.trim().slice(0, 120), ink, view: bk.view, at: bk.at });
  bk.dirty = false;
  saveSoon();
}
// where the reader is (the page, the view) is kept without an undo step — it is not an edit
function keepBookPlace() {
  if (!bk) return;
  bk.n.book = Object.assign({}, bk.n.book, { view: bk.view, at: bk.at });
  saveSoon();
}
function bookSay(msg) {
  const el = $('bkNote');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(bookSay.timer);
  bookSay.timer = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ---- the bar ---- */
function buildBookBar() {
  const bar = $('bkBar'), B = bk.n.book;
  const tool = (k, ic, tip) => `<button class="ik-tool${bk.tool === k ? ' on' : ''}" data-tool="${k}" title="${tip}" aria-label="${tip}">${icon(ic)}</button>`;
  const btn = (k, ic, tip) => `<button class="ik-btn" data-bk="${k}" title="${tip}" aria-label="${tip}">${icon(ic)}</button>`;
  const sw = (c) => `<button class="ik-sw${bk.color === c ? ' on' : ''}" data-ink-color="${c}" style="--sw:${inkColorCss(c)}" title="${c === 'text' ? te('ink.colorText') : te('colour.' + c)}"></button>`;
  const sizeTips = [te('ink.size0'), te('ink.size1'), te('ink.size2')];
  bar.innerHTML =
    `<span class="bk-views">` +
      `<button class="bk-view${bk.view === 'book' ? ' on' : ''}" data-view="book">${icon('auto_stories')}<span>${te('book.viewBook')}</span></button>` +
      `<button class="bk-view${bk.view === 'scroll' ? ' on' : ''}" data-view="scroll">${icon('view_list')}<span>${te('book.viewScroll')}</span></button>` +
    `</span><span class="ik-sep"></span>` +
    btn('prev', 'chevron_left', te('book.prev')) +
    `<label class="bk-at"><input type="number" id="bkAt" min="1" max="${B.pages}" value="${bk.at + 1}"><span>/ ${num(B.pages)}</span></label>` +
    btn('next', 'chevron_right', te('book.next')) +
    `<span class="ik-sep"></span>` +
    tool('hand', 'mouse', te('book.hand')) + tool('pen', 'ink_pen', te('ink.pen')) + tool('marker', 'ink_highlighter', te('ink.marker')) +
    tool('brush', 'brush', te('ink.brush')) + tool('eraser', 'ink_eraser', te('ink.eraser')) +
    `<span class="ik-sep"></span>` +
    [0, 1, 2].map((i) => `<button class="ik-size${bk.size === i ? ' on' : ''}" data-size="${i}" title="${sizeTips[i]}"><i style="--d:${[4, 7, 11][i]}px"></i></button>`).join('') +
    ['text', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'].filter((c) => c === 'text' || COLORS.includes(c)).map(sw).join('') +
    `<span class="ik-sep"></span>` +
    btn('zout', 'zoom_out', te('zoom.out')) + `<button class="ik-btn sk-pct" data-bk="fit" title="${te('zoom.fit')}">${pct(Math.round(bk.zoom * 100))}</button>` + btn('zin', 'zoom_in', te('zoom.in')) +
    `<span class="ik-sep"></span>` +
    btn('undo', 'undo', te('menu.undo')) + btn('redo', 'redo', te('menu.redo')) +
    (B.kind === 'blank' ? btn('addpage', 'library_add', te('book.addPage')) : '') +
    btn('clear', 'delete_sweep', te('book.clearPage')) + btn('full', 'open_in_full', te('sketch.fullScreen')) +
    `<button class="ik-btn ik-done" data-bk="done" title="${te('ink.done')}" aria-label="${te('ink.done')}">${icon('check')}</button>`;
  const keep = () => { state.settings.bookPen = { tool: bk.tool, color: bk.color, size: bk.size }; saveSoon(); };
  bar.querySelectorAll('[data-tool]').forEach((el) => onPress(el, () => { bk.tool = el.dataset.tool; keep(); buildBookBar(); }));
  bar.querySelectorAll('[data-size]').forEach((el) => onPress(el, () => { bk.size = +el.dataset.size; keep(); buildBookBar(); }));
  bar.querySelectorAll('[data-ink-color]').forEach((el) => onPress(el, () => { bk.color = el.dataset.inkColor; if (bk.tool === 'hand' || bk.tool === 'eraser') bk.tool = 'pen'; keep(); buildBookBar(); }));
  bar.querySelectorAll('[data-view]').forEach((el) => onPress(el, () => { if (bk.view !== el.dataset.view) { bk.view = el.dataset.view; keepBookPlace(); buildBookBar(); bookLayout(); } }));
  bar.querySelectorAll('[data-bk]').forEach((el) => onPress(el, () => {
    const act = el.dataset.bk;
    if (act === 'done') closeBook();
    else if (act === 'prev') bookGo(-1);
    else if (act === 'next') bookGo(1);
    else if (act === 'zin') bookZoom(bk.zoom * 1.25);
    else if (act === 'zout') bookZoom(bk.zoom / 1.25);
    else if (act === 'fit') bookZoom(1);
    else if (act === 'undo') bookUndo(true);
    else if (act === 'redo') bookUndo(false);
    else if (act === 'addpage') bookAddPage();
    else if (act === 'clear') bookClearPage();
    else if (act === 'full') { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else $('bookDlg').requestFullscreen().catch(() => {}); }
  }));
  const at = $('bkAt');
  at.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { bookGoTo(clamp(Math.round(+at.value || 1), 1, B.pages) - 1); at.blur(); }
    if (e.key === 'Escape') { at.value = bk.at + 1; at.blur(); }
  });
  at.addEventListener('change', () => bookGoTo(clamp(Math.round(+at.value || 1), 1, B.pages) - 1));
  bar.querySelector('[data-bk="undo"]').disabled = !bk.undo.length;
  bar.querySelector('[data-bk="redo"]').disabled = !bk.redo.length;
  $('bookDlg').classList.toggle('bk-hand', bk.tool === 'hand');
}
function bookShowAt() {
  const at = $('bkAt');
  if (at && document.activeElement !== at) at.value = bk.at + 1;
}

/* ---- the layout: a spread, or a scroll ---- */
// two pages side by side when the window is wide enough for two readable pages
function bookTwoUp() {
  const r = $('bkStage').getBoundingClientRect();
  return bk.view === 'book' && r.width > r.height / bk.n.book.ar * 1.35 && r.width > 760;
}
// a page's size on screen at this zoom
function bookPageSize() {
  const r = $('bkStage').getBoundingClientRect(), ar = bk.n.book.ar;
  let ph;
  if (bk.view === 'scroll') ph = Math.min(r.width - 80, 920) * ar;          // a column, as a PDF reader shows it
  else if (bookTwoUp()) ph = Math.min(r.height - 56, (r.width - 96) / 2 * ar);
  else ph = Math.min(r.height - 56, (r.width - 64) * ar);
  ph = Math.max(120, ph) * bk.zoom;
  return { w: Math.round(ph / ar), h: Math.round(ph) };
}
// the pages the spread shows: the first alone on the right, then 1–2, 3–4…
function bookSpreadOf(at) {
  if (!bookTwoUp()) return [at];
  const B = bk.n.book;
  if (at === 0) return [null, 0];
  const left = at % 2 ? at : at - 1;
  return [left, left + 1 < B.pages ? left + 1 : null];
}
function bookLayout() {
  if (!bk) return;
  const stage = $('bkStage'), spread = $('bkSpread'), scroll = $('bkScroll');
  stage.dataset.view = bk.view;
  const S = bookPageSize();
  bk.ps = S;
  if (bk.view === 'scroll') {
    spread.textContent = '';
    spread.classList.add('hidden'); scroll.classList.remove('hidden');
    const B = bk.n.book;
    // a placeholder for every page, filled when it comes near (bookFillNear)
    if (scroll.childElementCount !== B.pages || scroll.dataset.w !== String(S.w)) {
      scroll.textContent = '';
      scroll.dataset.w = String(S.w);
      const frag = document.createDocumentFragment();
      for (let i = 0; i < B.pages; i++) {
        const ph = document.createElement('div');
        ph.className = 'bk-slot'; ph.dataset.p = String(i);
        ph.style.width = S.w + 'px'; ph.style.height = S.h + 'px';
        frag.appendChild(ph);
      }
      scroll.appendChild(frag);
      const slot = scroll.children[bk.at];
      if (slot) scroll.scrollTop = slot.offsetTop - 24;
    }
    bookFillNear();
  } else {
    scroll.textContent = ''; scroll.classList.add('hidden'); spread.classList.remove('hidden');
    bookPaintSpread();
  }
  bookShowAt();
}
function bookPaintSpread() {
  const spread = $('bkSpread'), S = bk.ps;
  const pages = bookSpreadOf(bk.at);
  spread.textContent = '';
  spread.classList.toggle('two', pages.length === 2);
  spread.style.setProperty('--pw', S.w + 'px');
  spread.style.setProperty('--ph', S.h + 'px');
  pages.forEach((p, side) => {
    const slot = document.createElement('div');
    slot.className = 'bk-side ' + (pages.length === 1 ? 'one' : side ? 'right' : 'left');
    if (p != null) slot.appendChild(bookPageEl(p, S));
    spread.appendChild(slot);
  });
}
// near the screen gets drawn, far from it is let go
function bookFillNear() {
  if (!bk || bk.view !== 'scroll') return;
  const scroll = $('bkScroll'), top = scroll.scrollTop, h = scroll.clientHeight;
  let best = bk.at, bestD = Infinity;
  for (const slot of scroll.children) {
    const y = slot.offsetTop, near = y + slot.offsetHeight > top - h && y < top + h * 2;
    const i = +slot.dataset.p;
    if (near && !slot.firstChild) slot.appendChild(bookPageEl(i, bk.ps));
    else if (!near && slot.firstChild) slot.textContent = '';
    const d = Math.abs(y + slot.offsetHeight / 2 - (top + h / 2));
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best !== bk.at) { bk.at = best; bookShowAt(); clearTimeout(bookFillNear.keep); bookFillNear.keep = setTimeout(keepBookPlace, 800); }
}

/* ---- a page ---- */
function bookPageEl(i, S) {
  const B = bk.n.book;
  const pg = document.createElement('div');
  pg.className = 'bk-page';
  pg.dataset.p = String(i);
  pg.style.width = S.w + 'px'; pg.style.height = S.h + 'px';
  pg.style.setProperty('--u', (S.w / BOOK_U) + 'px');      // one page unit on screen: the notebook's lines are drawn in it
  if (B.kind === 'pdf') {
    const c = document.createElement('canvas');
    c.className = 'bk-pdf';
    pg.appendChild(c);
    bookRenderPage(i, c, S);
  }
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'bk-ink');
  svg.setAttribute('viewBox', `0 0 ${BOOK_U} ${r1(BOOK_U * B.ar)}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const s of bk.ink[i] || []) svg.appendChild(makeInkEl(s));
  pg.appendChild(svg);
  const no = document.createElement('span');
  no.className = 'bk-no';
  no.textContent = num(i + 1);
  pg.appendChild(no);
  return pg;
}
/* pdf.js draws a page at the size it is shown, times the screen's density (at
   most 2.5). A drawn page is kept (the last dozen) and copied for the next
   element that shows it — a turn, a redraw, the scroll coming back. */
async function bookRenderPage(i, canvas, S) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const W = Math.round(S.w * dpr), H = Math.round(S.h * dpr);
  canvas.width = W; canvas.height = H;
  const key = i + '@' + W;
  const hit = bk.cache.get(key);
  const g = canvas.getContext('2d');
  if (hit) { g.drawImage(hit, 0, 0, W, H); return; }
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const book = bk;
  await null;              // the page is put in the document after this is called, in the same task
  if (bk !== book) return;                  // closed meanwhile
  const doc = book.doc || (book.docP && await book.docP);
  if (!doc || bk !== book || !canvas.isConnected) return;
  try {
    const page = await doc.getPage(i + 1);
    if (bk !== book || !canvas.isConnected) return;
    const v1 = page.getViewport({ scale: 1 });
    const k = Math.min(W / v1.width, H / v1.height);
    const vp = page.getViewport({ scale: k });
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const og = off.getContext('2d');
    og.fillStyle = '#fff'; og.fillRect(0, 0, W, H);
    og.translate((W - vp.width) / 2, (H - vp.height) / 2);
    await page.render({ canvasContext: og, viewport: vp }).promise;
    page.cleanup();
    if (bk !== book) return;
    book.cache.set(key, off);
    if (book.cache.size > 12) book.cache.delete(book.cache.keys().next().value);
    if (canvas.isConnected) g.drawImage(off, 0, 0);
  } catch (err) { console.warn('book: page ' + (i + 1) + ' would not draw', err); }
}

/* ---- moving through it ---- */
function bookGo(dir) {
  if (!bk || bk.turning) return;
  const B = bk.n.book;
  if (bk.view === 'scroll') { bookGoTo(clamp(bk.at + dir, 0, B.pages - 1)); return; }
  const pages = bookSpreadOf(bk.at);
  let to;
  if (pages.length === 1) to = bk.at + dir;
  else if (dir > 0) to = (pages[1] != null ? pages[1] : pages[0]) + 1;
  else to = (pages[0] != null ? pages[0] : 0) - 1;
  if (to < 0 || to >= B.pages) return;
  bookTurn(dir, to);
}
function bookGoTo(i) {
  if (!bk) return;
  const B = bk.n.book;
  i = clamp(i, 0, B.pages - 1);
  if (bk.view === 'scroll') {
    const slot = $('bkScroll').children[i];
    bk.at = i;
    if (slot) $('bkScroll').scrollTop = slot.offsetTop - 24;
    bookFillNear();
  } else {
    bk.at = i;
    bookPaintSpread();
  }
  bookShowAt();
  keepBookPlace();
}
/* A page turned over: the leaf carries the page being turned on its front and
   the page it reveals on its back, and swings about the spine. Under it the
   spread is already half the new one, so when the leaf lands nothing jumps. */
function bookTurn(dir, to) {
  const spread = $('bkSpread'), S = bk.ps;
  const from = bookSpreadOf(bk.at), next = bookSpreadOf(to);
  const reduced = document.body.dataset.motion === 'reduced' || (document.body.dataset.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  bk.at = to;
  bookShowAt();
  keepBookPlace();
  if (reduced) { bookPaintSpread(); return; }
  bk.turning = true;
  const two = from.length === 2;
  // under the leaf: the side that stays, and the side that is coming
  spread.textContent = '';
  const side = (p, cls) => { const s = document.createElement('div'); s.className = 'bk-side ' + cls; if (p != null) s.appendChild(bookPageEl(p, S)); spread.appendChild(s); return s; };
  if (two) {
    if (dir > 0) { side(from[0], 'left'); side(next[1], 'right'); }
    else { side(next[0], 'left'); side(from[1], 'right'); }
  } else side(next[0], 'one');
  const leaf = document.createElement('div');
  leaf.className = 'bk-leaf ' + (two ? (dir > 0 ? 'fwd' : 'back') : (dir > 0 ? 'fwd one' : 'back one'));
  const face = (p, cls) => { const f = document.createElement('div'); f.className = 'bk-face-' + cls; if (p != null) f.appendChild(bookPageEl(p, S)); leaf.appendChild(f); };
  if (two) {
    if (dir > 0) { face(from[1], 'front'); face(next[0], 'back'); }
    else { face(from[0], 'front'); face(next[1], 'back'); }
  } else { face(from[0], 'front'); face(null, 'back'); }
  spread.appendChild(leaf);
  leaf.addEventListener('animationend', () => { bk && (bk.turning = false); if (bk) bookPaintSpread(); }, { once: true });
  // a safety net: an animation that never ends (a hidden window) must not freeze the book
  setTimeout(() => { if (bk && bk.turning) { bk.turning = false; bookPaintSpread(); } }, 1200);
}
function bookZoom(z) {
  if (!bk) return;
  bk.zoom = clamp(z, 0.4, 4);
  bk.cache.clear();
  $('bkScroll').dataset.w = '';
  bookLayout();
  const p = $('bkBar').querySelector('[data-bk="fit"]');
  if (p) p.textContent = pct(Math.round(bk.zoom * 100));
}

/* ---- ink on a page ---- */
function bookStep(page) {
  bk.undo.push({ page, strokes: (bk.ink[page] || []).slice() });
  if (bk.undo.length > 200) bk.undo.shift();
  bk.redo = [];
  bk.dirty = true;
}
function bookUndo(back) {
  const from = back ? bk.undo : bk.redo, to = back ? bk.redo : bk.undo;
  if (!from.length) return;
  const s = from.pop();
  to.push({ page: s.page, strokes: (bk.ink[s.page] || []).slice() });
  bk.ink[s.page] = s.strokes;
  bk.dirty = true;
  commitBook();
  if (bk.view === 'book') bookGoTo(s.page); else { bookRepaintInk(s.page); bookGoTo(s.page); }
  buildBookBar();
}
function bookRepaintInk(page) {
  document.querySelectorAll(`#bookDlg .bk-page[data-p="${page}"] .bk-ink`).forEach((svg) => {
    svg.textContent = '';
    for (const s of bk.ink[page] || []) svg.appendChild(makeInkEl(s));
  });
}
function bookClearPage() {
  const p = bk.at;
  if (!(bk.ink[p] || []).length) return;
  bookStep(p);
  bk.ink[p] = [];
  commitBook(); bookRepaintInk(p); buildBookBar();
}
function bookAddPage() {
  const B = bk.n.book;
  if (B.kind !== 'blank' || B.pages >= BOOK_PAGES_MAX) return;
  if (!bk.undoTaken) { pushUndo(); bk.undoTaken = true; }
  bk.n.book = Object.assign({}, B, { pages: B.pages + 1 });
  saveSoon();
  buildBookBar();
  bookGoTo(B.pages);
}
// a pointer's place on a page, in page units, and how many screen px one unit is
function bookPoint(e, pg) {
  const r = pg.getBoundingClientRect();
  const k = r.width / BOOK_U;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k };
}
function onBookDown(e) {
  if (!bk || bk.turning) return;
  const pg = e.target.closest && e.target.closest('#bookDlg .bk-page');
  if (e.pointerType === 'pen') bk.penSeen = true;
  else if (e.pointerType === 'touch' && bk.penSeen) return;          // a palm, once a pen has been used
  const tool = e.pointerType === 'pen' && bk.tool === 'hand' ? 'pen' : bk.tool;   // a pen always writes
  if (tool === 'hand' || !pg) {
    // the hand: a click on the outer part of a page turns it (book view)
    if (bk.view === 'book' && e.button === 0 && pg) {
      const r = pg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      const side = pg.parentElement.classList;
      if ((side.contains('right') || side.contains('one')) && x > 0.6) bookGo(1);
      else if ((side.contains('left') || side.contains('one')) && x < 0.4) bookGo(-1);
    }
    return;
  }
  if (e.button !== 0 && e.button !== 5) return;
  e.preventDefault();
  const page = +pg.dataset.p, at = bookPoint(e, pg);
  try { pg.setPointerCapture(e.pointerId); } catch (_) {}
  window.addEventListener('pointermove', onBookMove);
  window.addEventListener('pointerup', onBookUp);
  window.addEventListener('pointercancel', onBookUp);
  if (tool === 'eraser' || e.button === 5 || (e.pointerType === 'pen' && (e.buttons & 2))) {
    bk.erase = { page, pg, r: INK_SIZES.eraser[bk.size] / at.k, last: null, hit: false, id: e.pointerId };
    bookEraseAt(at);
    return;
  }
  if ((bk.ink[page] || []).length >= BOOK_INK_MAX) { bookSay(t('sketch.full')); return; }
  const s = { id: uid(), tool, color: bk.color, size: Math.round(INK_SIZES[tool][bk.size] / at.k * 100) / 100 };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + tool);
  const c = inkColorCss(s.color);
  if (tool === 'brush') el.style.fill = c; else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  pg.querySelector('.bk-ink').appendChild(el);
  bk.live = { s, raw: [], el, k: at.k, page, pg, id: e.pointerId, frame: 0 };
  bookAddPoint(e);
}
function bookAddPoint(e) {
  const L = bk.live, w = bookPoint(e, L.pg);
  const last = L.raw[L.raw.length - 1];
  if (last && Math.hypot(w.x - last.x, w.y - last.y) * L.k < 0.6) return;
  L.raw.push({ x: w.x, y: w.y, p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : null, t: e.timeStamp || performance.now() });
  if (!L.frame) L.frame = requestAnimationFrame(() => {
    if (!bk || bk.live !== L) return;
    L.frame = 0;
    const pts = [];
    L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
    L.el.setAttribute('d', L.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(L.raw, L.s.size, L.k)) : inkLinePath(pts));
  });
}
function onBookMove(e) {
  if (!bk) return;
  if (bk.erase && e.pointerId === bk.erase.id) { bookEraseAt(bookPoint(e, bk.erase.pg)); return; }
  if (!bk.live || e.pointerId !== bk.live.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) evs.forEach(bookAddPoint); else bookAddPoint(e);
}
function onBookUp(e) {
  const g = bk && (bk.live || bk.erase);
  if (g && e.pointerId !== g.id) return;
  endBookStroke();
}
function endBookStroke() {
  window.removeEventListener('pointermove', onBookMove);
  window.removeEventListener('pointerup', onBookUp);
  window.removeEventListener('pointercancel', onBookUp);
  if (!bk) return;
  if (bk.erase) { const E = bk.erase; bk.erase = null; if (E.hit) { commitBook(); buildBookBar(); } }
  const L = bk.live;
  if (!L) return;
  bk.live = null;
  if (L.frame) cancelAnimationFrame(L.frame);
  if (!L.raw.length) { L.el.remove(); return; }
  const pts = [];
  L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  if (pts.length === 2) pts.push(pts[0] + 0.1, pts[1]);        // a dot
  L.s.pts = pts;
  if (L.s.tool === 'brush') L.s.ws = brushWidths(L.raw, L.s.size, L.k);
  bookStep(L.page);
  bk.ink[L.page] = (bk.ink[L.page] || []).concat([L.s]);
  L.el.dataset.id = L.s.id;
  L.el.setAttribute('d', inkPath(L.s));
  commitBook();
  buildBookBar();
}
// whole strokes along the sweep, as everywhere else (ink.js eraseAt)
function bookEraseAt(w) {
  const E = bk.erase;
  const from = E.last || w;
  E.last = w;
  const list = bk.ink[E.page] || [];
  const steps = Math.max(1, Math.ceil(Math.hypot(w.x - from.x, w.y - from.y) / (E.r * 0.5)));
  const gone = new Set();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps, p = { x: from.x + (w.x - from.x) * k, y: from.y + (w.y - from.y) * k };
    for (const s of list) if (!gone.has(s) && strokeNear(s, p, E.r)) gone.add(s);
  }
  if (!gone.size) return;
  if (!E.hit) { bookStep(E.page); E.hit = true; }
  bk.ink[E.page] = list.filter((s) => !gone.has(s));
  bk.dirty = true;
  bookRepaintInk(E.page);
}

/* ---- keys: every one goes to the reader while it is open (init.js onKeyDown) ---- */
function onBookKey(e) {
  if (e.target.closest && e.target.closest('input, textarea')) {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey, key = letterKey(e);
  if (e.key === 'Escape') { e.preventDefault(); closeBook(); return; }
  if (ctrl && key === 'z') { e.preventDefault(); bookUndo(!e.shiftKey); return; }
  if (ctrl && key === 'y') { e.preventDefault(); bookUndo(false); return; }
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); bookZoom(bk.zoom * 1.25); return; }
  if (ctrl && e.key === '-') { e.preventDefault(); bookZoom(bk.zoom / 1.25); return; }
  if (ctrl && e.key === '0') { e.preventDefault(); bookZoom(1); return; }
  if (ctrl) return;
  if (['ArrowRight', 'PageDown'].includes(e.key) || (e.key === ' ' && bk.view === 'book')) { e.preventDefault(); bookGo(document.documentElement.dir === 'rtl' && e.key === 'ArrowRight' ? -1 : 1); return; }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); bookGo(document.documentElement.dir === 'rtl' && e.key === 'ArrowLeft' ? 1 : -1); return; }
  if (e.key === 'Home') { e.preventDefault(); bookGoTo(0); return; }
  if (e.key === 'End') { e.preventDefault(); bookGoTo(bk.n.book.pages - 1); return; }
  const tools = { h: 'hand', d: 'pen', m: 'marker', b: 'brush', e: 'eraser' };
  if (tools[key]) { bk.tool = tools[key]; state.settings.bookPen = { tool: bk.tool, color: bk.color, size: bk.size }; buildBookBar(); return; }
  if (e.key === '[' || e.key === ']') { bk.size = clamp(bk.size + (e.key === ']' ? 1 : -1), 0, 2); buildBookBar(); }
}

function wireBook() {
  const stage = $('bkStage');
  stage.addEventListener('pointerdown', onBookDown);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  $('bkScroll').addEventListener('scroll', () => { if (bk) requestAnimationFrame(bookFillNear); }, { passive: true });
  // the wheel: Ctrl zooms; in the book view a notch turns a page; in the scroll view it scrolls
  stage.addEventListener('wheel', (e) => {
    if (!bk) return;
    if (e.ctrlKey) { e.preventDefault(); bookZoom(bk.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); return; }
    if (bk.view === 'book' && bk.zoom <= 1.01) {
      e.preventDefault();
      const now = performance.now();
      if (now - (wireBook.wheelAt || 0) < 350 || Math.abs(e.deltaY) < 4) return;
      wireBook.wheelAt = now;
      bookGo(e.deltaY > 0 ? 1 : -1);
    }
  }, { passive: false });
  $('bkTitle').addEventListener('input', () => {
    if (!bk) return;
    bk.dirty = true;
    clearTimeout(bk.titleTimer);
    bk.titleTimer = setTimeout(commitBook, 600);
  });
  $('bkTitle').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
  window.addEventListener('resize', () => { if (bk) { clearTimeout(wireBook.rs); wireBook.rs = setTimeout(() => { if (bk) { bk.cache.clear(); $('bkScroll').dataset.w = ''; bookLayout(); } }, 120); } });
}
