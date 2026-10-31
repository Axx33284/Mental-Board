/* Mental Board — init.js
   Pointer routing, the keyboard map, init(), and STATIC_ICONS — every listener in one place.

   Part 22 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 16. pointer routing, keyboard, init ─────────────── */
/* Leaving by the app's own close button.

   This is the one exit the renderer gets to wait on, and that is the whole
   reason it exists as a function rather than three statements on a listener.
   Everything else — Alt+F4, Quit from the tray, the machine shutting down —
   arrives at `beforeunload`, where nothing may be awaited and flushSave()'s
   blocking write is the backstop.

   What the waiting buys is a locked board's last few seconds. Its ciphertext is
   rebuilt by reencryptOpenBoards(), WebCrypto is async, and save(true) very
   deliberately refuses to wait for it on the way out — so without this the
   envelope written at close is the one the last debounce left, and anything
   typed since is only in memory. Here there is time: re-encrypt first, then let
   flushSave() do the single blocking write with the envelope already current.

   A failure is logged and not put in a dialog. The debounced path already
   reports it once a session through reportEncryptFailure(), and a dialog raised
   on the way out either vanishes with the window or — with Run in background on,
   where close only hides — is still sitting there the next time the window is
   shown, attached to a session the user has finished with. The write still
   happens either way, with the last good envelope. */
async function closeAndQuit(really) {
  /* Whatever goes wrong on the way, the window is still asked to go — a throw
     here used to leave the app open with nothing to say why (2.6.1). The
     beforeunload save still runs after this, as the backstop. */
  try {
    if (sketchOpen()) closeSketch();       // a drawing note open full screen keeps what was drawn
    if (editing && editNote) editNote.body = bodyHtml(editing);
    if (state.boards.some((b) => b.enc && unlocked.has(b.id))) {
      try { await reencryptOpenBoards(); }
      catch (err) { console.error('re-encryption threw on the way out:', err); }
    }
    flushSave();
  } catch (err) {
    console.error('closing: the last save threw, leaving anyway:', err);
  } finally {
    // Ctrl+Q ends the app even with Run in background on; the close button only hides it then
    if (WIN) { if (really === true && WIN.quit) WIN.quit(); else WIN.close(); }
  }
}

function onPointerDown(e) {
  closeCtxMenu();
  // clicking away from the paste menu means "plain text, thanks"
  if (pasteCtx && !e.target.closest('#pasteMenu')) applyPasteAs('text');
  if ($('hilitePop')) $('hilitePop').classList.remove('open');
  if ($('colorPop')) $('colorPop').classList.remove('open');
  if (e.button === 2) return;                        // handled by contextmenu

  // Buttons inside a note handle themselves. They must bail out BEFORE any
  // gesture starts: beginMove() takes pointer capture on the viewport, which
  // retargets the following click away from the button and swallows it.
  if (e.target.closest('.ft-icon')) return;
  /* So do a database's buttons, cells, cards and fields, and the lines of a
     table of contents — in a closed note as well, which is the point: pressing
     them must not start moving the note (database.js, editor.js). The rest of
     a database is the note, and drags it. */
  if (e.button === 0 && e.target.closest('.db-face [data-act], .db-face :is(input, select, textarea, label), .toc-face [data-act]')) return;
  // and a toggle's arrow, which opens and closes it in a closed note too (blocks.js)
  if (e.button === 0 && toggleArrowAt(e)) return;

  /* A link in note text is a button too, and it was losing its click to exactly
     the same capture. Pressing on a note that is not being edited went straight
     to beginMove(), the viewport captured the pointer, and the `click` handler
     bound to .note-body never fired — so a URL in a closed note simply did
     nothing when you clicked it, which is the one thing a link has to do.

     Only when the note is closed: inside an open editor a click on a link has
     to place the caret instead, and Ctrl+click is the escape hatch there. The
     embed's own controls take the same exit, or pressing play would drag the
     note across the board. */
  const liveLink = e.target.closest('a[href], a.mb-board, a.mb-note, .mb-embed');
  if (liveLink && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
    const host = liveLink.closest('.note');
    if (host && !host.classList.contains('editing')) return;
  }

  const noteEl = e.target.closest('.note');
  const frameTitle = e.target.closest('.frame-title');
  const frameEl = e.target.closest('.frame');
  const rz = e.target.closest('.rz');
  /* A note on the far-zoom canvas has no element, so the press landed on the
     board behind it; ask the canvas what it drew there (far.js). Everything
     below needs only the note's id. */
  const farNote = !noteEl && !rz && !frameTitle ? farNoteAt(e.clientX, e.clientY) : null;
  const noteId = noteEl ? noteEl.dataset.id : farNote ? farNote.id : null;

  // link mode swallows the click
  if (linkFrom) {
    if (noteId) { finishLinking(noteId); e.preventDefault(); return; }
    cancelLinking();
    return;
  }

  // middle mouse / space / alt = pan, wherever you click
  if (e.button === 1 || spaceHeld || e.altKey) { e.preventDefault(); beginPan(e); return; }
  if (e.button !== 0) return;

  // the pen is out: every left press on the board is a stroke (js/ink.js)
  if (inkMode) { e.preventDefault(); beginInk(e); return; }

  /* A rope goes somewhere. Handled here, on the press, because anything left
     for a `click` loses it to the lasso's pointer capture — see followRope().
     Shift still lassos, so a selection can be started on top of a rope. */
  const rope = e.target.closest('.lk-hit');
  if (rope && !e.shiftKey) { e.preventDefault(); followRope(rope.dataset.id, e.clientX, e.clientY); return; }
  // and one on the far-zoom canvas, where nothing is drawn over it
  const farRope = !rope && !noteId && !rz && !frameTitle && !e.shiftKey ? farRopeAt(e.clientX, e.clientY) : null;
  if (farRope) { e.preventDefault(); followRope(farRope.id, e.clientX, e.clientY); return; }

  if (rz) {
    const host = rz.closest('.note, .frame');
    if (host) { e.preventDefault(); beginResize(e, host.dataset.id, rz.dataset.rz); return; }
  }

  if (frameTitle && frameTitle.classList.contains('renaming')) return;   // let the caret work

  if (noteId) {
    const id = noteId;
    const inBody = e.target.closest('.note-body');
    if (noteEl && noteEl.classList.contains('editing') && inBody) return;   // let the caret work
    if (e.shiftKey) { toggleSelection(id); return; }
    if (editing && editNote && editNote.id !== id) exitEdit();
    e.preventDefault();
    beginMove(e, id);
    return;
  }

  // a locked workflow's title is canvas: pressing it starts a lasso
  const frameLocked = frameEl && (state.frames.find((x) => x.id === frameEl.dataset.id) || {}).locked;
  if (frameTitle && frameEl && !frameLocked) {
    const id = frameEl.dataset.id;
    if (e.shiftKey) { toggleSelection(id); return; }
    if (editing) exitEdit();
    e.preventDefault();
    beginMove(e, id);
    return;
  }

  // empty canvas -> lasso
  if (editing) exitEdit();
  gesture = { kind: 'marquee', sx: e.clientX, sy: e.clientY, w0: toWorld(e.clientX, e.clientY), base: e.shiftKey ? [...selection] : [] };
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
  if (inkMode) return;               // a quick double tap of the pen is two dots, not a new note
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
  // two quick presses on a database's cell or card are two presses, not "open the note"
  if (hit.closest('.db-face [data-act], .db-face :is(input, select, textarea, label)')) return;
  const noteEl = hit.closest('.note');
  // a drawing note's title renames where it is; the rest of it opens the drawing
  if (noteEl && hit.closest('.sk-title') && noteEl.classList.contains('sketch')) { renameSketch(noteEl.dataset.id); return; }
  if (noteEl) {
    const n = state.notes.find((x) => x.id === noteEl.dataset.id);
    // a picture has no text to edit; its double-click opens the studio
    if (n && n.pic) editPicture(n.id);
    else if (n) enterEdit(n);
    return;
  }
  if (hit.closest('.rz')) return;
  // a note on the far-zoom canvas opens the same way (far.js)
  const farNote = hit.closest('.frame-title') ? null : farNoteAt(e.clientX, e.clientY);
  if (farNote) { enterEdit(farNote); return; }
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
  const hit = hitAt(e);
  const noteEl = hit.closest('.note');
  /* In the text of the note being edited, the event goes through to Chromium,
     which tells main what is misspelled there; the menu opens when that answer
     arrives (or without it, a moment later). See awaitSpellMenu() in menus.js. */
  if (noteEl && editing && editing.contains(hit) && state.settings.spell && WIN && WIN.onSpell) {
    awaitSpellMenu(e.clientX, e.clientY, noteEl.dataset.id);
    return;
  }
  e.preventDefault();
  if (noteEl) { openCtxMenu(e.clientX, e.clientY, noteEl.dataset.id); return; }
  const rope = hit.closest('.lk-hit');
  if (rope) { openRopeMenu(e.clientX, e.clientY, rope.dataset.id); return; }
  // what the far-zoom canvas drew there, which has no element to hit (far.js)
  if (!hit.closest('.frame-title, .rz')) {
    const farNote = farNoteAt(e.clientX, e.clientY);
    if (farNote) { openCtxMenu(e.clientX, e.clientY, farNote.id); return; }
    const farRope = farRopeAt(e.clientX, e.clientY);
    if (farRope) { openRopeMenu(e.clientX, e.clientY, farRope.id); return; }
  }
  // frames are pointer-events:none so a lasso can reach through them — hit-test
  // them by geometry instead, which also makes their whole area right-clickable
  const f = frameAt(toWorld(e.clientX, e.clientY));
  openCtxMenu(e.clientX, e.clientY, f ? f.id : null);
}

