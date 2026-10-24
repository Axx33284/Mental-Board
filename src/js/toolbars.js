/* Mental Board — toolbars.js
   The floating selection toolbar and the slash menu that sit over the editor.

   Part 11 of 22. These files are plain scripts sharing one global
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

function hideSelBar() { $('selBar').classList.add('hidden'); $('hilitePop').classList.remove('open'); $('colorPop').classList.remove('open'); selBarPinned = false; }
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
  ['bold', 'italic', 'underline', 'strikeThrough', 'superscript', 'subscript'].forEach((c) => {
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

/* Size the selected text — the text, and nothing else.

   This used to extract the whole selected range and put it back inside one
   size span. Within a paragraph that is fine. Across blocks it is not: the
   extracted fragment carries copies of every block the range cut through, so a
   selection running from one column into the next came back as a <span>
   holding a half-copy of the `.mb-cols` grid — a grid inside a column, inside a
   paragraph — and the columns visibly fell apart. Lists and headings were
   split the same way, only less obviously.

   Now each text node in the range is sized where it stands. Block structure is
   never touched, so there is nothing for any selection to break; a run that is
   already the whole of a size span just has that span's size changed, rather
   than gaining a second span around it. */
function applyFontPx(px) {
  px = clamp(Math.round(px || 0), FS_MIN, FS_MAX);
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed || !editing) return;
  const r = s.getRangeAt(0);
  const runs = textRunsIn(r, editing);
  if (!runs.length) return;
  const spans = runs.map((t) => {
    const p = t.parentElement;
    if (p && p !== editing && p.classList.contains('mb-fs') && p.childNodes.length === 1) {
      p.style.fontSize = px + 'px';
      return p;
    }
    const span = document.createElement('span');
    span.className = 'mb-fs';
    span.style.fontSize = px + 'px';
    t.replaceWith(span);
    span.appendChild(t);
    return span;
  });
  const nr = document.createRange();
  nr.setStartBefore(spans[0].firstChild); nr.setEndAfter(spans[spans.length - 1].lastChild);
  s.removeAllRanges(); s.addRange(nr);
  persistEdit();
  syncFontInput(px);
}
/* The text nodes a range covers, split at its two ends so each one lies wholly
   inside it. Whitespace that only separates blocks is skipped (wrapping it
   would put a span between two paragraphs), and so is anything in a part of
   the note that is not text: an embed card, an inline icon. */
function textRunsIn(r, root) {
  const anchor = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
  const walker = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let n = walker.currentNode.nodeType === 3 ? walker.currentNode : walker.nextNode(); n; n = walker.nextNode()) {
    if (!r.intersectsNode(n) || !root.contains(n)) continue;
    const p = n.parentElement;
    if (p && p.closest('.mb-embed, [contenteditable="false"], svg')) continue;
    if (!n.textContent.trim() && p && /^(DIV|UL|OL|TABLE|TBODY|THEAD|TR)$/.test(p.tagName)) continue;
    hits.push(n);
  }
  if (!hits.length) return hits;
  // split the two ends; the end first, so splitting the start cannot move its offset
  const last = hits[hits.length - 1];
  if (last === r.endContainer && r.endOffset < last.length) last.splitText(r.endOffset);
  const first = hits[0];
  if (first === r.startContainer && r.startOffset > 0) {
    if (r.startOffset >= first.length) hits.shift();
    else hits[0] = first.splitText(r.startOffset);
  }
  return hits.filter((t) => t.length);
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
    // a toggle's title takes the heading as its level; formatBlock would turn its <div> into the heading (blocks.js)
    const head = caretClosest('.mb-tg-head');
    if (head) {
      const tg = head.parentElement, lvl = 'toggleH' + b.dataset.block.slice(1);
      setToggleLevel(tg, blockKind(tg) === lvl ? 'toggle' : lvl);
      return;
    }
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
    e.stopPropagation(); selBarPinned = true; $('colorPop').classList.remove('open'); $('hilitePop').classList.toggle('open');
  });
  // Notion's "A": the selected words' text or background colour (blocks.js, buildColorPop)
  bar.querySelector('[data-act="color"]').addEventListener('click', (e) => {
    e.stopPropagation(); selBarPinned = true;
    colorRange = savedRange;
    $('hilitePop').classList.remove('open');
    $('colorPop').classList.toggle('open');
  });
  bar.querySelector('[data-act="link"]').addEventListener('click', () => openLinkDialog());
  // the selected words become the formula's LaTeX; nothing selected opens it empty
  bar.querySelector('[data-act="math"]').addEventListener('click', () => {
    const s = getSelection();
    const text = s.rangeCount ? s.toString().trim() : '';
    openMathDialog(null, { tex: text, block: false });
  });
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
/* 2.8: in Notion's sections and Notion's order — Basic blocks, Media,
   Database, Advanced blocks, Inline — read out of the Notion desktop app's
   own slash menu (MAP.md §4z6). `sec` is the section; `kw` is the extra words
   a block answers to, Notion's fuzzy-search keywords, so `/kanban` finds the
   board and `/hr` the divider. They are search terms, not interface text, so
   they stay English like the key itself. `fresh` puts a "New" badge on it. */
