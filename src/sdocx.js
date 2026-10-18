/* Mental Board — sdocx.js
   Reads a Samsung Notes file (.sdocx). Runs in the main process (required by
   store.js); plain Node, no dependency — the zip is read with zlib.

   Samsung never published the format. What is here follows the
   reverse-engineered description in github.com/twangodev/sdocx
   (docs/reverse-engineering/file-format.md), written fresh from that
   description and checked against the four real notes in the CC-BY corpus
   huggingface.co/datasets/twangodev/sdocx-compatibility. See MAP.md §4w.

   An .sdocx is a zip:

       note.note           the title and the typed text (one flowing body)
       pageIdInfo.dat      the order of the pages
       <uuid>.page         one page: layers of objects — handwriting, text
                           boxes, pictures, shapes
       media/mediaInfo.dat which file each picture's number means
       media/*             the pictures themselves (and Samsung's own .spi)

   Every record in it is sized, so a reader that does not understand an
   object can step over it exactly. That is what makes this safe to ship
   against a format nobody documents: **what is read is read from a declared
   size, and what is not understood is counted and skipped, never guessed.**
   Each part — the text, each page, each object — is read inside its own
   try, so one damaged object costs that object, not the note.

   What comes out (readSdocx):
     { title, width, pages: [{ w, h, y }],
       body: rich text | null,                 the typed note
       boxes: [{ page, x, y, w, h, text }],    text boxes on a page
       strokes: [{ page, pts, ps, color, size }],
       images:  [{ page, x, y, w, h, media }], pictures on a page
       media:   { id: { name, ext, data } },   only PNG / JPEG / GIF / WebP
       skipped: { shapes, other, spi, broken } }
   where rich text is { text, spans: [{ type, start, end, value, url }],
   paras: [{ type, start, end, v: [u32…] }], objects: [{ index, type, media, w, h }] }
   and every coordinate is Samsung's own page units, page-local. */
'use strict';
const zlib = require('zlib');

const LIMITS = {
  entries: 4096,
  entry: 256 * 1024 * 1024,      // one inflated entry
  total: 768 * 1024 * 1024,      // everything inflated
  points: 4000000,               // every stroke point in the note
  depth: 64                      // objects inside objects
};

/* ---------- the zip ---------- */
/* The central directory is the truth (sizes in local headers can be zero when
   a data descriptor follows). Stored and deflated entries only; an encrypted
   or zip64 entry is refused by name rather than read as garbage. */
function unzip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535 - 4096); i--) {
    // Samsung appends its own record after the end of the zip, hence the extra reach
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  if (count === 0xffff || p === 0xffffffff) throw new Error('zip64');
  if (count > LIMITS.entries) throw new Error('too many entries');
  const out = new Map();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad zip directory');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl).replace(/\\/g, '/');
    p += 46 + nl + xl + cl;
    if (flags & 1) continue;                                  // encrypted entry
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) continue;
    const start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    if (start + csize > buf.length) continue;
    const raw = buf.subarray(start, start + csize);
    let data;
    try {
      if (method === 0) data = raw;
      else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: Math.min(LIMITS.entry, Math.max(usize, 1) + 1024) });
      else continue;
    } catch (_) { continue; }
    total += data.length;
    if (total > LIMITS.total) throw new Error('too big');
    out.set(name, data);
  }
  return out;
}

