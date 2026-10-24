/* Mental Board — blocks.js
   Notion's block-level editing (2.9): the handle beside the block under the
   pointer (+ to add a block below, ⋮⋮ to drag it or open its menu), Turn into,
   a block's text and background colour, colouring selected words, moving a
   block (drag, the menu, Ctrl+Shift+↑/↓), and toggle lists and toggle
   headings.

   These files are plain scripts sharing one global scope, loaded in the order
   index.html lists them — that order is the only thing holding them together,
   so a file may use anything declared above it at load time and anything at
   all once init() runs. See MAP.md §4 and §4z7. */
/* ─────────────── 14. blocks ─────────────── */

/* What "a block" is here, which is what Notion means by one: a direct child of
   the note body, of a column, or of a toggle's inside — or one list item. A
   whole list is not a block; each of its items is. A database, a table, a
   picture are blocks too: they can be moved, duplicated and deleted, but only
   text-like blocks can be turned into something else or coloured. */
function blockOf(node, body) {
  let el = node && (node.nodeType === 3 ? node.parentElement : node);
  while (el && el !== body && body.contains(el)) {
    if (el.tagName === 'LI') return el;
    const p = el.parentElement;
    if (p === body || (p && (p.classList.contains('mb-col') || p.classList.contains('mb-tg-body')))) {
      if (el.tagName === 'UL' || el.tagName === 'OL') return el.querySelector(':scope > li') || el;
      return el;
    }
    el = p;
  }
  return null;
}
// the kind a text-like block is, in the slash menu's own keys; '' for anything that is not text
function blockKind(blk) {
  if (!blk) return '';
  if (blk.tagName === 'LI') {
    const l = blk.parentElement;
    if (l.tagName === 'OL') return 'number';
    return l.classList.contains('mb-todo') ? 'todo' : 'bullet';
  }
  if (/^H[1-3]$/.test(blk.tagName)) return blk.tagName.toLowerCase();
  if (blk.tagName === 'P') return 'text';
  if (blk.tagName === 'BLOCKQUOTE') return 'quote';
  if (blk.tagName === 'PRE' && blk.classList.contains('mb-code')) return 'code';
  if (blk.classList.contains('mb-callout')) return 'callout';
  if (blk.classList.contains('mb-toggle')) {
    const m = /\bmb-tg-h([1-3])\b/.exec(blk.className);
    return m ? 'toggleH' + m[1] : 'toggle';
  }
  return '';
}
// what Turn into offers, in Notion's order; each is a BLOCKS row, for its name and its glyph
const TURN_KINDS = ['text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'toggle', 'toggleH1', 'toggleH2', 'toggleH3', 'quote', 'callout', 'code'];
const LIST_KINDS = { bullet: 'ul', number: 'ol', todo: 'ul' };
const blockRow = (k) => BLOCKS.find((b) => b.k === k) || { ic: 'format_paragraph' };
const toggleHtml = (lvl, head, inside) =>
  `<div class="mb-toggle mb-open${lvl ? ' mb-tg-h' + lvl : ''}"><div class="mb-tg-head">${head}</div><div class="mb-tg-body">${inside || '<p><br></p>'}</div></div>`;

/* ---- turning a block into another kind ----
   By hand rather than through execCommand: formatBlock on an <li> wraps the
   whole list (MAP.md §7), and on a toggle's title it would turn the title's
   <div> into the heading and lose the toggle. What the block says is lifted
   out (blockInner), a new block of the kind is made round it, and whatever
   hangs under the old one — a toggle's inside, a list item's own sub-list — is
   carried along. Its colour, alignment and direction go with it. */
function blockInner(blk) {
  const c = blk.cloneNode(true);
  if (blk.classList.contains('mb-toggle')) {
    const h = c.querySelector(':scope > .mb-tg-head');
    return h ? h.innerHTML : '';
  }
  if (blk.tagName === 'PRE') return esc(blk.textContent.replace(/​/g, '')).replace(/\n/g, '<br>');
  if (blk.tagName === 'LI') c.querySelectorAll(':scope > ul, :scope > ol').forEach((x) => x.remove());
  if (blk.classList.contains('mb-callout')) { const ic = c.querySelector(':scope > svg.mb-ic'); if (ic) ic.remove(); }
  return c.innerHTML.replace(/^(&nbsp;|\s)+/, '');
}
function blockExtras(blk) {
  if (blk.classList.contains('mb-toggle')) {
    const b = blk.querySelector(':scope > .mb-tg-body');
    return b ? [...b.children] : [];
  }
  if (blk.tagName === 'LI') return [...blk.querySelectorAll(':scope > ul, :scope > ol')];
  return [];
}
function buildBlock(kind, inner) {
  const text = inner && inner.replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '').trim() ? inner : '<br>';
  switch (kind) {
    case 'h1': case 'h2': case 'h3': return `<${kind}>${text}</${kind}>`;
    case 'quote': return `<blockquote>${text}</blockquote>`;
    case 'callout': return `<div class="mb-callout">${inlineIcon('lightbulb')}&nbsp;${text === '<br>' ? '' : text}</div>`;
    case 'code': {
      const d = document.createElement('div');
      d.innerHTML = (inner || '').replace(/<br\s*\/?>/gi, '\n');
      return `<pre class="mb-code"><code>${esc(d.textContent) || '​'}</code></pre>`;
    }
    case 'bullet': return `<ul><li>${text}</li></ul>`;
    case 'number': return `<ol><li>${text}</li></ol>`;
    case 'todo': return `<ul class="mb-todo"><li>${text}</li></ul>`;
    case 'toggle': return toggleHtml(0, text);
    case 'toggleH1': case 'toggleH2': case 'toggleH3': return toggleHtml(+kind.slice(-1), text);
    default: return `<p>${text}</p>`;
  }
}
// a list item leaves its list for `el`: the list is split round where it was
function placeOutOfList(li, el) {
  const list = li.parentElement;
  const after = [];
  for (let x = li.nextElementSibling; x; x = x.nextElementSibling) after.push(x);
  if (after.length) {
    const tail = list.cloneNode(false);
    after.forEach((x) => tail.appendChild(x));
    list.after(tail);
  }
  list.after(el);
  li.remove();
  if (!list.children.length) list.remove();
}
// two lists of the same kind side by side are one list, as in Notion
function sameList(a, b) {
  return !!(a && b && /^(UL|OL)$/.test(a.tagName) && a.tagName === b.tagName &&
    a.classList.contains('mb-todo') === b.classList.contains('mb-todo') &&
    OL_STYLES.every((k) => a.classList.contains('mb-ol-' + k) === b.classList.contains('mb-ol-' + k)));
}
function mergeLists(el) {
  if (!el || !/^(UL|OL)$/.test(el.tagName)) return el;
  let list = el;
  const prev = list.previousElementSibling;
  if (sameList(prev, list)) { [...list.children].forEach((x) => prev.appendChild(x)); list.remove(); list = prev; }
  const next = list.nextElementSibling;
  if (sameList(list, next)) { [...next.children].forEach((x) => list.appendChild(x)); next.remove(); }
  return list;
}
function caretToEnd(el) {
  if (!el) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
}
function setToggleLevel(tg, kind) {
  ['mb-tg-h1', 'mb-tg-h2', 'mb-tg-h3'].forEach((c) => tg.classList.remove(c));
  if (kind !== 'toggle') tg.classList.add('mb-tg-h' + kind.slice(-1));
}
function turnBlockInto(blk, kind) {
  const body = editing;
  if (!body || !blk || !body.contains(blk)) return null;
  const from = blockKind(blk);
  if (!from || from === kind) return blk;
  if (from.startsWith('toggle') && kind.startsWith('toggle')) { setToggleLevel(blk, kind); return blk; }
  const inner = blockInner(blk), extras = blockExtras(blk);
  const keep = [...blk.classList].filter((c) => /^mb-(tc|bc|al)-/.test(c));
  const dir = blk.getAttribute('dir');
  const t = document.createElement('template');
  t.innerHTML = buildBlock(kind, inner);
  const el = t.content.firstElementChild;
  const own = LIST_KINDS[kind] ? el.firstElementChild : el;        // the element that is the block itself
  keep.forEach((c) => own.classList.add(c));
  if (dir) own.setAttribute('dir', dir);
  if (blk.tagName === 'LI') placeOutOfList(blk, el); else blk.replaceWith(el);
  if (extras.length) {
    if (kind.startsWith('toggle')) { const tb = el.querySelector('.mb-tg-body'); tb.textContent = ''; extras.forEach((x) => tb.appendChild(x)); }
    else if (LIST_KINDS[kind] && extras.every((x) => /^(UL|OL)$/.test(x.tagName))) extras.forEach((x) => own.appendChild(x));
    else { let at = el; extras.forEach((x) => { at.after(x); at = x; }); }
  }
  mergeLists(el);
  caretToEnd(kind.startsWith('toggle') ? own.querySelector('.mb-tg-head') : own.tagName === 'PRE' ? own.querySelector('code') : own);
  return own;
}
// the slash menu's toggles: the line the caret is on becomes one, keeping what it says
function turnCaretBlock(kind) {
  if (!editing) return;
  const blk = blockOf(getSelection().anchorNode, editing);
  if (blk && blockKind(blk)) turnBlockInto(blk, kind);
  else {
    insertHTML(buildBlock(kind, '') + '<p><br></p>');
    const fresh = [...editing.querySelectorAll('.mb-toggle')].pop();
    if (fresh) caretToEnd(fresh.querySelector('.mb-tg-head'));
  }
  normalizeBody(editing);
  ensureTail(editing);
}

