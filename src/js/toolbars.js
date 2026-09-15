/* Mental Board — toolbars.js
   The floating selection toolbar and the slash menu that sit over the editor.

   Part 9 of 17. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* --- floating selection toolbar --------------------------------------- */
/* The toolbar must not move while you are using it. Applying a heading makes
   the text bigger, which moves the selection rectangle, which used to move the
   toolbar out from under the cursor — so a second click landed on whatever
   button had slid into that spot. Once a command has been run the bar is
   pinned in place until the user makes a fresh selection. */
let selBarPinned = false;

function hideSelBar() { $('selBar').classList.add('hidden'); $('hilitePop').classList.remove('open'); selBarPinned = false; }
function unpinSelBar() { selBarPinned = false; }

function showSelBar() {
  if (!editing) { hideSelBar(); return; }
  // Focusing the size box collapses the document selection, which would
  // otherwise hide the toolbar the box lives in — taking the box's focus with
  // it, so the digits ended up in the note instead.
  if (document.activeElement && $('selBar').contains(document.activeElement)) return;
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) { hideSelBar(); return; }
  if (!editing.contains(s.anchorNode)) { hideSelBar(); return; }
  const r = s.getRangeAt(0).getBoundingClientRect();
  if (!r.width && !r.height) { hideSelBar(); return; }
  const bar = $('selBar');
  const wasHidden = bar.classList.contains('hidden');
  bar.classList.remove('hidden');
  if (wasHidden || !selBarPinned) {
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let left = r.left + r.width / 2 - bw / 2;
    let top = r.top - bh - 9;
    if (top < 44) top = r.bottom + 9;
    bar.style.left = clamp(left, 8, innerWidth - bw - 8) + 'px';
    bar.style.top = clamp(top, 44, innerHeight - bh - 8) + 'px';
  }
  syncSelBarState();
}

function syncSelBarState() {
  const bar = $('selBar');
  ['bold', 'italic', 'underline', 'strikeThrough'].forEach((c) => {
    const b = bar.querySelector(`[data-cmd="${c}"]`);
    if (b) { try { b.classList.toggle('on', document.queryCommandState(c)); } catch (_) {} }
  });
  const blk = editing ? caretBlock(editing) : null;
  bar.querySelectorAll('[data-block]').forEach((b) => {
    b.classList.toggle('on', !!blk && blk.tagName.toLowerCase() === b.dataset.block);
  });
  const codeBtn = bar.querySelector('[data-act="code"]');
  if (codeBtn) { const c = caretClosest('code'); codeBtn.classList.toggle('on', !!c && !c.closest('pre')); }
  const al = currentAlign();
  bar.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', b.dataset.align === al));
  const px = selectionFontPx();
  if (px) syncFontInput(px);
}

// run a formatting command with the bar pinned so it stays under the cursor
function runFormat(fn) {
  if (!editing) return;
  selBarPinned = true;
  editing.focus();
  fn();
  persistEdit();
  syncSelBarState();
}

/* ---- font size ----------------------------------------------------------
   Sizes are absolute pixels on a `span.mb-fs`, never relative steps. The old
   em-based `fs-*` classes multiplied when they nested, so clicking A+ five
   times on the same words produced five nested spans and text the size of the
   note. An absolute px on the innermost span always wins, so nesting is
   harmless — and the unwrap below keeps the markup tidy anyway. */
const FS_MIN = 8, FS_MAX = 96;

function selectionFontPx() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (n && n.nodeType === 3) n = n.parentElement;
  if (!n || !editing || !editing.contains(n)) return null;
  const px = parseFloat(getComputedStyle(n).fontSize);
  return px ? Math.round(px) : null;
}

function wrapSelection(tag, cls) {
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) return null;
  const r = s.getRangeAt(0);
  const frag = r.extractContents();
  if (frag.querySelectorAll) {
    // never nest the same tag inside itself
    frag.querySelectorAll(tag).forEach((el) => el.replaceWith(...el.childNodes));
  }
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  el.appendChild(frag);
  r.insertNode(el);
  const nr = document.createRange(); nr.selectNodeContents(el);
  s.removeAllRanges(); s.addRange(nr);
  return el;
}