/* ---------- a bounded reader ---------- */
class R {
  constructor(buf, pos, end) { this.b = buf; this.p = pos || 0; this.end = end == null ? buf.length : Math.min(end, buf.length); }
  need(n) { if (n < 0 || this.p + n > this.end) throw new Error('short'); }
  u8() { this.need(1); return this.b[this.p++]; }
  u16() { this.need(2); const v = this.b.readUInt16LE(this.p); this.p += 2; return v; }
  i16() { this.need(2); const v = this.b.readInt16LE(this.p); this.p += 2; return v; }
  u32() { this.need(4); const v = this.b.readUInt32LE(this.p); this.p += 4; return v; }
  i32() { this.need(4); const v = this.b.readInt32LE(this.p); this.p += 4; return v; }
  f32() { this.need(4); const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  f64() { this.need(8); const v = this.b.readDoubleLE(this.p); this.p += 8; return v; }
  skip(n) { this.need(n); this.p += n; }
  bytes(n) { this.need(n); const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
  str16() { const n = this.u16(); return this.b.toString('utf16le', this.p, (this.skip(n * 2), this.p)); }
  str32() { const n = this.u32(); return this.b.toString('utf16le', this.p, (this.skip(n * 2), this.p)); }
}
// a length-prefixed bit mask, as an array of bytes; bit(n) asks it
function mask(r) {
  const n = r.u8();
  const m = r.bytes(n);
  return { n, bit: (k) => (k >> 3) < m.length && !!(m[k >> 3] & (1 << (k & 7))), any: (from) => { for (let k = from; k < m.length * 8; k++) if (m[k >> 3] & (1 << (k & 7))) return true; return false; } };
}

/* ---------- frames ----------
   An object's payload is a chain of typed frames, each sized:
     u32 size, i16 type, u32 flexible offset (from the frame's start),
     property mask, field mask, the fixed fields, then the flexible ones. */
function frames(buf, start, end) {
  const out = [];
  let p = start;
  while (p + 12 <= end && out.length < 16) {
    const r = new R(buf, p, end);
    const size = r.u32(), type = r.i16(), flex = r.u32();
    if (size < 12 || p + size > end) break;
    const pm = mask(r), fm = mask(r);
    out.push({ type, start: p, end: p + size, flex: p + flex, fixed: r.p, pm, fm });
    p += size;
  }
  return out;
}
const frameOf = (fr, type) => fr.find((f) => f.type === type);

/* The base frame (type 0) every object starts with: its box on the page. */
function baseBox(buf, f) {
  if (!f) return null;
  const r = new R(buf, f.fixed, f.end);
  r.u32();                                          // format version
  r.skip(r.u16());                                  // uuid
  r.skip(8);                                        // modified
  const x0 = r.f64(), y0 = r.f64(), x1 = r.f64(), y1 = r.f64();
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), visible: f.pm.bit(3) };
}

/* Frame 7's flexible fields, in bit order: 0 the text, 1 a byte, 2 and 4 a
   string id, 5 the picture fill. Bit 3's size is not known, so a frame that
   has it gives up on the fields after it rather than guess. */
function frame7(buf, f) {
  const out = { text: null, media: -1 };
  if (!f) return out;
  const r = new R(buf, f.flex, f.end);
  if (f.fm.bit(0)) { const n = r.u32(); out.text = textCommon(buf, r.p, r.p + n); r.skip(n); }
  if (f.fm.bit(1)) r.skip(1);
  if (f.fm.bit(2)) r.skip(4);
  if (f.fm.bit(3)) return out;
  if (f.fm.bit(4)) r.skip(4);
  if (f.fm.bit(5)) {
    const n = r.u32(); const end = r.p + n + 1;
    const kind = r.u8();
    if (kind === 2 && n >= 5) { r.u8(); out.media = r.i32(); }   // fill mode, then the media id
    r.p = end;
  }
  return out;
}

/* ---------- rich text ----------
   The text, then style spans over UTF-16 offsets, then paragraph records over
   paragraph numbers, margins, and the objects standing in the text (each one
   a U+FFFC in it). Span and paragraph records are sized by a u16 that does
   not count itself. */
