/* Handwrite it (3.0) — a picture in a drawing note, written out by hand.

   Right-click a picture in a drawing note ▸ Handwrite it (or a picture on the
   board ▸ Handwrite it, which first makes it a drawing note). The picture is
   replaced by ink, written stroke by stroke:

   1. **The words are read** by Windows' own OCR (main.js `ocr:read`), with
      every recognizer Windows has unless Settings ▸ Drawing names one, and the
      reading that looks most like words wins (`hwBestReading`).
   2. **The background goes.** It is the colour of the picture's border
      (`hwBackground`, the median of every edge pixel); whatever is far enough
      from it is ink, and that is all that is kept.
   3. **What is left is sorted by colour** (`hwClusters`, k-means on the
      strong pixels) and each colour's shapes are measured: thin ones — lines,
      outlines, arrows, a scribble — are **drawn**: thinned to their middle
      (`hwThin`, Zhang–Suen), traced into lines (`hwTrace`), smoothed, and
      given the width and the colour they had. Thick ones — a filled area, a
      photograph — cannot be drawn with a pen, so they **stay** as a picture
      with the background cut away (`hwCutout`), unless Settings says to leave
      them out.
   4. **Each word is written in a hand** (`hwWordStrokes`): set in a
      handwriting face that ships with Windows (Ink Free, Segoe Print, Segoe
      Script; Sakkal Majalla for Arabic), thinned and traced the same way, and
      placed exactly where the word was, as big as it was, as heavy as it was
      (a bold word gets a heavier pen), in its colour — black or white text
      becomes the paper's ink, so it stays readable on either paper.
   5. **It is written out** (`hwWriteOut`): everything is in the drawing — and
      saved — at once, as one undo step; what you watch is each line being
      uncovered along its own length, in reading order.

   Every pixel pass works on the picture at HW_WORK pixels along its long
   side, up or down, so the thresholds below are in those pixels. */
const HW_HANDS = ['ink', 'print', 'script'];
const HW_FACES = { ink: '"Ink Free", "Segoe Print", cursive', print: '"Segoe Print", "Ink Free", cursive', script: '"Segoe Script", "Segoe Print", cursive' };
const HW_ARABIC = '"Sakkal Majalla", "Arabic Typesetting", "Traditional Arabic", "Segoe UI", sans-serif';
const HW_WORK = 1600;          // the long side the picture is read at
const HW_FG = 24;              // how far from the background a pixel must be to be ink (a pastel fill is ~30)
const HW_GLYPH_PX = 80;        // the size a word is set at before it is traced
const hw = { busy: false, anim: 0 };

/* ---- the entry points ---- */
async function handwriteSketchPic(p) {
  if (!sk || !p || !p.url) return;
  if (hw.busy) return;
  hw.busy = true;
  hwBusy(t('hw.reading'));
  try {
    const img = new Image();
    img.src = await toDataUrl(p.url);
    await img.decode();
    const W0 = img.naturalWidth, H0 = img.naturalHeight;
    const sc = Math.min(4, HW_WORK / Math.max(W0, H0));
    const W = Math.max(8, Math.round(W0 * sc)), H = Math.max(8, Math.round(H0 * sc));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    // the words first; a machine with no OCR still gets its lines drawn
    const reading = await hwRead(cv);
    hwBusy(t('hw.drawing'));
    await hwFrame();
    const data = g.getImageData(0, 0, W, H);
    const A = hwAnalyse(data, W, H, reading ? reading.lines : []);
    await hwFrame();
    const u = p.w / W;                          // drawing units per working pixel
    const at = (x, y) => [r1(p.x + x * u), r1(p.y + y * u)];
    const written = [];
    // the words, in reading order
    for (const ln of A.lines) {
      for (const wd of ln.words) written.push(...hwWordStrokes(wd, ln, u, at));
      await hwFrame();
    }
    // the shapes, top to bottom
    const drawn = A.paths.sort((a, b) => a.y - b.y || a.x - b.x).map((q) => {
      const pts = [];
      for (let i = 0; i < q.pts.length; i += 2) pts.push(...at(q.pts[i], q.pts[i + 1]));
      return { id: uid(), tool: 'pen', color: q.color, size: Math.max(0.2, r1(q.w * u * 100) / 100), pts };
    }).filter((s) => s.pts.length >= 4);
    // what cannot be drawn stays, without its background
    let cut = null;
    if (state.settings.hwKeep && A.cut) {
      const name = (p.name || 'picture').replace(/\.[a-z0-9]+$/i, '') + ' (kept).png';
      const url = await keepSketchPicture(A.cut.canvas.toDataURL('image/png'), name);
      cut = { x: r1(p.x + A.cut.x * u), y: r1(p.y + A.cut.y * u), w: r1(A.cut.w * u), h: r1(A.cut.h * u), url, name };
    }
    if (!sk) return;                             // closed while it was read
    let strokes = written.concat(drawn);
    const room = SKETCH_MAX - sk.strokes.length;
    if (strokes.length > room) { strokes = strokes.slice(0, Math.max(0, room)); hwNote(t('sketch.full')); }
    if (!strokes.length && !cut) { hwNote(t('hw.nothing')); return; }
    sketchStep();
    const i = sk.pics.indexOf(p);
    sk.pics = sk.pics.filter((q) => q !== p);
    if (cut) sk.pics.splice(Math.max(0, i), 0, cut);
    sk.strokes = sk.strokes.concat(strokes);
    sk.sel.clear();
    drawSketchStrokes();
    sketchSelChanged();
    if (reading && reading.error) hwNote(t('hw.noWords'));
    hwBusy('');
    if (state.settings.hwAnimate) await hwWriteOut(strokes.map((s) => s.id), cut);
  } catch (err) {
    console.warn('handwrite: could not do it', err);
    hwNote(t('hw.failed'));
  } finally {
    hw.busy = false;
    hwBusy('');
  }
}
// a picture on the board: it becomes a drawing note (pictureToSketch), and then it is written out
async function handwritePictureNote(id) {
  pictureToSketch(id);
  await hwFrame(); await hwFrame();
  if (sk && sk.n.id === id && sk.pics.length) handwriteSketchPic(sk.pics[0]);
}

