/* Language self-check. Run with `npm run check:lang` — no network, no deps.

   Three things go wrong when a feature is added in a hurry, and all three are
   invisible until someone switches language:
     1. a key is used in the code but never added to the catalogue,
     2. a key is added to English and forgotten in a translation,
     3. a plural table is missing a form the language actually uses
        (Arabic needs six; English needs two).
   Exits non-zero on any of them, so it can gate a release. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');            // everything the app ships lives here
const LANG_DIR = path.join(SRC, 'assets', 'lang');
/* The app used to be one renderer.js. It is now src/js/*.js, and the load
   order lives in index.html — see tools/app-source.js for why that is read
   rather than listed again here. */
const SOURCE = require('./app-source.js');

/* the catalogues register themselves on a global */
global.window = {};
const ids = fs.readdirSync(LANG_DIR).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
for (const id of ids) require(path.join(LANG_DIR, id + '.js'));
const LANGS = global.window.MB_LANG || {};
const en = LANGS.en;

let bad = 0;
const fail = (msg) => { console.error('  ✗ ' + msg); bad++; };

if (!en) { console.error('no en.js — nothing to check against'); process.exit(1); }

/* ---- 1. every key the code asks for exists in English ------------------- */
const src = SOURCE.appJs() + '\n' + SOURCE.html();
const used = new Set();
for (const m of src.matchAll(/\bte?\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
for (const m of src.matchAll(/data-t(?:-title|-ph|-aria)?="([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
/* keys built at run time from a variable — 'block.' + b.k and friends. Listing
   the prefixes here is the price of not having a compiler. */
const PREFIXES = ['block.', 'icons.', 'colour.', 'accent.', 'theme.', 'hilite.',
                  'studio.hint.', 'count.', 'key.', 'kb.', 'msg.', 'status.',
                  'set.grid.', 'pos.'];
console.log(`checking ${used.size} literal keys across ${SOURCE.scriptFiles().length} script(s) + index.html`);
for (const k of [...used].sort()) {
  if (!(k in en) && !PREFIXES.some((p) => k.startsWith(p))) fail(`used but not in en.js: ${k}`);
}

/* ---- 1b. templates are the user's own ----------------------------------
   There used to be seven built-in templates whose every heading and table cell
   lived in the catalogue, and this section reassembled the tk('id','part')
   call sites to check each one for real.

   They are gone: a template is now a note the user saved, so its content is
   their text and no catalogue key stands behind it. What is left is the chrome
   around the feature — 'tpl.save', 'tpl.none' and friends — and those are
   literal keys, already covered by section 1 above. The 'tpl.' prefix is
   therefore off the exemption list rather than special-cased here, which makes
   the checking stricter than it was, not looser. */

/* ---- 2. every translation matches English key for key ------------------- */
const enKeys = Object.keys(en).filter((k) => k[0] !== '_');
for (const id of ids) {
  if (id === 'en') continue;
  const l = LANGS[id];
  if (!l) { fail(`${id}.js registered nothing on window.MB_LANG`); continue; }
  if (typeof l._native !== 'string' || !l._native) fail(`${id}: no _native name for the picker`);
  const missing = enKeys.filter((k) => !(k in l));
  const extra = Object.keys(l).filter((k) => k[0] !== '_' && !(k in en));
  if (missing.length) fail(`${id}: ${missing.length} key(s) missing — ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`);
  if (extra.length) fail(`${id}: ${extra.length} key(s) not in en.js — ${extra.slice(0, 8).join(', ')}${extra.length > 8 ? '…' : ''}`);
  const wrongShape = enKeys.filter((k) => k in l && typeof l[k] !== typeof en[k]);
  if (wrongShape.length) fail(`${id}: plural table vs plain string mismatch — ${wrongShape.join(', ')}`);
}

/* ---- 3. plural tables cover the forms the locale actually uses ---------- */
for (const id of ids) {
  const l = LANGS[id];
  if (!l) continue;
  const locale = l._locale || id;
  let rules;
  try { rules = new Intl.PluralRules(locale); }
  catch (_) { fail(`${id}: _locale '${locale}' is not a locale Intl knows`); continue; }
  // every count the app can plausibly show, mapped to its category
  const needed = new Set();
  for (let n = 0; n <= 120; n++) needed.add(rules.select(n));
  for (const k of Object.keys(l)) {
    const v = l[k];
    if (!v || typeof v !== 'object') continue;
    const gaps = [...needed].filter((c) => !(c in v));
    if (gaps.length) fail(`${id}: ${k} has no '${gaps.join("', '")}' form`);
  }
}

/* ---- 4. no English left hardcoded in the markup ------------------------- */
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/g, '');
for (const m of html.matchAll(/>([^<>{}]+)</g)) {
  const text = m[1].trim();
  // a run of two or more Latin words is prose; single glyphs are UI symbols
  if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text) && !/^Mental Board$/.test(text)) {
    fail(`index.html has literal text: "${text.slice(0, 50)}"`);
  }
}

if (bad) {
  console.error(`\n${bad} problem(s).`);
  process.exit(1);
}
console.log(`ok — ${ids.length} language(s): ${ids.map((i) => `${i} (${LANGS[i]._native})`).join(', ')}`);
