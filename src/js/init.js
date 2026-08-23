/* Mental Board — init.js
   Pointer routing, the keyboard map, init(), and STATIC_ICONS — every listener in one place.

   Part 15 of 15. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 16. pointer routing, keyboard, init ─────────────── */
function onPointerDown(e) {
  closeCtxMenu();
  // clicking away from the paste menu means "plain text, thanks"
  if (pasteCtx && !e.target.closest('#pasteMenu')) applyPasteAs('text');
  if ($('hilitePop')) $('hilitePop').classList.remove('open');
  if (e.button === 2) return;                        // handled by contextmenu

  // Buttons inside a note handle themselves. They must bail out BEFORE any
  // gesture starts: beginMove() takes pointer capture on the viewport, which
  // retargets the following click away from the button and swallows it.
  if (e.target.closest('.nh-btn, .ft-icon, .note-icon')) return;

  /* A link in note text is a button too, and it was losing its click to exactly
     the same capture. Pressing on a note that is not being edited went straight
     to beginMove(), the viewport captured the pointer, and the `click` handler
     bound to .note-body never fired — so a URL in a closed note simply did
     nothing when you clicked it, which is the one thing a link has to do.

     Only when the note is closed: inside an open editor a click on a link has
     to place the caret instead, and Ctrl+click is the escape hatch there. The
     embed's own controls take the same exit, or pressing play would drag the
     note across the board. */
  const liveLink = e.target.closest('a[href], a.mb-board, .mb-embed');
  if (liveLink && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
    const host = liveLink.closest('.note');
    if (host && !host.classList.contains('editing')) return;
  }

  const noteEl = e.target.closest('.note');
  const frameTitle = e.target.closest('.frame-title');
  const frameEl = e.target.closest('.frame');
  const rz = e.target.closest('.rz');

  // link mode swallows the click
  if (linkFrom) {
    if (noteEl) { finishLinking(noteEl.dataset.id); e.preventDefault(); return; }
    cancelLinking();
    return;
  }

  // middle mouse / space / alt = pan, wherever you click
  if (e.button === 1 || spaceHeld || e.altKey) { e.preventDefault(); beginPan(e); return; }
  if (e.button !== 0) return;

  if (rz) {
    const host = rz.closest('.note, .frame');
    if (host) { e.preventDefault(); beginResize(e, host.dataset.id, rz.dataset.rz); return; }
  }

  if (frameTitle && frameTitle.classList.contains('renaming')) return;   // let the caret work

  if (noteEl) {
    const id = noteEl.dataset.id;
    const inBody = e.target.closest('.note-body');
    if (noteEl.classList.contains('editing') && inBody) return;   // let the caret work
    if (e.shiftKey) { toggleSelection(id); return; }
    if (editing && editNote && editNote.id !== id) exitEdit();
    e.preventDefault();
    beginMove(e, id);
    return;
  }

  if (frameTitle && frameEl) {
    const id = frameEl.dataset.id;
    if (e.shiftKey) { toggleSelection(id); return; }
    if (editing) exitEdit();
    e.preventDefault();
    beginMove(e, id);
    return;
  }

  // empty canvas -> lasso
  if (editing) exitEdit();
  gesture = { kind: 'marquee', sx: e.clientX, sy: e.clientY, base: e.shiftKey ? [...selection] : [] };
  if (!e.shiftKey) clearSelection();
  captureGesture(e);
}

/* `e.target` lies here. The first click of a double-click starts a move
   gesture, which takes pointer capture on the viewport — and capture retargets
   every following mouse event, including this one, to the capturing element.
   Reading it would say "empty canvas" and make a new note on top of the note
   you were trying to edit. Ask the document what is actually under the cursor
   instead. */
function hitAt(e) { return document.elementFromPoint(e.clientX, e.clientY) || e.target; }

function onDblClick(e) {
  const hit = hitAt(e);
  // Rename is handled here rather than on the title element itself: dragging
  // the title takes pointer capture, so a listener bound to the title never
  // sees the double-click.
  const ft = hit.closest('.frame-title');
  if (ft) {
    const fe = ft.closest('.frame');
    if (fe) renameFrame(fe.dataset.id);
    return;
  }
  const noteEl = hit.closest('.note');
  if (noteEl) {
    const n = state.notes.find((x) => x.id === noteEl.dataset.id);
    if (n) enterEdit(n);
    return;
  }
  if (hit.closest('.rz')) return;
  addNote(toWorld(e.clientX, e.clientY));
}

// topmost frame whose box contains this world point (smallest wins, so an
// inner workflow beats the big one around it)
function frameAt(worldPt) {
  let best = null;
  state.frames.forEach((f) => {
    if (worldPt.x < f.x || worldPt.x > f.x + f.w || worldPt.y < f.y || worldPt.y > f.y + f.h) return;
    if (!best || f.w * f.h < best.w * best.h) best = f;
  });
  return best;
}

function onContextMenu(e) {
  e.preventDefault();
  const hit = hitAt(e);
  const noteEl = hit.closest('.note');
  if (noteEl) { openCtxMenu(e.clientX, e.clientY, noteEl.dataset.id); return; }
  // frames are pointer-events:none so a lasso can reach through them — hit-test
  // them by geometry instead, which also makes their whole area right-clickable
  const f = frameAt(toWorld(e.clientX, e.clientY));
  openCtxMenu(e.clientX, e.clientY, f ? f.id : null);
}