/* ---- what the editor shows meanwhile ---- */
function hwBusy(msg) {
  const el = $('skBusy');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}
// a line that shows inside the editor, which a toast cannot be when it is full screen
function hwNote(msg) {
  const el = $('skNote');
  if (!el) { toast(msg); return; }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(hwNote.timer);
  hwNote.timer = setTimeout(() => el.classList.add('hidden'), 4200);
}
const hwFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/* ---- 1. the words ---- */
async function hwRead(cv) {
  if (!FILES || !FILES.ocr) return { error: 'no-ocr', lines: [] };
  const lang = state.settings.hwLang === 'auto' ? '' : state.settings.hwLang;
  let res;
  try { res = await FILES.ocr(cv.toDataURL('image/png'), lang); } catch (e) { res = { error: String(e) }; }
  if (!res || res.error || !Array.isArray(res.results) || !res.results.length) return { error: (res && res.error) || 'no-ocr', lines: [] };
  return hwBestReading(res.results, res.profile);
}
/* Several recognizers read the same picture; the one that read the most
   letters and the least junk is the one that knew the language. A tie goes to
   the language Windows is set up in. */
function hwBestReading(results, profile) {
  let best = null, bestScore = -Infinity;
  for (const r of results) {
    const lines = Array.isArray(r.lines) ? r.lines : [];
    let score = 0;
    for (const ln of lines) for (const w of ln.words || []) {
      const s = String(w.t || '');
      score += (s.match(/[\p{L}\p{N}]/gu) || []).length;
      score -= 4 * (s.match(/[#|~{}\[\]<>@^_\\¦§¤]/g) || []).length;
    }
    if (r.lang === profile) score += 0.5;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return best ? { lang: best.lang, lines: (best.lines || []).filter((l) => l && Array.isArray(l.words) && l.words.length) } : { error: 'no-ocr', lines: [] };
}

/* ---- 2–3. the background, the colours, the shapes ---- */
function hwAnalyse(img, W, H, ocrLines) {
  const px = img.data, N = W * H;
  const bg = hwBackground(px, W, H);
  // how far each pixel is from the background (0–255); transparent is background
  const dist = new Uint8Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    if (px[j + 3] < 110) { dist[i] = 0; continue; }
    const dr = px[j] - bg[0], dg = px[j + 1] - bg[1], db = px[j + 2] - bg[2];
    dist[i] = Math.min(255, Math.sqrt(dr * dr + dg * dg + db * db) | 0);
  }
  // the words: where they are, so their pixels are written and not drawn
  const lines = [];
  const textMask = new Uint8Array(N);
  for (const ln of ocrLines) {
    const words = [];
    for (const w of ln.words) {
      const b = { x: +w.x || 0, y: +w.y || 0, w: +w.w || 0, h: +w.h || 0 };
      if (b.w < 2 || b.h < 2 || !String(w.t || '').trim()) continue;
      // a little room round the box catches the dots and the cedillas OCR leaves outside it
      const x0 = clamp(Math.floor(b.x - 2), 0, W - 1), x1 = clamp(Math.ceil(b.x + b.w + 2), 0, W - 1);
      const y0 = clamp(Math.floor(b.y - b.h * 0.18), 0, H - 1), y1 = clamp(Math.ceil(b.y + b.h + b.h * 0.12), 0, H - 1);
      const ink = hwWordInk(px, dist, W, x0, y0, x1, y1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (dist[y * W + x] > HW_FG) textMask[y * W + x] = 1;
      words.push({ t: String(w.t), box: b, color: ink.color, stroke: ink.stroke });
    }
    if (!words.length) continue;
    const rtl = words.some((w) => /[\u0590-\u08FF]/.test(w.t));
    words.sort((a, b) => (rtl ? b.box.x - a.box.x : a.box.x - b.box.x));
    lines.push({ words, rtl, y: Math.min(...words.map((w) => w.box.y)), h: hwMedian(words.map((w) => w.box.h)) });
  }
  lines.sort((a, b) => a.y - b.y);
  // the colours of what is left
  const centres = hwClusters(px, dist, textMask, N, W);
  const label = new Uint8Array(N);              // 0 background, 1+k the colour it is nearest
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    if (dist[i] <= HW_FG || textMask[i]) continue;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < centres.length; k++) {
      const c = centres[k], dr = px[j] - c[0], dg = px[j + 1] - c[1], db = px[j + 2] - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = k; }
    }
    label[i] = bi + 1;
  }
  // a tint or a soft edge lies on the way from the paper to the colour it belongs to
  const between = (i, c) => {
    const j = i * 4, vx = c[0] - bg[0], vy = c[1] - bg[1], vz = c[2] - bg[2];
    const L = vx * vx + vy * vy + vz * vz || 1;
    const a = clamp(((px[j] - bg[0]) * vx + (px[j + 1] - bg[1]) * vy + (px[j + 2] - bg[2]) * vz) / L, 0, 1);
    return Math.hypot(px[j] - bg[0] - a * vx, px[j + 1] - bg[1] - a * vy, px[j + 2] - bg[2] - a * vz) < 22;
  };
  const thin = Math.max(3, Math.max(W, H) * 0.0065);   // thicker than this (half-width) is a fill, not a line
  const paths = [];
  const fill = new Uint8Array(N);
  for (let k = 0; k < centres.length; k++) {
    const m = new Uint8Array(N);
    let any = 0;
    for (let i = 0; i < N; i++) if (label[i] === k + 1) { m[i] = 1; any++; }
    if (any < 6) continue;
    const comp = hwComponents(m, W, H);
    /* A shape's area over its edge is half its width when it is a line (w·L
       over 2L) and a quarter of its width when it is a disc — so this one
       number says line or fill without thinning anything first. Thinning a
       filled area or a photograph would take a pass per pixel of its depth. */
    const edge = new Float64Array(comp.count + 1);
    for (let i = 0; i < N; i++) {
      if (!m[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W]) edge[comp.id[i]]++;
    }
    for (let i = 0; i < N; i++) if (m[i] && comp.area[comp.id[i]] / Math.max(1, edge[comp.id[i]]) > thin) fill[i] = 1;
  }
  /* The colours have said what is a fill. Everything else is drawn — as one
     mask, whatever its colours: a line and its soft edge, or an outline and
     the paler inside of a wall, are one stroke to a hand, and thinned
     colour by colour they came out as two lines side by side. Each line then
     takes the colour that runs down its middle. */
  const ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (dist[i] > HW_FG && !textMask[i] && !fill[i]) ink[i] = 1;
  /* …except where two different colours meet: a purple base on a brown
     shelf is two lines. Neither may be a tint or an edge of the other — a
     paler inside of a wall, or the grey rim of a black line, is the same
     line — and the lighter of the two pixels is taken out, so the thinning
     finds two lines where they touch. */
  /* "Different" is a different hue, or a grey or black against a strong
     colour: a darker and a paler purple are one line however far apart they
     are, and so are a black and its grey edge. */
  const apart = centres.map((a) => centres.map((b) => {
    const A = hwHue(a), B = hwHue(b);
    if (A.c > 18 && B.c > 18) { const d = Math.abs(A.h - B.h); return Math.min(d, 360 - d) > 40; }
    return (A.c < 14 && B.c > 28 || B.c < 14 && A.c > 28) && Math.abs(A.l - B.l) > 60;
  }));
  const sure = (i) => {
    const c = centres[label[i] - 1], j = i * 4;
    return (px[j] - c[0]) ** 2 + (px[j + 1] - c[1]) ** 2 + (px[j + 2] - c[2]) ** 2 < 18 * 18;
  };
  const cut = [];
  for (let i = 0; i < N - W - 1; i++) {
    if (!ink[i]) continue;
    for (const j of [i + 1, i + W]) {
      if (!ink[j] || label[j] === label[i] || !label[i] || !label[j]) continue;
      if (!apart[label[i] - 1][label[j] - 1]) continue;
      // only between pixels that are clearly their colours: a pixel between two colours proves nothing
      if (!sure(i) || !sure(j)) continue;
      if (between(i, centres[label[j] - 1]) || between(j, centres[label[i] - 1])) continue;
      cut.push(dist[i] < dist[j] ? i : j);
    }
  }
  for (const i of cut) ink[i] = 0;
  const comp = hwComponents(ink, W, H);
  for (let i = 0; i < N; i++) if (ink[i] && comp.area[comp.id[i]] < 5) ink[i] = 0;     // specks
  const dt = hwDistance(ink, W, H);
  hwThin(ink, W, H);
  for (const pl of hwTrace(ink, W, H)) {
    let sum = 0, n = 0, x0 = Infinity, y0 = Infinity;
    const rs = [], gs = [], bs = [];
    for (let i = 0; i < pl.length; i += 2) {
      const at = (pl[i + 1] | 0) * W + (pl[i] | 0);
      sum += dt[at]; n++;
      rs.push(px[at * 4]); gs.push(px[at * 4 + 1]); bs.push(px[at * 4 + 2]);
      if (pl[i] < x0) x0 = pl[i];
      if (pl[i + 1] < y0) y0 = pl[i + 1];
    }
    const pts = hwSimplify(hwSmooth(pl), 0.6);
    const c = [hwMedian(rs), hwMedian(gs), hwMedian(bs)];
    // twice the depth of the middle, less the soft edge the mask took in with the line
    paths.push({ pts, w: Math.max(1.2, (sum / Math.max(1, n)) * 2 - 1.5), color: hwInkColor(c), x: x0, y: y0 });
  }
  return { bg, lines, paths, cut: hwCutout(px, dist, fill, W, H) };
}
// the background: the median colour of the picture's edge
function hwBackground(px, W, H) {
  const r = [], g = [], b = [];
  let clear = 0, n = 0;
  const take = (x, y) => {
    const j = (y * W + x) * 4;
    n++;
    if (px[j + 3] < 110) { clear++; return; }
    r.push(px[j]); g.push(px[j + 1]); b.push(px[j + 2]);
  };
  for (let x = 0; x < W; x++) { take(x, 0); take(x, H - 1); }
  for (let y = 1; y < H - 1; y++) { take(0, y); take(W - 1, y); }
  if (clear > n / 2 || !r.length) return [255, 255, 255, 0];      // a cut-out already: transparency is the background
  return [hwMedian(r), hwMedian(g), hwMedian(b), 255];
}
// a word's colour (its darkest third, from the background) and the width of its strokes
function hwWordInk(px, dist, W, x0, y0, x1, y1) {
  const pix = [];
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const body = new Uint8Array(bw * bh);          // the letters' body, not their soft edge
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (dist[i] > HW_FG) pix.push(i);
    if (dist[i] > 110) body[(y - y0) * bw + (x - x0)] = 1;
  }
  pix.sort((a, b) => dist[b] - dist[a]);
  const top = pix.slice(0, Math.max(1, Math.ceil(pix.length / 3)));
  const c = [0, 1, 2].map((ch) => hwMedian(top.map((i) => px[i * 4 + ch])));
  /* How heavy the letters are: the width of their strokes (the deepest tenth
     of the body's distance to its edge, twice over). Over the line's height
     (hwWordStrokes), a regular face is about a tenth, a bold one a sixth. */
  const dt = hwDistance(body, bw, bh);
  const depth = [];
  for (let i = 0; i < body.length; i++) if (body[i]) depth.push(dt[i]);
  depth.sort((a, b) => b - a);
  const stroke = depth.length ? 2 * depth[Math.floor(depth.length * 0.1)] : 0;
  return { color: c, stroke };
}
/* Up to seven colours, chosen from "flat" pixels — ones with at least two
   neighbours of nearly their own colour. The soft edge of a line is a blend
   of the line and the paper, a shade that changes from pixel to pixel, and
   chosen from those every edge would become a colour of its own; a pale fill
   and the middle of a line are flat. Colours closer than ~36 are one. */
