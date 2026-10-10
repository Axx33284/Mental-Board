/* Tests for src/store.js — the one module that touches the user's boards.

   Plain Node, no framework: each test gets a fresh temporary My Boards
   folder, calls the store the way main does, and looks at the disk. Run with
   `npm test` (which `npm run build` runs). Nothing here ships.

   The cases are the ones that have cost somebody a board, or nearly did —
   MAP.md §3 and §7 explain each. A test that fails here is a release that
   must not go out. */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const STORE = require.resolve(path.join(__dirname, '..', 'src', 'store.js'));
let failures = 0, passed = 0;
const tmpRoots = [];

/* A fresh copy of the module per test: store.js keeps its id→folder map in
   module state, and one test's boards must not be visible to the next. */
function freshStore() {
  delete require.cache[STORE];
  const store = require(STORE);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-test-'));
  tmpRoots.push(root);
  store.init(path.join(root, 'My Boards'));
  return { store, root, boards: path.join(root, 'My Boards') };
}
async function test(name, fn) {
  try { await fn(freshStore()); passed++; console.log('  ok   ' + name); }
  catch (err) { failures++; console.log('  FAIL ' + name + '\n       ' + String(err && err.stack || err).split('\n').slice(0, 4).join('\n       ')); }
}
const board = (id, name, extra) => ({ id, name, group: '', json: JSON.stringify(Object.assign({ mbBoard: 2, id, name, notes: [], frames: [], links: [] }, extra || {})) });
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