function onKeyDown(e) {
  const typing = e.target.closest('input, textarea, [contenteditable="true"]');

  if (e.key === 'Escape') {
    if (!$('studio').classList.contains('hidden')) { closeStudio(); return; }
    if (!$('iconPicker').classList.contains('hidden')) { closeIconPicker(); return; }
    if (!$('confirmDlg').classList.contains('hidden')) { endConfirm(false); return; }
    if (!$('linkDlg').classList.contains('hidden')) { closeLinkDialog(); return; }
    if (!$('tplDlg').classList.contains('hidden')) { closeTemplateDialog(); return; }
    if (!$('settings').classList.contains('hidden')) { closeSettings(); return; }
    if (!$('ctxMenu').classList.contains('hidden')) { closeCtxMenu(); return; }
    if (!$('boardMenu').classList.contains('hidden')) { closeBoardMenu(); return; }
    // a latched boards window closes before anything on the canvas does
    if (document.body.classList.contains('rail-open')) { holdRail(false); return; }
    if (palette.open) { closePalette(); return; }
    if (!$('capture').classList.contains('hidden')) { closeCapture(); return; }
    if (!$('passDlg').classList.contains('hidden')) { cancelPass(); return; }
    if (!$('remindDlg').classList.contains('hidden')) { $('remindDlg').classList.add('hidden'); return; }
    if (!$('histDlg').classList.contains('hidden')) { $('histDlg').classList.add('hidden'); return; }
    if (!$('boardPick').classList.contains('hidden')) { $('boardPick').classList.add('hidden'); return; }
    if (focusKind) { clearFocus(); return; }
    if (slash.open) { closeSlash(); return; }
    if (selImg) { clearImageSel(); return; }
    if (linkFrom) { cancelLinking(); return; }
    if (!$('findBar').classList.contains('hidden')) { closeFind(); return; }
    if (editing) { exitEdit(); return; }
    if (selection.size) { clearSelection(); return; }
    document.body.classList.remove('fab-open');
    return;
  }

  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); return; }
  // Ctrl+P works while typing too — jumping somewhere else is a thing you do
  // mid-sentence, and nothing in a note needs that chord
  if (ctrl && e.key.toLowerCase() === 'p') { e.preventDefault(); openPalette(); return; }

  if (typing) return;   // everything below is canvas-level

  // after the `typing` guard, so Ctrl+B stays bold inside a note
  if (ctrl && e.key.toLowerCase() === 'b') { e.preventDefault(); toggleBoardWindow(); return; }

  if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); return; }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); if (selection.size) duplicate([...selection]); return; }
  /* Ctrl+Shift+G, not Ctrl+R: Ctrl+R reloads the window and that is how this
     app is developed. Group and arrange are the two things you do to a
     selection of several, so they share a letter and differ by Shift. */
  if (ctrl && e.shiftKey && e.key.toLowerCase() === 'g') { e.preventDefault(); arrangeSelection('grid'); return; }
  if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); groupSelection(); return; }
  if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(false); return; }
  if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); copySelection(true); return; }
  if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
  if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); flushSave(); toast(t('msg.saved')); return; }
  if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomCentre(1.2); return; }
  if (ctrl && e.key === '-') { e.preventDefault(); zoomCentre(1 / 1.2); return; }
  if (ctrl && e.key === '0') { e.preventDefault(); resetZoom(); return; }
  if (e.key === '!' || (e.shiftKey && e.key === '1')) { e.preventDefault(); zoomToFitAll(); return; }

  if (e.key === ' ' && !spaceHeld) { spaceHeld = true; $('viewport').classList.add('pan-ready'); e.preventDefault(); return; }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection.size) { e.preventDefault(); pushUndo(); deleteItems([...selection]); }
    return;
  }
  if (e.key === 'Enter' && selection.size === 1) {
    const n = state.notes.find((x) => x.id === [...selection][0]);
    if (n) { e.preventDefault(); enterEdit(n); }
    return;
  }
  if (e.key.startsWith('Arrow') && selection.size) {
    e.preventDefault();
    const step = e.shiftKey ? gridStep() * 4 : (state.settings.snap ? gridStep() : 2);
    const dx = (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0);
    const dy = (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0);
    const nudging = selectedItems();
    pushUndoGeom(nudging);
    nudging.forEach((it) => {
      it.x += dx; it.y += dy;
      const el = els.get(it.id);
      if (el) { el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    });
    drawLinks(); refreshFrameCounts(); scheduleCompass(); saveSoon();
    return;
  }

  const k = e.key.toLowerCase();
  if (k === 'n') { e.preventDefault(); addNote(); return; }
  if (k === 'g') { e.preventDefault(); selection.size ? groupSelection() : addFrame(); return; }
  if (k === 'l') {
    const one = [...selection].find((id) => !isFrame(id));
    if (one) { e.preventDefault(); startLinking(one); }
    return;
  }
}

function onKeyUp(e) {
  if (e.key === ' ') { spaceHeld = false; $('viewport').classList.remove('pan-ready'); }
}

/* --- canvas-level image drop ------------------------------------------- */
function onCanvasDrop(e) {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  e.preventDefault();
  if (/^image\//.test(f.type)) {
    const pt = toWorld(e.clientX, e.clientY);
    const url = FILES && FILES.toUrl ? FILES.toUrl(f) : null;
    if (url) { addNote(pt, { body: `<img class="mb-img" src="${esc(url)}"><p><br></p>`, edit: false }); return; }
    const r = new FileReader();
    r.onload = () => addNote(pt, { body: `<img class="mb-img" src="${r.result}"><p><br></p>`, edit: false });
    r.readAsDataURL(f);
    return;
  }
  if (/^text\//.test(f.type) || /\.(txt|md)$/i.test(f.name)) {
    const pt = toWorld(e.clientX, e.clientY);
    const r = new FileReader();
    r.onload = () => addNote(pt, { body: `<p>${esc(String(r.result)).replace(/\n/g, '<br>')}</p>`, edit: false });
    r.readAsText(f);
    return;
  }

  /* Anything else — a spreadsheet, a PDF, a deck — becomes a note that links to
     it where it already lives. It used to be dropped silently, which for anyone
     whose work is *about* documents made the canvas look like it did not want
     them. Deliberately a link and not a copy: the file stays where the rest of
     your filing expects it, the board file stays small, and a note about a
     model that quietly held a stale copy of the model would be worse than no
     note at all. */
  const pt2 = toWorld(e.clientX, e.clientY);
  const p = FILES && FILES.pathOf ? FILES.pathOf(f) : '';
  if (!p) { toast(t('msg.dropNeedsDesktop')); return; }
  const href = toLinkHref(p);
  const n = addNote(pt2, {
    body: `<p>${icon('description')}<a href="${esc(href)}">${esc(f.name)}</a></p>`,
    icon: 'description', w: 320, h: 150, edit: false
  });
  if (n) toast(t('msg.fileLinked', { name: f.name }));
}

/* --- link ghost while roping ------------------------------------------- */
function onMouseMoveGhost(e) {
  if (!linkFrom) return;
  const n = state.notes.find((x) => x.id === linkFrom);
  if (!n) return;
  const r = vpRect();
  const a = toScreen(n.x + n.w / 2, n.y + n.h / 2);
  const bx = e.clientX - r.left, by = e.clientY - r.top;
  const k = clamp(Math.abs(bx - a.x) * 0.45, 30, 200);
  $('linkGhostPath').setAttribute('d', `M ${a.x} ${a.y} C ${a.x + k} ${a.y}, ${bx - k} ${by}, ${bx} ${by}`);
  $('linkGhost').classList.remove('hidden');
  const over = e.target.closest && e.target.closest('.note');
  document.querySelectorAll('.note.link-target').forEach((el) => el.classList.remove('link-target'));
  if (over && over.dataset.id !== linkFrom) over.classList.add('link-target');
}

