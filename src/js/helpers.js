/* Mental Board — helpers.js
   The preamble, the helpers every other file uses, and the language catalogue.

   Part 1 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* =====================================================================
   Mental Board — renderer
   ---------------------------------------------------------------------
   One mutable `state`, one world transform, no framework. The pattern is
   always the same as its sibling project: mutate `state`, call the matching
   render/draw function, call saveSoon().

   Region guide (keep MAP.md in sync if you move these):
     1  helpers                    8  marquee + selection
     2  state + persistence        9  pan / zoom / fly-to
     3  settings + theme          10  links
     4  view transform            11  the note editor
     5  render                    12  context menu
     6  note + frame elements     13  compass (off-screen workflows)
     7  drag + resize             14  undo, clipboard, find
                                  15  settings UI, dialogs
                                  16  keyboard + init
   ===================================================================== */

/* ─────────────── 1. helpers ─────────────── */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/* A tool button that acts on the press (2.7.1). The drawing bars used
   'click', which only fires when the press and the release land on the same
   element — a hand that moves a little across a 30px button, or a bar redrawn
   between the two, and the choice silently did not happen. The user hit
   exactly that in the drawing note's bar and the picture editor. A press is
   one event and cannot be split. The keyboard still works: Enter or Space on a
   focused button makes a click with no pointer behind it (detail 0). */
function onPress(el, fn) {
  if (!el) return;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();            // and the button does not steal the focus from the page
    fn(e);
  });
  el.addEventListener('click', (e) => { if (e.detail === 0) fn(e); });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
/* The largest / smallest of a list, without spreading it into a call.

   `Math.max(1, ...arr.map(f))` is the obvious line and it throws above roughly
   130,000 elements — measured, in this Electron build: spread passes every
   element as a separate argument and V8 runs out of stack. Same failure as
   `btoa(String.fromCharCode(...bytes))`, which is already chunked in §14b.

   It mattered most in `adoptBoard()`, which runs on the *load* path: a board
   that large would throw while being read, `load()` would catch it as
   `unreadable`, and the file would be refused for ever — permanent data loss
   from nothing but a big board. A loop has no such ceiling and is not measurably
   slower at any size the app will ever see. */
function maxOf(arr, fn, seed) {
  let m = seed == null ? -Infinity : seed;
  for (let i = 0; i < arr.length; i++) { const v = fn ? fn(arr[i], i) : arr[i]; if (v > m) m = v; }
  return m;
}
function minOf(arr, fn, seed) {
  let m = seed == null ? Infinity : seed;
  for (let i = 0; i < arr.length; i++) { const v = fn ? fn(arr[i], i) : arr[i]; if (v < m) m = v; }
  return m;
}
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Note body → plain text, for searching, previews and counting.

   `textContent` glues block elements straight together: `<h1>Welcome</h1>`
   followed by `<p>This canvas…</p>` comes back as "WelcomeThis canvas…". That
   is visible in the jump palette and the history preview, it makes Ctrl+F miss
   any phrase that spans two blocks, and it makes the word count in Settings
   read low on every note with more than one paragraph. Put the block boundary
   back as a space before reading the text out.

   `insertAdjacentText` rather than appending a child, because `<br>` is void —
   it can hold no children, and it is exactly the tag most likely to be sitting
   between two words that must not be joined. */
