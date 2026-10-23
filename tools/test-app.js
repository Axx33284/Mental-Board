/* Tests that need the real app: the renderer's half of saving, and the
   features built on it.

   Launches Electron on this repo with a throwaway --user-data-dir (so its My
   Boards is a temp folder, never the user's), drives the page over the Chrome
   DevTools Protocol, and kills it at the end. Run with `npm test`; nothing here
   ships. MAP.md §6 "Verifying a UI change for real" is the manual version of
   the same thing.

   Each test is a function evaluated *in the page* — it can call any of the
   app's globals — plus, where it has to, a step on the disk from here. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 9555 + Math.floor(Math.random() * 300);
const UDD = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-app-test-'));
const BOARDS = path.join(UDD, 'My Boards');
let child = null, ws = null, msgId = 0;
const pending = new Map();
let passed = 0, failed = 0;
const pageErrors = [];

/* ---- the disk before launch: one good board, one that will not parse ---- */
function seed() {
  fs.mkdirSync(path.join(BOARDS, 'Good', 'files'), { recursive: true });
  fs.writeFileSync(path.join(BOARDS, 'settings.json'), JSON.stringify({ v: 3, settings: {}, boardOrder: ['good1', 'bad1'], activeBoard: 'good1' }));
  fs.writeFileSync(path.join(BOARDS, 'Good', 'board.json'), JSON.stringify({
    mbBoard: 2, id: 'good1', name: 'Good',
    notes: [
      { id: 'n1', x: 0, y: 0, w: 260, h: 180, body: '<p>one</p>', status: 'todo', date: '2026-02-30' },
      { id: 'n2', x: 400, y: 0, w: 260, h: 180, body: '<p>two</p>', date: '2026-03-04' }
    ],
    frames: [], links: []
  }));
  fs.mkdirSync(path.join(BOARDS, 'Broken', 'files'), { recursive: true });
  fs.writeFileSync(path.join(BOARDS, 'Broken', 'board.json'), '{ this is not json');
  fs.writeFileSync(path.join(BOARDS, 'Broken', 'files', 'precious.png'), 'only copy');
}

/* ---- CDP ---- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function connect() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((p) => p.type === 'page' && /index\.html/.test(p.url));
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
          // anything the page throws or logs as an error, for the last test
          if (d.method === 'Runtime.exceptionThrown') {
            const x = d.params.exceptionDetails;
            pageErrors.push('uncaught: ' + ((x.exception && x.exception.description) || x.text).split('\n').slice(0, 3).join(' | '));
          }
          if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') {
            pageErrors.push('console.error: ' + d.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 300));
          }
          if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') {
            pageErrors.push('log: ' + d.params.entry.text.slice(0, 300) + (d.params.entry.url ? ' @ ' + d.params.entry.url : ''));
          }
        };
        await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
        return;
      }
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('the app did not come up on port ' + PORT);
}
function send(method, params) {
  return new Promise((r) => { const id = ++msgId; pending.set(id, r); ws.send(JSON.stringify({ id, method, params: params || {} })); });
}
/* Evaluate `fn` in the page and hand back its value. A thrown error in the page
   comes back here as a thrown error. */
