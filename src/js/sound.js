/* Mental Board — sound.js
   Menu sounds: off unless switched on, made on the spot, never loaded.

   Part 3 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 3b. menu sounds ───────────────

   Settings ▸ Appearance ▸ "Menu sounds" (2.1). Off by default and quiet when
   on: this is the feel of a game's options screen — a low, dry tick as the
   highlight moves, a weighty thunk with a short metallic ring when something
   is chosen, a falling tone going back, a breath of air when a panel opens —
   and nothing on the canvas itself. Notes, drags and typing stay silent.

   Every sound is synthesised with the Web Audio API when it is played. There
   are no audio files, so nothing is shipped, nothing is fetched (the CSP
   would refuse it anyway), and none of it is anybody else's recording. The
   reverb is a generated impulse — a second of decaying noise — which is what
   gives the cues their sense of a large dark room.

   Wiring is by delegation, in wireSounds(): one pointerover and one click
   listener on the document decide from the element whether it is a menu
   control at all, and a MutationObserver on the panels hears them open and
   close. So no menu has to know this file exists, and a menu added later
   makes sounds by having the classes the others have. */

let sfxCtx = null, sfxOut = null, sfxVerb = null, keyOut = null, keyVerb = null, keyNoise = null;
let sfxLast = { kind: '', at: 0 };
let sfxHoverEl = null;

function sfxReady() {
  const s = state.settings;
  if (!s.sounds || !audioCtx()) return null;
  sfxOut.gain.value = clamp((+s.soundVol || 0) / 100, 0, 1) * 0.9;
  return sfxCtx;
}
/* The one AudioContext, made the first time anything wants to make a sound —
   the menu sounds and the typing sounds share it, and each has its own level. */
function audioCtx() {
  if (!sfxCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { sfxCtx = new AC({ latencyHint: 'interactive' }); } catch (_) { return null; }
    sfxOut = sfxCtx.createGain();
    // a gentle low shelf off the top, so nothing is ever bright or harsh
    const tone = sfxCtx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 6500; tone.Q.value = 0.4;
    sfxOut.connect(tone); tone.connect(sfxCtx.destination);
    sfxVerb = sfxCtx.createConvolver();
    sfxVerb.buffer = roomImpulse(sfxCtx, 1.1);
    const wet = sfxCtx.createGain(); wet.gain.value = 0.22;
    sfxVerb.connect(wet); wet.connect(tone);
    // the keyboard's own level, and a much smaller room: a desk, not a hall
    keyOut = sfxCtx.createGain();
    keyOut.connect(sfxCtx.destination);
    keyVerb = sfxCtx.createConvolver();
    keyVerb.buffer = roomImpulse(sfxCtx, 0.18);
    const kwet = sfxCtx.createGain(); kwet.gain.value = 0.12;
    keyVerb.connect(kwet); kwet.connect(keyOut);
  }
  if (sfxCtx.state === 'suspended') sfxCtx.resume().catch(() => {});
  return sfxCtx;
}
// a second of noise, falling away — the room the sounds are played in
function roomImpulse(ctx, secs) {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  return buf;
}

// one enveloped voice: an oscillator or a noise burst, through a filter, to both buses
function voice(ctx, o) {
  const t0 = ctx.currentTime + (o.delay || 0);
  let src;
  if (o.noise) {
    const len = Math.ceil(ctx.sampleRate * (o.dur + 0.02));
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    src = ctx.createBufferSource(); src.buffer = b;
  } else {
    src = ctx.createOscillator();
    src.type = o.type || 'sine';
    src.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) src.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
  }
  let node = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.ff0 || 1000, t0);
    if (o.ff1) f.frequency.exponentialRampToValueAtTime(o.ff1, t0 + o.dur);
    node.connect(f); node = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack || 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  node.connect(g);
  g.connect(sfxOut);
  if (o.verb !== false) g.connect(sfxVerb);
  src.start(t0);
  src.stop(t0 + o.dur + 0.05);
}

