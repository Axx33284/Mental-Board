/* Fails the build if a .cmd file has LF line endings, or if a file the app
   parses as JSON has a byte-order mark. Run with `npm run check:crlf`;
   `npm run check` runs it.

   This exists because it already happened. cmd.exe does not read a batch file
   line by line — it seeks through it — and with LF-only endings those seeks land
   mid-word. You do not get "syntax error": you get the *tails* of your own
   comments back as commands.

       'ies' is not recognized as an internal or external command
       'ore' is not recognized as an internal or external command

   ("Copies", "before".) Every script in admin/ was broken this way and looked
   fine in an editor, in git, and in Git Bash — which normalises on the way in
   and so hid it. It only failed the way the user would hit it: double-clicked
   from Explorer.

   .gitattributes pins *.cmd to eol=crlf, but that governs *checkout*. A file
   written directly by an editor or a script never passes through it, so the
   attribute alone is not a guarantee — this is. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['admin', '.'];
const bad = [];
let checked = 0;

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { continue; }
  for (const name of names) {
    if (!/\.(cmd|bat)$/i.test(name)) continue;
    const file = path.join(dir, name);
    const raw = fs.readFileSync(file);
    checked++;
    // any LF that is not preceded by CR
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === 0x0a && (i === 0 || raw[i - 1] !== 0x0d)) {
        bad.push(path.relative(ROOT, file));
        break;
      }
    }
  }
}

if (bad.length) {
  console.error(`\n${bad.length} batch file(s) with LF line endings:\n  ${bad.join('\n  ')}`);
  console.error('\ncmd.exe misparses these — see the note at the top of tools/check-crlf.js.');
  console.error('Fix with PowerShell, from the project root:');
  console.error(`  Get-ChildItem admin\\*.cmd | ForEach-Object {`);
  console.error(`    $t = [IO.File]::ReadAllText($_) -replace "\\r\\n","\\n" -replace "\\n","\\r\\n"`);
  console.error(`    [IO.File]::WriteAllText($_.FullName, $t)`);
  console.error(`  }`);
  process.exit(1);
}
/* ---- byte-order marks in JSON ----
   Also already happened, and it cost a build. `package.json` was edited with
   PowerShell 5.1's `Set-Content -Encoding utf8`, which writes UTF-8 **with a
   BOM** — the one thing about that flag nobody expects. Node's `require()`
   strips a BOM before parsing, so every check here passed, the app ran fine
   from source, and `npm run build` reported success.

   Electron's asar app loader does not strip it. The packaged app died before
   it opened a window, showing a dialog titled "Error" and nothing else: no
   stack, no message, no crash file, and the same files unpacked worked
   perfectly. That is a genuinely horrible hour, and it is one byte.

   preload's readJson() already strips a BOM from board.json for the same
   family of reasons — see the note there. This is the build-time half. */
const JSON_FILES = ['package.json'];
const hasBom = (raw) => raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
const bommed = [];
for (const name of JSON_FILES) {
  const file = path.join(ROOT, name);
  let raw;
  try { raw = fs.readFileSync(file); } catch (_) { continue; }
  if (!hasBom(raw)) continue;
  // `--fix-bom` because the alternative is a shell one-liner full of quoting
  // that is itself easy to get wrong on the machine that just got this wrong
  if (process.argv.includes('--fix-bom')) {
    fs.writeFileSync(file, raw.slice(3));
    console.log('stripped the BOM from ' + name);
    continue;
  }
  bommed.push(name);
}
if (bommed.length) {
  console.error('');
  console.error(bommed.length + ' JSON file(s) start with a UTF-8 BOM:');
  bommed.forEach((b) => console.error('  ' + b));
  console.error('');
  console.error('Electron cannot parse package.json with a BOM: the packaged app dies');
  console.error('before it opens a window, showing a dialog titled "Error" and nothing');
  console.error('else. See the note above this check. Strip it from the project root:');
  console.error('  node tools/check-crlf.js --fix-bom');
  process.exit(1);
}

console.log(`line endings ok — ${checked} batch file(s), all CRLF; no BOM in ${JSON_FILES.length} JSON file(s)`);