function applyFontPx(px) {
  px = clamp(Math.round(px || 0), FS_MIN, FS_MAX);
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed) return;
  const r = s.getRangeAt(0);
  const frag = r.extractContents();
  if (frag.querySelectorAll) {
    frag.querySelectorAll('span.mb-fs, span[class*="fs-"]').forEach((sp) => sp.replaceWith(...sp.childNodes));
  }
  const span = document.createElement('span');
  span.className = 'mb-fs';
  span.style.fontSize = px + 'px';
  span.appendChild(frag);
  r.insertNode(span);
  // if the new span is the only thing inside an older size span, drop the outer
  const outer = span.parentElement;
  if (outer && outer !== editing && outer.classList.contains('mb-fs') && outer.childNodes.length === 1) {
    outer.replaceWith(...outer.childNodes);
  }
  const nr = document.createRange(); nr.selectNodeContents(span);
  s.removeAllRanges(); s.addRange(nr);
  persistEdit();
  syncFontInput(px);
}

function stepFontSize(dir) {
  const cur = selectionFontPx() || 14;
  applyFontPx(cur + (dir === 'up' ? 2 : -2));
}
function syncFontInput(px) {
  const inp = $('fontPx');
  if (inp && px) inp.value = px;
}

// toggle, so a second click removes it instead of nesting <code><code>
function toggleInlineCode() {
  const c = caretClosest('code');
  if (c && !c.closest('pre')) { c.replaceWith(...c.childNodes); return; }
  wrapSelection('code', '');
}
function persistEdit() {
  if (!editing || !editNote) return;
  normalizeBody(editing);
  editNote.body = bodyHtml(editing);
  editDirty = true;
  saveSoon();
}

const HILITES = [['#ffd666', 'yellow'], ['#8fe3a2', 'green'], ['#8fd0ff', 'blue'], ['#ffa8c8', 'pink'], ['#c9a8ff', 'violet'], ['', 'none']];
function buildHilitePop() {
  const pop = $('hilitePop');
  pop.innerHTML = HILITES.map(([c, name]) =>
    `<button data-hi="${c}" title="${te('hilite.' + name)}" style="background:${c || 'transparent'}">${c ? '' : icon('close')}</button>`).join('');
  pop.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const c = b.dataset.hi;
    if (!editing) return;
    editing.focus();
    /* styleWithCSS has to be on for this one command — there is no HTML element
       for a background colour, so with it off Chromium produces nothing at all.

       **And it has to go straight back off.** It is a flag on the document, not
       an argument to the command, so leaving it set changed what every *later*
       command wrote for the rest of the session: after one click of the
       highlighter, Ctrl+B stopped producing `<b>bold</b>` and started producing
       `<span style="font-weight: bold">bold</span>`. Those spans then hit the
       paste sanitiser, which keeps `background-color` and not `font-weight` —
       so bold applied after a highlight was bold that vanished on the next
       copy. Two bugs, one line apart, from a flag nobody turned back. */
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, c ? hexToRgba(c, 0.42) : 'transparent');
    document.execCommand('styleWithCSS', false, false);
    persistEdit();
    pop.classList.remove('open');
  }));
}
function hexToRgba(hex, a) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function wireSelBar() {
  const bar = $('selBar');
  // Remember the range before focus can move anywhere; buttons additionally
  // keep the caret in the note by refusing the default focus shift.
  bar.addEventListener('mousedown', (e) => {
    if (editing) savedRange = keepRange();
    if (e.target.closest('button')) e.preventDefault();
  });
  bar.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () =>
    runFormat(() => document.execCommand(b.dataset.cmd))));
  // headings toggle: clicking H1 on an existing H1 goes back to plain text
  bar.querySelectorAll('[data-block]').forEach((b) => b.addEventListener('click', () => runFormat(() => {
    const blk = caretBlock(editing);
    const already = blk && blk.tagName.toLowerCase() === b.dataset.block;
    escapeList();
    document.execCommand('formatBlock', false, already ? 'p' : b.dataset.block);
    normalizeBody(editing);
  })));
  bar.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () =>
    runFormat(() => stepFontSize(b.dataset.size))));
  bar.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () =>
    runFormat(() => setParagraphDir(b.dataset.dir))));
  bar.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () =>
    runFormat(() => setAlign(b.dataset.align))));

  // type an exact size
  const px = $('fontPx');
  px.addEventListener('mousedown', (e) => e.stopPropagation());
  px.addEventListener('focus', () => { selBarPinned = true; savedRange = keepRange(); });
  px.addEventListener('change', () => commitFontPx());
  px.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commitFontPx(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      px.value = clamp((+px.value || 14) + (e.key === 'ArrowUp' ? 1 : -1), FS_MIN, FS_MAX);
      commitFontPx(true);
    }
    if (e.key === 'Escape') { e.preventDefault(); editing && editing.focus(); }
  });

  bar.querySelector('[data-act="code"]').addEventListener('click', () => runFormat(toggleInlineCode));
  bar.querySelector('[data-act="hilite"]').addEventListener('click', (e) => {
    e.stopPropagation(); selBarPinned = true; $('hilitePop').classList.toggle('open');
  });
  bar.querySelector('[data-act="link"]').addEventListener('click', () => openLinkDialog());
  bar.querySelector('[data-act="clear"]').addEventListener('click', () => runFormat(() => {
    document.execCommand('removeFormat');
    document.execCommand('formatBlock', false, 'p');
    const s = getSelection();
    if (editing) editing.querySelectorAll('span.mb-fs').forEach((sp) => {
      if (s.containsNode && s.containsNode(sp, true)) sp.replaceWith(...sp.childNodes);
    });
  }));
  buildHilitePop();
}

