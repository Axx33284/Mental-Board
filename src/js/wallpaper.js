/* A live wallpaper behind the board (3.0) — Settings ▸ Wallpaper.

   One layer, #wallpaper, the first child of #viewport: under the board's own
   picture, the paper and everything on the board, and it never takes the
   pointer. What is in it:

   - **rain** — rain running down a window. A backdrop of out-of-focus city
     lights is painted once into `wp.back` (and a sharper, upside-down copy
     into `wp.lens`, which is what a drop shows: a drop of water is a lens and
     turns what is behind it over). Small drops gather and slowly dry; now and
     then a big one slides, eating the small ones in its way and leaving a
     trail of new ones behind it.
   - **snow** — flakes on three depths, the near ones bigger, faster and
     softer, swaying on a wind that changes slowly.
   - **youtube** — a video, looped and muted unless asked for sound, through
     main's player server (main.js PLAYER_FRAME `ytbg`), because YouTube's
     player refuses a file:// origin. Nothing is contacted until this is the
     wallpaper.

   How it sits is the same for all three: opacity, a veil of the board's own
   background colour on top (`wpDim`, so the notes stay readable), a blur,
   and whether the paper's grid is drawn over it.

   It costs a frame only while it can be seen: the loop stops when the window
   is hidden and runs at 30 frames a second (20 on the lite tier); with reduced
   motion it is painted once and stands still. */
const WP_KINDS = ['none', 'rain', 'snow', 'youtube'];
const wp = {
  kind: 'none', raf: 0, last: 0, w: 0, h: 0, dpr: 1,
  back: null, lens: null, drops: [], flakes: [], wind: 0, windTo: 0, frameUrl: '', still: false
};