const BLOCKS = [
  { k: 'text',    sec: 'basic', ic: 'format_paragraph',      kw: 'paragraph plain p',           run: () => document.execCommand('formatBlock', false, 'p') },
  { k: 'h1',      sec: 'basic', ic: 'format_h1',             kw: 'heading 1 h1 title big',      run: () => document.execCommand('formatBlock', false, 'h1') },
  { k: 'h2',      sec: 'basic', ic: 'format_h2',             kw: 'heading 2 h2 subheading',     run: () => document.execCommand('formatBlock', false, 'h2') },
  { k: 'h3',      sec: 'basic', ic: 'format_h3',             kw: 'heading 3 h3 small',          run: () => document.execCommand('formatBlock', false, 'h3') },
  { k: 'bullet',  sec: 'basic', ic: 'format_list_bulleted',  kw: 'bulleted list unordered ul',  run: () => document.execCommand('insertUnorderedList') },
  { k: 'number',  sec: 'basic', ic: 'format_list_numbered',  kw: 'numbered list ordered ol',    run: () => document.execCommand('insertOrderedList') },
  { k: 'letters', sec: 'basic', ic: 'format_list_numbered',  kw: 'lettered list alphabet abc',  run: () => insertStyledList('la') },
  { k: 'roman',   sec: 'basic', ic: 'format_list_numbered_rtl', kw: 'roman numerals list',      run: () => insertStyledList('ur') },
  { k: 'todo',    sec: 'basic', ic: 'checklist',             kw: 'to-do todo checkbox task',    run: insertTodo },
  // 2.9: toggles (blocks.js) — the line the caret is on becomes one
  { k: 'toggle',  sec: 'basic', ic: 'arrow_right',           kw: 'toggle list collapse expand fold details', fresh: true, run: () => turnCaretBlock('toggle') },
  { k: 'callout', sec: 'basic', ic: 'lightbulb',             kw: 'callout tip note box',        run: insertCallout },
  { k: 'quote',   sec: 'basic', ic: 'format_quote',          kw: 'quote blockquote citation',   run: () => document.execCommand('formatBlock', false, 'blockquote') },
  { k: 'table',   sec: 'basic', ic: 'table',                 kw: 'simple table grid',           run: () => insertTable(3, 3) },
  { k: 'divider', sec: 'basic', ic: 'horizontal_rule',       kw: 'divider horizontal rule hr line separator', run: () => insertHTML('<hr><p><br></p>') },
  { k: 'link',    sec: 'basic', ic: 'add_link',              kw: 'link to page note url ltp',   run: () => openLinkDialog() },
  { k: 'image',   sec: 'media', ic: 'image',                 kw: 'image picture photo img gif', run: pickAndInsertImage },
  { k: 'video',   sec: 'media', ic: 'play_circle',           kw: 'video youtube vimeo embed',   run: () => openEmbedDialog() },
  { k: 'code',    sec: 'media', ic: 'code',                  kw: 'code snippet program',        run: insertCodeBlock },
  { k: 'bookmark', sec: 'media', ic: 'bookmark',             kw: 'web bookmark link card url',  run: () => openEmbedDialog('bookmark') },
  // 2.8: Notion's Database section, in its order (database.js)
  { k: 'dbTable',     sec: 'database', ic: 'table',          kw: 'table view database grid spreadsheet', fresh: true, run: () => insertDatabase('table') },
  { k: 'dbBoard',     sec: 'database', ic: 'view_kanban',    kw: 'board view kanban columns',  fresh: true, run: () => insertDatabase('board') },
  { k: 'dbGallery',   sec: 'database', ic: 'grid_view',      kw: 'gallery view cards grid',    fresh: true, run: () => insertDatabase('gallery') },
  { k: 'dbList',      sec: 'database', ic: 'view_list',      kw: 'list view database',         fresh: true, run: () => insertDatabase('list') },
  { k: 'dbCalendar',  sec: 'database', ic: 'calendar_month', kw: 'calendar view month dates',  fresh: true, run: () => insertDatabase('calendar') },
  { k: 'dbTimeline',  sec: 'database', ic: 'view_timeline',  kw: 'timeline view gantt roadmap', fresh: true, run: () => insertDatabase('timeline') },
  { k: 'dbFeed',      sec: 'database', ic: 'dynamic_feed',   kw: 'feed view posts stream',     fresh: true, run: () => insertDatabase('feed') },
  { k: 'dbDashboard', sec: 'database', ic: 'dashboard',      kw: 'dashboard view widgets',     fresh: true, run: () => insertDatabase('dashboard') },
  { k: 'dbMap',       sec: 'database', ic: 'map',            kw: 'map view places location',   fresh: true, run: () => insertDatabase('map') },
  { k: 'dbBar',       sec: 'database', ic: 'bar_chart',      kw: 'vertical bar chart graph column', fresh: true, run: () => insertDatabase('chart', 'bar') },
  { k: 'dbHbar',      sec: 'database', ic: 'align_horizontal_left', kw: 'horizontal bar chart graph', fresh: true, run: () => insertDatabase('chart', 'hbar') },
  { k: 'dbLine',      sec: 'database', ic: 'show_chart',     kw: 'line chart graph trend',     fresh: true, run: () => insertDatabase('chart', 'line') },
  { k: 'dbDonut',     sec: 'database', ic: 'donut_large',    kw: 'donut pie chart ring',       fresh: true, run: () => insertDatabase('chart', 'donut') },
  { k: 'dbNumber',    sec: 'database', ic: 'numbers',        kw: 'number chart kpi metric total', fresh: true, run: () => insertDatabase('chart', 'number') },
  { k: 'dbInline',    sec: 'database', ic: 'database',       kw: 'database inline new',        fresh: true, run: () => insertDatabase('table') },
  { k: 'dbForm',      sec: 'database', ic: 'assignment',     kw: 'form survey questions',      fresh: true, run: () => insertDatabase('form') },
  { k: 'dbPage',      sec: 'database', ic: 'description',    kw: 'database full page',         fresh: true, run: insertDatabasePage },
  { k: 'dbLinked',    sec: 'database', ic: 'north_east',     kw: 'linked view data source existing', fresh: true, run: pickLinkedDatabase },
  { k: 'toc',      sec: 'advanced', ic: 'toc',               kw: 'table of contents toc outline', fresh: true, run: insertToc },
  { k: 'toggleH1', sec: 'advanced', ic: 'arrow_right',       kw: 'toggle heading 1 h1 th1 collapse', fresh: true, run: () => turnCaretBlock('toggleH1') },
  { k: 'toggleH2', sec: 'advanced', ic: 'arrow_right',       kw: 'toggle heading 2 h2 th2 collapse', fresh: true, run: () => turnCaretBlock('toggleH2') },
  { k: 'toggleH3', sec: 'advanced', ic: 'arrow_right',       kw: 'toggle heading 3 h3 th3 collapse', fresh: true, run: () => turnCaretBlock('toggleH3') },
  { k: 'equation', sec: 'advanced', ic: 'functions',         kw: 'block equation math latex formula $$', run: () => openMathDialog(null, { block: true }) },
  { k: 'columns',  sec: 'advanced', ic: 'view_column',       kw: 'columns col layout 2 3 4 5',  run: (n) => insertColumns(n || 2) },
  // 2.3: a formula in the line, and chemistry (mhchem)
  { k: 'math',    sec: 'inline', ic: 'functions',            kw: 'inline equation math latex formula $', run: () => openMathDialog(null, { block: false }) },
  { k: 'chem',    sec: 'inline', ic: 'science',              kw: 'chemistry mhchem molecule',   run: () => openMathDialog(null, { block: false, tex: '\\ce{H2O}' }) },
  { k: 'icon',    sec: 'inline', ic: 'mood',                 kw: 'icon emoji symbol',           run: pickInlineIcon },
  { k: 'board',   sec: 'inline', ic: 'space_dashboard',      kw: 'board link mention',          run: pickBoardLink }
];
const BLOCK_SECTIONS = ['basic', 'media', 'database', 'advanced', 'inline'];
const blockLabel = (b) => t('block.' + b.k);
const blockDesc = (b) => t('block.' + b.k + '.d');
/* Typing "/h1" has to work whatever the interface language is, so the English
   name, the key and Notion's keywords stay searchable beside the translated one. */
