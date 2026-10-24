/* Mental Board — database.js
   A database inside a note (2.8): the Database section of the slash menu —
   table, board, gallery, list, calendar, timeline, feed, dashboard and map
   views, five charts, a form, a database on its own note, and a linked view of
   another database on the board.

   These files are plain scripts sharing one global scope, loaded in the order
   index.html lists them — that order is the only thing holding them together,
   so a file may use anything declared above it at load time and anything at
   all once init() runs. See MAP.md §4 and §4z6. */
/* ─────────────── 13. databases ─────────────── */

/* The shape is Notion's, read out of the Notion desktop app's own slash menu
   (MAP.md §4z6): every Database item makes one block of type collection_view
   with a `viewType`, and every view is a way of drawing one data source. So a
   block here is

     div.mb-db  contenteditable=false  data-dbid="<id>"  data-db="<json>"

   and the JSON is the data source — its properties and rows — plus the block's
   own views and the one showing. A linked view carries `src` instead of
   properties and rows, and reads them from the block that owns them.

   Like a formula (mathHtml) and an embed (paintEmbeds), the block stores data
   and nothing else. What you see is `.db-face`, painted from the data by
   paintDb() and lifted out by bodyHtml(), so a note stores rows, not markup,
   and every old database is redrawn by the newest code. Keeping it in the note
   rather than beside the board is what makes copy, duplicate, templates, the
   trash, a note's history and undo carry a database for free — each of them
   already moves a note's body. */

const DB_VIEWS = ['table', 'board', 'gallery', 'list', 'calendar', 'timeline', 'feed', 'dashboard', 'map', 'chart', 'form'];
const DB_CHARTS = ['bar', 'hbar', 'line', 'donut', 'number'];
const DB_TYPES = ['title', 'text', 'number', 'select', 'status', 'multi', 'date', 'check', 'url', 'place'];
const DB_OPT_TYPES = ['select', 'status', 'multi'];
const DB_MAX = { rows: 2000, props: 30, views: 20, opts: 60, text: 2000, body: 8000 };
const DB_ID = /^[A-Za-z0-9_-]{1,40}$/;
// what a fresh option, a chart's bars and a group with no colour of its own are painted in, in turn
const DB_CYCLE = ['blue', 'green', 'amber', 'violet', 'pink', 'teal', 'orange', 'red'];
// the layouts the Layout and Add-view menus offer, in Notion's order
const DB_LAYOUTS = [['table'], ['board'], ['gallery'], ['list'], ['calendar'], ['timeline'], ['feed'],
  ['dashboard'], ['map'], ['chart', 'bar'], ['chart', 'hbar'], ['chart', 'line'], ['chart', 'donut'],
  ['chart', 'number'], ['form']];
// how big a note is made, at least, for each kind of database put into it
const DB_SIZE = {
  table: [600, 380], board: [680, 420], gallery: [640, 460], list: [520, 360], calendar: [680, 560],
  timeline: [720, 400], feed: [520, 520], dashboard: [640, 560], map: [620, 520], chart: [520, 420], form: [460, 520]
};
const DB_TL_DAYS = 42, DB_TL_W = 30;   // the timeline: six weeks, a day this many px wide

const okDbId = (v) => (typeof v === 'string' && DB_ID.test(v) ? v : '');
const dbStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/* ---- healing ------------------------------------------------------------
   Same contract as adoptBoard(): whatever is in the attribute — written by
   this version, an older one, or a paste — comes out valid or not at all. It
   runs on every read, so nothing downstream ever checks a shape. */

/* 'YYYY-MM-DD', or a range 'YYYY-MM-DD/YYYY-MM-DD' whose end is after its start */
function okDbDate(v) {
  if (typeof v !== 'string') return '';
  const [a, b] = v.split('/');
  const s = okDateKey(a);
  if (!s) return '';
  const e = okDateKey(b || '');
  return e && e > s ? s + '/' + e : s;
}
const dbDateStart = (v) => String(v || '').split('/')[0];
const dbDateEnd = (v) => String(v || '').split('/')[1] || dbDateStart(v);

function adoptDbProp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = DB_TYPES.includes(raw.type) ? raw.type : 'text';
  const p = { id: okDbId(raw.id) || 'p' + uid(), name: dbStr(raw.name, 60), type };
  if (DB_OPT_TYPES.includes(type)) {
    const seen = new Set();
    p.opts = (Array.isArray(raw.opts) ? raw.opts : []).slice(0, DB_MAX.opts).map((o) => {
      if (!o || typeof o !== 'object') return null;
      const id = okDbId(o.id) || 'o' + uid();
      if (seen.has(id)) return null;
      seen.add(id);
      return { id, name: dbStr(o.name, 60), color: COLORS.includes(o.color) ? o.color : 'default' };
    }).filter(Boolean);
  }
  return p;
}

// one cell's value for its property, or undefined for "empty" — empties are not stored
function okDbCell(p, v) {
  switch (p.type) {
    case 'number': {
      const x = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v) : NaN);
      return Number.isFinite(x) ? x : undefined;
    }
    case 'select': case 'status':
      return typeof v === 'string' && p.opts.some((o) => o.id === v) ? v : undefined;
    case 'multi': {
      const a = (Array.isArray(v) ? v : []).filter((x) => p.opts.some((o) => o.id === x));
      return a.length ? [...new Set(a)] : undefined;
    }
    case 'date': return okDbDate(v) || undefined;
    case 'check': return v === true ? true : undefined;
    default: {
      const s = dbStr(v, DB_MAX.text);
      return s ? s : undefined;
    }
  }
}

function adoptDbView(raw) {
  if (!raw || typeof raw !== 'object' || !DB_VIEWS.includes(raw.type)) return null;
  const v = { id: okDbId(raw.id) || 'v' + uid(), type: raw.type, name: dbStr(raw.name, 40) };
  if (raw.type === 'chart') v.chart = DB_CHARTS.includes(raw.chart) ? raw.chart : 'bar';
  if (okDbId(raw.by)) v.by = raw.by;                  // group by, or the date the view is laid out on
  if (okDbId(raw.val)) v.val = raw.val;               // a number to add up; none counts rows
  if (raw.sort && okDbId(raw.sort.p)) v.sort = { p: raw.sort.p, dir: raw.sort.dir === -1 ? -1 : 1 };
  if (Array.isArray(raw.hide)) {
    const hide = raw.hide.filter((x) => okDbId(x)).slice(0, DB_MAX.props);
    if (hide.length) v.hide = hide;
  }
  return v;
}

/* Properties are checked against the data they belong to when a view is
   drawn, not here: a linked view's `by` names a property of another block. */
function adoptDb(raw) {
  let o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { return null; } }
  if (!o || typeof o !== 'object') return null;
  const db = { v: 1, id: okDbId(o.id) || 'd' + uid(), name: dbStr(o.name, 80) };
  const src = okDbId(o.src);
  if (src && src !== db.id) db.src = src;
  else {
    const ids = new Set();
    let props = (Array.isArray(o.props) ? o.props : []).slice(0, DB_MAX.props).map(adoptDbProp)
      .filter((p) => p && !ids.has(p.id) && ids.add(p.id));
    // exactly one title, and it comes first: it is what a card, a chip and a bar are called
    let title = props.find((p) => p.type === 'title');
    props.forEach((p) => { if (p.type === 'title' && p !== title) p.type = 'text'; });
    if (!title) title = { id: 'p' + uid(), name: t('db.prop.name'), type: 'title' };
    props = [title, ...props.filter((p) => p !== title)];
    db.props = props;
    const rids = new Set();
    db.rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, DB_MAX.rows).map((r) => {
      if (!r || typeof r !== 'object') return null;
      const id = okDbId(r.id) || 'r' + uid();
      if (rids.has(id)) return null;
      rids.add(id);
      const c = {}, rc = r.c && typeof r.c === 'object' ? r.c : {};
      props.forEach((p) => { const x = okDbCell(p, rc[p.id]); if (x !== undefined) c[p.id] = x; });
      const row = { id, c };
      const text = dbStr(r.t, DB_MAX.body);
      if (text) row.t = text;
      return row;
    }).filter(Boolean);
  }
  const vids = new Set();
  db.views = (Array.isArray(o.views) ? o.views : []).slice(0, DB_MAX.views).map(adoptDbView)
    .filter((v) => v && !vids.has(v.id) && vids.add(v.id));
  if (!db.views.length) db.views = [{ id: 'v' + uid(), type: 'table', name: '' }];
  db.cur = db.views.some((v) => v.id === o.cur) ? o.cur : db.views[0].id;
  return db;
}

/* ---- labels and glyphs ----
   Literal icon() calls, one per name: tools/check-icons.js reads them, and a
   name that only ever passes through a variable would look undrawn. */
function dbPropIcon(type) {
  switch (type) {
    case 'title': return icon('title');
    case 'number': return icon('tag');
    case 'select': return icon('arrow_drop_down_circle');
    case 'status': return icon('radio_button_checked');
    case 'multi': return icon('list');
    case 'date': return icon('event');
    case 'check': return icon('check_box');
    case 'url': return icon('link');
    case 'place': return icon('location_on');
    default: return icon('notes');
  }
}
function dbViewIcon(v) {
  if (v.type === 'chart') {
    if (v.chart === 'hbar') return icon('align_horizontal_left');
    if (v.chart === 'line') return icon('show_chart');
    if (v.chart === 'donut') return icon('donut_large');
    if (v.chart === 'number') return icon('numbers');
    return icon('bar_chart');
  }
  switch (v.type) {
    case 'board': return icon('view_kanban');
    case 'gallery': return icon('grid_view');
    case 'list': return icon('view_list');
    case 'calendar': return icon('calendar_month');
    case 'timeline': return icon('view_timeline');
    case 'feed': return icon('dynamic_feed');
    case 'dashboard': return icon('dashboard');
    case 'map': return icon('map');
    case 'form': return icon('assignment');
    default: return icon('table');
  }
}
const dbLayoutName = (type, chart) => (type === 'chart' ? t('db.chart.' + (chart || 'bar')) : t('db.view.' + type));
const dbViewName = (v) => v.name || dbLayoutName(v.type, v.chart);
const dbTypeName = (type) => t('db.type.' + type);
const dbPropName = (p) => p.name || dbTypeName(p.type);
const dbOpt = (p, id) => (p.opts || []).find((o) => o.id === id) || null;
const dbRow = (data, id) => data.rows.find((r) => r.id === id) || null;
const dbProp = (data, id) => data.props.find((p) => p.id === id) || null;
const dbTitle = (data, r) => r.c[data.props[0].id] || '';
const dbLocale = () => LANG._locale || LANG_ID;