function hwClusters(px, dist, skip, N, W) {
  const sample = [];
  const step = Math.max(1, Math.floor(N / 60000));
  const near = (i, j) => j >= 0 && j < N && Math.abs(px[i * 4] - px[j * 4]) + Math.abs(px[i * 4 + 1] - px[j * 4 + 1]) + Math.abs(px[i * 4 + 2] - px[j * 4 + 2]) < 24;
  for (let i = 0; i < N; i += step) {
    if (dist[i] <= HW_FG || skip[i]) continue;
    if (near(i, i - 1) + near(i, i + 1) + near(i, i - W) + near(i, i + W) < 2) continue;
    sample.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
  }
  if (!sample.length) {
    for (let i = 0; i < N; i += step) if (dist[i] > HW_FG && !skip[i]) sample.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
    if (!sample.length) return [];
  }
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  // k-means++ start, then a few rounds
  const K = Math.min(7, sample.length);
  const c = [sample[(Math.random() * sample.length) | 0].slice()];
  while (c.length < K) {
    let far = sample[0], fd = -1;
    for (const s of sample) { let m = Infinity; for (const q of c) m = Math.min(m, d2(s, q)); if (m > fd) { fd = m; far = s; } }
    if (fd < 30 * 30) break;
    c.push(far.slice());
  }
  for (let it = 0; it < 8; it++) {
    const acc = c.map(() => [0, 0, 0, 0]);
    for (const s of sample) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < c.length; k++) { const d = d2(s, c[k]); if (d < bd) { bd = d; bi = k; } }
      const a = acc[bi]; a[0] += s[0]; a[1] += s[1]; a[2] += s[2]; a[3]++;
    }
    acc.forEach((a, k) => { if (a[3]) c[k] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
  }
  const out = [];
  for (const q of c) if (!out.some((o) => d2(o, q) < 36 * 36)) out.push(q.map((v) => Math.round(v)));
  return out;
}
// a city-block-ish distance to the nearest background pixel (chamfer 3-4, in pixels)
function hwDistance(m, W, H) {
  const N = W * H, d = new Float32Array(N);
  const BIG = 1e6;
  for (let i = 0; i < N; i++) d[i] = m[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) {
      v = Math.min(v, d[i - W] + 3);
      if (x > 0) v = Math.min(v, d[i - W - 1] + 4);
      if (x < W - 1) v = Math.min(v, d[i - W + 1] + 4);
    } else v = Math.min(v, 3);
    if (x === 0 || x === W - 1 || y === H - 1) v = Math.min(v, 3);
    d[i] = v;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    if (!d[i]) continue;
    let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < H - 1) {
      v = Math.min(v, d[i + W] + 3);
      if (x < W - 1) v = Math.min(v, d[i + W + 1] + 4);
      if (x > 0) v = Math.min(v, d[i + W - 1] + 4);
    }
    d[i] = v;
  }
  for (let i = 0; i < N; i++) d[i] /= 3;
  return d;
}
// 8-connected pieces: an id per pixel, and each piece's size
function hwComponents(m, W, H) {
  const N = W * H, id = new Int32Array(N), area = [0];
  const q = new Int32Array(N);
  let count = 0;
  for (let s = 0; s < N; s++) {
    if (!m[s] || id[s]) continue;
    count++;
    let head = 0, tail = 0, a = 0;
    q[tail++] = s; id[s] = count;
    while (head < tail) {
      const i = q[head++]; a++;
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (m[j] && !id[j]) { id[j] = count; q[tail++] = j; }
      }
    }
    area.push(a);
  }
  return { id, area, count };
}
/* Zhang–Suen thinning, in place: a shape becomes the one-pixel line down its
   middle. Then the corners of the staircases it leaves are taken out, so a
   diagonal is one pixel per step and not two (a corner pixel would read as a
   fork to hwTrace). The edge row and column are cleared first — every
   neighbour lookup below can then go without a bounds check. */
