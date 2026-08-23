/* Mental Board — helpers.js
   The preamble, the helpers every other file uses, and the language catalogue.

   Part 1 of 15. These files are plain scripts sharing one global
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
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
  const hit = textCache.get(n.id);
  if (hit && hit.body === n.body) return hit.text;
  const text = stripHtml(n.body);
  if (textCache.size > TEXT_CACHE_MAX) textCache.clear();
  textCache.set(n.id, { body: n.body, text, lower: text.toLowerCase() });
  return text;
}
// the same text folded for comparison, so a search does not lowercase it again
function noteTextLower(n) {
  noteText(n);
  const hit = textCache.get(n && n.id);
  return hit ? hit.lower : '';
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
function openHref(href) {
  const url = String(href || '');
  if (!url) return;
  if (/^file:/i.test(url)) {
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

const GRID = 26;                       // background grid pitch, also the snap step
const NOTE_MIN_W = 160, NOTE_MIN_H = 96;
const FRAME_MIN_W = 240, FRAME_MIN_H = 180;
const ZOOM_MIN = 0.08, ZOOM_MAX = 4.5;
const COLORS = ['default', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];
/* Accents. Every one of these has to stay legible as a button fill with
   `--accent-ink` on top of it, and as a 1px focus ring on both the lightest and
   the darkest theme — which is why they are all mid-tone. A pastel reads as
   disabled on Paper; a near-black reads as a border on Midnight. */
const ACCENTS = {
  indigo: '#6b8afd', blue: '#3d8bf2', sky: '#22a7d0', teal: '#22b8a6',
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
const ACCENT_CHOICES = ['indigo', 'blue', 'teal', 'green', 'amber', 'orange', 'rose', 'violet', 'slate'];
// the accent actually in force, whether it is a preset or the user's own hex
function accentHex() {
  const s = state.settings;
  if (s.accent === 'custom') return isHex(s.accentCustom) ? s.accentCustom : ACCENTS.indigo;
  return ACCENTS[s.accent] || ACCENTS.indigo;
}

const THEMES = [
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
  /* The user's own, and the only entry whose `mode` and `swatch` are not fixed
     — themeById() fills both in from settings, because both are things the
     person picking the colours decides. Listed here rather than bolted on
     beside the picker so every place that validates a theme id, resolves a
     light/dark pair, or draws a card gets it for free. */
  { id: 'custom',   name: 'Custom',   mode: 'dark',  swatch: ['#12131a', '#1b1d27', '#e8eaf2'], custom: true }
];
function themeById(id) {
  const t = THEMES.find((x) => x.id === id);
  if (!t) return THEMES[3];
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