/* ---- dates ---- */
function dbDay(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); }
function dbAddDays(key, n) { const d = dbDay(key); d.setDate(d.getDate() + n); return todayKey(d); }
function dbDaysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}
// this year's dates without the year, the way a calendar on the wall says them
function dbDateLabel(v) {
  const year = String(new Date().getFullYear());
  const short = (k) => fmtDate(k, k.slice(0, 4) === year ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  const [s, e] = String(v || '').split('/');
  return e ? `${short(s)} → ${short(e)}` : short(s);
}
// a date moved by `n` days, keeping its length if it is a range
function dbShiftDate(v, n) {
  const s = dbDateStart(v), e = String(v || '').split('/')[1];
  return e ? dbAddDays(s, n) + '/' + dbAddDays(e, n) : dbAddDays(s, n);
}

/* ---- making one ---- */
function newDbData(type, chart) {
  const P = (ptype, name, opts) => (opts ? { id: 'p' + uid(), name, type: ptype, opts } : { id: 'p' + uid(), name, type: ptype });
  const O = (name, color) => ({ id: 'o' + uid(), name, color });
  const todo = O(t('db.st.todo'), 'default'), doing = O(t('db.st.doing'), 'blue'), done = O(t('db.st.done'), 'green');
  const status = P('status', t('db.prop.status'), [todo, doing, done]);
  const date = P('date', t('db.prop.date'));
  const props = [P('title', t('db.prop.name')), status, date];
  if (type === 'map') props.push(P('place', t('db.prop.place')));
  /* Three rows, spread over the statuses and the next week, so every layout
     has something to draw the moment it arrives — a calendar with nothing on
     it and a chart of nothing both read as broken. */
  const rows = [[todo, 0], [doing, 2], [done, 5]].map(([o, d]) =>
    ({ id: 'r' + uid(), c: { [status.id]: o.id, [date.id]: dayKeyIn(d) } }));
  const view = { id: 'v' + uid(), type, name: '' };
  if (type === 'chart') view.chart = DB_CHARTS.includes(chart) ? chart : 'bar';
  return { v: 1, id: 'd' + uid(), name: '', props, rows, views: [view], cur: view.id };
}
/* The JSON a block stores. `<` and `>` are written as \u003c and \u003e — still
   the same JSON — because a stored body is also read by regex (the far-zoom
   ghost's GHOST_TAG), and Chromium leaves a bare `>` in an attribute when it
   serialises one: a cell saying "a > b" would have ended the tag there. */
const dbJson = (db) => JSON.stringify(db).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
function dbBlockHtml(db) {
  return `<div class="mb-db" contenteditable="false" data-dbid="${esc(db.id)}"${db.src ? ` data-src="${esc(db.src)}"` : ''} data-db="${esc(dbJson(db))}"></div>`;
}
// a note too small to show a database is grown to fit one, never shrunk
function growNoteFor(n, type) {
  const [w, h] = DB_SIZE[type] || DB_SIZE.table;
  if (!n || (n.w >= w && n.h >= h)) return;
  n.w = Math.max(n.w, w); n.h = Math.max(n.h, h);
  const el = els.get(n.id);
  if (el) placeEl(el, n);
  drawLinks();
}
function afterDbInsert(type) {
  const body = editing, n = editNote;
  if (!body) return;
  paintDatabases(body);
  normalizeBody(body);
  ensureTail(body);
  growNoteFor(n, type);
  persistEdit();
}
function insertDatabase(type, chart) {
  if (!editing || !editNote) return;
  escapeList();
  insertHTML(dbBlockHtml(newDbData(type, chart)) + '<p><br></p>');
  afterDbInsert(type);
}

/* "Database – Full page": in Notion, a page that is the database. Here a note
   is the page, so it is a new note beside this one, holding the database, and
   a link to it at the caret. */
function insertDatabasePage() {
  if (!editing || !editNote) return;
  const from = editNote, body = editing;
  const s = getSelection();
  const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  const [w, h] = [760, 480];
  const n = addNote({ x: from.x + from.w + 60 + w / 2, y: from.y + h / 2 },
    { w, h, body: dbBlockHtml(newDbData('table')) + '<p><br></p>', edit: false });
  if (!n) return;
  if (editing !== body) enterEdit(from);
  body.focus();
  if (range) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
  insertHTML(`<a class="mb-note" data-note="${esc(n.id)}" data-board="${esc(state.activeBoard)}" href="#">${esc(t('db.untitled'))}</a>&nbsp;`);
  persistEdit();
  toast(t('db.pageMade'));
}

/* Every database on this board that owns its data — what a linked view can show. */
function dbSources() {
  const out = [];
  state.notes.forEach((n) => {
    if (!n.body || n.body.indexOf('mb-db') < 0) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = n.body;
    tpl.content.querySelectorAll('.mb-db:not([data-src])').forEach((el) => {
      const db = adoptDb(el.getAttribute('data-db'));
      if (db && !db.src && !out.some((x) => x.id === db.id)) out.push({ id: db.id, name: db.name, n, rows: db.rows.length });
    });
  });
  return out;
}
function pickLinkedDatabase() {
  if (!editing) return;
  const list = dbSources();
  if (!list.length) { toast(t('db.noneToLink'), 3600); return; }
  const body = editing;
  const s = getSelection();
  const range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  const rr = range && range.getBoundingClientRect();
  openDbPop(rr && (rr.width || rr.height) ? rr : body.getBoundingClientRect(), (q) => ({
    title: t('db.pickSource'),
    input: { ph: t('db.search'), filter: true },
    items: list.filter((x) => !q || foldSearch(x.name || t('db.untitled')).includes(foldSearch(q))).map((x) => ({
      ic: icon('database'), label: x.name || t('db.untitled'), hint: t('db.rows', { n: x.rows }),
      act: () => {
        if (editing !== body) enterEdit(noteOfBlock(body) || editNote);
        body.focus();
        if (range) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
        const view = { id: 'v' + uid(), type: 'table', name: '' };
        insertHTML(dbBlockHtml({ v: 1, id: 'd' + uid(), name: '', src: x.id, views: [view], cur: view.id }) + '<p><br></p>');
        afterDbInsert('table');
      }
    }))
  }));
}

/* ---- where a block's data is ----
   A block owns its data, or a linked view reads another block's. dbCtx() is
   the one place that resolves it: { el, own, data, loc } — `own` is what this
   block stores (its views, and its data if it has any), `data` the properties
   and rows to draw, `loc` the owner when that is somebody else. */
function noteOfBlock(el) {
  const ne = el && el.closest && el.closest('.note');
  return ne ? state.notes.find((x) => x.id === ne.dataset.id) || null : null;
}
function dbLocate(id) {
  if (!okDbId(id)) return null;
  const mark = `data-dbid="${id}"`;
  for (const n of state.notes) {
    if (!n.body || n.body.indexOf(mark) < 0) continue;
    const live = els.get(n.id);
    const el = live && live.querySelector(`.note-body .mb-db[data-dbid="${id}"]:not([data-src])`);
    if (el) { const db = adoptDb(el.getAttribute('data-db')); if (db && !db.src) return { n, el, db }; }
    const tpl = document.createElement('template');
    tpl.innerHTML = n.body;
    const off = tpl.content.querySelector(`.mb-db[data-dbid="${id}"]:not([data-src])`);
    if (off) { const db = adoptDb(off.getAttribute('data-db')); if (db && !db.src) return { n, el: null, tpl, off, db }; }
  }
  return null;
}
function dbCtx(el) {
  if (!el) return null;
  const own = adoptDb(el.getAttribute('data-db'));
  if (!own) return null;
  if (!own.src) return { el, own, data: own, loc: null };
  const loc = dbLocate(own.src);
  return { el, own, data: loc ? loc.db : null, loc };
}
const dbView = (ctx) => ctx.own.views.find((v) => v.id === ctx.own.cur) || ctx.own.views[0];

/* ---- writing ----
   The attribute is the truth; the note's stored body is rewritten from it the
   same way a keystroke rewrites it (bodyHtml), and the save goes through
   saveSoon() like everything else. */
function dbWriteEl(el, db) {
  el.setAttribute('data-db', dbJson(db));
  const body = el.closest('.note-body'), n = noteOfBlock(el);
  if (body && n) {
    n.body = bodyHtml(body);
    if (editing === body) editDirty = true;
  }
}
function dbWriteLoc(loc, db) {
  if (loc.el && loc.el.isConnected) { dbWriteEl(loc.el, db); return; }
  if (!loc.off) return;
  loc.off.setAttribute('data-db', dbJson(db));
  const d = document.createElement('div');
  d.appendChild(loc.tpl.content.cloneNode(true));
  loc.n.body = d.innerHTML;
}
function dbRepaintId(id) {
  document.querySelectorAll('#notesLayer .mb-db').forEach((b) => {
    if (b.dataset.dbid === id || b.dataset.src === id) paintDb(b);
  });
}
/* One change to a database: `fn` mutates ctx.data (rows, properties, the
   name) and/or ctx.own (views), and returns false to call it off. `part` says
   which: 'view' writes only this block, anything else writes the data where it
   lives — this block, or the one a linked view reads; 'ui' is a view change
   too small to undo (which tab is showing). A change to a note nobody is
   typing in is a step of the board's undo; inside the note being edited, the
   edit already is one. */
function dbEdit(el, fn, part) {
  if (!el || !el.isConnected || !canEditHere()) return false;
  const viewOnly = part === 'view' || part === 'ui';
  const ctx = dbCtx(el);
  if (!ctx || (!viewOnly && !ctx.data)) return false;
  const hosts = [noteOfBlock(el), !viewOnly && ctx.loc ? ctx.loc.n : null].filter(Boolean);
  const pushed = part !== 'ui' && !hosts.some((n) => editNote === n);
  if (pushed) pushUndo();
  if (fn(ctx) === false) { if (pushed) popUndo(); return false; }
  if (!viewOnly && ctx.loc) dbWriteLoc(ctx.loc, ctx.data);
  if (viewOnly || !ctx.loc) dbWriteEl(el, ctx.own);
  dbRepaintId(ctx.own.src || ctx.own.id);
  saveSoon();
  if (dbRd && dbRd.el === el) paintDbRow();
  return true;
}

/* ---- painting ---- */
const dbUiState = new Map();          // `${block}:${view}` → { m: month offset, s: timeline start } — never saved
function dbUiOf(ctx, view) {
  const k = ctx.own.id + ':' + view.id;
  if (!dbUiState.has(k)) dbUiState.set(k, {});
  return dbUiState.get(k);
}
function paintDatabases(root) {
  if (root) root.querySelectorAll('.mb-db').forEach(paintDb);
}
function paintDb(el) {
  el.setAttribute('contenteditable', 'false');
  let face = el.querySelector(':scope > .db-face');
  if (!face) {
    el.textContent = '';                  // a paste can leave the old face's text behind
    face = document.createElement('div');
    face.className = 'db-face';
    face.setAttribute('dir', 'auto');
    shieldDbFace(face);
    el.appendChild(face);
  }
  const ctx = dbCtx(el);
  face.innerHTML = ctx ? dbFaceHtml(ctx) : `<div class="db-hint">${te('db.broken')}</div>`;
}
/* Typing in a field inside a database is not typing in the note. Without this
   every keystroke in a cell reached the editor's own keydown — '/' opened the
   slash menu, Enter split the paragraph round the block — and the window's
   shortcuts after it. */
function shieldDbFace(face) {
  const inField = (e) => e.target.matches && e.target.matches('input, textarea, select');
  ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'paste', 'copy', 'cut', 'compositionstart', 'compositionend']
    .forEach((type) => face.addEventListener(type, (e) => { if (inField(e)) e.stopPropagation(); }));
}

function dbFaceHtml(ctx) {
  const view = dbView(ctx);
  const body = !ctx.data
    ? `<div class="db-hint">${icon('link_off')}<span>${te('db.sourceGone')}</span></div>`
    : dbPaintView(ctx, view);
  return dbTopHtml(ctx, view) + `<div class="db-body db-v-${view.type}">${body}</div>`;
}
function dbPaintView(ctx, view) {
  switch (view.type) {
    case 'board': return dbBoardHtml(ctx, view);
    case 'gallery': return dbGalleryHtml(ctx, view);
    case 'list': return dbListHtml(ctx, view);
    case 'calendar': return dbCalendarHtml(ctx, view);
    case 'timeline': return dbTimelineHtml(ctx, view);
    case 'feed': return dbFeedHtml(ctx, view);
    case 'dashboard': return dbDashboardHtml(ctx, view);
    case 'map': return dbMapHtml(ctx, view);
    case 'chart': return dbChartHtml(ctx, view);
    case 'form': return dbFormHtml(ctx, view);
    default: return dbTableHtml(ctx, view);
  }
}

/* The bar over every view: the tabs, then the name. Notion's order — the tabs
   are what changes most. A linked view's name is the source's, with an arrow,
   and pressing it flies to the note that holds the data. */
function dbTopHtml(ctx, view) {
  const { own, data } = ctx;
  const name = data ? data.name : '';
  const tabs = own.views.map((v) =>
    `<button class="db-tab${v === view ? ' on' : ''}" data-act="tab" data-v="${esc(v.id)}">${dbViewIcon(v)}<span dir="auto">${esc(dbViewName(v))}</span></button>`).join('');
  return `<div class="db-top">
      <div class="db-tabs">${tabs}<button class="db-tab db-tab-add" data-act="add-view" title="${te('db.addView')}">${icon('add')}</button></div>
      <span class="db-gap"></span>
      <button class="db-tool" data-act="view-menu" title="${te('db.viewOptions')}">${icon('more_horiz')}</button>
      ${data && view.type !== 'form' ? `<button class="db-newbtn" data-act="new-row">${te('db.new')}</button>` : ''}
    </div>
    <button class="db-name${name ? '' : ' dim'}" data-act="${own.src ? 'goto-src' : 'rename'}" dir="auto">${own.src ? icon('north_east') : ''}<span>${esc(name || t('db.untitled'))}</span></button>`;
}

