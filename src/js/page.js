/* Mental Board — page.js
   The page menu at the top right of the canvas, and what a board can decide
   for itself: its font, its text size, its background, its group.

   Part 16 of 17. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 17. the page menu ───────────────
   One button at the top right of the board — the board's name and a "⋯" —
   and behind it everything that is about *this* board rather than about the
   app: how it looks, where it lives, what to do with the whole of it. Settings
   (Ctrl+,) stays the place for the app; this is the place for the page.

   Three per-board looks live here and all three fall back to Settings when a
   board has not chosen: `font` (one of NOTE_FONTS, or ''), `smallText`, and
   `bg` ({ file, fit, dim } — a picture in the board's own folder). They are
   stored on the board, so a board keeps its look when it is exported, and
   applyBoardLook() is what paints them — from render() on every board switch
   and from applySettings() whenever the global they fall back to changes. */

function applyBoardLook() {
  const b = activeBoard();
  const s = state.settings;
  document.body.dataset.notefont = (b && b.font) || s.noteFont;
  document.body.classList.toggle('small-text', !!(b && b.smallText));
  const layer = $('bgImage');
  const bg = b && !b.unreadable && b.bg && b.bg.file ? b.bg : null;
  if (layer) {
    if (bg && DATA) {
      layer.style.backgroundImage = `url("mbf://${encodeURIComponent(b.id)}/${encodeURIComponent(bg.file)}")`;
      layer.dataset.fit = bg.fit || 'cover';
      layer.style.setProperty('--bg-dim', (clamp(+bg.dim || 0, 0, 90) / 100).toFixed(2));
      layer.classList.remove('hidden');
    } else {
      layer.classList.add('hidden');
      layer.style.backgroundImage = '';
    }
  }
  document.body.classList.toggle('has-bg', !!(bg && DATA));
  paintPageBtn();
}

/* The button itself carries the board's name, so the top right of the canvas
   always says where you are — the rail may be hidden. */
function paintPageBtn() {
  const btn = $('pageBtn');
  const b = activeBoard();
  if (!btn || !b) return;
  const ic = b.trash ? 'delete' : (b.enc ? 'lock' : (b.icon || 'sticky_note_2'));
  btn.innerHTML = `<span class="pg-ic" style="color:${b.trash || b.enc ? 'inherit' : iconColorVar(b.iconColor)}">${icon(ic)}</span>` +
                  `<span class="pg-name">${esc(b.trash ? t('board.trash') : boardLabel(b))}</span>` +
                  `<span class="pg-more">${icon('more_horiz')}</span>`;
  btn.classList.toggle('hidden', state.settings.focusMode);
}

/* ---- the menu ---- */
const FONT_LABELS = { system: 'set.fontSystem', serif: 'set.fontSerif', wide: 'set.fontWide', mono: 'set.fontMono',
                      rounded: 'set.fontRounded', narrow: 'set.fontNarrow', hand: 'set.fontHand' };

