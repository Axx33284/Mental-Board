/* Mental Board — samsung.js
   Samsung Notes: a note from the phone, onto the board.

   Part 20 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 18b. Samsung Notes ───────────────

   What Samsung Notes can hand over, and what each one brings (MAP.md §4w):

       .sdocx   its own file — read here, piece by piece:
                  the typed text            → a note, styled, pictures inline
                  handwriting, highlighter  → ink, in the note's own colours
                  shapes and lines          → ink, as the outline
                  text boxes on a page      → notes where they stood
                  pictures on a page        → pictures where they stood
                and the lot inside one workflow named after the note.
       .pdf     a document card (Samsung's PDF export is the picture-perfect
                fallback for anything the .sdocx reader leaves out)
       .png .jpg a picture, as any dropped picture
       .txt     a note with the text in it

   The .sdocx is decoded in main (src/sdocx.js, through store.readSamsung),
   which also writes its pictures into this board's files\ — so everything
   that arrives here is `mbf://` and numbers. What could not be read (a
   table, a code block, Samsung's own .spi pictures, a damaged object) is
   counted, and the toast says so and points at the PDF export. */

const SAMSUNG_PAGE_W = 900;     // a Samsung page, this wide in world px
const SAMSUNG_NOTE_W = 460;     // the typed text's note
const SAMSUNG_GAP = 60;
const SAMSUNG_PAD = 46;         // inside the workflow, as groupSelection() pads

async function importSamsung(at) {
  if (!canEditHere()) return;
  if (!DATA || !DATA.pickSamsung) { toast(t('msg.needDesktop')); return; }
  const paths = await DATA.pickSamsung();
  if (paths && paths.length) await importSamsungFiles(paths, at);
}

/* Several files: one after another, each to the right of the last, so a
   week of notes dropped at once lands as a row and not a pile. */
async function importSamsungFiles(paths, at) {
  if (!canEditHere()) return;
  let pt = at || viewCenterWorld();
  for (const p of paths) {
    const box = await importSamsungFile(p, pt);
    if (box) pt = { x: box.x + box.w + SAMSUNG_GAP * 2, y: box.y + box.h / 2, left: true };
  }
}

// one file; returns the box it took on the board, or null
async function importSamsungFile(p, at) {
  const name = String(p || '').split(/[\\/]/).pop();
  const ext = extOf(name);
  if (ext !== 'sdocx' && ext !== 'txt') {
    // a PDF or a picture Samsung exported: exactly what a drop would make
    if (!FILES || !FILES.attach) { toast(t('msg.needDesktop')); return null; }
    const r = await FILES.attach(p, state.activeBoard, '');
    if (r && r.error === 'too big') { toast(t('msg.fileTooBig', { name }), 5000); return null; }
    if (!r || r.error) { toast(t('msg.fileFailed', { name }), 5000); return null; }
    return startAt(await noteFromTaken({ url: r.url, name: r.name }, at), at);
  }
  if (!DATA.readSamsung) { toast(t('msg.needDesktop')); return null; }
  const r = await DATA.readSamsung(p, state.activeBoard);
  if (!r || r.error) { toast(t('msg.samsungFailed', { name }), 6000); return null; }
  if (r.kind === 'text') return startAt(addNote(at, { body: textToNote(r.text), w: SAMSUNG_NOTE_W, h: 320, edit: false }), at);
  return samsungToBoard(r.data, r.name, at);
}
/* A note made centred on `at`, moved to start there when it is the next in a
   row; returns the box it took. */
function startAt(n, at) {
  if (!n) return null;
  if (at && at.left) {
    n.x = Math.round(at.x); n.y = Math.round(at.y - n.h / 2);
    const el = els.get(n.id);
    if (el) placeEl(el, n);
    saveSoon();
  }
  return { x: n.x, y: n.y, w: n.w, h: n.h };
}

const textToNote = (s) => String(s || '').replace(/\r\n?/g, '\n').split(/\n{2,}/)
  .map((p) => p.trim() ? `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>` : '').join('') || '<p><br></p>';