function keepRange() {
  const s = getSelection();
  return s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
}
function commitFontPx(keepFocus) {
  const inp = $('fontPx');
  const v = clamp(+inp.value || 14, FS_MIN, FS_MAX);
  inp.value = v;
  if (!editing) return;
  editing.focus();
  if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  selBarPinned = true;
  applyFontPx(v);
  savedRange = keepRange();
  if (keepFocus) inp.focus();
}

/* --- slash / block menu ----------------------------------------------- */
/* Labels come from the catalogue at render time — `block.<k>` for the name and
   `block.<k>.d` for the line under it — so the menu follows the language. */
/* `ic` is a Material Symbols name from assets/icons.js, not a literal glyph —
   the emoji this used to carry rendered in the system emoji font, so the menu
   was the one place in the app that ignored the theme's colours. */
const BLOCKS = [
  { k: 'text',    ic: 'format_paragraph',      run: () => document.execCommand('formatBlock', false, 'p') },
  { k: 'h1',      ic: 'format_h1',             run: () => document.execCommand('formatBlock', false, 'h1') },
  { k: 'h2',      ic: 'format_h2',             run: () => document.execCommand('formatBlock', false, 'h2') },
  { k: 'h3',      ic: 'format_h3',             run: () => document.execCommand('formatBlock', false, 'h3') },
  { k: 'todo',    ic: 'checklist',             run: insertTodo },
  { k: 'bullet',  ic: 'format_list_bulleted',  run: () => document.execCommand('insertUnorderedList') },
  { k: 'number',  ic: 'format_list_numbered',  run: () => document.execCommand('insertOrderedList') },
  { k: 'code',    ic: 'code',                  run: insertCodeBlock },
  { k: 'quote',   ic: 'format_quote',          run: () => document.execCommand('formatBlock', false, 'blockquote') },
  { k: 'callout', ic: 'lightbulb',             run: insertCallout },
  { k: 'divider', ic: 'horizontal_rule',       run: () => insertHTML('<hr><p><br></p>') },
  { k: 'table',   ic: 'table',                 run: () => insertTable(3, 3) },
  { k: 'columns', ic: 'view_column',           run: (n) => insertColumns(n || 2) },
  { k: 'image',   ic: 'image',                 run: pickAndInsertImage },
  { k: 'icon',    ic: 'mood',                  run: pickInlineIcon },
  { k: 'board',   ic: 'space_dashboard',       run: pickBoardLink },
  { k: 'link',    ic: 'add_link',              run: () => openLinkDialog() },
  { k: 'video',   ic: 'play_circle',           run: () => openEmbedDialog() }
];
const blockLabel = (b) => t('block.' + b.k);
const blockDesc = (b) => t('block.' + b.k + '.d');
/* Typing "/h1" has to work whatever the interface language is, so the English
   name and the key stay searchable alongside the translated one. */
function blockMatches(b, q) {
  if (!q) return true;
  const hay = [blockLabel(b), FALLBACK['block.' + b.k] || '', b.k];
  return hay.some((s) => foldSearch(s).includes(q));
}

