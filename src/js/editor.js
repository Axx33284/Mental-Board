/* Mental Board — editor.js
   The note editor: markdown, blocks, tables, columns, templates, the paste sanitiser.

   Part 7 of 15. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 11. the note editor ─────────────── */
let editing = null;       // the .note-body currently in edit mode
let editNote = null;      // its model
let editDirty = false;
let editBefore = '';      // its body when the edit began, for pushHistory()

function wireNoteBody(body, n, el) {
  body.addEventListener('input', () => {
    n.body = bodyHtml(body);
    editDirty = true;
    saveSoon();
    if (slash.open) updateSlash();
  });
  body.addEventListener('pointerdown', unpinSelBar);   // a fresh selection may move the toolbar again
  body.addEventListener('keydown', (e) => { unpinSelBar(); onEditorKey(e, body, n); });
  body.addEventListener('paste', (e) => onEditorPaste(e, body, n));
  body.addEventListener('click', (e) => {
    // an image is an object, not text: clicking it selects it for editing
    const im = e.target.closest('img.mb-img');
    if (im && el.classList.contains('editing')) { e.preventDefault(); selectImage(im); return; }
    if (!im) clearImageSel();
    // checkbox hit area
    const li = e.target.closest('ul.mb-todo > li');
    if (li && e.offsetX < 24 && e.target === li) {
      li.classList.toggle('done');
      n.body = bodyHtml(body); saveSoon();
      e.preventDefault();
      return;
    }
    /* An embed card is one object, not text. The play button loads the player;
       anywhere else on the card opens the page in the system browser, which is
       what a bookmark card is for and what a video card should still do for
       anyone who would rather watch it full size. Checked before the plain-link
       branch below, because the card contains an <a>. */
    const box = e.target.closest('.mb-embed');
    if (box) {
      e.preventDefault();
      if (e.target.closest('.emb-play')) { playEmbed(box); return; }
      if (e.target.closest('iframe')) return;          // the player owns its own clicks
      const href = (box.querySelector('a.emb-src') || {}).href;
      if (href) openHref(href);
      return;
    }
    const a = e.target.closest('a');
    /* A board link is checked before the external-URL branch: it carries
       href="#" so that it looks and behaves like a link, and handing that to
       the system browser would open a blank tab. */
    if (a && a.classList.contains('mb-board')) {
      if (!el.classList.contains('editing') || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const target = boardById(a.dataset.board);
        if (target) switchBoard(target.id); else toast(t('msg.boardGone'));
      }
      return;
    }
    if (a && a.href) {
      if (!el.classList.contains('editing') || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        openHref(a.getAttribute('href') || a.href);
      }
    }
  });
  body.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
  body.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !/^image\//.test(f.type)) return;
    e.preventDefault(); e.stopPropagation();
    enterEdit(n);
    insertImageFile(f, body, n);
  });
}

/* The HTML to store for a note. `img-sel` marks the image the user is
   currently working on — that is UI state, not content, and saving it would
   bake a selection outline into the note forever. Take it off for the read,
   put it straight back. */
function bodyHtml(body) {
  /* An embed's visible card and its player are both painted, never stored. The
     card is rebuilt from `data-embed`/`data-vid` on every render, and storing
     an <iframe> would mean a note that starts playing a video the moment the
     board opens — and a board file that carries a remote URL the app promised
     only to load on a click. Lift them out for the read and put them straight
     back, the same trick `img-sel` uses below. */
  const lifted = [...body.querySelectorAll('.emb-face, .mb-embed iframe')]
    .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
  lifted.forEach((m) => m.el.remove());
  const marked = body.querySelector('img.img-sel');
  if (marked) marked.classList.remove('img-sel');
  const html = body.innerHTML;
  if (marked) marked.classList.add('img-sel');
  lifted.forEach((m) => { if (m.parent) m.parent.insertBefore(m.el, m.next); });
  return html;
}

