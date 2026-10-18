/* Mental Board — qr.js
   A QR code, made here. Runs in main; pure, no Node APIs, no dependencies.

   Exists for one thing: the pairing address the phone scans (2.2, MAP.md
   §4w). The app has no runtime dependencies and is not getting one for a
   picture of a URL, so this is the smallest encoder that does the job
   honestly — byte mode, error correction level M, versions 1 to 6 (up to 106
   bytes, and a pairing URL is about 60). Everything is from ISO/IEC 18004;
   the placement and mask code follows the shape of Project Nayuki's
   reference encoder.

   encode(text) → { size, rows: ['1010…', …] } with '1' for a dark module and
   no quiet zone — whoever draws it adds the four-module margin. Throws on text
   longer than version 6 holds; a caller with a longer URL has a bug. */
'use strict';

// per version at level M: [ec codewords per block, blocks, data codewords per block]
const EC_M = { 1: [10, 1, 16], 2: [16, 1, 28], 3: [26, 1, 44], 4: [18, 2, 32], 5: [24, 2, 43], 6: [16, 4, 27] };
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

/* ---- GF(256), the field Reed-Solomon works in ---- */
const EXP = new Array(512), LOG = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function generator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
    g = ng;
  }
  return g;
}
function ecBytes(data, n) {
  const g = generator(n);
  const res = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) {
    const c = res[i];
    if (c) for (let j = 0; j < g.length; j++) res[i + j] ^= mul(g[j], c);
  }
  return res.slice(data.length);
}

/* ---- the codewords: header, data, padding, then error correction ---- */
function versionFor(len) {
  for (let v = 1; v <= 6; v++) {
    const [, blocks, per] = EC_M[v];
    if (len <= blocks * per - 2) return v;    // 4 bits of mode + 8 of length, rounded up
  }
  throw new Error('qr: text too long');
}
function codewords(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const v = versionFor(bytes.length);
  const [ec, blocks, per] = EC_M[v];
  const cap = blocks * per;
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const dataBlocks = [], ecBlocks = [];
  for (let b = 0; b < blocks; b++) {
    const d = data.slice(b * per, (b + 1) * per);
    dataBlocks.push(d); ecBlocks.push(ecBytes(d, ec));
  }
  // interleaved: the first byte of every block, then the second, …
  const out = [];
  for (let i = 0; i < per; i++) dataBlocks.forEach((d) => out.push(d[i]));
  for (let i = 0; i < ec; i++) ecBlocks.forEach((e) => out.push(e[i]));
  return { version: v, dataBlocks, ecBlocks, out };
}

/* ---- the symbol ---- */
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0
];

function blank(size) {
  return { size, mod: Array.from({ length: size }, () => new Array(size).fill(false)), fn: Array.from({ length: size }, () => new Array(size).fill(false)) };
}
function setFn(q, x, y, dark) { q.mod[y][x] = dark; q.fn[y][x] = true; }

function drawFunction(q, v) {
  const s = q.size;
  const finder = (cx, cy) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= s || y >= s) continue;
      const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
      const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
      setFn(q, x, y, dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6 && (ring || core));
    }
  };
  finder(0, 0); finder(s - 7, 0); finder(0, s - 7);
  for (let i = 8; i < s - 8; i++) { setFn(q, i, 6, i % 2 === 0); setFn(q, 6, i, i % 2 === 0); }
  const al = ALIGN[v];
  for (const cy of al) for (const cx of al) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === al[al.length - 1]) || (cx === al[al.length - 1] && cy === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(q, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(q, 0);            // reserves the format areas; redrawn with the real mask
}
function formatBits(mask) {
  const data = (0 << 3) | mask;              // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function drawFormat(q, mask) {
  const s = q.size, bits = formatBits(mask);
  const bit = (i) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(q, 8, i, bit(i));
  setFn(q, 8, 7, bit(6)); setFn(q, 8, 8, bit(7)); setFn(q, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(q, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(q, s - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(q, 8, s - 15 + i, bit(i));
  setFn(q, 8, s - 8, true);                  // the dark module, always there
}
function drawData(q, bytes) {
  const s = q.size;
  let i = 0;
  const total = bytes.length * 8;
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;              // the vertical timing line is skipped whole
    for (let vert = 0; vert < s; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? s - 1 - vert : vert;
        if (q.fn[y][x] || i >= total) continue;
        q.mod[y][x] = ((bytes[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
        i++;
      }
    }
  }
}
function applyMask(q, m) {
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    if (!q.fn[y][x] && MASKS[m](x, y)) q.mod[y][x] = !q.mod[y][x];
  }
}
/* The four penalty rules: long runs, 2×2 blocks, things that look like a
   finder, and an unbalanced dark/light ratio. The mask with the lowest
   score is the one a camera reads most easily. */
function penalty(q) {
  const s = q.size, M = q.mod;
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < s; a++) {
      let run = 1;
      for (let b = 1; b <= s; b++) {
        if (b < s && get(a, b) === get(a, b - 1)) { run++; continue; }
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
      for (let b = 0; b + 11 <= s; b++) {
        const w = []; for (let k = 0; k < 11; k++) w.push(get(a, b + k) ? 1 : 0);
        const str = w.join('');
        if (str === '10111010000' || str === '00001011101') p += 40;
      }
    }
  };
  line((a, b) => M[a][b]);
  line((a, b) => M[b][a]);
  for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
    const c = M[y][x];
    if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3;
  }
  let dark = 0;
  M.forEach((r) => r.forEach((c) => { if (c) dark++; }));
  const total = s * s;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

function encode(text) {
  const cw = codewords(text);
  const size = 17 + 4 * cw.version;
  let best = null, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    const q = blank(size);
    drawFunction(q, cw.version);
    drawData(q, cw.out);
    applyMask(q, m);
    drawFormat(q, m);
    const p = penalty(q);
    if (p < bestP) { bestP = p; best = q; best.mask = m; }
  }
  return { size, version: cw.version, mask: best.mask, rows: best.mod.map((r) => r.map((c) => (c ? '1' : '0')).join('')) };
}

// the parts tools/test-tablet.js reads the symbol back with
module.exports = { encode, codewords, formatBits, _test: { EXP, LOG, mul, blank, drawFunction, MASKS, EC_M } };