function textCommon(buf, start, end) {
  const r = new R(buf, start, end);
  const text = r.str32();
  const spans = [], paras = [], objects = [];
  try {
    const ns = r.u32();
    for (let i = 0; i < ns; i++) {
      const sz = r.u16(), at = r.p;
      const q = new R(buf, at, at + sz);
      const type = q.u32(), s = q.u32(), e = q.u32();
      q.u32();                                                       // expansion flag
      const span = { type, start: s, end: e, value: 0 };
      if (type === 9) {                                              // a link: kind, then the address
        try { span.kind = q.u32(); q.u32(); span.url = q.str32(); } catch (_) {}
      } else if (q.end - q.p >= 4) span.value = type === 3 ? q.f32() : q.u32();
      spans.push(span);
      r.p = at + sz;
    }
    const np = r.u32();
    for (let i = 0; i < np; i++) {
      const sz = r.u16(), at = r.p;
      const q = new R(buf, at, at + sz);
      const type = q.u32(), s = q.u32(), e = q.u32();
      const v = [];
      while (q.end - q.p >= 4 && v.length < 4) v.push(q.u32());
      paras.push({ type, start: s, end: e, v });
      r.p = at + sz;
    }
    r.skip(16 + 1);                                                  // margins, gravity
    r.skip(r.u16() * 8);                                             // per-page sections
    const flags = r.u32(); r.u32();
    if (flags & 1) {
      const no = r.u32();
      for (let i = 0; i < no; i++) {
        const sz = r.u32(), at = r.p;
        try {
          const q = new R(buf, at, at + sz);
          const osz = q.u32(), otype = q.u32();
          const ob = q.p;
          q.skip(osz);
          const index = q.i32();
          const fr = frames(buf, ob, ob + osz);
          const box = baseBox(buf, frameOf(fr, 0));
          objects.push({ index, type: otype, media: otype === 3 ? frame7(buf, frameOf(fr, 7)).media : -1, w: box ? box.w : 0, h: box ? box.h : 0 });
        } catch (_) {}
        r.p = at + sz;
      }
    }
  } catch (_) { /* the text itself is what matters; styles are a bonus */ }
  return { text, spans, paras, objects };
}

/* ---------- note.note ---------- */
function readNote(buf) {
  const r = new R(buf);
  r.u32();                                   // where the optional document fields start
  mask(r); mask(r);
  r.u32();                                   // format version
  r.str16();                                 // note id
  r.u32(); r.skip(16);                       // revision, created, modified
  const width = r.u32(), height = r.u32();
  r.skip(12);                                // paddings, minimum version
  const one = () => {
    const n = r.u32(), at = r.p;
    r.skip(n);
    try { return frame7(buf, frameOf(frames(buf, at, at + n), 7)).text; } catch (_) { return null; }
  };
  const title = one();
  const body = one();
  return { width, height, title: title ? title.text.replace(/[\u0000-\u001f￼]+/g, ' ').trim() : '', body };
}

/* ---------- media ---------- */
function readMediaInfo(buf) {
  const ids = new Map();
  if (!buf || buf.length < 6) return ids;
  try {
    const tail = buf.toString('latin1', buf.length - 4);
    const r = new R(buf);
    if (tail === 'EOFX') {
      r.u32();
      const n = r.u16();
      for (let i = 0; i < n; i++) {
        const sz = r.u32(), at = r.p;
        const id = r.u32(), name = r.str16();
        ids.set(id, name);
        r.p = at + sz;
      }
    } else {
      const n = r.u16();
      for (let i = 0; i < n; i++) {
        const id = r.u32(), name = r.str16();
        r.skip(64 + 2 + 8);
        ids.set(id, name);
      }
    }
  } catch (_) {}
  return ids;
}
// what the bytes are, not what the name says
function imageKind(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return '';
}

/* ---------- a page ---------- */
const OBJ = { stroke: 1, text: 2, image: 3, container: 4, shape: 7, line: 8, group: 100 };

function readPage(buf, pageNo, out, budget) {
  const r = new R(buf);
  const layerAt = r.u32();
  r.u32();
  mask(r); mask(r);
  r.u32();                                   // orientation
  const w = r.u32(), h = r.u32();
  r.p = layerAt;
  const layers = r.u16();
  r.u16();                                   // the layer Samsung had open
  for (let L = 0; L < layers; L++) {
    const ls = r.p;
    const size = r.u32();
    r.u32();
    const pm = mask(r);
    r.p = ls + size;
    const count = r.u32();
    const hidden = pm.bit(0);
    for (let i = 0; i < count; i++) readObject(r, pageNo, out, budget, hidden, 0);
    r.skip(32);                              // the layer's hash
  }
  return { w, h };
}