/* ---- the note, onto the board ---- */
function samsungToBoard(d, fileName, at) {
  if (!canEditHere() || !d) return null;
  const media = d.media || {};
  const notes = [], ink = [];
  let skipped = (d.skipped.other || 0) + (d.skipped.shapes || 0) + (d.skipped.spi || 0) + (d.skipped.broken || 0);

  // the typed text, one note, at the left
  let x = 0;
  if (d.body) {
    const html = richToHtml(d.body, media, SAMSUNG_NOTE_W - 32);
    skipped += html.skipped;
    if (html.html) {
      notes.push({ x: 0, y: 0, w: SAMSUNG_NOTE_W, h: html.h, body: html.html });
      x = SAMSUNG_NOTE_W + SAMSUNG_GAP;
    }
  }

  /* The pages, to the right: everything on them in page units, the pages one
     under another, then cropped to what is there and scaled to the board. */
  const k = SAMSUNG_PAGE_W / (d.width || 1080);
  const pageY = (i) => (d.pages[i] ? d.pages[i].y : 0);
  let x0 = Infinity, y0 = Infinity;
  const grow = (px, py) => { if (px < x0) x0 = px; if (py < y0) y0 = py; };
  d.strokes.forEach((s) => { for (let i = 0; i < s.pts.length; i += 2) grow(s.pts[i], s.pts[i + 1] + pageY(s.page)); });
  d.images.forEach((m) => grow(m.x, m.y + pageY(m.page)));
  d.boxes.forEach((b) => grow(b.x, b.y + pageY(b.page)));
  if (Number.isFinite(x0)) {
    const X = (v) => x + (v - x0) * k, Y = (v, page) => (v + pageY(page) - y0) * k;
    d.strokes.forEach((s) => {
      const st = samsungStroke(s, k);
      st.pts = s.pts.map((v, i) => (i % 2 ? Y(v, s.page) : X(v)));
      ink.push(st);
    });
    d.images.forEach((m) => {
      const f = media[m.media];
      const w = Math.max(PIC_MIN, m.w * k), h = Math.max(PIC_MIN, m.h * k);
      notes.push({ x: X(m.x), y: Y(m.y, m.page), w, h, pic: true, ar: w / h, body: picBody(f.url, f.name) });
    });
    d.boxes.forEach((b) => {
      const html = richToHtml(b.text, media, Math.max(NOTE_MIN_W, b.w * k) - 32);
      skipped += html.skipped;
      notes.push({ x: X(b.x), y: Y(b.y, b.page), w: Math.max(NOTE_MIN_W, b.w * k), h: Math.max(NOTE_MIN_H, b.h * k, html.h), body: html.html });
    });
  }
  if (!notes.length && !ink.length) { toast(t('msg.samsungEmpty', { name: fileName }), 5000); return null; }

  /* Where it lands: centred on `at` — or, for the second file of several,
     starting at `at` — inside a workflow named after the note. */
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const take = (a, b, c, e) => { bx0 = Math.min(bx0, a); by0 = Math.min(by0, b); bx1 = Math.max(bx1, c); by1 = Math.max(by1, e); };
  notes.forEach((n) => take(n.x, n.y, n.x + n.w, n.y + n.h));
  ink.forEach((s) => { const b = inkBox(s); take(b.x0, b.y0, b.x1, b.y1); delete s._box; });
  const c = at || viewCenterWorld();
  const dx = Math.round((at && at.left ? c.x : c.x - (bx1 - bx0) / 2) - bx0);
  const dy = Math.round(c.y - (by1 - by0) / 2 - by0);

  pushUndo();
  const made = [];
  const frame = {
    id: uid(),
    x: Math.round(bx0 + dx - SAMSUNG_PAD), y: Math.round(by0 + dy - SAMSUNG_PAD),
    w: Math.round(bx1 - bx0 + SAMSUNG_PAD * 2), h: Math.round(by1 - by0 + SAMSUNG_PAD * 2),
    title: (d.title || fileName || '').slice(0, 120),
    color: COLORS[1 + (state.frames.length % (COLORS.length - 1))],
    icon: 'edit_note', iconColor: 'auto', titlePos: 'tl'
  };
  state.frames.push(frame);
  const fel = makeFrame(frame); $('framesLayer').appendChild(fel); els.set(frame.id, fel);
  made.push(frame.id);
  notes.forEach((o) => {
    const n = {
      id: uid(), x: Math.round(o.x + dx), y: Math.round(o.y + dy), w: Math.round(o.w), h: Math.round(o.h),
      body: o.body, color: 'default', icon: '', iconColor: 'auto', z: ++state.nextZ,
      remindAt: 0, reminded: false, repeat: '', hist: []
    };
    if (o.pic) { n.pic = true; n.ar = o.ar; }
    state.notes.push(n);
    const el = makeNote(n); $('notesLayer').appendChild(el); els.set(n.id, el);
    made.push(n.id);
  });
  const strokes = adoptInk(ink.map((s) => Object.assign(s, { pts: s.pts.map((v, i) => v + (i % 2 ? dy : dx)) })));
  if (state.ink.length + strokes.length > INK_MAX) strokes.length = Math.max(0, INK_MAX - state.ink.length);
  state.ink.push(...strokes);

  updateCulling();
  refreshFrameCounts(); updateEmpty(); drawInk(); drawCompass(); save();
  setSelection(made, false);
  if (skipped) toast(t('msg.samsungPartial', { name: frame.title, n: skipped }), 8000);
  else toast(t('msg.samsungImported', { name: frame.title }), 4200);
  return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
}