function hwThin(m, W, H) {
  for (let x = 0; x < W; x++) { m[x] = 0; m[(H - 1) * W + x] = 0; }
  for (let y = 0; y < H; y++) { m[y * W] = 0; m[y * W + W - 1] = 0; }
  let pts = [];
  for (let i = 0; i < W * H; i++) if (m[i]) pts.push(i);
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del = [];
      for (const i of pts) {
        if (!m[i]) continue;
        const p2 = m[i - W], p3 = m[i - W + 1], p4 = m[i + 1], p5 = m[i + W + 1];
        const p6 = m[i + W], p7 = m[i + W - 1], p8 = m[i - 1], p9 = m[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
        if (A !== 1) continue;
        if (step === 0 ? (p2 && p4 && p6) || (p4 && p6 && p8) : (p2 && p4 && p8) || (p2 && p6 && p8)) continue;
        del.push(i);
      }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
    pts = pts.filter((i) => m[i]);
  }
  for (const i of pts) {
    const n = m[i - W], e = m[i + 1], s = m[i + W], w = m[i - 1];
    const ne = m[i - W + 1], se = m[i + W + 1], sw = m[i + W - 1], nw = m[i - W - 1];
    if ((n && e && !s && !w && !sw) || (e && s && !n && !w && !nw) || (s && w && !n && !e && !ne) || (w && n && !s && !e && !se)) m[i] = 0;
  }
}
/* A one-pixel skeleton → lines. Where a line ends or forks is a node; every
   run between two nodes is one line, and a loop with no node is one line that
   comes back to its start. Returns flat [x0, y0, x1, y1, …] in pixels. */