function blockMatches(b, q) {
  if (!q) return true;
  const hay = [blockLabel(b), FALLBACK['block.' + b.k] || '', b.k, b.kw || ''];
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
  $('slashPeek').classList.add('hidden');
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
/* How well a block's name answers what was typed: 0 is the name itself, 1 a
   name that starts with it, 2 anywhere. Without this the list kept BLOCKS'
   own order, so `/link` offered "Board link" first — it contains "link" and
   sits above Link in the table — and Enter made a board link, which is how a
   link typed with the slash menu ended up somewhere nobody asked for. */
function blockRank(b, q) {
  if (!q) return 0;
  const names = [b.k, foldSearch(blockLabel(b)), foldSearch(FALLBACK['block.' + b.k] || '')];
  if (names.some((s) => s === q)) return 0;
  if (names.some((s) => s && s.startsWith(q))) return 1;
  // a keyword it answers to: below its own name, above a match in the middle of one
  if (foldSearch(b.kw || '').split(/\s+/).some((w) => w && w.startsWith(q))) return 2;
  return 3;
}
/* With nothing typed the menu is Notion's: every section in order under its
   heading. Typing turns it into one list ranked by how well each name answers,
   the way it always was — a heading over three results is noise. */
function slashItems(q) {
  const asItem = (b) => ({ kind: 'block', sec: b.sec, ic: b.ic, name: blockLabel(b), desc: blockDesc(b), fresh: b.fresh, run: b });
  const blocks = q
    ? BLOCKS.filter((b) => blockMatches(b, q))
      .map((b, i) => ({ b, i, r: blockRank(b, q) }))
      .sort((x, y) => x.r - y.r || x.i - y.i)
      .map(({ b }) => asItem(b))
    : BLOCK_SECTIONS.flatMap((s) => BLOCKS.filter((b) => b.sec === s).map(asItem));
  return [
    ...blocks,
    ...slashColors(q),
    ...userTemplates().filter((x) => templateMatches(x, q)).map((x) => ({
      kind: 'tpl', ic: x.icon || 'sticky_note_2', name: templateName(x),
      desc: noteHeadline(x.body), run: x
    }))
  ];
}

/* "/red", "/blue background" — Notion's way of colouring the block the caret
   is in (2.9). Only offered once something is typed, and only for a colour
   whose name (in the interface's language, or English) starts what was typed. */
function slashColors(q) {
  if (!q) return [];
  const out = [];
  COLORS.forEach((c) => {
    const names = [foldSearch(t('colour.' + c)), foldSearch(FALLBACK['colour.' + c] || '')];
    const name = t('colour.' + c);
    const word = q.split(/\s+/)[0];
    if (!names.some((s) => s && (s.startsWith(word) || word.startsWith(s)))) return;
    const bg = /\b(bg|back|backg|background|خلفية)/.test(q);
    const text = { kind: 'color', part: 'tc', color: c, ic: 'format_color_text', name: t('tc.text', { name }), desc: t('tc.textD') };
    const back = { kind: 'color', part: 'bc', color: c, ic: 'format_color_fill', name: t('tc.bg', { name }), desc: t('tc.bgD') };
    out.push(...(bg ? [back, text] : [text, back]));
  });
  return out;
}

function renderSlash() {
  const q = foldSearch(slash.query.trim());
  slash.items = slashItems(q);
  const list = $('slashList');
  $('slashHead').classList.toggle('hidden', !q);
  if (!slash.items.length) {
    list.innerHTML = `<div class="sm-empty">${te('blocks.none')}</div>`;
  } else {
    let lastKind = '', lastSec = '';
    list.innerHTML = slash.items.map((it, i) => {
      // a heading the first time the kind changes, so the two halves read apart
      let head = it.kind !== lastKind && it.kind === 'tpl'
        ? `<div class="sm-head sm-head-mid">${te('blocks.templates')}</div>` : '';
      // and, with nothing typed, one over each of Notion's sections
      if (!q && it.kind === 'block' && it.sec !== lastSec) {
        head = `<div class="sm-head${i ? ' sm-head-mid' : ''}">${te('blocks.sec.' + it.sec)}</div>`;
        lastSec = it.sec;
      }
      lastKind = it.kind;
      return head +
        `<button class="sm-item${i === slash.sel ? ' sel' : ''}" data-i="${i}">
           <span class="sm-ic">${icon(it.ic)}</span>
           <span class="sm-tx"><b>${esc(it.name)}${it.fresh ? `<em class="sm-new">${te('blocks.new')}</em>` : ''}</b><span>${esc(it.desc)}</span></span>
         </button>`;
    }).join('');
    list.querySelectorAll('.sm-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => { e.preventDefault(); runSlash(+el.dataset.i); });
      /* The pointer picks a row only when it moves. The arrow keys scroll the
         list under a pointer left resting on it, and the row that slid under
         it fired mouseenter — and took the selection back, so ArrowDown
         stopped a few rows down and went no further (2.8.1). Chromium sends a
         mousemove after a scroll too, but one that has not moved: ignored. */
      el.addEventListener('mousemove', (e) => {
        if (!e.movementX && !e.movementY) return;
        if (slash.sel !== +el.dataset.i) { slash.sel = +el.dataset.i; markSlashSel(false); }
      });
    });
  }
  $('slashMenu').classList.remove('hidden');
  list.scrollTop = 0;
  markSlashSel(false);
}
function markSlashSel(scroll = true) {
  $('slashList').querySelectorAll('.sm-item').forEach((el, i) => {
    const on = i === slash.sel;
    el.classList.toggle('sel', on);
    // the list scrolls; without this the highlight walks off the bottom and
    // Enter picks something you cannot see
    if (on && scroll) el.scrollIntoView({ block: 'nearest' });
  });
  peekSlash();
}