/* A Samsung stroke as one of ours. A see-through colour is a highlighter,
   so it becomes the marker; a stroke whose pressure moves becomes the brush,
   with a width per point; the rest are the pen. Black is the theme's ink —
   white on a dark board — as a stroke drawn here in black would be. */
function samsungStroke(s, k) {
  const c = s.color >>> 0;
  const a = c >>> 24, r = (c >>> 16) & 255, g = (c >>> 8) & 255, b = c & 255;
  const color = r < 64 && g < 64 && b < 64 ? 'text' : '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const size = Math.max(0.5, s.size * k);
  if (!s.shape && a < 240) return { id: uid(), tool: 'marker', color, size };
  const ps = s.ps || [];
  const lo = Math.min(...ps), hi = Math.max(...ps);
  if (!s.shape && ps.length > 2 && hi - lo > 0.05) {
    return { id: uid(), tool: 'brush', color, size, ws: ps.map((p) => Math.max(0.5, size * (0.25 + 0.75 * p))) };
  }
  return { id: uid(), tool: 'pen', color, size: s.shape ? size : Math.max(0.5, size * 0.6) };
}

/* ---- Samsung's rich text → a note's HTML ----
   The text is one string; the styles are spans over UTF-16 offsets, the
   paragraph kinds are records over paragraph numbers. Each paragraph is cut
   where any span starts or ends and each run is wrapped in what covers it.
   Span types: 3 size, 5 bold, 6 italic, 7 underline, 9 link, 17 highlight,
   20 strike-through. Paragraph types: 5 bullet (2 a to-do; 4–7 and 10
   numbered), 10 Samsung's own Heading 1–3. A run of text much bigger than
   the note's usual size is a heading too, because that is how most people
   make one on the phone. A U+FFFC is an object: a picture is put inline, a
   table or a code block is counted as not brought in. */
