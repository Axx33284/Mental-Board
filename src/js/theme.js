/* Mental Board — theme.js
   What the app looks like: themes, the clock, the custom palette, and applySettings().

   Part 4 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 3. settings + theme ─────────────── */
let systemDark = true;
const mql = window.matchMedia('(prefers-color-scheme: dark)');

/* Is it light out, by the clock the user set?

   Written as "the night has started" rather than "the day has ended" so the
   wrap-around case needs no special handling: nightAt 19:00 → dayAt 07:00 is a
   window that crosses midnight, and someone who works nights can invert the
   two and get exactly the inverse without the app having an opinion about it.
   Equal times mean the switch never fires, which is a fixed theme by another
   name and so is left to behave that way rather than being rejected. */
function clockSaysDark(now) {
  const s = state.settings;
  const d = clockMinutes(s.dayAt), n = clockMinutes(s.nightAt);
  if (d === n) return systemDark;
  const t = (now || new Date());
  const m = t.getHours() * 60 + t.getMinutes();
  return (d < n) ? (m < d || m >= n) : (m < d && m >= n);
}

function resolvedTheme() {
  const s = state.settings;
  if (s.themeMode === 'system') return themeById(systemDark ? s.darkTheme : s.lightTheme);
  if (s.themeMode === 'clock') return themeById(clockSaysDark() ? s.darkTheme : s.lightTheme);
  return themeById(s.theme);
}

/* The clock mode has to be *watched*, not read once at boot. A minute is fine:
   the switch happens at a minute boundary either way, and a tick that does
   nothing costs one comparison. It only reapplies when the answer changed, so
   nothing is repainted sixty times an hour for no reason. */
let clockTheme = null;
function startThemeClock() {
  setInterval(() => {
    if (state.settings.themeMode !== 'clock') { clockTheme = null; return; }
    const dark = clockSaysDark();
    if (dark === clockTheme) return;
    clockTheme = dark;
    applyThemeFaded(1800);           // sunrise and sunset: the slow fade
    // only when the panel is on screen: syncSettingsUI() walks every board
    if (!$('settings').classList.contains('hidden')) syncSettingsUI();
  }, 60000);
}

/* ---- the user's own palette ----
   Three colours in, a whole theme out. Everything a theme needs beyond the
   background, the surface and the text is a mix of those three, so a custom
   palette cannot end up with a hairline it cannot show or text it cannot read
   — the two ways a colour picker normally lets you build something unusable. */
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgbToHex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, t) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgbaOf = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
// perceived brightness, 0–1 — used only to decide which way "raised" goes
const lumaOf = (hex) => { const c = hexToRgb(hex); return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255; };

function customVars(ct) {
  const dark = ct.mode !== 'light';
  const { bg, surface, text } = ct;
  /* Raised surfaces move *away* from the background, whichever way that is.
     Deriving them as "lighter" would make every light custom theme lose its
     panels against the page. */
  const lift = dark ? '#ffffff' : '#000000';
  return {
    '--bg': bg,
    '--surface': surface,
    '--surface-2': mixHex(surface, lift, dark ? 0.05 : 0.035),
    '--surface-3': mixHex(surface, lift, dark ? 0.11 : 0.08),
    '--text': text,
    '--dim': mixHex(text, bg, 0.36),
    '--dimmer': mixHex(text, bg, 0.56),
    '--line': rgbaOf(text, dark ? 0.12 : 0.14),
    '--line-2': rgbaOf(text, dark ? 0.22 : 0.26),
    '--grid-dot': rgbaOf(text, dark ? 0.10 : 0.16),
    '--grid-line': rgbaOf(text, dark ? 0.05 : 0.08),
    '--shadow': dark ? '0 12px 32px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.4)'
                     : '0 12px 30px rgba(24,28,48,.14), 0 2px 6px rgba(24,28,48,.09)',
    '--shadow-sm': dark ? '0 4px 14px rgba(0,0,0,.38)' : '0 3px 12px rgba(24,28,48,.12)',
    '--overlay': rgbaOf(mixHex(bg, dark ? '#000000' : '#1c2030', 0.5), dark ? 0.62 : 0.34),
    '--hi': dark ? 'rgba(255,214,102,.32)' : 'rgba(255,204,64,.45)',
    '--danger': dark ? '#ff6b6b' : '#d64545',
    '--code-bg': rgbaOf(text, dark ? 0.055 : 0.055),
    '--scroll': rgbaOf(text, dark ? 0.16 : 0.22),
    '--c-default-b': surface
  };
}
const CUSTOM_VAR_NAMES = Object.keys(customVars({ mode: 'dark', bg: '#000000', surface: '#000000', text: '#ffffff' }));