/* One object record, then its children, which follow it directly:
     u8 type, u16 children, u32 size (counting the 32-byte hash after it). */
function readObject(r, pageNo, out, budget, hidden, depth) {
  if (depth > LIMITS.depth) throw new Error('too deep');
  const type = r.u8(), kids = r.u16(), size = r.u32();
  if (size < 32) throw new Error('bad object');
  const at = r.p;
  r.skip(size);
  const buf = r.b;
  const end = at + size - 32;
  if (!hidden) {
    try { readOne(buf, type, at, end, pageNo, out, budget); }
    catch (_) { out.skipped.broken++; }
  }
  for (let i = 0; i < kids; i++) readObject(r, pageNo, out, budget, hidden, depth + 1);
}

function readOne(buf, type, at, end, pageNo, out, budget) {
  if (type === OBJ.container || type === OBJ.group) return;          // its children carry it
  const fr = frames(buf, at, end);
  const box = baseBox(buf, frameOf(fr, 0));
  if (box && !box.visible) return;
  if (type === OBJ.stroke) {
    const s = readStroke(buf, frameOf(fr, 1), budget);
    if (s) { s.page = pageNo; out.strokes.push(s); }
    return;
  }
  if (type === OBJ.text) {
    const t = frame7(buf, frameOf(fr, 7)).text;
    if (box && t && t.text.trim()) out.boxes.push(Object.assign({ page: pageNo, text: t }, box));
    return;
  }
  if (type === OBJ.image) {
    const m = frame7(buf, frameOf(fr, 7)).media;
    if (box) out.images.push({ page: pageNo, x: box.x, y: box.y, w: box.w, h: box.h, media: m });
    return;
  }
  if (type === OBJ.shape || type === OBJ.line) {
    const s = readShape(buf, type, fr, budget);
    if (s) { s.page = pageNo; out.strokes.push(s); } else out.skipped.shapes++;
    return;
  }
  out.skipped.other++;
}

/* ---------- a shape or a line, as the line it draws ----------
   A shape (0 + 6 + 7) keeps its outline as a saved path in absolute page
   units: u32 type, four f64, f32 rotation, then a sized path — u32 count and
   a one-byte verb per command (1 move, 2 line, 3 quad, 4 cubic, 5 arc,
   6 close, 7 oval), each followed by its f64 coordinates. A line (0 + 6 + 8)
   keeps two bytes, its control points and its two ends. The outline's width
   is frame 6's flexible bit 3 (its colour, bit 2, is a layout not read here,
   so a shape comes in in the theme's ink). The fill is not drawn. */