/* ---- what a view shows ---- */
function dbShown(data, view) {
  const hide = view.hide || [];
  return data.props.filter((p, i) => i === 0 || !hide.includes(p.id));
}
function dbSortKey(data, p, v) {
  if (v === undefined) return null;
  switch (p.type) {
    case 'number': return v;
    case 'check': return 1;
    case 'select': case 'status': return p.opts.findIndex((o) => o.id === v);
    case 'multi': return p.opts.findIndex((o) => o.id === v[0]);
    case 'date': return dbDateStart(v);
    default: return foldSearch(String(v));
  }
}
function dbRows(data, view) {
  const rows = data.rows.slice();
  const p = view.sort && dbProp(data, view.sort.p);
  if (!p) return rows;
  const dir = view.sort.dir;
  return rows.sort((a, b) => {
    const x = dbSortKey(data, p, a.c[p.id]), y = dbSortKey(data, p, b.c[p.id]);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;   // empties last, either way
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
}
// the property a view is built on: the one it names if that still fits, else the first that does
function dbPropFor(data, view, types) {
  const named = view.by && dbProp(data, view.by);
  if (named && types.includes(named.type)) return named;
  return data.props.find((p) => types.includes(p.type)) || null;
}
// the colour a row is drawn in: its first status or select
function dbRowColor(data, r) {
  const p = data.props.find((x) => x.type === 'status' || x.type === 'select');
  const o = p && dbOpt(p, r.c[p.id]);
  return o ? o.color : 'default';
}
function dbHint(text, act, label) {
  return `<div class="db-hint"><span>${esc(text)}</span>${act ? `<button class="db-link" data-act="${act}">${icon('add')}<span>${esc(label)}</span></button>` : ''}</div>`;
}

function dbPill(o, kind) {
  return `<span class="db-pill db-c-${esc(o.color)}${kind === 'status' ? ' db-st' : ''}" dir="auto">${esc(o.name || t('db.unnamedOpt'))}</span>`;
}
function dbCellHtml(data, p, r) {
  const v = r.c[p.id];
  switch (p.type) {
    case 'title': return `<span class="db-tt${v ? '' : ' dim'}" dir="auto">${esc(v || t('db.untitledRow'))}</span>`;
    case 'number': return v === undefined ? '' : `<span class="db-num">${esc(num(v))}</span>`;
    case 'select': case 'status': { const o = dbOpt(p, v); return o ? dbPill(o, p.type) : ''; }
    case 'multi': return (v || []).map((id) => dbOpt(p, id)).filter(Boolean).map((o) => dbPill(o, 'multi')).join('');
    case 'date': return v ? `<span class="db-date">${esc(dbDateLabel(v))}</span>` : '';
    case 'check': return `<span class="db-check${v ? ' on' : ''}">${v ? icon('check') : ''}</span>`;
    case 'url': return v ? `<span class="db-url" dir="ltr">${esc(v.replace(/^https?:\/\//i, ''))}</span>` : '';
    default: return v ? `<span dir="auto">${esc(v)}</span>` : '';
  }
}
// a cell as plain text — Markdown, search, a chart's label
function dbCellText(data, p, r) {
  const v = r.c[p.id];
  if (v === undefined) return '';
  switch (p.type) {
    case 'select': case 'status': { const o = dbOpt(p, v); return o ? o.name : ''; }
    case 'multi': return v.map((id) => (dbOpt(p, id) || {}).name || '').filter(Boolean).join(', ');
    case 'date': return v.replace('/', ' → ');
    case 'check': return '✓';
    case 'number': return String(v);
    default: return String(v);
  }
}
// the properties on a card, with their values; the title and the group are already said
function dbCardProps(data, view, r, skip) {
  return dbShown(data, view).slice(1).filter((p) => p.id !== skip && r.c[p.id] !== undefined)
    .map((p) => `<div class="db-cprop db-t-${p.type}">${dbCellHtml(data, p, r)}</div>`).join('');
}

/* Table — Notion's grid. A row is its own CSS grid on the same columns (the
   custom property is plain px, so normalizeBody's `var(` scrub leaves it), not
   a <table>: the note's own table code answers to td/th and would have shown
   its row/column bar for a cell in here. */
const DB_COL_W = { title: 220, text: 180, number: 100, select: 140, status: 140, multi: 190, date: 170, check: 64, url: 180, place: 170 };
function dbTableHtml(ctx, view) {
  const { data } = ctx;
  const props = dbShown(data, view);
  const cols = props.map((p) => DB_COL_W[p.type] + 'px').join(' ') + ' 34px';
  const sort = view.sort && dbProp(data, view.sort.p);
  const head = props.map((p) => `<div class="db-th" data-act="prop" data-p="${esc(p.id)}">${dbPropIcon(p.type)}<span dir="auto">${esc(dbPropName(p))}</span>${sort === p ? (view.sort.dir < 0 ? icon('arrow_downward') : icon('arrow_upward')) : ''}</div>`).join('') +
    `<div class="db-th db-th-add" data-act="add-prop" title="${te('db.addProp')}">${icon('add')}</div>`;
  const rows = dbRows(data, view).map((r) => `<div class="db-tr" data-r="${esc(r.id)}">` +
    props.map((p) => `<div class="db-td db-t-${p.type}" data-act="cell" data-r="${esc(r.id)}" data-p="${esc(p.id)}">${dbCellHtml(data, p, r)}` +
      (p.type === 'title' ? `<button class="db-open" data-act="open" data-r="${esc(r.id)}">${icon('open_in_full')}<span>${te('db.open')}</span></button>` : '') +
      (p.type === 'url' && r.c[p.id] ? `<button class="db-mini" data-act="open-url" data-r="${esc(r.id)}" data-p="${esc(p.id)}" title="${te('db.openLink')}">${icon('open_in_new')}</button>` : '') +
      `</div>`).join('') +
    `<div class="db-td db-td-x"><button class="db-mini" data-act="row-menu" data-r="${esc(r.id)}" title="${te('db.rowMenu')}">${icon('more_horiz')}</button></div></div>`).join('');
  return `<div class="db-scroll"><div class="db-grid" style="--db-cols:${cols}"><div class="db-tr db-thead">${head}</div>${rows}</div></div>
    <button class="db-addrow" data-act="new-row-inline">${icon('add')}<span>${te('db.newPage')}</span></button>
    <div class="db-foot">${te('db.rows', { n: data.rows.length })}</div>`;
}

/* Board — a column per option of a status, select or multi-select property,
   and a "No …" column only while something is in it. Cards drag between them. */
function dbBoardHtml(ctx, view) {
  const { data } = ctx;
  const g = dbPropFor(data, view, ['status', 'select', 'multi']);
  if (!g) return dbHint(t('db.needGroup'), 'add-status', t('db.addStatus'));
  const rows = dbRows(data, view);
  const inGroup = (r, key) => {
    const v = r.c[g.id];
    if (g.type === 'multi') return key ? (v || []).includes(key) : !(v || []).length;
    return (v || '') === key;
  };
  const groups = [...g.opts.map((o) => ({ key: o.id, o })), { key: '', o: null }];
  const cols = groups.map(({ key, o }) => {
    const mine = rows.filter((r) => inGroup(r, key));
    if (!key && !mine.length) return '';
    const head = o ? dbPill(o, g.type) : `<span class="db-pill db-c-default">${te('db.noValue', { name: dbPropName(g) })}</span>`;
    return `<div class="db-col" data-drop="group" data-g="${esc(key)}">
      <div class="db-colhead">${head}<span class="db-n">${esc(num(mine.length))}</span></div>
      ${mine.map((r) => `<div class="db-card" data-act="card" data-drag="card" data-r="${esc(r.id)}"><div class="db-ctitle">${dbCellHtml(data, data.props[0], r)}</div>${dbCardProps(data, view, r, g.id)}</div>`).join('')}
      <button class="db-colnew" data-act="new-in-group" data-g="${esc(key)}">${icon('add')}<span>${te('db.newPage')}</span></button>
    </div>`;
  }).join('');
  return `<div class="db-scroll"><div class="db-cols">${cols}</div></div>`;
}

/* Gallery — cards in a grid; the cover is the start of what is written on the page. */
function dbGalleryHtml(ctx, view) {
  const { data } = ctx;
  const cards = dbRows(data, view).map((r) => `<div class="db-gcard" data-act="card" data-r="${esc(r.id)}">
      <div class="db-gcover db-c-${esc(dbRowColor(data, r))}">${r.t ? `<span dir="auto">${esc(r.t.slice(0, 260))}</span>` : ''}</div>
      <div class="db-gbody"><div class="db-ctitle">${dbCellHtml(data, data.props[0], r)}</div>${dbCardProps(data, view, r, '')}</div>
    </div>`).join('');
  return `<div class="db-gallery">${cards}<button class="db-gnew" data-act="new-row">${icon('add')}<span>${te('db.newPage')}</span></button></div>`;
}

/* List — one line a row, the title and then its properties at the far end. */
function dbListHtml(ctx, view) {
  const { data } = ctx;
  const rows = dbRows(data, view).map((r) => `<div class="db-li" data-act="card" data-r="${esc(r.id)}">${icon('description')}
      <span class="db-ltitle">${dbCellHtml(data, data.props[0], r)}</span>
      <span class="db-lprops">${dbCardProps(data, view, r, '')}</span></div>`).join('');
  return `<div class="db-list">${rows}</div><button class="db-addrow" data-act="new-row">${icon('add')}<span>${te('db.newPage')}</span></button>`;
}

/* Feed — every page, one under the other, with what is written on it. */
function dbFeedHtml(ctx, view) {
  const { data } = ctx;
  const posts = dbRows(data, view).map((r) => `<article class="db-post" data-act="card" data-r="${esc(r.id)}">
      <div class="db-ptitle">${dbCellHtml(data, data.props[0], r)}</div>
      <div class="db-pmeta">${dbCardProps(data, view, r, '')}</div>
      <div class="db-ptext${r.t ? '' : ' dim'}" dir="auto">${esc(r.t || t('db.emptyPage'))}</div>
    </article>`).join('');
  return `<div class="db-feed">${posts}</div><button class="db-addrow" data-act="new-row">${icon('add')}<span>${te('db.newPage')}</span></button>`;
}

/* Calendar — a month, Sunday first, the way Notion lays it out. A ranged date
   is on every day it covers. Chips drag to another day. */
function dbCalendarHtml(ctx, view) {
  const { data } = ctx;
  const d = dbPropFor(data, view, ['date']);
  if (!d) return dbHint(t('db.needDate'), 'add-date', t('db.addDate'));
  const ui = dbUiOf(ctx, view);
  const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + (ui.m || 0));
  const y = first.getFullYear(), m = first.getMonth();
  const start = new Date(y, m, 1 - first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7);
  const today = dayKeyIn(0);
  const rows = dbRows(data, view).filter((r) => r.c[d.id]);
  const loc = dbLocale();
  let wd;
  try { wd = new Intl.DateTimeFormat(loc, { weekday: 'short' }); } catch (_) { wd = new Intl.DateTimeFormat('en', { weekday: 'short' }); }
  const heads = [...Array(7)].map((_, i) => `<span>${esc(wd.format(new Date(2023, 0, 1 + i)))}</span>`).join('');
  let cells = '';
  for (let i = 0; i < weeks * 7; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const key = todayKey(day);
    const here = rows.filter((r) => { const v = r.c[d.id]; return dbDateStart(v) <= key && key <= dbDateEnd(v); });
    const chips = here.slice(0, 3).map((r) => `<div class="db-chip db-c-${esc(dbRowColor(data, r))}" data-act="card" data-drag="chip" data-r="${esc(r.id)}"><span dir="auto">${esc(dbTitle(data, r) || t('db.untitledRow'))}</span></div>`).join('');
    const more = here.length > 3 ? `<button class="db-more" data-act="day-more" data-day="${key}">${te('db.more', { n: here.length - 3 })}</button>` : '';
    cells += `<div class="db-day${day.getMonth() !== m ? ' out' : ''}${key === today ? ' today' : ''}" data-drop="day" data-day="${key}">
      <div class="db-dtop"><span class="db-dnum">${esc(num(day.getDate()))}</span><button class="db-dadd" data-act="new-on-day" data-day="${key}" title="${te('db.newPage')}">${icon('add')}</button></div>${chips}${more}</div>`;
  }
  const undated = data.rows.length - rows.length;
  return `${dbNavHtml(fmtDate(todayKey(first), { month: 'long', year: 'numeric' }), 'cal')}
    <div class="db-cal"><div class="db-wk">${heads}</div><div class="db-month">${cells}</div></div>
    ${undated ? `<div class="db-foot">${te('db.undated', { n: undated })}</div>` : ''}`;
}
function dbNavHtml(label, kind) {
  return `<div class="db-nav"><span class="db-navlabel">${esc(label)}</span><span class="db-gap"></span>
    <button class="db-mini" data-act="${kind}-prev" title="${te('db.prev')}">${icon('chevron_left')}</button>
    <button class="db-today" data-act="${kind}-today">${te('db.today')}</button>
    <button class="db-mini" data-act="${kind}-next" title="${te('db.next')}">${icon('chevron_right')}</button></div>`;
}

/* Timeline — six weeks across, a lane a row, a bar from the start of its date
   to the end. Bars drag sideways a day at a time. */
function dbTimelineHtml(ctx, view) {
  const { data } = ctx;
  const d = dbPropFor(data, view, ['date']);
  if (!d) return dbHint(t('db.needDate'), 'add-date', t('db.addDate'));
  const ui = dbUiOf(ctx, view);
  const from = ui.s || dbAddDays(dayKeyIn(0), -7);
  const to = dbAddDays(from, DB_TL_DAYS - 1);
  const today = dayKeyIn(0);
  const W = DB_TL_W, wide = DB_TL_DAYS * W;
  let days = '', months = '';
  for (let i = 0; i < DB_TL_DAYS; i++) {
    const key = dbAddDays(from, i), day = dbDay(key);
    if (i === 0 || day.getDate() === 1) months += `<span style="left:${i * W}px">${esc(fmtDate(key, { month: 'short', year: 'numeric' }))}</span>`;
    const we = day.getDay() === 0 || day.getDay() === 6;
    days += `<span class="db-tlday${key === today ? ' today' : ''}${we ? ' we' : ''}">${esc(num(day.getDate()))}</span>`;
  }
  const rows = dbRows(data, view).filter((r) => r.c[d.id]);
  if (!view.sort) rows.sort((a, b) => (dbDateStart(a.c[d.id]) < dbDateStart(b.c[d.id]) ? -1 : 1));
  const lanes = rows.map((r) => {
    const v = r.c[d.id];
    const x = dbDaysBetween(from, dbDateStart(v)) * W;
    const w = (dbDaysBetween(dbDateStart(v), dbDateEnd(v)) + 1) * W;
    const name = esc(dbTitle(data, r) || t('db.untitledRow'));
    // a bar too short for its name has the name beside it, as Notion's does
    const short = w < 100;
    return `<div class="db-lane"><div class="db-bar db-c-${esc(dbRowColor(data, r))}" data-act="card" data-drag="bar" data-r="${esc(r.id)}" style="left:${x}px;width:${w - 4}px">${short ? '' : `<span dir="auto">${name}</span>`}</div>` +
      (short ? `<span class="db-barname" style="left:${x + w + 2}px" dir="auto">${name}</span>` : '') + '</div>';
  }).join('');
  const now = dbDaysBetween(from, today);
  const undated = data.rows.length - rows.length;
  return `${dbNavHtml(`${fmtDate(from, { day: 'numeric', month: 'short' })} – ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`, 'tl')}
    <div class="db-scroll"><div class="db-tl" style="width:${wide}px;background-size:${W}px 100%">
      <div class="db-tlmonths">${months}</div><div class="db-tldays" style="grid-template-columns:repeat(${DB_TL_DAYS},${W}px)">${days}</div>
      ${now >= 0 && now < DB_TL_DAYS ? `<i class="db-tlnow" style="left:${now * W + W / 2}px"></i>` : ''}
      <div class="db-lanes">${lanes || `<div class="db-lane db-lane-empty">${te('db.nothingDated')}</div>`}</div>
    </div></div>
    ${undated ? `<div class="db-foot">${te('db.undated', { n: undated })}</div>` : ''}`;
}

/* ---- charts ----
   What a chart counts: rows grouped by a property — each option of a status or
   select (a multi-select puts a row in every option it has), ticked or not,
   the month of a date, or the plain value of anything else — and either
   counted or, with a number property chosen, added up. */
function dbChartGroups(data, view) {
  const by = (view.by && dbProp(data, view.by)) || dbPropFor(data, {}, ['status', 'select', 'multi']) || dbPropFor(data, {}, ['date']);
  const val = view.val && dbProp(data, view.val);
  const sum = val && val.type === 'number' ? val : null;
  const amount = (r) => (sum ? (+r.c[sum.id] || 0) : 1);
  const map = new Map();
  const put = (key, label, color) => { if (!map.has(key)) map.set(key, { key, label, color, v: 0 }); return map.get(key); };
  // an option keeps its own colour, grey included: two statuses must never share a bar colour
  if (by && DB_OPT_TYPES.includes(by.type)) by.opts.forEach((o) => put(o.id, o.name || t('db.unnamedOpt'), o.color));
  if (by && by.type === 'check') { put('1', t('db.checked'), 'green'); put('0', t('db.unchecked'), ''); }
  data.rows.forEach((r) => {
    const v = by ? r.c[by.id] : undefined;
    if (!by) { put('*', t('db.allRows'), 'blue').v += amount(r); return; }
    if (by.type === 'multi') {
      if (!v) put('', t('db.noValue', { name: dbPropName(by) }), '').v += amount(r);
      else v.forEach((id) => { if (map.has(id)) map.get(id).v += amount(r); });
      return;
    }
    if (by.type === 'check') { map.get(v ? '1' : '0').v += amount(r); return; }
    if (by.type === 'date') {
      if (!v) return;
      const k = dbDateStart(v).slice(0, 7);
      put(k, fmtDate(k + '-01', { month: 'short', year: 'numeric' }), '').v += amount(r);
      return;
    }
    if (v === undefined) { put('', t('db.noValue', { name: dbPropName(by) }), '').v += amount(r); return; }
    const key = DB_OPT_TYPES.includes(by.type) ? v : dbCellText(data, by, r);
    put(key, key, '').v += amount(r);
  });
  let groups = [...map.values()];
  if (by && by.type === 'date') groups.sort((a, b) => (a.key < b.key ? -1 : 1));
  if (by && !DB_OPT_TYPES.includes(by.type) && by.type !== 'date' && by.type !== 'check') groups = groups.sort((a, b) => b.v - a.v).slice(0, 12);
  let c = 0;
  groups.forEach((g) => { if (!g.color) g.color = DB_CYCLE[c++ % DB_CYCLE.length]; });
  const total = groups.reduce((s, g) => s + g.v, 0);
  return { by, sum, groups, total: by && by.type === 'multi' ? data.rows.reduce((s, r) => s + amount(r), 0) : total };
}
const dbFmt = (v) => num(Math.round(v * 100) / 100);
function dbBarsHtml(cg) {
  const max = Math.max(1, ...cg.groups.map((g) => g.v));
  return `<div class="db-bars"><div class="db-plot">${cg.groups.map((g) => `<div class="db-bcol"><span class="db-bv">${esc(dbFmt(g.v))}</span><i class="db-c-${esc(g.color)}" style="height:${(g.v / max) * 100}%"></i></div>`).join('')}</div>
    <div class="db-xlab">${cg.groups.map((g) => `<span dir="auto">${esc(g.label)}</span>`).join('')}</div></div>`;
}
function dbHbarsHtml(cg) {
  const max = Math.max(1, ...cg.groups.map((g) => g.v));
  return `<div class="db-hbars">${cg.groups.map((g) => `<div class="db-hrow"><span class="db-hl" dir="auto">${esc(g.label)}</span><span class="db-htrack"><i class="db-c-${esc(g.color)}" style="width:${(g.v / max) * 100}%"></i></span><span class="db-hv">${esc(dbFmt(g.v))}</span></div>`).join('')}</div>`;
}
/* The line is stretched to the plot (preserveAspectRatio none, with a stroke
   that does not stretch); the dots are HTML laid over it, so they stay round. */
function dbLineHtml(cg) {
  const n = cg.groups.length, max = Math.max(1, ...cg.groups.map((g) => g.v));
  const y = (v) => 92 - (v / max) * 84;
  const pts = cg.groups.map((g, i) => `${((i + 0.5) / n) * 100},${y(g.v)}`).join(' ');
  return `<div class="db-line"><div class="db-lplot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>
      ${cg.groups.map((g, i) => `<i style="left:${((i + 0.5) / n) * 100}%;top:${y(g.v)}%" title="${esc(dbFmt(g.v))}"></i>`).join('')}
    </div><div class="db-xlab">${cg.groups.map((g) => `<span dir="auto">${esc(g.label)}</span>`).join('')}</div></div>`;
}
function dbDonutHtml(cg) {
  let at = 0;
  const arcs = cg.groups.filter((g) => g.v > 0).map((g) => {
    const share = cg.total ? (g.v / cg.total) * 100 : 0;
    const arc = `<circle class="db-c-${esc(g.color)}" cx="21" cy="21" r="15.915" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${25 - at}"/>`;
    at += share;
    return arc;
  }).join('');
  return `<div class="db-donut"><div class="db-ring"><svg viewBox="0 0 42 42" aria-hidden="true"><circle class="db-ring-bg" cx="21" cy="21" r="15.915"/>${arcs}</svg><b>${esc(dbFmt(cg.total))}</b></div>
    <div class="db-legend">${cg.groups.map((g) => `<span><i class="db-c-${esc(g.color)}"></i><em dir="auto">${esc(g.label)}</em><b>${esc(dbFmt(g.v))}</b></span>`).join('')}</div></div>`;
}
function dbChartHtml(ctx, view) {
  const cg = dbChartGroups(ctx.data, view);
  const what = cg.sum ? t('db.sumOf', { name: dbPropName(cg.sum) }) : t('db.countRows');
  const head = `<div class="db-chead">${esc(what)}${cg.by ? ` · ${esc(t('db.byProp', { name: dbPropName(cg.by) }))}` : ''}</div>`;
  if (view.chart === 'number') return `<div class="db-numchart"><b>${esc(dbFmt(cg.total))}</b><span>${esc(what)}</span></div>`;
  if (!cg.groups.length) return dbHint(t('db.nothingToChart'));
  if (view.chart === 'hbar') return head + dbHbarsHtml(cg);
  if (view.chart === 'line') return head + dbLineHtml(cg);
  if (view.chart === 'donut') return head + dbDonutHtml(cg);
  return head + dbBarsHtml(cg);
}

/* Dashboard — widgets made from what the data has: the count, a sum, a ring
   by its status (or whatever the view is grouped by), the months of its
   dates, and the newest rows. */
function dbDashboardHtml(ctx, view) {
  const { data } = ctx;
  const numP = view.val ? dbProp(data, view.val) : data.props.find((p) => p.type === 'number');
  const sum = numP && numP.type === 'number' ? data.rows.reduce((s, r) => s + (+r.c[numP.id] || 0), 0) : null;
  const g = dbPropFor(data, view, ['status', 'select', 'multi', 'check']);
  const d = data.props.find((p) => p.type === 'date');
  const w = (cls, label, inner) => `<div class="db-w ${cls}"><span class="db-wl" dir="auto">${esc(label)}</span>${inner}</div>`;
  let html = w('db-w-num', t('db.total'), `<b>${esc(num(data.rows.length))}</b>`);
  if (sum !== null) html += w('db-w-num', t('db.sumOf', { name: dbPropName(numP) }), `<b>${esc(dbFmt(sum))}</b>`);
  else {
    const done = g && g.type === 'status' ? g.opts[g.opts.length - 1] : null;
    if (done) html += w('db-w-num', done.name || t('db.unnamedOpt'), `<b>${esc(num(data.rows.filter((r) => r.c[g.id] === done.id).length))}</b>`);
  }
  if (g) html += w('db-w-wide', t('db.byProp', { name: dbPropName(g) }), dbDonutHtml(dbChartGroups(data, { by: g.id })));
  if (d) {
    const cg = dbChartGroups(data, { by: d.id });
    if (cg.groups.length) html += w('db-w-wide', t('db.byProp', { name: dbPropName(d) }), dbBarsHtml(cg));
  }
  const recent = data.rows.slice(-5).reverse();
  html += w('db-w-wide', t('db.recent'), recent.length
    ? `<div class="db-list">${recent.map((r) => `<div class="db-li" data-act="card" data-r="${esc(r.id)}">${icon('description')}<span class="db-ltitle">${dbCellHtml(data, data.props[0], r)}</span><span class="db-lprops">${dbCardProps(data, view, r, '')}</span></div>`).join('')}</div>`
    : `<span class="dim">${te('db.emptyDb')}</span>`);
  return `<div class="db-dash">${html}</div>`;
}

/* Map — a Place is "latitude, longitude" (or just a name). There are no map
   tiles: the app has no network in the page and keeps it that way. The rows
   are pinned on a plain projection of the continents, and a place opens in
   OpenStreetMap in the browser, which is where a map that zooms belongs. */
const DB_WORLD = [
  [-168, 65, -156, 71, -130, 70, -110, 73, -85, 72, -75, 62, -62, 58, -55, 50, -66, 44, -76, 35, -81, 25, -90, 29, -97, 26, -97, 20, -87, 21, -83, 10, -79, 8, -92, 15, -105, 20, -112, 30, -118, 34, -124, 40, -124, 48, -135, 58, -150, 60, -165, 60],
  [-73, 78, -60, 82, -30, 83, -20, 75, -40, 65, -50, 62, -60, 70],
  [-79, 8, -72, 12, -60, 10, -50, 0, -35, -5, -40, -22, -48, -28, -58, -38, -65, -42, -68, -55, -75, -50, -72, -35, -71, -18, -81, -5, -80, 1],
  [-10, 36, -9, 43, -2, 44, -5, 48, 3, 51, 8, 54, 10, 58, 5, 62, 15, 69, 25, 71, 40, 67, 60, 69, 70, 73, 80, 73, 100, 78, 115, 74, 140, 72, 160, 70, 180, 68, 180, 62, 163, 58, 156, 51, 142, 46, 140, 40, 128, 35, 122, 40, 121, 31, 110, 20, 108, 12, 104, 9, 100, 13, 98, 8, 94, 16, 90, 22, 80, 15, 78, 8, 73, 20, 66, 25, 57, 26, 50, 30, 48, 29, 56, 24, 59, 22, 52, 16, 43, 12, 35, 28, 32, 31, 35, 36, 27, 37, 26, 41, 23, 38, 20, 40, 16, 38, 12, 44, 10, 44, 5, 43, -1, 37, -6, 36],
  [-17, 15, -17, 21, -13, 28, -6, 35, 10, 37, 11, 33, 20, 31, 32, 31, 35, 28, 43, 12, 51, 12, 42, -1, 40, -10, 35, -24, 27, -34, 18, -34, 12, -17, 13, -6, 9, 4, -8, 4, -15, 10],
  [114, -22, 122, -18, 130, -12, 137, -12, 142, -11, 146, -19, 153, -26, 150, -37, 141, -38, 130, -32, 115, -34],
  [-5, 50, 2, 51, 0, 54, -3, 59, -6, 57, -5, 54],
  [130, 31, 135, 34, 141, 36, 142, 43, 140, 41, 133, 35],
  [44, -25, 47, -25, 50, -15, 49, -12, 44, -17],
  [95, 5, 106, -6, 103, -5, 96, 2],
  [109, 2, 117, 7, 119, 1, 116, -4, 110, -3],
  [172, -34, 178, -38, 174, -41, 167, -46, 170, -43]
];
function dbWorldSvg(extra) {
  const land = DB_WORLD.map((poly) => {
    const pts = [];
    for (let i = 0; i < poly.length; i += 2) pts.push(`${poly[i] + 180},${90 - poly[i + 1]}`);
    return `<polygon points="${pts.join(' ')}"/>`;
  }).join('');
  let grid = '';
  for (let x = 30; x < 360; x += 30) grid += `<line x1="${x}" y1="0" x2="${x}" y2="180"/>`;
  for (let y = 30; y < 180; y += 30) grid += `<line x1="0" y1="${y}" x2="360" y2="${y}"/>`;
  return `<svg class="db-world" viewBox="0 0 360 180" aria-hidden="true"><g class="db-grat">${grid}</g><g class="db-land">${land}</g>${extra || ''}</svg>`;
}
function dbCoords(v) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(v || ''));
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
function dbMapHref(v) {
  const c = dbCoords(v);
  return c ? `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=12/${c.lat}/${c.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(String(v || '').trim())}`;
}
function dbMapHtml(ctx, view) {
  const { data } = ctx;
  const p = dbPropFor(data, view, ['place']);
  if (!p) return dbHint(t('db.needPlace'), 'add-place', t('db.addPlace'));
  const rows = dbRows(data, view).filter((r) => r.c[p.id]);
  const pins = rows.map((r) => {
    const c = dbCoords(r.c[p.id]);
    return c ? `<g class="db-pin db-c-${esc(dbRowColor(data, r))}" data-act="card" data-r="${esc(r.id)}" transform="translate(${c.lng + 180} ${90 - c.lat})"><circle r="3.2"/><title>${esc(dbTitle(data, r) || t('db.untitledRow'))}</title></g>` : '';
  }).join('');
  const list = rows.map((r) => `<div class="db-li">${icon('location_on')}
      <span class="db-ltitle" data-act="card" data-r="${esc(r.id)}">${dbCellHtml(data, data.props[0], r)}</span>
      <button class="db-place" data-act="open-place" data-r="${esc(r.id)}" data-p="${esc(p.id)}" dir="auto">${esc(r.c[p.id])}${icon('open_in_new')}</button></div>`).join('');
  return `<div class="db-mapwrap">${dbWorldSvg(pins)}</div>
    ${list ? `<div class="db-list">${list}</div>` : `<div class="db-foot">${te('db.noPlaces')}</div>`}`;
}

