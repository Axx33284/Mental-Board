/* Mental Board — canvas.js
   JSON Canvas: the open board format Obsidian reads and writes.

   Part 19 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 18. JSON Canvas ───────────────
   A board and a canvas are the same idea: boxes of text at x/y with a width
   and a height, groups, and lines between them. So the mapping is direct —

       note              → text node, the body as Markdown
       picture           → file node
       workflow          → group node, its title as the label
       rope              → edge
       colour            → the six preset colours ("1"–"6") or a hex

   — and the one thing that has to be translated is the text, because a note
   is HTML and a text node is Markdown. noteToMarkdown() and markdownToNote()
   are that translation, and they are deliberately small: headings, emphasis,
   links, lists, to-dos, quotes, code, tables, pictures and clips. Anything
   finer is flattened to its text rather than guessed at.

   What a canvas has no word for (a note's status, date and icon) travels in a
   `mentalBoard` key on the node. The spec leaves room for that; Obsidian
   ignores it, and coming back here it is read so a round trip loses nothing.

   Files: a board's pictures and clips are `mbf://<board>/<name>`, which mean
   nothing outside this app. Exporting copies them into a folder beside the
   .canvas and points the nodes there; importing finds each file a canvas
   names (beside it, or up the vault), copies it into the new board's folder
   and points the notes at the copy. See store.writeCanvas / resolveCanvasFiles. */

const CANVAS_COLOR = { red: '1', orange: '2', amber: '3', green: '4', teal: '5', violet: '6', blue: '#4c7fd9', pink: '#d65a9c' };
const CANVAS_COLOR_BACK = { 1: 'red', 2: 'orange', 3: 'amber', 4: 'green', 5: 'teal', 6: 'violet', '#4c7fd9': 'blue', '#d65a9c': 'pink' };
const colourFromCanvas = (c) => CANVAS_COLOR_BACK[String(c || '').toLowerCase()] || 'default';
// a token standing in for a file until it has been copied in; never stored
const CANVAS_TOKEN = 'mbcanvas:';

/* ---- HTML → Markdown ---- */
/* `ref(url)` turns one of this board's file URLs into the path it will have
   beside the .canvas, and returns '' for anything else. */
function mdInline(node, ref) {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { out += c.textContent.replace(/​/g, ''); return; }
    if (c.nodeType !== 1) return;
    const tag = c.tagName;
    const inner = () => mdInline(c, ref);
    if (tag === 'BR') out += '\n';
    else if (tag === 'B' || tag === 'STRONG') out += wrapMd('**', inner());
    else if (tag === 'I' || tag === 'EM') out += wrapMd('*', inner());
    else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += wrapMd('~~', inner());
    else if (tag === 'MARK') out += wrapMd('==', inner());
    else if (tag === 'CODE') out += '`' + c.textContent.replace(/`/g, 'ˋ') + '`';
    else if (tag === 'IMG') { const src = c.getAttribute('src') || ''; out += `![](${mdPath(ref(src) || src)})`; }
    else if (tag === 'A') {
      const href = c.getAttribute('href') || '';
      const local = ref(href);
      out += local ? `[${inner() || local}](${mdPath(local)})` : `[${inner() || href}](${href})`;
    }
    else if (c.classList.contains('mb-ic') || c.classList.contains('emb-face')) { /* painted chrome */ }
    else out += inner();
  });
  return out;
}
// emphasis may not hug spaces, or Markdown stops seeing it
function wrapMd(mark, s) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : s;
}
// a path with spaces in it has to be wrapped to survive as a link target
const mdPath = (p) => (/[\s()]/.test(p) ? `<${p}>` : p);