/* ---- colour ----
   A class, never a colour: `mb-tc-<c>` for text, `mb-bc-<c>` for a background,
   with the app's nine COLORS. The colours themselves are CSS variables that
   follow light and dark (mental.css §78), so a red word stays readable when the
   theme changes — an inline colour would freeze today's theme into the note,
   the trap normalizeBody() already scrubs for. Classes with `mb-` also survive
   a paste (safeClass). On a block, the class is on the block; on words, on a
   span round them. */
function blockColor(blk, part) {
  const c = [...blk.classList].find((x) => x.startsWith('mb-' + part + '-'));
  return c ? c.slice(6) : 'default';
}
function setBlockColor(blk, part, color) {
  [...blk.classList].filter((c) => c.startsWith('mb-' + part + '-')).forEach((c) => blk.classList.remove(c));
  if (color && color !== 'default') blk.classList.add('mb-' + part + '-' + color);
}
// the selected words, as Notion's colour menu does it; the runs are found the way the size buttons find them
function colorSelection(part, color) {
  const s = getSelection();
  if (!editing || !s.rangeCount || s.isCollapsed) return;
  const runs = textRunsIn(s.getRangeAt(0), editing);
  if (!runs.length) return;
  const pre = 'mb-' + part + '-';
  const spans = runs.map((tn) => {
    const p = tn.parentElement;
    let span = p;
    if (!(p && p !== editing && p.tagName === 'SPAN' && p.childNodes.length === 1)) {
      span = document.createElement('span');
      tn.replaceWith(span);
      span.appendChild(tn);
    }
    [...span.classList].filter((c) => c.startsWith(pre)).forEach((c) => span.classList.remove(c));
    if (color !== 'default') span.classList.add(pre + color);
    return span;
  });
  const nr = document.createRange();
  nr.setStartBefore(spans[0].firstChild); nr.setEndAfter(spans[spans.length - 1].lastChild);
  // a span left with nothing to say goes; its text stays where it is
  spans.forEach((sp) => { if (!sp.attributes.length || (sp.getAttribute('class') === '' && sp.attributes.length === 1)) sp.replaceWith(...sp.childNodes); });
  s.removeAllRanges(); s.addRange(nr);
  persistEdit();
}
// the colour panel under the selection bar's "A": a row of text colours, a row of backgrounds
let colorRange = null;
function buildColorPop() {
  const pop = $('colorPop');
  const row = (part) => `<div class="tcp-row"><span class="tcp-k">${te(part === 'tc' ? 'bh.textColour' : 'bh.bgColour')}</span>` +
    COLORS.map((c) => `<button type="button" class="tcp-sw mb-${part}-${c}" data-part="${part}" data-c="${c}" title="${te('colour.' + c)}">${part === 'tc' ? icon('format_color_text') : icon('format_color_fill')}</button>`).join('') + '</div>';
  pop.innerHTML = row('tc') + row('bc');
  pop.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!editing) return;
    editing.focus();
    if (colorRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(colorRange); }
    colorSelection(b.dataset.part, b.dataset.c);
    pop.classList.remove('open');
  }));
}