const VERB_ARGS = { 1: 2, 2: 2, 3: 4, 4: 6, 5: 6, 6: 0, 7: 4 };
function readShape(buf, type, fr, budget) {
  const f = frameOf(fr, type);
  if (!f) return null;
  const r = new R(buf, f.fixed, f.flex);
  const pts = [];
  const add = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) pts.push(x, y); };
  /* A straight edge as many short steps: the board draws a stroke smoothed
     through the midpoints of its points, which would round a square's five
     points into a blob. Short steps keep the corners sharp. */
  const edge = (x, y) => {
    if (!pts.length) { add(x, y); return; }
    const px = pts[pts.length - 2], py = pts[pts.length - 1];
    const n = Math.min(200, Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / 6)));
    for (let i = 1; i <= n; i++) add(px + (x - px) * i / n, py + (y - py) * i / n);
  };
  if (type === OBJ.shape) {
    r.u32(); r.skip(32); r.f32();
    const size = r.u32();
    const q = new R(buf, r.p, r.p + size);
    const n = q.u32();
    let cx = 0, cy = 0, sx = 0, sy = 0;
    for (let i = 0; i < n && pts.length < 20000; i++) {
      const verb = q.u8();
      if (!(verb in VERB_ARGS)) return null;          // a command of unknown width: stop rather than guess
      const a = [];
      for (let k = 0; k < VERB_ARGS[verb]; k++) a.push(q.f64());
      if (verb === 1) { if (pts.length) break; cx = sx = a[0]; cy = sy = a[1]; add(cx, cy); }
      else if (verb === 2) { cx = a[0]; cy = a[1]; edge(cx, cy); }
      else if (verb === 3) { for (let t = 1; t <= 12; t++) { const u = t / 12, v = 1 - u; add(v * v * cx + 2 * v * u * a[0] + u * u * a[2], v * v * cy + 2 * v * u * a[1] + u * u * a[3]); } cx = a[2]; cy = a[3]; }
      else if (verb === 4) { for (let t = 1; t <= 16; t++) { const u = t / 16, v = 1 - u; add(v * v * v * cx + 3 * v * v * u * a[0] + 3 * v * u * u * a[2] + u * u * u * a[4], v * v * v * cy + 3 * v * v * u * a[1] + 3 * v * u * u * a[3] + u * u * u * a[5]); } cx = a[4]; cy = a[5]; }
      else if (verb === 5 || verb === 7) {
        const ox = (a[0] + a[2]) / 2, oy = (a[1] + a[3]) / 2, rx = Math.abs(a[2] - a[0]) / 2, ry = Math.abs(a[3] - a[1]) / 2;
        const from = verb === 5 ? a[4] : 0, sweep = verb === 5 ? a[5] : 360;
        const steps = Math.max(4, Math.ceil(Math.abs(sweep) / 7.5));
        for (let t = 0; t <= steps; t++) { const g = (from + sweep * t / steps) * Math.PI / 180; add(ox + rx * Math.cos(g), oy + ry * Math.sin(g)); }
        cx = pts[pts.length - 2]; cy = pts[pts.length - 1];
      } else if (verb === 6) { edge(sx, sy); cx = sx; cy = sy; }
    }
  } else {
    r.u8(); r.u8();
    const cp = r.u8();
    const mid = [];
    for (let i = 0; i < cp; i++) mid.push(r.f64(), r.f64());
    const x0 = r.f64(), y0 = r.f64(), x1 = r.f64(), y1 = r.f64();
    add(x0, y0);
    for (let i = 0; i < mid.length; i += 2) edge(mid[i], mid[i + 1]);
    edge(x1, y1);
  }
  if (pts.length < 4) return null;
  budget.points -= pts.length / 2;
  if (budget.points < 0) throw new Error('too many points');
  let size = 4;
  const f6 = frameOf(fr, 6);
  if (f6 && f6.fm.bit(3) && !f6.fm.bit(0) && !f6.fm.bit(1)) {
    try {
      const q = new R(buf, f6.flex, f6.end);
      if (f6.fm.bit(2)) q.skip(q.u32());
      q.u32();
      const w = q.f32();
      if (Number.isFinite(w) && w > 0) size = w;
    } catch (_) {}
  }
  return { pts, ps: null, color: 0xff000000, size, shape: true };
}

/* ---------- a stroke ----------
   After the frame header: u16 point count, then either the compressed form —
   a first point as two f64, then a u16 delta per axis per point (bit 15 the
   sign, the rest 1/32 of a unit), a first pressure as f32 and u16 deltas in
   1/4096 — or every point as two f64 and every pressure as f32. The colour
   (BGRA in a u32) and the pen size are flexible fields 2 and 3, behind two
   four-byte fields 0 and 1. An eraser stroke is not ink. */