function enterEdit(n) {
  if (!canEditHere()) return;
  // the note may be culled — flying to it and opening it are one gesture
  const el = ensureMounted(n.id);
  if (!el) return;
  const body = el.querySelector('.note-body');
  if (editing === body) { body.focus(); return; }
  exitEdit();
  pushUndo(); editDirty = false;
  /* What the note said when the edit began. exitEdit turns it into a history
     entry — this is the only place the "before" is still available. */
  editBefore = n.body || '';
  editing = body; editNote = n;
  el.classList.add('editing');
  stripCodeBlocks(body);        // no highlight spans anywhere near the caret
  body.setAttribute('contenteditable', 'true');
  bringToFront(n.id);
  setSelection([n.id], false);
  body.focus();
  // caret to the end
  const r = document.createRange(); r.selectNodeContents(body); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

function exitEdit() {
  closeSlash(); hideSelBar(); clearImageSel(); hideTableBar(); hideColsBar();
  if (!editing) return;
  const body = editing, n = editNote;
  editing = null; editNote = null;
  body.removeAttribute('contenteditable');
  body.closest('.note')?.classList.remove('editing');
  cleanCodeBlocks(body);          // safe now the caret has gone
  paintCodeBlocks(body);          // and so is colouring them
  /* Close the note, stop the video. Leaving a player running inside a note
     nobody is looking at keeps audio going with no visible control to stop it
     — and the note is about to be culled on the next pan, which would take the
     sound with it at a moment the user did not choose. */
  stopEmbeds(body);
  if (n) {
    const before = editBefore;
    n.body = bodyHtml(body);
    pushHistory(n, before);
    repaintMarks(n.id);
    flushSave();
  }
  editBefore = '';
  if (!editDirty) popUndo();
  editDirty = false;
}

function focusedNoteBody() {
  return editing;
}

/* --- keyboard inside a note ------------------------------------------- */
function onEditorKey(e, body, n) {
  e.stopPropagation();     // canvas shortcuts must not fire while typing

  /* First, because the paste menu is modal over the caret: it opened *because*
     of a keystroke and the next one is an answer to it, not text. */
  if (pasteMenuKey(e)) return;

  if (slash.open) {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) { slashKey(e); return; }
  }

  if (e.key === 'Escape') { e.preventDefault(); exitEdit(); $('viewport').focus(); return; }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLinkDialog(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); exitEdit(); return; }

  const pre = caretPre();
  if (pre) {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // a blank last line means "I'm done" — step out of the block
      const plain = pre.textContent.replace(/​/g, '');
      if (/\n[ \t]*$/.test(plain) && atEndOf(pre)) {
        const code = pre.querySelector('code') || pre;
        code.textContent = code.textContent.replace(/[\s​]+$/, '');
        const p = document.createElement('p'); p.innerHTML = '<br>';
        pre.parentNode.insertBefore(p, pre.nextSibling);
        placeCaret(p, 0);
        n.body = bodyHtml(body); saveSoon();
        return;
      }
      insertNewlineInPre(pre);
      n.body = bodyHtml(body); saveSoon();
      return;
    }
  }

  /* Tab inside a table moves between cells and falls off the end into a new row.
     It has to come before the slash and markdown handling, and after the <pre>
     branch above, which uses Tab for indentation. */
  if (e.key === 'Tab' && caretCell()) {
    e.preventDefault();
    tableTab(e.shiftKey);
    n.body = bodyHtml(body); saveSoon();
    showTableBar();
    return;
  }

  if (e.key === '/') { setTimeout(() => openSlash(body), 0); return; }

  if (mdShortcuts(e, body, n)) return;

  // Enter at the end of a heading / quote / callout should drop back to plain
  // text instead of making a second heading. Let the browser split the block
  // its own way first, then normalise whatever it produced — hand-inserting a
  // <p> here is what nested a <ul> inside a <p> in an earlier revision.
  if (e.key === 'Enter' && !e.shiftKey) {
    const blk = caretBlock(body);
    const exitable = blk && (/^(H1|H2|H3|BLOCKQUOTE)$/.test(blk.tagName) || blk.classList.contains('mb-callout'));
    if (exitable && atEndOf(blk)) {
      setTimeout(() => {
        if (editing !== body) return;
        document.execCommand('formatBlock', false, 'p');
        normalizeBody(body);
        n.body = bodyHtml(body); saveSoon();
      }, 0);
    }
  }
}

// the nearest block-level element the caret sits in, stopping at the note body
/* TD and TH count as blocks so that a table cell takes its own paragraph
   direction — a note holding an Arabic table in an English board needs each
   cell to resolve on its own, exactly like a paragraph does. */