/* ─────────────── init ─────────────── */
function init() {
  document.execCommand('defaultParagraphSeparator', false, 'p');

  load();
  systemDark = mql.matches;
  // language first: render() bakes translated titles into every note and frame
  setLang(state.settings.lang);
  applyStaticText();
  paintVersion();
  applySettings();
  render();

  /* Windows changed its mind about light or dark.

     The guard is `themeMode`, not `theme`. `theme` is the id of a *palette* —
     'dark', 'paper', 'ocean' — and adopt() guarantees it is one of THEMES, so
     `state.settings.theme === 'system'` (what both of these used to test) was
     false on every board ever written. The two handlers updated `systemDark`
     and then repainted nothing, so in the default configuration the app simply
     did not follow Windows: switching the OS to light left it dark until some
     unrelated action happened to call applyTheme(). startThemeClock() does not
     rescue it either — that returns early unless the mode is 'clock'.

     No THEME.set() here. applySettings() above has already run applyTheme(),
     which tells the OS chrome the mode it actually resolved to; calling
     THEME.set(state.settings.theme) afterwards handed main a palette id, and
     main only understands 'dark' | 'light' | 'system' — so every theme that is
     not literally called "dark" or "light" (Paper, Ocean, Midnight…) fell
     through to 'system' and undid the correct value one line later. */
  const onSystemTheme = (dark) => {
    if (dark === systemDark) return;
    systemDark = dark;
    if (state.settings.themeMode !== 'system') return;
    applyTheme();
    // only if it is on screen — syncSettingsUI() walks every board to count words
    if (!$('settings').classList.contains('hidden')) syncSettingsUI();
  };
  if (THEME) THEME.onSystemChange(onSystemTheme);
  mql.addEventListener('change', (e) => onSystemTheme(e.matches));

  const vp = $('viewport');
  vp.addEventListener('pointerdown', onPointerDown);
  vp.addEventListener('dblclick', onDblClick);
  vp.addEventListener('contextmenu', onContextMenu);
  vp.addEventListener('wheel', onWheel, { passive: false });
  vp.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  vp.addEventListener('drop', onCanvasDrop);
  vp.addEventListener('mousemove', onMouseMoveGhost);
  /* On the document, not the viewport: the pointer has to keep the launcher up
     while it is over the launcher and the flyout themselves, and those are
     fixed-position chrome outside #viewport. */
  document.addEventListener('pointermove', trackRailPeek, { passive: true });
  document.addEventListener('pointermove', trackCanvasPoint, { passive: true });
  document.addEventListener('pointerleave', () => setPeek(false));

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', () => { applyView(); if (editing) hideSelBar(); });
  window.addEventListener('blur', () => { spaceHeld = false; vp.classList.remove('pan-ready'); });
  document.addEventListener('selectionchange', () => {
    if (!editing) { hideTableBar(); hideColsBar(); return; }
    showSelBar();
    showTableBar();
    showColsBar();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#ctxMenu')) closeCtxMenu();
    if (!e.target.closest('#boardMenu') && !e.target.closest('.br-tile')) closeBoardMenu();
    /* A latched flyout has to let go when you click past it, or it sits over the
       canvas until you happen to click the launcher again. Renaming is the
       exception — that click is how you put the caret in the name. */
    if (!e.target.closest('#boardRail') && !e.target.closest('#boardMenu') &&
        !document.querySelector('.br-name[contenteditable]')) holdRail(false);
    if (!e.target.closest('#slashMenu') && !e.target.closest('.note-body')) closeSlash();
    if (!e.target.closest('#selBar') && !e.target.closest('.note-body')) hideSelBar();
    if (!e.target.closest('#fabWrap')) document.body.classList.remove('fab-open');
  }, true);
  window.addEventListener('beforeunload', () => { if (editing && editNote) editNote.body = bodyHtml(editing); flushSave(); save(); });

  /* Ctrl+V anywhere that is not a text field. Screenshot, click the board,
     paste — a note with the picture in it, sized to the picture.

     On `document` rather than on the viewport because a paste goes to whatever
     has focus, and after a click on empty canvas that is the body. Anything
     with its own idea of paste bails out first: the note editor has a handler
     of its own, and an input or a contenteditable is text the user is typing
     into. Nothing here touches the internal notes clipboard — if there is no
     image, this listener does nothing and Ctrl+V means what it always did. */
  document.addEventListener('paste', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return;
    if (editing) return;
    if (!$('settings').classList.contains('hidden')) return;
    pasteAnything(e, lastCanvasPoint || viewCenterWorld());
  });

  // titlebar
  $('btnMin').addEventListener('click', () => WIN && WIN.minimize());
  $('btnMax').addEventListener('click', () => WIN && WIN.toggleMaximize());
  $('btnClose').addEventListener('click', () => { flushSave(); save(); WIN && WIN.close(); });
  $('btnSettings').addEventListener('click', openSettings);

  // The + button makes a note straight away; hovering it fans out the rest of
  // the dial, so the common case stays one click.
  let fabTimer = null;
  const fabWrap = $('fabWrap');
  fabWrap.addEventListener('mouseenter', () => {
    clearTimeout(fabTimer);
    fabTimer = setTimeout(() => document.body.classList.add('fab-open'), 320);
  });
  fabWrap.addEventListener('mouseleave', () => {
    clearTimeout(fabTimer);
    document.body.classList.remove('fab-open');
  });
  $('fab').addEventListener('click', (e) => {
    e.stopPropagation();
    clearTimeout(fabTimer);
    document.body.classList.remove('fab-open');
    addNote();
  });
  $('fabMenu').querySelectorAll('.fab-item').forEach((b) => b.addEventListener('click', () => {
    document.body.classList.remove('fab-open');
    const what = b.dataset.new;
    if (what === 'note') addNote();
    if (what === 'frame') selection.size ? groupSelection() : addFrame();
    if (what === 'link') {
      const one = [...selection].find((id) => !isFrame(id)) || (state.notes[0] && state.notes[0].id);
      if (one) startLinking(one); else toast(t('msg.addNotesFirst'));
    }
  }));

  // zoom bar
  $('zIn').addEventListener('click', () => zoomCentre(1.2));
  $('zOut').addEventListener('click', () => zoomCentre(1 / 1.2));
  $('zLevel').addEventListener('click', resetZoom);
  $('zFit').addEventListener('click', zoomToFitAll);

  // settings
  $('settingsClose').addEventListener('click', closeSettings);
  $('settings').addEventListener('pointerdown', (e) => { if (e.target === $('settings')) closeSettings(); });
  buildThemeGrid();
  buildLangPicker();
  $('setLang').addEventListener('change', () => {
    state.settings.lang = $('setLang').value;
    applyLang();
    saveSoon();
  });
  wireSetTabs();

  /* What picks the theme. `matchSystem` is kept in step because it is still
     what an older build reads out of the file — the two are one setting
     wearing two names, and only one of them is ever authoritative. */
  $('themeModeSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    state.settings.themeMode = THEME_MODES.includes(m) ? m : 'fixed';
    state.settings.matchSystem = state.settings.themeMode === 'system';
    clockTheme = null;
    applyTheme(); syncSettingsUI(); saveSoon();
  }));
  /* Picking your day theme or your night theme.

     `applyTheme()` straight after, so the choice shows the moment it is made if
     that slot is the one currently in force — and does nothing visible if it is
     not, which is the honest answer for "set my night theme at two in the
     afternoon". Deliberately does NOT touch `themeMode`: these pickers exist
     *because* you are in a paired mode, so dropping you out of it would undo
     the thing you came here to set up. That is the opposite of pickTheme(),
     which is an explicit "show me this one now". */
  const pairChanged = (which) => () => {
    const id = $(which === 'light' ? 'setLightTheme' : 'setDarkTheme').value;
    if (!THEMES.some((th) => th.id === id)) return;
    state.settings[which === 'light' ? 'lightTheme' : 'darkTheme'] = id;
    clockTheme = null;               // re-evaluate on the next tick
    applyTheme(); syncSettingsUI(); saveSoon();
  };
  $('setLightTheme').addEventListener('change', pairChanged('light'));
  $('setDarkTheme').addEventListener('change', pairChanged('dark'));

  const clockChanged = () => {
    const s = state.settings;
    s.dayAt = okClock($('setDayAt').value, s.dayAt);
    s.nightAt = okClock($('setNightAt').value, s.nightAt);
    clockTheme = null;
    applyTheme(); syncSettingsUI(); saveSoon();
  };
  $('setDayAt').addEventListener('change', clockChanged);
  $('setNightAt').addEventListener('change', clockChanged);

  /* The custom palette. Live on `input` rather than `change`, because the whole
     point of three colour pickers is watching the app become the thing you are
     choosing — committing only on close would make it guesswork. */
  const ctChanged = () => {
    const s = state.settings;
    s.customTheme = {
      mode: s.customTheme.mode,
      bg: isHex($('ctBg').value) ? $('ctBg').value : s.customTheme.bg,
      surface: isHex($('ctSurface').value) ? $('ctSurface').value : s.customTheme.surface,
      text: isHex($('ctText').value) ? $('ctText').value : s.customTheme.text
    };
    applyTheme(); saveSoon();
  };
  ['ctBg', 'ctSurface', 'ctText'].forEach((id) => $(id).addEventListener('input', ctChanged));
  $('ctModeSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.customTheme.mode = b.dataset.ctmode === 'light' ? 'light' : 'dark';
    applyTheme(); syncSettingsUI(); saveSoon();
  }));
  /* Start from what is on screen. Building a palette from three arbitrary
     colours is a blank page; building one from the theme you already liked is
     an edit, and an edit is something people will actually finish. */
  $('ctFromTheme').addEventListener('click', () => {
    const cs = getComputedStyle(document.documentElement);
    const grab = (v, fb) => { const x = cs.getPropertyValue(v).trim(); return isHex(x) ? x : fb; };
    const cur = resolvedTheme();
    state.settings.customTheme = {
      mode: cur.mode,
      bg: grab('--bg', state.settings.customTheme.bg),
      surface: grab('--surface', state.settings.customTheme.surface),
      text: grab('--text', state.settings.customTheme.text)
    };
    pickTheme('custom');
    toast(t('msg.ctCopied', { name: themeName(cur.id) }));
  });

  // ropes
  buildLinkSwatches();
  $('linkColorPick').addEventListener('input', () => {
    const v = $('linkColorPick').value;
    if (!isHex(v)) return;
    state.settings.linkColor = v;
    applyLinkStyle(); syncSettingsUI(); saveSoon();
  });
  $('linkStyleSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.linkStyle = b.dataset.lks;
    applyLinkStyle(); drawLinks(); syncSettingsUI(); saveSoon();
  }));
  $('linkAnchorSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.linkAnchor = b.dataset.lka;
    drawLinks(); syncSettingsUI(); saveSoon();
  }));
  $('linkWidth').addEventListener('input', () => {
    state.settings.linkWidth = clamp(+$('linkWidth').value || 2, 1, 5);
    $('linkWidthVal').textContent = num(state.settings.linkWidth);
    applyLinkStyle(); saveSoon();
  });
  $('setEmbeds').addEventListener('change', () => {
    state.settings.embeds = $('setEmbeds').checked;
    render(); saveSoon();
  });
  buildGridPicker();
  $('gridSize').addEventListener('input', () => {
    state.settings.gridSize = clamp(+$('gridSize').value || 26, 12, 96);
    $('gridSizeVal').textContent = num(state.settings.gridSize);
    applyView(); saveSoon();
  });
  $('gridFade').addEventListener('input', () => {
    state.settings.gridFade = clamp(+$('gridFade').value || 100, 20, 160);
    $('gridFadeVal').textContent = pct(state.settings.gridFade);
    applySettings(); saveSoon();
  });
  $('wheelSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.wheel = b.dataset.wheel; syncSettingsUI(); saveSoon();
  }));
  $('perfSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.perf = PERF_MODES.includes(b.dataset.perf) ? b.dataset.perf : 'auto';
    /* applySettings() sets the attribute the stylesheet keys off; render()
       because the culling threshold moved, so which notes are mounted may have
       changed even though nothing about the board did. */
    applySettings(); render(); syncSettingsUI(); saveSoon();
  }));
  $('fontScale').addEventListener('input', () => {
    state.settings.fontScale = +$('fontScale').value;
    $('fontScaleVal').textContent = pct(state.settings.fontScale);
    applySettings(); saveSoon();
  });
  $('setSnap').addEventListener('change', () => { state.settings.snap = $('setSnap').checked; saveSoon(); });
  $('setCompass').addEventListener('change', () => { state.settings.compass = $('setCompass').checked; drawCompass(); saveSoon(); });
  $('setSpell').addEventListener('change', () => { state.settings.spell = $('setSpell').checked; applySettings(); saveSoon(); });
  $('btnExport').addEventListener('click', exportBoard);
  $('btnExportImage').addEventListener('click', () => exportBoardImage());
  $('btnOpenTrash').addEventListener('click', () => { const tb = trashOf(); if (tb) { closeSettings(); switchBoard(tb.id); } });
  $('btnEmptyTrash').addEventListener('click', () => emptyTrash());
  $('btnImport').addEventListener('click', importBoard);
  $('btnBackupNow').addEventListener('click', () => backupNow());
  $('btnBackupFolder').addEventListener('click', chooseBackupFolder);
  $('setBackupAuto').addEventListener('change', () => {
    state.settings.backupAuto = $('setBackupAuto').checked;
    saveSoon();
    // turning it on with no folder yet should ask for one, not quietly do nothing
    if (state.settings.backupAuto && !state.settings.backupDir) chooseBackupFolder();
  });
  $('setExportTheme').addEventListener('change', () => {
    state.settings.exportTheme = $('setExportTheme').value;
    syncSettingsUI(); saveSoon();
  });
  $('btnDataFolder').addEventListener('click', () => DATA && DATA.openDataFolder && DATA.openDataFolder());
  $('btnCopyPath').addEventListener('click', async () => {
    const p = $('setPath').textContent || '';
    try { await navigator.clipboard.writeText(p); toast(t('msg.pathCopied')); }
    catch (_) { toast(t('msg.needDesktop')); }
  });
  $('railSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.railMode = b.dataset.rail;
    applySettings(); syncSettingsUI(); saveSoon();
    // choosing "on hover" hides the launcher — show it once so the choice reads
    // as a change rather than as the switcher having been deleted
    flashRail(3200);
  }));
  /* Erase clears the board you are looking at, not the file. Naming it in the
     title matters now that there are several — "Erase this board?" with five in
     the rail is a question you cannot safely answer. */
  $('btnWipe').addEventListener('click', async () => {
    const b = activeBoard();
    const ok = await confirmDlg(t('confirm.wipeTitle', { name: boardLabel(b) }), t('confirm.wipeBody'), t('confirm.wipeOk'));
    if (!ok) return;
    exitEdit();
    pushUndo();
    state.notes = []; state.frames = []; state.links = [];
    render(); drawCompass(); renderBoardRail(); save(); closeSettings(); toast(t('msg.cleared'));
  });
  buildAccentSwatches();
  buildKeyList();

  // link dialog
  $('linkOk').addEventListener('click', applyLink);
  $('linkCancel').addEventListener('click', closeLinkDialog);
  $('linkRemove').addEventListener('click', removeLink);
  $('linkUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLink(); });
  $('linkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyLink(); });

  // confirm dialog
  $('confirmYes').addEventListener('click', () => endConfirm(true));
  $('confirmNo').addEventListener('click', () => endConfirm(false));

  // find bar
  /* Debounced, because a search runs over every note on every board and then
     flies the camera to the first hit. Doing that per keystroke meant the view
     lurched to a different note with every letter of a word — and on a large
     board it also meant the keystroke after it queued behind the search. 130ms
     is below the gap between keystrokes in ordinary typing and well under the
     point where a search bar starts feeling laggy. */
  let findTimer = null;
  $('findInput').addEventListener('input', () => {
    clearTimeout(findTimer);
    findTimer = setTimeout(runFind, 130);
  });
  $('findInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gotoHit(findIdx + (e.shiftKey ? -1 : 1)); }
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); $('viewport').focus(); }
  });
  $('findNext').addEventListener('click', () => gotoHit(findIdx + 1));
  $('findPrev').addEventListener('click', () => gotoHit(findIdx - 1));
  $('findClose').addEventListener('click', closeFind);

  wireSelBar();
  wireImgBar();
  wireTableBar();
  wireColsBar();
  wireExtras();
  paintStaticIcons();

  // icon picker
  $('iconClose').addEventListener('click', closeIconPicker);
  $('iconPicker').addEventListener('pointerdown', (e) => { if (e.target === $('iconPicker')) closeIconPicker(); });
  $('iconSearch').addEventListener('input', () => buildIconGrid($('iconSearch').value));
  $('iconSearch').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') closeIconPicker();
  });
  $('iconRemove').addEventListener('click', () => {
    const it = iconTarget();
    if (!it) return;
    if (!iconTargetIsBoard()) pushUndo();
    it.icon = iconTargetIsBoard() ? 'sticky_note_2' : '';
    commitIconChange();
    closeIconPicker();
  });

  // image studio
  $('studioClose').addEventListener('click', closeStudio);
  $('stCancel').addEventListener('click', closeStudio);
  $('stApply').addEventListener('click', applyStudio);
  $('stRotate').addEventListener('click', rotateStudio);
  $('stReset').addEventListener('click', () => {
    if (!ST.img) return;
    ST.marks = []; ST.crop = { x: 0, y: 0, w: ST.img.naturalWidth, h: ST.img.naturalHeight };
    drawStudio();
  });
  $('stTools').querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
    ST.tool = b.dataset.tool; buildStudioChrome(); drawStudio();
  }));
  $('stWeight').addEventListener('input', () => { ST.weight = +$('stWeight').value; });
  $('stWrap').addEventListener('pointerdown', studioDown);
  window.addEventListener('resize', () => { if (ST.img) fitStudio(); });

  if (WIN && WIN.onMaximized) WIN.onMaximized(() => {});
  $('viewport').focus();
  // the launcher is invisible at rest, so it says hello once and then goes
  flashRail(2800);

  /* Say which build this is, the first time each one runs.
     Without it there is no way from inside the app to tell a new build from the
     old one still being on screen — which is exactly the confusion that made a
     shipped change look like a change that never shipped. Once per version, and
     never again. */
  if (versionChanged && APP_VERSION) {
    setTimeout(() => toast(t('msg.nowRunning', { v: APP_VERSION }), 4200), 700);
    save();                    // record the version so this is genuinely once
  }

  /* A board file exists but would not parse. Saving is already blocked; the
     one thing left that matters is that the user finds out now, from the app,
     rather than discovering it a week later. An empty canvas with no
     explanation looks exactly like "the update deleted my work". */
  if (loadFailed) {
    hint(t('msg.loadFailedShort'));
    const where = (DATA && DATA.paths) ? DATA.paths().userData : '';
    /* The path goes on its own line, not inside the sentence. Threaded through
       RTL prose it wraps mid-path and reorders around the backslashes, which
       makes the one piece of information the user has to act on the hardest
       part to read. #confirmBody keeps line breaks for exactly this. */
    const body = t('confirm.loadFailedBody') + (where ? '\n\n' + where : '');
    confirmDlg(t('confirm.loadFailedTitle'), body, t('confirm.loadFailedOk'), 'safe')
      .then((ok) => { if (ok && DATA && DATA.openDataFolder) DATA.openDataFolder(); });
    return;                      // no welcome note over a board we may recover
  }

  /* Every board is locked, so adopt() had nowhere usable to land and put us on
     a locked one. Ask for the passphrase rather than showing a blank canvas
     that quietly refuses everything typed onto it — an empty board you cannot
     write to and were told nothing about is indistinguishable from a broken
     app. Cancelling is allowed; canEditHere() then explains each refusal. */
  if (isLocked(activeBoard())) {
    const b = activeBoard();
    unlockBoard(b).then((ok) => {
      if (!ok) { hint(t('msg.boardIsLocked')); return; }
      bindBoard(b); clearHistory(); render(); drawCompass(); renderBoardRail(); hint('');
    });
    return;                      // no welcome note over a board we cannot read
  }

  // brand new board? drop a welcome note so the canvas is never a blank stare
  if (!state.notes.length && !state.frames.length) seedWelcome();
  maybeDailyNote();
  maybeAutoBackup();
}

