/* Builds the runnable app into ./App. Makes no shortcuts — see the note at
   the bottom of this file.
   Run with `npm run build`, or double-click admin\Build App.cmd.

   ── why it works this way ────────────────────────────────────────────────
   1.3 shipped through electron-builder: an NSIS installer, a portable target
   that self-extracts to %TEMP% on every launch, and electron-updater pulling a
   staged copy down from GitHub Releases. That is four different places a build
   of this app could be sitting on one machine, and only one of them is the one
   you just made. Every "I updated it and nothing changed" came out of that
   spread — a shortcut aiming at an uninstalled copy, a %TEMP% extraction that
   never got replaced, an update staged for a quit that never happened.

   So there is now exactly one copy and one path to it:

     App\Mental Board.exe      what you double-click. Always.

   No installer, no Add/Remove Programs entry, no update feed, no extraction
   step. What is in App\ is what runs — there is nowhere else for a stale build
   to hide. App\ is deleted and rebuilt from scratch every time, never merged
   into, because a file left behind by an older build is exactly the thing that
   makes a new build behave like the old one.

   The version and the build time are written into App\BUILD.txt and shown in
   the titlebar, so "is this the build I just made?" is always answerable. */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'App');
const STAGE = path.join(ROOT, '.build');
const pkg = require(path.join(ROOT, 'package.json'));
const EXE = `${pkg.productName}.exe`;

const mb = (n) => (n / 1048576).toFixed(0) + ' MB';
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {} };

/* The files are locked while the app is open, and a half-replaced App\ is worse
   than no rebuild at all. Refuse early and say why. */
/* *This* App\ — not any process with the same name. A copy of the app built
   in another project folder (the 2.0 folder, say) locks its own files, not
   these, and refusing over it stopped a build that could not have been
   harmed. The executable paths are asked for by name; if that question cannot
   be answered, the old by-name answer stands, so this never errs towards
   building over a running App\. */
function appIsRunning() {
  const cp = require('child_process');
  const mine = path.join(APP, EXE).toLowerCase();
  try {
    const out = cp.execSync(
      `powershell -NoProfile -Command "Get-Process -Name '${pkg.productName}' -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"`,
      { encoding: 'utf8' });
    return out.split(/\r?\n/).some((p) => p.trim().toLowerCase() === mine);
  } catch (_) {}
  try {
    const out = cp.execSync(`tasklist /fi "imagename eq ${EXE}"`, { encoding: 'utf8' });
    return out.toLowerCase().includes(EXE.toLowerCase());
  } catch (_) { return false; }
}

/* Everything the app does not need at runtime.

   The layout makes this easy to get right: **everything the app ships lives in
   src/**, so this list is "the whole project except src/, package.json and
   LICENSE". Shipping the build tools or a previous App\ inside the new one
   would only make the package bigger and the question "which copy is this?"
   harder to answer. */
const IGNORE = [
  /^\/App($|\/)/, /^\/\.build($|\/)/, /^\/dist($|\/)/,
  /^\/tools($|\/)/, /^\/admin($|\/)/, /^\/\.git($|\/)/, /^\/\.sandbox/,
  /* Claude Code's own folder: settings, and the git worktrees of side sessions,
     each a whole second copy of the project with a node_modules link inside. */
  /^\/\.claude($|\/)/,
  /^\/(MAP|README|CLAUDE)\.md$/, /^\/\.gitattributes$/, /^\/\.gitignore$/,
  /^\/package-lock\.json$/, /\.map$/,
  /* prune leaves this behind. It is only npm's own bookkeeping, and there are
     no runtime dependencies for it to describe. node_modules itself is NOT
     ignored — add a real dependency later and it has to ship. */
  /^\/node_modules\/\.package-lock\.json$/
];

/* src/ must survive the list above, and it is the one mistake here that ships a
   broken app rather than a fat one: drop assets/ and the app starts with no
   glyphs and every string showing its own key. Checked, not assumed. */
const MUST_SHIP = [
  '/src/main.js', '/src/preload.js', '/src/store.js', '/src/sdocx.js', '/src/index.html',
  /* main require()s these at load (2.2), and the page is read when a phone
     pairs: miss any of them and the app will not start, or pairing fails. */
  '/src/tablet.js', '/src/qr.js', '/src/tablet/phone.html',
  /* One from each half of the split app, and the two ends of each load order:
     the first and last script, the first and last stylesheet. A mistake in
     IGNORE that swallowed src/js or src/css would take one of these with it. */
  '/src/js/helpers.js', '/src/js/init.js',
  '/src/css/tokens.css', '/src/css/mental.css',
  '/src/assets/icons.js', '/src/assets/lang/en.js',
  '/src/assets/fonts.css', '/package.json'
];