const BLOCK_RE = /^(P|H1|H2|H3|BLOCKQUOTE|LI|PRE|DIV|TD|TH)$/;
function caretBlock(body) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let el = s.anchorNode;
  if (el && el.nodeType === 3) el = el.parentElement;
  while (el && el !== body) {
    if (BLOCK_RE.test(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

/* Per-paragraph direction.
   Blocks inside a note are `unicode-bidi: plaintext`, so each one already picks
   its own side from its first strong character — an Arabic paragraph and an
   English one sit correctly in the same note with nothing set. These two
   buttons are the override for where that guess is wrong: a mostly-Arabic line
   that happens to open with a Latin product name, say. Clicking the side a
   block is already on removes the attribute and hands it back to plaintext. */
function blocksInSelection(body) {
  const s = getSelection();
  const blocks = [...body.querySelectorAll('p, h1, h2, h3, blockquote, li, pre, div, td, th')];
  if (s.rangeCount) {
    const r = s.getRangeAt(0);
    // the innermost matching block only — a <li> should not drag its <ul> along
    const hit = blocks.filter((el) => r.intersectsNode(el) && !blocks.some((o) => o !== el && el.contains(o) && r.intersectsNode(o)));
    if (hit.length) return hit;
  }
  const one = caretBlock(body);
  return one ? [one] : [];
}
/* Text alignment, per block.

   A class rather than `execCommand('justifyCenter')` or an inline style, for
   two reasons. `style` is not on the sanitiser's attribute allow-list, so an
   inline `text-align` survives being typed and disappears the moment the note
   is copied into another one — a bug that would look random. And execCommand's
   justify commands wrap things in `<div align=…>` on some paths, which is one
   more shape `normalizeBody` would have to know about.

   `mb-al-*` starts with `mb-`, so `sanitize()` keeps it, and it is one class on
   the block that already exists. Pressing the active one again clears it, the
   same way the direction buttons already work — every toggle in this toolbar
   behaves the same or none of them are predictable.

   Deliberately literal left/right, not start/end: someone who centres a heading
   over an Arabic paragraph and left-aligns a code caption is asking for those
   sides on screen, not for sides that move with the text direction. */
const ALIGNS = ['left', 'center', 'right'];
const alignClass = (a) => 'mb-al-' + a;

function setAlign(align) {
  if (!editing || !ALIGNS.includes(align)) return;
  const blocks = blocksInSelection(editing);
  if (!blocks.length) return;
  const cls = alignClass(align);
  const clearing = blocks.every((b) => b.classList.contains(cls));
  blocks.forEach((b) => {
    ALIGNS.forEach((a) => b.classList.remove(alignClass(a)));
    if (!clearing) b.classList.add(cls);
    // an empty class attribute is noise in every saved note from here on
    if (b.classList.length === 0) b.removeAttribute('class');
  });
  persistEdit();
}

// which alignment the caret is sitting in, or '' for the note's default
function currentAlign() {
  if (!editing) return '';
  const blocks = blocksInSelection(editing);
  if (!blocks.length) return '';
  const found = ALIGNS.find((a) => blocks.every((b) => b.classList.contains(alignClass(a))));
  return found || '';
}

function setParagraphDir(dir) {
  if (!editing) return;
  const blocks = blocksInSelection(editing);
  if (!blocks.length) return;
  const clearing = blocks.every((b) => b.getAttribute('dir') === dir);
  blocks.forEach((b) => { if (clearing) b.removeAttribute('dir'); else b.setAttribute('dir', dir); });
  persistEdit();
}

/* execCommand happily produces <p><ul>…</ul></p> — a paragraph wrapping block
   elements. That wrapper then swallows every block typed after it and breaks
   caretBlock(), so unwrap any paragraph holding block children. Only the
   wrapper element is removed; the caret's own text node survives untouched. */
const BLOCK_CHILD_RE = /^(UL|OL|BLOCKQUOTE|PRE|H1|H2|H3|HR|DIV|P|TABLE)$/;
function normalizeBody(body) {
  if (!body) return;
  /* Headings as well as paragraphs. `formatBlock` on a caret inside a list
     wraps the whole <ul> in the heading, and an <h1> containing a list draws
     every bullet at heading size and swallows the blocks after it exactly the
     way the <p> case does. Same unwrap, same reason. */
  for (let pass = 0; pass < 4; pass++) {
    const bad = [...body.querySelectorAll('p,h1,h2,h3')].filter((p) =>
      [...p.children].some((c) => BLOCK_CHILD_RE.test(c.tagName)));
    if (!bad.length) break;
    bad.forEach((p) => { if (p.parentNode) p.replaceWith(...p.childNodes); });
  }
  /* Text that belongs to no block at all. Outdenting the last item of a list
     leaves its text as a bare node directly under the body — invisible in the
     markup, but caretBlock() returns null for it, so nothing that works on the
     current block works on that line. Give it a paragraph. */
  [...body.childNodes].forEach((node) => {
    if (node.nodeType !== 3 || !node.textContent.trim()) return;
    const p = document.createElement('p');
    node.replaceWith(p);
    p.appendChild(node);
  });
  // a heading inside a heading renders at the product of both sizes
  body.querySelectorAll('h1 :is(h1,h2,h3), h2 :is(h1,h2,h3), h3 :is(h1,h2,h3)')
    .forEach((h) => h.replaceWith(...h.childNodes));
  // and a code span inside a code span draws two borders
  body.querySelectorAll('code code').forEach((c) => c.replaceWith(...c.childNodes));
  // collapse redundant size wrappers
  body.querySelectorAll('span.mb-fs > span.mb-fs:only-child').forEach((inner) => {
    const outer = inner.parentElement;
    if (outer) outer.replaceWith(inner);
  });
}

// Notion-style markdown triggers on space / enter. Returns true when it
// consumed the keystroke.
function mdShortcuts(e, body, n) {
  if (e.key !== ' ' && e.key !== 'Enter') return false;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return false;
  const tn = sel.anchorNode;
  if (!tn || tn.nodeType !== 3) return false;
  const marker = tn.textContent.slice(0, sel.anchorOffset).trim();
  const eat = () => {
    const r = document.createRange();
    r.setStart(tn, 0); r.setEnd(tn, sel.anchorOffset);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete');
  };
  const done = () => { normalizeBody(body); n.body = bodyHtml(body); saveSoon(); };

  if (e.key === ' ') {
    const blocks = { '#': 'h1', '##': 'h2', '###': 'h3', '>': 'blockquote' };
    /* escapeList() first, for the same reason insertCodeBlock() and
       insertCallout() call it.

       `formatBlock` on a caret inside an <li> wraps the whole list:
       "- a ⏎ # " produced <h1><ul><li>b</li></ul></h1>, a heading rendering a
       list at heading size, which normalizeBody() did not unwrap either.

       And `insertUnorderedList` inside a list *removes* the list — the trap
       insertTodo() already guards against — so "- a ⏎ - " dropped the item out
       of the <ul> and left "b" as a bare text node directly under the note
       body, belonging to no block at all. caretBlock() cannot resolve that, so
       every later shortcut on that line silently did nothing. */
    if (blocks[marker]) { e.preventDefault(); eat(); escapeList(); document.execCommand('formatBlock', false, blocks[marker]); done(); return true; }
    if (marker === '-' || marker === '*') {
      e.preventDefault(); eat();
      // already in a bullet list? the marker is redundant, not a command
      if (caretClosest('ul') && !caretClosest('ul.mb-todo')) { done(); return true; }
      escapeList();
      document.execCommand('insertUnorderedList'); done(); return true;
    }
    if (marker === '1.') { e.preventDefault(); eat(); escapeList(); document.execCommand('insertOrderedList'); done(); return true; }
    if (marker === '[]' || marker === '[ ]') { e.preventDefault(); eat(); insertTodo(); done(); return true; }
  }
  if (e.key === 'Enter') {
    if (marker === '---' || marker === '***') { e.preventDefault(); eat(); insertHTML('<hr><p><br></p>'); done(); return true; }
    if (marker === '```') { e.preventDefault(); eat(); insertCodeBlock(); done(); return true; }
  }
  return false;
}

/* --- editing primitives ---------------------------------------------- */
function insertHTML(html) { document.execCommand('insertHTML', false, html); }

/* Turn the current line into a checkbox item. If the caret is already inside a
   list, `insertUnorderedList` would UN-list it, so in that case just badge the
   existing list instead — that is what makes a second "[] " on the next line
   add an item rather than dropping out of the list. */
function insertTodo() {
  const li = caretClosest('li');
  if (li) {
    const ul = li.closest('ul');
    if (ul) { ul.classList.add('mb-todo'); return; }
  }
  document.execCommand('insertUnorderedList');
  const ul = caretClosest('ul');
  if (ul) ul.classList.add('mb-todo');
}
function caretClosest(sel) {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (n && n.nodeType === 3) n = n.parentElement;
  return n ? n.closest(sel) : null;
}
/* A <pre> or a callout inside an <li> is invalid, and Chrome silently strips
   the wrapper leaving bare text behind. Toggle the list off first so the block
   lands at the top level of the note. */
function escapeList() {
  for (let i = 0; i < 4; i++) {
    if (!caretClosest('li')) return;
    if (caretClosest('ol')) document.execCommand('insertOrderedList');
    else if (caretClosest('ul')) document.execCommand('insertUnorderedList');
    else return;
  }
}

// A zero-width space keeps the empty <code> selectable — without it the caret
// has nowhere to land and typing lands outside the block.
function insertCodeBlock() {
  escapeList();
  insertHTML('<pre class="mb-code" data-fresh="1"><code>​</code></pre><p><br></p>');
  const pre = editing && editing.querySelector('pre.mb-code[data-fresh]');
  if (!pre) return;
  pre.removeAttribute('data-fresh');
  const code = pre.querySelector('code');
  if (code && code.firstChild) placeCaret(code.firstChild, code.firstChild.length);
}
/* An icon sitting in note *text*, as opposed to one in the app's chrome.

   `contenteditable="false"` is what makes it one atomic thing. Without it the
   caret can sit inside the <svg>, and the next keystroke inserts a text node
   between the path and its parent — which renders as nothing, cannot be
   selected, and cannot be deleted. With it, the icon behaves like a character:
   arrow keys step over it and Backspace removes the whole glyph. */
function inlineIcon(name) {
  const d = ICONS[name];
  if (!d) return '';
  return `<svg class="mi mb-ic" viewBox="${ICON_BOX}" contenteditable="false" data-ic="${esc(name)}" aria-hidden="true"><path d="${d}"/></svg>`;
}

function insertCallout() { escapeList(); insertHTML(`<div class="mb-callout">${inlineIcon('lightbulb')}&nbsp;</div><p><br></p>`); }

/* --- columns -----------------------------------------------------------
   Side-by-side text, the way Notion does it.

   `.mb-cols` is a grid with `grid-auto-flow: column`, so **the number of
   columns is simply the number of children**. Nothing stores a count: no class
   per width, no data attribute, no inline style — which matters twice over.
   The sanitiser strips `style` and every attribute that is not on its short
   list, so a count kept in markup would survive writing the note and be gone
   after a copy-paste round trip. And "add a column" stays a one-line DOM
   insert that cannot disagree with a number recorded somewhere else.

   That is also why any count works. 2 through 5 are what the menu offers;
   `/columns 9` gives nine, and the toolbar's + has no ceiling but the width of
   the note. */
const COLS_MIN = 1;
const COLS_MAX = 12;
const colCell = () => '<div class="mb-col"><p><br></p></div>';

function insertColumns(n) {
  n = clamp(Math.round(+n || 2), 2, COLS_MAX);
  escapeList();
  /* The trailing <p> is the same fix the table needed: a grid as the note's
     last child leaves no place to put the caret after it, and there is no
     keystroke that gets you out. */
  insertHTML(`<div class="mb-cols">${Array.from({ length: n }, colCell).join('')}</div><p><br></p>`);
  const grid = editing && [...editing.querySelectorAll('.mb-cols')].pop();
  const first = grid && grid.querySelector('.mb-col > *');
  if (first) placeCaret(first, 0);
}

// the .mb-cols the caret is in, or null
function caretColumns() {
  const s = getSelection();
  if (!s.rangeCount || !editing) return null;
  let node = s.getRangeAt(0).startContainer;
  if (node.nodeType === 3) node = node.parentNode;
  const grid = node && node.closest ? node.closest('.mb-cols') : null;
  return grid && editing.contains(grid) ? grid : null;
}
function caretColumn() {
  const s = getSelection();
  if (!s.rangeCount || !editing) return null;
  let node = s.getRangeAt(0).startContainer;
  if (node.nodeType === 3) node = node.parentNode;
  return node && node.closest ? node.closest('.mb-col') : null;
}

/* Add after the column the caret is in, so "+" means "one more next to this
   one" rather than "one more at the far end", which is what you want when you
   are already writing in the middle of a row. */
function addColumn() {
  const grid = caretColumns();
  if (!grid || grid.children.length >= COLS_MAX) return;
  const here = caretColumn();
  const cell = document.createElement('div');
  cell.className = 'mb-col';
  cell.innerHTML = '<p><br></p>';
  if (here && here.parentNode === grid) here.after(cell); else grid.appendChild(cell);
  placeCaret(cell.firstChild, 0);
}

/* Removing a column throws away whatever was written in it, so it refuses on
   the last two: at one column there is no row left, and the block should be
   deleted rather than silently degraded into a plain paragraph wrapper. */
function delColumn() {
  const grid = caretColumns();
  if (!grid || grid.children.length <= 2) return;
  const here = caretColumn();
  const cell = (here && here.parentNode === grid) ? here : grid.lastElementChild;
  const next = cell.nextElementSibling || cell.previousElementSibling;
  cell.remove();
  if (next) placeCaret(next.firstChild || next, 0);
}

/* Unwrap rather than delete. The columns are a layout, not content — throwing
   away three columns of writing because someone wanted one paragraph back is
   not a trade anyone would choose, and undo is a coarse instrument once the
   note has been saved. Everything comes out in reading order. */
function unwrapColumns() {
  const grid = caretColumns();
  if (!grid) return;
  const out = document.createDocumentFragment();
  [...grid.children].forEach((cell) => { while (cell.firstChild) out.appendChild(cell.firstChild); });
  if (!out.childNodes.length) out.appendChild(document.createElement('p'));
  grid.replaceWith(out);
}

/* Drop an icon in at the caret. The picker is an overlay, so opening it takes
   focus off the note and collapses the selection — the range has to be stashed
   before that happens and put back afterwards, exactly as the link dialog does. */
/* --- a link to another board -------------------------------------------
   Ropes only ever joined two notes on the same canvas, so a note that means
   "the plan for this is on the gym board" had nowhere to point. This is an
   ordinary anchor carrying a board id; clicking it outside edit mode switches.

   It stores the id and *also* the name at the time of writing, so a board that
   is later deleted still reads as something rather than an empty link. */
let boardLinkRange = null;
function pickBoardLink() {
  if (!editing) return;
  const s = getSelection();
  boardLinkRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  const dlg = $('boardPick');
  $('bpList').innerHTML = state.boards
    .filter((b) => !b.archived || state.settings.showArchived)
    .map((b) => `<button class="bp-item" data-board="${esc(b.id)}">
        <span class="bp-ic">${icon(isLocked(b) ? 'lock' : (b.icon || 'sticky_note_2'))}</span>
        <span>${esc(boardLabel(b))}</span>
      </button>`).join('');
  $('bpList').querySelectorAll('.bp-item').forEach((el) => el.addEventListener('click', () => {
    const b = boardById(el.dataset.board);
    dlg.classList.add('hidden');
    if (!b || !editing) return;
    editing.focus();
    if (boardLinkRange) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(boardLinkRange); }
    insertHTML(`<a class="mb-board" data-board="${esc(b.id)}" href="#">${inlineIcon(b.icon || 'sticky_note_2')}<span>${esc(boardLabel(b))}</span></a>&nbsp;`);
    boardLinkRange = null;
    normalizeBody(editing);
    persistEdit();
  }));
  dlg.classList.remove('hidden');
}

let inlineIconRange = null;
function pickInlineIcon() {
  if (!editing) return;
  const s = getSelection();
  inlineIconRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  openIconPicker('inline');
}
function insertInlineIcon(name) {
  const body = editing;
  if (!body || !ICONS[name]) return;
  body.focus();
  if (inlineIconRange) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(inlineIconRange);
  }
  insertHTML(inlineIcon(name) + '&nbsp;');
  inlineIconRange = null;
  normalizeBody(body);
  persistEdit();
}

/* --- code colouring -----------------------------------------------------
   A deliberately small tokeniser rather than a highlighting library. It has to
   run inside a contenteditable, which rules out anything that expects to own
   its DOM, and the whole app is one script with no bundler — pulling in a
   dependency for this would be the first one.

   It colours what is unambiguous across the C-family, Python, shell and JSON:
   strings, comments, numbers, and a shared keyword set. It does not try to tell
   the languages apart. Guessing wrong is worse than being general, because a
   mis-detected language colours the wrong words with total confidence.

   Highlighting is stripped when a note is opened for editing and reapplied when
   it closes. Spans between the caret and the text it is editing cause exactly
   the kind of split-text-node bugs that <pre> already suffers from. */
const CODE_KEYWORDS = new RegExp(
  '\\b(' + [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'break',
    'continue', 'switch', 'case', 'default', 'new', 'class', 'extends', 'super', 'this',
    'import', 'export', 'from', 'as', 'async', 'await', 'yield', 'try', 'catch', 'finally',
    'throw', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'null', 'undefined',
    'true', 'false', 'def', 'elif', 'lambda', 'pass', 'None', 'True', 'False', 'and', 'or',
    'not', 'with', 'global', 'nonlocal', 'raise', 'except', 'print', 'echo', 'fi', 'then',
    'esac', 'done', 'local', 'struct', 'enum', 'interface', 'type', 'public', 'private',
    'static', 'int', 'float', 'bool', 'string', 'char', 'end', 'select', 'where'
  ].join('|') + ')\\b', 'g');

function highlightCode(text) {
  /* One pass, alternation ordered by precedence: a `#` inside a string is not a
     comment, and a keyword inside one is not a keyword. Escaping happens per
     chunk, so the output is safe regardless of what the code contained. */
  const re = /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|(\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g;
  let out = '', last = 0, m;
  const plain = (s) => esc(s).replace(CODE_KEYWORDS, '<span class="ck-kw">$1</span>');
  while ((m = re.exec(text))) {
    out += plain(text.slice(last, m.index));
    if (m[1]) out += `<span class="ck-str">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="ck-com">${esc(m[2])}</span>`;
    else out += `<span class="ck-num">${esc(m[3])}</span>`;
    last = m.index + m[0].length;
  }
  return out + plain(text.slice(last));
}

function paintCodeBlocks(root) {
  if (!root) return;
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code') || pre;
    const text = code.textContent.replace(/​/g, '');
    if (!text.trim()) return;
    code.innerHTML = highlightCode(text);
    pre.classList.add('ck-on');
  });
}
/* Back to plain text before the caret goes anywhere near it. */
function stripCodeBlocks(root) {
  if (!root) return;
  root.querySelectorAll('pre').forEach((pre) => {
    if (!pre.querySelector('.ck-kw, .ck-str, .ck-com, .ck-num')) return;
    const code = pre.querySelector('code') || pre;
    code.textContent = code.textContent;
    pre.classList.remove('ck-on');
  });
}