/* Form — a field per property; Submit adds a row. */
function dbFormControl(p) {
  const id = esc(p.id);
  switch (p.type) {
    case 'number': return `<input type="text" inputmode="decimal" data-f="${id}">`;
    case 'date': return `<input type="date" data-f="${id}">`;
    case 'check': return `<input type="checkbox" data-f="${id}">`;
    case 'select': case 'status':
      return `<select data-f="${id}"><option value=""></option>${p.opts.map((o) => `<option value="${esc(o.id)}">${esc(o.name || t('db.unnamedOpt'))}</option>`).join('')}</select>`;
    case 'multi':
      return `<span class="db-fmulti">${p.opts.map((o) => `<label><input type="checkbox" data-f="${id}" value="${esc(o.id)}">${dbPill(o, 'multi')}</label>`).join('')}</span>`;
    default: return `<input type="text" data-f="${id}" dir="auto">`;
  }
}
function dbFormHtml(ctx, view) {
  const props = dbShown(ctx.data, view);
  return `<div class="db-form">${props.map((p) => `<label class="db-fld"><span class="db-flabel">${dbPropIcon(p.type)}<span dir="auto">${esc(dbPropName(p))}</span></span>${dbFormControl(p)}</label>`).join('')}
    <div class="db-fbtns"><span class="db-gap"></span><button class="db-submit" data-act="form-submit">${te('db.submit')}</button></div></div>`;
}