/* --- the picture beside the menu (2.8) -----------------------------------
   Notion's slash menu shows, for the row under the cursor or the arrow keys, a
   card to the side: a picture of the block and its description. It reads that
   off each block's `tooltipPhoto` and opens it with no delay, on the right —
   MAP.md §4z6. Its pictures are screenshots; these are drawn, from the theme's
   own colours, so they are right in every theme and both modes and add no
   files. `blockPeek()` is the picture; the description is the menu's own. */
function peekSlash() {
  const it = slash.open && slash.items[slash.sel];
  const peek = $('slashPeek');
  if (!it) { peek.classList.add('hidden'); return; }
  $('slashPeekPic').innerHTML = it.kind === 'tpl' ? blockPeek('tpl')
    : it.kind === 'color' ? `<div class="pk-page pk-big"><p><span class="mb-${it.part}-${esc(it.color)}">${te('pk.text')}</span></p></div>`
      : blockPeek(it.run.k);
  $('slashPeekCap').textContent = it.desc || '';
  peek.classList.remove('hidden');
  const m = $('slashMenu').getBoundingClientRect();
  const row = $('slashList').querySelector('.sm-item.sel');
  const r = row ? row.getBoundingClientRect() : m;
  const w = peek.offsetWidth, h = peek.offsetHeight;
  // beside the menu on the side the text runs towards, and the other side when that one is full
  let left = RTL ? m.left - w - 8 : m.right + 8;
  if (!RTL && left + w > innerWidth - 8) left = m.left - w - 8;
  if (RTL && left < 8) left = m.right + 8;
  const top = clamp(r.top + r.height / 2 - h / 2, 8, innerHeight - h - 8);
  peek.style.left = clamp(left, 8, innerWidth - w - 8) + 'px';
  peek.style.top = top + 'px';
}
/* The pictures are Notion's kind (2.8.1): a close-up of the block with
   something real in it — a heading that says something, a to-do that is
   ticked, a table with things in it, cards with names and statuses, a month
   with its days, charts with their numbers — in large type and cropped at the
   edge, as if the page had been zoomed into. The words are the catalogue's
   (`pk.*`), so a picture is in the interface's language; the colours are the
   theme's, and the status pills are the database's own (`db-pill`). */