(async () => {
  console.log('store.js');

  await test('a save writes settings and one folder per board', ({ store, boards }) => {
    const r = store.saveAll({ settings: '{"v":3}', boards: [board('a1', 'Ideas'), board('b2', 'Work')] });
    assert.deepStrictEqual(r.errors, []);
    assert.ok(r.ok);
    assert.ok(fs.existsSync(path.join(boards, 'settings.json')));
    assert.strictEqual(read(path.join(boards, 'Ideas', 'board.json')).id, 'a1');
    assert.strictEqual(read(path.join(boards, 'Work', 'board.json')).id, 'b2');
  });

  await test('the second write keeps the first as board.bak.json', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas', { notes: [{ id: 'n1' }] })] });
    store.saveAll({ boards: [board('a1', 'Ideas', { notes: [{ id: 'n1' }, { id: 'n2' }] })] });
    assert.strictEqual(read(path.join(boards, 'Ideas', 'board.json')).notes.length, 2);
    assert.strictEqual(read(path.join(boards, 'Ideas', 'board.bak.json')).notes.length, 1);
  });

  await test('one board failing does not stop the others, and is named', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas'), board('b2', 'Work')] });
    // a directory where board.json should be: the rename over it fails
    const bad = path.join(boards, 'Ideas', 'board.json');
    fs.rmSync(bad); fs.mkdirSync(bad); fs.writeFileSync(path.join(bad, 'x'), 'x');
    const r = store.saveAll({ boards: [board('a1', 'Ideas', { notes: [{ id: 'z' }] }), board('b2', 'Work', { notes: [{ id: 'y' }] })] });
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.errors.map((e) => e.id), ['a1']);
    assert.strictEqual(read(path.join(boards, 'Work', 'board.json')).notes.length, 1);
  });

  await test('the async save reports per board too, and never throws', async ({ store, boards }) => {
    await store.saveAllAsync({ boards: [board('a1', 'Ideas'), board('b2', 'Work')] });
    const bad = path.join(boards, 'Work', 'board.json');
    fs.rmSync(bad); fs.mkdirSync(bad); fs.writeFileSync(path.join(bad, 'x'), 'x');
    const r = await store.saveAllAsync({ boards: [board('a1', 'Ideas'), board('b2', 'Work')] });
    assert.strictEqual(r.ok, false);
    assert.deepStrictEqual(r.errors.map((e) => e.id), ['b2']);
  });

  await test('a rename moves the folder, the files go with it', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    fs.mkdirSync(path.join(boards, 'Ideas', 'files'));
    fs.writeFileSync(path.join(boards, 'Ideas', 'files', 'p.png'), 'png');
    const r = store.saveAll({ boards: [board('a1', 'Better ideas')] });
    assert.ok(r.ok);
    assert.ok(!fs.existsSync(path.join(boards, 'Ideas')));
    assert.ok(fs.existsSync(path.join(boards, 'Better ideas', 'files', 'p.png')));
    assert.ok(store.resolveFile('a1', 'p.png'));
  });

  await test('a board moved into a group lands in a sub-folder', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    store.saveAll({ boards: [Object.assign(board('a1', 'Ideas'), { group: 'Work' })] });
    assert.ok(fs.existsSync(path.join(boards, 'Work', 'Ideas', 'board.json')));
  });

  await test('names Windows refuses are made safe, never fail the save', ({ store, boards }) => {
    const r = store.saveAll({ boards: [board('a1', 'CON'), board('b2', 'a/b:c*?"<>|'), board('c3', '   ')] });
    assert.ok(r.ok, JSON.stringify(r.errors));
    const names = fs.readdirSync(boards);
    assert.ok(names.includes('_CON'));
    assert.ok(names.some((n) => n.startsWith('a-bc')));
  });

  await test('scan reads boards back, top level and in groups', ({ store }) => {
    store.saveAll({ settings: '{"v":3}', boards: [board('a1', 'Ideas'), Object.assign(board('b2', 'Plan'), { group: 'Work' })] });
    const s = store.scan();
    assert.strictEqual(s.settings.status, 'ok');
    assert.deepStrictEqual(s.boards.map((b) => b.id).sort(), ['a1', 'b2']);
    assert.strictEqual(s.boards.find((b) => b.id === 'b2').group, 'Work');
  });

  await test('a corrupt board.json falls back to .bak, marked as such', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas', { notes: [{ id: 'n1' }] })] });
    store.saveAll({ boards: [board('a1', 'Ideas', { notes: [{ id: 'n1' }, { id: 'n2' }] })] });
    fs.writeFileSync(path.join(boards, 'Ideas', 'board.json'), '{ half a fi');
    const row = store.scan().boards[0];
    assert.strictEqual(row.status, 'ok');
    assert.strictEqual(row.from, 'backup');
    assert.strictEqual(row.data.notes.length, 1);
  });

  await test('both copies corrupt is "unreadable", never "empty"', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    fs.writeFileSync(path.join(boards, 'Ideas', 'board.json'), 'nope');
    fs.writeFileSync(path.join(boards, 'Ideas', 'board.bak.json'), 'nope');
    const row = store.scan().boards[0];
    assert.strictEqual(row.status, 'unreadable');
    assert.strictEqual(row.data, null);
  });

  await test('a broken settings.json is set aside, not written over', ({ store, boards }) => {
    store.saveAll({ settings: '{"v":3}' });
    fs.writeFileSync(path.join(boards, 'settings.json'), '{oops');
    fs.writeFileSync(path.join(boards, 'settings.bak.json'), '{oops');
    store.scan();
    assert.ok(fs.readdirSync(boards).some((n) => /^settings\.broken-\d+\.json$/.test(n)));
  });

  await test('a copied folder wearing another board\'s id gets its own', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    fs.cpSync(path.join(boards, 'Ideas'), path.join(boards, 'Ideas copy'), { recursive: true });
    const rows = store.scan().boards;
    assert.strictEqual(rows.length, 2);
    const fresh = rows.find((r) => r.renamedFrom === 'a1');
    assert.ok(fresh && fresh.id !== 'a1');
  });

  await test('a file name cannot climb out of the board\'s folder', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    fs.writeFileSync(path.join(boards, 'settings.json'), '{}');
    assert.strictEqual(store.resolveFile('a1', '../../settings.json'), '');
    assert.strictEqual(store.resolveFile('a1', '..\\settings.json'), '');
    assert.strictEqual(store.resolveFile('nope', 'x.png'), '');
  });

  await test('attaching copies, never overwrites, and refuses an unknown board', async ({ store, root }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    const src = path.join(root, 'pic.png');
    fs.writeFileSync(src, 'one');
    const r1 = await store.attachFile(src, 'a1');
    const r2 = await store.attachFile(src, 'a1');
    assert.strictEqual(r1.url, 'mbf://a1/pic.png');
    assert.strictEqual(r2.url, 'mbf://a1/pic%20(2).png');
    assert.ok((await store.attachFile(src, 'zz')).error);
  });

  await test('cleanup removes only what nothing keeps, and only when asked', async ({ store, root }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    const src = path.join(root, 'a.png'); fs.writeFileSync(src, 'a');
    const keep = await store.attachFile(src, 'a1');
    const drop = await store.attachFile(src, 'a1');
    const count = store.cleanup([keep.url], false);
    assert.strictEqual(count.files, 1);
    assert.ok(store.resolveFile('a1', drop.name), 'counting must not delete');
    store.cleanup([keep.url], true);
    assert.ok(store.resolveFile('a1', keep.name));
    assert.strictEqual(store.resolveFile('a1', drop.name), '');
  });

  await test('removing a board folder refuses anything outside My Boards', ({ store }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    assert.ok(store.removeBoardDir('a1').ok);
    assert.strictEqual(store.boardDir('a1'), '');
    assert.ok(store.removeBoardDir('never-was').skipped);
  });

  await test('daily snapshots keep fourteen, version snapshots are kept apart', ({ store, boards }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    for (let d = 1; d <= 20; d++) store.snapshot('a1', '{}', `2026-01-${String(d).padStart(2, '0')}`);
    store.versionSnapshot('a1', '{}', '2.0.0');
    const files = fs.readdirSync(path.join(boards, 'Backups', 'Ideas'));
    assert.strictEqual(files.filter((f) => /^\d{4}/.test(f)).length, 14);
    assert.ok(files.includes('before-2.0.0.json'));
    assert.ok(store.snapshot('a1', '{}', '2026-01-20').skipped);
  });

  await test('a 1.x board.json migrates once, files and links included', ({ store, root, boards }) => {
    const old = path.join(root, 'appdata');
    fs.mkdirSync(path.join(old, 'files', 'b1'), { recursive: true });
    fs.writeFileSync(path.join(old, 'files', 'b1', 'cat.png'), 'meow');
    const body = `<img src="file:///C:/Users/x/AppData/Roaming/Mental%20Board/files/b1/cat.png">`;
    fs.writeFileSync(path.join(old, 'board.json'), JSON.stringify({ boards: [{ id: 'B1', name: 'Old', notes: [{ id: 'n', body }] }] }));
    const m = store.migrateLegacy(old);
    assert.strictEqual(m.migrated, 1);
    const b = read(path.join(boards, 'Old', 'board.json'));
    assert.ok(b.notes[0].body.includes('mbf://b1/cat.png'), b.notes[0].body);
    assert.ok(fs.existsSync(path.join(boards, 'Old', 'files', 'cat.png')));
    assert.ok(fs.existsSync(path.join(old, 'board.json')), 'the old file is left alone');
    assert.strictEqual(store.migrateLegacy(old), null, 'only once');
  });

  await test('a 1.0.x file (no boards[]) migrates its top-level notes, not nothing', ({ store, root, boards }) => {
    const old = path.join(root, 'appdata');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'board.json'), JSON.stringify({ notes: [{ id: 'n1' }, { id: 'n2' }], frames: [], links: [] }));
    assert.strictEqual(store.migrateLegacy(old).migrated, 1);
    const dir = fs.readdirSync(boards).find((n) => n !== 'settings.json' && !n.endsWith('.json'));
    assert.strictEqual(read(path.join(boards, dir, 'board.json')).notes.length, 2);
  });

  await test('a migration whose writes fail leaves no marker and says so', ({ store, root }) => {
    const old = path.join(root, 'appdata');
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, 'board.json'), JSON.stringify({ boards: [{ id: 'b1', name: 'Old', notes: [] }] }));
    // the store shares this fs module, so a failing rename is a failing write
    const real = fs.renameSync;
    fs.renameSync = (from, to) => { if (/board\.json$/.test(to)) throw new Error('disk says no'); return real(from, to); };
    let m;
    try { m = store.migrateLegacy(old); } finally { fs.renameSync = real; }
    assert.ok(m && m.error, 'a failed write must come back as an error: ' + JSON.stringify(m));
    assert.ok(!fs.existsSync(path.join(old, '.migrated-to-my-boards')), 'no marker after a failure');
  });

  await test('export copies the folder without .bak or scratch files', ({ store, root }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    const r = store.exportBoard('a1', path.join(root, 'out'), 'Ideas');
    assert.ok(r.path);
    const names = fs.readdirSync(r.path);
    assert.ok(names.includes('board.json'));
    assert.ok(!names.includes('board.bak.json'));
  });

  await test('the mirror never deletes, and skips what has not changed', ({ store, root }) => {
    store.saveAll({ settings: '{}', boards: [board('a1', 'Ideas')] });
    const dest = path.join(root, 'stick');
    const first = store.mirrorTo(dest);
    assert.ok(first.files >= 2);
    fs.writeFileSync(path.join(dest, 'Mental Board backup', 'mine.txt'), 'keep me');
    const second = store.mirrorTo(dest);
    assert.strictEqual(second.files, 0);
    assert.ok(fs.existsSync(path.join(dest, 'Mental Board backup', 'mine.txt')));
  });

  await test('a backup folder inside My Boards is refused, not copied into itself', ({ store, boards }) => {
    store.saveAll({ settings: '{}', boards: [board('a1', 'Ideas')] });
    const inside = path.join(boards, 'Ideas');
    const a = store.mirrorTo(inside);
    const b = store.backupAllTo(inside);
    assert.strictEqual(a.error, 'inside My Boards');
    assert.strictEqual(b.error, 'inside My Boards');
    // and nothing was made on the way to finding that out
    assert.deepStrictEqual(fs.readdirSync(inside).sort(), ['board.json']);
  });

  await test('a canvas finds its files up the vault, and nothing it should not', ({ store, root }) => {
    const vault = path.join(root, 'Vault');
    fs.mkdirSync(path.join(vault, 'Boards', 'Deep'), { recursive: true });
    fs.mkdirSync(path.join(vault, 'Media'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'Media', 'a.png'), 'a');
    fs.writeFileSync(path.join(vault, 'Boards', 'Deep', 'b.mp4'), 'b');
    fs.writeFileSync(path.join(vault, 'secret.exe'), 'x');
    const got = store.resolveCanvasFiles(path.join(vault, 'Boards', 'Deep'),
      ['Media/a.png', 'b.mp4', 'nowhere/b.mp4', '../../secret.exe', 'secret.exe', '../../../Vault/Media/a.png']);
    assert.strictEqual(got['Media/a.png'], path.join(vault, 'Media', 'a.png'));
    assert.strictEqual(got['b.mp4'], path.join(vault, 'Boards', 'Deep', 'b.mp4'));
    assert.strictEqual(got['nowhere/b.mp4'], path.join(vault, 'Boards', 'Deep', 'b.mp4'), 'found by name beside the canvas');
    assert.ok(!got['../../secret.exe'] && !got['secret.exe'], 'an .exe is never taken');
  });

  await test('a canvas is written whole, with its files, and only as .canvas', ({ store, root }) => {
    store.saveAll({ boards: [board('a1', 'Ideas')] });
    fs.mkdirSync(path.join(root, 'My Boards', 'Ideas', 'files'), { recursive: true });
    fs.writeFileSync(path.join(root, 'My Boards', 'Ideas', 'files', 'p.png'), 'p');
    const out = path.join(root, 'out', 'Ideas.canvas');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const r = store.writeCanvas(out, '{"nodes":[],"edges":[]}', 'a1', ['p.png', 'gone.png'], 'Ideas files');
    assert.strictEqual(r.files, 1);
    assert.deepStrictEqual(r.missing, ['gone.png']);
    assert.deepStrictEqual(read(out), { nodes: [], edges: [] });
    assert.ok(fs.existsSync(path.join(root, 'out', 'Ideas files', 'p.png')));
    assert.ok(store.writeCanvas(path.join(root, 'out', 'x.json'), '{}', 'a1', [], 'f').error);
    assert.ok(store.writeCanvas(out, '{"nodes":[]}', 'a1', ['p.png'], '..\\escape').error);
    assert.ok(store.writeCanvas(out, 'not json', 'a1', [], 'f').error);
  });

  for (const r of tmpRoots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) {} }
  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