async function page(fn, ...args) {
  const expression = `(${fn})(...${JSON.stringify(args)})`;
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) {
    const ex = r.result.exceptionDetails.exception;
    throw new Error((ex && (ex.description || ex.value)) || r.result.exceptionDetails.text);
  }
  return r.result.result.value;
}
async function waitForApp() {
  for (let i = 0; i < 80; i++) {
    try { if (await page(() => typeof state === 'object' && !!document.querySelector('#notesLayer') && typeof applySaveResult === 'function')) return; } catch (_) {}
    await sleep(250);
  }
  throw new Error('the page never finished booting');
}
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (err) { failed++; console.log('  FAIL ' + name + '\n       ' + String((err && err.message) || err).split('\n').slice(0, 5).join('\n       ')); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
const boardJson = (dir) => JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8'));

/* ---- the tests ---- */
async function run() {
  console.log('the app (Electron, throwaway profile)');

  await test('boots with the unreadable board shown and never written', async () => {
    const r = await page(() => ({ ids: state.boards.map((b) => b.id), dead: state.boards.filter((b) => b.unreadable).length }));
    ok(r.dead === 1, 'one unreadable board expected, got ' + JSON.stringify(r));
    ok(fs.readFileSync(path.join(BOARDS, 'Broken', 'board.json'), 'utf8') === '{ this is not json', 'the unreadable file was touched');
  });

  await test('an impossible date is healed to none, a real one is kept', async () => {
    const r = await page(() => state.notes.map((n) => [n.id, n.date]));
    ok(JSON.stringify(r) === JSON.stringify([['n1', ''], ['n2', '2026-03-04']]), JSON.stringify(r));
  });

  await test('applySaveResult: "*" means nothing landed', async () => {
    const r = await page(() => {
      lastWrittenBoard.delete('t1'); lastWrittenBoard.delete('t2');
      const before = lastWrittenSettings;
      const landed = applySaveResult({ settings: '{"x":1}', boards: [{ id: 't1', json: 'a' }, { id: 't2', json: 'b' }] },
        { ok: false, errors: [{ id: '*', error: 'boom' }] });
      return { landed: [...landed], t1: lastWrittenBoard.has('t1'), settingsMoved: lastWrittenSettings !== before };
    });
    ok(!r.landed.length && !r.t1 && !r.settingsMoved, JSON.stringify(r));
  });

  await test('applySaveResult: "" is settings only, the boards landed', async () => {
    const r = await page(() => {
      const landed = applySaveResult({ settings: '{"y":1}', boards: [{ id: 't3', json: 'c' }] },
        { ok: false, errors: [{ id: '', error: 'settings refused' }] });
      return { landed: [...landed], settings: lastWrittenSettings === '{"y":1}' };
    });
    ok(r.landed.join() === 't3' && !r.settings, JSON.stringify(r));
  });

  await test('applySaveResult: one board failing leaves the other stamped', async () => {
    const r = await page(() => [...applySaveResult({ boards: [{ id: 't4', json: 'd' }, { id: 't5', json: 'e' }] },
      { ok: false, errors: [{ id: 't5', error: 'read-only' }] })]);
    ok(r.join() === 't4', JSON.stringify(r));
  });

  await test('applySaveResult: no answer at all is a failure, not a success', async () => {
    const r = await page(() => [undefined, null, false, 'what'].map((raw) =>
      applySaveResult({ boards: [{ id: 't6', json: 'f' + Math.random() }] }, raw).size));
    ok(r.every((n) => n === 0), JSON.stringify(r));
  });

  await test('a real failed write is said, retried, and lands once the disk allows', async () => {
    const file = path.join(BOARDS, 'Good', 'board.json');
    const keep = fs.readFileSync(file, 'utf8');
    fs.rmSync(file); fs.mkdirSync(file); fs.writeFileSync(path.join(file, 'block'), 'x');   // the rename over it fails
    const first = await page(async () => {
      state.notes[0].body = '<p>changed while the disk said no</p>';
      saveBroken = false;
      await writeNow();
      return { broken: saveBroken, stillDirty: dirtyDocs().boards.some((b) => b.id === 'good1') };
    });
    fs.rmSync(file, { recursive: true }); fs.writeFileSync(file, keep);
    const second = await page(async () => { await writeNow(); return { broken: saveBroken, stillDirty: dirtyDocs().boards.some((b) => b.id === 'good1') }; });
    ok(first.broken && first.stillDirty, 'the failure must be reported and kept dirty: ' + JSON.stringify(first));
    ok(!second.broken && !second.stillDirty, 'the retry must land: ' + JSON.stringify(second));
    ok(boardJson('Good').notes[0].body.includes('changed while the disk said no'), 'the change is on disk');
  });

  await test('a date set in the menu reaches the disk', async () => {
    await page(async () => { setNoteDate(['n1'], dayKeyIn(1)); await saveNow(); });
    const want = await page(() => dayKeyIn(1));
    ok(boardJson('Good').notes.find((n) => n.id === 'n1').date === want);
  });

  await test('a late note is red, a done one is not', async () => {
    const r = await page(() => {
      setNoteDate(['n1'], dayKeyIn(-3));
      const late = els.get('n1').querySelector('.nd-pill').className;
      setStatus(['n1'], 'done');
      const done = els.get('n1').querySelector('.nd-pill').className;
      setStatus(['n1'], 'todo');
      return { late, done };
    });
    ok(/\blate\b/.test(r.late) && /\bdone\b/.test(r.done) && !/\blate\b/.test(r.done), JSON.stringify(r));
  });

  await test('"remove unused files" refuses while a board is unreadable', async () => {
    await page(async () => { confirmDlg = async () => true; await cleanUpFiles(); });
    ok(fs.existsSync(path.join(BOARDS, 'Broken', 'files', 'precious.png')), 'the unreadable board lost its file');
  });

  await test('deleting a board keeps its folder when the bin cannot be written', async () => {
    // a second board with a picture, then a bin whose board.json cannot be replaced
    const made = await page(async () => {
      const b = makeBoard('Doomed');
      state.boards.push(b);
      await saveNow();
      const r = await mbFiles.attachBytes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', b.id, 'dot.png');
      b.notes.push({ id: 'pic1', x: 0, y: 0, w: 100, h: 100, body: `<img class="mb-img" src="${r.url}">`, color: 'default', z: 1 });
      const tb = ensureTrash();
      await saveNow();
      return { id: b.id, dir: mbData.paths().root, trash: tb.id };
    });
    const binDir = fs.readdirSync(BOARDS).find((d) => { try { return JSON.parse(fs.readFileSync(path.join(BOARDS, d, 'board.json'), 'utf8')).trash; } catch (_) { return false; } });
    ok(binDir, 'the bin should be on disk');
    const binFile = path.join(BOARDS, binDir, 'board.json');
    const keep = fs.readFileSync(binFile, 'utf8');
    fs.rmSync(binFile); fs.mkdirSync(binFile); fs.writeFileSync(path.join(binFile, 'block'), 'x');
    await page(async (id) => { confirmDlg = async () => true; await deleteBoard(id); }, made.id);
    const stillThere = fs.existsSync(path.join(BOARDS, 'Doomed', 'files', 'dot.png'));
    fs.rmSync(binFile, { recursive: true }); fs.writeFileSync(binFile, keep);
    ok(stillThere, 'the folder (and its picture) was removed although the bin never landed');
  });

  for (const extra of EXTRA) await extra({ page, test, ok, boardJson, BOARDS, fs, path, sleep });

  /* Last: nothing in all of the above made the page throw or log an error.
     A few are expected and named — the failed writes the save tests cause on
     purpose, and the clip that cannot play — and everything else fails. */
  await test('no uncaught errors or console errors in the page', async () => {
    const expected = [
      /broken\.avi|DEMUXER|MEDIA_ELEMENT_ERROR|Format error/i,                // the clip that cannot play
      /ERR_FILE_NOT_FOUND.*mbf|mbf:\/\/.*(404|ERR_)/i,
      // the writes the save tests make fail on purpose (a directory where board.json goes)
      /^console\.error: board save failed: (boom|EPERM: operation not permitted, rename .*board\.json(\.async)?\.tmp')/
    ];
    const real = pageErrors.filter((e) => !expected.some((re) => re.test(e)));
    ok(!real.length, real.join('\n       '));
  });
}

/* Feature suites added later register here, so this file stays one runner. */
const EXTRA = [];
try { EXTRA.push(...require('./test-app-features.js')); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') throw err; }

/* ---- quitting ----
   Each of these ends the app it launched, so each gets an app of its own, after
   the suite above. Quit is asked for the way the tray's Quit asks — app.quit()
   in main, over the Node inspector (--inspect), because a tray menu cannot be
   clicked from here. What it checks is the 2.2.1 bug: Quit left all four
   processes running when the page did not answer beforeunload (main.js,
   armQuitWatchdog). "Every process" is found by command line, which carries
   the throwaway --user-data-dir. */
function appProcesses(udd) {
  const tag = path.basename(udd);
  try {
    const { execFileSync } = require('child_process');
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process | Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -like '*${tag}*' } | ForEach-Object { $_.ProcessId }`;
      return execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).split(/\s+/).filter(Boolean);
    }
    return execFileSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).split('\n').filter((l) => l.includes(tag)).map((l) => l.trim().split(' ')[0]);
  } catch (_) { return ['?']; }
}
async function cdpAt(port, pick) {
  for (let i = 0; i < 80; i++) {
    try {
      const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(pick);
      if (target) {
        const sock = new WebSocket(target.webSocketDebuggerUrl);
        const waiting = new Map();
        let n = 0;
        sock.onmessage = (m) => { const d = JSON.parse(m.data); if (waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
        await new Promise((r, j) => { sock.onopen = r; sock.onerror = j; });
        // `require` exists only in the inspector's command line, and only while the expression runs
        const ev = (expression) => new Promise((r) => {
          const id = ++n;
          waiting.set(id, (d) => r(d.result && d.result.result && d.result.result.value));
          sock.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true } }));
        });
        return {
          ev, fire: (expression) => sock.send(JSON.stringify({ id: ++n, method: 'Runtime.evaluate', params: { expression } })),
          send: (method, params) => sock.send(JSON.stringify({ id: ++n, method, params })),
          close: () => sock.close()
        };
      }
    } catch (_) {}
    await sleep(250);
  }
  throw new Error('nothing to attach to on port ' + port);
}
/* `how` (2.5.1): 'tray' asks main for app.quit() as the tray's Quit does;
   'ctrlq' presses Ctrl+Q in the window, launched with --tray so closing would
   only hide it; 'close' closes the window of a test copy, which has no tray
   and so must end. */
async function quitApp(name, prepare, within, after, how) {
  how = how || 'tray';
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-quit-test-'));
  const boards = path.join(udd, 'My Boards');
  fs.mkdirSync(path.join(boards, 'Good', 'files'), { recursive: true });
  fs.writeFileSync(path.join(boards, 'settings.json'), JSON.stringify({ v: 3, settings: {}, boardOrder: ['good1'], activeBoard: 'good1' }));
  fs.writeFileSync(path.join(boards, 'Good', 'board.json'), JSON.stringify({ mbBoard: 2, id: 'good1', name: 'Good', notes: [{ id: 'n1', x: 0, y: 0, w: 260, h: 180, body: '<p>one</p>' }], frames: [], links: [] }));
  const rport = 9900 + Math.floor(Math.random() * 300), mport = rport + 400;
  let proc = null, exited = false;
  await test(name, async () => {
    const args = ['.', `--user-data-dir=${udd}`, `--remote-debugging-port=${rport}`, `--inspect=${mport}`];
    if (how === 'ctrlq' || how === 'ctrlq-silent') args.push('--tray');
    proc = spawn(require('electron'), args, { cwd: ROOT, stdio: 'ignore', windowsHide: true });
    proc.on('exit', () => { exited = true; });
    const pg = await cdpAt(rport, (p) => p.type === 'page' && /index\.html/.test(p.url));
    for (let i = 0; i < 80 && await pg.ev('typeof flushSave === "function" && !!document.querySelector("#notesLayer")') !== true; i++) await sleep(250);
    await sleep(600);
    const main = await cdpAt(mport, () => true);
    await prepare(pg);
    if (how === 'tray') {
      // what the tray's Quit does; the inspector has to be gone or the process waits for it on the way out
      ok(await main.ev("(() => { const { app } = require('electron'); setTimeout(() => app.quit(), 300); return 1; })()") === 1, 'could not reach main');
      main.close();       // the page's socket stays open: detaching DevTools from a hung page lets it go
    } else {
      main.close();
      if (how === 'ctrlq' || how === 'ctrlq-silent') {
        const key = { modifiers: 2, key: 'q', code: 'KeyQ', windowsVirtualKeyCode: 81, nativeVirtualKeyCode: 81 };
        pg.send('Input.dispatchKeyEvent', Object.assign({ type: 'rawKeyDown' }, key));
        pg.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, key));
      } else pg.fire('WIN.close()');
    }
    const t0 = Date.now();
    while (!exited && Date.now() - t0 < within) await sleep(100);
    pg.close();
    ok(exited, `the main process was still running ${within / 1000} s after Quit`);
    await sleep(1500);
    const left = appProcesses(udd);
    ok(!left.length, 'still running after Quit: ' + left.join(', '));
    if (after) after(fs.readFileSync(path.join(boards, 'Good', 'board.json'), 'utf8'), udd);
  });
  if (proc && !exited) { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' }) : proc.kill(); } catch (_) {} await sleep(1500); }
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch (_) {}
}
async function quitSuite() {
  console.log('\nquitting (an app each)');
  await quitApp('Quit writes the last edit and ends every process', async (pg) => {
    await pg.ev("(() => { state.notes[0].body = '<p>said on the way out</p>'; return 1; })()");
  }, 5000, (json) => ok(json.includes('said on the way out'), 'the edit made just before Quit is not on disk'));
  // a page that never answers beforeunload: before 2.2.2 this one never ended
  await quitApp('Quit ends every process even when the page never answers', async (pg) => {
    pg.fire('setTimeout(() => { for (;;) {} }, 0)');
    await sleep(800);
  }, 8000 + 5000);
  // 2.5.1: Ctrl+Q ends the app even when closing the window would only hide it
  await quitApp('Ctrl+Q writes the last edit and ends every process, tray or no tray', async (pg) => {
    await pg.ev("(() => { state.notes[0].body = '<p>said before Ctrl+Q</p>'; return 1; })()");
  }, 5000, (json) => ok(json.includes('said before Ctrl+Q'), 'the edit made just before Ctrl+Q is not on disk'), 'ctrlq');
  // 2.6.1: a page that never answers Ctrl+Q — what happened on the user's machine — is quit from main
  await quitApp('Ctrl+Q still quits when the page never answers it, and says so in hangs.log', async (pg) => {
    await pg.ev("(() => { state.notes[0].body = '<p>said before a silent Ctrl+Q</p>'; closeAndQuit = async () => {}; return 1; })()");
  }, 2000 + 5000, (json, dir) => {
    ok(json.includes('said before a silent Ctrl+Q'), 'the edit made just before Ctrl+Q is not on disk');
    let log = '';
    try { log = fs.readFileSync(path.join(dir, 'hangs.log'), 'utf8'); } catch (_) {}
    ok(log.includes('Ctrl+Q (heard by main): the page did not ask to quit'), 'no fallback line in hangs.log: ' + JSON.stringify(log));
  }, 'ctrlq-silent');
  // 2.5.1: a test copy has no tray icon to leave behind, so its close button ends it
  await quitApp('a test copy has no tray: closing its window ends it', async () => {}, 5000, null, 'close');
}

(async () => {
  let code = 1;
  try {
    seed();
    const electron = require('electron');            // the path to the binary, from node
    child = spawn(electron, ['.', `--user-data-dir=${UDD}`, `--remote-debugging-port=${PORT}`], { cwd: ROOT, stdio: 'ignore', windowsHide: true });
    await connect();
    await send('Runtime.enable');
    await send('Log.enable');
    await waitForApp();
    await sleep(600);                                // let init() finish its first paint
    await run();
    try { ws && ws.close(); } catch (_) {}
    if (child) { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }) : child.kill(); } catch (_) {} child = null; }
    await quitSuite();
    console.log(`\n${passed} passed, ${failed} failed`);
    code = failed ? 1 : 0;
  } catch (err) {
    console.error('could not run the app tests:', err && err.message || err);
  } finally {
    try { ws && ws.close(); } catch (_) {}
    if (child) { try { process.platform === 'win32' ? spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }) : child.kill(); } catch (_) {} }
    await sleep(1500);
    try { fs.rmSync(UDD, { recursive: true, force: true }); } catch (_) {}
    process.exit(code);
  }
})();