/* --- tables ------------------------------------------------------------
   A real <table> inside the note's contenteditable, not a grid of divs. The
   browser already gives you cell-shaped hit targets, wrapping inside a cell,
   and a caret that behaves; reimplementing that on divs buys nothing.

   What the browser does *not* give you is Tab between cells or any way to add a
   row, so those are here. There is deliberately no cell merging, no column
   types and no sorting — that is Notion's *database*, a different feature with
   its own storage, and pretending to start it here would be worse than not
   having it.

   The first row is <th>. Nothing enforces that beyond insertTable(); a table
   whose header row was deleted still works, it just has no header. */
const TABLE_MIN_COLS = 1, TABLE_MAX_COLS = 8;

function caretCell() { return caretClosest('td, th'); }
function caretTable() { return caretClosest('table.mb-table'); }
const tableRows = (tb) => [...tb.rows];

function insertTable(cols, rows) {
  cols = clamp(cols || 3, TABLE_MIN_COLS, TABLE_MAX_COLS);
  rows = clamp(rows || 3, 1, 20);
  escapeList();
  const head = `<tr>${Array.from({ length: cols }, () => '<th><br></th>').join('')}</tr>`;
  const body = Array.from({ length: rows - 1 },
    () => `<tr>${Array.from({ length: cols }, () => '<td><br></td>').join('')}</tr>`).join('');
  /* The trailing <p> is not decoration. A table as the last child of the note
     leaves nowhere to put the caret afterwards — you cannot click past it, and
     there is no keystroke that escapes it. */
  insertHTML(`<table class="mb-table"><tbody>${head}${body}</tbody></table><p><br></p>`);
  const tb = editing && editing.querySelector('table.mb-table:not([data-seen])');
  if (tb) {
    tb.setAttribute('data-seen', '1');
    tb.removeAttribute('data-seen');
    const first = tb.querySelector('th, td');
    if (first) placeCaret(first, 0);
  }
}