function openPageMenu() {
  const menu = $('pageMenu');
  const b = activeBoard();
  if (!menu || !b) return;
  closeCtxMenu(); closeBoardMenu();
  const s = state.settings;
  const row = (act, ic, label, cls, key) =>
    `<button class="pm-row${cls ? ' ' + cls : ''}" data-act="${act}">${icon(ic)}<span>${label}</span>${key ? `<span class="k">${key}</span>` : ''}</button>`;
  const label = (k, ic) => `<div class="pm-label">${ic ? icon(ic) : ''}<span>${te(k)}</span></div>`;
  const locked = !!b.enc, bin = !!b.trash, dead = !!b.unreadable;
  const font = b.font || '';
  const bg = b.bg && b.bg.file ? b.bg : null;

  let html = `<div class="pm-head">${icon(bin ? 'delete' : (locked ? 'lock' : (b.icon || 'sticky_note_2')))}` +
             `<span class="pm-title">${esc(bin ? t('board.trash') : boardLabel(b))}</span>` +
             (bin || dead ? '' : `<button class="pm-x" data-act="rename" title="${te('board.rename')}">${icon('edit')}</button>`) +
             `</div>`;
  if (!dead) {
    html += label('page.look', 'palette');
    /* Fonts as samples, not names: what "Narrow" means is the shape of the
       letters, and the shape is the only thing worth choosing on. The first
       card follows Settings, and says so. */
    html += `<div class="pm-fonts">` +
      [''].concat(NOTE_FONTS).map((f) => {
        const on = f === font;
        const face = f || s.noteFont;
        const name = f ? t(FONT_LABELS[f] || 'set.fontSystem') : t('page.fontDefault');
        return `<button class="pm-font${on ? ' on' : ''}" data-font="${f}" data-face="${esc(face)}" title="${esc(name)}"><span class="pm-ag">Ag</span><span class="pm-fn">${esc(name)}</span></button>`;
      }).join('') + `</div>`;
    html += `<label class="pm-row pm-check"><span>${icon('text_decrease')}</span><span>${te('page.smallText')}</span>` +
            `<span class="pm-switch"><input type="checkbox" data-act="small" ${b.smallText ? 'checked' : ''}><i></i></span></label>`;
    html += `<div class="pm-bg">` +
      `<div class="pm-bg-row">${icon('image')}<span>${te('page.background')}</span>` +
        `<span class="pm-bg-acts">` +
          `<button class="pm-mini" data-act="bgPick">${te(bg ? 'page.bgChange' : 'page.bgChoose')}</button>` +
          (bg ? `<button class="pm-mini" data-act="bgRemove">${te('page.bgRemove')}</button>` : '') +
        `</span></div>` +
      (bg ? `<div class="pm-bg-opts">` +
              `<div class="seg small" id="pmBgFit">` +
                BG_FITS.map((f) => `<button data-fit="${f}" class="${bg.fit === f ? 'on' : ''}">${te('page.fit.' + f)}</button>`).join('') +
              `</div>` +
              `<label class="pm-dim"><span>${te('page.bgDim')}</span><input type="range" id="pmBgDim" min="0" max="90" step="5" value="${clamp(+bg.dim || 0, 0, 90)}"><span class="pm-dim-v">${pct(clamp(+bg.dim || 0, 0, 90))}</span></label>` +
            `</div>` : '') +
      `</div>`;
  }
  html += label('page.actions', 'bolt');
  if (!dead && !locked) html += row('copy', 'content_copy', te('page.copyContent'), '', 'Ctrl Shift C');
  if (!bin && !dead) html += row('dup', 'content_copy', te('board.duplicate'));
  if (!bin && !dead) html += row('move', 'folder', te('page.moveTo') + (b.group ? ` · ${esc(b.group)}` : ''));
  if (!bin && !dead) html += row('trash', 'delete', te('page.moveToTrash'), 'danger');
  if (bin) html += row('emptyTrash', 'delete_forever', te('menu.emptyTrash'), 'danger');
  html += label('page.files', 'folder_open');
  html += row('import', 'upload', te('page.import'));
  if (!dead) html += row('export', 'download', te('page.export'));
  if (!dead && !locked) html += row('image', 'image', te('page.exportImage'));
  html += row('folder', 'folder_open', te('page.openFolder'));
  if (!bin && !dead) {
    html += `<div class="pm-sep"></div>`;
    html += row('lock', locked ? 'lock_open' : 'lock', te(locked ? 'board.unlock' : 'board.lock'));
    html += row('archive', b.archived ? 'unarchive' : 'archive', te(b.archived ? 'board.unarchive' : 'board.archive'));
  }
  menu.innerHTML = html;
  menu.classList.remove('hidden');
  document.body.classList.add('page-open');

  const done = () => closePageMenu();
  menu.querySelectorAll('.pm-font').forEach((el) => el.addEventListener('click', () => { setBoardFont(el.dataset.font); openPageMenu(); }));
  const sm = menu.querySelector('[data-act="small"]');
  if (sm) sm.addEventListener('change', () => setSmallText(sm.checked));
  menu.querySelectorAll('#pmBgFit button').forEach((el) => el.addEventListener('click', () => { setBgFit(el.dataset.fit); openPageMenu(); }));
  const dim = $('pmBgDim');
  if (dim) dim.addEventListener('input', () => {
    setBgDim(+dim.value);
    const v = menu.querySelector('.pm-dim-v'); if (v) v.textContent = pct(+dim.value);
  });
  menu.querySelectorAll('button[data-act]').forEach((el) => el.addEventListener('click', () => {
    const act = el.dataset.act;
    if (act === 'small') return;
    switch (act) {
      case 'rename': done(); renameBoardInline(b.id); break;
      case 'bgPick': chooseBackground(); break;
      case 'bgRemove': removeBackground(); openPageMenu(); break;
      case 'copy': done(); copyBoardContent(); break;
      case 'dup': done(); duplicateBoard(b.id); break;
      case 'move': done(); openMoveTo(b.id); break;
      case 'trash': done(); deleteBoard(b.id); break;
      case 'emptyTrash': done(); emptyTrash(); break;
      case 'import': done(); importOneBoard(); break;
      case 'export': done(); exportOneBoard(b.id); break;
      case 'image': done(); exportBoardImage(b.id); break;
      case 'folder': done(); openBoardFiles(); break;
      case 'lock': done(); b.enc ? removeBoardLock(b.id) : lockBoard(b.id); break;
      case 'archive': done(); archiveBoard(b.id, !b.archived); break;
    }
  }));
}
function closePageMenu() {
  const m = $('pageMenu');
  if (m) m.classList.add('hidden');
  document.body.classList.remove('page-open');
}
function togglePageMenu() {
  if ($('pageMenu').classList.contains('hidden')) openPageMenu(); else closePageMenu();
}

