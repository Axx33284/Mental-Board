/* Generates assets/icon.png and assets/icon.ico from scratch — no image
   dependencies, just Node's zlib. Run it with `npm run icon` after changing
   the artwork below; the packaged exe picks up the .ico, the window and
   taskbar pick up the .png.

   The drawing is done 4x oversampled and box-filtered down, which is where the
   anti-aliasing comes from. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SS = 4;                 // supersampling factor
const OUT = path.join(__dirname, '..', 'src', 'assets');

/* ---------- a tiny RGBA raster ---------- */
function surface(size) {
  return { w: size, h: size, px: new Float64Array(size * size * 4) };
}
function blend(s, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h || a <= 0) return;
  const i = (y * s.w + x) * 4;
  const ia = s.px[i + 3], na = a + ia * (1 - a);
  if (na <= 0) return;
  s.px[i]     = (r * a + s.px[i]     * ia * (1 - a)) / na;
  s.px[i + 1] = (g * a + s.px[i + 1] * ia * (1 - a)) / na;
  s.px[i + 2] = (b * a + s.px[i + 2] * ia * (1 - a)) / na;
  s.px[i + 3] = na;
}
// signed distance to a rounded rectangle, negative inside
function sdRoundRect(px, py, x, y, w, h, r) {
  const cx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const cy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const ax = Math.max(cx, 0), ay = Math.max(cy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(cx, cy), 0) - r;
}
function fillRoundRect(s, x, y, w, h, r, colorAt, alpha) {
  const x0 = Math.max(0, Math.floor(x - 2)), x1 = Math.min(s.w, Math.ceil(x + w + 2));
  const y0 = Math.max(0, Math.floor(y - 2)), y1 = Math.min(s.h, Math.ceil(y + h + 2));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const d = sdRoundRect(px + 0.5, py + 0.5, x, y, w, h, r);
      if (d > 0.9) continue;
      const cov = Math.min(1, Math.max(0, 0.5 - d));
      const c = colorAt(px, py);
      blend(s, px, py, c[0], c[1], c[2], cov * (alpha == null ? 1 : alpha));
    }
  }
}
function strokeRoundRect(s, x, y, w, h, r, width, color, alpha) {
  const x0 = Math.max(0, Math.floor(x - width - 2)), x1 = Math.min(s.w, Math.ceil(x + w + width + 2));
  const y0 = Math.max(0, Math.floor(y - width - 2)), y1 = Math.min(s.h, Math.ceil(y + h + width + 2));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const d = Math.abs(sdRoundRect(px + 0.5, py + 0.5, x, y, w, h, r)) - width / 2;
      if (d > 0.9) continue;
      blend(s, px, py, color[0], color[1], color[2], Math.min(1, Math.max(0, 0.5 - d)) * (alpha == null ? 1 : alpha));
    }
  }
}
function line(s, x1, y1, x2, y2, width, color, alpha) {
  const minx = Math.max(0, Math.floor(Math.min(x1, x2) - width - 2));
  const maxx = Math.min(s.w, Math.ceil(Math.max(x1, x2) + width + 2));
  const miny = Math.max(0, Math.floor(Math.min(y1, y2) - width - 2));
  const maxy = Math.min(s.h, Math.ceil(Math.max(y1, y2) + width + 2));
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
  for (let py = miny; py < maxy; py++) {
    for (let px = minx; px < maxx; px++) {
      const t = Math.max(0, Math.min(1, ((px + 0.5 - x1) * dx + (py + 0.5 - y1) * dy) / len2));
      const d = Math.hypot(px + 0.5 - (x1 + dx * t), py + 0.5 - (y1 + dy * t)) - width / 2;
      if (d > 0.9) continue;
      blend(s, px, py, color[0], color[1], color[2], Math.min(1, Math.max(0, 0.5 - d)) * (alpha == null ? 1 : alpha));
    }
  }
}

/* Like line(), but the colour comes from a function of position — used to cut
   the inside out of a stroked shape by painting the tile's own gradient back
   over it. That is how an *outlined* glyph is drawn with only fill and line
   primitives: lay the white shape down, then paint the interior in the
   background it is sitting on. */