function applyTheme() {
  minimapThemeChanged();            // the map reads the note colours from the theme
  const t = resolvedTheme();
  const root = document.documentElement;
  /* A custom theme is CSS variables written straight onto the root; every other
     theme is a stylesheet rule. Clearing the inline properties first is what
     makes switching *away* from custom work — an inline value beats any rule,
     so leaving them behind would tint every built-in theme forever. */
  CUSTOM_VAR_NAMES.forEach((k) => root.style.removeProperty(k));
  if (t.id === 'custom') Object.entries(customVars(state.settings.customTheme)).forEach(([k, v]) => root.style.setProperty(k, v));
  root.dataset.theme = t.id;
  root.dataset.mode = t.mode;          // note colours key off this, not the theme id
  /* The accent colour comes from the ACCENTS map, not from a stylesheet rule —
     see the note where those rules used to live in styles.css §2. data-accent
     is still set, because a few rules key off *which* accent is active rather
     than off its colour. */
  const accent = (state.settings.accent === 'custom' || ACCENTS[state.settings.accent]) ? state.settings.accent : 'indigo';
  if (accent !== state.settings.accent) state.settings.accent = accent;
  root.dataset.accent = accent;
  const hex = accentHex();
  root.style.setProperty('--accent', hex);
  /* Label colour on top of the accent.

     The presets used to be a list — amber and lime take dark ink, everything
     else white — because a luminance threshold puts those two on opposite
     sides of the line by a rounding error, and for a fixed set you can just
     look once. A colour the user mixed has no such answer waiting, so the
     threshold is back for that one case only. 0.62 rather than 0.5 because
     white-on-mid is worse to read than dark-on-mid. */
  const darkInk = (accent === 'custom' || accent === 'mono') ? lumaOf(hex) > 0.62 : ['amber', 'lime'].includes(accent);
  root.style.setProperty('--accent-ink', darkInk ? '#1d2030' : '#ffffff');
  /* The OS chrome follows the *reason* as well as the result: in system mode
     hand Windows 'system' so its own transitions stay in step, otherwise name
     the mode we actually landed on. */
  if (THEME) THEME.set(state.settings.themeMode === 'system' ? 'system' : t.mode);
}
/* A theme change that fades instead of cutting (2.1).

   A View Transition: the browser takes one picture of the window as it is,
   applies the change underneath, and crossfades the picture away. One
   composited fade of the whole window — it costs the same on a board of three
   thousand notes as on an empty one, which a CSS transition on every colour of
   every element could never say.

   `ms` is how slow. The clock gets the slowest, because sunset should feel
   like the light going rather than a switch being thrown; following Windows a
   little quicker; a click in Settings quickest, because that one you are
   watching for. Skipped — the change is simply applied — on the Light tier,
   when motion is turned down, when the window is not on screen, and when the
   theme would not actually change (a clock tick that lands on the theme
   already showing must not flash the window). */
