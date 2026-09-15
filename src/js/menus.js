/* Mental Board — menus.js
   The right-click menu, and the compass that signposts off-screen workflows.

   Part 12 of 17. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 12. context menu ─────────────── */
function closeCtxMenu() { $('ctxMenu').classList.add('hidden'); }

function openCtxMenu(clientX, clientY, id) {
  const menu = $('ctxMenu');
  const targets = id ? (selection.has(id) && selection.size > 1 ? [...selection] : [id]) : [];
  if (id && !selection.has(id)) setSelection([id], false);
  let html = '';

  const onePic = targets.length === 1 && !!(state.notes.find((x) => x.id === targets[0]) || {}).pic;
  if (onePic) {
    /* A picture on its own. No colour, no status, no text — the things it can
       do are the things a picture can do. */
    const item = (act, ic, label, key, cls) =>
      `<button class="cm-item${cls ? ' ' + cls : ''}" data-act="${act}">${icon(ic)}<span>${label}</span>${key ? `<span class="k">${key}</span>` : ''}</button>`;
    const n0 = state.notes.find((x) => x.id === targets[0]);
    html += `<div class="cm-label">${icon('image')}<span>${te('menu.picture')}</span></div>`;
    html += item('editPic', 'brush', te('menu.editPicture'), te('menu.dblclick'));
    html += item('replacePic', 'image', te('menu.replacePicture'));
    html += item('link', 'link', te('menu.link'), 'L');
    if (n0 && firstFileUrl(n0)) html += item('whereFile', 'folder_open', te('menu.whereFile'));
    html += `<p class="cm-hint">${te('menu.pictureHint')}</p>`;
    html += `<div class="cm-sep"></div>`;
    if (onTrashBoard()) html += item('putBack', 'undo', te('menu.putBack'));
    html += item('dup', 'content_copy', te('menu.duplicate'), 'Ctrl D');
    html += item('cut', 'content_cut', te('menu.cut'), 'Ctrl X');
    html += item('front', 'arrow_upward', te('menu.front'));
    html += item('back', 'arrow_downward', te('menu.back'));
    html += `<div class="cm-sep"></div>`;
    html += item('del', 'delete', te('menu.delete'), 'Del', 'danger');
  } else if (targets.length) {
    const first = itemById(targets[0]);
    html += `<div class="cm-label">${icon('colorize')}<span>${te('menu.colour')}</span></div><div class="cm-colors">` +
      COLORS.map((c) => `<button data-color="${c}" data-color-swatch data-color-key="${c}" class="${first && first.color === c ? 'on' : ''}" title="${te('colour.' + c)}"></button>`).join('') +
      `</div>`;
    /* Status, on notes only — a workflow frame is a place, not a task.

       A row of chips rather than a submenu: the whole point of a status is that
       changing it is a one-gesture thing you do a dozen times a day, and a
       submenu puts a hover-and-wait between you and every one of them. It also
       makes the current status readable without opening anything further, the
       same way the colour swatches above already do. */
    const noteTargets = targets.filter((tid) => !isFrame(tid));
    if (noteTargets.length && state.statuses.length) {
      const cur = (state.notes.find((x) => x.id === noteTargets[0]) || {}).status || '';
      html += `<div class="cm-label">${icon('label')}<span>${te('menu.status')}</span></div><div class="cm-status">` +
        state.statuses.map((s) => `<button data-status="${esc(s.id)}" data-color="${esc(s.color)}" class="cm-st${cur === s.id ? ' on' : ''}" title="${esc(statusName(s))}"><span class="cm-st-dot"></span><span>${esc(statusName(s))}</span></button>`).join('') +
        `<button data-status="" class="cm-st cm-st-none${cur === '' ? ' on' : ''}">${te('status.none')}</button>` +
        `</div>`;
    }
    html += `<div class="cm-sep"></div>`;
    const item = (act, ic, label, key, cls) =>
      `<button class="cm-item${cls ? ' ' + cls : ''}" data-act="${act}">${icon(ic)}<span>${label}</span>${key ? `<span class="k">${key}</span>` : ''}</button>`;
    if (targets.length === 1) html += item('icon', 'mood', te('menu.icon'));
    if (first) html += item('focus', 'filter_alt', te('menu.focusColour'));
    /* "Show me everything that is blocked" was the one question a board full of
       people could not answer. Only on a note — a workflow frame has no status
       — and it offers the *note's own* status, so it reads as "more like this
       one" rather than as a menu of every status you have. */
    if (targets.length === 1 && !isFrame(targets[0])) {
      const n1 = state.notes.find((x) => x.id === targets[0]);
      const s1 = statusOf(n1);
      html += item('focusStatus', 'label', te(s1 ? 'menu.focusStatus' : 'menu.focusNoStatus'));
    }
    if (targets.length === 1 && !isFrame(targets[0])) {
      html += item('edit', 'edit', te('menu.edit'), te('menu.dblclick'));
      html += item('link', 'link', te('menu.link'), 'L');
      html += item('remind', 'alarm', te('menu.remind'));
      html += item('tpl', 'bookmarks', te('tpl.save'));
      const n0 = state.notes.find((x) => x.id === targets[0]);
      if (n0 && n0.hist && n0.hist.length) html += item('hist', 'history', te('menu.history', { n: n0.hist.length }));
      /* Where the app has actually put this. Only on a note that carries a file,
         because on any other note it would be a row that does nothing — and it
         is the honest answer to "you copied my video somewhere, where?". */
      if (n0 && firstFileUrl(n0)) html += item('whereFile', 'folder_open', te('menu.whereFile'));
    }
    if (targets.length === 1 && isFrame(targets[0])) {
      /* Where the title sits. A little map of the frame rather than nine named
         rows: the grid *is* the shape being chosen, so no label has to say
         "top right" and nothing here needs translating. */
      const f0 = state.frames.find((x) => x.id === targets[0]);
      const cur = (f0 && TITLE_POS.includes(f0.titlePos)) ? f0.titlePos : 'tl';
      html += `<div class="cm-label">${icon('title')}<span>${te('menu.titlePos')}</span></div><div class="cm-pos">` +
        TITLE_POS.map((p) => `<button data-tp="${p}" class="${p === cur ? 'on' : ''}" title="${te('pos.' + p)}"><i></i></button>`).join('') +
        `</div>`;
      html += item('rename', 'edit', te('menu.rename'), te('menu.dblclick'));
      html += item('selectInside', 'select_all', te('menu.selectInside'));
      html += item('flyHere', 'my_location', te('menu.frameThis'));
      html += item('newNoteHere', 'sticky_note_2', te('menu.newNoteHere'), 'N');
    }
    if (targets.length > 1) html += item('group', 'select_all', te('menu.group'), 'Ctrl G');
    /* Arrange, on more than one note. Three rows rather than a submenu, for the
       same reason the status chips are chips: it is a thing you do and look at,
       and a hover-and-wait between the intent and the result makes you do it
       less often than you would like to. */
    if (targets.filter((tid) => !isFrame(tid)).length > 1) {
      html += item('arrGrid', 'grid_view', te('menu.arrangeGrid'), 'Ctrl Shift G');
      html += item('arrRow', 'view_column', te('menu.arrangeRow'));
      html += item('arrCol', 'view_list', te('menu.arrangeColumn'));
    }
    /* Standing in the bin, the useful verb is the opposite of the one
       everywhere else. Put back comes first, above the colours' worth of
       actions that make less sense on something already deleted. */
    if (onTrashBoard()) html += item('putBack', 'undo', te('menu.putBack'));
    html += item('dup', 'content_copy', te('menu.duplicate'), 'Ctrl D');
    html += item('cut', 'content_cut', te('menu.cut'), 'Ctrl X');
    html += item('front', 'arrow_upward', te('menu.front'));
    html += item('back', 'arrow_downward', te('menu.back'));
    html += `<div class="cm-sep"></div>`;
    html += item('del', 'delete', te('menu.delete'), 'Del', 'danger');
  } else {
    const item = (act, ic, label, key) =>
      `<button class="cm-item" data-act="${act}">${icon(ic)}<span>${label}</span>${key ? `<span class="k">${key}</span>` : ''}</button>`;
    html += item('newNote', 'sticky_note_2', te('menu.newNote'), 'N');
    html += item('newFrame', 'select_all', te('menu.newFrame'), 'G');
    if (clipboard.length) html += item('paste', 'content_paste', te('menu.paste', { n: clipboard.length }), 'Ctrl V');
    html += `<div class="cm-sep"></div>`;
    html += item('selectAll', 'select_all', te('menu.selectAll'), 'Ctrl A');
    html += item('fit', 'fit_screen', te('menu.fit'), 'Shift 1');
    html += item('reset', 'my_location', te('menu.reset'), 'Ctrl 0');
    /* Undo and redo were keyboard-only. On a canvas that is mostly mouse work
       that made them invisible to anyone who never reads the shortcut list. */
    html += `<div class="cm-sep"></div>`;
    html += item('undo', 'undo', te('menu.undo'), 'Ctrl Z');
    html += item('redo', 'redo', te('menu.redo'), 'Ctrl Shift Z');
    html += `<div class="cm-sep"></div>`;
    html += item('boardFiles', 'folder', te('menu.boardFiles'));
    if (onTrashBoard()) {
      html += `<div class="cm-sep"></div>`;
      html += item('emptyTrash', 'delete_forever', te('menu.emptyTrash'));
    }
  }

  menu.innerHTML = html;
  menu.classList.remove('hidden');
  const w = menu.offsetWidth, h = menu.offsetHeight;
  // it should unfold away from the pointer, which is leftwards in an RTL layout
  menu.style.left = clamp(RTL ? clientX - w : clientX, 6, innerWidth - w - 6) + 'px';
  menu.style.top = clamp(clientY, 44, innerHeight - h - 6) + 'px';

  const worldPt = toWorld(clientX, clientY);

  menu.querySelectorAll('[data-color-swatch]').forEach((b) => {
    b.dataset.colorKeyApplied = '1';
    b.setAttribute('data-color', b.dataset.colorKey);   // paints the swatch via the [data-color] vars
    b.addEventListener('click', () => {
      pushUndo();
      targets.forEach((t) => {
        const it = itemById(t);
        if (!it) return;
        it.color = b.dataset.colorKey;
        const el = els.get(t);
        if (el) el.dataset.color = it.color;
      });
      closeCtxMenu(); saveSoon(); drawCompass();
    });
  });

  menu.querySelectorAll('.cm-st').forEach((b) => b.addEventListener('click', () => {
    pushUndo();
    setStatus(targets.filter((tid) => !isFrame(tid)), b.dataset.status || '');
    closeCtxMenu();
  }));

  menu.querySelectorAll('.cm-pos button').forEach((b) => b.addEventListener('click', () => {
    setTitlePos(targets[0], b.dataset.tp);
    closeCtxMenu();
  }));

  menu.querySelectorAll('.cm-item').forEach((b) => b.addEventListener('click', () => {
    const act = b.dataset.act;
    closeCtxMenu();
    switch (act) {
      case 'icon': openIconPicker(targets[0]); break;
      case 'editPic': editPicture(targets[0]); break;
      case 'replacePic': replacePicture(targets[0]); break;
      case 'newNoteHere': addNote(worldPt); break;
      case 'edit': { const n = state.notes.find((x) => x.id === targets[0]); if (n) enterEdit(n); break; }
      case 'link': startLinking(targets[0]); break;
      case 'rename': renameFrame(targets[0]); break;
      case 'selectInside': { const f = state.frames.find((x) => x.id === targets[0]); if (f) setSelection(notesInFrame(f).map((n) => n.id), false); break; }
      case 'flyHere': { const f = state.frames.find((x) => x.id === targets[0]); if (f) fitTo([f]); break; }
      case 'group': groupSelection(); break;
      case 'dup': duplicate(targets); break;
      case 'cut': copySelection(true); break;
      case 'focus': { const it = itemById(targets[0]); if (it) setColourFocus(it.color || 'default'); break; }
      case 'focusStatus': { const n1 = state.notes.find((x) => x.id === targets[0]); if (n1) setStatusFocus(n1.status || ''); break; }
      case 'remind': openRemindDialog(targets[0]); break;
      case 'tpl': openTemplateDialog(targets[0]); break;
      case 'hist': openHistory(targets[0]); break;
      case 'whereFile': revealFile(firstFileUrl(state.notes.find((x) => x.id === targets[0]))); break;
      case 'front': pushUndo(); targets.forEach(bringToFront); saveSoon(); break;
      case 'back': pushUndo(); targets.forEach(sendToBack); saveSoon(); break;
      case 'del': askThenDelete(targets); break;
      case 'arrGrid': arrangeSelection('grid'); break;
      case 'arrRow': arrangeSelection('row'); break;
      case 'arrCol': arrangeSelection('column'); break;
      case 'putBack': putBack(targets); break;
      case 'emptyTrash': emptyTrash(); break;
      case 'boardFiles': openBoardFiles(); break;
      case 'newNote': addNote(worldPt); break;
      case 'newFrame': addFrame(worldPt); break;
      case 'paste': pasteClipboard(worldPt); break;
      case 'selectAll': selectAll(); break;
      case 'fit': zoomToFitAll(); break;
      case 'reset': resetZoom(); break;
      case 'undo': undo(); break;
      case 'redo': redo(); break;
    }
  }));
}