/* Everything added after the first release, wired in one place so init() stays
   readable rather than growing another eighty lines. */
function wireExtras() {
  // ropes: one delegated click for the life of the app, not one per redraw
  wireLinkClicks();

  // save a note as a template
  $('tplCancel').addEventListener('click', closeTemplateDialog);
  $('tplOk').addEventListener('click', submitTemplate);
  $('tplDlg').addEventListener('pointerdown', (e) => { if (e.target === $('tplDlg')) closeTemplateDialog(); });
  $('tplName').addEventListener('keydown', (e) => {
    e.stopPropagation();       // the canvas shortcuts must not see these keys
    if (e.key === 'Enter') { e.preventDefault(); submitTemplate(); }
    if (e.key === 'Escape') { e.preventDefault(); closeTemplateDialog(); }
  });

  // jump palette
  $('palInput').addEventListener('input', renderPalette);
  $('palInput').addEventListener('keydown', (e) => { e.stopPropagation(); paletteKey(e); });
  $('palette').addEventListener('pointerdown', (e) => { if (e.target === $('palette')) closePalette(); });

  // quick capture
  $('capSave').addEventListener('click', saveCapture);
  $('capInput').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeCapture(); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveCapture(); }
  });
  $('capture').addEventListener('pointerdown', (e) => { if (e.target === $('capture')) closeCapture(); });
  if (WIN && WIN.onCapture) WIN.onCapture(() => { if (state.settings.capture) openCapture(); });

  // reminders
  $('remindClose').addEventListener('click', () => $('remindDlg').classList.add('hidden'));
  $('rmSet').addEventListener('click', () => {
    const v = $('rmWhen').value;
    setReminder(v ? new Date(v).getTime() : 0, pickedRepeat());
  });
  $('rmClear').addEventListener('click', () => setReminder(0));
  startReminders();
  startThemeClock();

  // embed a video: /video, and the dialog the paste menu shares a builder with
  $('embedCancel').addEventListener('click', closeEmbedDialog);
  $('embedOk').addEventListener('click', submitEmbed);
  $('embedUrl').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitEmbed(); }
    if (e.key === 'Escape') { e.preventDefault(); closeEmbedDialog(); }
  });
  $('embedDlg').addEventListener('pointerdown', (e) => { if (e.target === $('embedDlg')) closeEmbedDialog(); });

  // note history
  $('histClose').addEventListener('click', () => $('histDlg').classList.add('hidden'));
  $('histDlg').addEventListener('pointerdown', (e) => { if (e.target === $('histDlg')) $('histDlg').classList.add('hidden'); });

  // passphrase
  $('passYes').addEventListener('click', submitPass);
  $('passNo').addEventListener('click', cancelPass);
  $('passCancel').addEventListener('click', cancelPass);
  [$('passOne'), $('passTwo')].forEach((i) => i.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); submitPass(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelPass(); }
  }));

  // board picker for /board
  $('bpClose').addEventListener('click', () => $('boardPick').classList.add('hidden'));
  $('boardPick').addEventListener('pointerdown', (e) => { if (e.target === $('boardPick')) $('boardPick').classList.add('hidden'); });

  // colour focus
  $('focusChip').addEventListener('click', clearFocus);

  /* Note look. All three only ever set a flag and re-apply — no re-render of
     the board is needed, because none of them touch a note's geometry. */
  $('shapeSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.noteShape = b.dataset.shape; applySettings(); syncSettingsUI(); saveSoon();
  }));
  $('densitySeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.noteDensity = b.dataset.density; applySettings(); syncSettingsUI(); saveSoon();
  }));
  $('statusAdd').addEventListener('click', addStatus);
  $('setNoteChrome').addEventListener('change', () => {
    state.settings.noteChrome = $('setNoteChrome').checked;
    applySettings(); saveSoon();
    /* Turning them off hides the only visible way to delete a note or open its
       menu, so say where both went rather than leaving it to be discovered. */
    if (!state.settings.noteChrome) toast(t('set.noteChromeOff'), 5200);
  });

  // settings that arrived with these features
  $('setShowArchived').addEventListener('change', () => {
    state.settings.showArchived = $('setShowArchived').checked;
    renderBoardRail(); saveSoon();
  });
  $('setDaily').addEventListener('change', () => {
    state.settings.daily = $('setDaily').checked;
    // remember which board it belongs to at the moment it is switched on
    if (state.settings.daily && !state.settings.dailyBoard) state.settings.dailyBoard = state.activeBoard;
    syncSettingsUI(); saveSoon();
    if (state.settings.daily) maybeDailyNote();
  });
  $('setDailyBoard').addEventListener('change', () => {
    state.settings.dailyBoard = $('setDailyBoard').value;
    saveSoon();
  });
  $('setCapture').addEventListener('change', () => {
    state.settings.capture = $('setCapture').checked; saveSoon();
  });
  $('btnImportBoard').addEventListener('click', importOneBoard);
}