function hwTrace(m, W, H) {
  const N8 = [-W, 1, W, -1, -W + 1, W + 1, W - 1, -W - 1];        // the four sides first: a walk prefers them
  const deg = (i) => { let k = 0; for (const d of N8) k += m[i + d]; return k; };
  const seen = new Uint8Array(W * H);
  const out = [];
  const pairs = new Set();
  const xy = (i, arr) => arr.push(i % W, (i / W) | 0);
  const walk = (a, b) => {
    const pts = []; xy(a, pts);
    let prev = a, cur = b;
    for (let guard = 0; guard < 200000; guard++) {
      xy(cur, pts);
      if (cur === a) break;                     // round a loop
      if (deg(cur) !== 2) break;                // to a node
      seen[cur] = 1;
      let next = -1;
      for (const d of N8) {
        const j = cur + d;
        if (!m[j] || j === prev || (seen[j] && j !== a)) continue;
        next = j; break;
      }
      if (next < 0) break;
      prev = cur; cur = next;
    }
    return pts;
  };
  for (let i = 0; i < W * H; i++) {
    if (!m[i]) continue;
    const k = deg(i);
    if (k === 2) continue;
    if (k === 0) { out.push([i % W, (i / W) | 0, (i % W) + 0.5, (i / W) | 0]); continue; }   // a dot
    for (const d of N8) {
      const j = i + d;
      if (!m[j] || seen[j]) continue;
      if (deg(j) !== 2) {                       // node beside node: one short line, once
        const key = i < j ? i + ',' + j : j + ',' + i;
        if (pairs.has(key)) continue;
        pairs.add(key);
      }
      const pl = walk(i, j);
      if (pl.length >= 4) out.push(pl);
    }
  }
  // loops: nothing on them is a node
  for (let i = 0; i < W * H; i++) {
    if (!m[i] || seen[i] || deg(i) !== 2) continue;
    seen[i] = 1;
    let j = -1;
    for (const d of N8) if (m[i + d]) { j = i + d; break; }
    if (j >= 0) { const pl = walk(i, j); if (pl.length >= 6) out.push(pl); }
  }
  return out;
}
// a moving average along the line, keeping its ends — the pixel steps become a curve
function hwSmooth(pl) {
  let p = pl;
  for (let pass = 0; pass < 2; pass++) {
    if (p.length < 8) return p;
    const q = p.slice();
    for (let i = 2; i < p.length - 2; i += 2) {
      q[i] = (p[i - 2] + p[i] * 2 + p[i + 2]) / 4;
      q[i + 1] = (p[i - 1] + p[i + 1] * 2 + p[i + 3]) / 4;
    }
    p = q;
  }
  return p;
}
// Ramer–Douglas–Peucker on a flat list
function hwSimplify(pl, eps) {
  const n = pl.length / 2;
  if (n < 3) return pl;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  /* A loop ends where it starts, and measured against a line of no length
     every point is "on it" — the whole of an 'o' or the bowl of an 'a' went.
     So a loop is split at its farthest point first. */
  const stack = [];
  if (Math.hypot(pl[0] - pl[n * 2 - 2], pl[1] - pl[n * 2 - 1]) < eps * 2) {
    let far = 1, fd = -1;
    for (let i = 1; i < n - 1; i++) { const d = Math.hypot(pl[i * 2] - pl[0], pl[i * 2 + 1] - pl[1]); if (d > fd) { fd = d; far = i; } }
    keep[far] = 1;
    stack.push([0, far], [far, n - 1]);
  } else stack.push([0, n - 1]);
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pl[a * 2], ay = pl[a * 2 + 1], bx = pl[b * 2], by = pl[b * 2 + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1, fd = eps;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pl[i * 2 + 1]) - (ax - pl[i * 2]) * (by - ay)) / L;
      if (d > fd) { fd = d; far = i; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pl[i * 2], pl[i * 2 + 1]);
  return out;
}
/* What could not be drawn, without its background: the fill pixels and a
   two-pixel soft edge round them, alpha from how far each is from the
   background, cropped to what is there. Null when nothing was a fill. */