async function main() {
  if (process.platform !== 'win32') {
    console.error('This build script targets Windows. Nothing was written.');
    process.exit(1);
  }
  if (appIsRunning()) {
    console.error(`${pkg.productName} is running. Close it first — the files in App\\ are locked while it is open.`);
    process.exit(1);
  }

  /* Whose build is sitting in App\ right now?

     BUILD.txt records the folder it was built *from*, and until this check
     nothing ever read it back. So a project copied to a new folder — 1.4 to
     1.5, say — inherited the old folder's App\, and `App\Mental Board.exe`
     then ran source that was somewhere else entirely. Nothing in the app says
     so: the titlebar shows the version it was built with, which is the old
     one, and looks exactly like a build that simply has not been made yet.

     Worse than confusing, because of the single-instance lock in main.js:
     it is keyed to the pinned userData path, which every build ever shipped
     shares. Launch the stale copy while a run from this source is open and the
     old build wins the lock, quits without a word, and raises the other
     window. That is the "I updated it and it came back the same" report, and
     it is the exact failure §6 exists to prevent.

     A notice, not a refusal: this build is about to delete App\ and replace it,
     so the situation is being fixed on the very next line. What was missing was
     anyone ever being told it had happened. */
  reportForeignBuild();

  const packager = require('@electron/packager');

  // stage somewhere else, so a build that fails half way cannot leave App\ in
  // a state that is neither the old app nor the new one
  rm(STAGE);

  console.log(`building ${pkg.productName} ${pkg.version} — a minute or two\n`);
  let built;
  try {
    [built] = await packager({
      dir: ROOT,
      out: STAGE,
      name: pkg.productName,
      platform: 'win32',
      arch: 'x64',
      icon: path.join(ROOT, 'src', 'assets', 'icon.ico'),
      asar: true,
      prune: true,
      overwrite: true,
      appVersion: pkg.version,
      buildVersion: pkg.version,
      appCopyright: `Copyright © ${new Date().getFullYear()} ${String(pkg.author).replace(/\s*<.*$/, '')}`,
      ignore: IGNORE,
      quiet: false,
      win32metadata: {
        CompanyName: String(pkg.author).replace(/\s*<.*$/, ''),
        /* What Task Manager calls the process — it shows FileDescription, not
           the exe's name. This was the package description, a whole sentence,
           so the app was listed as "An infinite canvas for your head…". */
        FileDescription: pkg.productName,
        ProductName: pkg.productName,
        OriginalFilename: EXE
      }
    });
  } catch (err) {
    console.error('\nbuild failed:', err && err.message);
    rm(STAGE);
    process.exit(1);
  }

  const stagedExe = path.join(built, EXE);
  if (!fs.existsSync(stagedExe)) {
    console.error(`\nexpected ${stagedExe} and it is not there.`);
    rm(STAGE);
    process.exit(1);
  }

  const missing = missingFromAsar(path.join(built, 'resources', 'app.asar'), MUST_SHIP);
  if (missing.length) {
    console.error('\nthe package is missing files the app needs to run:');
    missing.forEach((f) => console.error('  ' + f));
    console.error('Check IGNORE in this file. App\\ was left as it was.');
    rm(STAGE);
    process.exit(1);
  }

  /* Replace, never merge. */
  rm(APP);
  fs.renameSync(built, APP);
  rm(STAGE);

  fs.writeFileSync(
    path.join(APP, 'BUILD.txt'),
    `${pkg.productName} ${pkg.version}\nbuilt ${new Date().toString()}\nfrom ${ROOT}\non ${os.hostname()}\n`,
    'utf8'
  );

  const size = fs.statSync(path.join(APP, EXE)).size;
  console.log(`\n  App\\${EXE}   ${mb(size)}`);
  console.log(`  App\\BUILD.txt   says which build this is`);
  console.log(`\n  ${path.join(APP, EXE)}`);
  console.log('\nDouble-click that. No install, no shortcut, and your boards stay in Documents\\My Boards.');
}

/* The `from` line of the App\BUILD.txt that is there now, or ''. */
function builtFrom() {
  try {
    const txt = fs.readFileSync(path.join(APP, 'BUILD.txt'), 'utf8');
    return ((/^from (.+)$/m.exec(txt) || [])[1] || '').trim();
  } catch (_) { return ''; }
}

function reportForeignBuild() {
  const from = builtFrom();
  if (!from) return;                                   // no App\ yet, or a build from before this line existed
  if (path.resolve(from).toLowerCase() === path.resolve(ROOT).toLowerCase()) return;
  console.log('  note: the App\\ folder here was built from a different project.');
  console.log('        was: ' + from);
  console.log('        now: ' + ROOT);
  console.log('        Until this build finishes, App\\' + EXE + ' runs that other source —');
  console.log('        and opening it alongside a run from here loses the single-instance');
  console.log('        lock to whichever started first. See MAP.md §6.\n');
}

/* Read an asar's file listing without unpacking it.

   Format: an 8-byte pickle header, a 4-byte length at offset 12, then that many
   bytes of JSON describing the tree. That is all this needs — the file bodies
   that follow are irrelevant when the question is only "is it in there?".

   Worth doing directly rather than trusting the packager's own output: a
   mistake in IGNORE produces a build that packages cleanly, launches, and is
   missing its icons or its translations. That failure looks like a UI bug, not
   a build bug, and it costs an afternoon. */
function missingFromAsar(file, wanted) {
  let tree;
  try {
    const buf = fs.readFileSync(file);
    const headerSize = buf.readUInt32LE(12);
    tree = JSON.parse(buf.toString('utf8', 16, 16 + headerSize));
  } catch (err) {
    return [`could not read ${path.basename(file)}: ${err.message}`];
  }
  const has = (p) => {
    let node = tree;
    for (const part of p.split('/').filter(Boolean)) {
      if (!node.files || !node.files[part]) return false;
      node = node.files[part];
    }
    return true;
  };
  return wanted.filter((p) => !has(p));
}

/* This build makes NO shortcuts, by request, and that is the safer arrangement
   anyway.

   The version that did create them existed to stop a desktop link rotting into
   an old copy. But a shortcut is itself a second name for the app, and a second
   name is the thing every stale-build problem in this project started from:
   1.3's four copies, and then the 1.3-vs-1.4 collision, where a shortcut and a
   folder disagreed about which exe was "the app".

   With no shortcut there is one name for this app and it is a path:

     App\Mental Board.exe

   If you want it one click away, make the shortcut yourself and put it where
   you like — this script will never move, repoint or overwrite it, so it stays
   yours. Just remember that a shortcut you made by hand is one this script
   cannot fix, which is the trade. */

main();
