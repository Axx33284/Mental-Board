/* Generates assets/icon.png and assets/icon.ico from tools/icon-source.png —
   no image dependencies, just Node's zlib. Run it with `npm run icon` after
   changing the source artwork; the packaged exe picks up the .ico, the window
   and the taskbar pick up the .png.

   The artwork used to be *drawn* here, out of rounded rects and lines: white
   line-art on an indigo tile. It is now a picture. `icon-source.png` beside
   this script is the single source of truth and this file only recolours and
   resizes it, so changing the icon means replacing that one file and re-running
   this. The old rasteriser went with the change; it is in git history if drawn
   artwork is ever wanted back.

   **Black on white.** The source is composited onto white, converted to
   luminance, and stretched so its darkest ink lands on true black. Greyscale
   rather than a flat black/white threshold on purpose: artwork carrying more
   than one tone would otherwise collapse to a silhouette and lose every
   internal line.

   The artwork is a brain drawn in outline: two hemispheres of thick stroked
   line either side of a central fissure, black on white. It is not taken from
   the icon set, because the set has no brain in it — `psychology` and
   `psychology_alt` are both *heads*, one with a cog and one with a question
   mark, and neither reads as the thing this app is named after.

   One consequence worth knowing, because it reverses the older design's
   reasoning: an opaque white background is a white square on a dark taskbar.
   The icon before last was white-on-indigo precisely so its outline never
   vanished against dark chrome. White is what was asked for; if it ever looks
   wrong there, this comment is the place to start.

   The source is 768 square, and that number is load-bearing: every size below
   divides it exactly (768/16, /24, /32, /48, /64, /128, /256 are all whole),
   so each rung is an even box average rather than one whose window wobbles
   between two widths across the row.

   At 16px the inner folds soften into grey but the outer stroke and the
   central fissure survive, so it still reads as a brain rather than a disc.
   That is the size to check first after replacing the artwork: line-art thins
   out as it shrinks, and artwork with a finer stroke than this will vanish
   there long before it looks wrong at 256. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'src', 'assets');
const SRC = path.join(__dirname, 'icon-source.png');

/* ---------- reading the source ----------
   An 8-bit, non-interlaced PNG — what every ordinary export produces. Anything
   else throws with a message that says what to do about it, rather than a stack
   trace from somewhere inside zlib. Palette, greyscale, RGB and RGBA all
   decode; 16-bit and interlaced do not, and say so. */
function readPng(buf) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error('not a PNG file');
  let p = 8, ihdr = null, plte = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') plte = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR chunk');
  if (ihdr.depth !== 8) throw new Error('only 8-bit PNGs are supported (this one is ' + ihdr.depth + '-bit) — re-export it as 8-bit');
  if (ihdr.interlace !== 0) throw new Error('interlaced PNGs are not supported — re-export it without interlacing');
  const CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  if (!CH) throw new Error('unsupported PNG colour type ' + ihdr.color);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const w = ihdr.w, h = ihdr.h, stride = w * CH;
  const out = Buffer.alloc(h * stride);
  let off = 0;
  /* Undo the per-scanline filters. Each line names its own filter and is
     predicted from the pixel to its left and the line above it, so this has to
     run in order — there is no shortcut past it. */
  for (let y = 0; y < h; y++) {
    const ft = raw[off++];
    const line = raw.subarray(off, off + stride); off += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= CH ? cur[x - CH] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= CH) ? prev[x - CH] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
  }

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ihdr.color === 0) { r = g = b = out[i]; }
    else if (ihdr.color === 2) { r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; }
    else if (ihdr.color === 3) {
      const ix = out[i];
      r = plte[ix * 3]; g = plte[ix * 3 + 1]; b = plte[ix * 3 + 2];
      if (trns && ix < trns.length) a = trns[ix];
    } else if (ihdr.color === 4) { r = g = b = out[i * 2]; a = out[i * 2 + 1]; }
    else { r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { w, h, rgba };
}

/* ---------- black on white ----------
   Composite over white first, so a transparent background becomes white rather
   than black. Then luminance, then a stretch that puts the darkest pixel in the
   picture at 0 — which is what makes this independent of how dark the source
   blue happens to be, and what stops navy line-art coming out muddy grey. */
function toBlackOnWhite(img) {
  const n = img.w * img.h;
  const lum = new Float64Array(n);
  let lo = 1;
  for (let i = 0; i < n; i++) {
    const a = img.rgba[i * 4 + 3] / 255;
    const r = (img.rgba[i * 4]     * a + 255 * (1 - a)) / 255;
    const g = (img.rgba[i * 4 + 1] * a + 255 * (1 - a)) / 255;
    const b = (img.rgba[i * 4 + 2] * a + 255 * (1 - a)) / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = L;
    if (L < lo) lo = L;
  }
  const span = 1 - lo;
  const grey = new Float64Array(n);
  for (let i = 0; i < n; i++) grey[i] = span > 0.001 ? (lum[i] - lo) / span : lum[i];
  return { w: img.w, h: img.h, grey };
}

/* ---------- resizing ----------
   A box average over exactly the source pixels each target pixel covers. For
   512 -> 256 that is a 2x2; for 512 -> 16 it is 32x32, which is the whole
   reason the small sizes stay readable instead of aliasing into speckle. The
   result is opaque — alpha 255 everywhere, white wherever there is no ink. */
function resample(src, size) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * src.h / size);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * src.h / size));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * src.w / size);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * src.w / size));
      let sum = 0, count = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) { sum += src.grey[sy * src.w + sx]; count++; }
      }
      const v = Math.round(Math.min(1, Math.max(0, sum / count)) * 255);
      const o = (y * size + x) * 4;
      out[o] = v; out[o + 1] = v; out[o + 2] = v; out[o + 3] = 255;
    }
  }
  return out;
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
if (!fs.existsSync(SRC)) {
  console.error('missing ' + path.relative(path.join(__dirname, '..'), SRC) + '\n' +
                'Put the icon artwork there as an 8-bit PNG and run `npm run icon` again.');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const source = toBlackOnWhite(readPng(fs.readFileSync(SRC)));
fs.writeFileSync(path.join(OUT, 'icon.png'), png(resample(source, 256), 256, 256));

const entries = [16, 24, 32, 48, 64, 128, 256].map((size) => {
  const rgba = resample(source, size);
  return { size, data: size >= 128 ? png(rgba, size, size) : dibEntry(rgba, size) };
});
fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(entries));

console.log('wrote assets/icon.png (256) and assets/icon.ico (' + entries.map((e) => e.size).join(', ') +
            ') from ' + source.w + 'x' + source.h + ' ' + path.basename(SRC));