function hwCutout(px, dist, fill, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fill[y * W + x]) {
    n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (n < 30) return null;
  x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(W - 1, x1 + 2); y1 = Math.min(H - 1, y1 + 2);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const out = g.createImageData(w, h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    let near = fill[i];
    if (!near) for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H && fill[yy * W + xx]) near = 1;
    }
    if (!near) continue;
    const o = ((y - y0) * w + (x - x0)) * 4, j = i * 4;
    out.data[o] = px[j]; out.data[o + 1] = px[j + 1]; out.data[o + 2] = px[j + 2];
    out.data[o + 3] = fill[i] ? px[j + 3] : Math.min(px[j + 3], clamp(Math.round((dist[i] - 12) * 3), 0, 255));
  }
  g.putImageData(out, 0, 0);
  return { canvas: c, x: x0, y: y0, w, h };
}

/* ---- 4. a word, in a hand ---- */
const hwGlyphCache = new Map();
// the word set in the hand and traced, in glyph pixels with its ink box; cached per face and text
function hwGlyph(text, face) {
  const key = face + '\u0001' + text;
  if (hwGlyphCache.has(key)) return hwGlyphCache.get(key);
  const fs = HW_GLYPH_PX;
  const m0 = document.createElement('canvas').getContext('2d');
  m0.font = `${fs}px ${face}`;
  const tm = m0.measureText(text);
  const pad = Math.ceil(fs * 0.4);
  const W = Math.max(8, Math.ceil(tm.width + pad * 2)), H = Math.ceil(fs * 2);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#000'; g.font = `${fs}px ${face}`; g.textBaseline = 'alphabetic';
  const base = Math.round(fs * 1.3);
  g.fillText(text, pad, base);
  const d = g.getImageData(0, 0, W, H).data;
  const m = new Uint8Array(W * H);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < W * H; i++) if (d[i * 4] < 128) {
    m[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  let res = null;
  if (x1 >= 0) {
    const dt = hwDistance(m, W, H);
    hwThin(m, W, H);
    const half = [];
    for (let i = 0; i < W * H; i++) if (m[i]) half.push(dt[i]);
    const lines = hwTrace(m, W, H).map((pl) => hwSimplify(hwSmooth(pl), 0.45)).filter((pl) => pl.length >= 4);
    // left to right as a hand goes (right to left for Arabic and Hebrew)
    const rtl = /[\u0590-\u08FF]/.test(text);
    const lead = (pl) => { let v = rtl ? -Infinity : Infinity; for (let i = 0; i < pl.length; i += 2) v = rtl ? Math.max(v, pl[i]) : Math.min(v, pl[i]); return v; };
    lines.sort((a, b) => (rtl ? lead(b) - lead(a) : lead(a) - lead(b)));
    res = { lines, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, half: half.length ? hwMedian(half) : fs * 0.04 };
  }
  if (hwGlyphCache.size > 400) hwGlyphCache.clear();
  hwGlyphCache.set(key, res);
  return res;
}
/* One word: its traced hand, scaled so its ink is as tall as the word's box
   (the line's typical height, so a line keeps one size), as wide as the box
   give or take a fifth, tilted a hair, in the word's own colour and weight. */
function hwWordStrokes(wd, ln, u, at) {
  const arabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(wd.t);
  const face = arabic ? HW_ARABIC : HW_FACES[state.settings.hwHand] || HW_FACES.ink;
  const gl = hwGlyph(wd.t, face);
  if (!gl) return [];
  const b = wd.box;
  // the word's height, but not far from its line's: a lone short word ("x") keeps the line's size
  const hh = clamp(b.h, ln.h * 0.55, ln.h * 1.5);
  let k = hh / gl.box.h;
  // words whose ink is all x-height (no ascenders) are shorter boxes: the hand's own box says so too, so k matches
  const kx = clamp(b.w / (gl.box.w * k), 0.82, 1.22) * k;
  const tilt = (Math.random() - 0.5) * 0.03;
  const lift = (Math.random() - 0.5) * hh * 0.04;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);
  const ox = arabic || ln.rtl ? b.x + b.w - gl.box.w * kx : b.x;
  const oy = b.y + b.h - gl.box.h * k + lift;            // the bottom of the ink on the bottom of the box
  // the pen: the hand's own weight, heavier where the word was bold
  const heavy = clamp(wd.stroke / Math.max(1, ln.h) / 0.13, 1, 2);
  const size = Math.max(0.25, gl.half * 2 * k * heavy * u);
  const color = hwInkColor(wd.color);
  const out = [];
  for (const pl of gl.lines) {
    const pts = [];
    for (let i = 0; i < pl.length; i += 2) {
      const lx = (pl[i] - gl.box.x) * kx, ly = (pl[i + 1] - gl.box.y) * k;
      pts.push(...at(ox + lx * cos - ly * sin, oy + lx * sin + ly * cos));
    }
    out.push({ id: uid(), tool: 'pen', color, size: Math.round(size * 100) / 100, pts });
  }
  return out;
}