/* ─────────────── 13. compass — off-screen workflows ─────────────── */
let compassPending = false;
function scheduleCompass() {
  if (compassPending) return;
  compassPending = true;
  requestAnimationFrame(() => { compassPending = false; drawCompass(); });
}

/* Signposts for workflows that are off-screen. These are re-positioned on
   every animation frame while panning, so the elements are REUSED rather than
   re-created — rebuilding the markup restarts each chip's fade-in animation
   and they stay invisible for as long as the view keeps moving. */
const chipEls = new Map();   // frame id -> chip element

function drawCompass() {
  const wrap = $('compass');
  if (!wrap) return;
  /* Focus mode hides the signposts, and this runs on every pan and zoom — so it
     is worth not building chips nobody will see. Same early return the compass
     switch takes, for the same reason. */
  if (!state.settings.compass || state.settings.focusMode || !state.frames.length) {
    if (chipEls.size) { wrap.innerHTML = ''; chipEls.clear(); }
    return;
  }
  const r = vpRect();
  const W = r.width, H = r.height;
  const pad = 58;
  const cx = W / 2, cy = H / 2;
  const chips = [];

  state.frames.forEach((f) => {
    const a = toScreen(f.x, f.y);
    const b = toScreen(f.x + f.w, f.y + f.h);
    const visible = a.x < W - 4 && b.x > 4 && a.y < H - 4 && b.y > 4;
    if (visible) return;
    const fc = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dx = fc.x - cx, dy = fc.y - cy;
    if (!dx && !dy) return;
    // walk out from the centre until we hit the padded viewport border
    const halfW = W / 2 - pad, halfH = H / 2 - pad;
    const tx = halfW / Math.abs(dx || 1e-6);
    const ty = halfH / Math.abs(dy || 1e-6);
    const t = Math.min(tx, ty);
    const px = cx + dx * t, py = cy + dy * t;
    const dist = Math.hypot(dx, dy) / Math.max(state.view.z, 0.001);
    const arrow = arrowFor(dx, dy);
    /* Which border the walk actually landed on. `tx` winning means it ran out
       of width first, so this chip is pinned to the left or right edge and can
       only be nudged up and down; `ty` means top or bottom, and it slides
       sideways. spreadChips() needs this — a chip nudged off its own edge stops
       pointing at its workflow. */
    chips.push({ f, px, py, dist, arrow, edge: tx <= ty ? 'x' : 'y' });
  });

  chips.sort((a, b) => a.dist - b.dist);
  const shown = chips.slice(0, 8);
  const reserved = shown.length ? chromeRects() : [];   // measured once, not per chip

  // retire chips for workflows that came back into view
  const keep = new Set(shown.map((c) => c.f.id));
  chipEls.forEach((el, id) => { if (!keep.has(id)) { el.remove(); chipEls.delete(id); } });

  shown.forEach((c) => {
    let el = chipEls.get(c.f.id);
    if (!el) {
      el = document.createElement('button');
      el.className = 'cp-chip';
      el.innerHTML = '<span class="cp-dot"></span><span class="cp-name"></span><span class="cp-arrow"></span>';
      el._icon = null;
      el.addEventListener('click', () => {
        const f = state.frames.find((x) => x.id === el.dataset.id);
        if (f) { fitTo([f], 90, 1); setSelection([f.id], false); }
      });
      wrap.appendChild(el);
      chipEls.set(c.f.id, el);
    }
    el.dataset.id = c.f.id;
    el.dataset.color = c.f.color;
    const key = (c.f.icon || '') + '|' + (c.f.iconColor || '');
    if (el._icon !== key) {
      el._icon = key;
      const dot = el.querySelector('.cp-dot');
      dot.innerHTML = c.f.icon ? icon(c.f.icon) : '';
      dot.classList.toggle('has-icon', !!c.f.icon);
      dot.style.color = iconColorVar(c.f.iconColor);
      el._hw = 0;
    }
    const nm = el.querySelector('.cp-name');
    if (nm.textContent !== c.f.title) {
      nm.textContent = c.f.title;
      el.title = t('compass.jump', { name: c.f.title });
      el._hw = 0;                       // width changed, re-measure
    }
    // diff, never re-render: rebuilding the svg every frame restarts the chip's
    // fade-in, so the signposts stay invisible while the view keeps moving
    if (el._arrow !== c.arrow) {
      el._arrow = c.arrow;
      el.querySelector('.cp-arrow').innerHTML = icon(c.arrow);
    }
    el.classList.toggle('cp-far', c.dist > 4000);
    if (!el._hw) { el._hw = el.offsetWidth / 2 + 10; el._hh = el.offsetHeight / 2 + 8; }
    c.el = el;
    c.hw = el._hw;
    c.hh = el._hh;
    // chips are centred on their own position, so keep half a chip clear of
    // each edge or a long workflow name hangs off the window
    c.left = clamp(c.px, c.hw, Math.max(c.hw, W - c.hw));
    c.top = clamp(c.py, c.hh, Math.max(c.hh, H - c.hh));
  });

  spreadChips(shown, W, H);

  shown.forEach((c) => {
    if (!c.el) return;
    c.el.style.left = c.left + 'px';
    c.el.style.top = clearOfChrome(c.left, c.top, c.hw, c.hh, reserved, H) + 'px';
  });
}

