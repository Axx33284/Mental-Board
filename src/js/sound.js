/* Mental Board — sound.js
   Menu sounds: off unless switched on, made on the spot, never loaded.

   Part 3 of 21. These files are plain scripts sharing one global
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

let sfxCtx = null, sfxOut = null, sfxVerb = null;
let sfxLast = { kind: '', at: 0 };
let sfxHoverEl = null;

function sfxReady() {
  const s = state.settings;
  if (!s.sounds) return null;
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
  }
  sfxOut.gain.value = clamp((+s.soundVol || 0) / 100, 0, 1) * 0.9;
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