function noteToMarkdown(html, ref) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  const blocks = [];
  const list = (el, depth, lines) => {
    const todo = el.classList.contains('mb-todo');
    [...el.children].forEach((li, i) => {
      if (li.tagName !== 'LI') return;
      const c = li.cloneNode(true);
      c.querySelectorAll('ul, ol').forEach((x) => x.remove());
      const mark = todo ? (li.classList.contains('done') ? '- [x] ' : '- [ ] ') : (el.tagName === 'OL' ? `${i + 1}. ` : '- ');
      lines.push('  '.repeat(depth) + mark + mdInline(c, ref).replace(/\n/g, ' ').trim());
      li.querySelectorAll(':scope > ul, :scope > ol').forEach((sub) => list(sub, depth + 1, lines));
    });
    return lines;
  };
  const walk = (root) => {
    for (const node of root.children) {
      const tag = node.tagName;
      if (tag === 'UL' || tag === 'OL') { blocks.push(list(node, 0, []).join('\n')); continue; }
      if (/^H[1-3]$/.test(tag)) { blocks.push('#'.repeat(+tag[1]) + ' ' + mdInline(node, ref).trim()); continue; }
      if (tag === 'HR') { blocks.push('---'); continue; }
      if (tag === 'PRE') { blocks.push('```\n' + node.textContent.replace(/​/g, '').replace(/\n$/, '') + '\n```'); continue; }
      if (tag === 'BLOCKQUOTE' || node.classList.contains('mb-callout')) {
        blocks.push(mdInline(node, ref).trim().split('\n').map((l) => '> ' + l).join('\n'));
        continue;
      }
      if (tag === 'TABLE') {
        const rows = [...node.rows].map((r) => [...r.cells].map((c) => mdInline(c, ref).replace(/\n/g, ' ').replace(/\|/g, '\\|').trim()));
        if (rows.length) {
          const w = Math.max(...rows.map((r) => r.length));
          const line = (r) => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
          blocks.push([line(rows[0]), '|' + ' --- |'.repeat(w), ...rows.slice(1).map(line)].join('\n'));
        }
        continue;
      }
      if (tag === 'IMG') { const src = node.getAttribute('src') || ''; blocks.push(`![](${mdPath(ref(src) || src)})`); continue; }
      if (tag === 'DIV' && (node.classList.contains('mb-cols') || node.classList.contains('mb-col'))) { walk(node); continue; }
      if (tag === 'DIV' && node.classList.contains('mb-embed')) {
        const a = node.querySelector('a');
        const href = (a && a.getAttribute('href')) || '';
        blocks.push(`[${node.dataset.title || href}](${href})`);
        continue;
      }
      // a clip or a sound: Obsidian's own embed, which plays it in place
      if (tag === 'DIV' && node.classList.contains('mb-file')) {
        const m = node.querySelector('video, audio');
        const src = (m && m.getAttribute('src')) || '';
        const local = ref(src);
        blocks.push(local ? `![[${local}]]` : (node.dataset.name || ''));
        continue;
      }
      const text = mdInline(node, ref).trim();
      if (text) blocks.push(text);
    }
  };
  walk(d);
  return blocks.filter(Boolean).join('\n\n');
}

/* ---- Markdown → HTML ----
   `file(path)` returns the token a referenced file stands behind until it has
   been copied in. Everything the text says is escaped first, so the only tags
   in the result are the ones written here. */
// the text was escaped before it was parsed; a path is looked up as written
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

function mdInlineToHtml(text, file) {
  let s = esc(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  // ![[file]] and ![](file) — a picture inline; a clip inline becomes a link to it
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, p) => inlineFile(unesc(p.trim()), file));
  s = s.replace(/!\[([^\]]*)\]\((?:&lt;(.+?)&gt;|([^)\s]+))\)/g, (_, alt, a, b) => {
    const p = (a || b || '').trim();
    if (/^https?:/i.test(p)) return `<a href="${p}">${alt || p}</a>`;
    return inlineFile(unesc(p), file);
  });
  s = s.replace(/\[([^\]]+)\]\((?:&lt;(.+?)&gt;|([^)\s]+))\)/g, (_, label, a, b) => {
    const p = (a || b || '').trim();
    if (/^(https?:|mailto:)/i.test(p)) return `<a href="${p}">${label}</a>`;
    const tok = file(unesc(p));
    return tok ? `<a href="${tok}">${label}</a>` : label;
  });
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/g, (_, p, alias) => alias || p);   // a wikilink to a note: its words
  s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_, a, b) => `<b>${a || b}</b>`);
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)|(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, (m, p1, a, p2, b) => `${p1 || p2 || ''}<i>${a || b}</i>`);
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
  return s;
}
function inlineFile(p, file) {
  const tok = file(p);
  if (!tok) return esc(p.split('/').pop());
  const ext = extOf(p);
  if (IMG_EXT.includes(ext)) return `<img class="mb-img" src="${tok}">`;
  return `<a href="${tok}">${esc(p.split('/').pop())}</a>`;
}