function lineWith(s, x1, y1, x2, y2, width, colorAt, alpha) {
  const minx = Math.max(0, Math.floor(Math.min(x1, x2) - width - 2));
  const maxx = Math.min(s.w, Math.ceil(Math.max(x1, x2) + width + 2));
  const miny = Math.max(0, Math.floor(Math.min(y1, y2) - width - 2));
  const maxy = Math.min(s.h, Math.ceil(Math.max(y1, y2) + width + 2));
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
  for (let py = miny; py < maxy; py++) {
    for (let px = minx; px < maxx; px++) {
      const t = Math.max(0, Math.min(1, ((px + 0.5 - x1) * dx + (py + 0.5 - y1) * dy) / len2));
      const d = Math.hypot(px + 0.5 - (x1 + dx * t), py + 0.5 - (y1 + dy * t)) - width / 2;
      if (d > 0.9) continue;
      const c = colorAt(px, py);
      blend(s, px, py, c[0], c[1], c[2], Math.min(1, Math.max(0, 0.5 - d)) * (alpha == null ? 1 : alpha));
    }
  }
}
/* Fill a triangle. Used to take the corner off a card before the fold is drawn
   over it — the outline is a rounded rect, and a page fold is a rounded rect
   with one corner removed, so the corner has to go somewhere. */
function fillTri(s, a, b, c, colorAt, alpha) {
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) - 1));
  const x1 = Math.min(s.w, Math.ceil(Math.max(a[0], b[0], c[0]) + 1));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) - 1));
  const y1 = Math.min(s.h, Math.ceil(Math.max(a[1], b[1], c[1]) + 1));
  const side = (p, q, x, y) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const x = px + 0.5, y = py + 0.5;
      const d1 = side(a, b, x, y), d2 = side(b, c, x, y), d3 = side(c, a, x, y);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (neg && pos) continue;
      const col = colorAt(px, py);
      blend(s, px, py, col[0], col[1], col[2], alpha == null ? 1 : alpha);
    }
  }
}
function polyline(s, pts, width, color, alpha) {
  for (let i = 0; i < pts.length - 1; i++) {
    line(s, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], width, color, alpha);
  }
}

/* ---------- the artwork ----------
   Line-art, white on the indigo tile: connected note cards, a link chip and an
   image chip — the things a board actually holds, drawn as outlines rather
   than as filled blocks.

   Outlines, not fills, because the reference this was drawn from is a line
   icon — and because at 16px a filled card is a white blob while an outlined
   one still shows its own shape. White on the tile rather than black on white:
   a black outline is invisible against a dark taskbar, and the taskbar is the
   one place this icon is guaranteed to appear.

   Everything is a rounded rect, a line, or a rounded rect with the tile's own
   gradient painted back inside it. There is no path renderer here and there
   does not need to be. */
