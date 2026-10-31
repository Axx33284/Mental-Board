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

   **The pages are looked at through a camera** (3.0.2), the drawing note's
   own: they are laid out once at the size that fits, and a view `{ x, y, z }`
   moves and scales them (`setBookView`) on sketch.js's zoomPanSurface — the
   wheel at the pointer with Ctrl, Space or the middle button to drag, two
   fingers to pan and pinch, the hand to drag. A paired phone draws on the
   pages, pans, zooms and turns them (tablet.js). Nothing in the layout moves
   with the zoom, so a page's units under a stroke stay where they were; a
   PDF page is drawn again, sharper, once a zoom settles (`bookSharpen`).

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
const BOOK_ZMIN = 0.3, BOOK_ZMAX = 6;
const BOOK_PDF_PX = 12e6;        // the most pixels one drawn PDF page may have, at any zoom
const BOOK_CACHE_PX = 48e6;      // and the drawn pages kept, together
/* Settings ▸ Books (3.1): how a page turns and how long it takes, and the
   pages a new notebook has — its shape is its height over its width. */
const BOOK_TURNS = ['curl', 'slide', 'fade', 'none'];
const BOOK_SPEEDS = { slow: 950, normal: 640, fast: 380 };
const NB_SHAPES = { a4: 1.414, letter: 1.294, square: 1, wide: 0.707 };

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
// a new notebook is what Settings ▸ Books says: its paper, its page and how many
function addNotebook(worldPt) {
  if (!canEditHere()) return null;
  const s = state.settings, ar = NB_SHAPES[s.nbShape] || 1.414;
  const book = { title: '', kind: 'blank', pages: clamp(s.nbPages || 12, 1, BOOK_PAGES_MAX), ar, paper: s.nbPaper, view: s.bookView };
  const n = addNote(worldPt, { book, w: 220, h: Math.round(220 * Math.min(ar, 1.3)) + BOOK_TITLE_H, edit: false });
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
      book: { title: pick.name.replace(/\.pdf$/i, ''), kind: 'pdf', pages, ar, paper: 'plain', view: state.settings.bookView },
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
let bk = null;     // { n, doc, ink, undo, redo, view, at, cam, tool, color, size, live, erase, hand, dirty, undoTaken, turning }
let bkSurface = null;
const bookOpen = () => !!bk;

function openBook(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !n.book) return;
  if (editing) exitEdit();
  if (inkMode) toggleInk(false);
  closeCtxMenu();
  const B = n.book, p = state.settings.bookPen || {};
  bk = {
    n, doc: null, docP: null, ink: Object.assign({}, B.ink), undo: [], redo: [], view: B.view, at: B.at, cam: { x: 0, y: 0, z: 1 }, fitKey: '',
    tool: BOOK_TOOLS.includes(p.tool) ? p.tool : 'hand', color: inkColorOk(p.color) ? p.color : 'text', size: [0, 1, 2].includes(p.size) ? p.size : 1,
    live: null, erase: null, hand: null, dirty: false, undoTaken: false, turning: false, cache: new Map(), penSeen: false
  };
  const dlg = $('bookDlg');
  clearTimeout(closeBook.timer);
  dlg.classList.remove('hidden', 'bk-closing');
  dlg.dataset.paper = B.paper;
  dlg.classList.toggle('bk-nonum', !state.settings.bookNumbers);
  $('bkTitle').value = B.title;
  const f = bookFiles(n);
  if (B.kind === 'pdf' && f.pdf) {
    bk.docP = bookOpenPdf(f.pdf).then((doc) => { if (bk && bk.n === n) { bk.doc = doc; bookLayout(); } else doc.destroy(); return doc; })
      .catch((err) => { console.warn('book: the PDF did not open', err); bookSay(t('book.cannotOpen')); });
  }
  buildBookBar();
  if (typeof padHostChanged === 'function') padHostChanged();     // a paired phone draws in the book now (tablet.js)
  if (state.settings.bookFull !== false && dlg.requestFullscreen && !document.fullscreenElement) dlg.requestFullscreen().catch(() => {});
  requestAnimationFrame(() => requestAnimationFrame(() => { if (bk) bookLayout(); }));
}
function closeBook() {
  if (!bk) return;
  endBookStroke();
  bookTurnSettle();
  clearTimeout(bk.sharpT);
  if (bk.dirty) commitBook();
  const { n, undoTaken, doc } = bk;
  bk = null;
  if (doc) doc.destroy();
  // out of a window it fades and settles back (mental.css §91); out of full screen it simply goes
  const dlg = $('bookDlg'), gone = () => { dlg.classList.add('hidden'); dlg.classList.remove('bk-closing'); $('bkSpread').textContent = ''; $('bkScroll').textContent = ''; };
  if (document.fullscreenElement || motionReduced()) gone();
  else { dlg.classList.add('bk-closing'); closeBook.timer = setTimeout(() => { if (!bk) gone(); }, 190); }
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  const el = els.get(n.id);
  if (el) paintBook(el, n);
  if (undoTaken) { drawLinks(); scheduleMinimap(); }
  saveSoon();
  if (typeof padHostChanged === 'function') padHostChanged();
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
    btn('zout', 'zoom_out', te('zoom.out')) + `<button class="ik-btn sk-pct" data-bk="fit" title="${te('zoom.fit')}">${pct(Math.round(bk.cam.z * 100))}</button>` + btn('zin', 'zoom_in', te('zoom.in')) +
    `<span class="ik-sep"></span>` +
    btn('undo', 'undo', te('menu.undo')) + btn('redo', 'redo', te('menu.redo')) +
    (B.kind === 'blank' ? btn('addpage', 'library_add', te('book.addPage')) +
      `<button class="ik-btn bk-paper" data-bk="paper" title="${te('book.paperTip')}">${icon('grid_on')}<span>${te('set.nbPaper' + B.paper[0].toUpperCase() + B.paper.slice(1))}</span></button>` : '') +
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
    else if (act === 'zin') bkSurface.zoomCentre(1.25);
    else if (act === 'zout') bkSurface.zoomCentre(1 / 1.25);
    else if (act === 'fit') bookFit();
    else if (act === 'undo') bookUndo(true);
    else if (act === 'redo') bookUndo(false);
    else if (act === 'addpage') bookAddPage();
    else if (act === 'paper') bookNextPaper();
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
// (the stage's own size, not its box on screen: it is scaled while the reader opens, mental.css §91)
const bookStageSize = () => { const st = $('bkStage'); return { width: st.clientWidth, height: st.clientHeight }; };
function bookTwoUp() {
  const r = bookStageSize();
  return bk.view === 'book' && r.width > r.height / bk.n.book.ar * 1.35 && r.width > 760;
}
// a page's size when it fits (the camera at 100%); the zoom is the camera's, not the layout's
function bookPageSize() {
  const r = bookStageSize(), ar = bk.n.book.ar;
  let ph;
  if (bk.view === 'scroll') ph = Math.min(r.width - 80, 920) * ar;          // a column, as a PDF reader shows it
  else if (bookTwoUp()) ph = Math.min(r.height - 56, (r.width - 96) / 2 * ar);
  else ph = Math.min(r.height - 56, (r.width - 64) * ar);
  ph = Math.max(120, ph);
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
/* Laid out again when the view, the window or the PDF changes. The camera is
   kept while the pages keep their size, and fitted when they do not. */
function bookLayout() {
  if (!bk) return;
  bookTurnSettle();
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
    }
  } else {
    scroll.textContent = ''; scroll.dataset.w = ''; scroll.classList.add('hidden'); spread.classList.remove('hidden');
    bookPaintSpread();
  }
  const key = bk.view + ' ' + S.w + 'x' + S.h + ' ' + bookTwoUp();
  if (key !== bk.fitKey) { bk.fitKey = key; bookFit(); } else setBookView(bk.cam);
  if (bk.view === 'scroll') bookFillNear();
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
  if (typeof padDirty === 'function') padDirty();
}
// near the screen gets drawn, far from it is let go — "the screen" is what the camera sees
function bookFillNear() {
  if (!bk || bk.view !== 'scroll') return;
  const scroll = $('bkScroll'), z = bk.cam.z;
  const top = -bk.cam.y / z, h = $('bkStage').clientHeight / z;
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

/* ---- the camera ---- */
const bookContent = () => $(bk.view === 'scroll' ? 'bkScroll' : 'bkSpread');
function setBookView(v) {
  if (!bk) return;
  const stage = $('bkStage'), el = bookContent();
  const W = stage.clientWidth, H = stage.clientHeight;
  const z = clamp(v.z, BOOK_ZMIN, BOOK_ZMAX);
  // some of the pages always stays on screen, however far they are pushed
  const cw = el.offsetWidth * z, ch = el.offsetHeight * z, keep = 80;
  const x = clamp(v.x, Math.min(keep - cw, (W - cw) / 2), Math.max(W - keep, (W - cw) / 2));
  const y = clamp(v.y, Math.min(keep - ch, (H - ch) / 2), Math.max(H - keep, (H - ch) / 2));
  const zoomed = z !== bk.cam.z;
  bk.cam = { x, y, z };
  el.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
  const p = $('bkBar').querySelector('[data-bk="fit"]');
  if (p) p.textContent = pct(Math.round(z * 100));
  if (bk.view === 'scroll' && !bk.fillFrame) bk.fillFrame = requestAnimationFrame(() => { if (bk) { bk.fillFrame = 0; bookFillNear(); } });
  if (zoomed) { clearTimeout(bk.sharpT); bk.sharpT = setTimeout(bookSharpen, 160); }
  if (typeof padDirty === 'function') padDirty();       // a paired phone sees the pages move (tablet.js)
}
// the camera moved there over a moment (the scroll view's arrows), or at once
function bookGlideTo(v, glide) {
  cancelAnimationFrame(bookGlideTo.raf);
  if (!glide || motionReduced()) { setBookView(v); return; }
  const a = Object.assign({}, bk.cam), t0 = performance.now(), book = bk;
  const step = (now) => {
    if (bk !== book) return;
    const k = Math.min(1, (now - t0) / 320), e = bookEaseOut(k);
    setBookView({ x: a.x + (v.x - a.x) * e, y: a.y + (v.y - a.y) * e, z: a.z + (v.z - a.z) * e });
    if (k < 1) bookGlideTo.raf = requestAnimationFrame(step);
  };
  bookGlideTo.raf = requestAnimationFrame(step);
}
// 100%: the spread in the middle, or the column with the current page at the top
function bookFit() {
  if (!bk) return;
  const stage = $('bkStage'), el = bookContent();
  const W = stage.clientWidth, H = stage.clientHeight;
  if (bk.view === 'scroll') {
    const slot = $('bkScroll').children[bk.at];
    setBookView({ x: (W - el.offsetWidth) / 2, y: slot ? 24 - slot.offsetTop : 0, z: 1 });
  } else setBookView({ x: (W - el.offsetWidth) / 2, y: Math.max(0, (H - el.offsetHeight) / 2), z: 1 });
}
// the pages under the pointer move with it: the hand, or any tool pressed off a page
function bookHandMove(e) {
  const G = bk.hand;
  if (G.turn) { bookDragTurnMove(G, e); return; }
  const dx = e.clientX - G.lx, dy = e.clientY - G.ly;
  if (!G.moved && Math.hypot(e.clientX - G.sx, e.clientY - G.sy) < 5) return;
  if (!G.moved) {
    G.moved = true;
    if (!bk.turning && bookDragTurnStart(G, e)) return;      // the corner of a page, pulled towards the spine
    $('bkStage').classList.add('bk-panning');
  }
  G.lx = e.clientX; G.ly = e.clientY;
  setBookView({ x: bk.cam.x + dx, y: bk.cam.y + dy, z: bk.cam.z });
}
// a second finger landed: the first one's line, or its drag, was the start of a pinch
function cancelBookGesture() {
  if (!bk) return;
  if (bk.live) { const L = bk.live; bk.live = null; if (L.frame) cancelAnimationFrame(L.frame); L.el.remove(); }
  if (bk.hand && bk.hand.turn) bookDragTurnEnd(bk.hand);
  bk.hand = null;
  $('bkStage').classList.remove('bk-panning');
  endBookStroke();
}
/* The wheel: Ctrl zooms at the pointer (the surface does it). Without Ctrl it
   reads, whatever the board's wheel setting: in the book view at 100% or less
   a notch turns a page, and otherwise it moves down the pages, as a reader's
   wheel does. */
function bookWheel(e) {
  if (!bk) return true;
  if (e.ctrlKey) return false;
  if (bk.view === 'book' && bk.cam.z <= 1.01 && state.settings.bookWheel !== false) {
    const now = performance.now();
    if (now - (bookWheel.at || 0) >= 350 && Math.abs(e.deltaY) >= 4) { bookWheel.at = now; bookGo(e.deltaY > 0 ? 1 : -1); }
    return true;
  }
  const v = bk.cam, k = e.deltaMode === 1 ? 32 : 1;           // a mouse that counts lines
  setBookView({ x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k, y: v.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k, z: v.z });
  return true;
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
/* How many device pixels a PDF page is drawn with: the screen's density (at
   most 2.5) times the zoom, in half-octave steps so a pinch does not redraw it
   at every frame, and never more than BOOK_PDF_PX pixels in all. */
function bookPdfSize(S) {
  const zq = Math.pow(2, Math.round(Math.log2(Math.max(bk.cam.z, 0.5)) * 2) / 2);
  // Settings ▸ Books ▸ PDF pages: 'quick' draws at one pixel a screen pixel and a third of the size at most
  const quick = state.settings.bookQuality === 'quick', most = quick ? BOOK_PDF_PX / 3 : BOOK_PDF_PX;
  const q = (quick ? 1 : Math.min(2.5, window.devicePixelRatio || 1)) * zq;
  let W = S.w * q, H = S.h * q;
  if (W * H > most) { const f = Math.sqrt(most / (W * H)); W *= f; H *= f; }
  return { W: Math.round(W), H: Math.round(H) };
}
/* pdf.js draws a page at that size. Drawn pages are kept (a dozen, and
   BOOK_CACHE_PX pixels at most) and copied for the next element that shows
   one — a turn, a redraw, the scroll coming back. A canvas that already shows
   its page keeps showing it until the sharper one is ready, so a zoom never
   flashes white. */
async function bookRenderPage(i, canvas, S) {
  const { W, H } = bookPdfSize(S);
  const key = i + '@' + W;
  canvas.dataset.want = key;
  const g = canvas.getContext('2d');
  const show = (src) => { canvas.width = W; canvas.height = H; g.drawImage(src, 0, 0, W, H); canvas.dataset.has = key; };
  const hit = bk.cache.get(key);
  if (hit) { show(hit); return; }
  if (!canvas.dataset.has) { canvas.width = W; canvas.height = H; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); }
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
    book.cache.delete(key);
    book.cache.set(key, off);
    let px = 0;
    for (const c of book.cache.values()) px += c.width * c.height;
    while (book.cache.size > 1 && (px > BOOK_CACHE_PX || book.cache.size > 12)) {
      const old = book.cache.keys().next().value;
      px -= book.cache.get(old).width * book.cache.get(old).height;
      book.cache.delete(old);
    }
    // a later zoom asked this canvas for another size meanwhile: that one draws it
    if (canvas.isConnected && canvas.dataset.want === key) show(off);
    if (typeof padDirty === 'function') padDirty();
  } catch (err) { console.warn('book: page ' + (i + 1) + ' would not draw', err); }
}
// a zoom settled: every PDF page on screen is drawn again at the new size
function bookSharpen() {
  if (!bk || !bk.ps) return;
  const W = bookPdfSize(bk.ps).W;
  document.querySelectorAll('#bookDlg .bk-page > .bk-pdf').forEach((c) => {
    const i = +c.parentElement.dataset.p;
    if (c.dataset.want !== i + '@' + W) bookRenderPage(i, c, bk.ps);
  });
}

