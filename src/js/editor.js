/* Mental Board — editor.js
   The note editor: markdown, blocks, tables, columns, templates, the paste sanitiser.

   Part 9 of 22. These files are plain scripts sharing one global
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
    if (columnsBroken(body)) repairColumns(body);    // a typed merge across a column edge
    ensureTail(body);                                  // somewhere to write under a table
    if (body.querySelector('.mb-math:not(:has(> .mx-face))')) paintMath(body);
    // a database or a contents block that came back without its face (an undo, a drop)
    if (body.querySelector('.mb-db:not(:has(> .db-face))')) paintDatabases(body);
    if (body.querySelector('.mb-toc')) paintTocs(body);
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
    // a formula is one object too: clicking it while writing opens it to edit
    const mx = e.target.closest('.mb-math');
    if (mx && el.classList.contains('editing')) { e.preventDefault(); openMathDialog(mx); return; }
    // a line of the table of contents scrolls the note to its heading, open or closed
    const ti = e.target.closest('.toc-i');
    if (ti) { e.preventDefault(); jumpToHeading(body, +ti.dataset.i); return; }
    // a toggle's arrow opens and closes it, in an open note or a closed one (blocks.js)
    const tgh = toggleArrowAt(e);
    if (tgh) { e.preventDefault(); flipToggle(tgh, body, n); return; }
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
    if (a && a.classList.contains('mb-note')) {
      e.preventDefault();               // href="#" must not do anything of its own
      if (!el.classList.contains('editing') || e.ctrlKey || e.metaKey) followNoteLink(a);
      return;
    }
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
  /* A file dropped *into* a note goes into that note, rather than making one of
     its own — which is the difference between this handler and the canvas one,
     and why it stops propagation. Any file, not only an image: a clip dragged
     into the middle of a paragraph is the most natural way anybody would try to
     put a video in a note. */
  body.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files ? [...e.dataTransfer.files] : [];
    if (!files.length) return;
    e.preventDefault(); e.stopPropagation();
    if (!canEditHere()) return;
    enterEdit(n);
    insertFilesInto(files, body, n);
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
  const lifted = [...body.querySelectorAll('.emb-face, .mb-embed iframe, .mb-cant, .mb-math > .mx-face, .mb-db > .db-face, .mb-toc > .toc-face')]
    .map((el) => ({ el, parent: el.parentNode, next: el.nextSibling }));
  lifted.forEach((m) => m.el.remove());
  const marked = body.querySelector('img.img-sel');
  if (marked) marked.classList.remove('img-sel');
  const html = body.innerHTML.replace(/ data-watched="1"/g, '');
  if (marked) marked.classList.add('img-sel');
  lifted.forEach((m) => { if (m.parent) m.parent.insertBefore(m.el, m.next); });
  return html;
}

function enterEdit(n) {
  if (!canEditHere()) return;
  if (n && n.pic) { editPicture(n.id); return; }     // a picture has no text; its editor is the studio
  if (n && n.sketch) { openSketch(n.id); return; }
  if (n && n.book) { openBook(n.id); return; }         // and a book opens its reader (book.js)   // nor has a drawing note; its editor is full screen (sketch.js)
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
  // caret to the end — into the line under a table, never after it (ensureTail)
  const tail = ensureTail(body);
  const r = document.createRange(); r.selectNodeContents(tail || body); r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}

function exitEdit() {
  closeSlash(); hideSelBar(); clearImageSel(); hideTableBar(); hideColsBar(); hideBlockHandle();
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
  if (farMode) scheduleMount();   // zoomed out mid-edit: it becomes a ghost like the rest
}

/* --- keyboard inside a note ------------------------------------------- */
function onEditorKey(e, body, n) {
  e.stopPropagation();     // canvas shortcuts must not fire while typing
  hideBlockHandle();       // typing puts the block handle away, as Notion's does (blocks.js)

  /* First, because the paste menu is modal over the caret: it opened *because*
     of a keystroke and the next one is an answer to it, not text. */
  if (pasteMenuKey(e)) return;

  if (slash.open) {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) { slashKey(e); return; }
  }

  if (e.key === 'Escape') { e.preventDefault(); exitEdit(); $('viewport').focus(); return; }

  // letterKey(), not e.key: on an Arabic layout the K key reports 'ل'. See §1.
  if ((e.ctrlKey || e.metaKey) && letterKey(e) === 'k') { e.preventDefault(); openLinkDialog(); return; }
  /* Word's keys: Ctrl+Shift+= superscript, Ctrl+= subscript, Alt+= a formula.
     e.code, not e.key — '=' is a different character on half the layouts. */
  if (e.code === 'Equal' && (e.ctrlKey || e.metaKey) && !e.altKey) {
    e.preventDefault();
    document.execCommand(e.shiftKey ? 'superscript' : 'subscript');
    persistEdit();
    return;
  }
  if (e.code === 'Equal' && e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); openMathDialog(null); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); exitEdit(); return; }
  if (columnEdgeKey(e)) return;
  if (dbGuardKey(e, body)) return;      // a database is not deleted by a stray Backspace (database.js)
  if (blockMoveKey(e, body)) return;    // Ctrl+Shift+↑/↓ moves the block (blocks.js)
  if (toggleKey(e, body)) return;       // Enter and Backspace in a toggle (blocks.js)

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
// what may stand directly in a note body without a paragraph around it
const LOOSE_BLOCK_RE = /^(UL|OL|BLOCKQUOTE|PRE|H1|H2|H3|HR|DIV|P|TABLE|IMG|VIDEO|AUDIO|FIGURE)$/;
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
  /* A whole loose line, not each text node on it: "Area ", a formula and
     " ok" are one paragraph, and wrapping the text alone left the formula
     and the words after it outside it (2.3). The caret is put back, since
     moving the node it sits in drops it. */
  const s = getSelection();
  const at = s.rangeCount ? { node: s.anchorNode, off: s.anchorOffset } : null;
  let run = [], moved = false;
  const flush = () => {
    if (run.some((x) => (x.nodeType === 3 ? x.textContent.trim() : x.tagName !== 'BR'))) {
      const p = document.createElement('p');
      run[0].before(p);
      run.forEach((x) => p.appendChild(x));
      moved = true;
    }
    run = [];
  };
  [...body.childNodes].forEach((node) => {
    const inline = node.nodeType === 3 || (node.nodeType === 1 && !LOOSE_BLOCK_RE.test(node.tagName));
    if (inline) run.push(node); else flush();
  });
  flush();
  if (moved && at && at.node && body.contains(at.node)) placeCaret(at.node, at.off);
  // a heading inside a heading renders at the product of both sizes
  body.querySelectorAll('h1 :is(h1,h2,h3), h2 :is(h1,h2,h3), h3 :is(h1,h2,h3)')
    .forEach((h) => h.replaceWith(...h.childNodes));
  // and a code span inside a code span draws two borders
  body.querySelectorAll('code code').forEach((c) => c.replaceWith(...c.childNodes));
  repairColumns(body);
  repairToggles(body);           // a toggle always has its title and its inside (blocks.js)
  // collapse redundant size wrappers
  body.querySelectorAll('span.mb-fs > span.mb-fs:only-child').forEach((inner) => {
    const outer = inner.parentElement;
    if (outer) outer.replaceWith(inner);
  });
  /* `insertHTML` copies the *stylesheet's* look onto what it inserts —
     `font-family: var(--face-system)`, `color: var(--text)`, the note's own
     font size — as inline styles, and wraps the space after it in a span to
     carry them. Every one of those is the theme frozen into the text: change
     the note font or the theme and that run stays behind. Nothing the app
     writes into a body ever contains `var(` (see STYLE_OK), so a declaration
     that does is always this echo, and a span left with nothing is unwrapped. */
  body.querySelectorAll('[style*="var("]').forEach((el) => {
    for (const prop of [...el.style]) if (el.style.getPropertyValue(prop).includes('var(')) el.style.removeProperty(prop);
    if (!el.style.length) el.removeAttribute('style');
    if (el.tagName === 'SPAN' && !el.attributes.length) el.replaceWith(...el.childNodes);
  });
}