function draw(S) {
  const s = surface(S * SS);
  const u = (v) => v * S * SS / 256;          // design units: 256-pt grid

  const g1 = [0x5b, 0x74, 0xf0], g2 = [0x9a, 0x63, 0xf2];
  const grad = (px, py) => {
    const t = Math.min(1, Math.max(0, (px / s.w * 0.55 + py / s.h * 0.65)));
    return [g1[0] + (g2[0] - g1[0]) * t, g1[1] + (g2[1] - g1[1]) * t, g1[2] + (g2[2] - g1[2]) * t];
  };
  fillRoundRect(s, u(10), u(10), u(236), u(236), u(56), grad);

  const white = [255, 255, 255];
  /* One weight for the whole drawing. A line icon reads as one object only if
     every stroke in it is the same width — vary them and the thin parts drop
     out first as the icon shrinks, which is what makes a 16px icon look like a
     smudge with a few dark spots rather than a smaller version of itself. */
  const W = u(7.5);

  /* A note card: an outlined rounded rect with the corner turned down. The
     fold is the whole reason a rectangle reads as "a page" — without it this
     is a box, and a box is any object at all. */
  function card(x, y, w, h, rules) {
    const f = Math.min(w, h) * 0.42;                 // how much corner is turned
    strokeRoundRect(s, x, y, w, h, u(9), W, white, 1);
    /* Cut the bottom-right corner off, then draw the fold back in. Painting the
       tile's own gradient over the corner is the erase — there is no clipping
       here, only compositing, so "remove" means "paint what was underneath".
       The pad takes the cut past the rounded corner so no stub of the original
       outline is left hanging outside the diagonal. */
    /* The cut has to run *through* A and C, not parallel to them.

       Offset it outwards and a band of the original rounded corner survives, so
       the fold reads as a tab stuck on the card. Offset it inwards and the
       bottom and right edges are cut back short of the chamfer, so the fold
       floats free of the outline with a gap either side. Both of those were
       drawn before this comment was. Put P1 and P3 exactly on the A–C line and
       push them *along* it, past both ends, so the extension covers the rounded
       corner without moving the line itself. */
    const A = [x + w - f, y + h], C = [x + w, y + h - f], D = [x + w - f, y + h - f];
    const k = W * 1.6 * Math.SQRT1_2;                // step along the diagonal
    /* Outward by half a stroke, then along the diagonal past both ends.

       The half-stroke matters. A and C sit on the *centrelines* of the bottom
       and right edges, so a cut exactly through them takes the outer half of
       each edge with it — the edges end short, the chamfer's round caps stick
       out past them into open gradient, and the fold reads as a loose flap
       pinned to a broken outline. Offsetting the cut out by W/2 leaves both
       edges full width right up to where the chamfer lands on them. f is large
       enough that the rounded corner is still entirely inside the cut. */
    const n = (W / 2) * Math.SQRT1_2;
    fillTri(s,
      [A[0] + n - k, A[1] + n + k],
      [x + w + W, y + h + W],
      [C[0] + n + k, C[1] + n - k], grad, 1);
    line(s, A[0], A[1], C[0], C[1], W, white, 1);    // the chamfer
    line(s, A[0], A[1], D[0], D[1], W, white, 1);    // and the flap under it
    line(s, D[0], D[1], C[0], C[1], W, white, 1);
    // text ruling, so a card with room for it reads as a written note
    (rules || []).forEach(([ry, rw]) => {
      line(s, x + u(11), y + ry, x + u(11) + rw, y + ry, W * 0.78, white, 0.95);
    });
  }

  /* Connectors, drawn first so the cards sit on top and hide the joins. Right
     angles rather than curves: this is the diagram of a board, not the board,
     and an elbow says "these are joined" at a size where a curve is three grey
     pixels. */
  polyline(s, [[u(74), u(104)], [u(74), u(126)], [u(112), u(126)]], W, white, 1);
  polyline(s, [[u(176), u(126)], [u(196), u(126)], [u(196), u(112)]], W, white, 1);
  polyline(s, [[u(112), u(160)], [u(84), u(160)], [u(84), u(178)]], W, white, 1);
  polyline(s, [[u(150), u(164)], [u(150), u(184)], [u(168), u(184)]], W, white, 1);

  // top-left note, the centre note, and the small one bottom-left
  card(u(46), u(52), u(56), u(52));
  card(u(110), u(96), u(66), u(70), [[u(19), u(38)], [u(33), u(30)], [u(47), u(24)]]);
  card(u(48), u(172), u(48), u(46), [[u(15), u(22)]]);

  /* The link chip. A chain link is two capsules on a diagonal, and a capsule is
     a fat white line with a thinner gradient line painted back down the middle
     of it — an outline, drawn with the two primitives that exist. */
  strokeRoundRect(s, u(174), u(58), u(52), u(52), u(9), W, white, 1);
  const chain = (x1, y1, x2, y2) => {
    line(s, x1, y1, x2, y2, u(15), white, 1);
    lineWith(s, x1, y1, x2, y2, u(7), grad, 1);
  };
  chain(u(185), u(99), u(195), u(89));
  chain(u(205), u(79), u(215), u(69));
  line(s, u(193), u(91), u(207), u(77), W * 0.85, white, 1);   // the link between them

  /* The image chip: a frame with a horizon and a sun. Same two marks every
     image placeholder ever drawn uses, because they are the two that survive
     being shrunk to nothing. */
  strokeRoundRect(s, u(166), u(160), u(58), u(48), u(9), W, white, 1);
  polyline(s, [[u(172), u(200)], [u(190), u(180)], [u(202), u(192)], [u(210), u(184)], [u(218), u(192)]], W * 0.9, white, 1);
  fillRoundRect(s, u(203), u(168), u(9), u(9), u(4.5), () => white, 1);

  // a soft inner rim
  strokeRoundRect(s, u(10), u(10), u(236), u(236), u(56), u(3), white, 0.16);

  return downsample(s, S);
}
function downsample(s, S) {
  const out = surface(S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = ((y * SS + j) * s.w + (x * SS + i)) * 4;
          const pa = s.px[k + 3];
          r += s.px[k] * pa; g += s.px[k + 1] * pa; b += s.px[k + 2] * pa; a += pa;
        }
      }
      const n = SS * SS, o = (y * S + x) * 4;
      out.px[o]     = a ? r / a : 0;
      out.px[o + 1] = a ? g / a : 0;
      out.px[o + 2] = a ? b / a : 0;
      out.px[o + 3] = a / n;
    }
  }
  return out;
}
function toRGBA(s) {
  const buf = Buffer.alloc(s.w * s.h * 4);
  for (let i = 0; i < s.w * s.h; i++) {
    buf[i * 4]     = Math.round(Math.min(255, Math.max(0, s.px[i * 4])));
    buf[i * 4 + 1] = Math.round(Math.min(255, Math.max(0, s.px[i * 4 + 1])));
    buf[i * 4 + 2] = Math.round(Math.min(255, Math.max(0, s.px[i * 4 + 2])));
    buf[i * 4 + 3] = Math.round(Math.min(255, Math.max(0, s.px[i * 4 + 3] * 255)));
  }
  return buf;
}