function richToHtml(rt, media, width) {
  const text = String(rt.text || '');
  const spans = Array.isArray(rt.spans) ? rt.spans : [];
  const objs = new Map((rt.objects || []).map((o) => [o.index, o]));
  // the size most of the text is in — "normal" for this note
  const sizes = new Map();
  spans.forEach((s) => { if (s.type === 3 && s.value > 0) sizes.set(s.value, (sizes.get(s.value) || 0) + (s.end - s.start)); });
  const base = [...sizes].sort((a, b) => b[1] - a[1]).map((e) => e[0])[0] || 15;
  const paraAttr = (i, type) => (rt.paras || []).find((p) => p.type === type && p.start <= i && i < Math.max(p.end, p.start + 1));

  const out = [];
  let skipped = 0, h = 24, blankRun = 0, list = null;
  const closeList = () => { if (list) { out.push(`</${list.tag}>`); list = null; } };
  let at = 0;
  text.split('\n').forEach((line, pi) => {
    const start = at, end = at + line.length;
    at = end + 1;
    // an object alone (or with spaces) on its line is a block of its own
    if (line.includes('￼')) {
      for (let i = start; i < end; i++) {
        if (text[i] !== '￼') continue;
        const o = objs.get(i);
        const f = o && o.type === 3 && media[o.media];
        if (f) {
          closeList();
          out.push(`<p>${imageHtml(f.url)}</p>`);
          const ar = o.w > 0 && o.h > 0 ? o.h / o.w : 0.66;
          h += Math.min(width, o.w || width) * ar + 12;
        } else skipped++;
      }
      line = line.replace(/￼/g, '');
      if (!line.trim()) return;
    }
    if (!line.trim()) {
      closeList();
      if (out.length && blankRun++ === 0) { out.push('<p><br></p>'); h += 22; }
      return;
    }
    blankRun = 0;
    const inner = runsHtml(text, start, end, spans);
    const style = paraAttr(pi, 10);
    const bullet = paraAttr(pi, 5);
    const big = sizeOver(spans, start, end) / base;
    let tag = 'p';
    if (style && style.v[0] <= 2) tag = 'h' + (style.v[0] + 1);
    else if (big >= 1.35) tag = 'h1';
    else if (big >= 1.15) tag = 'h2';
    const kind = bullet ? bullet.v[0] : 0;
    if (kind && tag === 'p') {
      const todo = kind === 2, ordered = [4, 5, 6, 7, 10].includes(kind);
      const lt = ordered ? 'ol' : 'ul';
      if (!list || list.tag !== lt || list.todo !== todo) { closeList(); list = { tag: lt, todo }; out.push(`<${lt}${todo ? ' class="mb-todo"' : ''}>`); }
      out.push(`<li${todo && bullet.v[2] ? ' class="done"' : ''}>${inner || '<br>'}</li>`);
    } else {
      closeList();
      out.push(`<${tag}>${inner}</${tag}>`);
    }
    h += (tag === 'p' || kind ? 22 : 34) * Math.max(1, Math.ceil(line.length / Math.max(20, width / 8.2)));
  });
  closeList();
  while (out.length && out[out.length - 1] === '<p><br></p>') out.pop();
  return { html: out.join(''), h: Math.round(clamp(h + 24, NOTE_MIN_H, 1400)), skipped };
}

// the size the most of [start,end) is in, from the size spans
function sizeOver(spans, start, end) {
  let best = 0, len = 0;
  spans.forEach((s) => {
    if (s.type !== 3 || !(s.value > 0)) return;
    const n = Math.min(end, s.end) - Math.max(start, s.start);
    if (n > len) { len = n; best = s.value; }
  });
  return best || 0;
}

function runsHtml(text, start, end, spans) {
  const on = spans.filter((s) => s.end > start && s.start < end && s.end > s.start &&
    ([5, 6, 7, 20].includes(s.type) ? s.value : s.type === 17 ? (s.value >>> 24) > 0 : s.type === 9));
  const cuts = new Set([start, end]);
  on.forEach((s) => { cuts.add(Math.max(start, s.start)); cuts.add(Math.min(end, s.end)); });
  const at = [...cuts].sort((a, b) => a - b);
  let html = '';
  for (let i = 0; i < at.length - 1; i++) {
    const a = at[i], b = at[i + 1];
    let seg = esc(text.slice(a, b).replace(/￼/g, ''));
    if (!seg) continue;
    const has = (type) => on.find((s) => s.type === type && s.start <= a && b <= s.end);
    if (has(20)) seg = `<s>${seg}</s>`;
    if (has(7)) seg = `<u>${seg}</u>`;
    if (has(6)) seg = `<i>${seg}</i>`;
    if (has(5)) seg = `<b>${seg}</b>`;
    if (has(17)) seg = `<mark>${seg}</mark>`;
    const link = has(9);
    const href = link && samsungHref(link, text.slice(link.start, link.end));
    if (href) seg = `<a href="${esc(href)}">${seg}</a>`;
    html += seg;
  }
  return html;
}
// a link's address: the one Samsung kept, or the text itself when it is one
function samsungHref(span, words) {
  const u = String(span.url || '').trim();
  if (/^(https?:|mailto:)/i.test(u)) return u;
  const w = words.trim();
  const url = /(https?:\/\/\S+)/i.exec(w);
  if (url) return url[1];
  const mail = /([^\s@:]+@[^\s@]+\.[^\s@]+)/.exec(w);
  if (mail) return 'mailto:' + mail[1];
  return '';
}