/* --- templates ---------------------------------------------------------
   A template is a note you decided to keep the shape of. There are no built-in
   ones, on purpose: the seven that used to ship here were somebody else's
   workout, somebody else's meeting, and every one of them needed its own row in
   the string catalogue in every language. What a person actually wants is the
   note they already laid out the way they like it, again.

   So: right-click a note → "Save as template", and it is stored as literal
   HTML alongside the boards. It then appears in the slash menu, on an empty
   board, and in the jump palette, exactly where the built-in ones did.

   The body is the note's own saved HTML, which has already been through
   `sanitize()` on the way in — a template is not a new way for markup to get
   into a note, it is a copy of markup that is already there. */

const TPL_MAX = 40;                 // more than anyone sorts through by eye
const TPL_MAX_BYTES = 200 * 1024;   // one pasted image would be most of a board

const userTemplates = () => (Array.isArray(state.templates) ? state.templates : []);
const templateById = (id) => userTemplates().find((x) => x.id === id) || null;
const templateName = (x) => (x && x.name) || t('tpl.untitled');

/* Take an arbitrary stored shape and make it a valid template, or drop it.
   Same contract as adoptBoard: anything malformed is a missing template, never
   a broken one. */
function adoptTemplate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = typeof raw.body === 'string' ? raw.body : '';
  if (!body.trim() || body.length > TPL_MAX_BYTES) return null;
  const name = String(raw.name || '').trim().slice(0, 60);
  return {
    id: String(raw.id || uid()),
    name: name || t('tpl.untitled'),
    body,
    icon: okIcon(raw.icon),
    color: COLORS.includes(raw.color) ? raw.color : 'default',
    w: clamp(+raw.w || 280, NOTE_MIN_W, 1400),
    h: clamp(+raw.h || 190, NOTE_MIN_H, 1400)
  };
}

/* The first heading or line of a note, as a default name — so saving a
   template is one keystroke away from being finished. */
function noteHeadline(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  d.querySelectorAll('svg, .mb-code').forEach((x) => x.remove());
  const first = d.querySelector('h1, h2, h3, p, li, td, th');
  const text = ((first ? first.textContent : d.textContent) || '').trim();
  return text.replace(/\s+/g, ' ').slice(0, 60);
}

/* Turn a note into a template. Same name as an existing one replaces it rather
   than making a second entry — "save it again" is what a user means by saving
   over a name they already used, and two identical rows in the slash menu is
   the worst of both. */
function addTemplate(name, note) {
  const tpl = adoptTemplate({
    name, body: note.body, icon: note.icon, color: note.color, w: note.w, h: note.h
  });
  if (!tpl) { toast(t('tpl.emptyNote')); return null; }
  if (!Array.isArray(state.templates)) state.templates = [];
  const at = state.templates.findIndex((x) => x.name.toLowerCase() === tpl.name.toLowerCase());
  if (at >= 0) {
    tpl.id = state.templates[at].id;
    state.templates[at] = tpl;
    toast(t('tpl.replaced', { name: tpl.name }));
  } else {
    state.templates.push(tpl);
    if (state.templates.length > TPL_MAX) state.templates.shift();
    toast(t('tpl.saved', { name: tpl.name }));
  }
  save();
  renderTemplateList();
  updateEmpty();
  return tpl;
}

function deleteTemplate(id) {
  const tpl = templateById(id);
  if (!tpl) return;
  confirmDlg(t('tpl.delete'), t('tpl.confirmDel', { name: tpl.name }), t('tpl.delete')).then((ok) => {
    if (!ok) return;
    state.templates = userTemplates().filter((x) => x.id !== id);
    save();
    renderTemplateList();
    updateEmpty();
    toast(t('tpl.deleted', { name: tpl.name }));
  });
}

/* ---- the "save as template" dialog ---- */
let tplFromNote = null;