const BLOCK_SEL = 'p,div,li,h1,h2,h3,h4,h5,h6,tr,td,th,pre,blockquote,br,hr';
function stripHtml(html) {
  const d = document.createElement('div');
  d.innerHTML = html || '';
  d.querySelectorAll(BLOCK_SEL).forEach((el) => {
    try { el.insertAdjacentText('afterend', ' '); } catch (_) {}
  });
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ---- text folded for comparison ----
   Arabic writes the same word several ways and people type the easy one.
   `أحمد` is typed `احمد`, `مهمّة` is typed `مهمة`, a word may carry a tatweel
   (`مشـروع`) purely for looks, and a year is as likely to be `٢٠٢٦` as `2026`.
   Comparing the strings as written means a search for what somebody actually
   types finds nothing — which is how Ctrl+F, the jump palette, the template
   list and the icon picker all behaved.

   Both sides go through the same fold: the text and the query. It removes the
   harakat, the hamza marks and the superscript alef; drops the tatweel;
   collapses the alef, ya, ta-marbuta and hamza-carrier forms onto one letter
   each; and maps the Arabic-Indic and Persian digits onto ASCII.

   **This is a comparison key and nothing else.** What the user typed into a
   note is theirs and is stored and displayed exactly as written — nothing here
   ever reaches `state`. Folding for display would be the app correcting
   somebody's spelling of their own language.

   The Latin path is one regex test and then `toLowerCase()`, so an English
   board pays nothing: the fold only runs on text that actually has Arabic in
   it. NFKC is inside that branch on purpose — it costs real time and only
   matters for the presentation forms that arrive when text is pasted out of an
   old PDF (`ﻷ` for `لأ`), which is exactly the text that would otherwise never
   match anything. */
const AR_ANY = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
// harakat, hamza marks, superscript alef, Quranic annotation, and the tatweel
const AR_MARKS = /[ً-ٰٟۖ-ۭـ]/g;
const AR_LETTERS = /[أإآٱىةؤئ]/g;
const AR_LETTER_TO = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'و', 'ئ': 'ي' };
const AR_DIGITS = /[٠-٩۰-۹]/g;
const AR_DIGIT_TO = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
};
function foldSearch(s) {
  const v = String(s == null ? '' : s).toLowerCase();
  if (!AR_ANY.test(v)) return v;
  let out = v;
  try { out = out.normalize('NFKC'); } catch (_) {}
  return out.replace(AR_MARKS, '')
            .replace(AR_LETTERS, (c) => AR_LETTER_TO[c] || c)
            .replace(AR_DIGITS, (c) => AR_DIGIT_TO[c] || c);
}

/* A note's text, remembered until the note changes.

   stripHtml() is not expensive — about a tenth of a millisecond for a page of
   text. The problem is who calls it and how often: Ctrl+F and the jump palette
   both run over **every note on every board** on **every keystroke**, so a
   thousand notes turned one keypress into ~20 ms of HTML parsing here and
   ~24 ms there. Typing six letters into Find meant six of those, and on a slow
   CPU that is most of a second of a frozen window per word.

   The cache is keyed on the body string itself rather than on a dirty flag, so
   it cannot go stale: edit a note and `body` is a different string, which
   misses and re-reads. Holding onto `body` costs nothing — it is the same
   string object `state` already has — so the only new memory is the plain text,
   which is smaller than the markup it came from.

   Cleared wholesale rather than pruned per note. Every entry rebuilds lazily on
   the next search, so the worst case of dropping it is one slow keystroke, and
   that is a much better trade than bookkeeping on every delete. */
const TEXT_CACHE_MAX = 4000;
const textCache = new Map();
function noteText(n) {
  if (!n) return '';
  // a drawing note's text is its title (sketch.js), keyed so a rename is seen
  const src = n.sketch ? '\u0001' + (n.sketch.title || '') : n.body;
  const hit = textCache.get(n.id);
  if (hit && hit.body === src) return hit.text;
  const text = n.sketch ? (n.sketch.title || '') : stripHtml(n.body);
  if (textCache.size > TEXT_CACHE_MAX) textCache.clear();
  textCache.set(n.id, { body: src, text, folded: foldSearch(text) });
  return text;
}
/* The same text through foldSearch(), cached beside it — so a search over a
   thousand notes folds each one once per edit rather than once per keystroke.
   The query is folded by the caller; both sides must go through the same
   function or the comparison is between two different alphabets. */
function noteTextFolded(n) {
  noteText(n);
  const hit = textCache.get(n && n.id);
  return hit ? hit.folded : '';
}

/* What a typed link should actually become.

   `https://` is the right guess for `example.com` and the wrong one for
   `C:\budget\FY26.xlsx`, which is what it used to produce — a link that could
   not resolve, to a file that was right there. Local paths are recognised by
   shape: a drive letter, or a UNC share. Everything else keeps the old
   behaviour exactly. */
const isLocalPath = (v) => /^[a-z]:[\\/]/i.test(v) || /^\\\\[^\\]/.test(v);
function toLinkHref(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^(https?:|mailto:|file:)/i.test(v)) return v;
  if (isLocalPath(v)) {
    const p = v.replace(/\\/g, '/');
    // file:///C:/x/y for a drive letter, file://server/share/x for a UNC path
    return /^[a-z]:/i.test(p) ? 'file:///' + p : 'file:' + p.replace(/^\/\//, '//');
  }
  return 'https://' + v;
}