let themeFade = null;
function applyThemeFaded(ms) {
  const root = document.documentElement;
  const next = resolvedTheme();
  const accentNow = root.style.getPropertyValue('--accent');
  const reduced = state.settings.motion === 'reduced' ||
    (state.settings.motion !== 'full' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const same = next.id === root.dataset.theme && next.mode === root.dataset.mode && accentNow === accentHex();
  if (same || !document.startViewTransition || reduced || document.hidden ||
      document.body.dataset.perf === 'lite') { applyTheme(); return; }
  if (themeFade) { try { themeFade.skipTransition(); } catch (_) {} }
  root.style.setProperty('--theme-fade', Math.round(ms || 500) + 'ms');
  try {
    themeFade = document.startViewTransition(() => applyTheme());
    themeFade.finished.finally(() => { themeFade = null; });
  } catch (_) { themeFade = null; applyTheme(); }
}

// picking a theme also records it as this user's light or dark choice, so the
// "match Windows" toggle swaps between the two they actually like
function pickTheme(id) {
  const t = themeById(id);
  state.settings.theme = t.id;
  if (t.mode === 'dark') state.settings.darkTheme = t.id; else state.settings.lightTheme = t.id;
  /* Picking a card is an explicit choice, so it wins over following Windows or
     the clock — but the light/dark slot above is still recorded, so switching
     either of those back on returns to the pair the user actually likes. */
  state.settings.themeMode = 'fixed';
  state.settings.matchSystem = false;
  applyThemeFaded(450); syncSettingsUI(); saveSoon();
}
/* Repaint every string in the app for the current language. Called once at
   boot and again whenever the picker changes — nothing here reloads the page,
   so an in-progress edit survives a language switch. */
/* The strings main needs, resolved through t() and handed over.

   Main owns the tray, the "still running" notification and every native file
   dialog, and it has no catalogue — so it would show English whatever the
   window was set to, and check-lang could not see the literals to complain.
   The renderer has the catalogue, so the renderer supplies them.

   The key list lives here rather than in main because these are `t()` calls and
   check-lang reads t() call sites: written out literally, every one of them is
   checked like any other string in the app. Main keeps the same list as its
   English fallback for the moment before this arrives — the tray is built in
   whenReady(), which is earlier than any of this. */
const MAIN_KEYS = [
  'main.trayOpen', 'main.trayCapture', 'main.trayQuit',
  'main.stillRunningTitle', 'main.stillRunningBody',
  'main.exportBoard', 'main.importBoard', 'main.exportImage',
  'main.backupFolder', 'main.insertImage',
  'main.filterJson', 'main.filterPng', 'main.filterImages',
  'main.crashTitle', 'main.crashBody', 'main.crashOk',
  // the phone's drawing page (src/tablet/phone.html) speaks the app's language too
  'main.padTitle', 'main.padConnecting', 'main.padConnected', 'main.padAway',
  'main.padEnded', 'main.padReadonly', 'main.padPen', 'main.padMarker',
  'main.padBrush', 'main.padEraser', 'main.padUndo', 'main.padFingers', 'main.padFull',
  'main.padSelect', 'main.padDelete'
];
function sendMainStrings() {
  if (!WIN || !WIN.setStrings) return;
  const out = {};
  /* `{key}` in main.trayCapture is filled in *there*, from the accelerator main
     owns — so it is passed through unresolved on purpose. t() leaves a
     placeholder it has no variable for exactly as it found it. */
  MAIN_KEYS.forEach((k) => { out[k] = t(k); });
  try { WIN.setStrings(out); } catch (_) {}
}

function applyLang() {
  /* render() below throws away every note element and builds them again. If a
     note is open for editing, `editing` would be left pointing at a detached
     node — the text typed since the last save would never be read back off it,
     and the next keystroke would write into a node nobody can see. Close the
     edit first (which persists it), then reopen the same note afterwards. */
  const wasEditing = editNote && editNote.id;
  exitEdit();

  setLang(state.settings.lang);
  applyStaticText();
  paintVersion();           // applyStaticText() does not own this slot
  buildKeyList();
  buildThemeGrid();
  buildAccentSwatches();
  buildGridPicker();
  buildHilitePop();
  renderBoardRail();        // unnamed boards are labelled "Board n" per language
  render();                 // note/frame chrome carries translated titles
  applyView();              // the zoom readout uses the language's digits
  drawCompass();
  markStatsStale();         // both figures in the Board tab are translated strings
  syncSettingsUI();
  renderTemplateList();     // the empty-state hint is a translated string
  if ($('setDesc')) $('setDesc').dataset.empty = t('set.descEmpty');
  sendMainStrings();        // the tray and the file dialogs follow the window

  if (wasEditing) {
    const n = state.notes.find((x) => x.id === wasEditing);
    if (n) enterEdit(n);
  }
}

/* Is this machine one that should be spending pixels on blur?

   Decided once and cached, because it cannot change while the app is running
   and because `deviceMemory` is a coarse, rounded number that there is no point
   asking twice. Both signals are deliberately conservative: `deviceMemory` is
   capped at 8 by Chromium however much is actually fitted, so `<= 4` really
   does mean a small machine, and two logical cores in 2025 means an old one.

   Erring towards `full` on anything unrecognised is deliberate too. Guessing
   `lite` wrongly makes a good machine look flatter than it should for no
   reason; guessing `full` wrongly costs a user who can flip one switch. */
let autoPerf = null;
let noGpu = false;       // Chromium is drawing this window in software
/* Three answers since 2.1, not two. Between the small machine that needs
   Light and the recent one that can afford everything sits the ordinary
   office laptop — four cores, integrated graphics from a few years ago —
   which can draw shadows perfectly well but pays for backdrop blur on every
   menu. That is Balanced. The graphics chip is asked for by name through
   WebGL's debug extension: a software renderer is Light whatever the CPU
   says, and an older Intel HD part is at most Balanced. */
let perfReason = '';
function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: false });
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();      // one probe, then give the context back
    return name;
  } catch (_) { return ''; }
}
function detectPerf() {
  if (autoPerf) return autoPerf;
  let lite = false, mid = false;
  try {
    const mem = navigator.deviceMemory;       // GB, rounded, capped at 8
    const cpu = navigator.hardwareConcurrency;
    if (typeof mem === 'number' && mem > 0 && mem <= 4) lite = true;
    if (typeof cpu === 'number' && cpu > 0 && cpu <= 2) lite = true;
    if (typeof cpu === 'number' && cpu > 0 && cpu <= 4) mid = true;
  } catch (_) {}
  const gpu = gpuName();
  if (/swiftshader|basic render|llvmpipe|software/i.test(gpu)) lite = true;
  // Intel integrated graphics from before Iris Xe, Arc and the UHD 7xx parts
  else if (/intel/i.test(gpu) && !/iris|arc|uhd graphics 7[0-9][0-9]/i.test(gpu)) mid = true;
  perfReason = gpu;
  /* No usable graphics driver is the strongest signal of all: without a GPU
     every blurred shadow, every backdrop filter and every animated transform
     is rasterised on the CPU, and that — not the JavaScript — is what makes
     the app feel like mud on such a machine. Main asks Chromium once. */
  try {
    const info = SYS && SYS.info ? SYS.info() : null;
    if (info && info.software) { lite = true; noGpu = true; }
  } catch (_) {}
  autoPerf = lite ? 'lite' : mid ? 'balanced' : 'full';
  return autoPerf;
}
function resolvedPerf() {
  const p = state.settings.perf;
  return (p === 'full' || p === 'balanced' || p === 'lite') ? p : detectPerf();
}

