/* Mental Board — views.js
   Three other ways of looking at the same notes: the minimap, the agenda
   across every board, and the board as columns by status.

   Part 20 of 21. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 19. views ───────────────
   None of the three stores anything. Each is drawn from `state` when it is
   opened (or, for the minimap, when the view or the board changes), and every
   change made in one — a status dragged to another column, a note ticked off
   in the agenda — goes through the same functions the canvas uses, so undo,
   saving and the pills on the notes need nothing new. See MAP.md §4u. */

/* A note's name for a list: the text of its first block that has any —
   usually its heading. noteText() joins blocks with spaces, which is right for
   searching and wrong for a title. Cached on the body, like noteText(). */
const titleCache = new Map();
function noteTitle(n) {
  const hit = titleCache.get(n.id);
  if (hit && hit.body === n.body) return hit.title;
  const d = document.createElement('div');
  d.innerHTML = n.body || '';
  let title = '';
  for (const el of d.querySelectorAll('h1, h2, h3, p, li, blockquote, pre, td, th, div')) {
    if (el.querySelector('h1, h2, h3, p, li, blockquote, pre, table, div')) continue;   // a container, not a block
    const s = (el.textContent || '').replace(/[\s​]+/g, ' ').trim();
    if (s) { title = s; break; }
  }
  if (!title) title = noteText(n).trim();
  title = title.slice(0, 90) || t('view.untitled');
  if (titleCache.size > 4000) titleCache.clear();
  titleCache.set(n.id, { body: n.body, title });
  return title;
}
// the notes of any board, live for the open one
const notesOfBoard = (b) => (b.id === state.activeBoard ? state.notes : b.notes);

/* ════════════════ the minimap ════════════════
   Every note and workflow as a rectangle, and the part of the board on screen
   as a frame. Drawn on a <canvas>, not built from elements: three thousand
   notes are three thousand fillRect calls, about a millisecond, where three
   thousand divs would be a second copy of the board for the browser to lay
   out. That is the cost MAP §8 was worried about, and a canvas does not pay it.

   It redraws on a frame after anything that moves the view (applyView) or
   changes the board (saveSoon), never more than once a frame. */
const MINI_W = 200, MINI_H = 132, MINI_PAD = 8;
let miniQueued = false;
let miniMap = null;                // the last drawn mapping, for the pointer
let miniInk = null;                // note colours, read from the stylesheet

function miniOn() {
  return state.settings.minimap !== false && !state.settings.focusMode &&
    (state.notes.length + state.frames.length) > 0;
}
function scheduleMinimap() {
  if (miniQueued) return;
  miniQueued = true;
  requestAnimationFrame(() => { miniQueued = false; drawMinimap(); });
}
// the theme changed: colours are read again on the next draw
function minimapThemeChanged() { miniInk = null; scheduleMinimap(); }

function drawMinimap() {
  const cv = $('minimap');
  if (!cv) return;
  const on = miniOn();
  cv.classList.toggle('hidden', !on);
  if (!on) { miniMap = null; return; }
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== MINI_W * dpr) { cv.width = MINI_W * dpr; cv.height = MINI_H * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, MINI_W, MINI_H);

  if (!miniInk) {
    const cs = getComputedStyle(document.documentElement);
    const v = (name, dflt) => (cs.getPropertyValue(name) || '').trim() || dflt;
    miniInk = { line: v('--line-2', '#888'), accent: v('--accent', '#7fd6c8'), dim: v('--dim', '#999') };
    COLORS.forEach((c) => { miniInk[c] = v(`--c-${c}-c`, miniInk.dim); });
  }

  // the world box: everything on the board, and wherever the view is now
  const r = vpRect(), vz = state.view.z;
  const view = { x: -state.view.x / vz, y: -state.view.y / vz, w: r.width / vz, h: r.height / vz };
  let x0 = view.x, y0 = view.y, x1 = view.x + view.w, y1 = view.y + view.h;
  const grow = (it) => {
    if (it.x < x0) x0 = it.x; if (it.y < y0) y0 = it.y;
    if (it.x + it.w > x1) x1 = it.x + it.w; if (it.y + it.h > y1) y1 = it.y + it.h;
  };
  for (const f of state.frames) grow(f);
  for (const n of state.notes) grow(n);
  const k = Math.min((MINI_W - MINI_PAD * 2) / (x1 - x0 || 1), (MINI_H - MINI_PAD * 2) / (y1 - y0 || 1));
  const ox = MINI_PAD + ((MINI_W - MINI_PAD * 2) - (x1 - x0) * k) / 2 - x0 * k;
  const oy = MINI_PAD + ((MINI_H - MINI_PAD * 2) - (y1 - y0) * k) / 2 - y0 * k;
  miniMap = { k, ox, oy };

  ctx.lineWidth = 1;
  for (const f of state.frames) {
    ctx.strokeStyle = isHex(f.color) ? f.color : (miniInk[f.color] || miniInk.line);
    ctx.globalAlpha = 0.7;
    ctx.strokeRect(Math.round(ox + f.x * k) + 0.5, Math.round(oy + f.y * k) + 0.5, Math.max(2, f.w * k), Math.max(2, f.h * k));
  }
  ctx.globalAlpha = 0.85;
  for (const n of state.notes) {
    ctx.fillStyle = n.pic ? miniInk.dim : isHex(n.color) ? n.color : (miniInk[n.color] || miniInk.dim);
    ctx.fillRect(ox + n.x * k, oy + n.y * k, Math.max(1.5, n.w * k), Math.max(1.5, n.h * k));
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = miniInk.accent;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox + view.x * k, oy + view.y * k, view.w * k, view.h * k);
}