function markdownToNote(md, file) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map((l) => mdInlineToHtml(l, file)).join('<br>')}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const body = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) body.push(lines[i]);
      out.push(`<pre class="mb-code"><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    let m, p = '';
    // a clip or a sound on its own line is a block, the way the app draws one
    if ((m = /^\s*!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(line))) p = m[1].trim();
    else if ((m = /^\s*!\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))\)\s*$/.exec(line))) p = (m[1] || m[2] || '').trim();
    if (p) {
      const ext = extOf(p);
      const tok = /^https?:/i.test(p) ? '' : file(p);
      if (tok && VIDEO_EXT.includes(ext)) { flush(); out.push(videoHtml(tok, p.split('/').pop())); continue; }
      if (tok && AUDIO_EXT.includes(ext)) { flush(); out.push(audioHtml(tok, p.split('/').pop())); continue; }
    }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flush(); const h = Math.min(3, m[1].length); out.push(`<h${h}>${mdInlineToHtml(m[2], file)}</h${h}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const q = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) q.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${q.map((l) => mdInlineToHtml(l, file)).join('<br>')}</blockquote>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      flush();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => mdInlineToHtml(c.trim().replace(/\\\|/g, '|'), file));
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      i--;
      out.push(`<table><tbody><tr>${head.map((c) => `<th>${c || '<br>'}</th>`).join('')}</tr>` +
        rows.map((r) => `<tr>${head.map((_, k) => `<td>${r[k] || '<br>'}</td>`).join('')}</tr>`).join('') + `</tbody></table>`);
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      const items = [];
      for (; i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]); i++) {
        const lm = /^(\s*)([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(lines[i]);
        items.push({ depth: Math.floor(lm[1].replace(/\t/g, '  ').length / 2), ordered: /\d/.test(lm[2]), task: lm[3], text: lm[4] });
      }
      i--;
      out.push(listHtml(items, 0, file).html);
      continue;
    }
    para.push(line);
  }
  flush();
  return out.join('') || '<p><br></p>';
}
// consecutive items, nested by depth; returns the markup and how many it used
function listHtml(items, from, file) {
  const depth = items[from].depth;
  const ordered = items[from].ordered;
  const todo = items[from].task !== undefined;
  let html = `<${ordered ? 'ol' : 'ul'}${todo ? ' class="mb-todo"' : ''}>`;
  let i = from;
  while (i < items.length && items[i].depth >= depth) {
    const it = items[i];
    if (it.depth > depth) {                              // a list inside the last item
      const sub = listHtml(items, i, file);
      html = html.replace(/<\/li>$/, sub.html + '</li>');
      i += sub.used;
      continue;
    }
    html += `<li${it.task && it.task.toLowerCase() === 'x' ? ' class="done"' : ''}>${mdInlineToHtml(it.text, file) || '<br>'}</li>`;
    i++;
  }
  return { html: html + `</${ordered ? 'ol' : 'ul'}>`, used: i - from };
}