function onKeyDown(e) {
  // the picture editor over a drawing note (2.10) has the keys first, and Escape closes it, not the drawing
  if (sketchOpen() && !$('studio').classList.contains('hidden')) {
    if (e.key === 'Escape') { e.preventDefault(); closeStudio(); return; }
    onStudioKey(e); return;
  }
  if (sketchOpen()) { onSketchKey(e); return; }    // a drawing note open full screen has every key (sketch.js)
  if (bookOpen()) { onBookKey(e); return; }        // and so has a book (book.js)
  if (!$('studio').classList.contains('hidden') && onStudioKey(e)) return;   // and so has the picture editor (media.js)
  const typing = e.target.closest('input, textarea, [contenteditable="true"]');

  if (e.key === 'Escape') {
    if (dbPopS) { closeDbPop(); return; }                  // a database's menu, then its row (database.js)
    if (dbRd) { closeDbRow(); return; }
    if (pasteGhost) { cancelPasteGhost(); return; }
    if (inkMode && !e.target.closest('.overlay')) {
      if (inkSel.size) { inkSel.clear(); paintInkSelection(); return; }   // let go of the strokes first
      toggleInk(false); return;
    }
    if (!$('studio').classList.contains('hidden')) { closeStudio(); return; }
    if (!$('iconPicker').classList.contains('hidden')) { closeIconPicker(); return; }
    if (!$('confirmDlg').classList.contains('hidden')) { endConfirm(false); return; }
    if (!$('linkDlg').classList.contains('hidden')) { closeLinkDialog(); return; }
    if (!$('mathDlg').classList.contains('hidden')) { closeMathDialog(); return; }
    if (!$('tplDlg').classList.contains('hidden')) { closeTemplateDialog(); return; }
    if (settingsOpen()) { closeSettings(); return; }
    if (!$('ctxMenu').classList.contains('hidden')) { closeCtxMenu(); return; }
    if (!$('boardMenu').classList.contains('hidden')) { closeBoardMenu(); return; }
    if (!$('flowsMenu').classList.contains('hidden')) { closeFlowsMenu(); return; }
    if (!$('pageMenu').classList.contains('hidden')) { closePageMenu(); return; }
    if (!$('moveDlg').classList.contains('hidden')) { closeMoveTo(); return; }
    if (!$('agendaDlg').classList.contains('hidden')) { closeAgenda(); return; }
    if (!$('kanbanDlg').classList.contains('hidden')) { closeKanban(); return; }
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
    if (document.body.classList.contains('fab-open')) { document.body.classList.remove('fab-open'); return; }
    // nothing left to back out of: Escape is the way into Settings, as a game's pause menu (3.0)
    if (!typing && !e.repeat) { e.preventDefault(); openSettings(); }
    return;
  }

  const ctrl = e.ctrlKey || e.metaKey;
  /* Both of these read the physical key when the layout produced something
     that is not a Latin letter, so the shortcuts survive an Arabic, Russian,
     Greek or Hebrew keyboard — see letterKey() in §1. Nothing changes for a
     Latin layout, AZERTY and QWERTZ included. */
  const key = letterKey(e);
  const ch = chordKey(e);

  if (ctrl && ch === ',') { e.preventDefault(); openSettings(); return; }
  /* Ctrl+. beside Ctrl+, on purpose: the two keys sit next to each other and
     the two things they do are a pair — one opens everything, the other puts
     everything away. It works while typing as well, because clearing the screen
     is a thing you do mid-sentence and nothing in a note needs this chord. */
  if (ctrl && ch === '.') { e.preventDefault(); toggleFocusMode(); return; }
  if (ctrl && key === 'f') { e.preventDefault(); openFind(); return; }
  // Ctrl+P works while typing too — jumping somewhere else is a thing you do
  // mid-sentence, and nothing in a note needs that chord
  if (ctrl && key === 'p') { e.preventDefault(); openPalette(); return; }

  // a picture selected inside a note goes out as the picture, not as markup pointing at mbf:// (3.0)
  if (ctrl && key === 'c' && !e.shiftKey && selImg && selImg.isConnected) { e.preventDefault(); copyPictureOut(selImg.getAttribute('src') || ''); return; }

  if (typing) return;   // everything below is canvas-level

  // after the `typing` guard, so Ctrl+B stays bold inside a note
  if (ctrl && key === 'b') { e.preventDefault(); toggleBoardWindow(); return; }

  if (ctrl && key === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (ctrl && key === 'y') { e.preventDefault(); redo(); return; }
  if (ctrl && key === 'a') {
    e.preventDefault();
    // drawing: every stroke, with the arrow in hand to do something with them
    if (inkMode) { if (state.settings.pen.tool !== 'select') setPen({ tool: 'select' }); selectAllInk(); return; }
    selectAll(); return;
  }
  if (ctrl && e.shiftKey && key === 'd') { e.preventDefault(); openAgenda(); return; }
  if (ctrl && e.shiftKey && key === 'k') { e.preventDefault(); openKanban(); return; }
  if (ctrl && key === 'd') { e.preventDefault(); if (selection.size) duplicate([...selection]); return; }
  /* Ctrl+Shift+G, not Ctrl+R: Ctrl+R reloads the window and that is how this
     app is developed. Group and arrange are the two things you do to a
     selection of several, so they share a letter and differ by Shift. */
  if (ctrl && e.shiftKey && key === 'g') { e.preventDefault(); arrangeSelection('grid'); return; }
  if (ctrl && key === 'g') { e.preventDefault(); groupSelection(); return; }
  // the whole board, not the selection — see copyBoardContent()
  if (ctrl && e.shiftKey && key === 'c') { e.preventDefault(); copyBoardContent(); return; }
  if (ctrl && key === 'c') { e.preventDefault(); copySelection(false); return; }
  if (ctrl && key === 'x') { e.preventDefault(); copySelection(true); return; }
  /* Not preventDefault()ed, on purpose: the native paste has to run so the
     `paste` event below can see the system clipboard. A screenshot there is
     pasted as a picture; otherwise the copied notes follow the pointer until
     the keys come up (beginPasteGhost). The timer is the backstop for a paste
     event that never comes, which leaves the notes still pasting. */
  if (ctrl && key === 'v') {
    if (!e.repeat && !pasteGhost) {
      pasteSeen = false;
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => { pasteTimer = null; if (!pasteSeen) { pasteSeen = true; beginPasteGhost(); } }, 150);
    }
    return;
  }
  if (ctrl && key === 's') { e.preventDefault(); flushSave(); toast(t('msg.saved')); return; }
  if (ctrl && (ch === '=' || ch === '+')) { e.preventDefault(); zoomCentre(1.2); return; }
  if (ctrl && ch === '-') { e.preventDefault(); zoomCentre(1 / 1.2); return; }
  if (ctrl && ch === '0') { e.preventDefault(); resetZoom(); return; }
  if (ch === '!' || (e.shiftKey && ch === '1')) { e.preventDefault(); zoomToFitAll(); return; }

  if (e.key === ' ' && !spaceHeld) { spaceHeld = true; $('viewport').classList.add('pan-ready'); e.preventDefault(); return; }

  if (inkMode && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteInkSelection(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection.size) { e.preventDefault(); askThenDelete([...selection]); }
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

  /* The pen: P puts it out and away; while it is out, the first letter of
     each tool picks it, and [ ] step the size. */
  if (key === 'p' && !ctrl) { e.preventDefault(); toggleInk(); return; }
  if (inkMode && !ctrl) {
    const tools = { v: 'select', e: 'eraser', m: 'marker', b: 'brush', d: 'pen' };
    if (tools[key]) { e.preventDefault(); setPen({ tool: tools[key] }); return; }
    if (ch === '[' || ch === ']') { e.preventDefault(); setPen({ size: clamp(state.settings.pen.size + (ch === ']' ? 1 : -1), 0, 2) }); return; }
    return;            // nothing else on the canvas while drawing
  }
  if (key === 'n') { e.preventDefault(); addNote(); return; }
  if (key === 'g') { e.preventDefault(); selection.size ? groupSelection() : addFrame(); return; }
  if (key === 'l') {
    const one = [...selection].find((id) => !isFrame(id));
    if (one) { e.preventDefault(); startLinking(one); }
    return;
  }
}

let pasteSeen = false, pasteTimer = null;
function onKeyUp(e) {
  if (e.key === ' ') { spaceHeld = false; $('viewport').classList.remove('pan-ready'); }
  // letting go of either key puts a held paste down where the pointer is
  if (e.key === 'Control' || e.key === 'Meta' || letterKey(e) === 'v') {
    if (pasteGhost) commitPasteGhost();
    // released before the ghost could start: a plain paste at the pointer
    else if (pasteTimer) { clearTimeout(pasteTimer); pasteTimer = null; if (!pasteSeen && clipboard.length) { pasteSeen = true; pasteClipboard(lastCanvasPoint || undefined); } }
  }
}

/* The canvas with nothing on top of it: no rail, no + dial, no zoom bar, no
   edge signposts. Stored in settings, so it survives a restart.

   Storing it is what makes the toast obligatory rather than a nicety. Every
   visible way back out of this mode is one of the things it just hid, so a user
   who turns it on, forgets the key and restarts would open the app to a canvas
   with no controls and nothing saying why. The toast names the key each time it
   goes on, and init() says it again on any launch that starts in it — the same
   reasoning as flashRail(): a control that is invisible at rest has to
   introduce itself. */
function toggleFocusMode(on) {
  const s = state.settings;
  s.focusMode = (on == null) ? !s.focusMode : !!on;
  applySettings();
  if (settingsOpen()) syncSettingsUI();
  saveSoon();
  if (s.focusMode) toast(t('msg.focusOn'), 5200);
  else { toast(t('msg.focusOff')); flashRail(2600); }
}

/* --- canvas-level image drop ------------------------------------------- */
/* Something dropped on the canvas.

   Every drop ends the same way: the file is taken into the open board's folder
   (see §11b) and a note is made for it, wherever the pointer was. There is no
   "drop onto an existing note" case here — the note body has its own handler —
   so **a drop with no note under it makes the note**, which is what dropping a
   file on a blank canvas obviously means.

   Two things come first, because they are not attachments:

   - **A board somebody else made.** A .json that turns out to be one of ours is
     imported rather than filed away as a document. This is the whole of "send
     me your board": drop the file, and if its pictures are sitting in a
     `files/` folder beside it — which is exactly what a backup folder looks
     like — they come across too.
   - **Several files at once.** Dropping a folder's worth of clips should make a
     row of notes, not one note about the first of them. */
async function onCanvasDrop(e) {
  const files = e.dataTransfer && e.dataTransfer.files ? [...e.dataTransfer.files] : [];
  if (!files.length) return;
  e.preventDefault();
  if (!canEditHere()) return;

  const pt = toWorld(e.clientX, e.clientY);

  // onto a drawing note: pictures and PDFs go under its drawing, and anything else is named as refused (sketch.js)
  const onSketch = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest('.note.sketch')).find(Boolean);
  if (onSketch && await dropIntoSketch(onSketch.dataset.id, files)) return;

  /* A board file is offered as an import before anything else looks at it. Only
     when it really is one of ours: an ordinary .json dropped on the canvas is
     still a document, and silently swallowing it would be worse than useless to
     anybody whose work involves JSON. */
  if (files.length === 1 && isBoardFile(files[0])) {
    if (await tryImportDroppedBoard(files[0])) return;
  }
  if (files.length === 1 && /\.canvas$/i.test(files[0].name || '')) {
    await importCanvasFile(FILES && FILES.pathOf ? FILES.pathOf(files[0]) : '');
    return;
  }
  /* A Samsung Notes file is read, not filed away: its text, handwriting and
     pictures come onto the board (samsung.js, MAP.md §4w). */
  const samsung = files.filter((f) => /\.sdocx$/i.test(f.name || ''));
  if (samsung.length && FILES && FILES.pathOf) {
    await importSamsungFiles(samsung.map((f) => FILES.pathOf(f)).filter(Boolean), pt);
    if (samsung.length === files.length) return;
  }

  /* Spread several drops along a row from where the pointer was, so they do not
     land on top of each other. */
  let i = 0;
  for (const f of files) {
    if (samsung.includes(f)) continue;
    const at = { x: pt.x + i * 40, y: pt.y + i * 40 };
    await noteFromDroppedFile(f, at);
    i++;
  }
}