/* Rename from the page button: the rail may be off, so the name is edited on
   the button itself rather than on a tile. */
function renameBoardInline(id) {
  const b = boardById(id);
  const btn = $('pageBtn');
  const label = btn && btn.querySelector('.pg-name');
  if (!b || !label) return;
  const before = b.name;
  label.textContent = boardLabel(b);
  label.setAttribute('contenteditable', 'plaintext-only');
  btn.classList.add('renaming');
  label.focus();
  const sel = getSelection(); sel.removeAllRanges();
  const r = document.createRange(); r.selectNodeContents(label); sel.addRange(r);
  let settled = false;
  const finish = (keep) => {
    if (settled) return;
    settled = true;
    label.removeAttribute('contenteditable');
    btn.classList.remove('renaming');
    if (keep) {
      const typed = (label.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      b.name = (typed && typed !== t('board.numbered', { n: state.boards.indexOf(b) + 1 })) ? typed : '';
      b.updatedAt = Date.now();
      save();
    } else b.name = before;
    renderBoardRail(); paintPageBtn();
    $('viewport').focus();
  };
  label.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  label.addEventListener('blur', () => finish(true));
}

/* ---- the three looks ---- */
function setBoardFont(f) {
  const b = activeBoard();
  if (!b || b.unreadable) return;
  b.font = NOTE_FONTS.includes(f) ? f : '';
  applyBoardLook(); saveSoon();
}
function setSmallText(on) {
  const b = activeBoard();
  if (!b || b.unreadable) return;
  b.smallText = !!on;
  applyBoardLook(); saveSoon();
}
/* The picture is taken into the board's folder like any other file, so the
   background travels with the board. `dim` starts at 40: a photograph behind
   notes needs quietening before anything on it is readable. */
async function chooseBackground() {
  const b = activeBoard();
  if (!b || b.unreadable) return;
  if (!FILES || !FILES.pickImage || !FILES.attach) { toast(t('msg.needDesktop')); return; }
  const p = await FILES.pickImage('background');
  if (!p) return;
  const r = await FILES.attach(p, b.id, '');
  if (!r || r.error) { toast(t('msg.fileFailed', { name: p.split(/[\\/]/).pop() }), 5000); return; }
  b.bg = { file: r.name, fit: (b.bg && b.bg.fit) || 'cover', dim: b.bg ? b.bg.dim : 40 };
  applyBoardLook(); saveSoon();
  if (!$('pageMenu').classList.contains('hidden')) openPageMenu();
}
function removeBackground() {
  const b = activeBoard();
  if (!b) return;
  b.bg = null;                        // the file stays in the folder; Clean up unused reclaims it
  applyBoardLook(); saveSoon();
}
function setBgFit(fit) {
  const b = activeBoard();
  if (!b || !b.bg || !BG_FITS.includes(fit)) return;
  b.bg.fit = fit;
  applyBoardLook(); saveSoon();
}
function setBgDim(v) {
  const b = activeBoard();
  if (!b || !b.bg) return;
  b.bg.dim = clamp(Math.round(+v || 0), 0, 90);
  applyBoardLook(); saveSoon();
}

/* ---- the whole board, copied ----
   Everything on the board goes to the internal clipboard — Ctrl+V on another
   board pastes it — and to the system clipboard as text and HTML, in reading
   order, so a board can go into an email in one gesture. copySelection() does
   both; this just selects everything for it and puts the selection back. */
function copyBoardContent() {
  const b = activeBoard();
  if (!b || b.unreadable || isLocked(b)) return;
  const all = [...state.notes.map((n) => n.id), ...state.frames.map((f) => f.id)];
  if (!all.length) { toast(t('msg.boardEmptyCopy')); return; }
  const prev = [...selection];
  setSelection(all, false);
  copySelection(false);
  setSelection(prev, false);
  toast(t('msg.boardCopied', { n: all.length }));
}

/* ---- groups: "Move to…" ----
   A group is a word on the board and a sub-folder of My Boards. The rail
   shows grouped boards under a heading; the store moves the folder on the
   next save. One level, on purpose: a tree of boards is a filing system, and
   the rail is not the place to run one. */
const groupNames = () => [...new Set(state.boards.filter((b) => !b.trash && b.group).map((b) => b.group))];

function openMoveTo(id) {
  const b = boardById(id);
  if (!b) return;
  const dlg = $('moveDlg'), list = $('moveList');
  if (!dlg || !list) return;
  const item = (g, on) =>
    `<button class="mv-item${on ? ' on' : ''}" data-group="${esc(g)}">${icon(g ? 'folder' : 'space_dashboard')}<span>${g ? esc(g) : te('page.noGroup')}</span>${on ? icon('check') : ''}</button>`;
  list.innerHTML = item('', !b.group) + groupNames().map((g) => item(g, g === b.group)).join('');
  $('moveNew').value = '';
  dlg.classList.remove('hidden');
  list.querySelectorAll('.mv-item').forEach((el) => el.addEventListener('click', () => {
    moveBoardToGroup(id, el.dataset.group);
    closeMoveTo();
  }));
  setTimeout(() => $('moveNew').focus(), 30);
  dlg.dataset.board = id;
}
function closeMoveTo() { $('moveDlg').classList.add('hidden'); }
function submitMoveNew() {
  const id = $('moveDlg').dataset.board;
  const g = ($('moveNew').value || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!g) return;
  if (g.toLowerCase() === 'backups') { toast(t('msg.groupReserved')); return; }
  moveBoardToGroup(id, g);
  closeMoveTo();
}
/* Into the group — and next to its group-mates in the rail, so the order on
   screen and the order on disk agree. Ungrouped boards come first; groups
   follow in the order they first appear. */
function moveBoardToGroup(id, group) {
  const b = boardById(id);
  if (!b || b.trash) return;
  const g = String(group || '');
  if (b.group === g) return;
  b.group = g;
  b.updatedAt = Date.now();
  const rest = state.boards.filter((x) => x !== b);
  let at = -1;
  if (g) { for (let i = rest.length - 1; i >= 0; i--) if (rest[i].group === g) { at = i + 1; break; } }
  else { for (let i = rest.length - 1; i >= 0; i--) if (!rest[i].group && !rest[i].trash) { at = i + 1; break; } if (at < 0) at = 0; }
  if (at < 0) {
    // a new group goes after the last grouped board, or after the last ungrouped one
    at = rest.length;
    const trashAt = rest.findIndex((x) => x.trash);
    if (trashAt >= 0) at = trashAt;
  }
  rest.splice(at, 0, b);
  state.boards = rest;
  renderBoardRail(); paintPageBtn(); save();
  toast(g ? t('msg.movedToGroup', { name: boardLabel(b), group: g }) : t('msg.movedOutOfGroup', { name: boardLabel(b) }));
}

function wirePageMenu() {
  const btn = $('pageBtn');
  if (btn) btn.addEventListener('click', (e) => {
    if (btn.classList.contains('renaming')) return;
    e.stopPropagation();
    togglePageMenu();
  });
  document.addEventListener('pointerdown', (e) => {
    const m = $('pageMenu');
    if (!m || m.classList.contains('hidden')) return;
    if (e.target.closest('#pageMenu, #pageBtn')) return;
    closePageMenu();
  }, true);
  $('moveClose').addEventListener('click', closeMoveTo);
  $('moveNewOk').addEventListener('click', submitMoveNew);
  $('moveNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitMoveNew(); } });
  $('moveDlg').addEventListener('click', (e) => { if (e.target === $('moveDlg')) closeMoveTo(); });
}