/* Tab walks the cells in document order and steps off the end into a new row,
   which is the one table behaviour everybody expects and no browser provides. */
function tableTab(back) {
  const cell = caretCell();
  if (!cell) return false;
  const tb = cell.closest('table');
  if (!tb) return false;
  const cells = [...tb.querySelectorAll('th, td')];
  const i = cells.indexOf(cell);
  if (back) {
    if (i > 0) placeCaret(cells[i - 1], 0);
    return true;
  }
  if (i < cells.length - 1) { placeCaret(cells[i + 1], 0); return true; }
  const row = addTableRow(cell);
  if (row && row.cells[0]) placeCaret(row.cells[0], 0);
  return true;
}

function addTableRow(fromCell) {
  const cell = fromCell || caretCell();
  const row = cell && cell.parentElement;
  const tb = row && row.parentElement;
  if (!row || !tb) return null;
  const tr = document.createElement('tr');
  // match the width of the row we are copying, never the header's tag
  for (let i = 0; i < row.cells.length; i++) tr.appendChild(document.createElement('td')).innerHTML = '<br>';
  row.after(tr);
  return tr;
}

function addTableColumn() {
  const cell = caretCell();
  const tb = cell && cell.closest('table');
  if (!tb) return;
  const at = cell.cellIndex;
  tableRows(tb).forEach((r) => {
    // a header row grows a <th>, a body row a <td>
    const isHead = r.cells[0] && r.cells[0].tagName === 'TH';
    const c = document.createElement(isHead ? 'th' : 'td');
    c.innerHTML = '<br>';
    if (r.cells[at]) r.cells[at].after(c); else r.appendChild(c);
  });
}