/* ---- moving through it ---- */
function bookGo(dir) {
  if (!bk) return;
  if (bk.turn && bk.turn.dragging) return;
  bookTurnSettle();
  const B = bk.n.book;
  if (bk.view === 'scroll') { bookGoTo(clamp(bk.at + dir, 0, B.pages - 1), true); return; }
  const pages = bookSpreadOf(bk.at);
  let to;
  if (pages.length === 1) to = bk.at + dir;
  else if (dir > 0) to = (pages[1] != null ? pages[1] : pages[0]) + 1;
  else to = (pages[0] != null ? pages[0] : 0) - 1;
  if (to < 0 || to >= B.pages) return;
  bookTurn(dir, to);
}
function bookGoTo(i, glide) {
  if (!bk) return;
  bookTurnSettle();
  const B = bk.n.book;
  i = clamp(i, 0, B.pages - 1);
  if (bk.view === 'scroll') {
    const slot = $('bkScroll').children[i];
    bk.at = i;
    if (slot) bookGlideTo({ x: bk.cam.x, y: 24 - slot.offsetTop * bk.cam.z, z: bk.cam.z }, !!glide);
    bookFillNear();
  } else {
    bk.at = i;
    bookPaintSpread();
  }
  bookShowAt();
  keepBookPlace();
}
/* ---- turning a page (3.1) ----
   A turn is a progress from 0 to 1, and everything in it is painted from that
   one number (`bookTurnPaint`): the leaf swinging about the spine, the shade
   across each of its faces, a glint as it lifts, and the shadow it throws on
   the page it is uncovering and then on the one it lands on. So the same turn
   runs by itself (a click, a key, the wheel, the phone) or follows a hand
   dragging a page's corner over (`bookDragTurn*`), and goes on or falls back
   from wherever it is let go.

   Under the leaf the spread is already half the new one — the side that
   stays and the side that is coming — so when the leaf lands nothing jumps.
   Settings ▸ Books picks the turn ('curl', a 'slide' or 'fade' of the new
   spread, or 'none') and its speed; reduced motion is always 'none'. A press
   while a page is still turning lands that turn at once and goes on from
   there, so paging quickly is never ignored. */
