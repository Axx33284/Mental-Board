/* A live wallpaper behind the board (3.0) — Settings ▸ Wallpaper.

   One layer, #wallpaper, the first child of #viewport: under the board's own
   picture, the paper and everything on the board, and it never takes the
   pointer. What is in it:

   - **rain** — a rainy night seen through a window. Out-of-focus city lights
     (painted once into `wp.back`) that breathe, and cars passing in the
     street below; rain falling outside, between the glass and the city; the
     glass fogged, and wiped clear where a drop slides down it (`wp.fog`,
     re-fogging by itself); and the drops on it, each a lens that turns what is
     behind it over (`wp.lens`). Small drops gather and dry; now and then a big
     one slides, eating the small ones in its way. Far off, now and then, the
     sky glows with lightning, and the thunder comes a moment later.
   - **snow** — flakes on many depths, the near ones bigger, faster and
     softer, on a wind that changes and sometimes gusts; hills with lit
     windows that come and go, snow that glints, and frost on the window's
     edge.
   - **stars** — a night sky (3.3): the Milky Way, stars that twinkle,
     shooting stars, an aurora moving in curtains, and a dark ridge of hills
     and pines. In a light theme, the sky just before dawn.
   - **youtube** — a video, looped and muted unless asked for sound, through
     main's player server (main.js PLAYER_FRAME `ytbg`), because YouTube's
     player refuses a file:// origin. Nothing is contacted until this is the
     wallpaper.

   **Depth** (3.3, `wpDepth`): the drawn scenes are layers, and they move
   apart. The pointer leans the view (`wp.look`) and a pan of the board pushes
   it, springing back (`wp.kick`); each layer moves by its own depth
   (`wpOff`). The backdrop is painted WP_OVER bigger on every side so there is
   always something there to move into. Drops and frost are on the glass, so
   they stay where they are, as they would.

   **Sound** (3.3, `wpSound`): rain on the glass, wind in the snow, crickets
   under the stars — made as it plays with Web Audio from one buffer of noise
   (`wpAu`), nothing downloaded. It fades out when the window is hidden and
   when it is turned off. For a video, `wpSound` is the video's own sound.

   How it sits is the same for every kind: opacity, a veil of the board's own
   background colour on top (`wpDim`, so the notes stay readable), a blur,
   and whether the paper's grid is drawn over it.

   It costs a frame only while it can be seen: the loop stops when the window
   is hidden and runs at 30 frames a second (20 on the lite tier, which also
   leaves out the fog and draws fewer of everything); with reduced motion it
   is painted once and stands still, with no depth and no lightning. */
const WP_KINDS = ['none', 'rain', 'snow', 'stars', 'youtube'];
const WP_LIVE = ['rain', 'snow', 'stars'];          // the kinds drawn here, on the canvas
const WP_OVER = 0.05;                               // how much bigger the backdrop is on each side, for depth
const wp = {
  kind: 'none', raf: 0, timer: 0, last: 0, w: 0, h: 0, dpr: 1, m: 0, t: 0, frameUrl: '', still: false,
  back: null, lens: null, frost: null, fore: null, frame: null, fog: null, tmp: null, sprites: {},
  drops: [], streaks: [], lights: [], cars: [], flakes: [], glints: [], windows: [], stars: [], shots: [], ribbons: [],
  wind: 0, windTo: 0, gustT: 0, flash: null, nextFlash: 0, nextCar: 0, nextShot: 0,
  cam: { x: 0, y: 0 }, look: { x: 0, y: 0 }, kick: { x: 0, y: 0 }, view: null
};

