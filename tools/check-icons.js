/* Fails the build if a downloaded icon never reaches the screen, or if
   something drawn was never downloaded. Run with `npm run check:icons`;
   `npm run dist` runs it for you.

   assets/icons.js is generated, so nothing stops tools/fetch-icons.js growing a
   name no template ever draws. That costs bytes, but the expensive direction is
   the other one: a name the app draws that failed to download renders as
   nothing at all — a button with no glyph and, because most of them are
   icon-only, no label either.

   Draw sites are matched exactly, not by "the name appears somewhere". A loose
   match reports success for the wrong reason — `done` looked used for a while
   because a to-do <li> carries class="done" — and reports failure for the wrong
   reason too, because ['#fde68a', 'yellow'] has the same shape as a STATIC_ICONS
   row. So each site is found by slicing out the table it lives in:

     STATIC_ICONS      the second string of each ['<selector>', 'name'] row
     COMPASS_ARROWS    every string in the table
     BLOCKS            ic: 'name'
     icon('name')      any call in src/js/*.js
     item(a, 'name')   context-menu rows
     data-icon="name"  the fab items in index.html

   plus membership of a picker group. Add a seventh kind of call site and you
   must teach it here too, or the build starts failing on a good icon. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');            // everything the app ships lives here
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

global.window = {};
require(path.join(SRC, 'assets', 'icons.js'));
const ICONS = global.window.MB_ICONS || {};
const GROUPS = global.window.MB_ICON_GROUPS || {};

const all = Object.keys(ICONS);
if (!all.length) {
  console.error('assets/icons.js has no icons — run `npm run icons`.');
  process.exit(1);
}

/* Every script the app loads, concatenated in index.html's order — a glyph
   drawn in one file and declared in another is still one program. */
const SOURCE = require('./app-source.js');
const renderer = SOURCE.appJs();
const html = SOURCE.html();

/* the text of `const <NAME> = [ … ];`, so a row shape is only ever matched
   inside the table it belongs to */
function table(src, name) {
  const at = src.indexOf(`const ${name} = [`);
  if (at < 0) throw new Error(`${name} not found in src/js — did it get renamed?`);
  const end = src.indexOf('\n];', at);
  return src.slice(at, end < 0 ? src.length : end);
}
const strings = (s) => [...s.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

const drawn = new Set(Object.values(GROUPS).flat());
const addAll = (names) => names.forEach((n) => drawn.add(n));

// ['<selector>', 'name'] — the name is the second string on the row
addAll([...table(renderer, 'STATIC_ICONS').matchAll(/'[^']*'\s*,\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
addAll(strings(table(renderer, 'COMPASS_ARROWS')));
addAll([...table(renderer, 'BLOCKS').matchAll(/\bic:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
addAll([...renderer.matchAll(/\bitem\([^,]+,\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
addAll([...html.matchAll(/data-icon="([a-z0-9_]+)"/g)].map((m) => m[1]));

/* icon() calls. A call holding a ternary contributes both branches, but only a
   call with exactly one literal can be checked the other way round — the
   condition in icon(mode === 'dark' ? … ) is a string too, and it is not an
   icon name. */
const iconCalls = [...renderer.matchAll(/\bicon\(([^()]*)\)/g)].map((m) => strings(m[1]));
iconCalls.forEach(addAll);
const soleLiterals = iconCalls.filter((names) => names.length === 1).map((names) => names[0]);

const unused = all.filter((n) => !drawn.has(n));
const missing = [...new Set(soleLiterals)].filter((n) => !ICONS[n]);

let bad = false;
if (unused.length) {
  bad = true;
  console.error(`\n${unused.length} icon(s) downloaded but never drawn:\n  ${unused.join('\n  ')}`);
  console.error('\nEither draw them, or drop them from tools/fetch-icons.js and re-run `npm run icons`.');
}
if (missing.length) {
  bad = true;
  console.error(`\n${missing.length} icon(s) drawn but not in assets/icons.js:\n  ${missing.join('\n  ')}`);
  console.error('\nAdd them to tools/fetch-icons.js and re-run `npm run icons`.');
}

if (bad) process.exit(1);
const inPicker = new Set(Object.values(GROUPS).flat()).size;
console.log(`icons ok — all ${all.length} are drawn (${inPicker} in the picker, ${all.length - inPicker} in the chrome)`);