/* ---- the popover every menu in a database uses ----
   One element, #dbPop, over everything. A menu is a function of what was
   typed in it that returns { title, input, html, wire, items }; an item may
   open another menu (`more`), which stacks, and Escape or the arrow steps back
   out. Kept apart from #ctxMenu on purpose: that one belongs to the note. */
let dbPopS = null;
function openDbPop(anchor, build) {
  closeDbPop(true);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  dbPopS = { r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom }, stack: [build], q: '', sel: -1 };
  paintDbPop(true);
}
function closeDbPop(silent) {
  if (!dbPopS) return;
  if (!silent) dbPopCommit();
  dbPopS = null;
  $('dbPop').classList.add('hidden');
}
function paintDbPop(full) {
  if (!dbPopS) return;
  const pop = $('dbPop');
  const build = dbPopS.stack[dbPopS.stack.length - 1];
  const spec = build(dbPopS.q);
  if (!spec) { closeDbPop(true); return; }
  dbPopS.spec = spec;
  if (full) {
    const deep = dbPopS.stack.length > 1;
    pop.innerHTML = (deep || spec.title ? `<div class="dp-top">${deep ? `<button class="dp-back" data-back="1" title="${te('db.back')}">${icon('chevron_left')}</button>` : ''}<span>${esc(spec.title || '')}</span></div>` : '') +
      (spec.input ? '<div class="dp-in"><input type="text" dir="auto" spellcheck="false"></div>' : '') +
      (spec.html || '') + '<div class="dp-list"></div>';
    const inp = pop.querySelector('.dp-in input');
    if (inp) {
      inp.value = spec.input.value || dbPopS.q || '';
      inp.placeholder = spec.input.ph || '';
    }
    if (spec.wire) spec.wire(pop);
    pop.classList.remove('hidden');
  }
  const items = spec.items || [];
  if (dbPopS.sel >= items.length || (dbPopS.sel >= 0 && !dbPopPickable(items[dbPopS.sel]))) dbPopS.sel = -1;
  if (dbPopS.sel < 0 && spec.input && spec.input.filter && dbPopS.q) dbPopS.sel = items.findIndex(dbPopPickable);
  pop.querySelector('.dp-list').innerHTML = items.map((it, i) => {
    if (!it) return '';
    if (it.sep) return '<div class="dp-sep"></div>';
    if (it.head) return `<div class="dp-head">${esc(it.head)}</div>`;
    const tail = it.on ? icon('check') : it.more ? icon('chevron_right') : '';
    return `<button class="dp-item${it.danger ? ' danger' : ''}${i === dbPopS.sel ? ' sel' : ''}" data-i="${i}">` +
      (it.ic || '') + (it.pill ? dbPill(it.pill, it.pillKind) : `<span class="dp-l" dir="auto">${esc(it.label)}</span>`) +
      (it.hint ? `<em dir="auto">${esc(it.hint)}</em>` : '') + tail + '</button>';
  }).join('');
  if (full) {
    placeDbPop();
    const inp = pop.querySelector('.dp-in input');
    (inp || pop).focus();
    if (inp && spec.input.select) inp.select();
  }
}
const dbPopPickable = (it) => !!(it && !it.sep && !it.head);
function placeDbPop() {
  const pop = $('dbPop'), r = dbPopS.r;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = RTL ? r.right - w : r.left;
  let top = r.bottom + 4;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
  pop.style.left = clamp(left, 8, Math.max(8, innerWidth - w - 8)) + 'px';
  pop.style.top = clamp(top, 8, Math.max(8, innerHeight - h - 8)) + 'px';
}
// what was typed into a menu's name field is written before anything else in it runs
function dbPopCommit() {
  const spec = dbPopS && dbPopS.spec, inp = $('dbPop').querySelector('.dp-in input');
  if (!spec || !spec.input || !spec.input.commit || !inp || inp.value === (spec.input.value || '')) return;
  const val = inp.value;
  spec.input.value = val;
  spec.input.commit(val);
}
function runDbPopItem(i) {
  if (!dbPopS) return;
  const it = (dbPopS.spec.items || [])[i];
  if (!dbPopPickable(it)) return;
  dbPopCommit();
  if (it.more) { dbPopS.stack.push(it.more); dbPopS.q = ''; dbPopS.sel = -1; paintDbPop(true); return; }
  const keep = it.act ? it.act() : false;
  if (!dbPopS) return;                     // the act closed it, or opened another
  if (keep) paintDbPop(false); else closeDbPop(true);
}
function dbPopBack() {
  if (!dbPopS) return;
  if (dbPopS.stack.length < 2) { closeDbPop(); return; }
  dbPopCommit();
  dbPopS.stack.pop(); dbPopS.q = ''; dbPopS.sel = -1;
  paintDbPop(true);
}
function onDbPopKey(e) {
  e.stopPropagation();
  if (!dbPopS) return;
  const items = dbPopS.spec.items || [];
  const step = (d) => {
    if (!items.some(dbPopPickable)) return;
    let i = dbPopS.sel;
    do { i = (i + d + items.length) % items.length; } while (!dbPopPickable(items[i]));
    dbPopS.sel = i;
    paintDbPop(false);
    const b = $('dbPop').querySelector('.dp-item.sel');
    if (b) b.scrollIntoView({ block: 'nearest' });
  };
  if (e.key === 'ArrowDown') { e.preventDefault(); step(1); return; }
  if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); return; }
  if (e.key === 'Escape') { e.preventDefault(); dbPopBack(); return; }
  if (e.key === 'Enter') {
    if (e.target.matches('input[type="date"], input[type="checkbox"]')) return;
    e.preventDefault();
    if (dbPopS.sel >= 0) { runDbPopItem(dbPopS.sel); return; }
    const spec = dbPopS.spec, inp = $('dbPop').querySelector('.dp-in input');
    if (spec.input && spec.input.enter && inp) {
      const keep = spec.input.enter(inp.value);
      if (keep && dbPopS) { inp.value = ''; dbPopS.q = ''; paintDbPop(false); }
      else closeDbPop(true);
      return;
    }
    closeDbPop();
  }
}
function wireDbPop() {
  const pop = $('dbPop');
  pop.addEventListener('keydown', onDbPopKey);
  pop.addEventListener('mousedown', (e) => { if (!e.target.closest('input, select, textarea, label')) e.preventDefault(); });
  pop.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) { dbPopBack(); return; }
    const b = e.target.closest('.dp-item');
    if (b) runDbPopItem(+b.dataset.i);
  });
  pop.addEventListener('input', (e) => {
    if (!dbPopS || !e.target.closest('.dp-in')) return;
    const spec = dbPopS.spec;
    if (spec.input && spec.input.filter) { dbPopS.q = e.target.value; dbPopS.sel = -1; paintDbPop(false); }
  });
  // anywhere else closes it, saving what was typed in it
  document.addEventListener('pointerdown', (e) => {
    if (dbPopS && !pop.contains(e.target)) closeDbPop();
  }, true);
  window.addEventListener('resize', () => closeDbPop());
}

/* ---- the menus ---- */
function dbLayoutItems(el, current, pick) {
  return DB_LAYOUTS.map(([type, chart]) => ({
    ic: dbViewIcon({ type, chart }), label: dbLayoutName(type, chart),
    on: current && current.type === type && (type !== 'chart' || current.chart === chart),
    act: () => pick(type, chart)
  }));
}
function openAddView(el, anchor) {
  openDbPop(anchor, () => ({
    title: t('db.addView'),
    items: dbLayoutItems(el, null, (type, chart) => {
      dbEdit(el, (ctx) => {
        if (ctx.own.views.length >= DB_MAX.views) { toast(t('db.tooMany')); return false; }
        const v = { id: 'v' + uid(), type, name: '' };
        if (type === 'chart') v.chart = chart;
        ctx.own.views.push(v);
        ctx.own.cur = v.id;
      }, 'view');
    })
  }));
}
// a change to the view showing, written to this block alone
function dbSetView(el, fn) {
  return dbEdit(el, (ctx) => fn(dbView(ctx), ctx), 'view');
}
function openViewMenu(el, anchor) {
  const ctx0 = dbCtx(el);
  if (!ctx0) return;
  const vid = dbView(ctx0).id;
  const cur = () => { const c = dbCtx(el); return c ? { ctx: c, v: c.own.views.find((x) => x.id === vid) } : null; };
  /* A list of the properties a view can be built on. The tick is on the one
     the view really uses — which, with nothing chosen, is the one it falls
     back to (`using`), not a "None" it does not mean. */
  const pickProp = (title, types, field, allowNone, using) => () => {
    const c = cur(); if (!c || !c.ctx.data) return null;
    const props = c.ctx.data.props.filter((p) => types.includes(p.type));
    const chosen = props.some((p) => p.id === c.v[field]) ? c.v[field] : '';
    const now = chosen || (using ? using(c.ctx.data, c.v) : '');
    return {
      title,
      items: [
        ...(allowNone ? [{ ic: icon('close'), label: allowNone, on: !now, act: () => { dbSetView(el, (v) => { delete v[field]; }); return true; } }] : []),
        ...props.map((p) => ({ ic: dbPropIcon(p.type), label: dbPropName(p), on: now === p.id, act: () => { dbSetView(el, (v) => { v[field] = p.id; }); return true; } }))
      ]
    };
  };
  const idOf = (p) => (p ? p.id : '');
  openDbPop(anchor, () => {
    const c = cur();
    if (!c || !c.v) return null;
    const { ctx, v } = c, data = ctx.data;
    const groupable = ['board', 'chart', 'dashboard'].includes(v.type);
    const dated = ['calendar', 'timeline'].includes(v.type);
    // a board needs columns; a dashboard's ring needs a handful of values; a chart can count anything
    const groupTypes = v.type === 'board' ? ['status', 'select', 'multi']
      : v.type === 'dashboard' ? ['status', 'select', 'multi', 'check']
        : ['status', 'select', 'multi', 'check', 'date', 'text', 'title', 'url', 'place', 'number'];
    const g = data && groupable ? (v.type === 'chart' ? dbChartGroups(data, v).by : dbPropFor(data, v, groupTypes.slice(0, 4))) : null;
    const dp = data && dated ? dbPropFor(data, v, ['date']) : null;
    const pp = data && v.type === 'map' ? dbPropFor(data, v, ['place']) : null;
    const sp = data && v.sort ? dbProp(data, v.sort.p) : null;
    const valP = data && v.val ? dbProp(data, v.val) : null;
    const items = [
      { ic: dbViewIcon(v), label: t('db.layout'), hint: dbLayoutName(v.type, v.chart), more: () => ({
        title: t('db.layout'),
        items: dbLayoutItems(el, cur() && cur().v, (type, chart) => { dbSetView(el, (x) => { x.type = type; if (type === 'chart') x.chart = chart; else delete x.chart; }); return true; })
      }) }
    ];
    const groupNow = (d, x) => idOf(x.type === 'chart' ? dbChartGroups(d, x).by : dbPropFor(d, x, groupTypes.slice(0, 4)));
    if (data && groupable) items.push({ ic: icon('view_column'), label: t('db.groupBy'), hint: g ? dbPropName(g) : t('db.none'), more: pickProp(t('db.groupBy'), groupTypes, 'by', '', groupNow) });
    if (data && dated) items.push({ ic: icon('event'), label: t('db.dateProp'), hint: dp ? dbPropName(dp) : t('db.none'), more: pickProp(t('db.dateProp'), ['date'], 'by', '', (d, x) => idOf(dbPropFor(d, x, ['date']))) });
    if (data && v.type === 'map') items.push({ ic: icon('location_on'), label: t('db.placeProp'), hint: pp ? dbPropName(pp) : t('db.none'), more: pickProp(t('db.placeProp'), ['place'], 'by', '', (d, x) => idOf(dbPropFor(d, x, ['place']))) });
    if (data && (v.type === 'chart' || v.type === 'dashboard')) items.push({ ic: icon('functions'), label: t('db.value'), hint: valP ? t('db.sumOf', { name: dbPropName(valP) }) : t('db.countRows'), more: pickProp(t('db.value'), ['number'], 'val', t('db.countRows')) });
    if (data && v.type !== 'form' && v.type !== 'chart') items.push({ ic: icon('sort'), label: t('db.sort'), hint: sp ? `${dbPropName(sp)} ${v.sort.dir < 0 ? '↓' : '↑'}` : t('db.none'), more: () => {
      const c2 = cur(); if (!c2 || !c2.ctx.data) return null;
      const s = c2.v.sort;
      return {
        title: t('db.sort'),
        items: [{ ic: icon('close'), label: t('db.none'), on: !s, act: () => { dbSetView(el, (x) => { delete x.sort; }); return true; } },
          ...c2.ctx.data.props.flatMap((p) => [
            { ic: icon('arrow_upward'), label: dbPropName(p), hint: t('db.asc'), on: !!s && s.p === p.id && s.dir > 0, act: () => { dbSetView(el, (x) => { x.sort = { p: p.id, dir: 1 }; }); return true; } },
            { ic: icon('arrow_downward'), label: dbPropName(p), hint: t('db.desc'), on: !!s && s.p === p.id && s.dir < 0, act: () => { dbSetView(el, (x) => { x.sort = { p: p.id, dir: -1 }; }); return true; } }
          ])]
      };
    } });
    if (data && data.props.length > 1 && v.type !== 'chart') items.push({ ic: icon('visibility'), label: t('db.properties'), more: () => {
      const c2 = cur(); if (!c2 || !c2.ctx.data) return null;
      const hide = c2.v.hide || [];
      return {
        title: t('db.properties'),
        items: c2.ctx.data.props.slice(1).map((p) => ({ ic: dbPropIcon(p.type), label: dbPropName(p), on: !hide.includes(p.id), act: () => {
          dbSetView(el, (x) => {
            const h = new Set(x.hide || []);
            if (h.has(p.id)) h.delete(p.id); else h.add(p.id);
            if (h.size) x.hide = [...h]; else delete x.hide;
          });
          return true;
        } }))
      };
    } });
    items.push({ sep: true },
      { ic: icon('content_copy'), label: t('db.dupView'), act: () => { dbEdit(el, (c2) => {
        const src = c2.own.views.find((x) => x.id === vid);
        if (!src || c2.own.views.length >= DB_MAX.views) return false;
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = 'v' + uid();
        c2.own.views.splice(c2.own.views.indexOf(src) + 1, 0, copy);
        c2.own.cur = copy.id;
      }, 'view'); } });
    if (ctx.own.views.length > 1) items.push({ ic: icon('delete'), label: t('db.delView'), danger: true, act: () => { dbEdit(el, (c2) => {
      c2.own.views = c2.own.views.filter((x) => x.id !== vid);
      c2.own.cur = c2.own.views[0].id;
    }, 'view'); } });
    items.push({ sep: true });
    if (ctx.own.src) items.push({ ic: icon('north_east'), label: t('db.gotoSource'), act: () => { dbGotoSource(el); } });
    items.push({ ic: icon('delete_forever'), label: ctx.own.src ? t('db.delLinked') : t('db.delDb'), danger: true, act: () => { deleteDbBlock(el); } });
    return {
      title: t('db.viewOptions'),
      input: { value: v.name, ph: dbLayoutName(v.type, v.chart), commit: (val) => dbSetView(el, (x) => { x.name = val.trim().slice(0, 40); }) },
      items
    };
  });
}
function openRenameDb(el, anchor) {
  const ctx = dbCtx(el);
  if (!ctx || !ctx.data) return;
  openDbPop(anchor, () => ({
    title: t('db.rename'),
    input: { value: ctx.data.name, ph: t('db.untitled'), select: true, commit: (val) => dbEdit(el, (c) => { c.data.name = val.trim().slice(0, 80); }) },
    items: []
  }));
}
function dbGotoSource(el) {
  const ctx = dbCtx(el);
  if (!ctx || !ctx.loc) { toast(t('db.sourceGone')); return; }
  goToNote(ctx.loc.n.id);
}
function deleteDbBlock(el) {
  const ctx = dbCtx(el);
  const name = ctx && ctx.data && ctx.data.name ? ctx.data.name : t('db.untitled');
  const rows = ctx && ctx.data && !ctx.own.src ? ctx.data.rows.length : 0;
  const ask = rows ? confirmDlg(t('db.delDb'), t('db.delConfirm', { name, n: rows }), t('db.delete')) : Promise.resolve(true);
  ask.then((ok) => {
    if (!ok || !el.isConnected || !canEditHere()) return;
    const body = el.closest('.note-body'), n = noteOfBlock(el);
    if (!body || !n) return;
    if (editing !== body) pushUndo();
    el.remove();
    ensureTail(body);
    n.body = bodyHtml(body);
    if (editing === body) editDirty = true;
    saveSoon();
  });
}