/* Open whatever a link points at, by the rules for its scheme.

   Two doors, not one. `openExternal` hands http(s) and mailto to the system
   browser; `openLocal` handles a document on this machine and is the stricter
   of the two, because opening a local path is the only route that can *run*
   something — main vets the extension and reveals anything it does not
   recognise in Explorer rather than launching it. See shell:open-local. */
/* A file the app keeps or points at: `mbf://<board>/<name>` is one of ours
   (served from the board's own folder — see src/store.js), `file:` is a
   document elsewhere on this machine that a 1.x note linked to. */
const isFileUrl = (v) => /^(mbf:|file:)/i.test(String(v || ''));
function openHref(href) {
  const url = String(href || '');
  if (!url) return;
  if (isFileUrl(url)) {
    if (FILES && FILES.openLocal) FILES.openLocal(url);
    else toast(t('msg.needDesktop'));
    return;
  }
  if (FILES && FILES.openExternal) FILES.openExternal(url);
  else window.open(url, '_blank');
}

const DATA = window.mbData || null;
const FILES = window.mbFiles || null;
const WIN = window.mbWin || null;
const THEME = window.mbTheme || null;
/* What the machine is, from main: whether Chromium is compositing without a
   GPU. The one thing about the hardware the page cannot find out for itself. */
const SYS = window.mbSys || null;

const GRID = 26;                       // background grid pitch, also the snap step
const NOTE_MIN_W = 160, NOTE_MIN_H = 96;
const PIC_MIN = 40;                    // a picture on its own can be small
const FRAME_MIN_W = 240, FRAME_MIN_H = 180;
const ZOOM_MIN = 0.02, ZOOM_MAX = 4.5;   // 2% since 2.4 — a big board fits on screen whole
const COLORS = ['default', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];

/* A note's or a workflow's colour is one of COLORS — or, since 2.1, any hex
   the user mixed in the colour window ("Custom…" in the right-click menu).

   A preset paints through the `[data-color="…"]` rules in tokens.css, which
   set three variables: --nc (the colour itself), --nb (the fill) and --nl (the
   edge). A hex sets the same three inline, with the fill and the edge *mixed
   against the theme's own default note* — so a custom colour still sits on a
   dark theme as a dark tint and on a light one as a light tint, the way the
   presets do, instead of being one flat swatch that ignores the theme.
   Everything that reads a colour (the stripe, the frame wash, the icon on
   `auto`) reads those variables, so nothing else has to know. */
const okItemColor = (c, fb) => (COLORS.includes(c) ? c : isHex(c) ? c.toLowerCase() : fb);
function customColorVars(hex) {
  return {
    '--nc': hex,
    '--nb': `color-mix(in srgb, ${hex} 20%, var(--c-default-b))`,
    '--nl': `color-mix(in srgb, ${hex} 48%, var(--c-default-l))`
  };
}
// the colour onto an element: a preset by attribute, a hex by the three variables
function paintColor(el, c, fb) {
  const hex = isHex(c);
  el.dataset.color = hex ? 'custom' : (c || fb || 'default');
  const vars = customColorVars(hex ? c : '#000000');
  for (const k in vars) { if (hex) el.style.setProperty(k, vars[k]); else el.style.removeProperty(k); }
}
// the same, as an inline style string for markup built as text ('' for a preset)
function colorStyle(c) {
  return isHex(c) ? Object.entries(customColorVars(c)).map(([k, v]) => `${k}:${v}`).join(';') : '';
}
// a colour's name for a label: the preset's translated name, or the hex itself
const colorName = (c) => (isHex(c) ? c.toUpperCase() : t('colour.' + c));
/* Accents. Every one of these has to stay legible as a button fill with
   `--accent-ink` on top of it, and as a 1px focus ring on both the lightest and
   the darkest theme — which is why they are all mid-tone. A pastel reads as
   disabled on Paper; a near-black reads as a border on Midnight. */
/* `mono` is not one colour but two (2.1, and the default since): pure white
   on a dark theme, pure black on a light one — the app's own ink, so the
   accent reads as part of the type rather than as a colour laid over it.
   accentHex() resolves it against the theme in force; the value here is only
   what a swatch would paint if anything ever drew it as a plain colour. */