/* One dropped file → one note. Shared by the canvas drop and by the paste
   handler, so a screenshot and a dropped clip travel the same road. */
async function noteFromDroppedFile(f, at) {
  const taken = await takeFileIn(f);
  if (!taken) return null;
  if (isImageFile(f)) return noteFromImage(f, at, taken);
  return noteFromTaken(taken, at);
}
/* A file already in the board's folder → the note that shows it. Sized to
   what it is: a video gets a box you can actually watch in, a document gets a
   card. (An image never arrives here — it stands on the board by itself; see
   noteFromImage().) */
async function noteFromTaken(taken, at) {
  const html = fileHtml(taken.url, taken.name);
  if (!html) return null;
  if (IMG_EXT.includes(extOf(taken.name))) return addPicture(at, taken);
  const kind = { name: taken.name };
  const video = isVideoFile(kind), audio = isAudioFile(kind);
  /* A video note is sized to the clip, measured first as a picture is, so a
     portrait phone clip and a widescreen one both fit without a scrollbar.
     VIDEO_CHROME is the icon row, the name bar and the padding around them. */
  let vh = 360;
  if (video) {
    const size = await measureVideo(taken.url);
    if (size) vh = Math.round(clamp(480 * size.h / size.w, 160, 760)) + VIDEO_CHROME;
  }
  const n = addNote(at, {
    body: html + '<p><br></p>',
    icon: video ? 'movie' : audio ? 'headphones' : 'description',
    w: video ? 480 : audio ? 340 : 320,
    h: video ? vh : audio ? 170 : 150,
    edit: false
  });
  // two literal t() calls, so check-lang.js can see both keys
  if (n && video) toast(t('msg.videoAdded', { name: taken.name }));
  else if (n) toast(t('msg.fileAdded', { name: taken.name }));
  return n;
}