/* ---- colours ---- */
// near-black or near-white with no colour in it is the paper's ink (it stays readable on either paper)
function hwInkColor(c) {
  const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
  if (mx - mn < 40 && (mx < 95 || mn > 200)) return 'text';
  return hwHex(c);
}
// hue (degrees), chroma and lightness of an RGB colour, enough to tell colours apart
function hwHue(c) {
  const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, c: d, l: (mx + mn) / 2 };
}
const hwHex = (c) => '#' + c.slice(0, 3).map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function hwMedian(a) {
  if (!a.length) return 0;
  const s = Float64Array.from(a).sort();
  return s[s.length >> 1];
}

/* ---- 5. written out ----
   Everything is already in the drawing (and on its way to the disk); this only
   uncovers it. Each line is a dash as long as itself, slid along it — so a
   line appears from its start to its end, as a pen would draw it. Any redraw
   of the drawing (a press, a zoom that repaints) simply shows it all. */
function hwWriteOut(ids, cut) {
  cancelAnimationFrame(hw.anim);
  return new Promise((done) => {
    const g = $('skWorld');
    const els = ids.map((id) => g.querySelector(`[data-id="${CSS.escape(id)}"]`)).filter(Boolean);
    const lens = els.map((el) => { try { return el.getTotalLength(); } catch (_) { return 0; } });
    const total = lens.reduce((a, b) => a + b, 0);
    if (!els.length || !total) { done(); return; }
    els.forEach((el, i) => { el.style.strokeDasharray = `${lens[i] + 1} ${lens[i] + 1}`; el.style.strokeDashoffset = String(lens[i] + 1); });
    if (cut) { const im = [...g.querySelectorAll('image')].find((x) => (x.getAttribute('href') || '') === cut.url); if (im) im.style.opacity = '0'; }
    // a steady hand on screen: about 1,100 px a second, never under a second and a half or over nine
    const secs = clamp(total * (sk ? sk.view.z : 1) / 1100, 1.5, 9);
    const t0 = performance.now();
    const step = (now) => {
      const f = Math.min(1, (now - t0) / (secs * 1000));
      let left = f * total;
      for (let i = 0; i < els.length; i++) {
        const L = lens[i];
        const show = clamp(left, 0, L + 1);
        els[i].style.strokeDashoffset = String(L + 1 - show);
        left -= L;
      }
      if (cut) { const im = [...g.querySelectorAll('image')].find((x) => (x.getAttribute('href') || '') === cut.url); if (im) im.style.opacity = String(Math.min(1, f * 3)); }
      if (f < 1 && els[0].isConnected) hw.anim = requestAnimationFrame(step);
      else {
        els.forEach((el) => { el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; });
        done();
      }
    };
    hw.anim = requestAnimationFrame(step);
  });
}