const SFX = {
  // the highlight moving: a soft, dry tick with a little body under it
  move: (c) => {
    voice(c, { noise: true, filter: 'bandpass', ff0: 2600, q: 2.2, gain: 0.11, dur: 0.028, verb: false });
    voice(c, { f0: 320, f1: 260, gain: 0.07, dur: 0.06 });
  },
  // a choice made: a low thunk, then a short metallic ring over it
  select: (c) => {
    voice(c, { f0: 150, f1: 62, gain: 0.32, dur: 0.16, attack: 0.002 });
    voice(c, { noise: true, filter: 'lowpass', ff0: 1800, ff1: 400, gain: 0.12, dur: 0.07 });
    voice(c, { type: 'triangle', f0: 1046, gain: 0.05, dur: 0.32, delay: 0.012 });
    voice(c, { type: 'sine', f0: 1568, gain: 0.025, dur: 0.26, delay: 0.012 });
  },
  // going back: one tone, falling
  back: (c) => {
    voice(c, { type: 'triangle', f0: 520, f1: 240, gain: 0.08, dur: 0.14 });
    voice(c, { f0: 130, f1: 80, gain: 0.12, dur: 0.12 });
  },
  // a panel opening: air rising through a filter, and a low swell
  open: (c) => {
    voice(c, { noise: true, filter: 'bandpass', ff0: 380, ff1: 2200, q: 1.4, gain: 0.07, dur: 0.24, attack: 0.05 });
    voice(c, { f0: 98, f1: 130, gain: 0.1, dur: 0.24, attack: 0.04 });
  },
  // a switch flipped: two close ticks
  toggle: (c) => {
    voice(c, { noise: true, filter: 'bandpass', ff0: 3200, q: 3, gain: 0.09, dur: 0.02, verb: false });
    voice(c, { noise: true, filter: 'bandpass', ff0: 2200, q: 3, gain: 0.08, dur: 0.022, delay: 0.045, verb: false });
    voice(c, { f0: 240, gain: 0.05, dur: 0.07, delay: 0.045 });
  }
};

/* Play one. Two rules keep it from ever chattering: the same cue is not
   repeated inside 35 ms, and a "back" or "open" that lands just after a
   "select" is dropped — clicking a menu row closes the menu, and the click is
   the sound that means something. */
function sfx(kind) {
  if (!SFX[kind]) return;
  const ctx = sfxReady();
  if (!ctx) return;
  const now = performance.now();
  if (kind === sfxLast.kind && now - sfxLast.at < 35) return;
  if ((kind === 'back' || kind === 'open') && sfxLast.kind === 'select' && now - sfxLast.at < 180) return;
  sfxLast = { kind, at: now };
  try { SFX[kind](ctx); } catch (_) { /* a sound that fails is a sound you did not hear */ }
}

/* What counts as a menu control. Kept to the chrome — menus, the settings
   panel, dialogs, the rail, the bars — and never a note or the canvas. */
const SFX_ITEMS = [
  '.cm-item', '.cm-st', '.cm-colors button', '.cm-pos button', '.cm-dt',
  '#pageMenu button', '#boardMenu button', '.set-tab', '.seg button', '.set-check',
  '.theme-card', '.swatches button', '.paper-row button', '.set-btns .btn', '.sheet .btn',
  '.sm-item', '.pal-item', '.ln-item', '.bp-item', '.br-tile', '.fab-item', '#fab',
  '#zoombar button', '.ik-tool', '.ik-size', '.ik-sw', '.ik-btn', '.ik-custom',
  '.tb-gear', '#pageBtn', '.sheet-x', '.eh-start', '.kb-col', '.ag-item'
].join(', ');
const SFX_PANELS = ['ctxMenu', 'boardMenu', 'pageMenu', 'settings', 'slashMenu', 'palette', 'linkDlg',
  'confirmDlg', 'iconPicker', 'agendaDlg', 'kanbanDlg', 'moveDlg', 'tplDlg', 'remindDlg', 'histDlg',
  'boardPick', 'passDlg', 'embedDlg', 'inkBar', 'studio'];