const VIDEO_CHROME = 130;
// a clip's own width and height, or null if it will not say (an .avi, say)
function measureVideo(url) {
  return new Promise((res) => {
    const v = document.createElement('video');
    const done = (r) => { clearTimeout(timer); v.removeAttribute('src'); v.load(); res(r); };
    const timer = setTimeout(() => done(null), 4000);
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => done(null);
    v.src = url;
  });
}

/* A picture or a video without a drag: the + menu and the right-click menu.
   Picked by path, copied into the board's folder like a drop, and placed at
   `at` — or the middle of the screen when nothing says where. */
async function addMediaFromPicker(kind, at) {
  if (!canEditHere()) return null;
  if (!FILES || !FILES.attach || !(kind === 'video' ? FILES.pickVideo : FILES.pickImage)) { toast(t('msg.needDesktop')); return null; }
  const p = kind === 'video' ? await FILES.pickVideo() : await FILES.pickImage();
  if (!p) return null;
  const r = await FILES.attach(p, state.activeBoard, '');
  if (!r || r.error) {
    const name = p.split(/[\\/]/).pop();
    if (r && r.error === 'too big') toast(t('msg.fileTooBig', { name }), 5000);
    else toast(t('msg.fileFailed', { name }), 5000);
    return null;
  }
  const vr = $('viewport').getBoundingClientRect();
  const pt = at || toWorld(vr.left + vr.width / 2, vr.top + vr.height / 2);
  return noteFromTaken({ url: r.url, name: r.name }, pt);
}

/* A board file dropped on the canvas. Returns true when it was one of ours and
   has been dealt with, false when it is just a .json and should become a note
   like any other document. */