/* A property's menu: its name, its type, its options, sorting by it, hiding it
   from this view, deleting it. */
function openPropMenu(el, anchor, pid) {
  openDbPop(anchor, () => {
    const ctx = dbCtx(el);
    const p = ctx && ctx.data && dbProp(ctx.data, pid);
    if (!p) return null;
    const isTitle = p.type === 'title';
    const items = [];
    if (!isTitle) items.push({ ic: dbPropIcon(p.type), label: t('db.type'), hint: dbTypeName(p.type), more: () => ({
      title: t('db.type'),
      items: DB_TYPES.filter((x) => x !== 'title').map((type) => ({ ic: dbPropIcon(type), label: dbTypeName(type), on: type === p.type, act: () => { dbConvertProp(el, pid, type); return false; } }))
    }) });
    if (DB_OPT_TYPES.includes(p.type)) items.push({ ic: icon('palette'), label: t('db.editOpts'), more: () => dbOptsMenu(el, pid) });
    items.push(
      { ic: icon('arrow_upward'), label: t('db.sortAsc'), act: () => { dbSetView(el, (v) => { v.sort = { p: pid, dir: 1 }; }); } },
      { ic: icon('arrow_downward'), label: t('db.sortDesc'), act: () => { dbSetView(el, (v) => { v.sort = { p: pid, dir: -1 }; }); } });
    if (!isTitle) items.push(
      { ic: icon('visibility_off'), label: t('db.hide'), act: () => { dbSetView(el, (v) => { v.hide = [...new Set([...(v.hide || []), pid])]; }); } },
      { sep: true },
      { ic: icon('delete'), label: t('db.delProp'), danger: true, act: () => { dbEdit(el, (c) => {
        c.data.props = c.data.props.filter((x) => x.id !== pid);
        c.data.rows.forEach((r) => { delete r.c[pid]; });
      }); } });
    return {
      input: { value: p.name, ph: dbTypeName(p.type), select: true, commit: (val) => dbEdit(el, (c) => { const q = dbProp(c.data, pid); if (q) q.name = val.trim().slice(0, 60); }) },
      items
    };
  });
}
function dbOptsMenu(el, pid) {
  const ctx = dbCtx(el);
  const p = ctx && ctx.data && dbProp(ctx.data, pid);
  if (!p || !p.opts) return null;
  return {
    title: t('db.editOpts'),
    input: { ph: t('db.newOpt'), enter: (val) => { if (val.trim()) dbAddOpt(el, pid, val); return true; } },
    items: p.opts.map((o) => ({ pill: o, pillKind: p.type, more: () => dbOptMenu(el, pid, o.id) }))
  };
}
function dbOptMenu(el, pid, oid) {
  const ctx = dbCtx(el);
  const p = ctx && ctx.data && dbProp(ctx.data, pid);
  const o = p && dbOpt(p, oid);
  if (!o) return null;
  return {
    title: o.name || t('db.unnamedOpt'),
    input: { value: o.name, select: true, commit: (val) => dbEdit(el, (c) => { const x = dbOpt(dbProp(c.data, pid) || {}, oid); if (x) x.name = val.trim().slice(0, 60); }) },
    items: [{ head: t('db.colour') },
      ...COLORS.map((col) => ({ pill: { name: t('colour.' + col), color: col }, on: o.color === col, act: () => {
        dbEdit(el, (c) => { const x = dbOpt(dbProp(c.data, pid) || {}, oid); if (x) x.color = col; });
        return true;
      } })),
      { sep: true },
      { ic: icon('delete'), label: t('db.delOpt'), danger: true, act: () => {
        dbEdit(el, (c) => {
          const q = dbProp(c.data, pid);
          if (!q) return false;
          q.opts = q.opts.filter((x) => x.id !== oid);
          c.data.rows.forEach((r) => {
            const v = r.c[pid];
            if (v === oid) delete r.c[pid];
            else if (Array.isArray(v)) { const a = v.filter((x) => x !== oid); if (a.length) r.c[pid] = a; else delete r.c[pid]; }
          });
        });
        dbPopBack();
        return true;
      } }]
  };
}
function dbAddOpt(el, pid, name) {
  let made = null;
  dbEdit(el, (c) => {
    const p = dbProp(c.data, pid);
    if (!p || !p.opts || p.opts.length >= DB_MAX.opts) return false;
    made = { id: 'o' + uid(), name: name.trim().slice(0, 60), color: DB_CYCLE[p.opts.length % DB_CYCLE.length] };
    p.opts.push(made);
  });
  return made;
}

/* A new property of a type, named after the type, with its menu open so the
   name can be typed straight away — the order Notion does it in. */
function openAddProp(el, anchor) {
  openDbPop(anchor, () => ({
    title: t('db.addProp'),
    items: DB_TYPES.filter((x) => x !== 'title').map((type) => ({ ic: dbPropIcon(type), label: dbTypeName(type), act: () => {
      let pid = '';
      const ok = dbEdit(el, (c) => {
        if (c.data.props.length >= DB_MAX.props) { toast(t('db.tooMany')); return false; }
        const p = { id: 'p' + uid(), name: dbTypeName(type), type };
        if (DB_OPT_TYPES.includes(type)) p.opts = [];
        c.data.props.push(p);
        pid = p.id;
        const v = dbView(c);
        if (v.hide) v.hide = v.hide.filter((x) => x !== pid);
      });
      if (!ok) return;
      setTimeout(() => {
        const th = el.querySelector(`.db-th[data-p="${pid}"]`);
        if (th) openPropMenu(el, th, pid);
      }, 0);
    } }))
  }));
}
// one of the property kinds a view needs, added with that view's own call to action
function dbAddKind(el, type) {
  let pid = '';
  dbEdit(el, (c) => {
    if (c.data.props.length >= DB_MAX.props) return false;
    const p = { id: 'p' + uid(), name: type === 'status' ? t('db.prop.status') : type === 'date' ? t('db.prop.date') : t('db.prop.place'), type };
    if (type === 'status') p.opts = [{ id: 'o' + uid(), name: t('db.st.todo'), color: 'default' }, { id: 'o' + uid(), name: t('db.st.doing'), color: 'blue' }, { id: 'o' + uid(), name: t('db.st.done'), color: 'green' }];
    c.data.props.push(p);
    pid = p.id;
  });
  if (pid) dbSetView(el, (v) => { v.by = pid; });
}

/* Changing a property's type keeps what it can: text into options becomes the
   options, options into text their names, numbers out of text, and so on. */
function dbConvertProp(el, pid, type) {
  dbEdit(el, (c) => {
    const p = dbProp(c.data, pid);
    if (!p || p.type === type || p.type === 'title') return false;
    const old = { ...p, opts: p.opts ? p.opts.slice() : null };
    const text = new Map(c.data.rows.map((r) => [r.id, dbCellText(c.data, old, r)]));
    p.type = type;
    if (DB_OPT_TYPES.includes(type)) {
      p.opts = DB_OPT_TYPES.includes(old.type) ? old.opts : [];
      const optFor = (name) => {
        let o = p.opts.find((x) => foldSearch(x.name) === foldSearch(name));
        if (!o && p.opts.length < DB_MAX.opts) { o = { id: 'o' + uid(), name: name.slice(0, 60), color: DB_CYCLE[p.opts.length % DB_CYCLE.length] }; p.opts.push(o); }
        return o;
      };
      c.data.rows.forEach((r) => {
        const v = r.c[pid];
        let ids;
        if (DB_OPT_TYPES.includes(old.type)) ids = Array.isArray(v) ? v : v ? [v] : [];
        else ids = (text.get(r.id) || '').split(type === 'multi' ? ',' : /\n/).map((s) => s.trim()).filter(Boolean).map((s) => (optFor(s) || {}).id).filter(Boolean);
        if (type === 'multi') { if (ids.length) r.c[pid] = ids; else delete r.c[pid]; }
        else if (ids.length) r.c[pid] = ids[0]; else delete r.c[pid];
      });
    } else {
      delete p.opts;
      c.data.rows.forEach((r) => {
        const s = text.get(r.id) || '';
        let v;
        if (type === 'number') { const x = cellNumber(s); v = x === null ? undefined : x; }
        else if (type === 'date') v = okDbDate(s.replace(' → ', '/')) || undefined;
        else if (type === 'check') v = /^(✓|true|yes|y|x|1|done)$/i.test(s.trim()) || undefined;
        else v = s || undefined;
        if (v === undefined) delete r.c[pid]; else r.c[pid] = v;
      });
    }
  });
}

/* ---- rows ---- */
function dbSetCell(el, rid, pid, value) {
  return dbEdit(el, (c) => {
    const r = dbRow(c.data, rid), p = dbProp(c.data, pid);
    if (!r || !p) return false;
    const v = okDbCell(p, value);
    if (JSON.stringify(v) === JSON.stringify(r.c[pid])) return false;
    if (v === undefined) delete r.c[pid]; else r.c[pid] = v;
  });
}
// a new row, filled in with whatever the place it was made in says
function dbAddRow(el, init) {
  let rid = '';
  dbEdit(el, (c) => {
    if (c.data.rows.length >= DB_MAX.rows) { toast(t('db.tooMany')); return false; }
    const r = { id: 'r' + uid(), c: {} };
    Object.entries(init || {}).forEach(([pid, v]) => {
      const p = dbProp(c.data, pid);
      const x = p && okDbCell(p, v);
      if (x !== undefined) r.c[pid] = x;
    });
    c.data.rows.push(r);
    rid = r.id;
  });
  return rid;
}
function dbDelRow(el, rid) {
  dbEdit(el, (c) => {
    const n0 = c.data.rows.length;
    c.data.rows = c.data.rows.filter((r) => r.id !== rid);
    return c.data.rows.length !== n0;
  });
}
function dbDupRow(el, rid) {
  dbEdit(el, (c) => {
    const i = c.data.rows.findIndex((r) => r.id === rid);
    if (i < 0 || c.data.rows.length >= DB_MAX.rows) return false;
    const copy = JSON.parse(JSON.stringify(c.data.rows[i]));
    copy.id = 'r' + uid();
    c.data.rows.splice(i + 1, 0, copy);
  });
}
// what a new row in the view showing starts with: the board's column, the calendar's day
function dbRowDefaults(ctx, extra) {
  const view = dbView(ctx), init = {};
  if (!ctx.data) return init;
  if (view.type === 'board') {
    const g = dbPropFor(ctx.data, view, ['status', 'select', 'multi']);
    if (g && extra && 'g' in extra && extra.g) init[g.id] = g.type === 'multi' ? [extra.g] : extra.g;
  }
  if (view.type === 'calendar' || view.type === 'timeline') {
    const d = dbPropFor(ctx.data, view, ['date']);
    if (d) init[d.id] = (extra && extra.day) || dayKeyIn(0);
  }
  return init;
}