/* Push signposts apart so two workflows in roughly the same direction do not
   land on top of each other.

   Without this, three workflows off to the right produced three chips stacked
   at the same point on the right edge: you saw the topmost one, the other two
   were unreadable and unclickable, and there was nothing to say they existed.

   Each chip may only slide **along the border it is pinned to** — a chip on the
   right edge moves vertically, one on the bottom edge moves horizontally.
   Moving it the other way would take it off its edge and it would stop pointing
   at its workflow, which is the entire job of a signpost.

   So: group by which of the four borders a chip sits on, then lay each group
   out in one dimension. Chips are placed in the order they already wanted to be
   in, spaced by at least their own size, and the whole run is re-centred on
   where it wanted to sit — so two chips open symmetrically around their shared
   direction instead of one staying put and the other being shoved. A run longer
   than the border gets packed to fit rather than pushed off the end. */
function spreadChips(chips, W, H) {
  if (chips.length < 2) return;
  const GAP = 6;

  const groups = new Map();
  chips.forEach((c) => {
    if (!c.el) return;
    // 'x' chips sit on the left or right border, 'y' on the top or bottom
    const side = c.edge === 'x' ? (c.left < W / 2 ? 'L' : 'R') : (c.top < H / 2 ? 'T' : 'B');
    if (!groups.has(side)) groups.set(side, []);
    groups.get(side).push(c);
  });

  groups.forEach((group, side) => {
    if (group.length < 2) return;
    const vertical = side === 'L' || side === 'R';
    const pos = (c) => (vertical ? c.top : c.left);
    const half = (c) => (vertical ? c.hh : c.hw);
    const limit = vertical ? H : W;

    group.sort((a, b) => pos(a) - pos(b));

    // walk forwards, opening a gap wherever two would touch
    let cursor = -Infinity;
    group.forEach((c) => {
      const want = Math.max(pos(c), cursor + half(c) + GAP);
      if (vertical) c.top = want; else c.left = want;
      cursor = want + half(c);
    });

    /* Recentre the run on where it originally wanted to be, then clamp. Without
       this the first chip never moves and every later one is pushed down, so a
       pair that both wanted the middle of an edge ends up sitting below it. */
    const first = group[0], last = group[group.length - 1];
    const runStart = pos(first) - half(first);
    const runEnd = pos(last) + half(last);
    const runLen = runEnd - runStart;
    const wantedMid = group.reduce((sum, c) => sum + (vertical ? c.py : c.px), 0) / group.length;
    let shift = clamp(wantedMid, runLen / 2, Math.max(runLen / 2, limit - runLen / 2)) - (runStart + runLen / 2);
    // a run too long for the border is pinned to its start instead of centred
    if (runLen >= limit) shift = -runStart;

    group.forEach((c) => {
      if (vertical) c.top = clamp(c.top + shift, c.hh, Math.max(c.hh, H - c.hh));
      else c.left = clamp(c.left + shift, c.hw, Math.max(c.hw, W - c.hw));
    });
  });
}