const wpLite = () => document.body.dataset.perf === 'lite';
function wpFrameMs() { return wpLite() ? 50 : 33; }
function wpStill() {
  const m = state.settings.motion;
  return m === 'reduced' || (m !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
const wpDark = () => document.documentElement.dataset.mode !== 'light';
// js/tablet.js asks: a picture of a moving wallpaper is never the same twice, so the phone's idle tick slows
const wpAnimating = () => !!(wp.raf || wp.timer) && !wp.still;

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
  if (!on || kind === 'youtube') { stopWallpaper(); wp.kind = on ? kind : 'none'; wpSoundSync(); return; }
  const changed = wp.kind !== kind;
  wp.kind = kind;
  wp.still = wpStill();
  wpResize(changed);
  startWallpaper();
  wpSoundSync();
}
/* A frame, then a timer until the next one is due, then the frame it asks for
   (3.1). Until 3.1 the loop asked for every frame the display draws and
   skipped most of them — on a 165 Hz screen that was 165 wake-ups a second
   to paint 30. A hidden window draws no frames, so the loop simply waits. */
function startWallpaper() {
  stopWallpaper();
  wp.last = 0;
  if (wp.still) { wpStep(0, true); return; }
  const frame = (t) => {
    wp.raf = 0;
    const dt = wp.last ? Math.min(0.1, (t - wp.last) / 1000) : 0.033;
    wp.last = t;
    wpStep(dt, false);
    wp.timer = setTimeout(() => { wp.timer = 0; wp.raf = requestAnimationFrame(frame); }, Math.max(0, wpFrameMs() - (performance.now() - t) - 4));
  };
  wp.raf = requestAnimationFrame(frame);
}
function stopWallpaper() { cancelAnimationFrame(wp.raf); clearTimeout(wp.timer); wp.raf = 0; wp.timer = 0; }

/* The canvas follows the viewport. At most 1.5 device pixels a CSS pixel: the
   wallpaper is blurred, wet and moving, and nobody sees the difference. The
   backdrop and what belongs to it are painted `wp.m` device pixels bigger on
   every side, the room the layers move into. */
function wpResize(force) {
  const c = $('wpCanvas'), vp = $('viewport');
  const w = Math.max(1, vp.clientWidth), h = Math.max(1, vp.clientHeight);
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (!force && w === wp.w && h === wp.h && dpr === wp.dpr && wp.back) return;
  wp.w = w; wp.h = h; wp.dpr = dpr;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  c.style.width = w + 'px'; c.style.height = h + 'px';
  wp.m = Math.round(Math.max(c.width, c.height) * WP_OVER);
  const W = c.width + wp.m * 2, H = c.height + wp.m * 2;
  wp.sprites = {};
  wp.back = wpBackdrop(wp.kind, W, H);
  wp.lens = wp.kind === 'rain' ? wpLensOf(wp.back) : null;
  wp.frost = wp.kind === 'rain' && !wpLite() ? wpFrostOf(wp.back) : null;
  wp.fore = wp.kind === 'stars' ? wpRidge(W, H) : null;
  wp.frame = wp.kind === 'snow' ? wpFrostFrame(c.width, c.height) : null;
  wp.fog = null; wp.tmp = null; wp.flash = null;
  for (const k of ['drops', 'streaks', 'lights', 'cars', 'flakes', 'glints', 'windows', 'stars', 'shots', 'ribbons']) wp[k] = [];
  wp.nextFlash = wp.t + 18 + Math.random() * 40;
  wp.nextCar = wp.t + 1; wp.nextShot = wp.t + 3 + Math.random() * 6;
  if (wp.kind === 'rain') wpSeedRain(); else if (wp.kind === 'snow') wpSeedSnow(); else if (wp.kind === 'stars') wpSeedStars();
  if (wp.still) wpStep(0, true);
}

/* ---- depth (3.3) ----
   Where the scene is seen from. The pointer leans it (`look`, −½…½ across the
   window) and a pan of the board pushes it the way the board went (`kick`),
   which springs back by itself; `cam` eases after both, so nothing jumps.
   Off with Settings ▸ Wallpaper ▸ Depth, and always off when motion is
   reduced. A layer's offset is `cam` times its depth times the room. */
function wpCamera(dt) {
  if (state.settings.wpDepth === false || wp.still) { wp.cam.x = wp.cam.y = 0; wp.kick.x = wp.kick.y = 0; wp.view = null; return; }
  const v = state.view, room = Math.max(1, wp.m / wp.dpr);
  if (wp.view && dt > 0) {
    wp.kick.x = clamp(wp.kick.x - (v.x - wp.view.x) / room * 0.12, -0.7, 0.7);
    wp.kick.y = clamp(wp.kick.y - (v.y - wp.view.y) / room * 0.12, -0.7, 0.7);
  }
  wp.view = { x: v.x, y: v.y };
  const back = Math.exp(-dt * 2.2);
  wp.kick.x *= back; wp.kick.y *= back;
  const tx = clamp(wp.look.x * 1.4 + wp.kick.x, -1, 1), ty = clamp(wp.look.y + wp.kick.y, -1, 1);
  const ease = 1 - Math.exp(-dt * 3);
  wp.cam.x += (tx - wp.cam.x) * ease; wp.cam.y += (ty - wp.cam.y) * ease;
}
// how far a layer of this depth sits from where it would be still, in device pixels
const wpOff = (depth) => ({ x: -wp.cam.x * wp.m * depth, y: -wp.cam.y * wp.m * depth });

/* ---- sprites: a soft disc, a streak of light — drawn once, stretched where they go ---- */
function wpSprite(key, make) {
  if (wp.sprites[key]) return wp.sprites[key];
  const c = document.createElement('canvas');
  make(c);
  return (wp.sprites[key] = c);
}
// a soft round light of one colour ('r,g,b'), brightest in the middle
function wpGlow(rgb, core) {
  return wpSprite('glow:' + rgb + ':' + (core || 0), (c) => {
    c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(core || 0.45, `rgba(${rgb},${core ? 0.9 : 0.55})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
}

/* ---- the backdrop: a rainy night (or an overcast day), a snowy evening, a night sky ---- */
// a seeded random, so the same window gives the same city every time
function wpRand(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
function wpBackdrop(kind, W, H) {
  const dark = wpDark();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, H);
  if (kind === 'snow') {
    if (dark) { sky.addColorStop(0, '#0b1424'); sky.addColorStop(0.6, '#16253b'); sky.addColorStop(1, '#2a3a52'); }
    else { sky.addColorStop(0, '#9fb1c6'); sky.addColorStop(0.6, '#c3cfdc'); sky.addColorStop(1, '#e3e9ef'); }
  } else if (kind === 'stars') {
    if (dark) { sky.addColorStop(0, '#02040b'); sky.addColorStop(0.55, '#08122a'); sky.addColorStop(0.85, '#14203d'); sky.addColorStop(1, '#1c2240'); }
    else { sky.addColorStop(0, '#5b6f9c'); sky.addColorStop(0.5, '#a7a3c4'); sky.addColorStop(0.82, '#e9c2b4'); sky.addColorStop(1, '#f6dcc4'); }
  } else if (dark) { sky.addColorStop(0, '#07090f'); sky.addColorStop(0.55, '#121827'); sky.addColorStop(1, '#1d1a22'); }
  else { sky.addColorStop(0, '#8d98a6'); sky.addColorStop(0.55, '#aeb7c2'); sky.addColorStop(1, '#c9ccd0'); }
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  const r = wpRand(kind === 'snow' ? 7 : kind === 'stars' ? 19 : 42);
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
    // far hills and a few windows, very soft, and a near bank of snow
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
    const bank = g.createLinearGradient(0, H * 0.86, 0, H);
    bank.addColorStop(0, dark ? 'rgba(150,170,200,.0)' : 'rgba(255,255,255,0)');
    bank.addColorStop(0.35, dark ? 'rgba(150,170,200,.16)' : 'rgba(255,255,255,.45)');
    bank.addColorStop(1, dark ? 'rgba(170,190,220,.26)' : 'rgba(255,255,255,.7)');
    g.fillStyle = bank;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += W / 16) g.lineTo(x, H * (0.9 + 0.025 * Math.sin(x / W * 7.1 + 2) + 0.012 * Math.sin(x / W * 23)));
    g.lineTo(W, H); g.closePath(); g.fill();
  } else if (kind === 'stars') {
    /* The Milky Way: a soft band from low left to high right, dusted with
       stars that crowd towards its middle; and faint stars everywhere. */
    const along = (f) => ({ x: W * (0.05 + 0.9 * f), y: H * (0.92 - 0.85 * f) });
    g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
    for (let i = 0; i < (dark ? 70 : 24); i++) {
      const p = along(r()), rad = (80 + r() * 160) * s;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
      const a = dark ? 0.018 + r() * 0.03 : 0.02 + r() * 0.03;
      gr.addColorStop(0, `rgba(${dark ? '190,200,255' : '255,250,245'},${a})`); gr.addColorStop(1, 'rgba(190,200,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, rad, 0, Math.PI * 2); g.fill();
    }
    const dots = dark ? 2600 : 380;
    for (let i = 0; i < dots; i++) {
      let x, y;
      if (i < dots * 0.6) {
        const p = along(r()), off = (r() + r() + r() - 1.5) * 140 * s;
        x = p.x + off * 0.7; y = p.y + off * 0.7;
      } else { x = r() * W; y = r() * H * (dark ? 0.92 : 0.55); }
      const a = dark ? 0.12 + r() * r() * 0.6 : 0.15 + r() * 0.25;
      g.fillStyle = `rgba(${r() < 0.2 ? '255,225,200' : r() < 0.4 ? '200,215,255' : '255,255,255'},${a})`;
      const d = (0.5 + r() * r() * 1.2) * s;
      g.fillRect(x, y, d, d);
    }
    g.globalCompositeOperation = 'source-over';
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
/* Fogged glass: the city further out of focus, and paler. Shown through a
   mask of where the glass is fogged (wp.fog), so where a drop has slid the
   sharper city shows through (3.3). Kept at half the backdrop's size, and
   put together at half the window's (`wp.tmp`): it is a blur, and at full size
   the three passes cost 15 ms a frame on a machine drawing without a GPU. */
function wpFrostOf(back) {
  const c = document.createElement('canvas'); c.width = Math.ceil(back.width / 2); c.height = Math.ceil(back.height / 2);
  const g = c.getContext('2d');
  g.filter = `blur(${Math.round(4.5 * wp.dpr)}px) brightness(${wpDark() ? 1.12 : 1.04})`;
  g.drawImage(back, 0, 0, c.width, c.height);
  g.filter = 'none';
  g.fillStyle = wpDark() ? 'rgba(170,180,200,.10)' : 'rgba(255,255,255,.22)';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
// a ridge of hills and pines against the night sky, nearer than the stars (3.3)
function wpRidge(W, H) {
  const dark = wpDark(), r = wpRand(23), s = Math.max(W, H) / 1400;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = dark ? 'rgba(10,16,32,.92)' : 'rgba(74,72,104,.55)';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += W / 40) g.lineTo(x, H * (0.8 - 0.07 * Math.sin(x / W * 3.4 + 0.6) - 0.035 * Math.sin(x / W * 11 + 2)));
  g.lineTo(W, H); g.closePath(); g.fill();
  g.fillStyle = dark ? '#03050b' : 'rgba(46,42,70,.82)';
  g.beginPath(); g.moveTo(0, H);
  let x = 0;
  while (x <= W) {
    const base = H * (0.9 - 0.025 * Math.sin(x / W * 6.3));
    g.lineTo(x, base);
    if (r() < 0.55) {                       // a pine: a narrow, uneven triangle
      const th = (26 + r() * 60) * s, tw = th * (0.22 + r() * 0.12);
      g.lineTo(x + tw * 0.5, base - th); g.lineTo(x + tw, base);
      x += tw;
    }
    x += (6 + r() * 18) * s;
  }
  g.lineTo(W, H); g.closePath(); g.fill();
  return c;
}
// frost on the window's edge, for the snow: heavier in the corners, clear in the middle (3.3)
function wpFrostFrame(W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = wpRand(5);
  const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(235,242,255,.12)'); gr.addColorStop(1, 'rgba(235,242,255,.42)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const edge = r() < 0.5, ax = edge ? (r() < 0.5 ? r() * 0.16 : 1 - r() * 0.16) : r(), ay = edge ? r() : (r() < 0.5 ? r() * 0.16 : 1 - r() * 0.16);
    const d = 0.6 + r() * 1.8;
    g.fillStyle = `rgba(240,246,255,${0.05 + r() * 0.2})`;
    g.fillRect(ax * W, ay * H, d, d);
  }
  return c;
}

/* ---- rain ---- */
const WP_DROP_MAX = 900;
function wpAmount() { return clamp(state.settings.wpAmount, 5, 100) / 100; }
function wpSeedRain() {
  const n = Math.round((wp.w * wp.h) / 2600 * wpAmount());
  for (let i = 0; i < Math.min(n, WP_DROP_MAX); i++) wp.drops.push(wpSmallDrop(Math.random() * wp.w, Math.random() * wp.h));
  // the rain outside: thin streaks between the glass and the city
  const ns = Math.round(clamp((wp.w * wp.h) / 5200 * wpAmount(), 30, 420) * (wpLite() ? 0.45 : 1));
  for (let i = 0; i < ns; i++) wp.streaks.push(wpStreak(true));
  // some of the city's lights are lit windows and signs: they breathe
  const r = wpRand(77), W = wp.back.width, H = wp.back.height, s = Math.max(W, H) / 1400;
  const hues = wpDark() ? ['255,170,90', '255,120,80', '120,170,255', '255,220,150', '200,120,255', '90,220,200'] : ['255,236,210', '210,225,245'];
  for (let i = 0; i < (wpLite() ? 10 : 24); i++) {
    wp.lights.push({ x: r() * W, y: H * (0.3 + 0.62 * Math.pow(r(), 0.8)), rad: (14 + r() * 40) * s, a: wpDark() ? 0.18 + r() * 0.28 : 0.12 + r() * 0.16,
      col: hues[(r() * hues.length) | 0], f: 0.15 + r() * 0.6, ph: r() * 6.3 });
  }
}
function wpStreak(anywhere) {
  const z = Math.random();
  return { x: Math.random() * (wp.w * 1.2) - wp.w * 0.1, y: anywhere ? Math.random() * wp.h : -20 - Math.random() * wp.h * 0.3,
           len: 10 + z * 26, sp: 520 + z * 620, z };
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
      d.py = d.y;
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
  // the rain outside falls, a little slanted
  const slant = 0.16 + Math.sin(wp.t * 0.07) * 0.06;
  for (const q of wp.streaks) {
    q.y += q.sp * dt; q.x += q.sp * slant * dt;
    if (q.y - q.len > wp.h || q.x > wp.w * 1.15) Object.assign(q, wpStreak(false));
  }
  // cars in the street below: headlights one way, tail lights the other
  if (wp.t > wp.nextCar) {
    wp.nextCar = wp.t + (wpLite() ? 4 : 1.6) + Math.random() * 4;
    const dir = Math.random() < 0.5 ? 1 : -1, W = wp.back.width, H = wp.back.height, k = wp.dpr;
    wp.cars.push({ dir, x: dir > 0 ? -80 * k : W + 80 * k, y: H * (0.86 + Math.random() * 0.07), sp: (60 + Math.random() * 110) * k,
      gap: (14 + Math.random() * 8) * k, rad: (14 + Math.random() * 12) * k, col: dir > 0 ? '255,240,215' : '255,70,55' });
  }
  for (const c of wp.cars) c.x += c.dir * c.sp * dt;
  wp.cars = wp.cars.filter((c) => c.x > -160 * wp.dpr && c.x < wp.back.width + 160 * wp.dpr);
  // lightning far off, now and then — a glow, not a flash, and the thunder after it
  if (wpDark() && wp.t > wp.nextFlash) {
    wp.nextFlash = wp.t + 25 + Math.random() * 55;
    wp.flash = { t0: wp.t, a: 0.08 + Math.random() * 0.08 };
    wpThunderLater(1.2 + Math.random() * 2.2, wp.flash.a / 0.16);
  }
  if (wp.flash && wp.t - wp.flash.t0 > 1.4) wp.flash = null;
  // the fog on the glass: it comes back by itself, and a sliding drop wipes it
  if (wp.frost) {
    if (!wp.fog) {
      wp.fog = document.createElement('canvas');
      wp.fog.width = Math.ceil(wp.w * wp.dpr / 4); wp.fog.height = Math.ceil(wp.h * wp.dpr / 4);
      const f = wp.fog.getContext('2d'); f.fillStyle = '#fff'; f.fillRect(0, 0, wp.fog.width, wp.fog.height);
    }
    const f = wp.fog.getContext('2d'), q = wp.dpr / 4;
    f.globalCompositeOperation = 'source-over';
    f.fillStyle = `rgba(255,255,255,${(1 - Math.exp(-dt / 5)).toFixed(4)})`;
    f.fillRect(0, 0, wp.fog.width, wp.fog.height);
    f.globalCompositeOperation = 'destination-out';
    f.fillStyle = 'rgba(0,0,0,.55)';
    f.beginPath();
    for (const d of wp.drops) {
      if (!d.big) continue;
      // the glass it crossed since the last frame, so a fast drop leaves a trail and not a dotted line
      // as wide as the drop: a wider wipe striped the whole window like a curtain (measured by eye, 3.3)
      const rr = d.r * q, y0 = (d.py == null ? d.y : d.py) * q, cy = (y0 + d.y * q) / 2;
      f.moveTo(d.x * q + rr, cy); f.ellipse(d.x * q, cy, rr, Math.max(rr, Math.abs(d.y * q - y0) / 2 + rr), 0, 0, Math.PI * 2);
    }
    f.fill();
    f.globalCompositeOperation = 'source-over';
  }
}
// a drop's rim, drawn once on a small canvas (3.1: it was a new gradient for every drop on every frame)
function wpRim() {
  return wpSprite('rim', (c) => {
    const S = 64;
    c.width = c.height = S;
    const g = c.getContext('2d'), h = S / 2;
    const rim = g.createRadialGradient(h, h - h * 0.25, h * 0.35, h, h, h * 1.02);
    rim.addColorStop(0, 'rgba(255,255,255,.04)'); rim.addColorStop(0.72, 'rgba(0,0,0,.06)'); rim.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = rim; g.fillRect(0, 0, S, S);
  });
}
// the sky lit from far off: bright at the top, nothing by the street
function wpSkyGlow() {
  return wpSprite('sky', (c) => {
    c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(200,212,255,1)'); gr.addColorStop(0.55, 'rgba(160,175,230,.35)'); gr.addColorStop(1, 'rgba(160,175,230,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  });
}
function wpDrawRain(g, still) {
  const k = wp.dpr, back = wp.back, lens = wp.lens, m = wp.m, dark = wpDark();
  const cw = g.canvas.width, ch = g.canvas.height;
  const city = wpOff(1);
  g.drawImage(back, -m + city.x, -m + city.y);
  // the lights that breathe, and the cars, are part of the city
  g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  for (const L of wp.lights) {
    g.globalAlpha = L.a * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(wp.t * L.f + L.ph)));
    g.drawImage(wpGlow(L.col), L.x - m + city.x - L.rad, L.y - m + city.y - L.rad, L.rad * 2, L.rad * 2);
  }
  if (!still) {
    const street = wpOff(0.9);
    for (const c of wp.cars) {
      g.globalAlpha = dark ? 0.55 : 0.35;
      const spr = wpGlow(c.col, 0.2);
      for (const dx of [-c.gap / 2, c.gap / 2]) g.drawImage(spr, c.x + dx - m + street.x - c.rad, c.y - m + street.y - c.rad, c.rad * 2, c.rad * 2);
    }
  }
  if (wp.flash) {
    const e = wp.t - wp.flash.t0;
    const a = wp.flash.a * (Math.exp(-e / 0.09) + (e > 0.22 ? 0.6 * Math.exp(-(e - 0.22) / 0.16) : 0));
    g.globalAlpha = Math.min(0.2, a);
    g.drawImage(wpSkyGlow(), 0, 0, cw, ch);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // the rain outside, nearer than the city
  if (!still && wp.streaks.length) {
    const o = wpOff(0.55), slant = 0.16 + Math.sin(wp.t * 0.07) * 0.06;
    for (const near of [false, true]) {
      g.strokeStyle = dark ? (near ? 'rgba(195,210,235,.22)' : 'rgba(170,190,220,.13)') : (near ? 'rgba(70,85,105,.2)' : 'rgba(70,85,105,.11)');
      g.lineWidth = (near ? 1.3 : 0.9) * k;
      g.beginPath();
      for (const q of wp.streaks) {
        if ((q.z > 0.5) !== near) continue;
        const x = q.x * k + o.x, y = q.y * k + o.y;
        g.moveTo(x, y); g.lineTo(x - q.len * slant * k, y - q.len * k);
      }
      g.stroke();
    }
  }
  // the fog on the glass, through its mask; still, a light even haze
  if (wp.frost) {
    const fw = wp.frost.width * 2, fh = wp.frost.height * 2;      // the frost, drawn at the backdrop's size
    if (still || !wp.fog) {
      g.globalAlpha = 0.35;
      g.drawImage(wp.frost, -m + city.x, -m + city.y, fw, fh);
      g.globalAlpha = 1;
    } else {
      const hw = Math.ceil(cw / 2), hh = Math.ceil(ch / 2);
      if (!wp.tmp || wp.tmp.width !== hw || wp.tmp.height !== hh) { wp.tmp = document.createElement('canvas'); wp.tmp.width = hw; wp.tmp.height = hh; }
      const tg = wp.tmp.getContext('2d');
      tg.globalCompositeOperation = 'copy';
      tg.drawImage(wp.frost, (-m + city.x) / 2, (-m + city.y) / 2);
      tg.globalCompositeOperation = 'destination-in';
      tg.drawImage(wp.fog, 0, 0, hw, hh);
      tg.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.9;
      g.drawImage(wp.tmp, 0, 0, cw, ch);
      g.globalAlpha = 1;
    }
  }
  // the drops, on the glass: each shows a little of what is behind it, turned over
  for (const d of wp.drops) {
    const x = d.x * k, y = d.y * k;
    const rx = d.r * k * (d.big ? 0.92 : 1), ry = d.r * k * (d.big ? 1.12 : 1);
    if (rx < 0.5) continue;
    const a = d.big ? 1 : Math.min(1, d.life * 1.6);
    g.globalAlpha = a;
    if (rx > 1.6) {
      g.save();
      g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.clip();
      const mag = 11;            // how wide a view one drop gathers
      // the point of the city behind this drop, in the lens (which is the backdrop turned over)
      const lx = x + m - city.x, ly = lens.height - (y + m - city.y);
      const sx = clamp(lx - rx * mag, 0, lens.width - 1), sy = clamp(ly - ry * mag, 0, lens.height - 1);
      g.drawImage(lens, sx, sy, Math.max(1, rx * mag * 2), Math.max(1, ry * mag * 2), x - rx, y - ry, rx * 2, ry * 2);
      // the dark rim that makes it read as water, heavier underneath — one drawn rim, stretched to each drop
      g.drawImage(wpRim(), x - rx, y - ry, rx * 2, ry * 2);
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
  const n = Math.round((wp.w * wp.h) / 4200 * wpAmount() * (wpLite() ? 0.6 : 1));
  for (let i = 0; i < Math.min(n, 700); i++) wp.flakes.push(wpFlake(true));
  const r = wpRand(31), W = wp.back.width, H = wp.back.height, s = Math.max(W, H) / 1400;
  // glints on the near bank of snow, and windows on the hills that are lit and then not
  for (let i = 0; i < (wpLite() ? 18 : 46); i++) wp.glints.push({ x: r() * W, y: H * (0.9 + r() * 0.09), f: 0.3 + r() * 0.9, ph: r() * 6.3, d: (1 + r() * 1.6) * s });
  if (wpDark()) for (let i = 0; i < 9; i++) wp.windows.push({ x: r() * W, y: H * (0.78 + r() * 0.15), rad: (7 + r() * 12) * s, on: r() < 0.6, lit: 0, next: wp.t + r() * 30 });
}
function wpFlake(anywhere) {
  const z = Math.random();                  // 0 far … 1 near
  const r = 0.6 + z * z * 3.6;
  return { x: Math.random() * (wp.w + 80) - 40, y: anywhere ? Math.random() * wp.h : -10 - Math.random() * 40,
           r, z, vy: 16 + z * 60 + Math.random() * 12, ph: Math.random() * Math.PI * 2, sw: 8 + Math.random() * 22, a: 0.45 + z * 0.5 };
}
function wpSnowStep(dt) {
  // the wind changes slowly; now and then it gusts, and the snow streams with it
  if (wp.gustT > 0) {
    wp.gustT -= dt;
    if (wp.gustT <= 0) wp.windTo = (Math.random() - 0.5) * 50;
  } else if (Math.random() < dt * 0.035) {
    wp.gustT = 2 + Math.random() * 2.5;
    wp.windTo = (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 90);
    wpGustSound(wp.gustT);
  } else if (Math.random() < dt * 0.15) wp.windTo = (Math.random() - 0.5) * 60;
  wp.wind += (wp.windTo - wp.wind) * Math.min(1, dt * (wp.gustT > 0 ? 1.2 : 0.4));
  const want = Math.round((wp.w * wp.h) / 4200 * wpAmount() * (wpLite() ? 0.6 : 1));
  for (const f of wp.flakes) {
    f.ph += dt * (0.6 + f.z);
    f.y += f.vy * dt;
    f.x += (Math.sin(f.ph) * f.sw * 0.6 + wp.wind * (0.4 + f.z)) * dt;
  }
  wp.flakes = wp.flakes.filter((f) => f.y - f.r < wp.h + 10 && f.x > -60 && f.x < wp.w + 60);
  while (wp.flakes.length < Math.min(want, 700)) wp.flakes.push(wpFlake(false));
  for (const w of wp.windows) {
    if (wp.t > w.next) { w.on = !w.on; w.next = wp.t + 8 + Math.random() * 40; }
    w.lit += ((w.on ? 1 : 0) - w.lit) * Math.min(1, dt * 1.5);
  }
}
function wpDrawSnow(g, still) {
  const k = wp.dpr, m = wp.m, dark = wpDark();
  const hills = wpOff(0.2);
  g.drawImage(wp.back, -m + hills.x, -m + hills.y);
  g.globalCompositeOperation = 'lighter';
  for (const w of wp.windows) {
    if (w.lit < 0.02) continue;
    g.globalAlpha = 0.5 * w.lit;
    g.drawImage(wpGlow('255,190,110'), w.x - m + hills.x - w.rad, w.y - m + hills.y - w.rad, w.rad * 2, w.rad * 2);
  }
  const bank = wpOff(0.35), glint = wpGlow('255,255,255', 0.15);
  for (const q of wp.glints) {
    const a = Math.pow(Math.max(0, Math.sin(wp.t * q.f + q.ph)), 14);
    if (a < 0.03) continue;
    g.globalAlpha = a * (dark ? 0.9 : 0.7);
    g.drawImage(glint, q.x - m + bank.x - q.d * 2, q.y - m + bank.y - q.d * 2, q.d * 4, q.d * 4);
  }
  g.globalCompositeOperation = 'source-over';
  // the flakes: one soft disc, stretched to each; the near ones move most as the view leans
  const flake = wpGlow('255,255,255');
  for (const f of wp.flakes) {
    const o = wpOff(0.25 + f.z * 0.75);
    const x = f.x * k + o.x, y = f.y * k + o.y, r = f.r * k * (f.r > 2.2 ? 1.6 : 1.15);
    g.globalAlpha = f.a;
    g.drawImage(flake, x - r, y - r, r * 2, r * 2);
  }
  g.globalAlpha = 1;
  // frost on the window's edge, on the glass: it does not move
  if (wp.frame) { g.globalAlpha = dark ? 0.6 : 0.45; g.drawImage(wp.frame, 0, 0); g.globalAlpha = 1; }
}

/* ---- a night sky (3.3) ---- */
function wpSeedStars() {
  const r = Math.random, W = wp.back.width, H = wp.back.height, k = wp.dpr;
  const n = Math.round((wpLite() ? 70 : 170) * (0.4 + wpAmount() * 0.6) * (wpDark() ? 1 : 0.35));
  for (let i = 0; i < n; i++) {
    wp.stars.push({ x: r() * W, y: r() * H * 0.78, d: (0.8 + r() * r() * 2.2) * k, a: 0.45 + r() * 0.55, f: 0.5 + r() * 2.2, ph: r() * 6.3,
      col: r() < 0.18 ? '255,222,190' : r() < 0.36 ? '200,215,255' : '255,255,255' });
  }
  const hues = wpDark() ? ['90,255,170', '70,220,230', '190,110,255'] : ['150,240,200', '200,170,255'];
  for (let i = 0; i < (wpLite() ? 2 : 3); i++) {
    wp.ribbons.push({ base: 0.2 + i * 0.07 + r() * 0.06, amp: 0.035 + r() * 0.03, k: (Math.PI * 2) / (W * (0.55 + r() * 0.6)), sp: 0.06 + r() * 0.07,
      k2: (Math.PI * 2) / (W * (0.25 + r() * 0.3)), sp2: 0.04 + r() * 0.05, ph: r() * 6.3, ph2: r() * 6.3,
      h: 0.14 + r() * 0.14, hue: hues[i % hues.length], a: (wpDark() ? 0.09 : 0.05) + r() * 0.06 });
  }
}
// an aurora's curtain, one strip of it: its lower edge bright, fading as it rises
function wpCurtain(rgb) {
  return wpSprite('curtain:' + rgb, (c) => {
    c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(0.06, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  });
}
function wpStarsStep(dt) {
  if (wp.t > wp.nextShot) {
    wp.nextShot = wp.t + (wpDark() ? 3 : 9) + Math.random() * (14 - wpAmount() * 8);
    const k = wp.dpr, W = wp.back.width, H = wp.back.height, dir = Math.random() < 0.5 ? -1 : 1;
    const sp = (520 + Math.random() * 420) * k, ang = (0.35 + Math.random() * 0.35);
    wp.shots.push({ x: W * (0.2 + Math.random() * 0.6), y: H * (0.05 + Math.random() * 0.3), vx: dir * Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      len: (90 + Math.random() * 90) * k, life: 0.5 + Math.random() * 0.6, age: 0 });
  }
  for (const s of wp.shots) { s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; }
  wp.shots = wp.shots.filter((s) => s.age < s.life);
}
function wpDrawStars(g, still) {
  const m = wp.m, k = wp.dpr, dark = wpDark(), W = wp.back.width, H = wp.back.height;
  const sky = wpOff(0.08);
  g.drawImage(wp.back, -m + sky.x, -m + sky.y);
  g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
  // the aurora, in curtains that fold and drift
  const veil = wpOff(0.22), step = (wpLite() ? 14 : 7) * k;
  for (const R of wp.ribbons) {
    const spr = wpCurtain(R.hue), hh = R.h * H;
    for (let x = -step; x < W; x += step) {
      const y = H * R.base + H * R.amp * Math.sin(x * R.k + wp.t * R.sp + R.ph) + H * R.amp * 0.5 * Math.sin(x * R.k2 - wp.t * R.sp2 + R.ph2);
      const fold = 0.5 + 0.5 * Math.sin(x * R.k * 3.1 + wp.t * R.sp * 2.3 + R.ph2);
      g.globalAlpha = R.a * (0.25 + 0.75 * fold * fold);
      g.drawImage(spr, x - m + veil.x, y - hh - m + veil.y, step + 1, hh * (0.75 + 0.25 * fold));
    }
  }
  // the bright stars twinkle
  for (const s of wp.stars) {
    g.globalAlpha = s.a * (still ? 0.8 : 0.55 + 0.45 * Math.sin(wp.t * s.f + s.ph));
    g.drawImage(wpGlow(s.col, 0.3), s.x - m + sky.x - s.d * 2, s.y - m + sky.y - s.d * 2, s.d * 4, s.d * 4);
  }
  // and now and then one falls
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  for (const s of wp.shots) {
    const f = Math.min(1, s.age / 0.12) * (1 - s.age / s.life), sp = Math.hypot(s.vx, s.vy) || 1;
    const tx = s.x - s.vx / sp * s.len, ty = s.y - s.vy / sp * s.len;
    const gr = g.createLinearGradient(s.x, s.y, tx, ty);
    gr.addColorStop(0, `rgba(255,255,255,${0.9 * f})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.strokeStyle = gr; g.lineWidth = 1.6 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s.x - m + sky.x, s.y - m + sky.y); g.lineTo(tx - m + sky.x, ty - m + sky.y); g.stroke();
  }
  // the ridge of hills and pines, nearest of all
  const ridge = wpOff(0.6);
  g.drawImage(wp.fore, -m + ridge.x, -m + ridge.y);
}

function wpStep(dt, still) {
  const c = $('wpCanvas');
  if (!c || !wp.back) return;
  const g = c.getContext('2d');
  wp.t += dt;
  wpCamera(dt);
  if (wp.kind === 'rain') { if (!still) wpRainStep(dt); wpDrawRain(g, still); }
  else if (wp.kind === 'snow') { if (!still) wpSnowStep(dt); wpDrawSnow(g, still); }
  else if (wp.kind === 'stars') { if (!still) wpStarsStep(dt); wpDrawStars(g, still); }
}

/* ---- the sound (3.3) ----
   All of it made here, from one two-second buffer of noise: filters shape it
   into rain, wind or the hush of a night, and short bursts of it, or of a
   tone, are the drops on the glass and the crickets. One AudioContext,
   suspended whenever nothing is playing. The level is Settings ▸ Wallpaper ▸
   Volume (`wpVolume`), and it fades in and out rather than starting dead. */
/* `loops` hold one timer each, however long they run; `later` holds the
   one-off timers until they fire. (An array of every timer ever set grew by
   eight a second in the rain.) */
const wpAu = { ctx: null, noise: null, out: null, kind: '', stop: [], loops: [], later: new Set() };
function wpSoundWanted() {
  const s = state.settings;
  return s.wpSound && WP_LIVE.includes(wp.kind) && document.visibilityState === 'visible' ? wp.kind : '';
}
function wpSoundLevel() { return clamp(+state.settings.wpVolume || 0, 0, 100) / 100 * 0.6; }
function wpSoundSync() {
  const want = wpSoundWanted();
  if (want && want === wpAu.kind) { wpAu.out.gain.setTargetAtTime(wpSoundLevel(), wpAu.ctx.currentTime, 0.25); return; }
  wpSoundStop();
  if (!want) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = wpAu.ctx || (wpAu.ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (!wpAu.noise) {
      const b = ctx.createBuffer(2, ctx.sampleRate * 2, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        // pink-ish noise (Paul Kellet's filter): rain and wind sound rounder than white
        const d = b.getChannelData(ch);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
      }
      wpAu.noise = b;
    }
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(ctx.destination);
    out.gain.setTargetAtTime(wpSoundLevel(), ctx.currentTime, 0.9);
    wpAu.out = out; wpAu.kind = want;
    if (want === 'rain') wpRainSound(ctx, out);
    else if (want === 'snow') wpWindSound(ctx, out);
    else wpNightSound(ctx, out);
  } catch (_) { wpSoundStop(); }
}
function wpSoundStop() {
  wpAu.loops.forEach((l) => clearTimeout(l.id)); wpAu.loops = [];
  wpAu.later.forEach(clearTimeout); wpAu.later.clear();
  const ctx = wpAu.ctx, out = wpAu.out, stops = wpAu.stop;
  wpAu.kind = ''; wpAu.out = null; wpAu.stop = [];
  if (!ctx || !out) return;
  try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.18); } catch (_) {}
  setTimeout(() => {
    stops.forEach((n) => { try { n.stop(); } catch (_) {} });
    try { out.disconnect(); } catch (_) {}
    if (!wpAu.kind && ctx.state === 'running') ctx.suspend().catch(() => {});
  }, 900);
}
// a loop of the noise from a random place in it, through the filters given, into `to`
function wpNoiseBed(ctx, to, filters, level) {
  const src = ctx.createBufferSource();
  src.buffer = wpAu.noise; src.loop = true;
  let at = src;
  for (const [type, f, q] of filters) {
    const n = ctx.createBiquadFilter();
    n.type = type; n.frequency.value = f; if (q) n.Q.value = q;
    at.connect(n); at = n;
  }
  const g = ctx.createGain();
  g.gain.value = level;
  at.connect(g); g.connect(to);
  src.start(0, Math.random() * 1.9);
  wpAu.stop.push(src);
  return { src, gain: g, filter: at === src ? null : at };
}
// a slow wobble on a parameter: an oscillator at `hz`, `depth` either side
function wpLfo(ctx, param, hz, depth) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = hz; g.gain.value = depth;
  o.connect(g); g.connect(param);
  o.start();
  wpAu.stop.push(o);
}
// `fn` again and again, `lo`–`hi` ms apart, until the sound stops
function wpAgain(fn, lo, hi) {
  const loop = { id: 0 };
  const go = () => { if (!wpAu.kind) return; fn(); loop.id = setTimeout(go, lo + Math.random() * (hi - lo)); };
  loop.id = setTimeout(go, lo + Math.random() * (hi - lo));
  wpAu.loops.push(loop);
}
// `fn` once, `ms` from now, forgotten when it has run or the sound stops
function wpLater(fn, ms) {
  const id = setTimeout(() => { wpAu.later.delete(id); fn(); }, ms);
  wpAu.later.add(id);
}
function wpRainSound(ctx, out) {
  const amt = wpAmount();
  const bed = wpNoiseBed(ctx, out, [['highpass', 380], ['lowpass', 5200]], 0.35 + amt * 0.45);
  wpLfo(ctx, bed.gain.gain, 0.13, 0.08);
  const hiss = wpNoiseBed(ctx, out, [['bandpass', 2600, 0.8]], 0.16 + amt * 0.12);
  wpLfo(ctx, hiss.gain.gain, 0.07, 0.06);
  // drops on the glass: short bright ticks, here and there
  wpAgain(() => {
    const t = ctx.currentTime, src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = wpAu.noise;
    bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 4800; bp.Q.value = 3 + Math.random() * 4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    let to = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; g.connect(p); to = p; }
    src.connect(bp); bp.connect(g); to.connect(out);
    src.start(t, Math.random() * 1.9, 0.07);
  }, 60 + (1 - amt) * 220, 160 + (1 - amt) * 420);
}
// thunder a moment after the sky lit up, as loud as the light was bright
function wpThunderLater(s, strength) {
  if (wpAu.kind !== 'rain') return;
  wpLater(() => {
    const ctx = wpAu.ctx;
    if (wpAu.kind !== 'rain' || !ctx) return;
    for (const [f, delay, len] of [[140, 0, 3.2], [80, 0.5, 4.2]]) {
      const t = ctx.currentTime + delay, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = wpAu.noise; src.loop = true;
      lp.type = 'lowpass'; lp.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * clamp(strength, 0.3, 1), t + 0.35); g.gain.exponentialRampToValueAtTime(0.001, t + len);
      src.connect(lp); lp.connect(g); g.connect(wpAu.out);
      src.start(t, Math.random()); src.stop(t + len + 0.1);
    }
  }, s * 1000);
}
function wpWindSound(ctx, out) {
  const wind = wpNoiseBed(ctx, out, [['lowpass', 650], ['bandpass', 420, 0.7]], 0.6);
  wpLfo(ctx, wind.filter.frequency, 0.06, 220);
  wpLfo(ctx, wind.gain.gain, 0.09, 0.22);
  wpAu.wind = wind;
}
// the snow's gust, heard: the wind rises and falls back
function wpGustSound(s) {
  const w = wpAu.wind, ctx = wpAu.ctx;
  if (wpAu.kind !== 'snow' || !w || !ctx) return;
  const t = ctx.currentTime;
  w.gain.gain.cancelScheduledValues(t);
  w.gain.gain.setValueAtTime(w.gain.gain.value, t);
  w.gain.gain.linearRampToValueAtTime(1.15, t + 0.9);
  w.gain.gain.linearRampToValueAtTime(0.6, t + 0.9 + s);
}
function wpNightSound(ctx, out) {
  wpNoiseBed(ctx, out, [['lowpass', 320]], 0.12);
  // two crickets, one either side, each with its own pace
  for (const pan of [-0.55, 0.6]) {
    const pitch = 4200 + Math.random() * 700;
    wpAgain(() => {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = pitch;
      g.gain.value = 0;
      for (let i = 0; i < 3 + (Math.random() * 2 | 0); i++) {
        const at = t + i * 0.026;
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.03, at + 0.006); g.gain.linearRampToValueAtTime(0, at + 0.016);
      }
      let to = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); to = p; }
      o.connect(g); to.connect(out);
      o.start(t); o.stop(t + 0.16);
    }, 450, 1400);
  }
}

function wireWallpaper() {
  window.addEventListener('resize', () => { if (WP_LIVE.includes(wp.kind)) wpResize(false); });
  // a theme that turns light or dark repaints the backdrop (applyTheme calls applySettings → here, with the mode already set)
  new MutationObserver(() => { if (WP_LIVE.includes(wp.kind)) wpResize(true); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { if (wp.kind !== 'none') applyWallpaper(); });
  // where the pointer is, for depth: a lean towards it, and none once it leaves the window
  window.addEventListener('pointermove', (e) => {
    wp.look.x = e.clientX / Math.max(1, window.innerWidth) - 0.5;
    wp.look.y = e.clientY / Math.max(1, window.innerHeight) - 0.5;
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { wp.look.x = wp.look.y = 0; });
  // the sound stops with the window, and comes back with it
  document.addEventListener('visibilitychange', wpSoundSync);
}