function delTableRow() {
  const cell = caretCell();
  const row = cell && cell.parentElement;
  const tb = row && row.closest('table');
  if (!tb) return;
  // the last row cannot go — an empty table is a table you cannot click into
  if (tb.querySelectorAll('tr').length < 2) { delTable(); return; }
  const next = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  if (next && next.cells[0]) placeCaret(next.cells[0], 0);
}

function delTableColumn() {
  const cell = caretCell();
  const tb = cell && cell.closest('table');
  if (!tb) return;
  const at = cell.cellIndex;
  if ((tb.rows[0] ? tb.rows[0].cells.length : 0) < 2) { delTable(); return; }
  tableRows(tb).forEach((r) => { if (r.cells[at]) r.cells[at].remove(); });
  const back = tb.rows[0] && (tb.rows[0].cells[at] || tb.rows[0].cells[at - 1]);
  if (back) placeCaret(back, 0);
}

/* Sort the rows under the header by the column the caret is in. Clicking a
   header to sort would be the obvious gesture and is the wrong one here: the
   header is editable text, so a click has to place the caret. Sorting from the
   toolbar keeps both. */
/* What number, if any, is in a table cell.

   The old version was `parseFloat(s.replace(/[^\d.eE+-]/g, ''))`, which strips
   every separator and hopes. That is right for "$1,840.50" and silently, badly
   wrong for most of the rest of the world:

     1.840.000,00  ->  1.84      a budget column out by a factor of a million
     €1.840,50     ->  1.8405
     (2,400)       ->  +2400     an accounting negative sorting as a positive

   None of those raised an error. They produced a plausible number and put the
   rows in the wrong order, which for a column of money is the worst failure
   there is — you cannot see it, and you will act on it.

   The rule for telling a thousands separator from a decimal point:

   - Both `.` and `,` present? The **last one** is the decimal separator. True
     of every convention in use.
   - Only one kind present, more than once? Thousands — no number has two
     decimal points.
   - Only one, once? Three digits after it means thousands, anything else means
     decimal. `1,840` is 1840 and `1,84` is 1.84.

   That last rule is the one genuinely ambiguous case: US "1.840" meaning 1.84
   reads as 1840 here. Nothing can resolve it from the cell alone, and the
   three-digit convention is what spreadsheet importers use, so a column of real
   data stays self-consistent — which is all a sort needs. */
const CELL_SEP = /[   '’ ]/g;      // NBSP, thin space, apostrophe grouping
function cellNumber(raw) {
  let s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  // accounting negative: (2,400) is minus two thousand four hundred
  let sign = 1;
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1).trim(); }
  s = s.replace(CELL_SEP, '');
  // a leading or trailing sign, wherever the locale puts it
  const m = /^([+-])?(.*?)([+-])?$/.exec(s);
  if (m) {
    if (m[1] === '-' || m[3] === '-') sign = -sign;
    s = m[2];
  }
  // everything that is not a digit or a separator is currency, %, or noise
  s = s.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return null;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  let dec = '';
  if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else if (dots === 1 || commas === 1) {
    const ch = dots ? '.' : ',';
    // three digits after a lone separator is grouping, not a fraction
    dec = /^\d{3}$/.test(s.slice(s.lastIndexOf(ch) + 1)) ? '' : ch;
  }
  // strip every separator that is not the decimal one, then normalise it
  s = dec === '.' ? s.replace(/,/g, '')
    : dec === ',' ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/[.,]/g, '');
  const v = parseFloat(s);
  return isFinite(v) ? sign * v : null;
}