/* Click or drag on the map: the view centres on that point, at the same zoom. */
function wireMinimap() {
  const cv = $('minimap');
  if (!cv) return;
  const go = (e) => {
    if (!miniMap) return;
    const b = cv.getBoundingClientRect();
    const wx = (e.clientX - b.left - miniMap.ox) / miniMap.k;
    const wy = (e.clientY - b.top - miniMap.oy) / miniMap.k;
    const r = vpRect();
    state.view.x = r.width / 2 - wx * state.view.z;
    state.view.y = r.height / 2 - wy * state.view.z;
    applyView();
  };
  let dragging = false;
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    dragging = true;
    cv.setPointerCapture(e.pointerId);
    go(e);
  });
  cv.addEventListener('pointermove', (e) => { if (dragging) go(e); });
  const end = () => { if (dragging) { dragging = false; saveSoon(); } };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  // the wheel over the map zooms the board, as it would anywhere else
  cv.addEventListener('wheel', (e) => { e.preventDefault(); zoomCentre(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
}

/* ════════════════ the agenda ════════════════
   Every note with a date, on every board you can read, in date order — under
   Overdue, Today, Tomorrow, This week and Later — with a month above it that
   marks the days that have something on them. Pick a day to see only that
   day. A row opens the note where it lives; the tick sets it to the first
   status that means done. Locked boards are skipped: there is nothing to read.
   The bin is skipped: what is in it is not due. */
let agendaDay = '';                 // '' or a day key: the list shows only that day
let agendaMonth = null;             // { y, m } the calendar is showing

function datedNotes() {
  const out = [];
  state.boards.forEach((b) => {
    if (b.trash || b.unreadable || isLocked(b)) return;
    notesOfBoard(b).forEach((n) => { if (!n.pic && okDateKey(n.date)) out.push({ n, b }); });
  });
  return out.sort((p, q) => (p.n.date < q.n.date ? -1 : p.n.date > q.n.date ? 1 : (p.n.y - q.n.y)));
}
// which section of the list a date falls in
function agendaBucket(key) {
  const d = daysUntil(key);
  if (d < 0) return 'late';
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return 'week';
  return 'later';
}
const doneStatus = () => state.statuses.find((s) => s.done) || null;

function openAgenda() {
  closeCtxMenu(); closePageMenu();
  if (!agendaMonth) { const d = new Date(); agendaMonth = { y: d.getFullYear(), m: d.getMonth() }; }
  renderAgenda();
  $('agendaDlg').classList.remove('hidden');
}
function closeAgenda() { $('agendaDlg').classList.add('hidden'); }

function renderAgenda() {
  const all = datedNotes();
  /* The month. Monday first or Sunday first follows the language's own week,
     where Intl will say; Monday otherwise. */
  const { y, m } = agendaMonth;
  const first = new Date(y, m, 1);
  let weekStart = 1;
  try { const wi = new Intl.Locale(LANG._locale || LANG_ID).weekInfo; if (wi && wi.firstDay) weekStart = wi.firstDay % 7; } catch (_) {}
  const lead = (first.getDay() - weekStart + 7) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const perDay = new Map();
  all.forEach(({ n }) => {
    const w = dateState(n);
    const cur = perDay.get(n.date) || { n: 0, late: false, done: 0 };
    cur.n++; if (w === 'late') cur.late = true; if (w === 'done') cur.done++;
    perDay.set(n.date, cur);
  });
  const today = todayKey();
  let fmtM = `${y}-${m + 1}`, fmtW = [];
  try {
    fmtM = new Intl.DateTimeFormat(LANG._locale || LANG_ID, { month: 'long', year: 'numeric' }).format(first);
    const wd = new Intl.DateTimeFormat(LANG._locale || LANG_ID, { weekday: 'narrow' });
    fmtW = Array.from({ length: 7 }, (_, i) => wd.format(new Date(2024, 0, 7 + ((weekStart + i) % 7))));   // 7 Jan 2024 was a Sunday
  } catch (_) {}
  let cal = `<div class="ag-month"><button class="ag-nav prev" data-nav="-1" title="${te('view.prevMonth')}">${icon('chevron_right')}</button>` +
            `<b>${esc(fmtM)}</b><button class="ag-nav" data-nav="1" title="${te('view.nextMonth')}">${icon('chevron_right')}</button></div>` +
            `<div class="ag-grid">${fmtW.map((w) => `<span class="ag-wd">${esc(w)}</span>`).join('')}`;
  for (let i = 0; i < lead; i++) cal += '<span></span>';
  for (let d = 1; d <= daysIn; d++) {
    const key = todayKey(new Date(y, m, d));
    const info = perDay.get(key);
    const cls = ['ag-day', key === today ? 'today' : '', key === agendaDay ? 'on' : '', info ? 'has' : '', info && info.late ? 'late' : ''].filter(Boolean).join(' ');
    cal += `<button class="${cls}" data-day="${key}" title="${esc(fmtDay(key))}${info ? ' · ' + esc(t('view.count', { n: info.n })) : ''}">${esc(num(d))}${info ? '<i></i>' : ''}</button>`;
  }
  cal += '</div>';

  // the list
  const shown = agendaDay ? all.filter(({ n }) => n.date === agendaDay) : all.filter(({ n }) => dateState(n) !== 'done' || daysUntil(n.date) >= 0);
  const heads = { late: t('view.overdue'), today: t('date.today'), tomorrow: t('date.tomorrow'), week: t('view.thisWeek'), later: t('view.later') };
  let list = '', last = '';
  shown.forEach(({ n, b }) => {
    const bucket = agendaDay ? 'day' : agendaBucket(n.date);
    if (bucket !== last) {
      last = bucket;
      list += `<div class="ag-head${bucket === 'late' ? ' late' : ''}">${esc(bucket === 'day' ? fmtDay(agendaDay) : heads[bucket])}</div>`;
    }
    const s = statusOf(n);
    const w = dateState(n);
    list += `<div class="ag-row${w ? ' ' + w : ''}" data-board="${esc(b.id)}" data-note="${esc(n.id)}">` +
      `<button class="ag-tick" data-act="done" title="${te('view.markDone')}"${!doneStatus() ? ' disabled' : ''}>${icon(s && s.done ? 'check_circle' : 'radio_button_unchecked')}</button>` +
      `<button class="ag-open" data-act="open">` +
        `<span class="ag-when">${esc(dateLabel(n.date))}</span>` +
        `<span class="ag-title" dir="auto">${esc(noteTitle(n))}</span>` +
        (s ? `<span class="ag-st" data-color="${esc(s.color)}"><span class="ns-dot"></span>${esc(statusName(s))}</span>` : '') +
        `<span class="ag-board">${esc(boardLabel(b))}</span>` +
      `</button></div>`;
  });
  if (!list) list = `<p class="ag-empty">${te(all.length ? 'view.nothingThatDay' : 'view.noDates')}</p>`;
  $('agendaBody').innerHTML = `<div class="ag-cal">${cal}</div><div class="ag-list">${list}</div>`;

  const body = $('agendaBody');
  body.querySelectorAll('.ag-nav').forEach((btn) => btn.addEventListener('click', () => {
    const d = new Date(agendaMonth.y, agendaMonth.m + (+btn.dataset.nav), 1);
    agendaMonth = { y: d.getFullYear(), m: d.getMonth() };
    renderAgenda();
  }));
  body.querySelectorAll('.ag-day').forEach((btn) => btn.addEventListener('click', () => {
    agendaDay = agendaDay === btn.dataset.day ? '' : btn.dataset.day;
    renderAgenda();
  }));
  body.querySelectorAll('.ag-row').forEach((row) => {
    const b = boardById(row.dataset.board);
    const n = b && notesOfBoard(b).find((x) => x.id === row.dataset.note);
    if (!n) return;
    row.querySelector('[data-act="open"]').addEventListener('click', async () => { closeAgenda(); await revealNote(n, b); });
    row.querySelector('[data-act="done"]').addEventListener('click', () => {
      const ds = doneStatus();
      if (!ds) return;
      const s = statusOf(n);
      const next = s && s.done ? '' : ds.id;
      if (b.id === state.activeBoard) { pushUndo(); setStatus([n.id], next); }
      else { n.status = next; saveSoon(); }          // writeNow() stamps updatedAt
      renderAgenda();
    });
  });
}

/* ════════════════ the board as columns ════════════════
   One column per status, in the user's order, and one for notes with none.
   Drag a card to another column to set its status; click it to fly to the
   note. Only the open board: a status is about a note's place in a piece of
   work, and the work is the board. Pictures have no status and are left out. */
const KANBAN_CAP = 200;              // cards drawn per column before "and N more"
let kanbanDrag = null;

function openKanban() {
  const b = activeBoard();
  if (!b || isLocked(b) || b.unreadable) return;
  closeCtxMenu(); closePageMenu();
  renderKanban();
  $('kanbanDlg').classList.remove('hidden');
}
function closeKanban() { $('kanbanDlg').classList.add('hidden'); }

function renderKanban() {
  const b = activeBoard();
  $('kanbanTitle').textContent = t('view.kanbanOf', { name: boardLabel(b) });
  const cols = state.statuses.map((s) => ({ id: s.id, name: statusName(s), color: s.color, done: s.done }))
    .concat([{ id: '', name: t('view.noStatus'), color: 'default' }]);
  const known = new Set(state.statuses.map((s) => s.id));
  const notes = state.notes.filter((n) => !n.pic);
  const byCol = new Map(cols.map((c) => [c.id, []]));
  // a status id nobody has any more counts as none, the same as on the note
  notes.forEach((n) => byCol.get(known.has(n.status) ? n.status : '').push(n));
  const order = (p, q) => {
    const a = okDateKey(p.date), c = okDateKey(q.date);
    if (a && c && a !== c) return a < c ? -1 : 1;
    if (!!a !== !!c) return a ? -1 : 1;                 // dated work first
    return (p.y - q.y) || (p.x - q.x);                   // then as it sits on the board
  };
  $('kanbanBody').innerHTML = cols.map((c) => {
    const list = byCol.get(c.id).sort(order);
    const cards = list.slice(0, KANBAN_CAP).map((n) => {
      const date = okDateKey(n.date);
      const w = date ? dateState(n) : '';
      const text = noteText(n).replace(/\s+/g, ' ').trim();
      const title = noteTitle(n);
      const rest = text.startsWith(title) ? text.slice(title.length).trim() : '';
      return `<div class="kb-card" draggable="true" data-id="${esc(n.id)}" data-color="${esc(isHex(n.color) ? 'custom' : n.color || 'default')}" style="${colorStyle(n.color)}">` +
        `<div class="kb-title" dir="auto">${esc(title)}</div>` +
        (rest ? `<div class="kb-text" dir="auto">${esc(rest.slice(0, 140))}</div>` : '') +
        (date ? `<span class="nd-pill${w ? ' ' + w : ''}">${icon('event')}<span class="ns-name">${esc(dateLabel(date))}</span></span>` : '') +
        `</div>`;
    }).join('');
    const more = list.length > KANBAN_CAP ? `<p class="kb-more">${te('view.more', { n: list.length - KANBAN_CAP })}</p>` : '';
    return `<section class="kb-col${c.done ? ' done' : ''}" data-status="${esc(c.id)}">` +
      `<header class="kb-head" data-color="${esc(c.color)}"><span class="ns-dot"></span><span class="kb-name">${esc(c.name)}</span><span class="kb-n">${esc(num(list.length))}</span></header>` +
      `<div class="kb-cards">${cards}${more}</div></section>`;
  }).join('');

  const body = $('kanbanBody');
  body.querySelectorAll('.kb-card').forEach((card) => {
    card.addEventListener('click', () => {
      const n = state.notes.find((x) => x.id === card.dataset.id);
      if (!n) return;
      closeKanban();
      revealNote(n, activeBoard());
    });
    card.addEventListener('dragstart', (e) => {
      kanbanDrag = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', ''); } catch (_) {}
    });
    card.addEventListener('dragend', () => { kanbanDrag = null; card.classList.remove('dragging'); body.querySelectorAll('.kb-col.over').forEach((c) => c.classList.remove('over')); });
  });
  body.querySelectorAll('.kb-col').forEach((col) => {
    col.addEventListener('dragover', (e) => { if (!kanbanDrag) return; e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      const id = kanbanDrag;
      kanbanDrag = null;
      if (!id) return;
      pushUndo();
      setStatus([id], col.dataset.status || '');
      renderKanban();
    });
  });
}