const bookEase = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const bookEaseOut = (x) => 1 - Math.pow(1 - x, 3);
const bookTurnMs = () => BOOK_SPEEDS[state.settings.bookSpeed] || BOOK_SPEEDS.normal;
const bookTurnFx = () => (motionReduced() ? 'none' : BOOK_TURNS.includes(state.settings.bookTurnFx) ? state.settings.bookTurnFx : 'curl');

function bookTurn(dir, to) {
  const fx = bookTurnFx(), from = bookSpreadOf(bk.at);
  const backTo = bk.at;
  bk.at = to;
  bookShowAt();
  keepBookPlace();
  if (fx === 'none') { bookPaintSpread(); return; }
  if (fx !== 'curl') { bookPaintSpread(); bookSlideIn(dir, fx); return; }
  const T = bookTurnBuild(dir, from, bookSpreadOf(to));
  T.backTo = backTo;
  bookTurnRun(T, 1, bookTurnMs(), bookEase);
}
// a slide or a fade: the new spread comes in from the way the reader is going
function bookSlideIn(dir, fx) {
  const from = fx === 'slide' ? `translateX(${dir * 7}%) scale(.985)` : 'scale(.992)';
  $('bkSpread').querySelectorAll(':scope > .bk-side').forEach((el) => el.animate(
    [{ transform: from, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: Math.round(bookTurnMs() * 0.75), easing: 'cubic-bezier(.16, 1, .3, 1)' }));
}
function bookTurnBuild(dir, from, next) {
  const spread = $('bkSpread'), S = bk.ps, two = from.length === 2;
  spread.textContent = '';
  const side = (p, cls) => {
    const el = document.createElement('div');
    el.className = 'bk-side ' + cls;
    if (p != null) el.appendChild(bookPageEl(p, S));
    const cast = document.createElement('i');                // the leaf's shadow on this side
    cast.className = 'bk-cast';
    el.appendChild(cast);
    spread.appendChild(el);
    return cast;
  };
  // under the leaf: the side that stays, and the side that is coming
  let castL = null, castR = null;
  if (two) {
    if (dir > 0) { castL = side(from[0], 'left'); castR = side(next[1], 'right'); }
    else { castL = side(next[0], 'left'); castR = side(from[1], 'right'); }
  } else castR = side(next[0], 'one');
  const leaf = document.createElement('div');
  leaf.className = 'bk-leaf ' + (dir > 0 ? 'fwd' : 'back') + (two ? '' : ' one');
  const face = (p, cls) => {
    const el = document.createElement('div');
    el.className = 'bk-face-' + cls;
    if (p != null) el.appendChild(bookPageEl(p, S));
    const sh = document.createElement('i');
    sh.className = 'bk-shade';
    el.appendChild(sh);
    leaf.appendChild(el);
    return sh;
  };
  let shFront, shBack;
  if (two) {
    if (dir > 0) { shFront = face(from[1], 'front'); shBack = face(next[0], 'back'); }
    else { shFront = face(from[0], 'front'); shBack = face(next[1], 'back'); }
  } else { shFront = face(from[0], 'front'); shBack = face(null, 'back'); }
  const glint = document.createElement('i');
  glint.className = 'bk-glint';
  leaf.firstChild.appendChild(glint);
  spread.appendChild(leaf);
  bk.turning = true;
  const T = { dir, two, leaf, shFront, shBack, glint, castL, castR, p: 0, raf: 0, done: false, backTo: bk.at };
  bk.turn = T;
  bookTurnPaint(T, 0);
  return T;
}
/* Everything from the progress. The angle is 0–180°; the leaf rises a little
   off the paper as it goes and bends a hair (a skew that is gone at both
   ends), the face turning away darkens towards its free edge, and the shadow
   it throws is a soft band just past the leaf's edge as seen from above —
   cos θ of a page's width out from the spine. */
function bookTurnPaint(T, p) {
  T.p = p;
  const th = p * Math.PI, lift = Math.sin(th), sgn = T.dir > 0 ? 1 : -1;
  T.leaf.style.transform = `rotateY(${(-sgn * p * 180).toFixed(2)}deg) translateZ(${(lift * 16).toFixed(1)}px) skewY(${(-sgn * lift * 1.4).toFixed(2)}deg)`;
  T.shFront.style.opacity = (Math.min(1, p * 2) * 0.6).toFixed(3);
  T.shBack.style.opacity = (p > 0.5 ? (1 - p) * 2 * 0.5 : 0).toFixed(3);
  T.glint.style.opacity = (Math.sin(Math.min(1, p * 2) * Math.PI) * 0.5).toFixed(3);
  T.glint.style.transform = `translateX(${(sgn * (60 - p * 180)).toFixed(1)}%)`;
  const reach = Math.cos(th);                                // the leaf's edge over the page beneath it: 1 the outer edge, 0 the spine
  const dark = (lift * 0.55).toFixed(3);
  if (T.two) {
    // forward it is over the right page first and then the left; back, the other way round
    const first = T.dir > 0 ? T.castR : T.castL, second = T.dir > 0 ? T.castL : T.castR;
    bookCast(first, Math.max(0, reach), reach > 0 ? dark : 0);
    bookCast(second, Math.max(0, -reach), reach < 0 ? dark : 0);
  } else bookCast(T.castR, Math.max(0, reach), reach > 0 ? dark : 0);
}
// the band of shadow, `at` of the way out from the spine (mental.css §91 draws it from --at)
function bookCast(el, at, a) {
  if (!el) return;
  el.style.opacity = a;
  el.style.setProperty('--at', (at * 100).toFixed(2) + '%');
}
// run a turn to `to` (1: over, 0: back where it was) and land it
function bookTurnRun(T, to, ms, ease) {
  cancelAnimationFrame(T.raf);
  const p0 = T.p, t0 = performance.now(), dur = Math.max(80, ms * Math.abs(to - p0));
  const step = (now) => {
    if (T.done) return;
    const k = Math.min(1, (now - t0) / dur);
    bookTurnPaint(T, p0 + (to - p0) * ease(k));
    if (typeof padDirty === 'function') padDirty();
    if (k < 1 && !document.hidden) T.raf = requestAnimationFrame(step);
    else bookTurnLand(T, to);
  };
  T.raf = requestAnimationFrame(step);
}
function bookTurnLand(T, to) {
  if (T.done) return;
  T.done = true;
  cancelAnimationFrame(T.raf);
  if (!bk || bk.turn !== T) return;
  bk.turn = null;
  bk.turning = false;
  if (to === 0) {                                            // let go short of the spine: the page falls back
    bk.at = T.backTo;
    bookShowAt();
    keepBookPlace();
  }
  bookPaintSpread();
}
// a turn still going lands at once; one being dragged falls back
function bookTurnSettle() {
  const T = bk && bk.turn;
  if (T) bookTurnLand(T, T.dragging ? 0 : 1);
}

/* ---- dragging a page over (Settings ▸ Books ▸ Drag a page's corner) ----
   With the hand, a press on the outer part of a page that moves towards the
   spine takes the page with it, the leaf's edge staying under the pointer.
   Let go past a quarter of the way, or with a flick, and it goes over; short
   of that it falls back. Only in the book view at 100% or less — zoomed in, a
   drag moves the pages as it always did. */
function bookDragTurnStart(G, e) {
  if (state.settings.bookDrag === false || bk.view !== 'book' || bk.cam.z > 1.01 || !G.pg || !G.pg.isConnected) return false;
  const r = G.pg.getBoundingClientRect(), x = (G.sx - r.left) / r.width;
  const side = G.pg.parentElement.classList;
  const dx = e.clientX - G.sx, dy = e.clientY - G.sy;
  if (Math.abs(dx) < Math.abs(dy) * 1.2) return false;
  let dir = 0;
  if ((side.contains('right') || side.contains('one')) && x > 0.62 && dx < 0) dir = 1;
  else if ((side.contains('left') || side.contains('one')) && x < 0.38 && dx > 0) dir = -1;
  if (!dir) return false;
  const B = bk.n.book, pages = bookSpreadOf(bk.at);
  let to;
  if (pages.length === 1) to = bk.at + dir;
  else if (dir > 0) to = (pages[1] != null ? pages[1] : pages[0]) + 1;
  else to = (pages[0] != null ? pages[0] : 0) - 1;
  if (to < 0 || to >= B.pages) return false;
  const T = bookTurnBuild(dir, pages, bookSpreadOf(to));
  /* the spine on screen and a page's width there. A single page turns about
     its own edge — forward about its left, back about its right. */
  Object.assign(T, { dragging: true, spine: dir > 0 ? r.left : r.right, pw: r.width, lastX: e.clientX, lastT: e.timeStamp || performance.now(), v: 0 });
  bk.at = to;
  bookShowAt();
  G.turn = T;
  bookDragTurnMove(G, e);
  return true;
}
function bookDragTurnMove(G, e) {
  const T = G.turn;
  // cos θ is how far out from the spine the leaf's edge is: keep it under the pointer
  const c = clamp((e.clientX - T.spine) * (T.dir > 0 ? 1 : -1) / T.pw, -1, 1);
  const now = e.timeStamp || performance.now(), dt = Math.max(1, now - T.lastT);
  T.v = T.v * 0.6 + ((T.lastX - e.clientX) * (T.dir > 0 ? 1 : -1) / dt) * 0.4;     // px a ms, towards the spine
  T.lastX = e.clientX;
  T.lastT = now;
  bookTurnPaint(T, Math.acos(c) / Math.PI);
  if (typeof padDirty === 'function') padDirty();
}
function bookDragTurnEnd(G) {
  const T = G.turn;
  G.turn = null;
  T.dragging = false;
  const over = T.p > 0.25 || T.v > 0.6;
  bookTurnRun(T, over ? 1 : 0, bookTurnMs(), bookEaseOut);
  if (over) keepBookPlace();
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
  if (typeof padDirty === 'function') padDirty();
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
// a notebook's paper, from its bar: ruled, dots, grid, plain, and round again
function bookNextPaper() {
  const B = bk.n.book;
  if (B.kind !== 'blank') return;
  if (!bk.undoTaken) { pushUndo(); bk.undoTaken = true; }
  const paper = BOOK_PAPERS[(BOOK_PAPERS.indexOf(B.paper) + 1) % BOOK_PAPERS.length];
  bk.n.book = Object.assign({}, B, { paper });
  $('bookDlg').dataset.paper = paper;
  saveSoon();
  buildBookBar();
  if (typeof padDirty === 'function') padDirty();
}
// a pointer's place on a page, in page units, and how many screen px one unit is
function bookPoint(e, pg) {
  const r = pg.getBoundingClientRect();
  const k = r.width / BOOK_U;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k, k };
}
// the ink layer a page shows now (not the copy on a leaf being turned)
const bookInkSvg = (page) => document.querySelector(`#bkSpread > .bk-side > .bk-page[data-p="${page}"] > .bk-ink, #bkScroll .bk-page[data-p="${page}"] > .bk-ink`);

/* A line, from a pointer here or from a paired phone (tablet.js): begun on a
   page with a tool, a colour and a size (0–2), `k` being how many screen
   pixels one page unit is, so the line is as wide as the bar says on screen. */
function bookStrokeBegin(page, tool, color, size, k) {
  if ((bk.ink[page] || []).length >= BOOK_INK_MAX) { bookSay(t('sketch.full')); return null; }
  const s = { id: uid(), tool, color, size: Math.round(INK_SIZES[tool][size] / k * 100) / 100 };
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('class', 'ink ink-' + tool);
  const c = inkColorCss(s.color);
  if (tool === 'brush') el.style.fill = c; else { el.style.stroke = c; el.style.strokeWidth = s.size + 'px'; }
  const svg = bookInkSvg(page);
  if (svg) svg.appendChild(el);
  return { s, raw: [], el, k, page, frame: 0 };
}
function bookStrokeAdd(L, x, y, p, at) {
  const last = L.raw[L.raw.length - 1];
  if (last && Math.hypot(x - last.x, y - last.y) * L.k < 0.6) return;
  L.raw.push({ x, y, p, t: at });
  if (!L.frame) L.frame = requestAnimationFrame(() => {
    L.frame = 0;
    if (!bk || L.done) return;
    // the page was drawn again under the line (a zoom, a turn): the line moves to the new one
    if (!L.el.isConnected) { const svg = bookInkSvg(L.page); if (svg) svg.appendChild(L.el); }
    const pts = [];
    L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
    L.el.setAttribute('d', L.s.tool === 'brush' ? inkBrushPath(pts, brushWidths(L.raw, L.s.size, L.k)) : inkLinePath(pts));
    if (typeof padDirty === 'function') padDirty();
  });
}
function bookStrokeEnd(L) {
  L.done = true;
  if (L.frame) cancelAnimationFrame(L.frame);
  if (!L.raw.length) { L.el.remove(); return; }
  const pts = [];
  L.raw.forEach((q) => pts.push(r1(q.x), r1(q.y)));
  if (pts.length === 2) pts.push(pts[0] + 0.1, pts[1]);        // a dot
  L.s.pts = pts;
  if (L.s.tool === 'brush') L.s.ws = brushWidths(L.raw, L.s.size, L.k);
  bookStep(L.page);
  bk.ink[L.page] = (bk.ink[L.page] || []).concat([L.s]);
  if (L.el.isConnected) { L.el.dataset.id = L.s.id; L.el.setAttribute('d', inkPath(L.s)); }
  else bookRepaintInk(L.page);
  commitBook();
  buildBookBar();
  if (typeof padDirty === 'function') padDirty();
}
// the eraser takes whole strokes along the sweep, as everywhere else (ink.js eraseAt)
function bookEraseBegin(page, size, k) { return { page, r: INK_SIZES.eraser[size] / k, last: null, hit: false }; }
function bookEraseAt(E, w) {
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
function bookEraseEnd(E) { if (E.hit) { commitBook(); buildBookBar(); } }

/* ---- the pointer here ---- */
function onBookDown(e) {
  if (!bk || e.defaultPrevented) return;        // taken by the camera (Space, the middle button, a pinch)
  if (bk.turning) { if (bk.turn && bk.turn.dragging) return; bookTurnSettle(); }   // a page still turning lands first
  const pg = e.target.closest && e.target.closest('#bookDlg .bk-page');
  if (e.pointerType === 'pen') bk.penSeen = true;
  else if (e.pointerType === 'touch' && bk.penSeen) return;          // a palm, once a pen has been used
  const tool = e.pointerType === 'pen' && bk.tool === 'hand' ? 'pen' : bk.tool;   // a pen always writes
  window.addEventListener('pointermove', onBookMove);
  window.addEventListener('pointerup', onBookUp);
  window.addEventListener('pointercancel', onBookUp);
  if (tool === 'hand' || !pg) {
    // the hand drags the pages; a click on the outer part of a page turns it (book view)
    if (e.button !== 0) { endBookStroke(); return; }
    e.preventDefault();
    bk.hand = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, pg };
    return;
  }
  if (e.button !== 0 && e.button !== 5) { endBookStroke(); return; }
  e.preventDefault();
  const page = +pg.dataset.p, at = bookPoint(e, pg);
  try { pg.setPointerCapture(e.pointerId); } catch (_) {}
  if (tool === 'eraser' || e.button === 5 || (e.pointerType === 'pen' && (e.buttons & 2))) {
    bk.erase = Object.assign(bookEraseBegin(page, bk.size, at.k), { pg, id: e.pointerId });
    bookEraseAt(bk.erase, at);
    return;
  }
  const L = bookStrokeBegin(page, tool, bk.color, bk.size, at.k);
  if (!L) { endBookStroke(); return; }
  bk.live = Object.assign(L, { id: e.pointerId, pg });
  bookAddPoint(e);
}
function bookAddPoint(e) {
  const L = bk.live, w = inkSteady(L.raw, bookPoint(e, L.pg));
  bookStrokeAdd(L, w.x, w.y, inkPressure(e), e.timeStamp || performance.now());
}
function onBookMove(e) {
  if (!bk) return;
  if (bk.hand && e.pointerId === bk.hand.id) { bookHandMove(e); return; }
  if (bk.erase && e.pointerId === bk.erase.id) { bookEraseAt(bk.erase, bookPoint(e, bk.erase.pg)); return; }
  if (!bk.live || e.pointerId !== bk.live.id) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
  if (evs && evs.length) evs.forEach(bookAddPoint); else bookAddPoint(e);
}
function onBookUp(e) {
  const g = bk && (bk.live || bk.erase || bk.hand);
  if (g && e.pointerId !== g.id) return;
  if (bk && bk.hand) {
    const G = bk.hand;
    bk.hand = null;
    $('bkStage').classList.remove('bk-panning');
    if (G.turn) bookDragTurnEnd(G);
    else if (!G.moved) bookClickTurn(G);
  }
  endBookStroke();
}
// the hand pressed and let go without dragging: the outer part of a page turns it
function bookClickTurn(G) {
  if (bk.view !== 'book' || !G.pg || !G.pg.isConnected) return;
  const r = G.pg.getBoundingClientRect(), x = (G.sx - r.left) / r.width;
  const side = G.pg.parentElement.classList;
  if ((side.contains('right') || side.contains('one')) && x > 0.6) bookGo(1);
  else if ((side.contains('left') || side.contains('one')) && x < 0.4) bookGo(-1);
}
function endBookStroke() {
  window.removeEventListener('pointermove', onBookMove);
  window.removeEventListener('pointerup', onBookUp);
  window.removeEventListener('pointercancel', onBookUp);
  if (!bk) return;
  if (bk.erase) { const E = bk.erase; bk.erase = null; bookEraseEnd(E); }
  const L = bk.live;
  if (!L) return;
  bk.live = null;
  bookStrokeEnd(L);
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
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); bkSurface.zoomCentre(1.25); return; }
  if (ctrl && e.key === '-') { e.preventDefault(); bkSurface.zoomCentre(1 / 1.25); return; }
  if (ctrl && e.key === '0') { e.preventDefault(); bookFit(); return; }
  if (ctrl) return;
  if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); bookFit(); return; }
  if (e.code === 'Space') { e.preventDefault(); return; }    // held, Space is the hand (zoomPanSurface)
  if (['ArrowRight', 'PageDown'].includes(e.key)) { e.preventDefault(); bookGo(document.documentElement.dir === 'rtl' && e.key === 'ArrowRight' ? -1 : 1); return; }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); bookGo(document.documentElement.dir === 'rtl' && e.key === 'ArrowLeft' ? 1 : -1); return; }
  if (e.key === 'Home') { e.preventDefault(); bookGoTo(0); return; }
  if (e.key === 'End') { e.preventDefault(); bookGoTo(bk.n.book.pages - 1); return; }
  const tools = { h: 'hand', d: 'pen', m: 'marker', b: 'brush', e: 'eraser' };
  if (tools[key]) { bk.tool = tools[key]; state.settings.bookPen = { tool: bk.tool, color: bk.color, size: bk.size }; saveSoon(); buildBookBar(); return; }
  if (e.key === '[' || e.key === ']') { bk.size = clamp(bk.size + (e.key === ']' ? 1 : -1), 0, 2); buildBookBar(); }
}

function wireBook() {
  const stage = $('bkStage');
  stage.addEventListener('pointerdown', onBookDown);
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  // the drawing note's camera: Ctrl+wheel at the pointer, Space or the middle button to drag, two fingers to pinch
  bkSurface = zoomPanSurface(stage, {
    get: () => (bk ? bk.cam : { x: 0, y: 0, z: 1 }), set: setBookView,
    min: BOOK_ZMIN, max: BOOK_ZMAX, cancel: cancelBookGesture, wheel: bookWheel
  });
  $('bkTitle').addEventListener('input', () => {
    if (!bk) return;
    bk.dirty = true;
    clearTimeout(bk.titleTimer);
    bk.titleTimer = setTimeout(commitBook, 600);
  });
  $('bkTitle').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); });
  window.addEventListener('resize', () => { if (bk) { clearTimeout(wireBook.rs); wireBook.rs = setTimeout(() => { if (bk) bookLayout(); }, 120); } });
}