function sortTable(dir) {
  const cell = caretCell();
  const tb = cell && cell.closest('table');
  if (!tb) return;
  const at = cell.cellIndex;
  const rows = [...tb.rows];
  const head = rows[0] && rows[0].cells[0] && rows[0].cells[0].tagName === 'TH' ? rows.shift() : null;
  if (rows.length < 2) return;
  const key = (r) => (r.cells[at] ? r.cells[at].textContent : '').trim();
  /* Numbers sort as numbers — "10" after "9", not before it — and anything
     that is not a number falls back to the locale's own alphabetical order, so
     Arabic rows sort in Arabic. Blank cells sink to the bottom either way,
     because a half-filled table is the normal case here. */
  const asNum = cellNumber;
  const allNum = rows.every((r) => { const s = key(r); return s === '' || asNum(s) !== null; });
  const coll = new Intl.Collator(LANG._locale || LANG_ID, { numeric: true, sensitivity: 'base' });
  rows.sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (!ka && !kb) return 0;
    if (!ka) return 1;
    if (!kb) return -1;
    const r = allNum ? (asNum(ka) - asNum(kb)) : coll.compare(ka, kb);
    return dir === 'desc' ? -r : r;
  });
  const body = tb.tBodies[0] || tb;
  rows.forEach((r) => body.appendChild(r));  // header stays put; appending is enough
  tb.dataset.sort = dir;
  /* Put the caret back in the column that was just sorted. Moving a node the
     selection lives inside collapses the selection, so without this the caret
     is gone — and since sortTable() works out its column *from* the caret, the
     next click on sort silently does nothing at all. */
  const back = (head && head.cells[at]) || (body.rows[0] && body.rows[0].cells[at]);
  if (back) placeCaret(back, 0);
}

function delTable() {
  const tb = caretTable();
  if (!tb) return;
  /* Leave somewhere for the caret to land, or the note ends up focused with no
     selection and the next keystroke goes nowhere. */
  let after = tb.nextElementSibling;
  if (!after || after.tagName === 'TABLE') {
    after = document.createElement('p');
    after.innerHTML = '<br>';
    tb.after(after);
  }
  tb.remove();
  placeCaret(after, 0);
  hideTableBar();
}

/* The table toolbar. Shown whenever the caret is inside a table, hidden the
   moment it is not — the same lifecycle as the selection toolbar, and wired
   from the same selectionchange listener. */
function hideTableBar() { $('tableBar').classList.add('hidden'); }
function showTableBar() {
  const bar = $('tableBar');
  const tb = editing ? caretTable() : null;
  if (!tb || !editing.contains(tb)) { hideTableBar(); return; }
  bar.classList.remove('hidden');
  const r = tb.getBoundingClientRect();
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let left = RTL ? r.right - bw : r.left;
  let top = r.top - bh - 6;
  if (top < 44) top = Math.min(r.bottom + 6, innerHeight - bh - 6);
  bar.style.left = clamp(left, 6, innerWidth - bw - 6) + 'px';
  bar.style.top = top + 'px';
}
/* The columns toolbar. Deliberately a twin of the table one — same show/hide
   lifecycle, same "never take focus" mousedown, same reposition-after-acting —
   because two toolbars over the same editor that behave differently is how you
   get one of them feeling broken. */
function hideColsBar() { $('colsBar').classList.add('hidden'); }
function showColsBar() {
  const bar = $('colsBar');
  const grid = editing ? caretColumns() : null;
  if (!grid) { hideColsBar(); return; }
  $('colsCount').textContent = num(grid.children.length);
  bar.classList.remove('hidden');
  const r = grid.getBoundingClientRect();
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const left = RTL ? r.right - bw : r.left;
  let top = r.top - bh - 6;
  if (top < 44) top = Math.min(r.bottom + 6, innerHeight - bh - 6);
  bar.style.left = clamp(left, 6, innerWidth - bw - 6) + 'px';
  bar.style.top = top + 'px';
}
function wireColsBar() {
  $('colsBar').addEventListener('mousedown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();                     // the caret is what these act from
    if (!editing) return;
    switch (b.dataset.cb) {
      case 'add': addColumn(); break;
      case 'del': delColumn(); break;
      case 'unwrap': unwrapColumns(); break;
    }
    normalizeBody(editing);
    persistEdit();
    showColsBar();
  });
}

function wireTableBar() {
  $('tableBar').addEventListener('mousedown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    // never let the bar take focus — the caret in the cell is what every one of
    // these actions works from
    e.preventDefault();
    if (!editing) return;
    switch (b.dataset.tb) {
      case 'rowAdd': addTableRow(); break;
      case 'rowDel': delTableRow(); break;
      case 'colAdd': addTableColumn(); break;
      case 'colDel': delTableColumn(); break;
      case 'sortAsc': sortTable('asc'); break;
      case 'sortDesc': sortTable('desc'); break;
      case 'del': delTable(); break;
    }
    normalizeBody(editing);
    persistEdit();
    showTableBar();
  });
}

/* Enter inside a <pre> must add a line, not a block.
   `execCommand('insertText', '\n')` looks like it should do that and doesn't —
   Chrome treats the newline as a paragraph break and splits the <pre> in two,
   which is what made the code block appear "not to work". Insert the character
   into the DOM by hand instead.

   The trailing zero-width space matters: CSS drops a newline that sits at the
   very end of a block, so without it the caret has no line to sit on and the
   next keystroke appears on the previous line. */
function insertNewlineInPre(pre) {
  const s = getSelection();
  if (!s.rangeCount) return;
  const r = s.getRangeAt(0);
  r.deleteContents();
  const tail = atEndOf(pre);
  const tn = document.createTextNode(tail ? '\n​' : '\n');
  r.insertNode(tn);
  placeCaret(tn, tn.length);   // no normalize() here — merging text nodes would invalidate the caret
}

/* Every newline typed in a code block leaves a zero-width space behind (see
   above). Only the very last one is load-bearing, so strip the rest once the
   caret is out of the way — otherwise copying the code out carries them along.
   Never call this while that block is being edited: rewriting textContent
   destroys the caret. */
function cleanCodeBlocks(body) {
  body.querySelectorAll('pre.mb-code code').forEach((code) => {
    let t = code.textContent.replace(/​/g, '');
    if (/\n$/.test(t)) t += '​';
    if (t !== code.textContent) code.textContent = t;
  });
}