/* ---- editing a cell in the table ---- */
function dbEditCell(el, cell) {
  const rid = cell.dataset.r, pid = cell.dataset.p;
  dbFinishInline();
  cell = el.querySelector(`.db-td[data-r="${rid}"][data-p="${pid}"]`);
  const ctx = dbCtx(el);
  if (!cell || !ctx || !ctx.data || !canEditHere()) return;
  const p = dbProp(ctx.data, pid), r = dbRow(ctx.data, rid);
  if (!p || !r) return;
  if (p.type === 'check') { dbSetCell(el, rid, pid, !r.c[pid]); return; }
  if (DB_OPT_TYPES.includes(p.type)) { openOptPicker(el, cell, rid, pid); return; }
  if (p.type === 'date') { openDatePicker(el, cell, rid, pid); return; }
  dbInlineInput(el, cell, rid, p, r.c[pid]);
}
/* The cell being typed in. Only one at a time, and it is finished — written,
   which redraws the database — before any other press in a database is acted
   on: the press itself keeps the caret where it is (wireDatabases), so without
   this the field never lost focus and its text went nowhere. */
let dbInline = null;
function dbFinishInline() { if (dbInline) dbInline(true); }
function dbInlineInput(el, cell, rid, p, value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'db-in';
  input.dir = p.type === 'url' ? 'ltr' : 'auto';
  input.spellcheck = p.type === 'title' || p.type === 'text';
  if (p.type === 'number') input.inputMode = 'decimal';
  input.value = value === undefined ? '' : String(value);
  cell.classList.add('editing');
  cell.appendChild(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (keep, next) => {
    if (done) return;
    done = true;
    if (dbInline === finish) dbInline = null;
    const raw = input.value;
    input.remove();
    cell.classList.remove('editing');
    if (keep) {
      const v = p.type === 'number' ? cellNumber(raw) : raw.trim();
      dbSetCell(el, rid, p.id, v === null ? undefined : v);
    }
    if (next) {
      const cells = [...el.querySelectorAll('.db-td[data-act="cell"]')];
      const at = cells.findIndex((x) => x.dataset.r === rid && x.dataset.p === p.id);
      const to = cells[at + next];
      if (to) dbEditCell(el, to);
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'Tab') { e.preventDefault(); finish(true, e.shiftKey ? -1 : 1); }
  });
  input.addEventListener('blur', () => finish(true));
  dbInline = finish;
}
function openOptPicker(el, anchor, rid, pid) {
  openDbPop(anchor, (q) => {
    const ctx = dbCtx(el);
    const p = ctx && ctx.data && dbProp(ctx.data, pid), r = p && dbRow(ctx.data, rid);
    if (!r) return null;
    const multi = p.type === 'multi';
    const cur = multi ? (r.c[pid] || []) : [r.c[pid]].filter(Boolean);
    const fq = foldSearch(q || '');
    const shown = p.opts.filter((o) => !fq || foldSearch(o.name).includes(fq));
    const items = shown.map((o) => ({ pill: o, pillKind: p.type, on: cur.includes(o.id), act: () => {
      const next = multi ? (cur.includes(o.id) ? cur.filter((x) => x !== o.id) : [...cur, o.id]) : (cur[0] === o.id ? undefined : o.id);
      dbSetCell(el, rid, pid, next);
      return multi;
    } }));
    const exact = p.opts.some((o) => foldSearch(o.name) === fq);
    if (q && q.trim() && !exact) items.push({ ic: icon('add'), label: t('db.createOpt', { name: q.trim() }), act: () => {
      const o = dbAddOpt(el, pid, q);
      if (o) dbSetCell(el, rid, pid, multi ? [...cur, o.id] : o.id);
      if (multi && dbPopS) { dbPopS.q = ''; const inp = $('dbPop').querySelector('.dp-in input'); if (inp) inp.value = ''; }
      return multi;
    } });
    if (cur.length) items.push({ sep: true }, { ic: icon('close'), label: t('db.clear'), act: () => { dbSetCell(el, rid, pid, undefined); return false; } });
    return { input: { ph: t('db.optSearch'), filter: true }, items };
  });
}
function openDatePicker(el, anchor, rid, pid) {
  const ctx = dbCtx(el);
  const r = ctx && ctx.data && dbRow(ctx.data, rid);
  if (!r) return;
  const v = r.c[pid] || '';
  const s = dbDateStart(v), e = String(v).split('/')[1] || '';
  const read = (pop) => {
    const a = pop.querySelector('[data-ds]').value, on = pop.querySelector('[data-de-on]').checked, b = pop.querySelector('[data-de]').value;
    return a ? (on && b ? a + '/' + b : a) : undefined;
  };
  openDbPop(anchor, () => ({
    html: `<div class="dp-date"><input type="date" data-ds value="${esc(s)}">
      <label class="dp-check"><input type="checkbox" data-de-on${e ? ' checked' : ''}><span>${te('db.endDate')}</span></label>
      <input type="date" data-de value="${esc(e)}"${e ? '' : ' hidden'}></div>`,
    wire: (pop) => {
      pop.querySelector('[data-de-on]').addEventListener('change', (ev) => {
        const end = pop.querySelector('[data-de]');
        end.hidden = !ev.target.checked;
        if (ev.target.checked && !end.value) end.value = dbAddDays(pop.querySelector('[data-ds]').value || dayKeyIn(0), 1);
        dbSetCell(el, rid, pid, read(pop));
      });
      pop.querySelectorAll('input[type="date"]').forEach((x) => x.addEventListener('change', () => dbSetCell(el, rid, pid, read(pop))));
    },
    items: [{ ic: icon('today'), label: t('db.today'), act: () => { dbSetCell(el, rid, pid, dayKeyIn(0)); } },
      { ic: icon('close'), label: t('db.clear'), act: () => { dbSetCell(el, rid, pid, undefined); } }]
  }));
}
function openRowMenu(el, anchor, rid) {
  openDbPop(anchor, () => ({
    items: [{ ic: icon('open_in_full'), label: t('db.open'), act: () => { openDbRow(el, rid); } },
      { ic: icon('content_copy'), label: t('db.dupRow'), act: () => { dbDupRow(el, rid); } },
      { sep: true },
      { ic: icon('delete'), label: t('db.delRow'), danger: true, act: () => { dbDelRow(el, rid); } }]
  }));
}

/* ---- a row as a page ----
   Notion opens a row as a page in a peek; here it is a sheet over the board:
   the title, every property, and what is written on it. */
let dbRd = null;                    // { el, bid, rid }
function dbRdBlock() {
  if (!dbRd) return null;
  if (!dbRd.el.isConnected) dbRd.el = document.querySelector(`#notesLayer .mb-db[data-dbid="${dbRd.bid}"]`) || dbRd.el;
  return dbRd.el.isConnected ? dbRd.el : null;
}
function openDbRow(el, rid, fresh) {
  const ctx = dbCtx(el);
  if (!ctx || !ctx.data || !dbRow(ctx.data, rid)) return;
  closeDbPop();
  dbRd = { el, bid: ctx.own.id, rid };
  $('dbRowDlg').classList.remove('hidden');
  paintDbRow(true);
  const title = $('dbRdTitle');
  if (title) {
    title.focus();
    // a new page's placeholder title is replaced by typing; an old one is added to, from its end
    if (fresh) title.select(); else title.setSelectionRange(title.value.length, title.value.length);
  }
}
function closeDbRow() {
  if (!dbRd) return;
  commitDbRow();
  dbRd = null;
  closeDbPop(true);
  $('dbRowDlg').classList.add('hidden');
}
// the two things typed rather than picked, written when they are left
function commitDbRow() {
  const el = dbRdBlock();
  if (!el) return;
  const ctx = dbCtx(el), r = ctx && ctx.data && dbRow(ctx.data, dbRd.rid);
  if (!r) return;
  const title = $('dbRdTitle'), text = $('dbRdText');
  const tv = title ? title.value.trim() : dbTitle(ctx.data, r), xv = text ? text.value : r.t || '';
  if (tv === dbTitle(ctx.data, r) && xv === (r.t || '')) return;
  dbEdit(el, (c) => {
    const row = dbRow(c.data, dbRd.rid);
    if (!row) return false;
    const tp = c.data.props[0].id;
    if (tv) row.c[tp] = tv.slice(0, DB_MAX.text); else delete row.c[tp];
    const body = xv.slice(0, DB_MAX.body);
    if (body.trim()) row.t = body; else delete row.t;
  });
}
function paintDbRow(full) {
  if (!dbRd) return;
  const el = dbRdBlock();
  const ctx = el && dbCtx(el);
  const r = ctx && ctx.data && dbRow(ctx.data, dbRd.rid);
  if (!r) { dbRd = null; $('dbRowDlg').classList.add('hidden'); return; }
  const data = ctx.data;
  $('dbRdCrumb').innerHTML = `${icon('database')}<span dir="auto">${esc(data.name || t('db.untitled'))}</span>`;
  const props = data.props.slice(1).map((p) => `<div class="db-rd-row"><span class="db-rd-k">${dbPropIcon(p.type)}<span dir="auto">${esc(dbPropName(p))}</span></span>
    <div class="db-rd-v">${dbRdControl(data, p, r)}</div></div>`).join('');
  const wrap = $('dbRdBody');
  if (full || !$('dbRdTitle')) {
    wrap.innerHTML = `<input type="text" class="db-rd-title" id="dbRdTitle" dir="auto" placeholder="${te('db.untitledRow')}" value="${esc(dbTitle(data, r))}">
      <div class="db-rd-props" id="dbRdProps">${props}</div>
      <textarea class="db-rd-text" id="dbRdText" dir="auto" placeholder="${te('db.writePh')}">${esc(r.t || '')}</textarea>
      <div class="set-btns"><button class="btn danger" data-rd="delete"><span class="b-ic">${icon('delete')}</span><span>${te('db.delRow')}</span></button>
        <span class="db-gap"></span><button class="btn primary" data-rd="done"><span class="b-ic">${icon('check')}</span><span>${te('db.done')}</span></button></div>`;
  } else {
    /* Only when something in them changed: this runs as the title is left,
       and redrawing the fields then would take away the one being clicked. */
    const box = $('dbRdProps');
    if (box.dataset.was !== props && !box.contains(document.activeElement)) box.innerHTML = props;
  }
  $('dbRdProps').dataset.was = props;
}
function dbRdControl(data, p, r) {
  const v = r.c[p.id], id = esc(p.id);
  switch (p.type) {
    case 'check': return `<input type="checkbox" data-rp="${id}"${v ? ' checked' : ''}>`;
    case 'date': {
      const e = v ? String(v).split('/')[1] || '' : '';
      return `<input type="date" data-rp="${id}" data-part="s" value="${esc(dbDateStart(v))}">` +
        (e ? `<span class="db-arrow">→</span><input type="date" data-rp="${id}" data-part="e" value="${esc(e)}">` : '') +
        `<button class="db-link" data-rd="end" data-rp="${id}">${esc(e ? t('db.noEnd') : t('db.endDate'))}</button>`;
    }
    case 'select': case 'status': case 'multi':
      return `<button class="db-rd-opts" data-rd="opts" data-rp="${id}">${dbCellHtml(data, p, r) || `<span class="dim">${te('db.empty')}</span>`}</button>`;
    case 'url': case 'place':
      return `<input type="text" data-rp="${id}" dir="${p.type === 'url' ? 'ltr' : 'auto'}" value="${esc(v || '')}" placeholder="${esc(p.type === 'place' ? t('db.placePh') : 'https://')}">` +
        (v ? `<button class="db-mini" data-rd="${p.type === 'url' ? 'open-url' : 'open-place'}" data-rp="${id}" title="${esc(p.type === 'url' ? t('db.openLink') : t('db.openMap'))}">${icon('open_in_new')}</button>` : '');
    case 'number': return `<input type="text" inputmode="decimal" data-rp="${id}" value="${esc(v === undefined ? '' : String(v))}">`;
    default: return `<input type="text" data-rp="${id}" dir="auto" value="${esc(v || '')}">`;
  }
}
function wireDbRow() {
  const dlg = $('dbRowDlg');
  $('dbRdClose').addEventListener('click', closeDbRow);
  dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) closeDbRow(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDbRow(); }
    else if (e.key === 'Enter' && e.target.id === 'dbRdTitle') { e.preventDefault(); commitDbRow(); }
  });
  dlg.addEventListener('focusout', (e) => { if (e.target.id === 'dbRdTitle' || e.target.id === 'dbRdText') commitDbRow(); });
  dlg.addEventListener('change', (e) => {
    const x = e.target;
    if (!dbRd || !x.dataset || !x.dataset.rp) return;
    const el = dbRdBlock();
    if (!el) return;
    const ctx = dbCtx(el), p = ctx && ctx.data && dbProp(ctx.data, x.dataset.rp), r = p && dbRow(ctx.data, dbRd.rid);
    if (!r) return;
    let v;
    if (p.type === 'check') v = x.checked;
    else if (p.type === 'date') {
      const box = x.closest('.db-rd-v');
      const s = box.querySelector('[data-part="s"]').value, en = box.querySelector('[data-part="e"]');
      v = s ? (en && en.value ? s + '/' + en.value : s) : undefined;
    }
    else if (p.type === 'number') { const n = cellNumber(x.value); v = n === null ? undefined : n; }
    else v = x.value.trim();
    dbSetCell(el, dbRd.rid, p.id, v);
  });
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rd]');
    if (!b || !dbRd) return;
    const el = dbRdBlock();
    if (!el) return;
    const act = b.dataset.rd;
    if (act === 'done') { closeDbRow(); return; }
    if (act === 'delete') { const rid = dbRd.rid; commitDbRow(); dbRd = null; dlg.classList.add('hidden'); dbDelRow(el, rid); return; }
    const ctx = dbCtx(el), p = ctx && ctx.data && dbProp(ctx.data, b.dataset.rp), r = p && dbRow(ctx.data, dbRd.rid);
    if (!r) return;
    if (act === 'opts') { openOptPicker(el, b, dbRd.rid, p.id); return; }
    if (act === 'open-url' && r.c[p.id]) { openHref(dbUrl(r.c[p.id])); return; }
    if (act === 'open-place' && r.c[p.id]) { openHref(dbMapHref(r.c[p.id])); return; }
    if (act === 'end') {
      const v = r.c[p.id];
      const s = dbDateStart(v) || dayKeyIn(0);
      dbSetCell(el, dbRd.rid, p.id, String(v || '').includes('/') ? s : s + '/' + dbAddDays(s, 1));
    }
  });
}
// a web address typed without its scheme still opens
const dbUrl = (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v);