function wireSounds() {
  document.addEventListener('pointerover', (e) => {
    if (!state.settings.sounds) return;
    const el = e.target.closest && e.target.closest(SFX_ITEMS);
    if (el === sfxHoverEl) return;
    sfxHoverEl = el;
    if (el && !el.disabled) sfx('move');
  }, { passive: true });
  document.addEventListener('click', (e) => {
    if (!state.settings.sounds) return;
    const el = e.target.closest && e.target.closest(SFX_ITEMS);
    if (!el || el.disabled) return;
    sfx(el.matches('.set-check, .set-check *') ? 'toggle' : 'select');
  }, true);
  // arrow keys through a list are the highlight moving too
  document.addEventListener('keydown', (e) => {
    if (!state.settings.sounds || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    if ((typeof slash !== 'undefined' && slash.open) || (typeof palette !== 'undefined' && palette.open)) sfx('move');
  }, true);
  // panels opening and closing, heard from the outside
  const seen = new Map();
  const obs = new MutationObserver((list) => {
    if (!state.settings.sounds) return;
    for (const m of list) {
      const el = m.target;
      const open = !el.classList.contains('hidden');
      if (seen.get(el) === open) continue;
      seen.set(el, open);
      sfx(open ? 'open' : 'back');
    }
  });
  SFX_PANELS.forEach((id) => {
    const el = $(id);
    if (!el) return;
    seen.set(el, !el.classList.contains('hidden'));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
}

/* ─────────────── 3c. a mechanical keyboard under your typing ───────────────

   Settings ▸ Extra ▸ Typing sounds (2.1), off by default. Every key you type
   into the app — a note, a field, a dialog — plays the switch you picked:

     blue        clicky: a sharp click jacket on the way down, a tick on release
     brown       tactile: a soft bump, then the keycap bottoming out
     red         linear: no click at all, just a smooth, deeper thock
     black       heavy linear: the same, lower and weightier
     membrane    an ordinary office keyboard: short and muffled
     typewriter  a type bar striking, and the bell on Enter

   Each press is a few enveloped voices off one cached second of noise, so
   typing fast allocates nothing. A little random pitch and level on every
   press keeps it from sounding like one sample played over and over, and the
   big keys — Space, Enter, Backspace — sound bigger, the way their
   stabilisers make them. Holding a key down does not repeat the sound: a real
   switch is only pressed once. */
function keyReady() {
  const s = state.settings;
  if (s.keySounds === 'off' || !audioCtx()) return null;
  keyOut.gain.value = clamp((+s.keyVol || 0) / 100, 0, 1) * 0.85;
  if (!keyNoise) {
    keyNoise = sfxCtx.createBuffer(1, sfxCtx.sampleRate, sfxCtx.sampleRate);
    const d = keyNoise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return sfxCtx;
}
// one voice for the keyboard: noise through a filter, or a tone, enveloped
function kv(ctx, o) {
  const t0 = ctx.currentTime + (o.delay || 0);
  let src;
  if (o.noise) {
    src = ctx.createBufferSource(); src.buffer = keyNoise;
    src.playbackRate.value = o.rate || 1;
  } else {
    src = ctx.createOscillator(); src.type = o.type || 'sine';
    src.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) src.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
  }
  let node = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter; f.frequency.value = o.ff; f.Q.value = o.q || 1;
    node.connect(f); node = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  node.connect(g); g.connect(keyOut); g.connect(keyVerb);
  const off = o.noise ? Math.random() * 0.8 : 0;     // a different stretch of noise each time
  if (o.noise) src.start(t0, off, o.dur + 0.02); else { src.start(t0); src.stop(t0 + o.dur + 0.02); }
}
/* `k` is the key's weight: 1 an ordinary key, bigger for the long ones. `j` is
   this press's own small variation, so no two presses are the same. */
const KEY_SWITCHES = {
  blue: {
    down: (c, k, j) => {
      kv(c, { noise: true, filter: 'bandpass', ff: 5200 * j, q: 4, gain: 0.42, dur: 0.012 });
      kv(c, { noise: true, filter: 'bandpass', ff: 3600 * j, q: 3, gain: 0.3, dur: 0.014, delay: 0.006 });
      kv(c, { f0: 190 * j / k, f1: 120 / k, gain: 0.22 * k, dur: 0.045, delay: 0.014 });
    },
    up: (c, k, j) => kv(c, { noise: true, filter: 'bandpass', ff: 4400 * j, q: 4, gain: 0.2, dur: 0.01 })
  },
  brown: {
    down: (c, k, j) => {
      kv(c, { noise: true, filter: 'bandpass', ff: 2300 * j, q: 2, gain: 0.2, dur: 0.016 });
      kv(c, { noise: true, filter: 'lowpass', ff: 1700 * j, gain: 0.26 * k, dur: 0.028, delay: 0.012 });
      kv(c, { f0: 150 * j / k, f1: 100 / k, gain: 0.24 * k, dur: 0.05, delay: 0.012 });
    },
    up: (c, k, j) => kv(c, { noise: true, filter: 'bandpass', ff: 1900 * j, q: 2, gain: 0.08, dur: 0.014 })
  },
  red: {
    down: (c, k, j) => {
      kv(c, { noise: true, filter: 'lowpass', ff: 1300 * j, gain: 0.3 * k, dur: 0.03 });
      kv(c, { f0: 128 * j / k, f1: 88 / k, gain: 0.3 * k, dur: 0.06 });
    },
    up: (c, k, j) => kv(c, { noise: true, filter: 'lowpass', ff: 1500 * j, gain: 0.07, dur: 0.018 })
  },
  black: {
    down: (c, k, j) => {
      kv(c, { noise: true, filter: 'lowpass', ff: 900 * j, gain: 0.34 * k, dur: 0.038 });
      kv(c, { f0: 98 * j / k, f1: 66 / k, gain: 0.38 * k, dur: 0.075 });
    },
    up: (c, k, j) => kv(c, { noise: true, filter: 'lowpass', ff: 1100 * j, gain: 0.09, dur: 0.02 })
  },
  membrane: {
    down: (c, k, j) => {
      kv(c, { noise: true, filter: 'lowpass', ff: 800 * j, gain: 0.2 * k, dur: 0.026 });
      kv(c, { f0: 210 * j / k, gain: 0.1 * k, dur: 0.025 });
    },
    up: null
  },
  typewriter: {
    down: (c, k, j, key) => {
      kv(c, { noise: true, filter: 'bandpass', ff: 1800 * j, q: 1.2, gain: 0.42 * k, dur: 0.035 });
      kv(c, { type: 'triangle', f0: 2600 * j, gain: 0.05, dur: 0.07, delay: 0.004 });
      kv(c, { f0: 120 * j, f1: 80, gain: 0.25 * k, dur: 0.07, delay: 0.01 });
      // the carriage-return bell
      if (key === 'Enter') { kv(c, { f0: 2093, gain: 0.12, dur: 0.5, delay: 0.06 }); kv(c, { f0: 3136, gain: 0.06, dur: 0.4, delay: 0.06 }); }
    },
    up: null
  }
};
const KEY_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'OS']);
function keyWeight(key) {
  if (key === ' ' || key === 'Spacebar') return 1.5;
  if (key === 'Enter' || key === 'Backspace' || key === 'Tab') return 1.25;
  return 1;
}
// play one press or release of the chosen switch; `key` as in KeyboardEvent.key
function keySfx(key, up, which) {
  const sw = KEY_SWITCHES[which || state.settings.keySounds];
  if (!sw || !keyReady()) return;
  const fn = up ? sw.up : sw.down;
  if (!fn) return;
  const j = 0.94 + Math.random() * 0.12;
  try { fn(sfxCtx, keyWeight(key), j, key); } catch (_) {}
}
/* Typing is a keystroke whose target can take text: a note being edited, any
   field, any text area. Shortcuts on the canvas are not typing, and neither
   is a key held down. */
const typingTarget = (el) => !!(el && el.closest && el.closest('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]), textarea, [contenteditable="true"]'));
function wireKeySounds() {
  document.addEventListener('keydown', (e) => {
    if (state.settings.keySounds === 'off' || e.repeat || KEY_MODIFIERS.has(e.key)) return;
    if (!typingTarget(e.target)) return;
    keySfx(e.key, false);
  }, true);
  document.addEventListener('keyup', (e) => {
    if (state.settings.keySounds === 'off' || KEY_MODIFIERS.has(e.key)) return;
    if (!typingTarget(e.target)) return;
    keySfx(e.key, true);
  }, true);
}