function caretPre() {
  const s = getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (n && n.nodeType === 3) n = n.parentElement;
  return n ? n.closest('pre.mb-code') : null;
}
function atEndOf(el) {
  const s = getSelection();
  if (!s.rangeCount) return false;
  const r = s.getRangeAt(0).cloneRange();
  r.selectNodeContents(el); r.setStart(s.anchorNode, s.anchorOffset);
  return r.toString().replace(/\s+$/, '') === '';
}
function placeCaret(node, offset) {
  const r = document.createRange();
  try { r.setStart(node, offset); } catch (_) { r.selectNodeContents(node); }
  r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

function insertImageFile(file, body, n) {
  const commit = (src) => {
    body.focus();
    insertHTML(`<img class="mb-img" src="${esc(src)}"><p><br></p>`);
    n.body = bodyHtml(body); saveSoon();
  };
  const url = FILES && FILES.toUrl ? FILES.toUrl(file) : null;
  if (url) { commit(url); return; }
  if (file.size > 6 * 1024 * 1024) { toast(t('msg.imageTooBig')); return; }
  const r = new FileReader();
  r.onload = () => commit(r.result);
  r.readAsDataURL(file);
}

async function pickAndInsertImage() {
  if (!editing) return;
  const body = editing, n = editNote;
  if (FILES && FILES.pickImage) {
    const url = await FILES.pickImage();
    if (!url) return;
    body.focus();
    insertHTML(`<img class="mb-img" src="${esc(url)}"><p><br></p>`);
    n.body = bodyHtml(body); saveSoon();
    return;
  }
  toast(t('msg.needDesktop'));
}

function onEditorPaste(e, body, n) {
  const dt = e.clipboardData;
  if (!dt) return;
  const img = [...(dt.items || [])].find((i) => i.type && i.type.startsWith('image/'));
  if (img) {
    const f = img.getAsFile();
    if (f) { e.preventDefault(); insertImageFile(f, body, n); return; }
  }
  const text = dt.getData('text/plain');
  const sel = getSelection();
  /* A pasted URL is ambiguous — plain text, a link, a card, a player — and the
     app cannot know which was meant. Rather than guess, offer the four the way
     Notion does and let the first one be the answer for anyone who just keeps
     typing. Over a selection there is no ambiguity: the selected words become
     the link text, which is the only reading that does not throw them away. */
  const url = (text || '').trim();
  if (url && /^https?:\/\/\S+$/i.test(url)) {
    e.preventDefault();
    if (sel && !sel.isCollapsed) {
      document.execCommand('createLink', false, url);
      n.body = bodyHtml(body); saveSoon();
      return;
    }
    openPasteMenu(url, body, n);
    return;
  }
  if (text && !dt.types.includes('text/html')) return;   // plain text: let it through
  // otherwise strip the incoming markup down to what we support
  if (dt.types.includes('text/html')) {
    e.preventDefault();
    insertHTML(sanitize(dt.getData('text/html')));
    n.body = bodyHtml(body); saveSoon();
  }
}

/* Tables are allowed through a paste, so copying one out of a web page or a
   spreadsheet lands as a table rather than a wall of text. Note what is *not*
   here: SVG. Our own inline icons are inserted directly and never go through
   this, so they survive inside the app; letting arbitrary <svg> in from a paste
   would be handing a document from the internet a much larger attack surface
   than a note needs, for the sake of pasted decoration. */
const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A', 'IMG', 'SPAN', 'DIV', 'MARK', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH']);
function sanitize(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('*').forEach((el) => {
    if (!ALLOWED.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
    [...el.attributes].forEach((a) => {
      const keep = (el.tagName === 'A' && a.name === 'href') ||
                   // a board link pasted from another note keeps pointing at it
                   (el.tagName === 'A' && a.name === 'data-board' && /\bmb-board\b/.test(el.className)) ||
                   /* An embed copied between notes keeps working. Only the two
                      attributes the card is rebuilt from survive, and `data-vid`
                      is re-checked against the pattern that produced it — so a
                      crafted paste cannot smuggle a frame URL in, it can only
                      name a video id that the app then builds the URL for. */
                   (el.tagName === 'DIV' && a.name === 'data-embed' && /\bmb-embed\b/.test(el.className)) ||
                   (el.tagName === 'DIV' && a.name === 'data-vid' && /\bmb-embed\b/.test(el.className) && /^[\w-]{0,20}$/.test(a.value)) ||
                   /* The card's own caption. Title and channel are text, but
                      `data-thumb` becomes an <img src>, so it is held to the one
                      scheme the thumbnail cache ever writes — a pasted card
                      cannot smuggle a remote image past the CSP by wearing the
                      right class. */
                   (el.tagName === 'DIV' && /\bmb-embed\b/.test(el.className) &&
                    (a.name === 'data-title' || a.name === 'data-author')) ||
                   (el.tagName === 'DIV' && a.name === 'data-thumb' && /\bmb-embed\b/.test(el.className) && /^file:/i.test(a.value)) ||
                   (el.tagName === 'IMG' && a.name === 'src') ||
                   // a paragraph pasted from an RTL page keeps the side it was written on
                   (a.name === 'dir' && /^(ltr|rtl|auto)$/i.test(a.value)) ||
                   (a.name === 'class' && /^(mb-|fs-|note-)/.test(a.value));
      if (!keep) el.removeAttribute(a.name);
    });
    /* `file:` is allowed through so a link to a document survives being copied
       from one note to another. It is not a way in: main vets the extension
       before it opens anything and reveals in Explorer rather than running
       whatever it was handed. See shell:open-local. */
    if (el.tagName === 'A' && !/^(https?:|mailto:|file:)/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
    // a pasted table has to carry our class or it renders as unstyled rows
    if (el.tagName === 'TABLE') el.className = 'mb-table';
    /* A remote image is dropped, not kept. The CSP in index.html is
       `img-src 'self' data: blob: file:` — it has no http(s) — so an <img>
       pasted from a web page could never load: it left a permanent broken-image
       box in the note and a refusal in the console, and the two policies
       disagreed about the same paste. The app's own rule is that an image is a
       local file or an inlined data URL, and this is now the only rule. */
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (!/^(data:image\/|file:)/i.test(src)) el.remove(); else el.className = 'mb-img';
    }
  });
  return d.innerHTML;
}