/* ---- toggles ----
   `div.mb-toggle` holding `div.mb-tg-head` (the line you click) and
   `div.mb-tg-body` (what folds away); `mb-open` says it is open and is kept,
   as Notion keeps it. The arrow is CSS on the head (mental.css §79), not an
   element: nothing to paint, store or lift, and nothing the caret can get
   inside. A press on it is found by where it lands (toggleArrowAt), the way a
   to-do's box is. Headings are the level class, not <h1>, so the title stays
   the head <div> every rule here expects. */
function toggleArrowAt(e) {
  const head = e.target && e.target.closest && e.target.closest('.mb-tg-head');
  if (!head || e.target !== head) return null;
  const r = head.getBoundingClientRect(), z = state.view.z || 1;
  const rtl = getComputedStyle(head).direction === 'rtl';
  const off = rtl ? r.right - e.clientX : e.clientX - r.left;
  return off >= 0 && off < 24 * z ? head : null;
}
function flipToggle(head, body, n) {
  head.parentElement.classList.toggle('mb-open');
  n.body = bodyHtml(body);
  if (editing === body) editDirty = true;
  saveSoon();
}
// a toggle missing a part is mended: a paste or the editor can leave one half-made
function repairToggles(root) {
  root.querySelectorAll('.mb-toggle').forEach((tg) => {
    let head = tg.querySelector(':scope > .mb-tg-head'), inside = tg.querySelector(':scope > .mb-tg-body');
    if (!head) { head = document.createElement('div'); head.className = 'mb-tg-head'; head.innerHTML = '<br>'; tg.prepend(head); }
    if (!inside) { inside = document.createElement('div'); inside.className = 'mb-tg-body'; tg.appendChild(inside); }
    if (!inside.children.length) inside.innerHTML = '<p><br></p>';
    // a block that ended up inside the title is lifted out of it, into the inside
    [...head.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol, :scope > div')]
      .forEach((x) => (/^(P|H[1-3])$/.test(x.tagName) ? x.replaceWith(...x.childNodes) : inside.prepend(x)));
  });
}
function atStartOf(el) {
  const s = getSelection();
  if (!s.rangeCount || !s.isCollapsed) return false;
  const r = s.getRangeAt(0), probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().replace(/​/g, '') === '' && !probe.cloneContents().querySelector('img, svg, .mb-math');
}
/* The keys a toggle answers, from onEditorKey(). Enter in the title opens a
   line inside an open toggle, or under a closed one — the text after the
   caret goes with it. Enter on an empty last line inside steps out of the
   toggle. Backspace at the start of the title turns it back into text, its
   inside staying under it. Returns true when it handled the key. */
function toggleKey(e, body) {
  if (e.isComposing) return false;
  const s = getSelection();
  if (!s.rangeCount) return false;
  const plain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
  const head = caretClosest('.mb-tg-head');
  if (e.key === 'Enter' && plain && head && body.contains(head)) {
    e.preventDefault();
    if (!s.isCollapsed) s.getRangeAt(0).deleteContents();
    const tg = head.parentElement, r = s.getRangeAt(0);
    const tail = document.createRange();
    tail.setStart(r.endContainer, r.endOffset);
    tail.setEnd(head, head.childNodes.length);
    const p = document.createElement('p');
    p.appendChild(tail.extractContents());
    if (!p.textContent.replace(/​/g, '') && !p.querySelector('img, svg, .mb-math')) p.innerHTML = '<br>';
    if (!head.textContent && !head.querySelector('img, svg, .mb-math')) head.innerHTML = '<br>';
    if (tg.classList.contains('mb-open')) tg.querySelector(':scope > .mb-tg-body').prepend(p); else tg.after(p);
    placeCaret(p, 0);
    persistEdit();
    return true;
  }
  if (e.key === 'Enter' && plain) {
    const line = caretClosest('.mb-tg-body > p');
    if (line && body.contains(line) && !line.textContent.replace(/​/g, '').trim() && !line.nextElementSibling && line.parentElement.children.length > 1) {
      e.preventDefault();
      line.parentElement.parentElement.after(line);
      placeCaret(line, 0);
      persistEdit();
      return true;
    }
  }
  if (e.key === 'Backspace' && head && body.contains(head) && atStartOf(head)) {
    e.preventDefault();
    turnBlockInto(head.parentElement, 'text');
    normalizeBody(body);
    persistEdit();
    return true;
  }
  return false;
}
// a slash block chosen on a toggle's title: a heading changes its level; anything else goes inside it
function slashInToggleHead(k) {
  const head = caretClosest('.mb-tg-head');
  if (!head || !editing || !editing.contains(head)) return false;
  const tg = head.parentElement;
  if (k === 'text' || /^h[1-3]$/.test(k) || k.startsWith('toggle')) {
    setToggleLevel(tg, k === 'text' ? 'toggle' : k.startsWith('toggle') ? k : 'toggleH' + k.slice(1));
    return true;
  }
  tg.classList.add('mb-open');
  const p = document.createElement('p');
  p.innerHTML = '<br>';
  tg.querySelector(':scope > .mb-tg-body').prepend(p);
  placeCaret(p, 0);
  return false;
}

/* ---- moving, duplicating, deleting ---- */
// where a block was must not be left impossible to type in
function healAfterMove(from) {
  if (!from || !editing) return;
  if (/^(UL|OL)$/.test(from.tagName) && !from.children.length) from.remove();
  else if ((from.classList.contains('mb-col') || from.classList.contains('mb-tg-body')) && !from.children.length) from.innerHTML = '<p><br></p>';
}
function finishBlockEdit() {
  if (!editing) return;
  repairToggles(editing);
  normalizeBody(editing);
  if (!editing.children.length) editing.innerHTML = '<p><br></p>';
  ensureTail(editing);
  paintTocs(editing);
  persistEdit();
}
function moveBlockTo(blk, target, after) {
  if (!blk || !target || blk === target || blk.contains(target)) return;
  // columns inside a column is a layout nobody can get back out of
  if (blk.classList.contains('mb-cols') && target.closest('.mb-col')) return;
  const from = blk.parentElement;
  let node = blk;
  if (blk.tagName === 'LI' && target.tagName !== 'LI') {
    const list = from.cloneNode(false);           // the item, in a list of its own kind
    list.appendChild(blk);
    node = list;
  }
  if (node.tagName !== 'LI' && target.tagName === 'LI') {
    // among list items, the list opens round where it lands
    const list = target.parentElement, rest = [];
    for (let x = after ? target.nextElementSibling : target; x; x = x.nextElementSibling) rest.push(x);
    if (rest.length) { const tail = list.cloneNode(false); rest.forEach((x) => tail.appendChild(x)); list.after(tail); }
    list.after(node);
    if (!list.children.length) list.remove();
  } else if (after) target.after(node); else target.before(node);
  healAfterMove(from);
  mergeLists(node);
  finishBlockEdit();
}
function moveBlockBy(blk, dir) {
  if (!blk) return false;
  const sib = dir < 0 ? blk.previousElementSibling : blk.nextElementSibling;
  if (!sib) return false;
  if (dir < 0) sib.before(blk); else sib.after(blk);
  finishBlockEdit();
  return true;
}
function duplicateBlock(blk) {
  const copy = blk.cloneNode(true);
  // a copied database is a second database, not a second name for the first (database.js)
  [copy, ...copy.querySelectorAll('.mb-db')].filter((x) => x.classList && x.classList.contains('mb-db')).forEach((d) => {
    const db = adoptDb(d.getAttribute('data-db'));
    if (!db) return;
    db.id = 'd' + uid();
    d.setAttribute('data-db', dbJson(db));
    d.setAttribute('data-dbid', db.id);
    d.querySelectorAll(':scope > .db-face').forEach((f) => f.remove());
  });
  blk.after(copy);
  paintDatabases(editing);
  finishBlockEdit();
  return copy;
}
function deleteBlock(blk) {
  const from = blk.parentElement;
  blk.remove();
  healAfterMove(from);
  finishBlockEdit();
}
// Ctrl+Shift+↑/↓ moves the block the caret is in, keeping the caret where it was in it (Notion's keys)
function blockMoveKey(e, body) {
  if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return false;
  const s = getSelection();
  if (!s.rangeCount) return false;
  const blk = blockOf(s.anchorNode, body);
  if (!blk) return false;
  e.preventDefault();
  const at = { n: s.anchorNode, o: s.anchorOffset };
  if (moveBlockBy(blk, e.key === 'ArrowUp' ? -1 : 1) && blk.contains(at.n)) placeCaret(at.n, at.o);
  return true;
}

/* ---- the handle, and its menu ----
   One element, #blockHandle, outside every note: it is placed beside the
   block under the pointer of the note being edited (onBhMove), at screen
   size, whatever the zoom. Typing hides it, as Notion's does. */
const bh = { blk: null, hideT: 0 };
let bhDrag = null;
function hideBlockHandle() {
  clearTimeout(bh.hideT);
  bh.blk = null;
  const h = $('blockHandle');
  if (h) h.classList.add('hidden');
}
function scheduleHideHandle() {
  clearTimeout(bh.hideT);
  bh.hideT = setTimeout(hideBlockHandle, 220);
}
// the block under the pointer in the note being edited — from the margin to its left too
function blockAtPoint(x, y) {
  if (!editing) return null;
  let hit = document.elementFromPoint(x, y);
  if (!hit || !editing.contains(hit)) {
    const br = editing.getBoundingClientRect();
    if (y < br.top || y > br.bottom) return null;
    const pad = parseFloat(getComputedStyle(editing).paddingLeft) * (state.view.z || 1);
    hit = document.elementFromPoint(br.left + pad + 6, y);
    if (!hit || !editing.contains(hit)) return null;
  }
  return blockOf(hit, editing);
}
function onBhMove(e) {
  if (bhDrag) return;
  if (!editing || slash.open || dbPopS) { if (bh.blk) scheduleHideHandle(); return; }
  if (e.target.closest && e.target.closest('#blockHandle')) { clearTimeout(bh.hideT); return; }
  const note = editing.closest('.note');
  const nr = note.getBoundingClientRect();
  if (e.clientX < nr.left - 48 || e.clientX > nr.right || e.clientY < nr.top || e.clientY > nr.bottom) { if (bh.blk) scheduleHideHandle(); return; }
  const blk = blockAtPoint(e.clientX, e.clientY);
  if (!blk) { if (bh.blk) scheduleHideHandle(); return; }
  showBlockHandle(blk);
}
function showBlockHandle(blk) {
  clearTimeout(bh.hideT);
  bh.blk = blk;
  const h = $('blockHandle');
  h.classList.remove('hidden');
  const r = blk.getBoundingClientRect(), z = state.view.z || 1;
  const line = blk.classList.contains('mb-toggle') ? blk.querySelector(':scope > .mb-tg-head') || blk : blk;
  const cs = getComputedStyle(line);
  const lh = (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4) * z;
  const rtl = getComputedStyle(blk).direction === 'rtl';
  const marker = blk.tagName === 'LI' ? 22 * z : 0;          // a list item's box starts at its text, after the bullet
  const w = h.offsetWidth, hh = h.offsetHeight;
  const left = rtl ? r.right + marker + 2 : r.left - marker - w - 2;
  h.style.left = clamp(left, 2, innerWidth - w - 2) + 'px';
  h.style.top = (r.top + Math.max(0, (Math.min(r.height, lh) - hh) / 2)) + 'px';
}
function bhAddBelow() {
  const blk = bh.blk;
  if (!blk || !editing || !editing.contains(blk)) return;
  hideBlockHandle();
  const p = document.createElement(blk.tagName === 'LI' ? 'li' : 'p');
  p.innerHTML = '<br>';
  blk.after(p);
  editing.focus();
  placeCaret(p, 0);
  document.execCommand('insertText', false, '/');
  setTimeout(() => { if (editing) openSlash(editing); }, 0);
}
function onGripDown(e) {
  if (e.button !== 0 || !bh.blk || !editing) return;
  e.preventDefault();
  bhDrag = { blk: bh.blk, x: e.clientX, y: e.clientY, on: false, target: null, after: false };
  window.addEventListener('pointermove', onGripMove);
  window.addEventListener('pointerup', onGripUp, { once: true });
}
function onGripMove(e) {
  const d = bhDrag;
  if (!d) return;
  if (!d.on) {
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    d.on = true;
    d.blk.classList.add('mb-dragging');
    document.body.classList.add('bh-dragging');
  }
  const line = $('blockDrop');
  const t = blockAtPoint(e.clientX, e.clientY);
  if (!t || t === d.blk || d.blk.contains(t)) { d.target = null; line.classList.add('hidden'); return; }
  const r = t.getBoundingClientRect();
  d.target = t;
  d.after = e.clientY > r.top + r.height / 2;
  line.classList.remove('hidden');
  line.style.left = r.left + 'px';
  line.style.width = r.width + 'px';
  line.style.top = ((d.after ? r.bottom : r.top) - 1.5) + 'px';
}
function onGripUp() {
  const d = bhDrag;
  bhDrag = null;
  window.removeEventListener('pointermove', onGripMove);
  $('blockDrop').classList.add('hidden');
  document.body.classList.remove('bh-dragging');
  if (!d) return;
  d.blk.classList.remove('mb-dragging');
  if (!d.on) { openBlockMenu(d.blk, $('bhGrip')); return; }
  if (d.target) moveBlockTo(d.blk, d.target, d.after);
  hideBlockHandle();
}
function blockColorMenu(blk) {
  const item = (part, c) => ({
    ic: `<span class="tcp-sw mb-${part}-${c}">${part === 'tc' ? icon('format_color_text') : icon('format_color_fill')}</span>`,
    label: t('colour.' + c), on: blockColor(blk, part) === c,
    act: () => { setBlockColor(blk, part, c); finishBlockEdit(); return true; }
  });
  return {
    title: t('bh.colour'),
    items: [{ head: t('bh.textColour') }, ...COLORS.map((c) => item('tc', c)), { head: t('bh.bgColour') }, ...COLORS.map((c) => item('bc', c))]
  };
}
function openBlockMenu(blk, anchor) {
  if (!blk || !editing || !editing.contains(blk)) return;
  // where the grip is, read before the handle hides: a hidden grip measures 0×0 at the corner
  const at = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
  hideBlockHandle();
  const kind = blockKind(blk);
  // after a menu choice the caret goes back into the note, where typing expects it
  const back = (el) => { if (editing) { editing.focus(); if (el && editing.contains(el)) caretToEnd(el); } };
  openDbPop({ left: at.left, right: at.right, top: at.top, bottom: at.bottom }, () => ({
    title: kind ? t('block.' + kind) : '',
    items: [
      kind ? { ic: icon('autorenew'), label: t('bh.turnInto'), more: () => ({
        title: t('bh.turnInto'),
        items: TURN_KINDS.map((k) => ({ ic: icon(blockRow(k).ic), label: t('block.' + k), on: k === blockKind(blk), act: () => {
          editing.focus();
          const el = turnBlockInto(blk, k);
          finishBlockEdit();
          back(el && el.classList.contains('mb-toggle') ? el.querySelector('.mb-tg-head') : el);
        } }))
      }) } : null,
      kind ? { ic: icon('palette'), label: t('bh.colour'), more: () => blockColorMenu(blk) } : null,
      kind ? { sep: true } : null,
      { ic: icon('content_copy'), label: t('bh.duplicate'), act: () => { back(duplicateBlock(blk)); } },
      { ic: icon('arrow_upward'), label: t('bh.moveUp'), act: () => { moveBlockBy(blk, -1); back(blk); } },
      { ic: icon('arrow_downward'), label: t('bh.moveDown'), act: () => { moveBlockBy(blk, 1); back(blk); } },
      { sep: true },
      { ic: icon('delete'), label: t('bh.delete'), danger: true, act: () => { deleteBlock(blk); back(null); } }
    ].filter(Boolean)
  }));
}

function wireBlocks() {
  document.addEventListener('mousemove', onBhMove, { passive: true });
  window.addEventListener('wheel', hideBlockHandle, { passive: true });
  const h = $('blockHandle');
  h.addEventListener('mousedown', (e) => e.preventDefault());     // the caret stays in the note
  h.addEventListener('mouseleave', scheduleHideHandle);
  $('bhAdd').addEventListener('click', bhAddBelow);
  $('bhGrip').addEventListener('pointerdown', onGripDown);
  buildColorPop();
}