function openTemplateDialog(noteId) {
  const n = state.notes.find((x) => x.id === noteId);
  if (!n) return;
  // the note may still be open, with the newest text only in the DOM
  if (editing && editNote && editNote.id === noteId) persistEdit();
  if (!(n.body || '').trim()) { toast(t('tpl.emptyNote')); return; }
  tplFromNote = n;
  const inp = $('tplName');
  inp.value = noteHeadline(n.body);
  $('tplDlg').classList.remove('hidden');
  setTimeout(() => { inp.focus(); inp.select(); }, 20);
}
function closeTemplateDialog() {
  $('tplDlg').classList.add('hidden');
  tplFromNote = null;
}
function submitTemplate() {
  if (!tplFromNote) { closeTemplateDialog(); return; }
  const name = ($('tplName').value || '').trim();
  addTemplate(name, tplFromNote);
  closeTemplateDialog();
}

/* ---- the list in Settings ---- */
function renderTemplateList() {
  const wrap = $('tplList');
  if (!wrap) return;
  const list = userTemplates();
  if (!list.length) {
    wrap.innerHTML = `<p class="set-note dim">${te('tpl.none')} ${te('tpl.hint')}</p>`;
    return;
  }
  wrap.innerHTML = list.map((x) => `
    <div class="tpl-row" data-id="${esc(x.id)}">
      <span class="tpl-ic" data-color="${esc(x.color)}">${icon(x.icon || 'sticky_note_2')}</span>
      <span class="tpl-name" dir="auto">${esc(x.name)}</span>
      <button class="tpl-act" data-act="use" title="${te('tpl.insert')}">${icon('add')}</button>
      <button class="tpl-act danger" data-act="del" title="${te('tpl.delete')}">${icon('delete')}</button>
    </div>`).join('') +
    `<p class="set-note dim">${te('tpl.hint')}</p>`;
  wrap.querySelectorAll('.tpl-act').forEach((b) => b.addEventListener('click', () => {
    const id = b.closest('.tpl-row').dataset.id;
    if (b.dataset.act === 'del') { deleteTemplate(id); return; }
    closeSettings();
    applyTemplate(id);
  }));
}

/* Insert into the note being edited, or make a new note if there isn't one.
   Both routes exist because both entry points do: `/workout` while typing, and
   a card on the empty board when there is nothing to type in yet. */
function applyTemplate(id, worldPt) {
  const tpl = templateById(id);
  if (!tpl) return;
  if (editing && editNote) {
    escapeList();
    insertHTML(tpl.body + '<p><br></p>');
    normalizeBody(editing);
    persistEdit();
    return;
  }
  /* edit:false on purpose — the note already has content, and dropping straight
     into edit mode would put the caret somewhere arbitrary in a filled-in table.
     Seeing what arrived is more useful than being able to type immediately. */
  const n = addNote(worldPt, {
    w: tpl.w, h: tpl.h, body: tpl.body, color: tpl.color, icon: tpl.icon, edit: false
  });
  if (!n) return;
  save();
  toast(t('msg.templateAdded', { name: templateName(tpl) }));
}

const slash = { open: false, body: null, node: null, offset: 0, query: '', items: [], sel: 0 };

function openSlash(body) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return;
  const node = s.anchorNode;
  if (!node || node.nodeType !== 3) return;
  if (node.textContent[s.anchorOffset - 1] !== '/') return;
  slash.open = true; slash.body = body; slash.node = node;
  slash.offset = s.anchorOffset;    // just after the '/'
  slash.query = ''; slash.sel = 0;
  renderSlash();
  positionSlash();
}
function closeSlash() {
  if (!slash.open) return;
  slash.open = false;
  $('slashMenu').classList.add('hidden');
}
function updateSlash() {
  const s = getSelection();
  if (!s.rangeCount || s.anchorNode !== slash.node || s.anchorOffset < slash.offset) { closeSlash(); return; }
  const q = slash.node.textContent.slice(slash.offset, s.anchorOffset);
  if (/\s{2,}/.test(q) || q.length > 18) { closeSlash(); return; }
  slash.query = q; slash.sel = 0;
  renderSlash();
  positionSlash();
}
/* Templates share the slash menu with blocks rather than living behind their own
   command. Typing the name of a template you made should find it for the same
   reason `/h1` finds a heading — one place to type, one list to read. They are
   ordered after the blocks and given their own heading, so the common case (a
   heading, a list) is still the first thing under the cursor.

   The description is the template's first line, which is the only thing the app
   knows about a template it did not write. */