const ACCENTS = {
  mono: '#ffffff',
  mint: '#7fd6c8', indigo: '#6b8afd', blue: '#3d8bf2', sky: '#22a7d0', teal: '#22b8a6',
  green: '#3fb96b', lime: '#7fb52e', amber: '#e0a12c', orange: '#f0813f',
  rose: '#f0607f', crimson: '#e34d6a', violet: '#a06bfd', plum: '#8d5bd6',
  slate: '#7b8398', graphite: '#5d6472'
};
/* The ones the picker actually shows.

   All fourteen used to be in the row, and fourteen circles in a line is not a
   palette — it is a colour ramp. Half of them were a shade apart from their
   neighbour (sky beside blue, crimson beside rose, plum beside violet,
   graphite beside slate), so the row read as "many colours" rather than as a
   set of distinct choices, and picking between two you cannot tell apart is
   not a decision anyone wants to make. Eight hues, one grey, and a colour
   picker for anything else covers strictly more ground in half the width.

   The map above keeps all fourteen. A board saved with `crimson` still
   resolves to crimson and still shows as the selected swatch — dropping a name
   from this list changes what is *offered*, never what is stored. */
const ACCENT_CHOICES = ['mono', 'mint', 'indigo', 'blue', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'];
// the accent actually in force, whether it is a preset or the user's own hex
function accentHex() {
  const s = state.settings;
  if (s.accent === 'mono') return resolvedTheme().mode === 'light' ? '#000000' : '#ffffff';
  if (s.accent === 'custom') return isHex(s.accentCustom) ? s.accentCustom : ACCENTS.mint;
  return ACCENTS[s.accent] || ACCENTS.mint;
}

const THEMES = [
  /* The app's own look, and the default since 2.0: near-black with a cold
     cast, bone-white text, hairlines instead of shadows. Its light twin keeps
     the same construction on paper. Both are only surface tokens like every
     other row — the *chrome* they arrived with (sharp corners, tracked
     labels, the settings nav) is in css/mental.css and applies to all. */
  { id: 'mental',       name: 'Mental Board',       mode: 'dark',  swatch: ['#0d0f11', '#16191c', '#e8e4da'] },
  { id: 'mental-light', name: 'Mental Board Light', mode: 'light', swatch: ['#ecebe7', '#f7f6f2', '#1a1c1e'] },
  { id: 'light',    name: 'Light',    mode: 'light', swatch: ['#f2f3f7', '#ffffff', '#1d2030'] },
  { id: 'paper',    name: 'Paper',    mode: 'light', swatch: ['#ffffff', '#f6f7fa', '#0d1017'] },
  { id: 'sand',     name: 'Sand',     mode: 'light', swatch: ['#f4efe4', '#fffcf5', '#2b2519'] },
  { id: 'dark',     name: 'Dark',     mode: 'dark',  swatch: ['#101118', '#191b25', '#e8eaf2'] },
  { id: 'dim',      name: 'Dim',      mode: 'dark',  swatch: ['#23252c', '#343843', '#e4e6ee'] },
  { id: 'ocean',    name: 'Ocean',    mode: 'dark',  swatch: ['#0a141e', '#16293a', '#e2edf6'] },
  { id: 'midnight', name: 'Midnight', mode: 'dark',  swatch: ['#000000', '#121216', '#f0f1f6'] },
  { id: 'forest',   name: 'Forest',   mode: 'dark',  swatch: ['#0b150f', '#16281d', '#e3f0e7'] },
  { id: 'plum',     name: 'Plum',     mode: 'dark',  swatch: ['#140d1c', '#241834', '#ece4f6'] },
  { id: 'mono',     name: 'Mono',     mode: 'light', swatch: ['#f5f5f5', '#ffffff', '#141414'] },
  { id: 'mist',     name: 'Mist',     mode: 'light', swatch: ['#eef2f6', '#f9fbfd', '#16222e'] },
  /* The six added in 1.5. Each one fills a gap the eleven above had rather than
     adding another shade of something already here: there was no green light
     theme and no warm-pink one, no dark that was warm rather than cool, no
     neutral dark to pair with Mono, and nothing at all for somebody who needs
     the edges of things to be obvious. */
  { id: 'meadow',   name: 'Meadow',   mode: 'light', swatch: ['#edf4ee', '#fbfdfb', '#16261b'] },
  { id: 'blossom',  name: 'Blossom',  mode: 'light', swatch: ['#faf0f2', '#fffbfc', '#2d1d23'] },
  { id: 'contrast', name: 'Contrast', mode: 'light', swatch: ['#f4f4f4', '#ffffff', '#000000'] },
  { id: 'nordic',   name: 'Nordic',   mode: 'dark',  swatch: ['#2b323d', '#333b48', '#e6ecf3'] },
  { id: 'ember',    name: 'Ember',    mode: 'dark',  swatch: ['#191210', '#231a16', '#f2e5db'] },
  { id: 'graphite', name: 'Graphite', mode: 'dark',  swatch: ['#131313', '#1c1c1c', '#ededed'] },
  /* The user's own, and the only entry whose `mode` and `swatch` are not fixed
     — themeById() fills both in from settings, because both are things the
     person picking the colours decides. Listed here rather than bolted on
     beside the picker so every place that validates a theme id, resolves a
     light/dark pair, or draws a card gets it for free. */
  { id: 'custom',   name: 'Custom',   mode: 'dark',  swatch: ['#12131a', '#1b1d27', '#e8eaf2'], custom: true }
];
function themeById(id) {
  const t = THEMES.find((x) => x.id === id);
  if (!t) return THEMES[0];
  if (!t.custom) return t;
  const ct = (state && state.settings && state.settings.customTheme) || {};
  return { id: 'custom', name: t.name, custom: true,
           mode: ct.mode === 'light' ? 'light' : 'dark',
           swatch: [ct.bg || '#12131a', ct.surface || '#1b1d27', ct.text || '#e8eaf2'] };
}

/* ---- icons ----
   Material Symbols path data, baked into assets/icons.js by tools/fetch-icons.js.
   `icon()` returns markup, so it can be dropped straight into any template. */
const ICONS = window.MB_ICONS || {};
const ICON_BOX = window.MB_ICON_BOX || '0 -960 960 960';
const ICON_GROUPS = window.MB_ICON_GROUPS || {};
const ICON_NAMES = Object.keys(ICONS);

function icon(name, cls) {
  const d = ICONS[name];
  if (!d) return '';
  return `<svg class="mi${cls ? ' ' + cls : ''}" viewBox="${ICON_BOX}" aria-hidden="true"><path d="${d}"/></svg>`;
}
// 'auto' tracks the note's own colour; anything else is one of COLORS
function iconColorVar(key) { return (!key || key === 'auto') ? 'var(--nc)' : `var(--c-${key}-c)`; }

/* ---- which key was that, whatever alphabet the keyboard is in ----
   `e.key` is what the *layout* produced. On a Windows Arabic layout the F key
   reports `ب`, so every `e.key.toLowerCase() === 'f'` in the app matched
   nothing and **the entire keyboard was dead**: Ctrl+F, Ctrl+Z, Ctrl+S,
   Ctrl+C/X/V, N, G, L, Ctrl+, — all of them, and the same for Russian, Greek
   and Hebrew. It is not a small bug wearing a small disguise; for somebody
   working in Arabic the app simply had no shortcuts.

   `e.code` names the *physical* key and never moves with the layout, so
   `KeyF` is the F key on every keyboard ever sold.

   **The order matters and it is not the obvious one.** `e.key` is tried first,
   because on AZERTY and QWERTZ the letter printed on the key is the one the
   user means: a French user pressing the key labelled A sends `key: 'a'` and
   `code: 'KeyQ'`, and reading the code there would silently move every
   shortcut to a key with the wrong letter on it. So: honour the label when it
   is a Latin letter, and fall back to the position only when it is not — which
   is exactly the case an Arabic, Cyrillic, Greek or Hebrew layout presents.
   That fallback is also what the hardware expects, since practically every
   Arabic keyboard is dual-legend and carries the Latin letter on the same cap.

   Latin layouts therefore behave exactly as they did before. */
function letterKey(e) {
  const k = (e.key || '').toLowerCase();
  if (k.length === 1 && k >= 'a' && k <= 'z') return k;
  const c = e.code || '';
  return /^Key[A-Z]$/.test(c) ? c.slice(3).toLowerCase() : '';
}

/* The same rule for the punctuation and digit chords — Ctrl+, for settings,
   Ctrl+0 / Ctrl+= / Ctrl+- for zoom, Shift+1 for fit-everything. An Arabic
   layout puts `،` on the comma key, and several variants put ٠-٩ on the digit
   row, so these were dead in the same way and for the same reason. Only the
   keys the app actually binds are mapped; anything else falls through to
   whatever `e.key` said. */
const CODE_PUNCT = {
  Comma: ',', Minus: '-', Equal: '=', Slash: '/', Period: '.',
  Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
  Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9'
};
function chordKey(e) {
  const k = e.key || '';
  if (k.length === 1 && k >= ' ' && k <= '~') return k;      // already ASCII
  return CODE_PUNCT[e.code] || k;
}

/* ─────────────── 1a. language ───────────────
   Every visible string comes from assets/lang/<id>.js through t(). Static
   markup carries data-t / data-t-title / data-t-ph / data-t-aria attributes and
   is filled by applyStaticText(); anything built in JS calls t() directly.

   Switching language never reloads: setLang() flips <html lang/dir> and
   applyLang() repaints everything that has a baked string in it. */
const LANGS = window.MB_LANG || {};
const LANG_IDS = Object.keys(LANGS).sort();
const FALLBACK = LANGS.en || {};

let LANG = FALLBACK;
let LANG_ID = 'en';
let RTL = false;
let pluralOf = new Intl.PluralRules('en');
let numberOf = new Intl.NumberFormat('en');
let percentOf = new Intl.NumberFormat('en', { style: 'percent' });

/* 'auto' means "whatever Windows is set to". Match the full tag first
   (pt-BR before pt), then the bare language, then give up and use English. */
function resolveLang(pref) {
  if (pref && pref !== 'auto' && LANGS[pref]) return pref;
  const wanted = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || 'en'];
  for (const w of wanted) {
    const tag = String(w).toLowerCase();
    const exact = LANG_IDS.find((id) => id.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const near = LANG_IDS.find((id) => id.toLowerCase().split('-')[0] === base);
    if (near) return near;
  }
  return LANGS.en ? 'en' : (LANG_IDS[0] || 'en');
}

function setLang(pref) {
  LANG_ID = resolveLang(pref);
  LANG = LANGS[LANG_ID] || FALLBACK;
  RTL = !!LANG._rtl;
  const locale = LANG._locale || LANG_ID;
  try {
    pluralOf = new Intl.PluralRules(locale);
    numberOf = new Intl.NumberFormat(locale);
    percentOf = new Intl.NumberFormat(locale, { style: 'percent' });
  } catch (_) {
    pluralOf = new Intl.PluralRules('en');
    numberOf = new Intl.NumberFormat('en');
    percentOf = new Intl.NumberFormat('en', { style: 'percent' });
  }
  const root = document.documentElement;
  root.lang = LANG_ID;
  root.dir = RTL ? 'rtl' : 'ltr';       // mirrors the chrome; the canvas stays LTR
  return LANG_ID;
}

// digits follow the language: Arabic gets ٣ where English gets 3
function num(v) { try { return numberOf.format(v); } catch (_) { return String(v); } }
// takes a whole percentage (100), not a ratio — Intl places the sign for us
function pct(v) { try { return percentOf.format(v / 100); } catch (_) { return v + '%'; } }

/* A catalogue value is either a string or a plural table keyed by CLDR
   category. Arabic has six of those, English two — Intl.PluralRules picks.
   Missing keys fall back to English, then to the key itself, so a partial
   translation degrades to English instead of to blanks. */
function t(key, vars) {
  let v = LANG[key];
  if (v == null) v = FALLBACK[key];
  if (v == null) return key;
  if (typeof v === 'object') {
    const n = (vars && typeof vars.n === 'number') ? vars.n : 0;
    const cat = (n === 0 && 'zero' in v) ? 'zero' : pluralOf.select(n);
    v = v[cat] != null ? v[cat] : (v.other != null ? v.other : v.one);
    if (v == null) return key;
  }
  return String(v).replace(/\{(\w+)\}/g, (m, k) => {
    const val = vars ? vars[k] : undefined;
    if (val == null) return m;
    return typeof val === 'number' ? num(val) : String(val);
  });
}
const te = (key, vars) => esc(t(key, vars));   // for HTML templates

/* Fill the strings that live in static markup. */
function applyStaticText(root) {
  const r = root || document;
  r.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  r.querySelectorAll('[data-t-title]').forEach((el) => { el.title = t(el.dataset.tTitle); });
  r.querySelectorAll('[data-t-ph]').forEach((el) => { el.placeholder = t(el.dataset.tPh); });
  r.querySelectorAll('[data-t-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.tAria)); });
  /* The two note placeholders are ::before content in CSS and cannot read the
     catalogue, so hand them over as custom properties. JSON.stringify gives a
     correctly quoted and escaped CSS string. */
  const rs = document.documentElement.style;
  rs.setProperty('--ph-note', JSON.stringify(t('note.placeholder')));
  rs.setProperty('--ph-note-edit', JSON.stringify(t('note.placeholderEdit')));
}