// Notion-style markdown triggers on space / enter. Returns true when it
// consumed the keystroke.
function mdShortcuts(e, body, n) {
  if (e.key !== ' ' && e.key !== 'Enter') return false;
  /* None in a toggle's title: formatBlock there would turn the title's <div>
     into the heading and the toggle would lose its head (blocks.js). */
  if (caretClosest('.mb-tg-head')) return false;
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
    /* $a^2+b^2$ then a space becomes a formula, the way it does in Notion and
       Obsidian. The edges may not be spaces, so "$5 and $6" stays money. */
    const before = tn.textContent.slice(0, sel.anchorOffset);
    const mx = /\$(?!\s)([^$\n]*[^\s$])\$$/.exec(before);
    if (mx) {
      e.preventDefault();
      const r = document.createRange();
      r.setStart(tn, sel.anchorOffset - mx[0].length); r.setEnd(tn, sel.anchorOffset);
      sel.removeAllRanges(); sel.addRange(r);
      insertMath(mx[1], false);
      done();
      return true;
    }
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
    // a. A. i. I. — a list numbered in letters or Roman numerals
    if (OL_MARKERS[marker]) { e.preventDefault(); eat(); insertStyledList(OL_MARKERS[marker]); done(); return true; }
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
/* An ordered list numbered some other way than 1, 2, 3. The style is a class
   on the <ol> (`mb-ol-*` survives sanitize()), not `type=` or an inline style,
   neither of which survives a copy between notes. A list nested in a list
   with no class of its own steps through letters and Roman numerals by
   itself (mental.css §67), the way a document outline does. */
const OL_STYLES = ['la', 'ua', 'lr', 'ur'];           // a, A, i, I
const OL_MARKERS = { 'a.': 'la', 'A.': 'ua', 'i.': 'lr', 'I.': 'ur' };
function insertStyledList(style) {
  let ol = caretClosest('ol');
  if (!ol) { escapeList(); document.execCommand('insertOrderedList'); ol = caretClosest('ol'); }
  if (!ol) return;
  OL_STYLES.forEach((k) => ol.classList.remove('mb-ol-' + k));
  if (OL_STYLES.includes(style)) ol.classList.add('mb-ol-' + style);
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

/* --- a table of contents (2.8) -------------------------------------------
   Notion's: the note's headings, each one a jump to it. `div.mb-toc` stores
   nothing at all — its list is `.toc-face`, painted from the headings on every
   keystroke (cheap: one query) and lifted out by bodyHtml(), so it can never
   go stale in the saved note. */
function insertToc() {
  escapeList();
  insertHTML('<div class="mb-toc" contenteditable="false"></div><p><br></p>');
  if (editing) { paintTocs(editing); normalizeBody(editing); }
}
// the note's headings — a toggle heading's title counts as its level (2.9, blocks.js)
const TOC_SEL = 'h1, h2, h3, .mb-tg-h1 > .mb-tg-head, .mb-tg-h2 > .mb-tg-head, .mb-tg-h3 > .mb-tg-head';
const tocHeadings = (body) => [...body.querySelectorAll(TOC_SEL)].filter((h) => !h.closest('.mb-toc, .mb-db'));
const tocLevel = (h) => (/^H[1-3]$/.test(h.tagName) ? h.tagName.toLowerCase() : 'h' + /mb-tg-h([1-3])/.exec(h.parentElement.className)[1]);
function paintTocs(root) {
  if (!root) return;
  const tocs = root.querySelectorAll('.mb-toc');
  if (!tocs.length) return;
  const heads = tocHeadings(root);
  const html = heads.length
    ? heads.map((h, i) => `<button class="toc-i toc-${tocLevel(h)}" data-act="toc" data-i="${i}" dir="auto">${esc(h.textContent.trim() || '…')}</button>`).join('')
    : `<span class="toc-none">${te('toc.empty')}</span>`;
  tocs.forEach((el) => {
    let face = el.querySelector(':scope > .toc-face');
    if (!face) {
      el.textContent = '';
      face = document.createElement('div');
      face.className = 'toc-face';
      el.appendChild(face);
      el.setAttribute('contenteditable', 'false');
    }
    if (face.innerHTML !== html) face.innerHTML = html;
  });
}
/* By hand, not scrollIntoView(): that scrolls every ancestor it can, and the
   viewport is one — the board would jump under the note. */
function jumpToHeading(body, i) {
  const h = tocHeadings(body)[i];
  if (!h) return;
  // a heading folded away inside a closed toggle is unfolded to be shown
  for (let tg = h.parentElement.closest('.mb-toggle'); tg && body.contains(tg); tg = tg.parentElement.closest('.mb-toggle')) {
    if (h.parentElement === tg) continue;
    tg.classList.add('mb-open');
  }
  const z = state.view.z || 1;
  const top = body.scrollTop + (h.getBoundingClientRect().top - body.getBoundingClientRect().top) / z - 8;
  body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  h.animate([{ backgroundColor: 'color-mix(in srgb, var(--accent) 30%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 1100, easing: 'ease-out' });
}

/* --- maths and chemistry (2.3) -------------------------------------------
   A formula is `span.mb-math` (inline) or `div.mb-math.mb-math-block` (on its
   own line, centred) carrying its LaTeX in `data-tex` and nothing else. What
   you see is KaTeX's drawing of it, in an `.mx-face` child that is painted,
   never stored — `bodyHtml()` lifts it out exactly the way it lifts an embed's
   card. So a note stores `a^n`, not two kilobytes of KaTeX spans, and a newer
   KaTeX redraws every old formula.

   Chemistry is the same element: `\ce{H2SO4}` is mhchem, which ships beside
   KaTeX in assets/katex. `contenteditable="false"` for the reason inlineIcon()
   gives — the formula behaves as one character, and a click opens it in the
   formula window (openMathDialog, settings.js) instead of putting a caret into
   KaTeX's markup. */
const mathDrawn = new WeakMap();      // element → the tex its face was drawn from
function mathHtml(tex, block) {
  const tag = block ? 'div' : 'span';
  return `<${tag} class="mb-math${block ? ' mb-math-block' : ''}" data-tex="${esc(tex)}" contenteditable="false"></${tag}>`;
}
function renderTex(tex, into, block) {
  into.textContent = '';
  if (!window.katex) { into.textContent = tex; return; }
  try {
    katex.render(tex, into, { throwOnError: false, displayMode: !!block, output: 'html', strict: 'ignore', trust: false });
  } catch (_) { into.textContent = tex; }
}
function paintMath(root) {
  if (!root) return;
  root.querySelectorAll('.mb-math').forEach((el) => {
    const tex = el.getAttribute('data-tex') || '';
    const block = el.classList.contains('mb-math-block');
    const face = el.querySelector(':scope > .mx-face');
    if (face && mathDrawn.get(el) === tex + (block ? '\n' : '')) return;
    // a paste arrives with the face's KaTeX spans stripped to bare text: start clean
    el.textContent = '';
    const f = document.createElement('span');
    f.className = 'mx-face';
    renderTex(tex.trim() ? tex : '\\square', f, block);
    el.appendChild(f);
    el.setAttribute('contenteditable', 'false');
    mathDrawn.set(el, tex + (block ? '\n' : ''));
  });
}
function insertMath(tex, block) {
  if (block) { escapeList(); insertHTML(mathHtml(tex, true) + '<p><br></p>'); }
  else {
    /* By hand, not insertHTML: on a note's first, still-bare line Chrome put
       the formula *after* a new paragraph holding the words before it. */
    const s = getSelection();
    if (!s.rangeCount || !editing || !editing.contains(s.getRangeAt(0).commonAncestorContainer)) return;
    const r = s.getRangeAt(0);
    r.deleteContents();
    const tmp = document.createElement('div');
    tmp.innerHTML = mathHtml(tex, false);
    const el = tmp.firstChild, sp = document.createTextNode(' ');
    r.insertNode(sp);
    r.insertNode(el);
    placeCaret(sp, 1);
  }
  if (editing) { paintMath(editing); normalizeBody(editing); }
}

/* --- pasting from ChatGPT, Gemini and the like (2.3) -----------------------
   Three shapes arrive, and each used to land as noise:

   · Markdown as plain text (their copy buttons): "## I. …", "*   **Tanım:**",
     "$a^n$" — pasted letter for letter. looksLikeMarkdown() spots it and
     markdownToNote() (canvas.js, the Obsidian importer) turns it into
     headings, nested lists, bold and formulas.
   · HTML of the page with KaTeX or MathJax in it (a selection copied off the
     chat): every formula is three copies of itself — MathML, the drawing and
     the LaTeX — and sanitize() kept the text of all three. mathFromPaste()
     swaps each for an .mb-math built from the LaTeX the page left in it.
   · LaTeX that lost its backslashes on the way: "n cdot a". fixTex() puts
     them back on the command names that cannot be anything else. */
const TEX_WORDS = 'cdots|cdot|ldots|dots|times|div|neq|leq|geq|pm|mp|infty|approx|equiv|propto|' +
  'frac|dfrac|tfrac|sqrt|sum|prod|int|oint|lim|partial|nabla|alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|' +
  'theta|Theta|lambda|Lambda|mu|sigma|Sigma|omega|Omega|varphi|phi|Phi|psi|Psi|rho|tau|eta|zeta|xi|' +
  'rightarrow|Rightarrow|leftarrow|Leftarrow|leftrightarrow|Leftrightarrow|implies|iff|mapsto|' +
  'text|textbf|mathbb|mathrm|mathbf|overline|underline|vec|hat|bar|' +
  'sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|log|ln|exp|forall|exists|subseteq|subset|cup|cap|emptyset|' +
  'circ|degree|angle|triangle|perp|parallel|quad|qquad';
const TEX_BARE = new RegExp(`(^|[^\\\\a-zA-Z])(${TEX_WORDS})(?![a-zA-Z])`, 'g');
function fixTex(tex) {
  /* Only outside \text{…}: the words in "\text{left side}" are words. And
     "ce" only when a brace follows, since a bare "ce" is just c times e. */
  return String(tex || '').split(/(\\text[a-z]*\{[^}]*\})/).map((part, i) => (i % 2 ? part
    : part.replace(TEX_BARE, (m, pre, w) => pre + '\\' + w).replace(/(^|[^\\a-zA-Z])ce\{/g, '$1\\ce{'))).join('');
}
function mathFromPaste(root) {
  const swap = (el, tex, block) => {
    if (!tex || !tex.trim()) return;
    const t = document.createElement(block ? 'div' : 'span');
    t.className = 'mb-math' + (block ? ' mb-math-block' : '');
    t.setAttribute('data-tex', tex.trim());
    el.replaceWith(t);
  };
  // Gemini: the LaTeX on an attribute
  root.querySelectorAll('[data-math]').forEach((el) => {
    if (!root.contains(el)) return;
    swap(el, el.getAttribute('data-math'), /block|display/.test(el.className) || el.tagName === 'DIV');
  });
  // KaTeX (ChatGPT, Claude, Notion) and MathJax: the LaTeX in an <annotation>
  root.querySelectorAll('.katex-display, .katex, mjx-container, math').forEach((el) => {
    if (!root.contains(el) || el.closest('.mb-math')) return;
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (!ann) return;
    const block = el.classList.contains('katex-display') || el.getAttribute('display') === 'block' ||
      el.getAttribute('display') === 'true' || !!el.closest('.katex-display');
    swap(el.closest('.katex-display') && block ? el.closest('.katex-display') : el, ann.textContent, block);
  });
  root.querySelectorAll('script[type^="math/tex"]').forEach((el) => swap(el, el.textContent, /display/.test(el.type)));
}
/* Is this plain text Markdown? A heading, a list, bold or a formula on
   enough of it to be sure — a single "- " line is not worth reshaping. */
function looksLikeMarkdown(text) {
  const t = String(text || '');
  if (!/\n/.test(t.trim()) && !/\$[^$\s][^$\n]*\$|\\\(|\*\*[^*\n]+\*\*/.test(t)) return false;
  let score = 0;
  if (/^\s{0,3}#{1,6}\s+\S/m.test(t)) score += 2;
  if ((t.match(/^\s*([-*+]|\d+[.)])\s+\S/gm) || []).length >= 2) score += 2;
  if (/\*\*[^*\n]+\*\*/.test(t)) score += 1;
  if (/(^|[^\w$\\])\$(?!\s)[^$\n]*[^\s$\\]\$(?![\w$])|\\\(|\\\[|^\s*\$\$/m.test(t)) score += 2;
  if (/^\s*\|.*\|\s*$/m.test(t) && /^\s*\|?\s*:?-{3,}/m.test(t)) score += 2;
  if (/^\s*```/m.test(t)) score += 1;
  return score >= 2;
}
// does sanitized HTML already carry its own structure? then it beats the plain text
const richHtml = (html) => /<(h[1-3]|li|table|b|strong|pre)\b|class="mb-math/i.test(html);

/* --- a table, a grid or a formula is never the last thing in a note --------
   insertTable() appends a paragraph after the table, but nothing kept it
   there: Backspace on that empty line deletes it, and a note reopened with the
   table last puts the caret after the table at the top level, where typing
   makes bare text and a click lands in the last cell. Either way there was no
   way to write under the table. Every edit puts the line back. */
function ensureTail(body) {
  if (!body) return null;
  let last = body.lastChild;
  while (last && last.nodeType === 3 && !last.textContent.replace(/​/g, '').trim()) last = last.previousSibling;
  if (!last || last.nodeType !== 1) return null;
  const needs = last.tagName === 'TABLE' || last.tagName === 'PRE' ||
    (last.tagName === 'DIV' && /\b(mb-cols|mb-math-block|mb-embed|mb-file|mb-db|mb-toc|mb-toggle)\b/.test(last.className));
  if (!needs) return null;
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  body.appendChild(p);
  return p;
}

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
   the note.

   2.4 rebuilt it as a flex row and gave the columns **widths**: drag the line
   between two columns and they trade space, double-click it and they are even
   again. A width is a class, `mb-w-<percent>` (10 to 90, COL_STEP apart), on
   each column — a class because the sanitiser keeps `mb-` classes and nothing
   else, so a width survives copy and paste where a style would not. Either
   every column in a block has one or none does (repairColumns() sees to it);
   none means even. The CSS is one block at the end of css/mental.css (§70). */
const COLS_MAX = 12;
const COL_STEP = 1, COL_MIN = 10;   // %; css/mental.css §70 has a rule for every width in between
const colCell = () => '<div class="mb-col"><p><br></p></div>';

// a column's width in %, or 0 when the block is even
function colWidth(col) {
  const m = /\bmb-w-(\d+)\b/.exec(col.className || '');
  return m ? +m[1] : 0;
}
function setColWidth(col, w) {
  [...col.classList].forEach((c) => { if (/^mb-w-\d+$/.test(c)) col.classList.remove(c); });
  if (w) col.classList.add('mb-w-' + w);
}
/* Give every column of a block a width from a list of raw numbers: scaled to
   100, snapped to COL_STEP, never under COL_MIN, and the rounding error put on
   the widest so the row still adds up. */
function applyColWidths(grid, raw) {
  const cols = [...grid.children];
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  let w = raw.map((v) => Math.max(COL_MIN, Math.round((v / sum) * 100 / COL_STEP) * COL_STEP));
  const off = 100 - w.reduce((a, b) => a + b, 0);
  if (off) { const i = w.indexOf(Math.max(...w)); w[i] = Math.max(COL_MIN, w[i] + off); }
  const even = w.every((v) => v === w[0]);
  cols.forEach((c, i) => setColWidth(c, even ? 0 : w[i]));
}
function evenColumns(grid) { [...grid.children].forEach((c) => setColWidth(c, 0)); }

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
  const widths = [...grid.children].map(colWidth);
  const at = here && here.parentNode === grid ? [...grid.children].indexOf(here) : grid.children.length - 1;
  if (here && here.parentNode === grid) here.after(cell); else grid.appendChild(cell);
  /* An uneven block stays uneven: the new column takes half of the one it was
     added beside, rather than everything snapping back to even. */
  if (widths.every(Boolean)) {
    const half = widths[at] / 2;
    widths.splice(at, 1, half, half);
    applyColWidths(grid, widths);
  }
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
  // its width goes to the neighbour that takes the caret
  const widths = [...grid.children].map(colWidth);
  if (widths.every(Boolean) && next) {
    const i = [...grid.children].indexOf(cell), j = [...grid.children].indexOf(next);
    widths[j] += widths[i];
    widths.splice(i, 1);
    cell.remove();
    applyColWidths(grid, widths);
  } else cell.remove();
  if (next) placeCaret(next.firstChild || next, 0);
}

/* Put a columns block back into the one shape the CSS draws: `.mb-cols` whose
   children are all `.mb-col`, each holding blocks. execCommand does not know
   the shape exists, and every way it was seen to break it is undone here:

   - a block that landed directly in the grid (a merge across columns, a paste)
     is moved into the column before it, so it stops being a column of its own;
   - a `.mb-col` that was lifted out of its grid is unwrapped;
   - bare text in a column gets a paragraph, or `formatBlock` on it wraps the
     whole grid in a heading;
   - a column emptied by Backspace keeps a paragraph to click into;
   - a grid down to one column is unwrapped — there is no row left, and the
     columns toolbar cannot do anything with one;
   - a size span wrapped round a grid or a column (the old applyFontPx did
     this) is pushed inside it, onto the text.

   Runs from normalizeBody(), so after every edit that goes through
   persistEdit(); it costs nothing on a note with no columns. */
/* Cheap enough for every keystroke: is any columns block out of shape? */
function columnsBroken(body) {
  if (!body.querySelector('.mb-cols, .mb-col')) return false;
  for (const g of body.querySelectorAll('.mb-cols')) {
    let cols = 0;
    for (const c of g.children) { if (!c.classList.contains('mb-col')) return true; if (!c.firstChild) return true; cols++; }
    if (cols < 2) return true;
  }
  for (const c of body.querySelectorAll('.mb-col')) if (!c.parentElement.classList.contains('mb-cols')) return true;
  return false;
}
/* Widths are all-or-nothing per block, and a column carries one only inside a
   block — a width left on a column that was lifted out means nothing. */
function repairColWidths(body) {
  body.querySelectorAll('.mb-cols').forEach((grid) => {
    const cols = [...grid.querySelectorAll(':scope > .mb-col')];
    const w = cols.map(colWidth);
    if (w.some(Boolean) && !w.every(Boolean)) evenColumns(grid);
    else if (w.every(Boolean) && w.reduce((a, b) => a + b, 0) !== 100) applyColWidths(grid, w);
  });
}
function repairColumns(body) {
  if (!body.querySelector('.mb-cols, .mb-col')) return;
  body.querySelectorAll('span.mb-fs').forEach((sp) => {
    if (!sp.querySelector(':scope > .mb-cols, :scope > .mb-col')) return;
    const size = sp.style.fontSize;
    [...sp.childNodes].forEach((c) => {
      if (c.nodeType === 1 && /\bmb-col/.test(c.className)) {
        c.querySelectorAll('p, li, h1, h2, h3, blockquote, td, th').forEach((blk) => {
          if (blk.querySelector('p, li, h1, h2, h3, blockquote, td, th')) return;
          const inner = document.createElement('span');
          inner.className = 'mb-fs'; inner.style.fontSize = size;
          while (blk.firstChild) inner.appendChild(blk.firstChild);
          blk.appendChild(inner);
        });
      }
    });
    sp.replaceWith(...sp.childNodes);
  });
  body.querySelectorAll('.mb-col').forEach((col) => {
    if (!col.parentElement || !col.parentElement.classList.contains('mb-cols')) col.replaceWith(...col.childNodes);
  });
  body.querySelectorAll('.mb-cols').forEach((grid) => {
    let prev = null;
    [...grid.childNodes].forEach((c) => {
      if (c.nodeType === 1 && c.classList.contains('mb-col')) { prev = c; return; }
      if (c.nodeType === 3 && !c.textContent.trim()) { c.remove(); return; }
      if (!prev) { prev = document.createElement('div'); prev.className = 'mb-col'; grid.insertBefore(prev, c); }
      prev.appendChild(c);
    });
    grid.querySelectorAll(':scope > .mb-col').forEach((col) => {
      [...col.childNodes].forEach((c) => {
        if (c.nodeType === 3 && c.textContent.trim()) { const p = document.createElement('p'); c.replaceWith(p); p.appendChild(c); }
        else if (c.nodeType === 1 && /^(B|STRONG|I|EM|U|S|CODE|A|SPAN|MARK|BR)$/.test(c.tagName)) {
          const p = document.createElement('p'); c.replaceWith(p); p.appendChild(c);
        }
      });
      if (!col.firstElementChild) col.innerHTML = '<p><br></p>';
    });
    const cols = grid.querySelectorAll(':scope > .mb-col');
    if (cols.length < 2) {
      const out = document.createDocumentFragment();
      cols.forEach((col) => { while (col.firstChild) out.appendChild(col.firstChild); });
      grid.replaceWith(out);
    }
  });
  repairColWidths(body);
}

/* Backspace at the very start of a column, or Delete at the very end of one,
   is a merge across the column edge — and execCommand performs it: the two
   columns' text runs together and one column is left empty or gone. A column
   edge is a wall. Returns true when it swallowed the key. */
function columnEdgeKey(e) {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return false;
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const col = caretColumn();
  if (!col || !editing || !editing.contains(col)) return false;
  const r = s.getRangeAt(0);
  const probe = document.createRange();
  probe.selectNodeContents(col);
  if (e.key === 'Backspace') probe.setEnd(r.startContainer, r.startOffset);
  else probe.setStart(r.endContainer, r.endOffset);
  const between = probe.cloneContents();
  // nothing but empty markup between the caret and the column's edge
  if ((between.textContent || '').replace(/[\s​]/g, '') || between.querySelector && between.querySelector('img, video, audio, hr, table, svg')) return false;
  /* An empty column's one paragraph is the exception for Backspace: the caret
     is at its start *and* its end, and the useful thing is nothing at all —
     the column stays, still empty, ready to type into. */
  e.preventDefault();
  return true;
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
  $('colsBar').querySelector('[data-cb="even"]').disabled = ![...grid.children].some(colWidth);
  bar.classList.remove('hidden');
  const r = grid.getBoundingClientRect();
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  const left = RTL ? r.right - bw : r.left;
  let top = r.top - bh - 6;
  if (top < 44) top = Math.min(r.bottom + 6, innerHeight - bh - 6);
  bar.style.left = clamp(left, 6, innerWidth - bw - 6) + 'px';
  bar.style.top = top + 'px';
}
/* The line between two columns is a handle (2.4). Within COL_GRAB px of it,
   in a note being edited, the pointer becomes a resize cursor; pressing there
   drags the boundary and the two columns either side trade width, in COL_STEP
   steps, never below COL_MIN. A double-click on it evens the block out.

   The cursor is a class on <body>, not on the block — anything put on the
   block is in the note's markup and would be saved with it. */
const COL_GRAB = 9;   // about half the gap the line sits in, so the whole gap is the handle
function colEdgeAt(e) {
  const t = e.target && e.target.closest ? e.target.closest('.note.editing .note-body .mb-cols') : null;
  if (!t) return null;
  const cols = [...t.querySelectorAll(':scope > .mb-col')];
  const rtl = getComputedStyle(t).direction === 'rtl';
  for (let i = 1; i < cols.length; i++) {
    const a = cols[i - 1].getBoundingClientRect(), b = cols[i].getBoundingClientRect();
    if (Math.abs(a.top - b.top) > 2) return null;          // stacked: the note is too narrow for a row
    const x = rtl ? (b.right + a.left) / 2 : (a.right + b.left) / 2;   // the line is in the middle of the gap
    if (Math.abs(e.clientX - x) <= COL_GRAB && e.clientY >= b.top && e.clientY <= b.bottom) return { grid: t, i, rtl };
  }
  return null;
}
function wireColDrag() {
  document.addEventListener('pointermove', (e) => {
    if (e.buttons) return;
    document.body.classList.toggle('col-edge', !!(editing && colEdgeAt(e)));
  }, true);
  document.addEventListener('dblclick', (e) => {
    const hit = editing && colEdgeAt(e);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    evenColumns(hit.grid);
    persistEdit(); showColsBar();
  }, true);
  document.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !editing) return;
    const hit = colEdgeAt(e);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    const cols = [...hit.grid.children];
    // in screen px: the gaps are not columns, so the shares are of what the columns hold
    const start = cols.map((c) => c.getBoundingClientRect().width);
    const total = start.reduce((a, b) => a + b, 0) || 1, least = total * COL_MIN / 100;
    const x0 = e.clientX, pair = start[hit.i - 1] + start[hit.i];
    document.body.classList.add('col-dragging');
    /* Only the two columns either side of the line change. The rest are
       snapped once, at the start, and the pair shares whatever they leave. */
    const snap = (v) => Math.round(v / COL_STEP) * COL_STEP;
    const pct = start.map((v) => Math.max(COL_MIN, snap(v / total * 100)));
    const rest = pct.reduce((a, v, k) => a + (k === hit.i - 1 || k === hit.i ? 0 : v), 0);
    const pairPct = Math.max(COL_MIN * 2, 100 - rest);
    const move = (ev) => {
      const d = (ev.clientX - x0) * (hit.rtl ? -1 : 1);
      const left = clamp(start[hit.i - 1] + d, least, pair - least);
      const lp = clamp(snap(left / pair * pairPct), COL_MIN, pairPct - COL_MIN);
      const w = pct.slice();
      w[hit.i - 1] = lp; w[hit.i] = pairPct - lp;
      const even = w.every((v) => v === w[0]);
      cols.forEach((c, k) => setColWidth(c, even ? 0 : w[k]));
    };
    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      document.body.classList.remove('col-dragging');
      persistEdit(); showColsBar();
    };
    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
  }, true);
}

function wireColsBar() {
  wireColDrag();
  $('colsBar').addEventListener('mousedown', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.preventDefault();                     // the caret is what these act from
    if (!editing) return;
    switch (b.dataset.cb) {
      case 'add': addColumn(); break;
      case 'del': delColumn(); break;
      case 'unwrap': unwrapColumns(); break;
      case 'even': { const g = caretColumns(); if (g) evenColumns(g); break; }
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

/* One image into the note being edited. Kept as its own name because the paste
   handler and the toolbar both mean exactly this. */
function insertImageFile(file, body, n) { insertFilesInto([file], body, n); }

/* Files into the note being edited.

   Each one is taken into the board's folder first and then inserted as whatever
   it is — a player for a video, a picture for an image, a link for a document.
   `takeFileIn` is what makes the note point at the board's copy rather than at
   wherever the file happened to be dragged from, so the note survives the
   original being moved, renamed or sent to somebody else. */
async function insertFilesInto(files, body, n) {
  for (const f of files) {
    const taken = await takeFileIn(f);
    if (!taken) continue;
    const html = fileHtml(taken.url, taken.name);
    if (!html) continue;
    body.focus();
    insertHTML(html + '<p><br></p>');
    n.body = bodyHtml(body);
    saveSoon();
  }
}

async function pickAndInsertImage() {
  if (!editing) return;
  const body = editing, n = editNote;
  if (FILES && FILES.pickImage && FILES.attach) {
    /* A path comes back, and the picture is taken into the board's folder
       before the note sees it — so the note points at its own copy, and the
       board still shows the picture when the original is moved or the board
       is sent somewhere. */
    const p = await FILES.pickImage();
    if (!p) return;
    const r = await FILES.attach(p, state.activeBoard, '');
    if (!r || r.error) { toast(t('msg.fileFailed', { name: p.split(/[\\/]/).pop() })); return; }
    body.focus();
    insertHTML(`<img class="mb-img" src="${esc(r.url)}" loading="lazy" decoding="async"><p><br></p>`);
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
  const clean = dt.types.includes('text/html') ? sanitize(dt.getData('text/html')) : '';
  /* Markdown from a chat's copy button, or the plain half of a copy whose
     HTML has no structure of its own: read it as Markdown, formulas and all.
     Not inside a code block — there, text is text. */
  if (text && !caretPre() && looksLikeMarkdown(text) && !richHtml(clean)) {
    e.preventDefault();
    insertHTML(sanitize(markdownToNote(text, () => '')));
    finishPaste(body, n);
    return;
  }
  if (text && !clean) return;   // plain text: let it through
  // otherwise strip the incoming markup down to what we support
  if (clean) {
    e.preventDefault();
    insertHTML(clean);
    finishPaste(body, n);
  }
}
function finishPaste(body, n) {
  paintMath(body);
  paintDatabases(body);
  paintTocs(body);
  normalizeBody(body);
  ensureTail(body);
  n.body = bodyHtml(body); saveSoon();
}

/* Tables are allowed through a paste, so copying one out of a web page or a
   spreadsheet lands as a table rather than a wall of text. Note what is *not*
   here: SVG. Our own inline icons are inserted directly and never go through
   this, so they survive inside the app; letting arbitrary <svg> in from a paste
   would be handing a document from the internet a much larger attack surface
   than a note needs, for the sake of pasted decoration. */
/* ---- what may survive a paste, beyond the tag ----

   **Inline style is stripped from everything, with three exceptions**, and they
   are exceptions because three of the editor's own features store their state
   there and nowhere else:

     · an image's size   — setImgWidth() writes style.width / style.height
     · a run's font size — applyFontPx() writes style.fontSize on span.mb-fs
     · a highlight       — execCommand('hiliteColor') writes background-color

   Without them, copying a formatted paragraph from one note into another
   silently dropped every size, every highlight and every image's dimensions.
   The text arrived, the formatting did not, and nothing said so — which reads
   as the app losing work rather than as a paste rule.

   Values are re-parsed rather than trusted. A length has to be a plain number
   with a unit, or `auto`; a colour has to be a hex or an rgb()/rgba(). Anything
   else — a `url(...)`, a smuggled `position: fixed`, an inherited
   `background-image` from a web page — is dropped. The allowance is for three
   named properties on three named tags, so it cannot become a way to paste
   layout into somebody's note. */
const STYLE_OK = {
  IMG: ['width', 'height'],
  SPAN: ['font-size', 'background-color'],
  MARK: ['background-color']
};
const STYLE_LEN = /^(auto|0|\d+(\.\d+)?(px|%|em|rem))$/i;
const STYLE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.,%\s]+\))$/i;
function safeStyle(el) {
  const ok = STYLE_OK[el.tagName];
  if (!ok) { el.removeAttribute('style'); return; }
  const keep = [];
  for (const prop of ok) {
    const v = (el.style.getPropertyValue(prop) || '').trim();
    if (!v) continue;
    if ((prop === 'background-color' ? STYLE_COLOR : STYLE_LEN).test(v)) keep.push(prop + ':' + v);
  }
  if (keep.length) el.setAttribute('style', keep.join(';'));
  else el.removeAttribute('style');
}

/* Classes are filtered **one at a time**, not by testing the start of the whole
   attribute. `/^(mb-|fs-|note-)/.test(el.className)` only ever looked at the
   first class in the list, so `class="mb-al-center hostile"` survived whole —
   arbitrary classes and all — while `class="hostile mb-fs"` was dropped whole
   and took a legitimate font size with it. Which of the two happened depended
   on nothing but the order the classes were written in.

   `al-` is on the list because that is where alignImage() stores an image's
   alignment, and it is the only record of it. */
const CLASS_OK = /^(mb-|fs-|note-|al-)/;
function safeClass(el) {
  const kept = String(el.getAttribute('class') || '')
    .split(/\s+/).filter((c) => c && CLASS_OK.test(c));
  if (kept.length) el.setAttribute('class', kept.join(' '));
  else el.removeAttribute('class');
}

const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUP', 'SUB', 'CODE', 'PRE', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A', 'IMG', 'SPAN', 'DIV', 'MARK', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'VIDEO', 'AUDIO']);
function sanitize(html) {
  const d = document.createElement('div');
  d.innerHTML = html;
  mathFromPaste(d);           // a chat's KaTeX/MathJax back to its LaTeX, before the text of it is kept
  // what a page hides is not what was copied — KaTeX's MathML twin, a <style>, a <script>
  d.querySelectorAll('style, script, template, .katex-mathml, mjx-assistive-mml').forEach((el) => el.remove());
  d.querySelectorAll('*').forEach((el) => {
    if (!d.contains(el)) return;
    if (!ALLOWED.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
    [...el.attributes].forEach((a) => {
      const keep = (el.tagName === 'A' && a.name === 'href') ||
                   // a board link pasted from another note keeps pointing at it
                   (el.tagName === 'A' && a.name === 'data-board' && /\bmb-(board|note)\b/.test(el.className)) ||
                   // a link to a note keeps the note it names (2.1)
                   (el.tagName === 'A' && a.name === 'data-note' && /\bmb-note\b/.test(el.className) && /^[\w-]{1,40}$/.test(a.value)) ||
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
                   (el.tagName === 'DIV' && a.name === 'data-thumb' && /\bmb-embed\b/.test(el.className) && isFileUrl(a.value)) ||
                   (el.tagName === 'IMG' && a.name === 'src') ||
                   // a formula keeps its LaTeX; its drawing is repainted by paintMath()
                   ((el.tagName === 'SPAN' || el.tagName === 'DIV') && a.name === 'data-tex' && /\bmb-math\b/.test(el.className)) ||
                   /* A database keeps its data, which is re-healed below —
                      what survives is rows and properties, never markup. */
                   (el.tagName === 'DIV' && /\bmb-db\b/.test(el.className) && (a.name === 'data-db' || a.name === 'data-dbid' || a.name === 'data-src')) ||
                   /* A video or a sound copied from one note to another keeps
                      playing. `controls` and `preload` are ours and are put
                      back below; the only thing that survives from the paste
                      is the source, and the check under IMG holds it to a
                      local file exactly as it holds a picture. No autoplay
                      attribute is on this list, so a crafted paste cannot
                      make a note start making noise when it is opened. */
                   ((el.tagName === 'VIDEO' || el.tagName === 'AUDIO') && a.name === 'src') ||
                   // a paragraph pasted from an RTL page keeps the side it was written on
                   (a.name === 'dir' && /^(ltr|rtl|auto)$/i.test(a.value)) ||
                   /* Both of these are kept here and *filtered below*, once
                      the loop has finished reading the original className —
                      the data-embed rules above test it, so it must not have
                      been rewritten yet. See safeClass() and safeStyle(). */
                   a.name === 'class' ||
                   (a.name === 'style' && !!STYLE_OK[el.tagName]);
      if (!keep) el.removeAttribute(a.name);
    });
    safeClass(el);
    safeStyle(el);
    /* `file:` is allowed through so a link to a document survives being copied
       from one note to another. It is not a way in: main vets the extension
       before it opens anything and reveals in Explorer rather than running
       whatever it was handed. See shell:open-local. */
    if (el.tagName === 'A' && !/^(https?:|mailto:|file:|mbf:)/i.test(el.getAttribute('href') || '')) el.removeAttribute('href');
    // a pasted table has to carry our class or it renders as unstyled rows
    if (el.tagName === 'TABLE') el.className = 'mb-table';
    /* A database copied out of a note arrives with its face as plain markup:
       that goes, and the data is put back through adoptDb() — a paste can
       only ever name rows and properties, which are drawn as text. */
    if (el.tagName === 'DIV' && el.classList.contains('mb-db')) {
      const db = adoptDb(el.getAttribute('data-db'));
      if (!db) { el.remove(); return; }
      el.textContent = '';
      el.className = 'mb-db';
      el.setAttribute('data-db', dbJson(db));
      el.setAttribute('data-dbid', db.id);
      if (db.src) el.setAttribute('data-src', db.src); else el.removeAttribute('data-src');
      el.setAttribute('contenteditable', 'false');
      return;
    }
    if (el.tagName === 'DIV' && el.classList.contains('mb-toc')) { el.textContent = ''; el.setAttribute('contenteditable', 'false'); return; }
    /* A remote image is dropped, not kept. The CSP in index.html is
       `img-src 'self' data: blob: file:` — it has no http(s) — so an <img>
       pasted from a web page could never load: it left a permanent broken-image
       box in the note and a refusal in the console, and the two policies
       disagreed about the same paste. The app's own rule is that an image is a
       local file or an inlined data URL, and this is now the only rule. */
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (!/^(data:image\/|file:|mbf:)/i.test(src)) { el.remove(); return; }
      /* The class list is rebuilt rather than trusted — but the alignment
         survives it. alignImage() records left/centre/right as al-* and
         nothing else remembers it, so wiping the attribute wholesale is how a
         centred picture came back left-aligned on the far side of a copy. */
      const align = ['al-left', 'al-center', 'al-right'].find((c) => el.classList.contains(c));
      el.className = 'mb-img' + (align ? ' ' + align : '');
    }
    /* Same rule as the picture above, and the controls are re-applied here
       rather than trusted from the paste: what arrives is a source, what is
       inserted is our player. */
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      const src = el.getAttribute('src') || '';
      if (!isFileUrl(src)) { el.remove(); return; }
      el.className = el.tagName === 'VIDEO' ? 'mb-video-el' : 'mb-audio-el';
      el.setAttribute('controls', '');
      el.setAttribute('preload', 'metadata');
      el.removeAttribute('autoplay');
    }
  });
  return d.innerHTML;
}

/* ─── smooth typing (3.1.1, Settings ▸ Notes ▸ Smooth typing) ───
   The cursor glides to where the next letter goes instead of jumping there,
   as Word's does. The native caret is made transparent on the note being
   edited (mental.css §93) and #mbCaret, a 2 px bar in #viewport, is moved to
   the collapsed selection's rectangle with a short transition; it blinks only
   once the hand has been still for half a second. A selection that is not
   collapsed shows no bar — the highlight is the cursor then.

   Where the caret is comes from the selection's own rectangle; an empty line
   has none, so it falls back to the <br> on it or the block's first line.
   When even that fails the native caret is let back (`caret-native`) rather
   than leaving nothing. A pan, a zoom or a scroll moves the bar at once, not
   gliding, so it never trails the page. Off under reduced motion. */
let caretEl = null, caretRaf = 0, caretJump = true, caretIdleT = 0;
const smoothCaretOn = () => state.settings.smoothCaret !== false && !motionReduced();
function caretRectOf(body) {
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed || !body.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0);
  const rects = r.getClientRects();
  const rect = rects.length ? rects[rects.length - 1] : null;
  if (rect && rect.height) return { x: rect.left, y: rect.top, h: rect.height };
  // an empty line: the <br> it holds, or the start of the block it is in
  const node = r.startContainer;
  const child = node.nodeType === 1 ? node.childNodes[r.startOffset] : null;
  if (child && child.nodeType === 1 && child.getBoundingClientRect().height) {
    const b = child.getBoundingClientRect();
    return { x: b.left, y: b.top, h: b.height };
  }
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el) return null;
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el), z = state.view.z;
  if (!b.height) return null;
  const lh = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.45) * z;
  const x = cs.direction === 'rtl' ? b.right - parseFloat(cs.paddingRight) * z : b.left + parseFloat(cs.paddingLeft) * z;
  return { x, y: b.top + parseFloat(cs.paddingTop) * z, h: Math.min(lh, b.height) };
}
/* Named paintCaret, not placeCaret: this file already has a placeCaret(node,
   offset) that *moves* the caret, and the scripts share one global scope, so
   a second function of that name silently replaced the first. From 3.1.1 to
   3.2.0 every "put the caret here" in the editor — the database Backspace
   guard, toggles, Ctrl+Shift+arrows, a paste — painted the smooth caret and
   left the selection where it was. tools/check-dupes.js now fails the build
   on any function declared twice. */
function paintCaret() {
  caretRaf = 0;
  const body = editing;
  const on = !!body && smoothCaretOn() && document.activeElement === body;
  document.body.dataset.caret = on ? 'smooth' : '';
  if (!caretEl) { caretEl = document.createElement('i'); caretEl.id = 'mbCaret'; $('viewport').appendChild(caretEl); }
  const rect = on ? caretRectOf(body) : null;
  document.body.classList.toggle('caret-native', on && !rect);
  const nb = rect && body.getBoundingClientRect();
  // nothing to show, or scrolled out of sight inside a long note
  if (!rect || rect.y + rect.h < nb.top || rect.y > nb.bottom) { caretEl.classList.remove('on'); caretJump = true; return; }
  const vp = vpRect();
  caretEl.classList.toggle('jump', caretJump);
  caretEl.style.transform = `translate(${(rect.x - vp.left).toFixed(1)}px, ${(rect.y - vp.top).toFixed(1)}px)`;
  caretEl.style.height = rect.h.toFixed(1) + 'px';
  caretEl.style.width = clamp(2 * state.view.z, 1.5, 3).toFixed(1) + 'px';
  caretEl.style.background = getComputedStyle(body).color;
  caretEl.classList.add('on');
  caretEl.classList.remove('blink');
  clearTimeout(caretIdleT);
  caretIdleT = setTimeout(() => caretEl.classList.add('blink'), 530);
  if (caretJump) requestAnimationFrame(() => { caretJump = false; caretEl.classList.remove('jump'); });
}
// a letter typed, the arrows, a click: glide; a pan, a zoom, a scroll: jump
function caretFollow(jump) {
  if (jump) caretJump = true;
  if (!caretRaf && (editing || (caretEl && caretEl.classList.contains('on')))) caretRaf = requestAnimationFrame(paintCaret);
}
function wireSmoothCaret() {
  document.addEventListener('selectionchange', () => caretFollow(false));
  document.addEventListener('input', () => caretFollow(false), true);
  document.addEventListener('scroll', () => caretFollow(true), true);
  document.addEventListener('focusout', () => caretFollow(true), true);
  window.addEventListener('resize', () => caretFollow(true));
}