/* Fill the icons that live in static markup. Keeping the glyph names here
   rather than in index.html means one place to look when an icon is wrong, and
   it keeps index.html to structure only.

   The selector is the element the glyph goes *into*, so anything that also
   carries a translated label puts the label on its own <span> — applyStaticText
   writes textContent, and would otherwise wipe the icon out again. That is why
   the buttons in the sheets are `<span class="b-ic"></span><span data-t=…>`.

   tools/check-icons.js reads this table by name, along with BLOCKS,
   COMPASS_ARROWS and every icon call, and fails the build if a downloaded glyph
   has no home. Add a row here, not a glyph to index.html. */
const STATIC_ICONS = [
  /* titlebar, canvas furniture */
  ['#btnSettings', 'settings'],
  ['#fab', 'add'],
  ['#zOut', 'zoom_out'],
  ['#zIn', 'zoom_in'],
  ['#zFit', 'fit_screen'],

  /* text toolbar */
  ['#selBar [data-cmd="bold"]', 'format_bold'],
  ['#selBar [data-cmd="italic"]', 'format_italic'],
  ['#selBar [data-cmd="underline"]', 'format_underlined'],
  ['#selBar [data-cmd="strikeThrough"]', 'format_strikethrough'],
  ['#selBar [data-act="code"]', 'code'],
  ['#selBar [data-block="h1"]', 'format_h1'],
  ['#selBar [data-block="h2"]', 'format_h2'],
  ['#selBar [data-block="h3"]', 'format_h3'],
  ['#selBar [data-size="down"]', 'text_decrease'],
  ['#selBar [data-size="up"]', 'text_increase'],
  ['#selBar [data-align="left"]', 'format_align_left'],
  ['#selBar [data-align="center"]', 'format_align_center'],
  ['#selBar [data-align="right"]', 'format_align_right'],
  ['#selBar [data-dir="ltr"]', 'format_textdirection_l_to_r'],
  ['#selBar [data-dir="rtl"]', 'format_textdirection_r_to_l'],
  ['#selBar [data-act="hilite"]', 'format_ink_highlighter'],
  ['#selBar [data-act="link"]', 'link'],
  ['#selBar [data-act="clear"]', 'format_clear'],

  /* table toolbar */
  ['#tableBar [data-tb="rowAdd"]', 'add_row_below'],
  ['#tableBar [data-tb="rowDel"] .tb-base', 'table_rows'],
  ['#tableBar [data-tb="rowDel"] .tb-badge', 'close'],
  ['#tableBar [data-tb="colAdd"]', 'add_column_right'],
  ['#tableBar [data-tb="colDel"] .tb-base', 'view_column'],
  ['#tableBar [data-tb="colDel"] .tb-badge', 'close'],
  ['#tableBar [data-tb="sortAsc"]', 'arrow_upward'],
  ['#tableBar [data-tb="sortDesc"]', 'arrow_downward'],
  ['#tableBar [data-tb="del"]', 'delete'],
  ['#colsBar [data-cb="add"]', 'add'],
  ['#colsBar [data-cb="del"]', 'remove'],
  ['#colsBar [data-cb="unwrap"]', 'view_list'],

  /* palette, capture, reminders, history, passphrase, board picker */
  ['#palette .pal-head-ic', 'search'],
  ['#capture .cap-ic', 'bolt'],
  ['#capSave .b-ic', 'add'],
  ['#rmSet .b-ic', 'alarm'],
  ['#rmClear .b-ic', 'alarm_off'],
  ['#remindClose', 'close'],
  ['#histClose', 'close'],
  ['#passCancel', 'close'],
  ['#passNo .b-ic', 'close'],
  ['#passYes .b-ic', 'key'],
  ['#bpClose', 'close'],
  ['#focusChip .fc-x', 'close'],
  ['#btnImportBoard .b-ic', 'archive'],
  ['#btnExportImage .b-ic', 'image'],
  ['label:has([data-t="set.trash"]) .row-ic', 'delete'],
  ['#btnOpenTrash .b-ic', 'open_in_full'],
  ['#btnEmptyTrash .b-ic', 'delete_forever'],
  ['label:has([data-t="set.showArchived"]) .row-ic', 'archive'],
  ['h3:has([data-t="set.habits"]) .sec-ic', 'bolt'],
  ['#setCapture + .row-ic', 'bolt'],
  ['#setBackground + .row-ic', 'restart_alt'],
  ['label:has([data-t="set.backup"]) .row-ic', 'shield'],
  ['#btnBackupNow .b-ic', 'cloud'],
  ['#btnBackupFolder .b-ic', 'folder_open'],
  ['#setBackupAuto + .row-ic', 'schedule'],
  ['label:has([data-t="set.pictureTheme"]) .row-ic', 'image'],
  ['#setExportTheme + .sel-chev', 'expand_more'],
  ['#setDaily + .row-ic', 'today'],
  ['label:has([data-t="set.dailyBoard"]) .row-ic', 'space_dashboard'],
  ['#setDailyBoard + .sel-chev', 'expand_more'],

  /* find bar */
  ['#findBar .fb-ic', 'search'],
  ['#findPrev', 'arrow_upward'],
  ['#findNext', 'arrow_downward'],
  ['#findClose', 'close'],

  /* image toolbar + studio */
  ['#imgBar [data-img="wider"]', 'add'],
  ['#imgBar [data-img="narrower"]', 'remove'],
  ['#imgBar [data-align="left"]', 'format_align_left'],
  ['#imgBar [data-align="center"]', 'format_align_center'],
  ['#imgBar [data-align="right"]', 'format_align_right'],
  ['#imgBar [data-img="studio"]', 'crop'],
  ['#imgBar [data-img="full"]', 'open_in_full'],
  ['#imgBar [data-img="delete"]', 'delete'],
  ['#stTools [data-tool="crop"]', 'crop'],
  ['#stTools [data-tool="pen"]', 'draw'],
  ['#stTools [data-tool="box"]', 'crop_square'],
  ['#stTools [data-tool="arrow"]', 'north_east'],
  ['#stTools [data-tool="text"]', 'title'],
  ['#stRotate .b-ic', 'rotate_right'],
  ['#stReset .b-ic', 'restart_alt'],
  ['#stCancel .b-ic', 'close'],
  ['#stApply .b-ic', 'check'],

  /* settings — section headings */
  ['h3:has([data-t="set.appearance"]) .sec-ic', 'palette'],
  ['h3:has([data-t="set.canvas"]) .sec-ic', 'tune'],
  ['h3:has([data-t="set.board"]) .sec-ic', 'space_dashboard'],
  ['h3:has([data-t="set.shortcuts"]) .sec-ic', 'keyboard'],

  /* settings — rows */
  ['label:has([data-t="set.language"]) .row-ic', 'language'],
  ['label:has([data-t="set.themeMode"]) .row-ic', 'change_circle'],
  ['label:has([data-t="set.themeTimes"]) .row-ic', 'schedule'],
  /* The settings nav. One row per tab, and every glyph here is already drawn
     somewhere else in the panel — the tab is a second place to find the same
     thing, so it should look like the same thing. */
  ['.set-tab[data-tab="appearance"] .tab-ic', 'palette'],
  ['.set-tab[data-tab="canvas"] .tab-ic', 'tune'],
  ['.set-tab[data-tab="notes"] .tab-ic', 'sticky_note_2'],
  ['.set-tab[data-tab="links"] .tab-ic', 'link'],
  ['.set-tab[data-tab="statuses"] .tab-ic', 'label'],
  ['.set-tab[data-tab="templates"] .tab-ic', 'bookmarks'],
  ['.set-tab[data-tab="habits"] .tab-ic', 'bolt'],
  ['.set-tab[data-tab="board"] .tab-ic', 'space_dashboard'],
  ['.set-tab[data-tab="shortcuts"] .tab-ic', 'keyboard'],
  ['.time-fld:has(#setDayAt) .tf-ic', 'light_mode'],
  ['.time-fld:has(#setNightAt) .tf-ic', 'bedtime'],
  ['.pair-fld:has(#setLightTheme) .pf-ic', 'light_mode'],
  ['.pair-fld:has(#setDarkTheme) .pf-ic', 'bedtime'],
  ['#setLightTheme + .sel-chev', 'expand_more'],
  ['#setDarkTheme + .sel-chev', 'expand_more'],
  ['label:has([data-t="set.themePair"]) .row-ic', 'swap_horiz'],
  ['#customBox .ct-ic', 'palette'],
  ['#ctFromTheme .b-ic', 'colorize'],
  ['h3:has([data-t="set.links"]) .sec-ic', 'link'],
  ['label:has([data-t="set.linkColor"]) .row-ic', 'colorize'],
  ['label:has([data-t="set.linkOwn"]) .row-ic', 'brush'],
  ['label:has([data-t="set.linkStyle"]) .row-ic', 'call_split'],
  ['label:has([data-t="set.linkAnchor"]) .row-ic', 'my_location'],
  ['label:has([data-t="set.linkWidth"]) .row-ic', 'draw'],
  ['#setEmbeds + .row-ic', 'play_circle'],
  ['#embedCancel', 'close'],
  ['#embedOk .b-ic', 'play_circle'],
  ['label:has([data-t="set.accent"]) .row-ic', 'colorize'],
  ['label:has([data-t="set.canvasBg"]) .row-ic', 'grid_on'],
  ['label:has([data-t="set.gridSize"]) .row-ic', 'grid_view'],
  ['label:has([data-t="set.gridFade"]) .row-ic', 'blur_on'],
  ['label:has([data-t="set.textSize"]) .row-ic', 'text_fields'],
  ['label:has([data-t="set.wheel"]) .row-ic', 'mouse'],
  ['#setSnap + .row-ic', 'grid_on'],
  ['#setCompass + .row-ic', 'my_location'],
  ['#setSpell + .row-ic', 'checklist'],
  ['label:has([data-t="set.rail"]) .row-ic', 'space_dashboard'],
  ['h3:has([data-t="set.notes"]) .sec-ic', 'sticky_note_2'],
  ['label:has([data-t="set.shape"]) .row-ic', 'crop_square'],
  ['label:has([data-t="set.density"]) .row-ic', 'view_list'],
  ['#setNoteChrome + .row-ic', 'more_horiz'],
  ['h3:has([data-t="set.statuses"]) .sec-ic', 'label'],
  ['#statusAdd .b-ic', 'add'],
  ['#setLang + .sel-chev', 'expand_more'],

  /* settings — buttons */
  ['#btnDataFolder .b-ic', 'folder_open'],
  ['#btnCopyPath .b-ic', 'content_copy'],
  ['#btnExport .b-ic', 'download'],
  ['#btnImport .b-ic', 'upload'],
  ['#btnWipe .b-ic', 'delete_forever'],

  /* sheets and dialogs */
  ['#settingsClose', 'close'],
  ['#iconClose', 'close'],
  ['#studioClose', 'close'],
  ['#linkCancel', 'close'],
  ['#iconRemove .b-ic', 'close'],
  ['#iconPicker .ip-find-ic', 'search'],
  ['#linkRemove .b-ic', 'link_off'],
  ['#linkOk .b-ic', 'check'],
  ['#confirmNo .b-ic', 'close'],
  ['#confirmYes .b-ic', 'check'],

  /* templates */
  ['h3:has([data-t="set.templates"]) .sec-ic', 'bookmarks'],
  ['#tplCancel', 'close'],
  ['#tplOk .b-ic', 'check']
];
function paintStaticIcons() {
  STATIC_ICONS.forEach(([sel, name]) => {
    const el = document.querySelector(sel);
    if (el && ICONS[name]) el.innerHTML = icon(name);
  });
  document.querySelectorAll('.fab-item[data-icon]').forEach((b) => {
    const slot = b.querySelector('.fi-ic');
    if (slot) slot.innerHTML = icon(b.dataset.icon);
  });
  // the empty-board tips are marked with a chevron rather than a list bullet
  document.querySelectorAll('.eh-card .eh-ic').forEach((s) => { s.innerHTML = icon('chevron_right'); });
}

function seedWelcome() {
  const n = {
    id: uid(), x: -230, y: -170, w: 460, h: 340, color: 'blue', z: ++state.nextZ,
    remindAt: 0, reminded: false, repeat: '', hist: [],
    body:
      `<h1>${te('welcome.title')}</h1>` +
      `<p>${te('welcome.lead')}</p>` +
      '<ul class="mb-todo">' +
        `<li>${te('welcome.t1')}</li><li>${te('welcome.t2')}</li>` +
        `<li>${te('welcome.t3')}</li><li>${te('welcome.t4')}</li>` +
      '</ul>' +
      `<p>${te('welcome.end')}</p>`
  };
  state.notes.push(n);
  const el = makeNote(n);
  $('notesLayer').appendChild(el);
  els.set(n.id, el);
  updateEmpty();
  save();
  flyTo({ x: 0, y: 0 }, 1, 1);
}

document.addEventListener('DOMContentLoaded', init);