const pkPill = (key, color) => `<span class="db-pill db-st db-c-${color}">${te(key)}</span>`;
const PK_ST = [['db.st.done', 'green'], ['db.st.doing', 'blue'], ['db.st.todo', 'default'], ['db.st.doing', 'blue']];
function pkMath(tex, block) {
  const f = document.createElement('span');
  renderTex(tex, f, block);
  return `<span class="pk-math${block ? ' pk-mblock' : ''}">${f.innerHTML}</span>`;
}
// a landscape — sky, sun, two hills — for the image and the video
const pkScene = (dark) => `<svg class="pk-scene${dark ? ' dark' : ''}" viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="200" height="130" class="sky"/><circle cx="150" cy="38" r="15" class="sun"/>
  <path d="M0 130 L0 92 L46 52 L88 90 L118 66 L200 118 L200 130 Z" class="hill2"/><path d="M0 130 L0 108 L60 78 L130 112 L200 96 L200 130 Z" class="hill1"/></svg>`;
function pkTable(n, withIcon) {
  const titles = ['pk.t1', 'pk.t2', 'pk.t3', 'pk.t4'];
  return `<div class="pk-dbt"><div class="pk-r pk-hd"><span>${icon('title')}${te('db.prop.name')}</span><span>${icon('radio_button_checked')}${te('db.prop.status')}</span></div>` +
    titles.slice(0, n).map((k, i) => `<div class="pk-r"><span class="pk-name">${withIcon ? icon('description') : ''}${te(k)}</span><span>${pkPill(PK_ST[i][0], PK_ST[i][1])}</span></div>`).join('') + '</div>';
}
function blockPeek(k) {
  const lis = `<li>${te('pk.li1')}</li><li>${te('pk.li2')}</li><li>${te('pk.li3')}</li>`;
  switch (k) {
    case 'text': return `<div class="pk-page pk-big"><p>${te('pk.text')}</p></div>`;
    case 'h1': return `<div class="pk-page"><h1>${te('pk.h1')}</h1><p>${te('pk.text')}</p></div>`;
    case 'h2': return `<div class="pk-page"><h2>${te('pk.h2')}</h2><p>${te('pk.text')}</p></div>`;
    case 'h3': return `<div class="pk-page"><h3>${te('pk.h3')}</h3><p>${te('pk.text')}</p></div>`;
    case 'bullet': return `<div class="pk-page pk-big"><ul>${lis}</ul></div>`;
    case 'number': return `<div class="pk-page pk-big"><ol>${lis}</ol></div>`;
    case 'letters': return `<div class="pk-page pk-big"><ol class="pk-la">${lis}</ol></div>`;
    case 'roman': return `<div class="pk-page pk-big"><ol class="pk-ur">${lis}</ol></div>`;
    case 'todo': return `<div class="pk-page pk-big"><div class="pk-todo done"><i>${icon('check')}</i><s>${te('pk.todo1')}</s></div><div class="pk-todo"><i></i><span>${te('pk.todo2')}</span></div><div class="pk-todo"><i></i><span>${te('pk.todo3')}</span></div></div>`;
    case 'toggle': case 'toggleH1': case 'toggleH2': case 'toggleH3': {
      const lvl = k === 'toggle' ? 0 : +k.slice(-1);
      return `<div class="pk-page${lvl ? '' : ' pk-big'}"><div class="pk-tg open lvl${lvl}"><b>${te(lvl ? 'pk.h' + lvl : 'pk.li2')}</b><span>${te('pk.text')}</span></div>` +
        `<div class="pk-tg lvl${lvl}"><b>${te(lvl ? 'pk.tasks' : 'pk.li3')}</b></div></div>`;
    }
    case 'callout': return `<div class="pk-page"><div class="pk-callout">${icon('lightbulb')}<span>${te('pk.callout')}</span></div></div>`;
    case 'quote': return `<div class="pk-page pk-big"><blockquote>${te('pk.quote')}</blockquote></div>`;
    case 'table': return `<div class="pk-page"><table class="pk-tbl"><tr><th>${te('pk.item')}</th><th>${te('pk.qty')}</th></tr>` +
      [['pk.apples', 6], ['pk.bread', 1], ['pk.milk', 2]].map(([w, q]) => `<tr><td>${te(w)}</td><td>${esc(num(q))}</td></tr>`).join('') + '</table></div>';
    case 'divider': return `<div class="pk-page pk-big"><p>${te('pk.li1')}</p><hr><p>${te('pk.li2')}</p></div>`;
    case 'link': return `<div class="pk-page pk-big pk-center"><span class="pk-link">${icon('description')}<u>${te('pk.link')}</u></span></div>`;
    case 'image': return `<div class="pk-media">${pkScene(false)}</div>`;
    case 'video': return `<div class="pk-media">${pkScene(true)}<span class="pk-play">${icon('play_circle')}</span></div>`;
    case 'bookmark': return `<div class="pk-page"><div class="pk-bm"><span><b>${te('pk.bmTitle')}</b><em>${te('pk.bmText')}</em><small>${icon('link')}example.com</small></span>${pkScene(false)}</div></div>`;
    case 'code': return `<div class="pk-codeb"><code><b>const</b> plan = <i>'ship it'</i>;<br><b>if</b> (plan) {<br>&nbsp;&nbsp;start(<i>'today'</i>);<br>}</code></div>`;
    case 'dbTable': return `<div class="pk-page pk-db">${pkTable(4, true)}</div>`;
    case 'dbInline': return `<div class="pk-page pk-db"><h3>${te('pk.tasks')}</h3>${pkTable(3, true)}</div>`;
    case 'dbLinked': return `<div class="pk-page pk-db"><h3 class="pk-linked">${icon('north_east')}<u>${te('pk.tasks')}</u></h3>${pkTable(3, true)}</div>`;
    case 'dbPage': return `<div class="pk-page pk-center"><span class="pk-link pk-pagelink">${icon('description')}<u>${te('pk.tasks')}</u></span><div class="pk-mini">${pkTable(2, false)}</div></div>`;
    case 'dbBoard': return `<div class="pk-page pk-db pk-board">` + [[2, 'db.st.todo', 'default', ['pk.t3', 'pk.t4']], [1, 'db.st.doing', 'blue', ['pk.t2']], [1, 'db.st.done', 'green', ['pk.t1']]]
      .map(([, st, c, cards]) => `<div class="pk-bcol">${pkPill(st, c)}${cards.map((ck) => `<div class="pk-card">${te(ck)}</div>`).join('')}</div>`).join('') + '</div>';
    case 'dbGallery': return `<div class="pk-page pk-db pk-gal">` + [['pk.t1', 'blue'], ['pk.t2', 'green'], ['pk.t3', 'amber'], ['pk.t4', 'violet']]
      .map(([tk, c]) => `<div class="pk-gcard"><i class="db-c-${c}"></i><span>${te(tk)}</span></div>`).join('') + '</div>';
    case 'dbList': return `<div class="pk-page pk-db">` + ['pk.t1', 'pk.t2', 'pk.t3', 'pk.t4']
      .map((tk, i) => `<div class="pk-lrow">${icon('description')}<span>${te(tk)}</span>${pkPill(PK_ST[i][0], PK_ST[i][1])}</div>`).join('') + '</div>';
    case 'dbCalendar': {
      const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1);
      const chips = { 2: ['pk.t1', 'blue'], 3: ['pk.t3', 'amber'], 9: ['pk.t2', 'green'], 11: ['pk.t4', 'violet'] };
      let days = '';
      for (let d = 1; d <= 14; d++) days += `<span class="pk-day${d === 4 ? ' today' : ''}"><b>${esc(num(d))}</b>${chips[d] ? `<i class="db-c-${chips[d][1]}">${te(chips[d][0])}</i>` : ''}</span>`;
      return `<div class="pk-page pk-db"><h3>${esc(fmtDate(todayKey(first), { month: 'long', year: 'numeric' }))}</h3><div class="pk-cal">${days}</div></div>`;
    }
    case 'dbTimeline': {
      let head = '';
      for (let d = 1; d <= 10; d++) head += `<span${d === 4 ? ' class="today"' : ''}>${esc(num(d))}</span>`;
      return `<div class="pk-page pk-db pk-tl"><div class="pk-tlh">${head}</div>` +
        [['pk.t1', 'blue', 0, 4], ['pk.t2', 'green', 3, 4], ['pk.t3', 'amber', 5, 5]]
          .map(([tk, c, x, w]) => `<div class="pk-lane"><i class="db-c-${c}" style="margin-inline-start:${x * 10}%;width:${w * 10}%">${te(tk)}</i></div>`).join('') + '</div>';
    }
    case 'dbFeed': return `<div class="pk-page pk-db"><div class="pk-post"><b>${te('pk.post')}</b><span>${te('pk.postText')}</span></div><div class="pk-post"><b>${te('pk.t2')}</b><span>${te('pk.text')}</span></div></div>`;
    case 'dbDashboard': return `<div class="pk-page pk-db pk-dash"><div class="pk-w"><em>${te('db.total')}</em><b>${esc(num(24))}</b></div>
      <div class="pk-w">${pkRing(56, true)}</div><div class="pk-w pk-wide">${pkBars([4, 7, 3, 6, 8], false)}</div></div>`;
    case 'dbMap': return `<div class="pk-media pk-map">${dbWorldSvg('<circle cx="106" cy="50" r="5" class="pk-pin"/><circle cx="182" cy="40" r="5" class="pk-pin"/><circle cx="321" cy="124" r="5" class="pk-pin"/>')}</div>`;
    case 'dbBar': return `<div class="pk-page pk-db">${pkBars([8, 11, 7, 8, 14], true)}</div>`;
    case 'dbHbar': return `<div class="pk-page pk-db pk-hb">` + [['db.st.done', 'green', 10], ['db.st.doing', 'blue', 7], ['db.st.todo', 'default', 4]]
      .map(([st, c, v]) => `<div class="pk-hrow"><span>${te(st)}</span><i class="db-c-${c}" style="width:${v * 9}%"></i><b>${esc(num(v))}</b></div>`).join('') + '</div>';
    case 'dbLine': return `<div class="pk-page pk-db pk-line"><span class="pk-axis"><b>${esc(num(50))}</b><b>${esc(num(25))}</b><b>${esc(num(0))}</b></span>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true"><polyline class="a" points="0,44 16,30 32,36 48,16 64,24 80,10 100,18"/><polyline class="b" points="0,52 16,48 32,40 48,44 64,34 80,38 100,28"/></svg></div>`;
    case 'dbDonut': return `<div class="pk-page pk-db pk-center">${pkRing(56, false)}</div>`;
    case 'dbNumber': return `<div class="pk-page pk-db pk-numc"><b>${esc(num(12149))}</b><em>${te('db.countRows')}</em></div>`;
    case 'dbForm': return `<div class="pk-form"><i class="pk-band"></i><b>${te('pk.form')}</b><span class="pk-input">${te('pk.formPh')}</span><span class="pk-submit">${te('db.submit')}</span></div>`;
    case 'toc': return `<div class="pk-page pk-big pk-toc"><u>${te('pk.h1')}</u><u class="i1">${te('pk.h2')}</u><u class="i1">${te('pk.h3')}</u><u>${te('pk.tasks')}</u></div>`;
    case 'equation': return `<div class="pk-page pk-center">${pkMath('\\int_0^1 x^2\\,dx = \\tfrac13', true)}</div>`;
    case 'math': return `<div class="pk-page pk-big pk-center"><p>${te('pk.for')} ${pkMath('x \\ge 0', false)}</p></div>`;
    case 'chem': return `<div class="pk-page pk-big pk-center">${pkMath('\\ce{2H2 + O2 -> 2H2O}', false)}</div>`;
    case 'columns': return `<div class="pk-page pk-cols"><div><h3>${te('pk.h2')}</h3><p>${te('pk.li1')}</p></div><div><h3>${te('pk.h3')}</h3><p>${te('pk.li2')}</p></div></div>`;
    case 'icon': return `<div class="pk-page pk-big pk-center"><p class="pk-icons">${te('pk.li1')} ${icon('lightbulb')} ${icon('mood')} ${icon('science')}</p></div>`;
    case 'board': return `<div class="pk-page pk-big pk-center"><span class="pk-chip">${icon('space_dashboard')}${te('pk.board')}</span></div>`;
    default: return `<div class="pk-page"><h3>${icon('sticky_note_2')}</h3><p>${te('pk.text')}</p></div>`;
  }
}
// a donut of three statuses with its total in the middle, and its legend when there is room
function pkRing(total, small) {
  const arcs = [[50, 'green', 25], [30, 'blue', 75], [20, 'default', 45]]
    .map(([share, c, off]) => `<circle cx="21" cy="21" r="15.9" class="db-c-${c}" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${off}"/>`).join('');
  return `<span class="pk-ring${small ? ' small' : ''}"><svg viewBox="0 0 42 42" aria-hidden="true">${arcs}</svg><b>${esc(num(total))}</b></span>` +
    (small ? '' : `<span class="pk-legend">${pkPill('db.st.done', 'green')}${pkPill('db.st.doing', 'blue')}${pkPill('db.st.todo', 'default')}</span>`);
}
// bars with their numbers over them, and months under them when asked
function pkBars(vals, labelled) {
  const max = Math.max(...vals);
  const months = labelled ? vals.map((_, i) => `<span>${esc(fmtDate(todayKey(new Date(2026, i, 1)), { month: 'short' }))}</span>`).join('') : '';
  return `<div class="pk-bars">${vals.map((v, i) => `<span><em>${esc(num(v))}</em><i class="db-c-${['blue', 'green', 'amber'][i % 3]}" style="height:${(v / max) * 100}%"></i></span>`).join('')}</div>` +
    (labelled ? `<div class="pk-months">${months}</div>` : '');
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
  // a colour is the block's, the way Notion's "/red" is (blocks.js)
  if (item.kind === 'color') {
    const blk = blockOf(getSelection().anchorNode, body);
    if (blk && blockKind(blk)) setBlockColor(blk, item.part, item.color);
    persistEdit();
    return;
  }
  const b = item.run;
  // on a toggle's title a heading is the toggle's level, and anything else goes inside it (blocks.js)
  if (slashInToggleHead(b.k)) { persistEdit(); return; }
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
