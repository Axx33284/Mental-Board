/* The app's own source, as one string, in the order the browser loads it.

   `src/renderer.js` used to be that string. It is now `src/js/*.js`, and the
   checkers that read it — check-lang and check-icons — need the same view of
   the whole app they always had: a name drawn in one file and declared in
   another is still one program.

   The order is read out of **index.html**, not out of a list kept here. That is
   the point of this file. A hardcoded list is a second copy of the load order,
   and a second copy drifts: add a file to index.html, forget to add it here,
   and the checks quietly stop looking at it — so a hardcoded English string or
   a typo'd icon name in the newest file is the one place that is never
   checked. index.html is where the order actually lives, so it is what gets
   parsed.

   Used by `npm run check`. Nothing here ships. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/* Every src-relative href/src in index.html for a given extension, in document
   order. Only local paths: an absolute URL is not ours to read. */
function tagged(html, attr, ext) {
  const re = new RegExp(`${attr}="([^"]+\\.${ext})"`, 'g');
  return [...html.matchAll(re)].map((m) => m[1]).filter((p) => !/^[a-z]+:/i.test(p));
}

function html() { return fs.readFileSync(path.join(SRC, 'index.html'), 'utf8'); }

/* The app's scripts, minus the generated ones — icons.js and the language
   catalogues are data the checks load separately, and folding them in here
   would make every catalogue string look like a literal in the source. */
function scriptFiles() {
  return tagged(html(), 'src', 'js')
    .filter((p) => !p.startsWith('assets/'));
}
function styleFiles() {
  return tagged(html(), 'href', 'css')
    .filter((p) => !p.startsWith('assets/'));
}

/* One string, with a marker line between files so a reported offset can still
   be traced back to a file by eye. */
function appJs() {
  return scriptFiles()
    .map((p) => `/* ===== ${p} ===== */\n` + fs.readFileSync(path.join(SRC, p), 'utf8'))
    .join('\n');
}
function appCss() {
  return styleFiles()
    .map((p) => `/* ===== ${p} ===== */\n` + fs.readFileSync(path.join(SRC, p), 'utf8'))
    .join('\n');
}

/* The two files that are *not* in index.html's load order, because they do not
   run in the page: Electron main, and the preload bridge.

   Named here rather than parsed out of something, and that is not the drift the
   rest of this file exists to prevent — there is no order to keep in step with,
   only two fixed paths that MUST_SHIP in tools/build-app.js already names. What
   they are, though, is *user-visible*: main.js draws the tray, the "still
   running" notification and the title on every native file dialog. Leaving them
   out of the checkers meant every string in them was invisible to check-lang,
   so the rule that no English may be hardcoded held everywhere except the one
   process that talks to the operating system. */
const MAIN_FILES = ['main.js', 'preload.js', 'store.js'];
function mainFiles() {
  return MAIN_FILES.filter((p) => fs.existsSync(path.join(SRC, p)));
}
function mainJs() {
  return mainFiles()
    .map((p) => `/* ===== ${p} ===== */\n` + fs.readFileSync(path.join(SRC, p), 'utf8'))
    .join('\n');
}

module.exports = { ROOT, SRC, html, scriptFiles, styleFiles, appJs, appCss, mainFiles, mainJs };