function templateMatches(x, q) {
  if (!q) return true;
  return foldSearch(templateName(x)).includes(q);
}
function slashItems(q) {
  return [
    ...BLOCKS.filter((b) => blockMatches(b, q)).map((b) => ({
      kind: 'block', ic: b.ic, name: blockLabel(b), desc: blockDesc(b), run: b
    })),
    ...userTemplates().filter((x) => templateMatches(x, q)).map((x) => ({
      kind: 'tpl', ic: x.icon || 'sticky_note_2', name: templateName(x),
      desc: noteHeadline(x.body), run: x
    }))
  ];
}

function renderSlash() {
  const q = foldSearch(slash.query.trim());
  slash.items = slashItems(q);
  const list = $('slashList');
  if (!slash.items.length) {
    list.innerHTML = `<div class="sm-empty">${te('blocks.none')}</div>`;
  } else {
    let lastKind = '';
    list.innerHTML = slash.items.map((it, i) => {
      // a heading the first time the kind changes, so the two halves read apart
      const head = it.kind !== lastKind && it.kind === 'tpl'
        ? `<div class="sm-head sm-head-mid">${te('blocks.templates')}</div>` : '';
      lastKind = it.kind;
      return head +
        `<button class="sm-item${i === slash.sel ? ' sel' : ''}" data-i="${i}">
           <span class="sm-ic">${icon(it.ic)}</span>
           <span class="sm-tx"><b>${esc(it.name)}</b><span>${esc(it.desc)}</span></span>
         </button>`;
    }).join('');
    list.querySelectorAll('.sm-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); runSlash(+el.dataset.i); });
      el.addEventListener('mouseenter', () => { slash.sel = +el.dataset.i; markSlashSel(); });
    });
  }
  $('slashMenu').classList.remove('hidden');
}
function markSlashSel() {
  $('slashList').querySelectorAll('.sm-item').forEach((el, i) => {
    const on = i === slash.sel;
    el.classList.toggle('sel', on);
    // the list scrolls; without this the highlight walks off the bottom and
    // Enter picks something you cannot see
    if (on) el.scrollIntoView({ block: 'nearest' });
  });
}
function positionSlash() {
  const s = getSelection();
  if (!s.rangeCount) return;
  const r = s.getRangeAt(0).getBoundingClientRect();
  const m = $('slashMenu');
  const w = m.offsetWidth, h = m.offsetHeight;
  let left = RTL ? ((r.right || innerWidth / 2) - w) : (r.left || innerWidth / 2);
  let top = (r.bottom || innerHeight / 2) + 7;
  if (top + h > innerHeight - 8) top = Math.max(44, (r.top || 0) - h - 7);
  m.style.left = clamp(left, 8, innerWidth - w - 8) + 'px';
  m.style.top = top + 'px';
}
function slashKey(e) {
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { closeSlash(); return; }
  if (e.key === 'ArrowDown') { slash.sel = (slash.sel + 1) % Math.max(1, slash.items.length); markSlashSel(); return; }
  if (e.key === 'ArrowUp') { slash.sel = (slash.sel - 1 + slash.items.length) % Math.max(1, slash.items.length); markSlashSel(); return; }
  if (e.key === 'Enter' || e.key === 'Tab') runSlash(slash.sel);
}
function runSlash(i) {
  const item = slash.items[i];
  const body = slash.body, node = slash.node, off = slash.offset, q = slash.query;
  closeSlash();
  if (!item || !body) return;
  // remove the "/query" the user typed
  try {
    const r = document.createRange();
    r.setStart(node, Math.max(0, off - 1));
    r.setEnd(node, Math.min(node.textContent.length, off + q.length));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    document.execCommand('delete');
  } catch (_) {}
  body.focus();
  if (item.kind === 'tpl') { applyTemplate(item.run.id); return; }
  const b = item.run;
  // these replace the whole line, so lift it out of any list it sits in first
  if (['text', 'h1', 'h2', 'h3', 'quote', 'divider'].includes(b.k)) escapeList();
  /* A number anywhere in what was typed is passed to the block. `/columns 4`
     and `/col4` both give four; a block that takes no argument ignores it. It
     costs one regex and saves the only real alternative, which was five nearly
     identical rows in the menu — one per column count — pushing everything else
     below the fold. */
  const arg = (q.match(/\d+/) || [])[0];
  b.run(arg ? +arg : undefined);
  persistEdit();
}