const sm = (raw, unit) => ((raw & 0x8000) ? -(raw & 0x7fff) : (raw & 0x7fff)) / unit;
function readStroke(buf, f, budget) {
  if (!f) return null;
  if (f.pm.bit(3)) return null;                               // eraser
  const r = new R(buf, f.fixed, f.end);
  const n = r.u16();
  if (!n) return null;
  budget.points -= n;
  if (budget.points < 0) throw new Error('too many points');
  const pts = new Array(n * 2), ps = new Array(n);
  if (f.pm.bit(0)) {
    let x = r.f64(), y = r.f64();
    pts[0] = x; pts[1] = y;
    for (let i = 1; i < n; i++) { x += sm(r.u16(), 32); y += sm(r.u16(), 32); pts[i * 2] = x; pts[i * 2 + 1] = y; }
    let p = r.f32();
    ps[0] = p;
    for (let i = 1; i < n; i++) { p += sm(r.u16(), 4096); ps[i] = p; }
  } else {
    for (let i = 0; i < n; i++) { pts[i * 2] = r.f64(); pts[i * 2 + 1] = r.f64(); }
    for (let i = 0; i < n; i++) ps[i] = r.f32();
  }
  if (!pts.every(Number.isFinite)) return null;
  let color = 0xff000000, size = 3;
  const q = new R(buf, f.flex, f.end);
  try {
    if (f.fm.bit(0)) q.skip(4);
    if (f.fm.bit(1)) q.skip(4);
    if (f.fm.bit(2)) color = q.u32();
    if (f.fm.bit(3)) { const s = q.f32(); if (Number.isFinite(s) && s > 0) size = s; }
  } catch (_) {}
  return { pts, ps: ps.map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1)), color, size };
}

/* ---------- the whole note ---------- */
function readSdocx(fileBuf) {
  const z = unzip(fileBuf);
  const noteBuf = z.get('note.note');
  if (!noteBuf) throw new Error(z.size ? 'not a samsung note' : 'locked or empty');
  const note = readNote(noteBuf);
  const b = note.body;
  const hasBody = !!b && (!!b.text.replace(/[\s￼]/g, '') || b.objects.length > 0);
  const out = { title: note.title, width: note.width || 1080, pages: [], body: hasBody ? b : null,
    boxes: [], strokes: [], images: [], media: {}, skipped: { shapes: 0, other: 0, spi: 0, broken: 0 } };

  // the pages, in the order pageIdInfo gives (the zip's order means nothing)
  const order = [];
  try {
    const r = new R(z.get('pageIdInfo.dat'));
    r.skip(32);
    const n = r.u16();
    for (let i = 0; i < n; i++) { order.push(r.str16()); r.skip(32); }
  } catch (_) {}
  if (!order.length) for (const k of z.keys()) if (/^[^/]+\.page$/.test(k)) order.push(k.slice(0, -5));
  const budget = { points: LIMITS.points };
  let y = 0;
  order.forEach((id, i) => {
    const pb = z.get(`${id}.page`);
    if (!pb) return;
    let size = { w: out.width, h: 0 };
    try { size = readPage(pb, i, out, budget); }
    catch (_) { out.skipped.broken++; }
    out.pages[i] = { w: size.w || out.width, h: size.h || 0, y };
    y += size.h || 0;
  });

  // the pictures anything points at, and only real pictures
  const names = readMediaInfo(z.get('media/mediaInfo.dat'));
  const wanted = new Set(out.images.map((m) => m.media));
  if (out.body) out.body.objects.forEach((o) => { if (o.type === 3) wanted.add(o.media); });
  for (const id of wanted) {
    let name = names.get(id);
    if (name == null) {                                   // no manifest: "<id>@name"
      for (const k of z.keys()) if (k.startsWith(`media/${id}@`)) { name = k.slice(6); break; }
    }
    const data = name != null ? z.get(`media/${name}`) : null;
    if (!data) continue;
    const ext = imageKind(data);
    if (!ext) { out.skipped.spi++; continue; }
    out.media[id] = { name: String(name).replace(/^\d+@/, ''), ext, data };
  }
  out.images = out.images.filter((m) => out.media[m.media] || (out.skipped.spi++, false));
  return out;
}

module.exports = { readSdocx, unzip, LIMITS };