/* ---- the form ---- */
function dbSubmitForm(el) {
  const ctx = dbCtx(el);
  if (!ctx || !ctx.data) return;
  const init = {};
  ctx.data.props.forEach((p) => {
    const fields = [...el.querySelectorAll(`[data-f="${p.id}"]`)];
    if (!fields.length) return;
    if (p.type === 'multi') { const ids = fields.filter((f) => f.checked).map((f) => f.value); if (ids.length) init[p.id] = ids; return; }
    const f = fields[0];
    if (p.type === 'check') { if (f.checked) init[p.id] = true; return; }
    if (p.type === 'number') { const n = cellNumber(f.value); if (n !== null) init[p.id] = n; return; }
    if (f.value.trim()) init[p.id] = f.value.trim();
  });
  if (!Object.keys(init).length) { toast(t('db.formEmpty')); return; }
  if (dbAddRow(el, init)) toast(t('db.submitted'));
}

/* ---- pointer and click ----
   Delegated from the document: a database is redrawn wholesale on every
   change, so nothing is bound to the elements inside it. init.js lets a press
   on anything with data-act through before it can start moving the note
   (onPointerDown), which is what makes a closed note's database usable. */
let dbDrag = null, dbDragged = false;
function onDbPointerDown(e) {
  if (e.button !== 0) return;
  const h = e.target.closest('.db-face [data-drag]');
  if (!h || !canEditHere()) return;
  dbDrag = { h, el: h.closest('.mb-db'), x: e.clientX, y: e.clientY, on: false, over: null, ghost: null };
}
function onDbPointerMove(e) {
  const d = dbDrag;
  if (!d) return;
  if (!d.on) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.on = true;
    const r = d.h.getBoundingClientRect();
    d.ghost = d.h.cloneNode(true);
    d.ghost.classList.add('db-ghost');
    d.ghost.style.width = r.width + 'px';
    d.ghost.style.left = r.left + 'px';
    d.ghost.style.top = r.top + 'px';
    d.dx = d.x - r.left; d.dy = d.y - r.top;
    document.body.appendChild(d.ghost);
    d.h.classList.add('db-lifted');
    if (d.h.dataset.drag === 'bar') {
      const cell = d.el.querySelector('.db-tlday');
      d.dayW = cell ? cell.getBoundingClientRect().width : DB_TL_W;
    }
  }
  if (d.h.dataset.drag === 'bar') {
    // a bar moves along its lane only, a whole day at a time
    const days = Math.round((e.clientX - d.x) / (d.dayW || DB_TL_W));
    d.days = days;
    d.ghost.style.left = (d.x - d.dx + days * (d.dayW || DB_TL_W)) + 'px';
    return;
  }
  d.ghost.style.left = (e.clientX - d.dx) + 'px';
  d.ghost.style.top = (e.clientY - d.dy) + 'px';
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  const over = hit && hit.closest('[data-drop]');
  const ok = over && over.closest('.mb-db') === d.el ? over : null;
  if (ok !== d.over) {
    if (d.over) d.over.classList.remove('db-over');
    if (ok) ok.classList.add('db-over');
    d.over = ok;
  }
}
function onDbPointerUp() {
  const d = dbDrag;
  dbDrag = null;
  if (!d || !d.on) return;
  dbDragged = true;
  setTimeout(() => { dbDragged = false; }, 0);
  if (d.ghost) d.ghost.remove();
  d.h.classList.remove('db-lifted');
  if (d.over) d.over.classList.remove('db-over');
  const el = d.el, rid = d.h.dataset.r;
  const ctx = dbCtx(el);
  if (!ctx || !ctx.data) return;
  const view = dbView(ctx);
  if (d.h.dataset.drag === 'bar') {
    const dp = dbPropFor(ctx.data, view, ['date']), r = dbRow(ctx.data, rid);
    if (dp && r && r.c[dp.id] && d.days) dbSetCell(el, rid, dp.id, dbShiftDate(r.c[dp.id], d.days));
    return;
  }
  if (!d.over) return;
  if (d.h.dataset.drag === 'chip') {
    const dp = dbPropFor(ctx.data, view, ['date']), r = dbRow(ctx.data, rid);
    const fromDay = d.h.closest('[data-day]') && d.h.closest('[data-day]').dataset.day, toDay = d.over.dataset.day;
    if (dp && r && r.c[dp.id] && fromDay && toDay && fromDay !== toDay) dbSetCell(el, rid, dp.id, dbShiftDate(r.c[dp.id], dbDaysBetween(fromDay, toDay)));
    return;
  }
  const g = dbPropFor(ctx.data, view, ['status', 'select', 'multi']), r = dbRow(ctx.data, rid);
  if (!g || !r) return;
  const to = d.over.dataset.g || '', from = (d.h.closest('[data-g]') || {}).dataset ? d.h.closest('[data-g]').dataset.g : '';
  if (to === from) return;
  if (g.type === 'multi') {
    const cur = (r.c[g.id] || []).filter((x) => x !== from);
    dbSetCell(el, rid, g.id, to ? [...new Set([...cur, to])] : []);
  } else dbSetCell(el, rid, g.id, to || undefined);
}

function onDbClick(e) {
  let b = e.target.closest('.db-face [data-act]');
  if (!b) return;
  const el = b.closest('.mb-db');
  if (!el || !el.closest('#notesLayer')) return;
  e.preventDefault();
  if (dbDragged) return;
  if (dbInline && !b.closest('.db-td.editing')) {
    // writing the open cell redraws the database: find the same thing in the new drawing
    dbFinishInline();
    const sel = ['act', 'r', 'p', 'g', 'day', 'v'].filter((k) => b.dataset[k] !== undefined)
      .map((k) => `[data-${k}="${CSS.escape(b.dataset[k])}"]`).join('');
    b = el.querySelector(sel);
    if (!b) return;
  }
  if (b.classList.contains('editing')) return;     // a press inside the cell being typed in
  const act = b.dataset.act;
  const rid = b.dataset.r;
  switch (act) {
    case 'tab': dbEdit(el, (c) => { if (c.own.cur === b.dataset.v) return false; c.own.cur = b.dataset.v; }, 'ui'); return;
    case 'add-view': openAddView(el, b); return;
    case 'view-menu': openViewMenu(el, b); return;
    case 'rename': openRenameDb(el, b); return;
    case 'goto-src': dbGotoSource(el); return;
    case 'prop': openPropMenu(el, b, b.dataset.p); return;
    case 'add-prop': openAddProp(el, b); return;
    case 'cell': dbEditCell(el, b); return;
    case 'open': case 'card': openDbRow(el, rid); return;
    case 'row-menu': openRowMenu(el, b, rid); return;
    case 'add-status': dbAddKind(el, 'status'); return;
    case 'add-date': dbAddKind(el, 'date'); return;
    case 'add-place': dbAddKind(el, 'place'); return;
    case 'form-submit': dbSubmitForm(el); return;
  }
  const ctx = dbCtx(el);
  if (!ctx) return;
  const view = dbView(ctx), ui = dbUiOf(ctx, view);
  switch (act) {
    case 'new-row': case 'new-row-inline': case 'new-in-group': case 'new-on-day': {
      const id = dbAddRow(el, dbRowDefaults(ctx, { g: b.dataset.g, day: b.dataset.day }));
      if (!id) return;
      /* In the table a new row is typed into where it is; everywhere else it
         opens as a page, the way Notion's New button does. */
      if (view.type === 'table') {
        const cell = el.querySelector(`.db-td[data-r="${id}"][data-p="${ctx.data.props[0].id}"]`);
        if (cell) dbEditCell(el, cell);
      } else openDbRow(el, id, true);
      return;
    }
    case 'open-url': {
      const r = dbRow(ctx.data, rid), v = r && r.c[b.dataset.p];
      if (v) openHref(dbUrl(v));
      return;
    }
    case 'open-place': {
      const r = dbRow(ctx.data, rid), v = r && r.c[b.dataset.p];
      if (v) openHref(dbMapHref(v));
      return;
    }
    case 'day-more': {
      const d = dbPropFor(ctx.data, view, ['date']), key = b.dataset.day;
      openDbPop(b, () => ({
        title: fmtDate(key, { weekday: 'long', day: 'numeric', month: 'long' }),
        items: ctx.data.rows.filter((r) => { const v = d && r.c[d.id]; return v && dbDateStart(v) <= key && key <= dbDateEnd(v); })
          .map((r) => ({ ic: icon('description'), label: dbTitle(ctx.data, r) || t('db.untitledRow'), act: () => { openDbRow(el, r.id); } }))
      }));
      return;
    }
    case 'cal-prev': ui.m = (ui.m || 0) - 1; break;
    case 'cal-next': ui.m = (ui.m || 0) + 1; break;
    case 'cal-today': ui.m = 0; break;
    case 'tl-prev': ui.s = dbAddDays(ui.s || dbAddDays(dayKeyIn(0), -7), -7); break;
    case 'tl-next': ui.s = dbAddDays(ui.s || dbAddDays(dayKeyIn(0), -7), 7); break;
    case 'tl-today': ui.s = null; break;
    default: return;
  }
  paintDb(el);
}

/* Backspace at the start of the line under a database, or Delete at the end of
   the line above it, would take the whole database with it — it is one
   character to the editor. Here it stops and the database flashes instead;
   deleting one is its own menu item, which asks. Returns true when it handled
   the key. Called from onEditorKey(). */
function dbGuardKey(e, body) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const blk = caretBlock(body);
  if (!blk || blk.parentNode !== body) return false;
  const next = e.key === 'Backspace' ? blk.previousElementSibling : blk.nextElementSibling;
  if (!next || !next.classList.contains('mb-db')) return false;
  const r = s.getRangeAt(0), probe = document.createRange();
  probe.selectNodeContents(blk);
  if (e.key === 'Backspace') probe.setEnd(r.startContainer, r.startOffset);
  else probe.setStart(r.endContainer, r.endOffset);
  if (probe.toString().replace(/​/g, '') !== '') return false;
  e.preventDefault();
  if (e.key === 'Backspace' && !blk.textContent.replace(/​/g, '').trim() && blk.nextElementSibling) {
    // an empty line between a database and more text just goes
    const after = blk.nextElementSibling;
    blk.remove();
    placeCaret(after, 0);
    persistEdit();
    return true;
  }
  next.classList.remove('db-flash');
  void next.offsetWidth;
  next.classList.add('db-flash');
  setTimeout(() => next.classList.remove('db-flash'), 900);
  return true;
}

/* ---- out of the app ---- */
// a database as a Markdown table, for JSON Canvas (canvas.js)
function dbMarkdown(raw) {
  const db = adoptDb(raw);
  if (!db) return '';
  const data = db.src ? (dbLocate(db.src) || {}).db : db;
  if (!data) return '';
  const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const head = data.props.map((p) => cell(dbPropName(p)));
  return (data.name ? `**${cell(data.name)}**\n\n` : '') +
    ['| ' + head.join(' | ') + ' |', '|' + head.map(() => ' --- |').join(''),
      ...data.rows.map((r) => '| ' + data.props.map((p) => cell(dbCellText(data, p, r))).join(' | ') + ' |')].join('\n');
}
// the words in a database, for search (stripHtml); a linked view's are its source's
function dbPlain(raw) {
  const db = adoptDb(raw);
  if (!db || db.src) return '';
  return [db.name, ...db.rows.map((r) => db.props.map((p) => dbCellText(db, p, r)).join(' ') + ' ' + (r.t || ''))].join(' ');
}

function wireDatabases() {
  document.addEventListener('pointerdown', onDbPointerDown);
  window.addEventListener('pointermove', onDbPointerMove);
  window.addEventListener('pointerup', onDbPointerUp);
  window.addEventListener('pointercancel', onDbPointerUp);
  document.addEventListener('click', onDbClick);
  // a button in a database must not take the caret out of the note being written in
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.db-face button, .db-face [data-act]') && !e.target.closest('input, select, textarea, label')) e.preventDefault();
  });
  wireDbPop();
  wireDbRow();
}