/* ---- the menu on a picture in the drawing (right button) ---- */
function openSketchPicMenu(e, p) {
  const menu = $('skMenu');
  if (!menu || !sk) return;
  sk.sel.clear(); sk.sel.add(p);
  drawSketchStrokes(); sketchSelChanged();
  const item = (act, ic, label) => `<button class="cm-item" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
  menu.innerHTML =
    `<div class="cm-label">${icon('image')}<span>${te('menu.picture')}</span></div>` +
    item('hw', 'history_edu', te('hw.menu')) +
    `<p class="cm-hint">${te('hw.menuHint')}</p>` +
    `<div class="cm-sep"></div>` +
    item('edit', 'tune', te('sketch.editPic')) +
    item('copy', 'content_copy', te('menu.copyPicture')) +
    `<div class="cm-sep"></div>` +
    `<button class="cm-item danger" data-act="del">${icon('delete')}<span>${te('menu.delete')}</span></button>`;
  menu.classList.remove('hidden');
  const r = menu.getBoundingClientRect();
  menu.style.left = clamp(e.clientX, 4, innerWidth - r.width - 4) + 'px';
  menu.style.top = clamp(e.clientY, 4, innerHeight - r.height - 4) + 'px';
  menu.querySelectorAll('[data-act]').forEach((b) => onPress(b, () => {
    closeSketchPicMenu();
    const act = b.dataset.act;
    if (act === 'hw') handwriteSketchPic(p);
    else if (act === 'edit') editSketchPicture(p);
    else if (act === 'copy') copyPictureOut(p.url);
    else if (act === 'del') deleteSketchSel();
  }));
}
function closeSketchPicMenu() { const m = $('skMenu'); if (m) m.classList.add('hidden'); }
function wireHandwrite() {
  $('skSvg').addEventListener('contextmenu', (e) => {
    // the pen's barrel button is the eraser (sketch.js), so only a mouse or a touch opens the menu
    if (!sk || e.pointerType === 'pen' || hw.busy) return;
    const hit = sketchHit(sketchPoint(e));
    if (hit && hit.url) openSketchPicMenu(e, hit);
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#skMenu')) closeSketchPicMenu(); }, true);
}