/* ---------- PNG ---------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;               // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- ICO ----------
   Small sizes go in as classic 32-bit DIBs (widest compatibility with the
   shell and with rcedit); 128 and 256 go in as PNG, which is the modern form
   and keeps the file small. */
function dibEntry(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);        // height doubled: colour + mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const rowBytes = size * 4;
  const colour = Buffer.alloc(rowBytes * size);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * rowBytes;   // DIBs are bottom-up
    for (let x = 0; x < size; x++) {
      colour[y * rowBytes + x * 4]     = rgba[src + x * 4 + 2];  // B
      colour[y * rowBytes + x * 4 + 1] = rgba[src + x * 4 + 1];  // G
      colour[y * rowBytes + x * 4 + 2] = rgba[src + x * 4];      // R
      colour[y * rowBytes + x * 4 + 3] = rgba[src + x * 4 + 3];  // A
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRow * size);  // all zero = fully opaque mask
  return Buffer.concat([header, colour, mask]);
}
function ico(images) {
  const dir = Buffer.alloc(6 + 16 * images.length);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(images.length, 4);
  let offset = dir.length;
  const blobs = [];
  images.forEach((img, i) => {
    const o = 6 + i * 16;
    dir[o] = img.size >= 256 ? 0 : img.size;
    dir[o + 1] = img.size >= 256 ? 0 : img.size;
    dir[o + 2] = 0; dir[o + 3] = 0;
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(img.data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += img.data.length;
    blobs.push(img.data);
  });
  return Buffer.concat([dir, ...blobs]);
}

/* ---------- go ---------- */
fs.mkdirSync(OUT, { recursive: true });

const big = draw(256);
fs.writeFileSync(path.join(OUT, 'icon.png'), png(toRGBA(big), 256, 256));

const entries = [16, 24, 32, 48, 64, 128, 256].map((size) => {
  const rgba = toRGBA(draw(size));
  return { size, data: size >= 128 ? png(rgba, size, size) : dibEntry(rgba, size) };
});
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(entries));

console.log('wrote assets/icon.png (256) and assets/icon.ico (' + entries.map((e) => e.size).join(', ') + ')');