async function tryImportDroppedBoard(f) {
  let parsed;
  try { parsed = JSON.parse(await f.text()); } catch (_) { return false; }
  if (!looksLikeBoards(parsed)) return false;
  const path = FILES && FILES.pathOf ? FILES.pathOf(f) : '';
  // the folder the file sits in is where its pictures are
  const beside = path ? path.replace(/[\\/][^\\/]*$/, '') : '';
  await importBoardsFrom(parsed, beside, f.name);
  return true;
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

/* ─────────────── the net under everything ───────────────
   There was no global error handler anywhere in this app — no `onerror`, no
   `unhandledrejection`, and nothing in main for a renderer that dies. Which
   sits oddly beside the rest of it: this is a codebase where a preload call
   that returns a status must have that status acted on, and where a failed
   write raises a dialog. An exception thrown three frames into a drag got none
   of that. It unwound the handler, left the gesture half-applied, and said
   nothing — the app just stopped responding to the mouse until you clicked
   again, which reads as flakiness rather than as a bug anyone could report.

   So: every uncaught error is logged with its stack, and the user is told at
   least once. Told, not interrogated — this is a toast, not the modal
   reportSaveFailure() raises, because an exception in a paint function is not
   the same news as work failing to reach the disk.

   **Throttled on purpose, and hard.** The one place an error is most likely is
   a pointermove handler, which fires sixty times a second; without a limit the
   first bug found would bury the window in toasts and take the app down more
   thoroughly than the bug did. Three, then silence, with the count still going
   to the console so a devtools session sees everything.

   It deliberately does not save. `state` is not corrupted by a render throwing,
   the debounce is still armed, and a save triggered from an unknown failure is
   a write nobody asked for at the exact moment least is known about what just
   happened. */
const ERR_MAX = 3;
const ERR_GAP = 30000;
let errCount = 0, errLast = 0;
function reportUncaught(what, err) {
  errCount++;
  console.error(`uncaught ${what}:`, err);
  if (errCount > ERR_MAX) return;
  const now = Date.now();
  if (now - errLast < ERR_GAP) return;
  errLast = now;
  try {
    const msg = String((err && (err.message || err.reason && err.reason.message)) || err || '?').slice(0, 120);
    toast(t('msg.oops', { err: msg }), 6000);
    if (errCount === ERR_MAX) console.error('further uncaught errors will be logged but not shown');
  } catch (_) { /* the toast machinery itself is down; the console line stands */ }
}
window.addEventListener('error', (e) => reportUncaught('error', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportUncaught('promise rejection', e.reason));

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
    applyThemeFaded(900);
    // only if it is on screen — syncSettingsUI() walks every board to count words
    if (settingsOpen()) syncSettingsUI();
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
  document.addEventListener('pointermove', moveInkCursor, { passive: true });
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
  /* The last chance, and it has to be a blocking one: a promise handed back
     here never settles, because the window does not wait for it. flushSave()
     now writes synchronously even with a locked board open, which it did not
     use to — see save(). The second save() that used to follow this one is
     gone: after the flush there is nothing left to write, and with a locked
     board open it started a PBKDF2 during teardown that could never land. */
  window.addEventListener('beforeunload', () => {
    if (editing && editNote) editNote.body = bodyHtml(editing);
    flushSave();
  });

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
    // into an open drawing note, never onto the board behind it (sketch.js)
    if (sketchOpen()) { if ($('studio').classList.contains('hidden')) onSketchPaste(e); return; }
    if (bookOpen()) { onBookPaste(e); return; }            // a picture or words onto a page (book.js, 3.1.1)
    if (editing) return;
    if (settingsOpen()) return;
    pasteSeen = true; clearTimeout(pasteTimer);
    if (pasteGhost) { e.preventDefault(); return; }       // a held Ctrl+V repeats
    // a picture copied out of the app is on the system clipboard too; the app's own copy is newer, so it is the paste
    if (clipboard.length && lastCopy.board > sysClipAt) { e.preventDefault(); beginPasteGhost(); return; }
    if (pasteAnything(e, lastCanvasPoint || viewCenterWorld())) return;
    if (clipboard.length) { e.preventDefault(); beginPasteGhost(); }
  });

  // titlebar
  $('btnMin').addEventListener('click', () => WIN && WIN.minimize());
  $('btnMax').addEventListener('click', () => WIN && WIN.toggleMaximize());
  $('btnClose').addEventListener('click', closeAndQuit);
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
    if (what === 'book') addBookFromPdf();
    if (what === 'notebook') addNotebook();
    if (what === 'picture') addMediaFromPicker('image');
    if (what === 'video') addMediaFromPicker('video');
    if (what === 'draw') toggleInk(true);
    if (what === 'sketch') addSketch();
    if (what === 'sketchFile') addSketchFromFiles();
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
  $('btnAgenda').addEventListener('click', openAgenda);
  $('btnKanban').addEventListener('click', openKanban);
  wireMinimap();
  wireWallpaper();         // the live wallpaper behind the board (wallpaper.js)
  window.addEventListener('resize', scheduleMinimap);
  // the two views close on their X, on Escape (onKeyDown), and on the backdrop
  $('agendaClose').addEventListener('click', closeAgenda);
  $('kanbanClose').addEventListener('click', closeKanban);
  $('agendaDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAgenda(); });
  $('kanbanDlg').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeKanban(); });

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
  /* No debounce: the filter is one pass over about sixty elements already in
     the document, which is well under a frame. Debouncing a search that fast
     only makes it feel slower than it is. */
  $('setSearch').addEventListener('input', () => filterSettings($('setSearch').value));
  $('setSearch').addEventListener('keydown', (e) => {
    e.stopPropagation();          // the canvas shortcuts must not see these keys
    if (e.key === 'Escape') {
      e.preventDefault();
      // first Escape empties the box, a second one closes the panel
      if ($('setSearch').value) { $('setSearch').value = ''; clearSettingsFilter(); }
      else closeSettings();
    }
  });
  $('setSearchClear').addEventListener('click', () => {
    $('setSearch').value = '';
    clearSettingsFilter();
    $('setSearch').focus();
  });

  /* What picks the theme. `matchSystem` is kept in step because it is still
     what an older build reads out of the file — the two are one setting
     wearing two names, and only one of them is ever authoritative. */
  $('themeModeSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    state.settings.themeMode = THEME_MODES.includes(m) ? m : 'fixed';
    state.settings.matchSystem = state.settings.themeMode === 'system';
    clockTheme = null;
    applyThemeFaded(600); syncSettingsUI(); saveSoon();
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
    applyThemeFaded(450); syncSettingsUI(); saveSoon();
  };
  $('setLightTheme').addEventListener('change', pairChanged('light'));
  $('setDarkTheme').addEventListener('change', pairChanged('dark'));

  const clockChanged = () => {
    const s = state.settings;
    s.dayAt = okClock($('setDayAt').value, s.dayAt);
    s.nightAt = okClock($('setNightAt').value, s.nightAt);
    clockTheme = null;
    applyThemeFaded(600); syncSettingsUI(); saveSoon();
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
  $('autosaveSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.autosaveMin = +b.dataset.autosave;
    startAutosave();                // the next one is that far from now
    syncSettingsUI(); saveSoon();
  }));
  $('wheelSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.wheel = b.dataset.wheel; syncSettingsUI(); saveSoon();
  }));
  $('zoomSpeed').addEventListener('input', () => {
    state.settings.zoomSpeed = clamp(+$('zoomSpeed').value || 100, 40, 220);
    $('zoomSpeedVal').textContent = pct(state.settings.zoomSpeed);
    saveSoon();
  });
  /* Nothing to re-render: the guides are computed at the start of the next
     drag and there is no drag in progress with Settings open. */
  $('setGuides').addEventListener('change', () => {
    state.settings.guides = $('setGuides').checked; saveSoon();
  });
  $('setFocusMode').addEventListener('change', () => toggleFocusMode($('setFocusMode').checked));
  $('perfSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.perf = PERF_MODES.includes(b.dataset.perf) ? b.dataset.perf : 'auto';
    /* applySettings() sets the attribute the stylesheet keys off; render()
       because the culling threshold moved, so which notes are mounted may have
       changed even though nothing about the board did. */
    applySettings(); render(); syncSettingsUI(); saveSoon();
  }));
  $('setSounds').addEventListener('change', () => {
    state.settings.sounds = $('setSounds').checked;
    syncSettingsUI(); saveSoon();
    if (state.settings.sounds) sfx('select');       // so you hear what you just turned on
  });
  $('soundVol').addEventListener('input', () => {
    state.settings.soundVol = +$('soundVol').value;
    $('soundVolVal').textContent = pct(state.settings.soundVol);
    saveSoon();
  });
  $('soundVol').addEventListener('change', () => sfx('move'));   // a sample at the new level
  $('setKeySounds').addEventListener('change', () => {
    const v = $('setKeySounds').value;
    state.settings.keySounds = KEY_SOUNDS.includes(v) ? v : 'off';
    syncSettingsUI(); saveSoon();
    // a sample of the switch just picked: a key, then the space bar
    keySfx('a', false); setTimeout(() => keySfx('a', true), 90);
    setTimeout(() => keySfx(' ', false), 220); setTimeout(() => keySfx(' ', true), 310);
  });
  $('keyVol').addEventListener('input', () => {
    state.settings.keyVol = +$('keyVol').value;
    $('keyVolVal').textContent = pct(state.settings.keyVol);
    saveSoon();
  });
  $('keyVol').addEventListener('change', () => keySfx('a', false));
  $('corkSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.cork = CORK_MODES.includes(b.dataset.cork) ? b.dataset.cork : 'off';
    // the ropes move to the pins, so they are drawn again
    applySettings(); resetLinks(); drawLinks(); syncSettingsUI(); saveSoon();
  }));
  $('btnResetAll').addEventListener('click', resetSettings);
  $('setSoftware').addEventListener('change', () => {
    state.settings.softwareRender = $('setSoftware').checked;
    saveSoon();
    toast(t('msg.restartNeeded'), 5000);
  });
  $('motionSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.motion = MOTION_MODES.includes(b.dataset.motion) ? b.dataset.motion : 'auto';
    applySettings(); syncSettingsUI(); saveSoon();
  }));
  $('fontScale').addEventListener('input', () => {
    state.settings.fontScale = +$('fontScale').value;
    $('fontScaleVal').textContent = pct(state.settings.fontScale);
    applySettings(); saveSoon();
  });
  $('setSnap').addEventListener('change', () => { state.settings.snap = $('setSnap').checked; saveSoon(); });
  $('setMinimap').addEventListener('change', () => { state.settings.minimap = $('setMinimap').checked; scheduleMinimap(); saveSoon(); });
  $('setCompass').addEventListener('change', () => { state.settings.compass = $('setCompass').checked; drawCompass(); saveSoon(); });
  $('setSpell').addEventListener('change', () => { state.settings.spell = $('setSpell').checked; applySettings(); saveSoon(); });
  $('btnExportImage').addEventListener('click', () => exportBoardImage());
  $('btnOpenTrash').addEventListener('click', () => { const tb = trashOf(); if (tb) { closeSettings(); switchBoard(tb.id); } });
  $('btnEmptyTrash').addEventListener('click', () => emptyTrash());
  $('btnImport').addEventListener('click', importBoard);
  $('btnBackupNow').addEventListener('click', () => backupNow());
  $('btnBackupAll').addEventListener('click', backupAll);
  $('btnEraseAll').addEventListener('click', eraseEverything);
  $('btnCleanFiles').addEventListener('click', cleanUpFiles);
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
    state.notes = []; state.frames = []; state.links = []; state.ink = [];
    markStatsStale();
    render(); drawCompass(); renderBoardRail(); save(); closeSettings(); toast(t('msg.cleared'));
  });
  buildAccentSwatches();
  buildKeyList();

  wireMathDialog();         // the formula window (settings.js)

  // link dialog
  $('linkOk').addEventListener('click', applyLink);
  $('linkCancel').addEventListener('click', closeLinkDialog);
  $('linkRemove').addEventListener('click', removeLink);
  $('linkUrl').addEventListener('input', renderLinkNotes);
  /* Enter takes the first note offered when the field is a search rather than
     an address — the list is on screen, so that is what Enter visibly means. */
  $('linkUrl').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    /* Without this the Enter is still on its way when applyLink() hands the
       focus back to the note, and its default action lands there: the link
       went in and then split the paragraph it was put in. */
    e.preventDefault();
    const first = $('linkNotes').querySelector('.ln-item');
    if (first && !$('linkNotes').classList.contains('hidden') && $('linkUrl').value.trim()) first.click(); else applyLink();
  });
  $('linkText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } });

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
  wirePageMenu();
  wireSettingsDesc();
  wireSettings30();         // wallpaper, drawing, the face, and every row as ‹ value › (settings.js)
  loadUiFonts();            // the app's face from a font file the user owns
  wirePadStudio();
  wireTableBar();
  wireColsBar();
  wireDatabases();
  wireBlocks();
  wireSounds();
  wireKeySounds();
  wirePad();
  wireSketch();
  wireHandwrite();         // a picture in a drawing, written out by hand (handwrite.js)
  wireBook();              // the book reader (book.js)
  wireSmoothCaret();       // the cursor that glides as you type (editor.js)
  startAutosave();
  watchVpRect();
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
    studioStep();
    ST.marks = []; ST.crop = { x: 0, y: 0, w: ST.img.naturalWidth, h: ST.img.naturalHeight };
    ST.adj = { ...ST_ADJ0 };
    buildStudioChrome(); drawStudio();
  });
  // on the press, not the click — see onPress() in helpers.js
  $('stTools').querySelectorAll('[data-tool]').forEach((b) => onPress(b, () => {
    ST.tool = b.dataset.tool; buildStudioChrome(); drawStudio();
  }));
  $('stWeight').addEventListener('input', () => { ST.weight = +$('stWeight').value; $('stWeightOut').textContent = num(ST.weight); });
  $('stWrap').addEventListener('pointerdown', studioDown);
  wireStudioSurface();
  window.addEventListener('resize', () => { if (ST.img) fitStudio(true); });

  if (WIN && WIN.onMaximized) WIN.onMaximized(() => {});
  $('viewport').focus();
  // the launcher is invisible at rest, so it says hello once and then goes
  flashRail(2800);
  /* Started in focus mode. Everything that would tell you how to get out of it
     is one of the things focus mode hides, so this is the only place it can be
     said. Once, on the launch, and then out of the way. */
  if (state.settings.focusMode) setTimeout(() => toast(t('msg.focusOn'), 6000), 900);

  /* Say which build this is, the first time each one runs.
     Without it there is no way from inside the app to tell a new build from the
     old one still being on screen — which is exactly the confusion that made a
     shipped change look like a change that never shipped. Once per version, and
     never again. */
  if (versionChanged && APP_VERSION) {
    setTimeout(() => toast(t('msg.nowRunning', { v: APP_VERSION }), 4200), 700);
    save();                    // record the version so this is genuinely once
  }

  /* The pre-upgrade copy could not be written, and this is the only moment it
     will ever be attempted — the build it was protecting against has already
     opened the board. Said plainly rather than logged, because the thing the
     user has lost is not visible: the app looks completely normal, and the
     safety net simply is not there. */
  if (versionSnapshotError) {
    setTimeout(() => hint(t('msg.versionSnapshotFailed')), 1400);
  }

  /* A board file exists but would not parse. Saving is already blocked; the
     one thing left that matters is that the user finds out now, from the app,
     rather than discovering it a week later. An empty canvas with no
     explanation looks exactly like "the update deleted my work". */
  if (loadFailed) {
    hint(t('msg.loadFailedShort'));
    const where = (DATA && DATA.paths) ? (DATA.paths().root || DATA.paths().userData) : '';
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
  // the slash menu's last row, as Notion's: "Close menu  esc" — pressed without taking the caret
  $('slashClose').addEventListener('mousedown', (e) => { e.preventDefault(); closeSlash(); });
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
  if (WIN && WIN.onQuitKey) WIN.onQuitKey(() => closeAndQuit(true));
  /* Ctrl+Q heard by the page too, in the capture phase so nothing on the page
     (a note's editor stops its keys from bubbling) can keep it from here. When
     main has heard it first it was cancelled there and never arrives; when it
     arrives, main never saw it, and is told to start its deadline. */
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyQ')) return;
    e.preventDefault(); e.stopPropagation();
    if (WIN && WIN.quitAsked) WIN.quitAsked();
    closeAndQuit(true);
  }, true);
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
  $('embedFile').addEventListener('click', embedVideoFile);
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
    const p = PAD_PRESETS[b.dataset.density];
    if (!p) return;
    state.settings.notePad = Object.assign({}, p);
    state.settings.noteDensity = b.dataset.density; applySettings(); syncSettingsUI(); saveSoon();
  }));
  $('fontSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.noteFont = NOTE_FONTS.includes(b.dataset.font) ? b.dataset.font : 'system';
    applySettings(); syncSettingsUI(); saveSoon();
  }));
  $('shadowSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.noteShadow = NOTE_SHADOWS.includes(b.dataset.shadow) ? b.dataset.shadow : 'soft';
    applySettings(); syncSettingsUI(); saveSoon();
  }));
  /* What a new note starts as. `input`, not `change`: the number beside the
     slider is the only preview these two have, so it has to follow the thumb. */
  buildNoteColorSwatches();
  $('noteW').addEventListener('input', () => {
    state.settings.noteW = clamp(+$('noteW').value || 280, NOTE_MIN_W, 900);
    $('noteWVal').textContent = num(state.settings.noteW);
    saveSoon();
  });
  $('noteH').addEventListener('input', () => {
    state.settings.noteH = clamp(+$('noteH').value || 190, NOTE_MIN_H, 900);
    $('noteHVal').textContent = num(state.settings.noteH);
    saveSoon();
  });
  $('setConfirmDelete').addEventListener('change', () => {
    state.settings.confirmDelete = $('setConfirmDelete').checked; saveSoon();
  });
  $('btnResetSettings').addEventListener('click', resetSettings);
  $('statusAdd').addEventListener('click', addStatus);

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
  ['#btnAgenda', 'calendar_month'],
  ['#btnKanban', 'view_column'],
  ['#agendaClose', 'close'],
  ['#kanbanClose', 'close'],
  ['#setMinimap + .row-ic', 'map'],

  /* text toolbar */
  ['#selBar [data-cmd="bold"]', 'format_bold'],
  ['#selBar [data-cmd="italic"]', 'format_italic'],
  ['#selBar [data-cmd="underline"]', 'format_underlined'],
  ['#selBar [data-cmd="strikeThrough"]', 'format_strikethrough'],
  ['#selBar [data-act="code"]', 'code'],
  ['#selBar [data-cmd="superscript"]', 'superscript'],
  ['#selBar [data-cmd="subscript"]', 'subscript'],
  ['#selBar [data-act="math"]', 'functions'],
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
  ['#colsBar [data-cb="even"]', 'view_column'],

  /* palette, capture, reminders, history, passphrase, board picker */
  ['#palette .pal-head-ic', 'search'],
  ['#capture .cap-ic', 'bolt'],
  ['#capSave .b-ic', 'add'],
  ['#btnBackupAll .b-ic', 'inventory_2'],
  ['#btnEraseAll .b-ic', 'delete_forever'],
  ['h3:has([data-t="set.backupHead"]) .sec-ic', 'cloud'],
  ['h3:has([data-t="set.filesHead"]) .sec-ic', 'folder'],
  ['h3:has([data-t="set.startAgain"]) .sec-ic', 'restart_alt'],
  ['#moveNewOk .b-ic', 'folder'],
  ['#moveClose', 'close'],
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
  ['label:has([data-t="set.files"]) .row-ic', 'folder'],
  ['#btnOpenTrash .b-ic', 'open_in_full'],
  ['#btnEmptyTrash .b-ic', 'delete_forever'],
  ['label:has([data-t="set.showArchived"]) .row-ic', 'archive'],
  ['h3:has([data-t="set.habits"]) .sec-ic', 'bolt'],
  ['#setCapture + .row-ic', 'bolt'],
  ['#setBackground + .row-ic', 'restart_alt'],
  ['label:has([data-t="set.backup"]) .row-ic', 'shield'],
  ['label:has([data-t="set.backupAll"]) .row-ic', 'inventory_2'],
  ['label:has([data-t="set.import"]) .row-ic', 'upload'],
  ['label:has([data-t="set.exportImage"]) .row-ic', 'image'],
  ['label:has([data-t="set.wipeRow"]) .row-ic', 'delete'],
  ['label:has([data-t="set.eraseAll"]) .row-ic', 'delete_forever'],
  ['#btnBackupNow .b-ic', 'cloud'],
  ['#btnCleanFiles .b-ic', 'cleaning_services'],
  ['#btnBackupFolder .b-ic', 'folder_open'],
  ['#setBackupAuto + .row-ic', 'schedule'],
  ['label:has([data-t="set.autosave"]) .row-ic', 'autorenew'],
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
  ['#imgBar [data-img="out"]', 'north_east'],
  ['#imgBar [data-img="delete"]', 'delete'],
  ['#stTools [data-tool="crop"]', 'crop'],
  ['#stTools [data-tool="adjust"]', 'tune'],
  ['#stTools [data-tool="pen"]', 'draw'],
  ['#stTools [data-tool="marker"]', 'ink_highlighter'],
  ['#stTools [data-tool="eraser"]', 'ink_eraser'],
  ['#stUndo', 'undo'],
  ['#stRedo', 'redo'],
  ['#stZoomOut', 'zoom_out'],
  ['#stZoomIn', 'zoom_in'],
  ['#stFit', 'fit_screen'],
  ['#stTools [data-tool="box"]', 'crop_square'],
  ['#stTools [data-tool="arrow"]', 'north_east'],
  ['#stTools [data-tool="text"]', 'title'],
  ['#stRotate .b-ic', 'rotate_right'],
  ['#stReset .b-ic', 'restart_alt'],
  ['#stCancel .b-ic', 'close'],
  ['#stApply .b-ic', 'check'],

  ['.set-find .sf-ic', 'search'],
  ['#setSearchClear', 'close'],

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
  ['#embedFile .b-ic', 'movie'],
  ['label:has([data-t="set.accent"]) .row-ic', 'colorize'],
  ['label:has([data-t="set.canvasBg"]) .row-ic', 'grid_on'],
  ['label:has([data-t="set.gridSize"]) .row-ic', 'grid_view'],
  ['label:has([data-t="set.gridFade"]) .row-ic', 'blur_on'],
  ['label:has([data-t="set.textSize"]) .row-ic', 'text_fields'],
  /* The Graphics row shipped with an empty slot — the label is icon-and-text
     like every other row here, and the icon simply had no line in this table.
     Nothing errors when that happens: the slot is a <span> with nothing in it,
     so the row is a few pixels of blank where every neighbour has a glyph. */
  ['label:has([data-t="set.perf"]) .row-ic', 'memory'],
  ['label:has([data-t="set.wheel"]) .row-ic', 'mouse'],
  ['label:has([data-t="set.zoomSpeed"]) .row-ic', 'av_timer'],
  ['label:has([data-t="set.motion"]) .row-ic', 'waves'],
  ['#setSounds + .row-ic', 'volume_up'],
  ['.set-tab[data-tab="extra"] .tab-ic', 'auto_awesome'],
  ['.set-tab[data-tab="wallpaper"] .tab-ic', 'landscape'],
  ['.set-tab[data-tab="drawing"] .tab-ic', 'draw'],
  ['.set-tab[data-tab="books"] .tab-ic', 'menu_book'],
  ['h3:has(> [data-t="set.extra"]) .sec-ic', 'auto_awesome'],
  ['h3:has([data-t="set.extraBoard"]) .sec-ic', 'push_pin'],
  ['label:has([data-t="set.keySounds"]) .row-ic', 'keyboard'],
  ['label:has([data-t="set.keyVol"]) .row-ic', 'graphic_eq'],
  ['label:has([data-t="set.cork"]) .row-ic', 'push_pin'],
  ['h3:has([data-t="set.pad"]) .sec-ic', 'draw'],
  ['label:has([data-t="set.padPair"]) .row-ic', 'smartphone'],
  ['#padBtn .b-ic', 'wifi'],
  ['#btnResetAll .b-ic', 'restart_alt'],
  ['label:has([data-t="set.soundVol"]) .row-ic', 'graphic_eq'],
  ['#setGuides + .row-ic', 'straighten'],
  ['#setSoftware + .row-ic', 'memory'],
  ['#setFocusMode + .row-ic', 'visibility_off'],
  ['label:has([data-t="set.noteFont"]) .row-ic', 'text_fields'],
  ['label:has([data-t="set.noteShadow"]) .row-ic', 'layers'],
  ['h3:has([data-t="set.newNote"]) .sec-ic', 'add'],
  ['label:has([data-t="set.newNoteColor"]) .row-ic', 'palette'],
  ['label:has([data-t="set.newNoteW"]) .row-ic', 'straighten'],
  ['label:has([data-t="set.newNoteH"]) .row-ic', 'square_foot'],
  ['#setConfirmDelete + .row-ic', 'help'],
  ['label:has([data-t="set.resetSettings"]) .row-ic', 'restart_alt'],
  ['#btnResetSettings .b-ic', 'refresh'],
  ['#setSnap + .row-ic', 'grid_on'],
  ['#setCompass + .row-ic', 'my_location'],
  ['#setSpell + .row-ic', 'checklist'],
  ['label:has([data-t="set.rail"]) .row-ic', 'space_dashboard'],
  ['h3:has([data-t="set.notes"]) .sec-ic', 'sticky_note_2'],
  ['label:has([data-t="set.shape"]) .row-ic', 'crop_square'],
  ['label:has([data-t="set.density"]) .row-ic', 'view_list'],
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
  ['#mathCancel', 'close'],
  ['#mathRemove .b-ic', 'delete'],
  ['#mathOk .b-ic', 'check'],
  ['#iconRemove .b-ic', 'close'],
  ['#iconPicker .ip-find-ic', 'search'],
  ['#linkRemove .b-ic', 'link_off'],
  ['#linkOk .b-ic', 'check'],
  ['#confirmNo .b-ic', 'close'],
  ['#confirmYes .b-ic', 'check'],

  /* templates */
  ['h3:has([data-t="set.templates"]) .sec-ic', 'bookmarks'],
  ['#tplCancel', 'close'],
  ['#dbRdClose', 'close'],
  ['#bhAdd', 'add'],
  ['#bhGrip', 'drag_indicator'],
  ['#selBar [data-act="color"]', 'format_color_text'],
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
  /* The date and time fields' picker buttons. Chromium draws those with the
     operating system's own glyphs — a calendar and a clock in Windows' line
     weight, off-centre in the field and unlike every other icon here. CSS
     masks them with these instead (mental.css §60), built from the same set
     as everything else; a data: URL, which the CSP allows for images. */
  const glyph = (name) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ICON_BOX}"><path d="${ICONS[name]}"/></svg>`)}")`;
  document.documentElement.style.setProperty('--ico-event', glyph('event'));
  document.documentElement.style.setProperty('--ico-more', glyph('expand_more'));
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
