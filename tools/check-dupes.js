/* Fails the build when one top-level name is declared twice across the app's
   scripts. Run with `npm run check:dupes`; `npm run check` runs it.

   The scripts in src/js/ are plain <script>s sharing one global scope (MAP.md
   §4), so a name declared in one file is the same name in every other. Two
   `function`s with one name do not clash: the later one simply replaces the
   earlier, everywhere, with no error and no warning. That is how 3.1.1's smooth
   caret — a `function placeCaret()` near the end of editor.js — replaced the
   `placeCaret(node, offset)` higher up that moves the caret, and every "put the
   caret here" in the editor quietly stopped working for two releases. A
   `const`/`let`/`class` declared twice is worse in the other direction: the
   second script throws at load and none of it runs.

   Top-level here means "at column 0", which is how every file in src/js/ is
   written. A name declared inside a function is indented and is not looked at.
   Nothing here ships. */
'use strict';
const fs = require('fs');
const path = require('path');
const { SRC, scriptFiles } = require('./app-source.js');

const FN = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/;
const DECL = /^(?:const|let|var|class)\s+(.*)$/;

/* The names a `const a = 1, b = 2;` line declares. Splits on the commas that
   sit outside brackets, so `const x = f(a, b), y = 2` gives x and y. A
   destructuring pattern on the left gives every plain name inside it. */
function declNames(rest) {
  if (/^class\b/.test(rest)) return [];
  const m = /^\s*class\s+([A-Za-z_$][\w$]*)/.exec(rest);
  if (m) return [m[1]];
  const out = [];
  let depth = 0, start = 0;
  const parts = [];
  let quote = '';
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    // a comma inside a string is not a separator: 'p,div,li' declares nothing
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push(rest.slice(start, i)); start = i + 1; }
    else if (c === ';' && depth === 0) break;
  }
  parts.push(rest.slice(start));
  for (const p of parts) {
    const lhs = p.split('=')[0].trim();
    if (/^[{[]/.test(lhs)) {
      for (const n of lhs.replace(/[{}[\]]/g, ' ').split(/[\s,]+/)) {
        const name = n.split(':').pop().trim();
        if (/^[A-Za-z_$][\w$]*$/.test(name)) out.push(name);
      }
    } else if (/^[A-Za-z_$][\w$]*$/.test(lhs)) out.push(lhs);
  }
  return out;
}

const seen = new Map();          // name -> [{ file, line, kind }]
for (const rel of scriptFiles()) {
  const lines = fs.readFileSync(path.join(SRC, rel), 'utf8').split(/\r?\n/);
  let inComment = false;
  lines.forEach((text, i) => {
    // skip block comments that start at column 0, where prose may begin with "function"
    if (inComment) { if (text.includes('*/')) inComment = false; return; }
    if (/^\/\*/.test(text) && !text.includes('*/')) { inComment = true; return; }
    let names = [], kind = '';
    const f = FN.exec(text);
    if (f) { names = [f[1]]; kind = 'function'; }
    else {
      const d = DECL.exec(text);
      if (d) {
        kind = text.split(/\s/)[0];
        names = kind === 'class' ? [(/^class\s+([A-Za-z_$][\w$]*)/.exec(text) || [])[1]].filter(Boolean) : declNames(d[1]);
      }
    }
    for (const n of names) {
      if (!seen.has(n)) seen.set(n, []);
      seen.get(n).push({ file: rel, line: i + 1, kind });
    }
  });
}

const dupes = [...seen].filter(([, at]) => at.length > 1);
if (dupes.length) {
  console.error(`${dupes.length} name(s) declared more than once in the shared global scope:\n`);
  for (const [name, at] of dupes) {
    console.error(`  ${name}`);
    for (const a of at) console.error(`    ${a.kind.padEnd(8)} src/${a.file}:${a.line}`);
  }
  console.error('\nThe scripts share one scope: a second function silently replaces the first,' +
                '\nand a second const stops the later script loading. Rename one (MAP.md §4).');
  process.exit(1);
}
console.log(`names ok — ${seen.size} top-level names across ${scriptFiles().length} scripts, each declared once`);