function wpFrameMs() { return document.body.dataset.perf === 'lite' ? 50 : 33; }
function wpStill() {
  const m = state.settings.motion;
  return m === 'reduced' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function applyWallpaper() {
  const s = state.settings, layer = $('wallpaper');
  if (!layer) return;
  const kind = WP_KINDS.includes(s.wpKind) ? s.wpKind : 'none';
  const vid = kind === 'youtube' ? videoOf(s.wpUrl) : null;
  const on = kind !== 'none' && (kind !== 'youtube' || (vid && vid.kind === 'yt'));
  layer.classList.toggle('hidden', !on);
  document.body.classList.toggle('wp-on', on);
  document.body.classList.toggle('wp-nogrid', on && !s.wpGrid);
  layer.style.setProperty('--wp-opacity', (s.wpOpacity / 100).toFixed(2));
  layer.style.setProperty('--wp-dim', (s.wpDim / 100).toFixed(2));
  layer.style.setProperty('--wp-blur', s.wpBlur + 'px');
  layer.dataset.kind = on ? kind : 'none';
  // the video
  const frame = $('wpFrame');
  if (on && kind === 'youtube') {
    const want = (s.wpSound ? 'ytbgs:' : 'ytbg:') + vid.id;
    if (wp.frameUrl !== want) {
      wp.frameUrl = want;
      const ask = FILES && FILES.playerUrl ? FILES.playerUrl(s.wpSound ? 'ytbgs' : 'ytbg', vid.id) : Promise.resolve(null);
      ask.then((url) => { if (wp.frameUrl === want) frame.src = url || 'about:blank'; });
    }
  } else if (wp.frameUrl) { wp.frameUrl = ''; frame.src = 'about:blank'; }
  // the canvas
  if (!on || kind === 'youtube') { stopWallpaper(); wp.kind = on ? kind : 'none'; return; }
  const changed = wp.kind !== kind;
  wp.kind = kind;
  wpResize(changed);
  wp.still = wpStill();
  startWallpaper();
}
function startWallpaper() {
  cancelAnimationFrame(wp.raf);
  wp.last = 0;
  if (wp.still) { wpStep(0, true); return; }
  const loop = (t) => {
    wp.raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (t - wp.last < wpFrameMs()) return;
    const dt = wp.last ? Math.min(0.1, (t - wp.last) / 1000) : 0.033;
    wp.last = t;
    wpStep(dt, false);
  };
  wp.raf = requestAnimationFrame(loop);
}
function stopWallpaper() { cancelAnimationFrame(wp.raf); wp.raf = 0; }

/* The canvas follows the viewport. At most 1.5 device pixels a CSS pixel: the
   wallpaper is blurred, wet and moving, and nobody sees the difference. */
function wpResize(force) {
  const c = $('wpCanvas'), vp = $('viewport');
  const w = Math.max(1, vp.clientWidth), h = Math.max(1, vp.clientHeight);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (!force && w === wp.w && h === wp.h && dpr === wp.dpr && wp.back) return;
  wp.w = w; wp.h = h; wp.dpr = dpr;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  wp.back = wpBackdrop(wp.kind, c.width, c.height);
  wp.lens = wp.kind === 'rain' ? wpLensOf(wp.back) : null;
  wp.drops = []; wp.flakes = [];
  if (wp.kind === 'rain') wpSeedRain(); else if (wp.kind === 'snow') wpSeedSnow();
  if (wp.still) wpStep(0, true);
}

/* ---- the backdrop: a rainy night (or an overcast day) out of focus ---- */
// a seeded random, so the same window gives the same city every time
function wpRand(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
function wpBackdrop(kind, W, H) {
  const dark = document.documentElement.dataset.mode !== 'light';
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (kind === 'snow') {
    if (dark) { sky.addColorStop(0, '#0b1424'); sky.addColorStop(0.6, '#16253b'); sky.addColorStop(1, '#2a3a52'); }
    else { sky.addColorStop(0, '#9fb1c6'); sky.addColorStop(0.6, '#c3cfdc'); sky.addColorStop(1, '#e3e9ef'); }
  } else if (dark) { sky.addColorStop(0, '#07090f'); sky.addColorStop(0.55, '#121827'); sky.addColorStop(1, '#1d1a22'); }
  else { sky.addColorStop(0, '#8d98a6'); sky.addColorStop(0.55, '#aeb7c2'); sky.addColorStop(1, '#c9ccd0'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const r = wpRand(kind === 'snow' ? 7 : 42);
  const s = Math.max(W, H) / 1400;
  if (kind === 'rain') {
    /* city lights through wet glass: big soft discs, warm and cool, thicker
       towards the bottom where the street would be */
    const hues = dark ? ['255,170,90', '255,120,80', '120,170,255', '255,220,150', '200,120,255', '90,220,200']
                      : ['255,236,210', '210,225,245', '255,250,240', '230,235,245'];
    g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let i = 0; i < 140; i++) {
      const x = r() * W, y = H * (0.25 + 0.75 * Math.pow(r(), 0.7));
      const rad = (18 + r() * 70) * s;
      const a = (dark ? 0.06 + r() * 0.16 : 0.10 + r() * 0.22);
      const col = hues[(r() * hues.length) | 0];
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.7, `rgba(${col},${a * 0.6})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  } else if (kind === 'snow') {
    // far hills and a few windows, very soft
    g.fillStyle = dark ? 'rgba(4,8,16,.55)' : 'rgba(90,105,125,.35)';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 12) g.lineTo(x, H * (0.72 + 0.08 * Math.sin(x / W * 5.3 + 1) + 0.03 * Math.sin(x / W * 17)));
    g.lineTo(W, H); g.closePath(); g.fill();
    if (dark) {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const x = r() * W, y = H * (0.78 + r() * 0.18), rad = (6 + r() * 16) * s;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(255,190,110,.35)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }
  return c;
}
// what a drop shows: the backdrop upside down and sharper, as a lens turns it
function wpLensOf(back) {
  const c = document.createElement('canvas'); c.width = back.width; c.height = back.height;
  const g = c.getContext('2d');
  g.translate(0, c.height); g.scale(1, -1);
  g.filter = 'brightness(1.7) contrast(1.2) saturate(1.35)';
  g.drawImage(back, 0, 0);
  return c;
}

/* ---- rain ---- */
const WP_DROP_MAX = 900;
function wpAmount() { return clamp(state.settings.wpAmount, 5, 100) / 100; }
function wpSeedRain() {
  const n = Math.round((wp.w * wp.h) / 2600 * wpAmount());
  for (let i = 0; i < Math.min(n, WP_DROP_MAX); i++) wp.drops.push(wpSmallDrop(Math.random() * wp.w, Math.random() * wp.h));
}
function wpSmallDrop(x, y, r) {
  return { x, y, r: r || 0.8 + Math.random() * Math.random() * 4.6, vy: 0, life: 1, dry: 0.004 + Math.random() * 0.012, big: false, trail: 0 };
}
function wpBigDrop() {
  const r = 4 + Math.random() * 5.5;
  return { x: Math.random() * wp.w, y: -10 - Math.random() * wp.h * 0.4, r, vy: 0, life: 1, dry: 0, big: true,
           trail: 0, wob: Math.random() * 6, stall: Math.random() * 0.8 };
}
function wpRainStep(dt) {
  const amt = wpAmount();
  const want = Math.round((wp.w * wp.h) / 2600 * amt);
  // new small drops land; old ones dry out
  let landed = Math.round(want * dt * 0.35) + (Math.random() < want * dt * 0.35 % 1 ? 1 : 0);
  while (landed-- > 0 && wp.drops.length < Math.min(want * 1.3, WP_DROP_MAX)) wp.drops.push(wpSmallDrop(Math.random() * wp.w, Math.random() * wp.h));
  // a big one sets off now and then
  const bigs = wp.drops.reduce((k, d) => k + (d.big ? 1 : 0), 0);
  if (bigs < 3 + 22 * amt && Math.random() < dt * (0.6 + 4 * amt)) wp.drops.push(wpBigDrop());
  const out = [];
  for (const d of wp.drops) {
    if (d.big) {
      // a slide that hesitates, speeds up and wanders a little
      if (d.stall > 0) { d.stall -= dt; d.vy *= 0.8; } else d.vy = Math.min(d.vy + (180 + d.r * 40) * dt, 90 + d.r * 34);
      if (Math.random() < dt * 0.7) d.stall = Math.random() * 0.5;
      d.y += d.vy * dt;
      d.x += Math.sin((d.y + d.wob * 40) / 37) * 0.25;
      d.trail += d.vy * dt;
      // what it leaves behind
      if (d.trail > 9 + Math.random() * 12) {
        d.trail = 0;
        if (out.length < WP_DROP_MAX) out.push(wpSmallDrop(d.x + (Math.random() - 0.5) * d.r * 0.6, d.y - d.r * 1.3, 0.8 + Math.random() * d.r * 0.32));
        d.r = Math.max(2.4, d.r - 0.05);
      }
      if (d.y - d.r * 2 > wp.h) continue;
      out.push(d);
    } else {
      d.life -= d.dry * dt * 6;
      if (d.life > 0) out.push(d);
    }
  }
  // a sliding drop takes up the small ones it reaches
  for (const d of out) {
    if (!d.big) continue;
    for (const e of out) {
      if (e.big || e.life <= 0) continue;
      const dx = e.x - d.x, dy = e.y - d.y;
      if (dy > -d.r * 2.2 && dy < d.r * 1.6 && Math.abs(dx) < d.r + e.r) { e.life = 0; d.r = Math.min(10, d.r + e.r * 0.05); }
    }
  }
  wp.drops = out.filter((d) => d.life > 0);
}
function wpDrawRain(g) {
  const k = wp.dpr, back = wp.back, lens = wp.lens;
  g.drawImage(back, 0, 0);
  for (const d of wp.drops) {
    const x = d.x * k, y = d.y * k;
    const rx = d.r * k * (d.big ? 0.92 : 1), ry = d.r * k * (d.big ? 1.12 : 1);
    if (rx < 0.5) continue;
    const a = d.big ? 1 : Math.min(1, d.life * 1.6);
    g.globalAlpha = a;
    if (rx > 1.6) {
      // the lens: a little of what is behind, turned over and magnified
      g.save();
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.clip();
      const m = 11;            // how wide a view one drop gathers
      const sx = clamp(x - rx * m, 0, lens.width - 1), sy = clamp(lens.height - y - ry * m, 0, lens.height - 1);
      g.drawImage(lens, sx, sy, Math.max(1, rx * m * 2), Math.max(1, ry * m * 2), x - rx, y - ry, rx * 2, ry * 2);
      // the dark rim that makes it read as water, heavier underneath
      const rim = g.createRadialGradient(x, y - ry * 0.25, rx * 0.35, x, y, Math.max(rx, ry) * 1.02);
      rim.addColorStop(0, 'rgba(255,255,255,.04)'); rim.addColorStop(0.72, 'rgba(0,0,0,.06)'); rim.addColorStop(1, 'rgba(0,0,0,.5)');
      g.fillStyle = rim; g.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      g.restore();
      // and the light on it
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.beginPath(); g.ellipse(x - rx * 0.32, y - ry * 0.42, rx * 0.22, ry * 0.16, -0.5, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = 'rgba(255,255,255,.3)';
      g.beginPath(); g.arc(x, y, rx, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath(); g.arc(x, y + rx * 0.35, rx * 0.8, 0, Math.PI); g.fill();
    }
  }
  g.globalAlpha = 1;
}

/* ---- snow ---- */
function wpSeedSnow() {
  const n = Math.round((wp.w * wp.h) / 4200 * wpAmount());
  for (let i = 0; i < Math.min(n, 700); i++) wp.flakes.push(wpFlake(true));
}
function wpFlake(anywhere) {
  const z = Math.random();                  // 0 far … 1 near
  const r = 0.6 + z * z * 3.6;
  return { x: Math.random() * (wp.w + 80) - 40, y: anywhere ? Math.random() * wp.h : -10 - Math.random() * 40,
           r, z, vy: 16 + z * 60 + Math.random() * 12, ph: Math.random() * Math.PI * 2, sw: 8 + Math.random() * 22, a: 0.45 + z * 0.5 };
}
function wpSnowStep(dt) {
  if (Math.random() < dt * 0.15) wp.windTo = (Math.random() - 0.5) * 60;
  wp.wind += (wp.windTo - wp.wind) * Math.min(1, dt * 0.4);
  const want = Math.round((wp.w * wp.h) / 4200 * wpAmount());
  for (const f of wp.flakes) {
    f.ph += dt * (0.6 + f.z);
    f.y += f.vy * dt;
    f.x += (Math.sin(f.ph) * f.sw * 0.6 + wp.wind * (0.4 + f.z)) * dt;
  }
  wp.flakes = wp.flakes.filter((f) => f.y - f.r < wp.h + 10 && f.x > -60 && f.x < wp.w + 60);
  while (wp.flakes.length < Math.min(want, 700)) wp.flakes.push(wpFlake(false));
}
function wpDrawSnow(g) {
  const k = wp.dpr;
  g.drawImage(wp.back, 0, 0);
  for (const f of wp.flakes) {
    const x = f.x * k, y = f.y * k, r = f.r * k;
    if (r > 2.2) {
      // the near ones are out of focus: a soft disc, not a dot
      const gr = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
      gr.addColorStop(0, `rgba(255,255,255,${f.a})`); gr.addColorStop(0.55, `rgba(255,255,255,${f.a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 1.6, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = `rgba(255,255,255,${f.a})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
}

function wpStep(dt, still) {
  const c = $('wpCanvas');
  if (!c || !wp.back) return;
  const g = c.getContext('2d');
  if (wp.kind === 'rain') { if (!still) wpRainStep(dt); wpDrawRain(g); }
  else if (wp.kind === 'snow') { if (!still) wpSnowStep(dt); wpDrawSnow(g); }
}

function wireWallpaper() {
  window.addEventListener('resize', () => { if (wp.kind === 'rain' || wp.kind === 'snow') wpResize(false); });
  // a theme that turns light or dark repaints the backdrop (applyTheme calls applySettings → here, with the mode already set)
  new MutationObserver(() => { if (wp.kind === 'rain' || wp.kind === 'snow') wpResize(true); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (wp.kind !== 'none') applyWallpaper(); });
}
