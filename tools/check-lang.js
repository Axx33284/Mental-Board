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
/* main.js and preload.js are in here too. They are not in index.html's load
   order — they do not run in the page — but main.js is where the tray labels,
   the notification and every native dialog title live, and until they were
   added this check passed happily while an Arabic window showed an English
   tray and an English "Insert image" dialog. */
const src = SOURCE.appJs() + '\n' + SOURCE.mainJs() + '\n' + SOURCE.html();
const used = new Set();
for (const m of src.matchAll(/\bte?\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
for (const m of src.matchAll(/data-t(?:-title|-ph|-aria)?="([a-zA-Z0-9_.]+)"/g)) used.add(m[1]);
/* keys built at run time from a variable — 'block.' + b.k and friends. Listing
   the prefixes here is the price of not having a compiler. */
const PREFIXES = ['block.', 'icons.', 'colour.', 'accent.', 'theme.', 'hilite.',
                  'studio.hint.', 'count.', 'key.', 'kb.', 'msg.', 'status.',
                  'set.grid.', 'pos.', 'page.fit.',
                  /* 2.8: the slash menu's sections, and a database's layouts,
                     charts and property types (toolbars.js, database.js) */
                  'blocks.sec.', 'db.view.', 'db.chart.', 'db.type.',
                  /* 3.1: what a settings tab is for, and a row that had no
                     hint of its own (settings.js settingsPaneHtml, settingsAboutOf) */
                  'set.pane.', 'set.about.'];
console.log(`checking ${used.size} literal keys across ${SOURCE.scriptFiles().length} script(s) + ` +
            `${SOURCE.mainFiles().length} main-process file(s) + index.html`);
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

/* ---- 5. no key is written twice in a catalogue --------------------------
   A catalogue is one object literal, and a key written twice is not an error
   in JavaScript: the later one silently wins, everywhere. `set.padHint` was
   both the phone pairing's explanation and the note-padding sliders' hint, so
   Settings ▸ Extra explained the padding sliders where it should have said
   what the phone is sent (3.3). The keys are read with a small tokenizer that
   knows strings and comments, not a regex: values hold quotes and colons. */
function catalogueKeys(text) {
  const out = [];
  let i = 0, depth = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1, str = '';
      while (j < text.length && text[j] !== c) { if (text[j] === '\\') { str += text[j + 1]; j += 2; continue; } str += text[j++]; }
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (depth === 1 && text[k] === ':') out.push({ key: str, line: text.slice(0, i).split('\n').length });
      i = j + 1;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    i++;
  }
  return out;
}
for (const id of ids) {
  const seen = new Map();
  for (const { key, line } of catalogueKeys(fs.readFileSync(path.join(LANG_DIR, id + '.js'), 'utf8'))) {
    if (seen.has(key)) fail(`${id}.js: '${key}' is written twice (lines ${seen.get(key)} and ${line}) — the second silently wins`);
    else seen.set(key, line);
  }
}

if (bad) {
  console.error(`\n${bad} problem(s).`);
  process.exit(1);
}
console.log(`ok — ${ids.length} language(s): ${ids.map((i) => `${i} (${LANGS[i]._native})`).join(', ')}`);