function applySettings() {
  const s = state.settings;
  forgetVpRect();           // the rail or focus mode may move the canvas
  applyLinkStyle();
  /* One attribute on <body>; css/later.css §31 does the rest, and view.js reads
     it for how early to start culling. Nothing here re-renders — the modes
     differ only in what is painted, never in what exists. */
  document.body.dataset.perf = resolvedPerf();
  document.body.dataset.cork = s.cork;     // pinned paper on a board (mental.css §62)
  // main decides what the close button does, and this is the only thing telling it
  if (WIN && WIN.setBackground) WIN.setBackground(s.background);
  sendMainStrings();
  document.body.dataset.grid = s.grid;
  document.documentElement.style.setProperty('--grid-fade', (s.gridFade / 100).toFixed(2));
  document.body.dataset.shape = s.noteShape;
  document.body.dataset.density = s.noteDensity;
  document.body.dataset.notefont = s.noteFont;   // applyBoardLook() below lets the board override it
  document.body.dataset.noteshadow = s.noteShadow;
  /* 'auto' deliberately writes *nothing*. The stylesheet already answers it
     with an ordinary `@media (prefers-reduced-motion: reduce)` block, which is
     the operating system's own answer — resolving it here instead would mean
     re-resolving it whenever Windows changed its mind, and this attribute is
     only read at paint time. So: an explicit choice overrides the media query,
     and no choice leaves the media query to it. */
  if (s.motion === 'auto') delete document.body.dataset.motion;
  else document.body.dataset.motion = s.motion;
  /* The canvas on its own. A class rather than an attribute because it is a
     mode, not a value, and because every rule it drives is a `display: none`. */
  document.body.classList.toggle('focus-mode', !!s.focusMode);
  document.documentElement.style.setProperty('--fs', (s.fontScale / 100).toFixed(2));
  document.querySelectorAll('.note-body').forEach((b) => b.spellcheck = !!s.spell);
  applyTheme();
  /* The rail insets #stage, so the viewport box moves. applyView() has to run
     after that or the grid background and every toScreen() result are a rail's
     width out until the next pan. */
  renderBoardRail();
  applyView();
  drawCompass();
  applyBoardLook();
}