/* The corner controls the compass must not hide behind.

   The zoom bar sits at z-index 45 and #compass at 42, so a workflow off-screen
   to the bottom-right put its signpost *underneath* the zoom bar: you could see
   the name poking out, and clicking it pressed a zoom button instead. Same
   corner, same problem, for the create dial bottom-left.

   Measured rather than hard-coded, because both controls change size with the
   text-size setting and the zoom bar's width changes with the language's
   digits. Returned in viewport coordinates to match the chip positions. */
function chromeRects() {
  const r = vpRect();
  const out = [];
  ['zoombar', 'fabWrap'].forEach((id) => {
    const el = $(id);
    if (!el || el.offsetParent === null) return;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) return;
    out.push({ x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height });
  });
  return out;
}

/* Slide a chip up until it is clear of the controls, or back down below them if
   there is more room that way — a tall enough window has space above, a short
   one may not. Vertical only: the chip's horizontal position is what says which
   direction the workflow is in, and moving it sideways would point a signpost
   at the wrong place, which is worse than overlapping. */
function clearOfChrome(left, top, hw, hh, rects, H) {
  const GAP = 8;
  for (const b of rects) {
    const hits = left + hw > b.x && left - hw < b.x + b.w &&
                 top + hh > b.y && top - hh < b.y + b.h;
    if (!hits) continue;
    const above = b.y - GAP - hh;
    const below = b.y + b.h + GAP + hh;
    top = (above >= hh) ? above : (below <= H - hh ? below : above);
  }
  return top;
}
/* Eight compass points, in Material Symbols rather than the arrow characters
   this used to use — those came out of whichever font happened to have them,
   so their weight never matched the rest of the chip.

   Kept as one named table because tools/check-icons.js reads it: these are the
   only glyph names in the app that reach icon() through a variable, and a
   checker that had to understand the branching would have to guess. */
const COMPASS_ARROWS = [
  'arrow_forward', 'south_east', 'arrow_downward', 'south_west',
  'arrow_back', 'north_west', 'arrow_upward', 'north_east'
];
function arrowFor(dx, dy) {
  // atan2 gives -180…180 with 0 pointing right; shift by half a sector so the
  // rounding lands each direction in the middle of its 45° slice
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  return COMPASS_ARROWS[Math.round(((a + 360) % 360) / 45) % 8];
}