/* ---- export ---- */
function boardToCanvas(b, folder) {
  const own = `mbf://${String(b.id).toLowerCase()}/`;
  const files = new Set();
  const ref = (url) => {
    const u = String(url || '').replace(/&amp;/g, '&');
    if (!u.toLowerCase().startsWith(own)) return '';
    let name = u.slice(own.length);
    try { name = decodeURIComponent(name); } catch (_) {}
    files.add(name);
    return `${folder}/${name}`;
  };
  const nodes = [];
  b.frames.forEach((f) => {
    const n = { id: f.id, type: 'group', x: Math.round(f.x), y: Math.round(f.y), width: Math.round(f.w), height: Math.round(f.h) };
    if (f.title) n.label = f.title;
    if (CANVAS_COLOR[f.color]) n.color = CANVAS_COLOR[f.color];
    else if (isHex(f.color)) n.color = f.color;
    nodes.push(n);
  });
  b.notes.slice().sort((x, y) => (x.z || 0) - (y.z || 0)).forEach((note) => {
    const box = { id: note.id, x: Math.round(note.x), y: Math.round(note.y), width: Math.round(note.w), height: Math.round(note.h) };
    if (CANVAS_COLOR[note.color]) box.color = CANVAS_COLOR[note.color];
    else if (isHex(note.color)) box.color = note.color;   // JSON Canvas takes a hex as it is
    const src = note.pic ? picSrc(note) : '';
    const local = src && ref(src);
    if (local) { nodes.push(Object.assign({ type: 'file', file: local }, box)); return; }
    const n = Object.assign({ type: 'text', text: noteToMarkdown(note.body, ref) }, box);
    const extra = {};
    if (note.status) extra.status = note.status;
    if (note.date) extra.date = note.date;
    if (note.icon) { extra.icon = note.icon; extra.iconColor = note.iconColor; }
    if (Object.keys(extra).length) n.mentalBoard = extra;
    nodes.push(n);
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = b.links.filter((l) => ids.has(l.from) && ids.has(l.to))
    .map((l) => ({ id: l.id, fromNode: l.from, toNode: l.to, toEnd: 'none' }));
  return { json: JSON.stringify({ nodes, edges }, null, '\t'), files: [...files] };
}

async function exportCanvas(id) {
  const b = id ? boardById(id) : activeBoard();
  if (!b || b.unreadable) return;
  closeBoardMenu();
  /* A canvas is plain text by definition, so a locked board has to be opened
     first — and is then exported as what it says, which the user asked for. */
  if (isLocked(b) && !(await unlockBoard(b))) return;
  if (!DATA || !DATA.pickCanvasPath) { toast(t('msg.needDesktop')); return; }
  if (b.id === state.activeBoard) syncActiveBoard();
  const target = await DATA.pickCanvasPath(`${boardDirName(b)}.canvas`);
  if (!target) return;                                   // cancelled
  const base = target.replace(/^.*[\\/]/, '').replace(/\.canvas$/i, '') || 'board';
  const folder = `${base} files`;
  const { json, files } = boardToCanvas(b, folder);
  const r = await DATA.writeCanvas(target, json, b.id, files, folder);
  if (!r || r.error) { toast(t('msg.exportFailed'), 5000); return; }
  toast(t('msg.canvasExported', { path: r.path, n: r.files || 0 }), 6000);
}

/* ---- import ---- */
async function importCanvas() {
  if (!DATA || !DATA.importCanvas) { toast(t('msg.needDesktop')); return; }
  const r = await DATA.importCanvas();
  if (!r) return;
  if (r.error) { toast(t('msg.readFailed')); return; }
  await canvasToBoard(r.data, r.dir, r.name);
}
// a .canvas dropped on the board
async function importCanvasFile(p) {
  if (!p || !DATA || !DATA.readCanvas) { toast(t('msg.needDesktop')); return; }
  const r = await DATA.readCanvas(p);
  if (!r || r.error) { toast(t('msg.readFailed')); return null; }
  return canvasToBoard(r.data, r.dir, r.name);
}

async function canvasToBoard(data, dir, name) {
  const nodes = (data && Array.isArray(data.nodes) ? data.nodes : []).filter((n) => n && n.id && typeof n.type === 'string');
  if (!nodes.length) { toast(t('msg.canvasEmpty')); return null; }
  /* Pass one: every file the canvas names, from file nodes and from the text,
     so they can be looked for and copied in one round trip. */
  const refs = new Set();
  nodes.forEach((n) => {
    if (n.type === 'file' && typeof n.file === 'string') refs.add(n.file);
    if (n.type === 'text' && typeof n.text === 'string') {
      for (const m of n.text.matchAll(/!?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) refs.add(m[1].trim());
      for (const m of n.text.matchAll(/!?\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))\)/g)) {
        const p = (m[1] || m[2] || '').trim();
        if (p && !/^[a-z]+:/i.test(p)) refs.add(p);
      }
    }
  });
  const tokens = new Map();                              // path → token
  const file = (p) => {
    const key = String(p || '').trim();
    if (!refs.has(key)) return '';
    if (!tokens.has(key)) tokens.set(key, CANVAS_TOKEN + tokens.size);
    return tokens.get(key);
  };

  /* Pass two: the board, in the shape a saved board has, so adoptBoard()
     heals and validates it like any other. */
  const notes = [], frames = [];
  let z = 1;
  const box = (n) => ({ x: +n.x || 0, y: +n.y || 0, w: +n.width || 260, h: +n.height || 180 });
  nodes.forEach((n) => {
    const colour = colourFromCanvas(n.color);
    if (n.type === 'group') { frames.push(Object.assign({ id: String(n.id), title: String(n.label || ''), color: colour }, box(n))); return; }
    const meta = n.mentalBoard && typeof n.mentalBoard === 'object' ? n.mentalBoard : {};
    const note = Object.assign({ id: String(n.id), color: colour, z: z++, status: meta.status || '', date: meta.date || '', icon: meta.icon, iconColor: meta.iconColor }, box(n));
    if (n.type === 'text') note.body = markdownToNote(n.text, file);
    else if (n.type === 'link') note.body = /^https?:/i.test(n.url || '') ? `<p><a href="${esc(n.url)}">${esc(n.url)}</a></p>` : '<p><br></p>';
    else if (n.type === 'file') {
      const tok = file(n.file);
      const fname = String(n.file || '').split('/').pop();
      const ext = extOf(fname);
      if (tok && IMG_EXT.includes(ext)) { note.pic = true; note.ar = note.w / note.h; note.body = picBody(tok, fname); }
      else if (tok && VIDEO_EXT.includes(ext)) note.body = videoHtml(tok, fname) + '<p><br></p>';
      else if (tok && AUDIO_EXT.includes(ext)) note.body = audioHtml(tok, fname) + '<p><br></p>';
      else if (tok) note.body = docHtml(tok, fname);
      else note.body = `<p>${esc(fname || n.file || '')}</p>`;
    } else return;
    notes.push(note);
  });
  const ids = new Set(notes.map((n) => n.id));
  const links = (Array.isArray(data.edges) ? data.edges : [])
    .filter((e) => e && ids.has(String(e.fromNode)) && ids.has(String(e.toNode)))
    .map((e) => ({ id: String(e.id || uid()), from: String(e.fromNode), to: String(e.toNode) }));

  const b = adoptBoard({ mbBoard: 2, id: uid(), name: String(name || '').slice(0, 80), notes, frames, links });
  if (!b) { toast(t('msg.readFailed')); return null; }
  b.updatedAt = Date.now();
  state.boards.push(b);

  /* Pass three: the files. The board's folder has to exist before anything
     can be copied into it, hence the save first. A file that cannot be found
     keeps its name on the note rather than becoming a broken picture. */
  let copied = 0;
  const found = {};
  if (tokens.size && DATA && DATA.resolveCanvas && FILES && FILES.attach) {
    await saveNow();
    const where = await DATA.resolveCanvas(dir, [...tokens.keys()]);
    for (const [p, tok] of tokens) {
      const abs = where && where[p];
      if (!abs) continue;
      const r = await FILES.attach(abs, b.id, abs.split(/[\\/]/).pop());
      if (r && r.url) { found[tok] = r.url; copied++; }
    }
  }
  b.notes.forEach((n) => {
    if (!n.body || !n.body.includes(CANVAS_TOKEN)) return;
    const d = document.createElement('div');
    d.innerHTML = n.body;
    d.querySelectorAll('[src], [href]').forEach((el) => {
      const attr = el.hasAttribute('src') ? 'src' : 'href';
      const v = el.getAttribute(attr) || '';
      if (!v.startsWith(CANVAS_TOKEN)) return;
      if (found[v]) { el.setAttribute(attr, found[v]); return; }
      const name = (el.closest('.mb-file') && el.closest('.mb-file').dataset.name) || el.textContent || '';
      const p = document.createElement('p');
      p.textContent = name || '?';
      (el.closest('.mb-file') || el).replaceWith(p);
    });
    n.body = d.innerHTML;
    if (n.pic && !n.body.includes('<img')) { n.pic = undefined; n.ar = undefined; }
  });

  markStatsStale();
  renderBoardRail();
  save();
  toast(copied ? t('msg.boardImportedFiles', { name: boardLabel(b), n: copied }) : t('msg.boardImported', { name: boardLabel(b) }), 4200);
  return b;
}
