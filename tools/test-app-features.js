/* Feature suites for tools/test-app.js — each entry is one async function
   handed the runner's helpers. Kept apart so the save-path tests at the top of
   test-app.js stay short enough to read. Nothing here ships. */
'use strict';

const DOT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

module.exports = [

  /* ---- smoke: every panel, menu and dialog opens and closes ----
     Not a test of what each one does — the error capture in test-app.js is
     the assertion. A panel that throws on open fails the run here. */
  async ({ page, test, ok, sleep }) => {
    const step = (name, fn) => test('smoke: ' + name, async () => { await page(fn); await sleep(60); });
    await page(() => { confirmDlg = async () => true; });       // nothing waits on a click

    await step('every settings tab', async () => {
      openSettings();
      for (const tab of document.querySelectorAll('.set-tab')) { tab.click(); await new Promise((r) => setTimeout(r, 30)); }
      $('setSearch').value = 'theme'; $('setSearch').dispatchEvent(new Event('input'));
      $('setSearch').value = ''; $('setSearch').dispatchEvent(new Event('input'));
      closeSettings();
    });
    await step('palette, find, the boards window, focus mode', async () => {
      openPalette(); closePalette();
      openFind(); $('findInput').value = 'one'; $('findInput').dispatchEvent(new Event('input')); closeFind();
      toggleBoardWindow(); toggleBoardWindow();
      toggleFocusMode(true); toggleFocusMode(false);
    });
    await step('a note: edit, slash blocks, a table, a to-do, the embed dialog', async () => {
      const n = addNote({ x: 9000, y: 9000 }, { edit: false });
      enterEdit(n);
      insertTable(3, 3); insertTodo();
      openEmbedDialog(); closeEmbedDialog();
      exitEdit();
      openCtxMenu(200, 200, n.id); closeCtxMenu();
      openCtxMenu(200, 200, null); closeCtxMenu();
      openRemindDialog(n.id); $('remindDlg').classList.add('hidden');
      openTemplateDialog(n.id); closeTemplateDialog();
      openIconPicker(n.id); closeIconPicker();
      openHistory(n.id); $('histDlg').classList.add('hidden');
    });
    await step('selection: arrange, duplicate, delete to the bin, put back, empty', async () => {
      selectAll(); arrangeSelection('grid');
      const ids = [...selection];
      duplicate(ids.slice(0, 1));
      const one = [...selection][0];
      await askThenDelete([one]);
      const bin = state.boards.find((b) => b.trash);
      if (bin) { await switchBoard(bin.id); selectAll(); putBack([...selection]); }
      const live = state.boards.find((b) => !b.trash && !b.unreadable && !b.enc);
      await switchBoard(live.id);
      await emptyTrash();
    });
    await step('the page menu, groups, duplicate and archive a board', async () => {
      openPageMenu(); closePageMenu();
      const b = activeBoard();
      openMoveTo(b.id); closeMoveTo();
      await duplicateBoard(b.id);
      const copy = state.boards[state.boards.length - 1];
      archiveBoard(copy.id, true); archiveBoard(copy.id, false);
      renderBoardRail();
    });
    await step('the picture studio', async () => {
      const pic = state.notes.find((n) => n.pic);
      if (pic) { editPicture(pic.id); await new Promise((r) => setTimeout(r, 200)); closeStudio(); }
    });
    await step('the camera', async () => { zoomToFitAll(); resetZoom(); zoomCentre(1.2); zoomCentre(1 / 1.2); });

    await test('smoke: all twenty themes, light and dark, draw the new views', async () => {
      const r = await page(async () => {
        const seen = [];
        for (const th of THEMES) {
          state.settings.themeMode = 'fixed'; state.settings.theme = th.id;
          applyTheme();
          openAgenda(); closeAgenda(); openKanban(); closeKanban();
          drawMinimap();
          seen.push(th.id);
        }
        state.settings.theme = 'mental'; applyTheme();
        return seen.length;
      });
      ok(r >= 18, 'themes walked: ' + r);
    });

    await test('smoke: Arabic — the new rows, pills and views in a right-to-left window', async () => {
      const r = await page(async () => {
        state.settings.lang = 'ar'; applyLang();
        const n = state.notes.find((x) => !x.pic);
        setNoteDate([n.id], dayKeyIn(1));
        openCtxMenu(300, 300, n.id);
        const dateRow = [...document.querySelectorAll('#ctxMenu .cm-label span')].map((s) => s.textContent);
        closeCtxMenu();
        openAgenda();
        const head = document.querySelector('#agendaDlg h2').textContent;
        closeAgenda();
        const pill = ensureMounted(n.id).querySelector('.nd-pill').textContent;
        state.settings.lang = 'en'; applyLang();
        return { dir: 'rtl', dateRow, head, pill };
      });
      ok(r.dateRow.includes('التاريخ'), 'menu: ' + JSON.stringify(r.dateRow));
      ok(r.head === 'الأجندة' && r.pill === 'غدًا', JSON.stringify(r));
    });
  },

  /* ---- the minimap, the agenda, the board as columns (js/views.js) ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await test('views: setup — a second board with dated work', async () => {
      const r = await page(async () => {
        const w = makeBoard('Sprint');
        const mk = (id, x, status, days) => ({ id, x, y: 0, w: 240, h: 140, z: 1, color: 'default', status, date: days == null ? '' : dayKeyIn(days), body: `<h3>${id} title</h3><p>${id} detail</p>` });
        w.notes.push(mk('s1', 0, 'todo', -2), mk('s2', 300, 'doing', 0), mk('s3', 600, 'todo', 9), mk('s4', 900, '', null));
        state.boards.push(w);
        await saveNow();
        window.__sprint = w.id;
        return w.id;
      });
      ok(r);
    });

    await test('views: the agenda lists every dated note, by section, across boards', async () => {
      const r = await page(async () => {
        openAgenda();
        const rows = [...document.querySelectorAll('#agendaBody .ag-row')].map((x) => x.dataset.note);
        const heads = [...document.querySelectorAll('#agendaBody .ag-head')].map((x) => x.textContent);
        const title = document.querySelector('#agendaBody .ag-row[data-note="s1"] .ag-title').textContent;
        return { rows, heads, title, late: document.querySelector('.ag-row[data-note="s1"]').classList.contains('late') };
      });
      ok(['s1', 's2', 's3'].every((id) => r.rows.includes(id)) && !r.rows.includes('s4'), 'rows ' + JSON.stringify(r.rows));
      ok(r.rows.indexOf('s1') < r.rows.indexOf('s2') && r.rows.indexOf('s2') < r.rows.indexOf('s3'), 'date order');
      ok(r.heads[0] === 'Overdue' && r.late, 'overdue first: ' + JSON.stringify(r.heads));
      ok(r.title === 's1 title', 'title is the first block, got ' + JSON.stringify(r.title));
    });

    await test('views: ticking a note on another board marks it done, on disk', async () => {
      await page(async () => {
        document.querySelector('.ag-row[data-note="s1"] [data-act="done"]').click();
        await saveNow();
      });
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Sprint'));
      const n = JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8')).notes.find((x) => x.id === 's1');
      ok(n.status === 'done', 'status on disk: ' + n.status);
    });

    await test('views: picking a day shows only that day', async () => {
      const r = await page(() => {
        const key = dayKeyIn(9);
        // move the calendar to that day's month, then click the day
        const d = new Date(); d.setDate(d.getDate() + 9);
        agendaMonth = { y: d.getFullYear(), m: d.getMonth() }; renderAgenda();
        document.querySelector(`.ag-day[data-day="${key}"]`).click();
        const rows = [...document.querySelectorAll('#agendaBody .ag-row')].map((x) => x.dataset.note);
        agendaDay = ''; closeAgenda();
        return rows;
      });
      ok(JSON.stringify(r) === '["s3"]', JSON.stringify(r));
    });

    await test('views: dropping a card in another column sets its status', async () => {
      const r = await page(async () => {
        await switchBoard(window.__sprint);
        openKanban();
        const cols = [...document.querySelectorAll('.kb-col')].map((c) => [c.dataset.status, c.querySelectorAll('.kb-card').length]);
        const card = document.querySelector('.kb-card[data-id="s3"]');
        const target = document.querySelector('.kb-col[data-status="blocked"]');
        const dt = new DataTransfer();
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        const s3 = state.notes.find((n) => n.id === 's3').status;
        const pill = els.get('s3') && els.get('s3').querySelector('.ns-pill .ns-name').textContent;
        undo();
        const undone = state.notes.find((n) => n.id === 's3').status;
        closeKanban();
        return { cols, s3, pill, undone };
      });
      ok(r.s3 === 'blocked' && r.pill === 'Blocked', JSON.stringify(r));
      ok(r.undone === 'todo', 'undo puts it back: ' + r.undone);
      ok(r.cols.find((c) => c[0] === '')[1] === 1, 'the no-status column has s4');
    });

    await test('views: the minimap shows, and a click there moves the view', async () => {
      const r = await page(async () => {
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const cv = $('minimap');
        const shown = !cv.classList.contains('hidden');
        const before = { ...state.view };
        const b = cv.getBoundingClientRect();
        // the bottom-right corner of the map is far from where the view is
        cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1, clientX: b.right - 4, clientY: b.bottom - 4 }));
        cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, pointerId: 1 }));
        const moved = state.view.x !== before.x || state.view.y !== before.y;
        state.settings.minimap = false; scheduleMinimap();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const off = cv.classList.contains('hidden');
        state.settings.minimap = true; scheduleMinimap();
        return { shown, moved, off };
      });
      ok(r.shown && r.moved && r.off, JSON.stringify(r));
    });
  },

  /* ---- video, and the board picture ---- */
  async ({ page, test, ok }) => {
    await test('video: a real clip plays in a note sized to it; a broken one says so', async () => {
      const r = await page(async () => {
        const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const g = cv.getContext('2d');
        const rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm' }); const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data); rec.start();
        for (let i = 0; i < 15; i++) { g.fillStyle = `hsl(${i * 20},70%,50%)`; g.fillRect(0, 0, 320, 180); await new Promise((res) => setTimeout(res, 40)); }
        rec.stop(); await new Promise((res) => (rec.onstop = res));
        const du = await new Promise((res) => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); });
        const ok1 = await mbFiles.attachBytes(du, state.activeBoard, 'clip.webm');
        const bad = await mbFiles.attachBytes('data:video/avi;base64,' + btoa('nope'.repeat(50)), state.activeBoard, 'broken.avi');
        const a = await noteFromTaken({ url: ok1.url, name: ok1.name }, { x: 5000, y: 5000 });
        const b = await noteFromTaken({ url: bad.url, name: bad.name }, { x: 5600, y: 5000 });
        const ea = ensureMounted(a.id), eb = ensureMounted(b.id);
        await new Promise((res) => setTimeout(res, 1200));
        const body = ea.querySelector('.note-body');
        return {
          playable: ea.querySelector('video').readyState >= 1, scrolls: body.scrollHeight > body.clientHeight + 2,
          cant: !!eb.querySelector('.mb-cant'), stored: /mb-cant|data-watched/.test(b.body + a.body), h: a.h
        };
      });
      ok(r.playable, 'the webm should load');
      ok(!r.scrolls, 'a video note sized to its clip has no scrollbar (h ' + r.h + ')');
      ok(r.cant, 'the .avi should explain itself');
      ok(!r.stored, 'the fallback must never be stored');
    });

    await test('picture export: a picture on the board is drawn, and the canvas is not tainted', async () => {
      const r = await page(async () => {
        const b = activeBoard();
        const got = await mbFiles.attachBytes('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', b.id, 'red.png');
        await addPicture({ x: 7000, y: 7000 }, { url: got.url, name: 'red.png' });
        syncActiveBoard();
        const pics = await loadExportPictures(b);
        const cv = withTheme(pictureTheme(), () => paintBoardCanvas(b, 1, pics));
        let png = '';
        try { png = cv.toDataURL('image/png'); } catch (e) { png = 'tainted: ' + e.message; }
        return { pics: pics.size, png: png.slice(0, 22) };
      });
      ok(r.pics >= 1, 'pictures read: ' + r.pics);
      ok(r.png === 'data:image/png;base64,', r.png);
    });
  },

  /* ---- JSON Canvas (js/canvas.js) ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    const OUT = path.join(BOARDS, '..', 'canvas-out');

    await test('canvas: a board goes out as JSON Canvas and comes back the same', async () => {
      const r = await page(async (DOT, out) => {
        const b = makeBoard('Round trip');
        state.boards.push(b);
        await saveNow();
        const pic = await mbFiles.attachBytes(DOT, b.id, 'dot one.png');
        b.frames.push({ id: 'f1', x: -50, y: -80, w: 900, h: 600, title: 'Week', color: 'green' });
        b.notes.push(
          { id: 'a', x: 0, y: 0, w: 300, h: 260, z: 1, color: 'red', status: 'doing', date: '2026-11-05',
            body: '<h2>Plan <b>this</b></h2><p>Go to <a href="https://example.com">the site</a> and <i>read</i> it.</p>' +
                  '<ul class="mb-todo"><li class="done">first</li><li>second</li></ul>' +
                  '<ol><li>one</li><li>two</li></ol>' +
                  '<table><tbody><tr><th>k</th><th>v</th></tr><tr><td>a</td><td>1</td></tr></tbody></table>' +
                  '<pre class="mb-code"><code>let x = 1;</code></pre>' },
          { id: 'p', x: 400, y: 0, w: 200, h: 200, z: 2, pic: true, ar: 1, body: picBody(pic.url, 'dot one.png') }
        );
        b.links.push({ id: 'l1', from: 'a', to: 'p' });
        await saveNow();

        const { json, files } = boardToCanvas(b, 'Round trip files');
        const target = out + '\\Round trip.canvas';
        const w = await mbData.writeCanvas(target, json, b.id, files, 'Round trip files');
        const read = await mbData.readCanvas(target);
        if (!read || read.error) throw new Error('read: ' + JSON.stringify(read) + ' write: ' + JSON.stringify(w) + ' target: ' + target);
        const back = await canvasToBoard(read.data, read.dir, read.name);
        if (!back) throw new Error('canvasToBoard gave nothing for ' + JSON.stringify(read).slice(0, 300));
        const a2 = back.notes.find((n) => n.id === 'a');
        const p2 = back.notes.find((n) => n.id === 'p');
        return {
          canvas: JSON.parse(json), files, w,
          frames: back.frames.map((f) => [f.title, f.color]),
          links: back.links.length,
          a: { status: a2.status, date: a2.date, color: a2.color, md: noteToMarkdown(a2.body, () => '') },
          aOrig: noteToMarkdown(b.notes[0].body, () => ''),
          pic: { pic: !!p2.pic, src: picSrc(p2), board: back.id }
        };
      }, DOT_PNG, OUT);
      ok(r.w && !r.w.error && r.w.files === 1, 'write: ' + JSON.stringify(r.w));
      ok(fs.existsSync(path.join(OUT, 'Round trip files', 'dot one.png')), 'the picture is beside the canvas');
      const types = r.canvas.nodes.map((n) => n.type).sort().join();
      ok(types === 'file,group,text', 'node types: ' + types);
      ok(r.canvas.nodes.find((n) => n.type === 'file').file === 'Round trip files/dot one.png');
      ok(r.canvas.edges.length === 1 && r.canvas.edges[0].fromNode === 'a');
      ok(r.canvas.nodes.find((n) => n.type === 'text').color === '1', 'red is preset 1');
      const md = r.canvas.nodes.find((n) => n.type === 'text').text;
      for (const want of ['## Plan **this**', '[the site](https://example.com)', '*read*', '- [x] first', '- [ ] second', '1. one', '| k | v |', '```\nlet x = 1;\n```']) {
        ok(md.includes(want), `markdown is missing ${JSON.stringify(want)}:\n${md}`);
      }
      ok(JSON.stringify(r.frames) === JSON.stringify([['Week', 'green']]), 'frames: ' + JSON.stringify(r.frames));
      ok(r.links === 1, 'links');
      ok(r.a.status === 'doing' && r.a.date === '2026-11-05' && r.a.color === 'red', 'meta: ' + JSON.stringify(r.a));
      ok(r.a.md === r.aOrig, `text changed on the way back:\n${r.aOrig}\n---\n${r.a.md}`);
      ok(r.pic.pic && r.pic.src.startsWith(`mbf://${r.pic.board}/`), 'picture: ' + JSON.stringify(r.pic));
    });

    await test('canvas: an Obsidian canvas with files up in the vault comes in whole', async () => {
      const vault = path.join(OUT, 'Vault');
      fs.mkdirSync(path.join(vault, 'Boards'), { recursive: true });
      fs.mkdirSync(path.join(vault, 'Attachments'), { recursive: true });
      fs.writeFileSync(path.join(vault, 'Attachments', 'cat.png'), Buffer.from(DOT_PNG.split(',')[1], 'base64'));
      fs.writeFileSync(path.join(vault, 'Attachments', 'talk.webm'), 'not really a clip');
      const canvas = {
        nodes: [
          { id: 'g', type: 'group', x: 0, y: 0, width: 800, height: 500, label: 'Ideas', color: '5' },
          { id: 't', type: 'text', x: 20, y: 40, width: 300, height: 200, color: '#d65a9c',
            text: '# Hello\n\nSee ![[Attachments/cat.png]] and [[Some note|that note]].\n\n![[Attachments/talk.webm]]\n\n- [ ] do it\n  - nested\n- [x] done' },
          { id: 'f', type: 'file', x: 400, y: 40, width: 200, height: 200, file: 'Attachments/cat.png' },
          { id: 'u', type: 'link', x: 20, y: 300, width: 300, height: 80, url: 'https://obsidian.md' },
          { id: 'x', type: 'file', x: 400, y: 300, width: 200, height: 100, file: 'Attachments/missing.pdf' }
        ],
        edges: [{ id: 'e', fromNode: 't', toNode: 'f' }, { id: 'bad', fromNode: 't', toNode: 'nowhere' }]
      };
      const file = path.join(vault, 'Boards', 'Obsidian board.canvas');
      fs.writeFileSync(file, JSON.stringify(canvas));
      const r = await page(async (p) => {
        const b = await importCanvasFile(p);
        const t = b.notes.find((n) => n.id === 't');
        const f = b.notes.find((n) => n.id === 'f');
        const x = b.notes.find((n) => n.id === 'x');
        return {
          name: b.name, frames: b.frames.map((q) => [q.title, q.color]), links: b.links.length,
          t: { color: t.color, body: t.body }, f: { pic: !!f.pic, src: picSrc(f) },
          x: x.body, u: b.notes.find((n) => n.id === 'u').body, id: b.id,
          tokens: b.notes.some((n) => n.body.includes('mbcanvas:'))
        };
      }, file);
      ok(r.name === 'Obsidian board', 'name ' + r.name);
      ok(JSON.stringify(r.frames) === JSON.stringify([['Ideas', 'teal']]), 'frames ' + JSON.stringify(r.frames));
      ok(r.links === 1, 'only the edge with two ends survives');
      ok(r.t.color === 'pink', 'hex colour back to pink');
      ok(/<h1>Hello<\/h1>/.test(r.t.body), 'heading: ' + r.t.body);
      ok(r.t.body.includes(`<img class="mb-img" src="mbf://${r.id}/cat.png">`), 'inline picture copied in: ' + r.t.body);
      ok(r.t.body.includes('that note'), 'wikilink kept as its words');
      ok(/mb-video[\s\S]*mbf:\/\/[^"]+talk\.webm/.test(r.t.body), 'clip copied and shown as a player: ' + r.t.body);
      ok(/<ul class="mb-todo"><li>do it<ul><li>nested<\/li><\/ul><\/li><li class="done">done<\/li><\/ul>/.test(r.t.body), 'nested to-do: ' + r.t.body);
      ok(r.f.pic && r.f.src.startsWith('mbf://'), 'file node is a picture');
      ok(r.x.includes('missing.pdf') && !r.x.includes('mbcanvas'), 'a missing file keeps its name: ' + r.x);
      ok(r.u.includes('href="https://obsidian.md"'), 'link node');
      ok(!r.tokens, 'no placeholder may be stored');
    });

    await test('canvas: markdown cannot smuggle markup into a note', async () => {
      const r = await page(() => {
        const d = document.createElement('div');
        d.innerHTML = markdownToNote('<img src=x onerror=alert(1)> **b** [x](javascript:alert(1)) [y](<javascript:alert(2)>)', () => '');
        return { tags: d.querySelectorAll('img, script, [onerror]').length, js: d.querySelectorAll('a[href^="javascript"]').length, bold: !!d.querySelector('b'), html: d.innerHTML };
      });
      ok(r.tags === 0 && r.js === 0 && r.bold, JSON.stringify(r));
    });
  },

  /* ---- Samsung Notes (js/samsung.js, src/sdocx.js) ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    const IN = path.join(BOARDS, '..', 'samsung-in');
    fs.mkdirSync(IN, { recursive: true });
    const file = path.join(IN, 'Shopping.sdocx');
    fs.writeFileSync(file, require('./fake-sdocx.js')());

    await test('samsung: a note comes onto the board — text, picture, ink, one workflow — and one undo takes it off', async () => {
      const r = await page(async (p) => {
        const b = makeBoard('Phone');
        state.boards.push(b);
        await switchBoard(b.id);
        await saveNow();
        const count = () => ({ f: state.frames.length, n: state.notes.length, i: state.ink.length });
        const before = count();
        await importSamsungFiles([p], { x: 0, y: 0 });
        const after = count();
        const frame = state.frames[state.frames.length - 1];
        const note = state.notes.find((n) => !n.pic);
        const ink = state.ink.map((s) => [s.tool, s.color, s.pts.length]);
        undo();
        return { before, after, undone: count(), title: frame.title, body: note.body, ink, id: b.id };
      }, file);
      ok(r.after.f === r.before.f + 1 && r.after.n === r.before.n + 1 && r.after.i === r.before.i + 2, JSON.stringify(r));
      ok(r.title === 'Groceries', 'the workflow is named after the note: ' + r.title);
      ok(r.body.startsWith('<p><b>Milk</b> and eggs</p>'), 'bold kept: ' + r.body);
      ok(r.body.includes(`<img class="mb-img" src="mbf://${r.id}/pic.png">`), 'the picture inline, from this board\'s folder: ' + r.body);
      ok(r.ink.some((s) => s[0] === 'brush' && s[1] === '#3366cc'), 'the stroke is a brush in its own colour: ' + JSON.stringify(r.ink));
      ok(r.ink.some((s) => s[0] === 'pen' && s[1] === 'text'), 'the square is a pen line in the theme\'s ink: ' + JSON.stringify(r.ink));
      ok(JSON.stringify(r.undone) === JSON.stringify(r.before), 'undo: ' + JSON.stringify(r));
    });

    await test('samsung: rich text — headings, lists, to-dos, links, and nothing that is not ours', async () => {
      const r = await page(() => {
        const text = 'Title\nplain <b>\nbuy\nsell\nfirst\nsecond\nsee https://example.com\nmail me at a@b.co\n￼';
        const at = (s) => text.indexOf(s);
        const para = (type, i, v) => ({ type, start: i, end: i + 1, v });
        return richToHtml({
          text,
          spans: [{ type: 3, start: 0, end: 5, value: 24 }, { type: 3, start: 6, end: text.length, value: 15 },
            { type: 9, start: at('see'), end: at('see') + 23, kind: 3, url: '' }, { type: 9, start: at('mail'), end: at('mail') + 17, kind: 1, url: 'javascript:alert(1)' }],
          paras: [para(5, 2, [2, 0, 1, 0]), para(5, 3, [2, 0, 0, 0]), para(5, 4, [4, 1, 0, 1]), para(5, 5, [4, 2, 0, 1])],
          objects: [{ index: at('￼'), type: 22 }]
        }, {}, 400);
      });
      ok(r.html.startsWith('<h1>Title</h1><p>plain &lt;b&gt;</p>'), r.html);
      ok(r.html.includes('<ul class="mb-todo"><li class="done">buy</li><li>sell</li></ul><ol><li>first</li><li>second</li></ol>'), r.html);
      ok(r.html.includes('<a href="https://example.com">see https://example.com</a>'), r.html);
      ok(r.html.includes('<a href="mailto:a@b.co">') && !r.html.includes('javascript'), r.html);
      ok(r.skipped === 1, 'the table is counted as not brought in');
    });
  },

  /* ---- 2.1: ropes you follow, text links, columns, paste, locks, ink ---- */
  async ({ page, test, ok, sleep, BOARDS, fs, path }) => {
    // a board of our own, so nothing above depends on what happens here
    await page(async () => {
      toSystemClipboard = async () => {};            // never touch the real clipboard
      confirmDlg = async () => true;
      const b = makeBoard('Twenty-one');
      const mk = (id, x, y, body) => ({ id, x, y, w: 240, h: 140, z: 1, color: 'default', body: body || `<h3>${id}</h3><p>${id} text</p>` });
      b.notes.push(mk('ra', 0, 0), mk('rb', 3000, 0), mk('rc', 0, 600));
      b.links.push({ id: 'r1', from: 'ra', to: 'rb' }, { id: 'r2', from: 'ra', to: 'rc' });
      b.frames.push({ id: 'rf', x: -60, y: -60, w: 3400, h: 900, title: 'All', color: 'blue', titlePos: 'tl' });
      state.boards.push(b);
      await switchBoard(b.id);
      flyTo({ x: 120, y: 70 }, 1, 1);
      await new Promise((r) => setTimeout(r, 60));
    });

    await test('2.1 a note has no head — its controls are in the right-click menu', async () => {
      const r = await page(() => {
        const el = els.get('ra');
        openCtxMenu(100, 100, 'ra');
        const acts = [...document.querySelectorAll('#ctxMenu .cm-item')].map((b) => b.dataset.act);
        const goes = [...document.querySelectorAll('#ctxMenu .cm-go')].map((b) => b.dataset.note);
        closeCtxMenu();
        return { head: !!el.querySelector('.note-head, .nh-btn'), acts, goes };
      });
      ok(!r.head, 'no head or edge buttons on a note');
      ok(['icon', 'link', 'copy', 'cut', 'dup', 'del', 'unlink'].every((a) => r.acts.includes(a)), 'menu: ' + r.acts.join(','));
      ok(r.goes.includes('rb') && r.goes.includes('rc'), 'a row per linked note: ' + r.goes.join(','));
    });

    await test('2.1 pressing a rope flies to the note at the far end', async () => {
      const r = await page(async () => {
        drawLinks();
        const hit = linkEls.get('r1')._rope.hit;
        const near = toScreen(260, 0), vr = vpRect();      // just off note ra, on the rope
        hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: near.x + vr.left, clientY: near.y + vr.top, pointerId: 7 }));
        await new Promise((res) => setTimeout(res, 800));
        const c = toWorld(vr.left + vr.width / 2, vr.top + vr.height / 2);
        return { sel: [...selection], c, still: state.links.some((l) => l.id === 'r1') };
      });
      ok(r.sel.length === 1 && r.sel[0] === 'rb', 'selected ' + r.sel);
      ok(Math.abs(r.c.x - 3120) < 5 && Math.abs(r.c.y - 70) < 5, 'view centred on rb: ' + JSON.stringify(r.c));
      ok(r.still, 'pressing a rope must never remove it');
    });

    await test('2.1 /link puts the link at the caret, in one paragraph, with no frozen styles', async () => {
      const r = await page(async () => {
        const n = state.notes.find((x) => x.id === 'rc');
        n.body = '<p>alpha beta</p>'; render(); enterEdit(n);
        const t = editing.querySelector('p').firstChild;
        const rg = document.createRange(); rg.setStart(t, 5); rg.collapse(true);
        getSelection().removeAllRanges(); getSelection().addRange(rg);
        openLinkDialog();
        $('linkUrl').value = 'example.com';
        // the selection toolbar is free to overwrite the shared range meanwhile
        savedRange = null;
        applyLink();
        const html = editing.innerHTML; exitEdit();
        return html;
      });
      ok(/^<p>alpha<a href="https:\/\/example\.com">https:\/\/example\.com<\/a>(&nbsp;)+ ?beta<\/p>$/.test(r), r);
    });

    await test('2.1 a link to a note survives a paste and goes to the note', async () => {
      const r = await page(async () => {
        const clean = sanitize(`<p><a class="mb-note" data-note="rb" data-board="${state.activeBoard}" href="#">go</a></p>`);
        const d = document.createElement('div'); d.innerHTML = clean;
        const a = d.querySelector('a.mb-note');
        clearSelection();
        await followNoteLink(a);
        return { kept: !!(a && a.dataset.note === 'rb' && a.dataset.board), sel: [...selection] };
      });
      ok(r.kept, 'data-note and data-board kept');
      ok(r.sel[0] === 'rb', 'followed to rb');
    });

    await test('2.1 copy, cut and paste carry their ropes; duplicate too', async () => {
      const r = await page(() => {
        const before = state.links.length;
        setSelection(['ra']); copySelection(false);
        pasteClipboard({ x: 900, y: 900 });
        const copyId = [...selection][0];
        const copyRopes = state.links.filter((l) => l.from === copyId || l.to === copyId).length;
        setSelection(['ra']); copySelection(true);                 // cut: ra and its ropes go
        const afterCut = state.links.filter((l) => l.from === 'ra' || l.to === 'ra').length;
        pasteClipboard({ x: 1500, y: 900 });
        const moved = [...selection][0];
        const movedTo = state.links.filter((l) => l.from === moved || l.to === moved).map((l) => (l.from === moved ? l.to : l.from)).sort();
        duplicate([moved]);
        const dup = [...selection][0];
        const dupRopes = state.links.filter((l) => l.from === dup || l.to === dup).length;
        return { before, copyRopes, afterCut, movedTo, dupRopes };
      });
      ok(r.copyRopes === 2, 'the copy is tied to both notes: ' + r.copyRopes);
      ok(r.afterCut === 0, 'cut takes the ropes off the board');
      ok(JSON.stringify(r.movedTo) === JSON.stringify(['rb', 'rc']), 'pasting the cut note ties it back: ' + r.movedTo);
      ok(r.dupRopes === 2, 'a duplicate keeps its ropes: ' + r.dupRopes);
    });

    await test('2.1 holding Ctrl+V shows where the paste lands, and it lands there', async () => {
      const r = await page(() => {
        const n0 = state.notes.find((x) => x.id === 'rb');
        setSelection([n0.id]); copySelection(false);
        beginPasteGhost();
        movePasteGhost({ x: 5000, y: 5000 });
        const ghost = document.querySelectorAll('#pasteGhost .pgh-item').length;
        commitPasteGhost();
        const made = state.notes.find((x) => x.id === [...selection][0]);
        return { ghost, gone: !document.getElementById('pasteGhost'), cx: made.x + made.w / 2, cy: made.y + made.h / 2 };
      });
      ok(r.ghost === 1 && r.gone, JSON.stringify(r));
      ok(Math.abs(r.cx - 5000) <= 13 && Math.abs(r.cy - 5000) <= 13, 'landed under the ghost: ' + JSON.stringify(r));
    });

    await test('2.1 columns survive bigger text across them, and a broken block is mended', async () => {
      const r = await page(() => {
        const n = state.notes.find((x) => x.id === 'rc');
        n.body = '<div class="mb-cols"><div class="mb-col"><p>one two</p></div><div class="mb-col"><p>three four</p></div><div class="mb-col"><p>five</p></div></div>';
        render(); enterEdit(n);
        const cols = editing.querySelectorAll('.mb-col');
        const rg = document.createRange();
        rg.setStart(cols[0].querySelector('p').firstChild, 4); rg.setEnd(cols[1].querySelector('p').firstChild, 5);
        getSelection().removeAllRanges(); getSelection().addRange(rg);
        applyFontPx(22);
        const grid = editing.querySelector('.mb-cols');
        const shape = [...grid.children].map((c) => c.className);
        const nested = editing.querySelectorAll('.mb-cols .mb-cols').length;
        const sized = [...editing.querySelectorAll('span.mb-fs')].map((s) => s.textContent);
        // and a block execCommand has broken: a paragraph loose in the grid, a column left alone
        grid.appendChild(Object.assign(document.createElement('p'), { textContent: 'loose' }));
        const lone = document.createElement('div'); lone.className = 'mb-cols'; lone.innerHTML = '<div class="mb-col"><p>only</p></div>';
        editing.appendChild(lone);
        normalizeBody(editing);
        const after = { kids: [...editing.querySelector('.mb-cols').children].every((c) => c.classList.contains('mb-col')), grids: editing.querySelectorAll('.mb-cols').length };
        exitEdit();
        return { shape, nested, sized, after };
      });
      ok(r.shape.length === 3 && r.shape.every((c) => c === 'mb-col') && !r.nested, 'still three columns: ' + JSON.stringify(r));
      ok(JSON.stringify(r.sized) === JSON.stringify(['two', 'three']), 'only the selected text is sized: ' + r.sized);
      ok(r.after.kids && r.after.grids === 1, 'mended: ' + JSON.stringify(r.after));
    });

    await test('2.3 a formula is stored as its LaTeX, drawn by KaTeX, and a table always has a line under it', async () => {
      const r = await page(() => {
        const n = state.notes.find((x) => x.id === 'rc');
        n.body = '<p>Area <span class="mb-math" data-tex="\\pi r^2"></span> and <span class="mb-math" data-tex="\\ce{H2SO4}"></span></p>' +
          '<div class="mb-math mb-math-block" data-tex="\\frac{a}{b}"></div><p>x<sup>2</sup> H<sub>2</sub>O</p>' +
          '<table class="mb-table"><tbody><tr><td>1</td></tr></tbody></table>';
        render(); enterEdit(n);
        const drawn = editing.querySelectorAll('.mb-math > .mx-face .katex').length;
        const caret = getSelection().anchorNode;
        const caretUnder = !!caret && (caret.nodeName === 'P' || caret.parentNode.nodeName === 'P') && editing.lastElementChild.tagName === 'P';
        // a pasted formula keeps its LaTeX and loses KaTeX's markup
        const pasted = sanitize('<span class="mb-math" data-tex="a^n"><span class="katex">junk</span></span><sup>3</sup>');
        exitEdit();
        return { drawn, caretUnder, stored: n.body, pasted };
      });
      ok(r.drawn === 3, 'three formulas drawn: ' + r.drawn);
      ok(!/katex|mx-face/.test(r.stored), 'the drawing is not stored: ' + r.stored);
      ok(/data-tex="\\pi r\^2"/.test(r.stored) && /<sub>2<\/sub>/.test(r.stored), 'LaTeX and sub/sup kept: ' + r.stored);
      ok(r.caretUnder && /<\/table><p>/.test(r.stored), 'a line under the table: ' + r.stored.slice(-60));
      ok(/data-tex="a\^n"/.test(r.pasted) && /<sup>3<\/sup>/.test(r.pasted), 'a paste keeps the formula: ' + r.pasted);
    });

    await test('2.3 Markdown and KaTeX pasted from a chat become headings, lists and formulas', async () => {
      const r = await page(() => {
        const n = state.notes.find((x) => x.id === 'rc');
        n.body = '<p><br></p>';
        render(); enterEdit(n);
        const paste = (types) => {
          const dt = new DataTransfer();
          for (const [k, v] of Object.entries(types)) dt.setData(k, v);
          editing.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        };
        paste({ 'text/plain': '## Kurallar\n\n*   **Toplam:**\n    *   $n cdot a$ ve $a \\neq 0$\n*   It costs $5 and $6.\n\n$$\n\\frac{a}{b}\n$$' });
        const md = n.body;
        n.body = '<p><br></p>'; render(); enterEdit(n);
        paste({ 'text/plain': 'πr2', 'text/html': '<p>Area <span class="katex"><span class="katex-mathml"><math><semantics><mi>π</mi><annotation encoding="application/x-tex">\\pi r^2</annotation></semantics></math></span><span class="katex-html">πr2</span></span></p>' });
        const html = n.body;
        const plain = looksLikeMarkdown('just a sentence, nothing more');
        exitEdit();
        return { md, html, plain };
      });
      ok(/<h2>Kurallar<\/h2>/.test(r.md) && /<ul><li><b>Toplam:<\/b><ul><li>/.test(r.md), 'heading and nested list: ' + r.md);
      ok(/data-tex="n \\cdot a"/.test(r.md) && /data-tex="a \\neq 0"/.test(r.md), 'formulas, lost backslash put back: ' + r.md);
      ok(/costs \$5 and \$6/.test(r.md), 'money stays money: ' + r.md);
      ok(/mb-math-block" data-tex="\\frac\{a\}\{b\}"/.test(r.md), 'a $$ block: ' + r.md);
      ok(/Area(&nbsp;| )<span class="mb-math" data-tex="\\pi r\^2"/.test(r.html) && !/πr2/.test(r.html), 'KaTeX HTML back to its LaTeX: ' + r.html);
      ok(r.plain === false, 'plain prose is left alone');
    });

    await test('2.1 a locked workflow is passed over by Ctrl+A and stays locked on disk', async () => {
      const r = await page(async () => {
        lockFrame('rf');
        selectAll();
        const inSel = selection.has('rf');
        clearSelection();
        await saveNow();
        const back = adoptBoard(JSON.parse(serialiseBoard(activeBoard())));
        return { inSel, adopted: back.frames.find((f) => f.id === 'rf').locked, name: activeBoard().name };
      });
      ok(!r.inSel, 'select-all must skip a locked workflow');
      ok(r.adopted === true, 'adoptBoard keeps the lock');
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-one'));
      ok(JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8')).frames[0].locked === true, 'locked on disk');
    });

    await test('2.1 ink: a stroke is drawn, saved, undone; the eraser takes it whole', async () => {
      const r = await page(async () => {
        toggleInk(true);
        setPen({ tool: 'brush', size: 1 });
        const vr = vpRect();
        const at = (x, y, t) => ({ clientX: vr.left + x, clientY: vr.top + y, pointerId: 3, pointerType: 'mouse', pressure: 0.5, timeStamp: t, shiftKey: false, target: $('viewport') });
        beginInk(at(100, 300, 0));
        for (let i = 1; i <= 12; i++) onInkMove(at(100 + i * 20, 300 + Math.sin(i) * 15, i * 16));
        endInkGesture();
        const drawn = state.ink.map((s) => ({ tool: s.tool, n: s.pts.length / 2, ws: (s.ws || []).length }));
        await saveNow();
        return { drawn };
      });
      ok(r.drawn.length === 1 && r.drawn[0].tool === 'brush' && r.drawn[0].n > 5 && r.drawn[0].ws === r.drawn[0].n, JSON.stringify(r.drawn));
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-one'));
      const ink = JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8')).ink;
      ok(Array.isArray(ink) && ink.length === 1 && ink[0].tool === 'brush', 'on disk: ' + JSON.stringify(ink && ink.length));
      const r2 = await page(() => {
        const vr = vpRect();
        const at = (x, y, t) => ({ clientX: vr.left + x, clientY: vr.top + y, pointerId: 3, pointerType: 'mouse', pressure: 0.5, timeStamp: t, shiftKey: false, target: $('viewport') });
        undo();
        const afterUndo = state.ink.length;
        redo();
        setPen({ tool: 'eraser' });
        beginInk(at(180, 280, 0)); onInkMove(at(180, 330, 20)); endInkGesture();
        const afterErase = state.ink.length;
        toggleInk(false);
        return { afterUndo, afterErase };
      });
      ok(r2.afterUndo === 0, 'undo takes the stroke away');
      ok(r2.afterErase === 0, 'a sweep across it erases it: ' + r2.afterErase);
    });

    await test('2.1 ink: strokes are selected, moved, recoloured and deleted', async () => {
      const r = await page(() => {
        toggleInk(true);
        const vr = vpRect();
        const at = (x, y, t, shift) => ({ clientX: vr.left + x, clientY: vr.top + y, pointerId: 4, pointerType: 'mouse', pressure: 0.5, timeStamp: t, shiftKey: !!shift });
        const stroke = (y) => { beginInk(at(100, y, 0)); for (let i = 1; i <= 6; i++) onInkMove(at(100 + i * 30, y, i * 16)); endInkGesture(); };
        state.ink = [];
        setPen({ tool: 'pen', color: 'text' });
        stroke(500); stroke(560);
        const [a, b] = state.ink;
        const ax = a.pts[0];
        setPen({ tool: 'select' });
        beginInk(at(160, 500, 0)); endInkGesture();                   // click one
        const one = [...inkSel];
        beginInk(at(160, 500, 0)); onInkMove(at(200, 500, 10)); onInkMove(at(260, 500, 20)); endInkGesture();   // drag it
        const moved = a.pts[0] - ax, stayed = b.pts[0];
        beginInk(at(50, 450, 0)); onInkMove(at(400, 620, 10)); endInkGesture();   // lasso both
        const both = inkSel.size;
        pickInkColor('green');
        const colors = state.ink.map((s) => s.color), pen = state.settings.pen.color;
        deleteInkSelection();
        const left = state.ink.length;
        undo();
        const back = state.ink.length;
        toggleInk(false);
        return { one, aid: a.id, moved, stayed, bx: b.pts[0], both, colors, pen, left, back };
      });
      ok(r.one.length === 1 && r.one[0] === r.aid, 'a click selects the stroke under it');
      ok(Math.abs(r.moved - 100) < 1 && r.stayed === r.bx, 'only the selection moved: ' + JSON.stringify(r));
      ok(r.both === 2, 'the lasso takes both');
      ok(r.colors.every((c) => c === 'green') && r.pen === 'text', 'recoloured, and the pen left alone: ' + JSON.stringify(r));
      ok(r.left === 0 && r.back === 2, 'deleted, and undo brings them back');
    });

    await test('2.1 any colour on a note or a workflow, kept on disk', async () => {
      const r = await page(async () => {
        openCtxMenu(300, 300, 'rc');
        const inp = document.querySelector('#ctxMenu .cm-custom input');
        const shown = !!inp && document.querySelector('#ctxMenu .cm-custom').getBoundingClientRect().width > 0;
        inp.value = '#ff00aa';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        const el = els.get('rc');
        const nc = getComputedStyle(el).getPropertyValue('--nc').trim();
        // a preset afterwards takes the custom colour off again
        openCtxMenu(300, 300, 'rf');
        const fin = document.querySelector('#ctxMenu .cm-custom input');
        fin.value = '#00c853'; fin.dispatchEvent(new Event('change', { bubbles: true }));
        await saveNow();
        const back = adoptBoard(JSON.parse(serialiseBoard(activeBoard())));
        return { shown, data: el.dataset.color, nc, note: back.notes.find((n) => n.id === 'rc').color, frame: back.frames.find((f) => f.id === 'rf').color };
      });
      ok(r.shown, 'the custom swatch is in the menu');
      ok(r.data === 'custom' && r.nc === '#ff00aa', 'painted: ' + JSON.stringify(r));
      ok(r.note === '#ff00aa' && r.frame === '#00c853', 'kept through a save and a load: ' + JSON.stringify(r));
    });

    await test('2.1 a link in a note is blue, not the text colour', async () => {
      const r = await page(() => {
        const n = state.notes.find((x) => x.id === 'rb');
        n.body = '<p>go <a href="https://www.youtube.com/">https://www.youtube.com/</a></p>'; render();
        const a = els.get('rb').querySelector('a');
        const p = els.get('rb').querySelector('p');
        return { link: getComputedStyle(a).color, text: getComputedStyle(p).color };
      });
      const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
      const [lr, lg, lb] = rgb(r.link);
      ok(r.link !== r.text && lb > lr + 60 && lb > lg, 'link ' + r.link + ' vs text ' + r.text);
    });

    await test('2.1 a rope takes its own colour from its menu, and keeps it on disk', async () => {
      const r = await page(async () => {
        // a rope of its own: the earlier tests cut and re-paste the notes r1/r2 were tied to
        state.notes.push({ id: 'rx1', x: 0, y: 1200, w: 240, h: 140, z: 1, color: 'default', body: '<p>x1</p>' },
                         { id: 'rx2', x: 400, y: 1200, w: 240, h: 140, z: 1, color: 'default', body: '<p>x2</p>' });
        state.links.push({ id: 'r2', from: 'rx1', to: 'rx2' });
        render(); drawLinks();
        openRopeMenu(300, 300, 'r2');
        document.querySelector('#ctxMenu [data-rope-color="green"]').click();
        const painted = linkEls.get('r2')._rope.line.style.stroke;
        openRopeMenu(300, 300, 'r2');
        const pick = document.querySelector('#ctxMenu .cm-custom input');
        pick.value = '#123456'; pick.dispatchEvent(new Event('change', { bubbles: true }));
        await saveNow();
        const back = adoptBoard(JSON.parse(serialiseBoard(activeBoard()))).links.find((l) => l.id === 'r2').color;
        openRopeMenu(300, 300, 'r2');
        document.querySelector('#ctxMenu [data-rope-color=""]').click();      // back to the setting
        return { painted, back, after: state.links.find((l) => l.id === 'r2').color, line: linkEls.get('r2')._rope.line.style.stroke };
      });
      ok(r.painted === 'var(--c-green-c)', 'painted ' + r.painted);
      ok(r.back === '#123456', 'kept through a save and a load: ' + r.back);
      ok(r.after === undefined && r.line === '', 'as set in Settings again');
    });

    await test('2.1 Extra: typing sounds only while typing, pinned paper ties ropes to the pins', async () => {
      const r = await page(() => {
        const heard = [];
        const real = keySfx;
        keySfx = (k, up) => heard.push((up ? '^' : 'v') + k);
        state.settings.keySounds = 'red';
        const n = state.notes.find((x) => x.id === 'rx1');
        enterEdit(n);
        editing.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
        editing.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', repeat: true, bubbles: true }));
        exitEdit();
        $('viewport').dispatchEvent(new KeyboardEvent('keydown', { key: 'q', bubbles: true }));
        keySfx = real; state.settings.keySounds = 'off';
        const def = defaults().settings;
        state.settings.cork = 'cork'; applySettings(); resetLinks(); drawLinks();
        const p = anchor(n, { x: 0, y: 0 });
        const z = getComputedStyle($('linksSvg')).zIndex;
        const pin = getComputedStyle(ensureMounted('rx1'), '::after').content;
        state.settings.cork = 'off'; applySettings(); resetLinks(); drawLinks();
        return { heard, def: [def.keySounds, def.cork], p, x: n.x + n.w / 2, y: n.y, z, pin };
      });
      ok(JSON.stringify(r.heard) === JSON.stringify(['vx']), 'heard ' + r.heard);
      ok(r.def[0] === 'off' && r.def[1] === 'off', 'both off by default');
      ok(r.p.x === r.x && r.p.y === r.y + 11, 'rope tied at the pin: ' + JSON.stringify(r));
      ok(+r.z > 1000000 && r.pin !== 'none', 'string over the paper, and a pin: ' + JSON.stringify(r));
    });

    await test('2.1 the footer puts every setting back, keeping language', async () => {
      const r = await page(async () => {
        const lang = state.settings.lang;
        Object.assign(state.settings, { sounds: true, keySounds: 'blue', cork: 'wood', accent: 'rose', snap: true });
        openSettings();
        const visible = $('btnResetAll').getBoundingClientRect().height > 0;
        $('btnResetAll').click();
        await new Promise((res) => setTimeout(res, 50));
        closeSettings();
        const s = state.settings;
        return { visible, now: [s.sounds, s.keySounds, s.cork, s.accent, s.snap], lang: s.lang === lang };
      });
      ok(r.visible, 'the button is on screen');
      ok(JSON.stringify(r.now) === JSON.stringify([false, 'off', 'off', 'mono', false]) && r.lang, JSON.stringify(r));
    });

    await test('2.1 the wheel scrolls a note with more to read, and pans everywhere else', async () => {
      const r = await page(async () => {
        const n = state.notes.find((x) => x.id === 'rb');
        n.body = Array.from({ length: 40 }, (_, i) => `<p>line ${i}</p>`).join(''); render();
        await new Promise((res) => setTimeout(res, 300));       // a new wheel burst
        const body = els.get('rb').querySelector('.note-body');
        const onNote = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
        body.dispatchEvent(onNote);
        await new Promise((res) => setTimeout(res, 300));
        const onCanvas = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
        $('viewport').dispatchEvent(onCanvas);
        return { note: onNote.defaultPrevented, canvas: onCanvas.defaultPrevented };
      });
      ok(r.note === false, 'the note keeps the wheel');
      ok(r.canvas === true, 'the canvas takes it elsewhere');
    });

    await test('2.1 the accent is mono by default, and an old mint store moves to it once', async () => {
      const r = await page(() => {
        const was = { a: state.settings.accent, theme: state.settings.theme, mode: state.settings.themeMode };
        state.settings.accent = 'mono';
        state.settings.themeMode = 'fixed'; state.settings.theme = 'mental'; applyTheme();
        const dark = accentHex();
        state.settings.theme = 'mental-light'; applyTheme();
        const light = accentHex();
        Object.assign(state.settings, { accent: was.a, theme: was.theme, themeMode: was.mode }); applyTheme();
        return { dark, light, def: defaults().settings.accent, old: versionBefore('2.0.0', '2.1.0'), same: versionBefore('2.1.0', '2.1.0'), none: versionBefore('', '2.1.0') };
      });
      ok(r.dark === '#ffffff' && r.light === '#000000', JSON.stringify(r));
      ok(r.def === 'mono' && r.old && !r.same && r.none, JSON.stringify(r));
    });

    await test('2.1 menu sounds are off by default, and a menu makes them when on', async () => {
      const r = await page(async () => {
        const log = [];
        const real = sfx;
        sfx = (k) => log.push(k);
        const def = defaults().settings.sounds;
        state.settings.sounds = true;
        openCtxMenu(300, 300, null);
        await new Promise((res) => setTimeout(res, 30));
        document.querySelector('#ctxMenu .cm-item').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
        closeCtxMenu();
        await new Promise((res) => setTimeout(res, 30));
        state.settings.sounds = false; sfx = real;
        return { def, log };
      });
      ok(r.def === false, 'off by default');
      ok(r.log.includes('open') && r.log.includes('move') && r.log.includes('back'), 'heard: ' + r.log.join(','));
    });
  },

  /* ---- 2.2: a phone as a drawing tablet (js/tablet.js, MAP.md §4w) ----
     The phone's messages are fed to onPadMessage() exactly as main delivers
     them, already checked. The socket and the QR code are tools/test-tablet.js. */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await test('2.2 a stroke from the phone lands in the region it maps to, with its pressure, and saves', async () => {
      const r = await page(async () => {
        const b = makeBoard('Twenty-two');
        state.boards.push(b);
        await switchBoard(b.id);
        state.view = { x: 100, y: 50, z: 2 }; applyView();
        // a portrait phone: a tall slice down the middle of the window
        onPadMessage({ t: 'size', a: 0.5, px: 1080 });
        const p = padRect(), vr = vpRect();
        onPadMessage({ t: 'down', id: 'p1', x: 0.25, y: 0.5, p: 0.2, tool: 'brush', size: 1, color: 'blue' });
        const pts = [];
        for (let i = 1; i <= 10; i++) pts.push(0.25 + i * 0.02, 0.5, 0.2 + i * 0.07);
        onPadMessage({ t: 'move', id: 'p1', pts });
        state.view.x += 400; applyView();                 // a pan from the mouse mid-stroke must not bend it
        onPadMessage({ t: 'up', id: 'p1' });
        const s = state.ink[0];
        const want = { x: (p.x + 0.25 * p.w - 100) / 2, y: (p.y + 0.5 * p.h - 50) / 2 };
        const out = { n: state.ink.length, tool: s && s.tool, color: s && s.color, x: s && s.pts[0], y: s && s.pts[1], want,
          wsGrow: !!(s && s.ws && s.ws[Math.floor(s.ws.length / 2)] > s.ws[1]), size: s && s.size,
          slice: Math.abs(p.h - vr.height) < 1 && Math.abs(p.w - vr.height * 0.5) < 1 && Math.abs(p.x - (vr.width - p.w) / 2) < 1 };
        await saveNow();
        return out;
      });
      ok(r.n === 1 && r.tool === 'brush' && r.color === 'blue', JSON.stringify(r));
      ok(Math.abs(r.x - r.want.x) < 0.2 && Math.abs(r.y - r.want.y) < 0.2, 'mapped through the view at pen-down: ' + JSON.stringify(r));
      ok(r.wsGrow, 'pressure widens the brush');
      ok(r.slice, 'a portrait phone is the full height, centred');
      ok(Math.abs(r.size - 5) < 0.01, 'the on-screen size divided by the zoom: ' + r.size);
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-two'));
      const ink = JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8')).ink;
      ok(ink.length === 1 && ink[0].tool === 'brush', 'on disk');
    });

    await test('2.2 the phone erases, undoes only its own strokes, pans and zooms', async () => {
      const r = await page(() => {
        const vr = vpRect();
        // a stroke from the mouse: the phone's undo must leave it alone
        toggleInk(true); setPen({ tool: 'pen', size: 1 });
        const at = (x, y) => ({ clientX: vr.left + x, clientY: vr.top + y, pointerId: 7, pointerType: 'mouse', pressure: 0.5, timeStamp: 0, target: $('viewport') });
        beginInk(at(50, 50)); onInkMove(at(120, 60)); endInkGesture(); toggleInk(false);
        onPadMessage({ t: 'down', id: 'p2', x: 0.6, y: 0.2, p: 0.5, tool: 'pen', size: 1, color: 'text' });
        onPadMessage({ t: 'move', id: 'p2', pts: [0.7, 0.2, 0.5, 0.8, 0.2, 0.5] });
        onPadMessage({ t: 'up', id: 'p2' });
        const drawn = state.ink.length;
        onPadMessage({ t: 'undo' });
        const afterUndo = state.ink.length;
        onPadMessage({ t: 'undo' }); onPadMessage({ t: 'undo' });
        const afterMore = state.ink.length;
        // a brush stroke from the phone, then the phone's eraser swept across it
        onPadMessage({ t: 'down', id: 'p4', x: 0.3, y: 0.6, p: 0.5, tool: 'brush', size: 1, color: 'red' });
        onPadMessage({ t: 'move', id: 'p4', pts: [0.35, 0.6, 0.5, 0.4, 0.6, 0.5, 0.45, 0.6, 0.5] });
        onPadMessage({ t: 'up', id: 'p4' });
        const hasBrush = state.ink.filter((k) => k.tool === 'brush').length;
        onPadMessage({ t: 'down', id: 'e1', x: 0.38, y: 0.5, p: 0.5, tool: 'eraser', size: 1, color: 'text' });
        onPadMessage({ t: 'move', id: 'e1', pts: [0.38, 0.7, 0.5] });
        onPadMessage({ t: 'up', id: 'e1' });
        const afterErase = state.ink.filter((k) => k.tool === 'brush').length;
        undo();
        const back = state.ink.filter((k) => k.tool === 'brush').length;
        const x0 = state.view.x, z0 = state.view.z;
        onPadMessage({ t: 'pan', dx: 0.1, dy: 0 });
        const panned = state.view.x - x0;
        onPadMessage({ t: 'zoom', f: 1.5, x: 0.5, y: 0.5 });
        return { drawn, afterUndo, afterMore, hasBrush, afterErase, back, panned, w: padRect().w, zoomed: state.view.z / z0 };
      });
      ok(r.afterUndo === r.drawn - 1, 'undo takes the phone stroke: ' + JSON.stringify(r));
      ok(r.afterMore === r.afterUndo - 1, 'then the earlier phone stroke, never the mouse one: ' + JSON.stringify(r));
      ok(r.hasBrush === 1 && r.afterErase === 0 && r.back === 1, 'the eraser takes a stroke whole, Ctrl+Z brings it back: ' + JSON.stringify(r));
      ok(Math.abs(r.panned - 0.1 * r.w) < 0.5, 'one finger pans by its own width: ' + JSON.stringify(r));
      ok(Math.abs(r.zoomed - 1.5) < 0.01, 'two zoom');
    });

    await test('2.2 the phone selects a stroke, moves it, recolours it and deletes it, through ink.js', async () => {
      const r = await page(() => {
        state.ink = []; drawInk();
        const p = padRect();
        // a pen stroke across the middle of the phone
        onPadMessage({ t: 'down', id: 'q1', k: 50, x: 0.2, y: 0.5, p: 0.5, tool: 'pen', size: 1, color: 'text' });
        onPadMessage({ t: 'move', id: 'q1', pts: [0.5, 0.5, 0.5, 0.8, 0.5, 0.5] });
        onPadMessage({ t: 'up', id: 'q1' });
        const id = state.ink[0].id, x0 = state.ink[0].pts[0];
        // the arrow: touch the stroke and drag it a tenth of the phone to the right
        onPadMessage({ t: 'down', id: 'q2', k: 51, x: 0.5, y: 0.5, p: 0.5, tool: 'select', size: 1, color: 'text' });
        const picked = inkSel.has(id);
        onPadMessage({ t: 'move', id: 'q2', pts: [0.55, 0.5, 0.5, 0.6, 0.5, 0.5] });
        onPadMessage({ t: 'up', id: 'q2' });
        const moved = state.ink[0].pts[0] - x0, want = 0.1 * p.w / state.view.z;
        onPadMessage({ t: 'sel', act: 'color', color: 'green' });
        const color = state.ink[0].color;
        undo();
        const undone = state.ink[0].color;
        // a lasso round nothing lets go; one round the stroke takes it again
        onPadMessage({ t: 'down', id: 'q3', k: 52, x: 0.05, y: 0.05, p: 0.5, tool: 'select', size: 1, color: 'text' });
        onPadMessage({ t: 'move', id: 'q3', pts: [0.98, 0.98, 0.5] });
        onPadMessage({ t: 'up', id: 'q3' });
        const lassoed = inkSel.has(id);
        onPadMessage({ t: 'sel', act: 'delete' });
        const after = state.ink.length;
        return { picked, moved, want, color, undone, lassoed, after, k: padK };
      });
      ok(r.picked, 'touching a stroke selects it');
      ok(Math.abs(r.moved - r.want) < 0.5, 'dragging moves it by what the pen moved: ' + JSON.stringify(r));
      ok(r.color === 'green' && r.undone === 'text', 'recolour, and Ctrl+Z takes it back: ' + JSON.stringify(r));
      ok(r.lassoed && r.after === 0, 'a lasso takes it, delete removes it: ' + JSON.stringify(r));
      ok(r.k === 52, 'the stroke numbers a picture reports: ' + r.k);
    });

    await test('2.2 a board that cannot be edited is never drawn on from the phone', async () => {
      const r = await page(() => {
        // as a locked board not opened this session: what canEditHere() refuses
        const b = activeBoard();
        b.unreadable = true;
        const before = state.ink.length;
        onPadMessage({ t: 'down', id: 'p3', x: 0.5, y: 0.5, p: 0.5, tool: 'pen', size: 1, color: 'text' });
        onPadMessage({ t: 'move', id: 'p3', pts: [0.6, 0.6, 0.5] });
        onPadMessage({ t: 'up', id: 'p3' });
        const ro = !padCanDraw();
        delete b.unreadable;
        return { ro, before, after: state.ink.length };
      });
      ok(r.ro && r.after === r.before, JSON.stringify(r));
    });
  },

  /* ---- 2.4: note shapes, the workflows list, the space round the writing,
     column widths, signposts that never overlap, a further zoom-out ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await page(async () => {
      confirmDlg = async () => true;
      const b = makeBoard('Twenty-four');
      const mk = (id, x, y, body) => ({ id, x, y, w: 260, h: 220, z: 1, color: 'default', body: body || `<h3>${id}</h3><p>${id} text</p>` });
      b.notes.push(mk('sa', 0, 0), mk('sb', 400, 0, '<p>t</p><table class="mb-table"><tr><td>1</td></tr></table>'));
      b.frames.push(
        { id: 'w1', x: -6000, y: -4000, w: 600, h: 400, title: 'One', color: 'blue', titlePos: 'tl' },
        { id: 'w2', x: -6000, y: -3300, w: 600, h: 400, title: 'Two', color: 'green', titlePos: 'tl' },
        { id: 'w3', x: -5400, y: -4600, w: 600, h: 400, title: 'Three', color: 'red', titlePos: 'tl' },
        { id: 'w4', x: -6400, y: -3700, w: 600, h: 400, title: 'Four', color: 'amber', titlePos: 'tl' });
      state.boards.push(b);
      await switchBoard(b.id);
      flyTo({ x: 300, y: 100 }, 1, 1);
      await new Promise((r) => setTimeout(r, 60));
    });
    const onDisk = () => {
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-four'));
      return JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8'));
    };

    await test('2.4 a note takes a shape: drawn, kept on disk, undone, and nonsense is dropped', async () => {
      const r = await page(async () => {
        setNoteForm(['sa'], 'heart');
        const el = els.get('sa');
        const drawn = el.dataset.form === 'heart' && !!el.querySelector(':scope > .note-form path') && el.dataset.at === 'ic';
        await saveNow();
        const back = adoptBoard(JSON.parse(serialiseBoard(activeBoard())));
        const junk = adoptBoard({ id: 'x', name: 'x', notes: [{ id: 'j', body: '', form: 'blob<script>', textAt: 'zz', tx: 'a' }] }).notes[0];
        const issues = formIssues(state.notes.find((n) => n.id === 'sb'));
        undo();
        const undone = state.notes.find((n) => n.id === 'sa').form;
        redo();
        await saveNow();
        return { drawn, kept: back.notes.find((n) => n.id === 'sa').form, junk: [junk.form, junk.textAt, junk.tx], issues, undone };
      });
      ok(r.drawn, 'the svg and the layout are on the element');
      ok(r.kept === 'heart', 'adoptBoard keeps the shape');
      ok(r.junk.every((v) => v == null), 'a shape or place nobody offers is dropped: ' + JSON.stringify(r.junk));
      ok(r.issues.includes('form.warnTable'), 'a table is warned about: ' + JSON.stringify(r.issues));
      ok(r.undone == null, 'one undo takes the shape off');
      ok(onDisk().notes.find((n) => n.id === 'sa').form === 'heart', 'on disk');
    });

    await test('2.4 the writing goes where it is put, and the panel warns about a table first', async () => {
      const r = await page(async () => {
        const n = state.notes.find((x) => x.id === 'sa');
        n.textAt = 'bc'; n.tx = 10; paintForm(els.get('sa'), n);
        const el = els.get('sa');
        const at = el.dataset.at, left = el.style.getPropertyValue('--fi-l');
        openShapeMenu(200, 200, ['sb']);
        document.querySelector('.sh-tile[data-form="star"]').click();
        const warned = !document.querySelector('.sh-warn').classList.contains('hidden');
        const unchanged = state.notes.find((x) => x.id === 'sb').form === undefined;
        closeCtxMenu();
        await saveNow();
        return { at, left, warned, unchanged };
      });
      ok(r.at === 'bc' && r.left === '28%', 'place and nudge reach the grid: ' + JSON.stringify(r));
      ok(r.warned && r.unchanged, 'the warning comes first and changes nothing');
      const n = onDisk().notes.find((x) => x.id === 'sa');
      ok(n.textAt === 'bc' && n.tx === 10, 'on disk: ' + JSON.stringify(n));
    });

    await test('2.4 the space round the writing: four numbers, presets, and an old store keeps its look', async () => {
      const r = await page(() => {
        const roomy = healPad(undefined, 'roomy');
        const clamped = healPad({ t: 999, r: -4, b: 'x', l: 7 }, 'cosy');
        state.settings.notePad = { t: 30, r: 14, b: 12, l: 40 };
        applyNotePad();
        const body = getComputedStyle(els.get('sb').querySelector('.note-body'));
        const got = [body.paddingTop, body.paddingLeft];
        state.settings.notePad = Object.assign({}, PAD_PRESETS.cosy); applyNotePad();
        return { roomy, clamped, got, preset: padPreset(PAD_PRESETS.thin), custom: padPreset({ t: 1, r: 1, b: 1, l: 1 }) };
      });
      ok(JSON.stringify(r.roomy) === JSON.stringify({ t: 26, r: 28, b: 26, l: 28 }), 'a pre-2.4 Roomy store reads as Roomy: ' + JSON.stringify(r.roomy));
      ok(r.clamped.t === 64 && r.clamped.r === 0 && r.clamped.b === 12 && r.clamped.l === 7, 'out-of-range sides are healed: ' + JSON.stringify(r.clamped));
      ok(r.got[0] === '30px' && r.got[1] === '40px', 'a note reads the sliders: ' + JSON.stringify(r.got));
      ok(r.preset === 'thin' && r.custom === 'custom', 'presets are recognised');
    });

    await test('2.4 columns: widths are all-or-nothing, add up, and survive a paste', async () => {
      const r = await page(() => {
        const d = document.createElement('div');
        d.innerHTML = '<div class="mb-cols"><div class="mb-col mb-w-70"><p>a</p></div><div class="mb-col"><p>b</p></div></div>' +
                      '<div class="mb-cols"><div class="mb-col mb-w-30"><p>a</p></div><div class="mb-col mb-w-30"><p>b</p></div><div class="mb-col mb-w-30"><p>c</p></div></div>';
        repairColumns(d);
        const [g1, g2] = d.querySelectorAll('.mb-cols');
        const half = [...g1.children].map(colWidth);
        const sum = [...g2.children].map(colWidth).reduce((a, b) => a + b, 0);
        applyColWidths(g1, [3, 1]);
        const kept = sanitize(g1.outerHTML);
        return { half, sum, set: [...g1.children].map(colWidth), kept: /mb-w-75/.test(kept) && /mb-w-25/.test(kept) };
      });
      ok(r.half.every((w) => w === 0), 'a block with one width goes back to even: ' + JSON.stringify(r.half));
      ok(r.sum === 100, 'widths add up to the row: ' + r.sum);
      ok(r.set[0] === 75 && r.set[1] === 25, 'applyColWidths shares in proportion: ' + JSON.stringify(r.set));
      ok(r.kept, 'a width survives the paste sanitiser');
    });

    await test('2.4 signposts never sit on each other, and the workflows list switches them', async () => {
      const r = await page(async () => {
        state.settings.compass = true;
        drawCompass();
        const boxes = () => [...document.querySelectorAll('.cp-chip')].map((c) => c.getBoundingClientRect());
        const overlaps = (bs) => { let n = 0; bs.forEach((a, i) => bs.slice(i + 1).forEach((b) => { if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) n++; })); return n; };
        const before = boxes();
        openFlowsMenu();
        const rows = document.querySelectorAll('#flowsMenu .fl-row').length;
        const one = document.querySelector('#flowsMenu .fl-row[data-id="w2"] [data-act="one"]');
        one.checked = false; one.dispatchEvent(new Event('change'));
        const after = document.querySelectorAll('.cp-chip').length;
        closeFlowsMenu();
        await saveNow();
        return { n: before.length, overlaps: overlaps(before), rows, after, count: $('flowsBtn').textContent };
      });
      ok(r.n === 4 && r.overlaps === 0, 'four signposts, none overlapping: ' + JSON.stringify(r));
      ok(r.rows === 4 && r.count.includes('4'), 'the list and the button name every workflow');
      ok(r.after === 3, 'switching one off takes its signpost away');
      ok(onDisk().frames.find((f) => f.id === 'w2').noCompass === true, 'and that is kept on disk');
    });

    await test('2.4 the view zooms out to 2%', async () => {
      const z = await page(() => { for (let i = 0; i < 80; i++) zoomAt(400, 300, 0.8); const z = state.view.z; flyTo({ x: 300, y: 100 }, 1, 1); return z; });
      ok(Math.abs(z - 0.02) < 1e-9, 'minimum zoom: ' + z);
    });

    // 2.4.1, MAP.md §4z1: a zoom in the middle of a drag used to slide the note off the pointer
    await test('2.4.1 a dragged note stays under the pointer through a wheel zoom, and a pan keeps the zoom', async () => {
      const r = await page(async () => {
        flyTo({ x: 130, y: 110 }, 1, 1);
        await new Promise((res) => setTimeout(res, 60));
        const n = state.notes.find((x) => x.id === 'sa');
        const vp = vpRect(), p0 = toScreen(n.x + 20, n.y + 20);
        const at = (x, y) => ({ clientX: vp.left + x, clientY: vp.top + y, pointerId: 1, shiftKey: false });
        const grab = (e) => { const w = toWorld(e.clientX, e.clientY); return { x: Math.round(w.x - n.x), y: Math.round(w.y - n.y) }; };
        const e0 = at(p0.x, p0.y);
        beginMove(e0, 'sa');
        const e1 = at(p0.x + 60, p0.y + 40);
        onGestureMove(e1);
        zoomAt(e1.clientX, e1.clientY, 0.5);          // the pointer has not moved
        const still = grab(e1);
        const e2 = at(p0.x + 140, p0.y + 90);
        onGestureMove(e2);
        const moved = grab(e2);
        endGesture();
        undo();
        // a pan with a zoom in the middle: the board point under the pointer stays there
        beginPan(at(400, 300));
        onGestureMove(at(420, 310));
        zoomAt(vp.left + 420, vp.top + 310, 2);
        const before = toWorld(vp.left + 420, vp.top + 310);
        onGestureMove(at(470, 350));
        const after = toWorld(vp.left + 470, vp.top + 350);
        endGesture();
        flyTo({ x: 300, y: 100 }, 1, 1);
        return { still, moved, pan: [Math.round(after.x - before.x), Math.round(after.y - before.y)] };
      });
      ok(r.still.x === 20 && r.still.y === 20, 'still under the pointer after the zoom: ' + JSON.stringify(r.still));
      ok(r.moved.x === 20 && r.moved.y === 20, 'and after moving on at the new zoom: ' + JSON.stringify(r.moved));
      ok(r.pan[0] === 0 && r.pan[1] === 0, 'the pan kept the zoom: ' + JSON.stringify(r.pan));
    });

    // 2.5, MAP.md §4z2: a note you draw in
    await test('2.5 a drawing note: drawn on, titled, kept on disk, undone whole, painted in the board picture', async () => {
      const r = await page(async () => {
        const n = addSketch({ x: 1200, y: 0 });
        const opened = sketchOpen();
        const svg = $('skSvg');
        const box = svg.getBoundingClientRect();
        const pe = (type, x, y, extra) => new PointerEvent(type, Object.assign({
          bubbles: true, cancelable: true, pointerId: 7, pointerType: 'pen', isPrimary: true,
          clientX: box.left + x, clientY: box.top + y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.6
        }, extra || {}));
        state.settings.sketchPen = healPen({ tool: 'brush', color: 'blue', size: 1 });
        svg.dispatchEvent(pe('pointerdown', 100, 100));
        for (let i = 1; i <= 20; i++) window.dispatchEvent(pe('pointermove', 100 + i * 10, 100 + i * 4));
        window.dispatchEvent(pe('pointerup', 300, 180));
        // a finger once the pen has been used is a palm, and draws nothing
        svg.dispatchEvent(pe('pointerdown', 400, 300, { pointerType: 'touch', pointerId: 8 }));
        window.dispatchEvent(pe('pointerup', 400, 300, { pointerType: 'touch', pointerId: 8 }));
        const live = sk.strokes.length, ws = !!(sk.strokes[0] && sk.strokes[0].ws);
        $('skTitle').value = 'Groceries'; $('skTitle').dispatchEvent(new Event('input'));
        closeSketch();
        const el = els.get(n.id);
        const shown = { title: el.querySelector('.sk-title').textContent, paths: el.querySelectorAll('.sk-svg path').length };
        const kept = JSON.parse(JSON.stringify(n.sketch));
        undo();
        const undone = state.notes.find((x) => x.id === n.id).sketch.strokes.length;
        redo();
        await saveNow();
        const pics = await loadExportPictures(activeBoard());
        let painted = true;
        try { withTheme(pictureTheme(), () => paintBoardCanvas(activeBoard(), 1, pics)); } catch (e) { painted = String(e); }
        // nonsense off the disk is healed, not drawn
        const healed = okSketch({ w: 'x', h: -4, title: 7, strokes: [{ pts: [1] }, { pts: [0, 0, 5, 5], tool: 'pen' }] });
        healed.legacyPage = 'w' in healed || 'h' in healed;      // 2.6: no page, only what was drawn
        return { id: n.id, opened, live, ws, shown, kept, undone, painted, healed, text: noteText(n), title: noteTitle(n) };
      });
      ok(r.opened, 'a new drawing note opens to be drawn on');
      ok(r.live === 1 && r.ws, 'one pen stroke with widths from its pressure, and the palm drew nothing: ' + r.live);
      ok(r.shown.title === 'Groceries' && r.shown.paths === 1, 'the board shows the title and the drawing: ' + JSON.stringify(r.shown));
      ok(r.undone === 0, 'one undo takes back the whole time in the editor');
      ok(r.painted === true, 'the board picture paints it: ' + r.painted);
      ok(r.text === 'Groceries' && r.title === 'Groceries', 'find and the rope menus know it by its title');
      ok(!r.healed.legacyPage && r.healed.title === '' && r.healed.strokes.length === 1, 'healed: ' + JSON.stringify(r.healed));
      const disk = onDisk().notes.find((x) => x.id === r.id);
      ok(disk && disk.sketch && disk.sketch.title === 'Groceries' && disk.sketch.strokes.length === 1 && Array.isArray(disk.sketch.strokes[0].ws), 'kept on disk');
    });

    // 2.6, MAP.md §4z3: a drawing note has no page, and the picture editor zooms and takes a pen
    await test('2.6 a drawing note keeps only what was drawn, and zooms at the pointer', async () => {
      const r = await page(async () => {
        const n = addSketch({ x: 1800, y: 0 });
        const svg = $('skSvg'), stage = $('skStage');
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const box = stage.getBoundingClientRect();
        const pe = (type, x, y) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, pointerType: 'mouse', clientX: box.left + x, clientY: box.top + y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 });
        const line = (x0, y0, x1, y1) => {
          svg.dispatchEvent(pe('pointerdown', x0, y0));
          for (let i = 1; i <= 8; i++) window.dispatchEvent(pe('pointermove', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8));
          window.dispatchEvent(pe('pointerup', x1, y1));
        };
        line(100, 100, 300, 100);
        // the wheel zooms at the pointer: the drawing point under it stays under it
        const under = sketchPoint({ clientX: box.left + 400, clientY: box.top + 300 });
        stage.dispatchEvent(new WheelEvent('wheel', { deltaY: 400, ctrlKey: true, clientX: box.left + 400, clientY: box.top + 300, bubbles: true, cancelable: true }));
        const still = sketchPoint({ clientX: box.left + 400, clientY: box.top + 300 });
        const z = sk.view.z;
        line(500, 400, 600, 500);       // far away, at the new zoom
        const b = sketchBounds(sk.strokes);
        closeSketch();
        const vb = els.get(n.id).querySelector('.sk-svg').getAttribute('viewBox').split(' ').map(Number);
        return { z, drift: Math.hypot(under.x - still.x, under.y - still.y), b, vb, keys: Object.keys(n.sketch), shape: n.w / (n.h - 40) };
      });
      ok(r.z < 1, 'Ctrl+wheel zoomed out: ' + r.z);
      ok(r.drift < 0.01, 'the point under the pointer stayed under it: ' + r.drift);
      ok(r.b.w > 400 && Math.abs(r.vb[2] - r.b.w) < 1 && Math.abs(r.vb[0] - r.b.x) < 1, 'the note shows exactly the drawn area, which grew: ' + JSON.stringify({ b: r.b, vb: r.vb }));
      ok(JSON.stringify(r.keys) === '["title","strokes"]', 'no page size is kept: ' + r.keys);
      ok(Math.abs(r.shape - r.b.w / r.b.h) / (r.b.w / r.b.h) < 0.1, 'the note took the drawing\'s shape: ' + r.shape);
    });

    await test('2.6 the picture editor: a pen with pressure, zoom, the eraser, its own undo, applied as a file', async () => {
      const r = await page(async () => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const g = c.getContext('2d'); g.fillStyle = '#3a6ea5'; g.fillRect(0, 0, 400, 300);
        const n = addNote({ x: 2600, y: 0 }, { pic: true, ar: 4 / 3, w: 400, h: 300, edit: false, body: picBody(c.toDataURL('image/png'), 'probe') });
        const before = picSrc(n);
        editPicture(n.id);
        for (let i = 0; i < 40 && !ST.img; i++) await new Promise((res) => setTimeout(res, 50));
        await new Promise((res) => requestAnimationFrame(res));
        const cv = $('stCanvas');
        const at = (px, py) => { const r0 = cv.getBoundingClientRect(); return { x: r0.left + ST.view.x + px * ST.view.z, y: r0.top + ST.view.y + py * ST.view.z }; };
        const pe = (type, p, extra) => new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 9, pointerType: 'pen', clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.2 }, extra || {}));
        // zoom in at the middle of the picture
        const mid = at(200, 150);
        stSurface.zoomAt(mid.x, mid.y, 2);
        const z = ST.view.z;
        ST.tool = 'pen'; ST.weight = 6;
        $('stWrap').dispatchEvent(pe('pointerdown', at(100, 150)));
        for (let i = 1; i <= 12; i++) window.dispatchEvent(pe('pointermove', at(100 + i * 10, 150), { pressure: Math.min(1, 0.2 + i * 0.07) }));
        window.dispatchEvent(pe('pointerup', at(220, 150)));
        const pen = ST.marks[0];
        const ws = pen && pen.ws ? [Math.min(...pen.ws), Math.max(...pen.ws)] : null;
        // a palm, once the pen has drawn, adds nothing
        $('stWrap').dispatchEvent(pe('pointerdown', at(50, 50), { pointerType: 'touch', pointerId: 10 }));
        window.dispatchEvent(pe('pointerup', at(50, 50), { pointerType: 'touch', pointerId: 10 }));
        const afterPalm = ST.marks.length;
        // the pen's eraser end takes the line
        $('stWrap').dispatchEvent(pe('pointerdown', at(160, 140), { button: 5, buttons: 32 }));
        window.dispatchEvent(pe('pointermove', at(160, 160), { buttons: 32 }));
        window.dispatchEvent(pe('pointerup', at(160, 160)));
        const erased = ST.marks.length;
        studioUndo(true);
        const back = ST.marks.length;
        $('stApply').click();
        for (let i = 0; i < 40 && picSrc(n) === before; i++) await new Promise((res) => setTimeout(res, 50));
        return { z, ws, afterPalm, erased, back, applied: picSrc(n) !== before, file: /^mbf:/.test(picSrc(n)), closed: $('studio').classList.contains('hidden') };
      });
      ok(r.z > 1.5, 'zoomed in: ' + r.z);
      ok(r.ws && r.ws[1] > r.ws[0] * 1.5, 'the line follows the pen\'s pressure: ' + JSON.stringify(r.ws));
      ok(r.afterPalm === 1, 'a palm drew nothing');
      ok(r.erased === 0 && r.back === 1, 'the eraser end took the line and undo brought it back');
      ok(r.applied && r.file && r.closed, 'applied, as a file in the board\'s folder');
    });

    // 2.6.2, MAP.md §4x: a paired phone's S Pen draws in whatever is open, not on the board behind it
    await test('2.6.2 a paired phone draws in an open drawing note and in the picture editor', async () => {
      const r = await page(async () => {
        onPadMessage({ t: 'size', a: 0.5, px: 1080 });
        const inkBefore = (state.ink || []).length;
        // a drawing note, open
        const n = addSketch({ x: 3400, y: 0 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const host = padHost(), p = padRect(), stage = $('skStage').getBoundingClientRect();
        const v = sk.view;
        onPadMessage({ t: 'down', id: 'q1', x: 0.2, y: 0.4, p: 0.2, tool: 'brush', size: 1, color: 'red' });
        const pts = [];
        for (let i = 1; i <= 10; i++) pts.push(0.2 + i * 0.03, 0.4, 0.2 + i * 0.07);
        onPadMessage({ t: 'move', id: 'q1', pts });
        onPadMessage({ t: 'up', id: 'q1' });
        const s = sk.strokes[0];
        const want = { x: (p.x + 0.2 * p.w - v.x) / v.z, y: (p.y + 0.4 * p.h - v.y) / v.z };
        const sketchOut = {
          kind: host.kind, n: sk.strokes.length, tool: s && s.tool, color: s && s.color,
          off: s ? Math.hypot(s.pts[0] - want.x, s.pts[1] - want.y) : -1, ws: !!(s && s.ws),
          fits: Math.abs(p.h - stage.height) < 1,
          board: (state.ink || []).length === inkBefore
        };
        // the phone's eraser and undo work on the drawing too
        onPadMessage({ t: 'down', id: 'q2', x: 0.35, y: 0.4, p: 0.5, tool: 'eraser', size: 2, color: 'text' });
        onPadMessage({ t: 'up', id: 'q2' });
        sketchOut.erased = sk.strokes.length;
        onPadMessage({ t: 'undo' });
        sketchOut.back = sk.strokes.length;
        closeSketch();
        sketchOut.kept = n.sketch.strokes.length;
        sketchOut.after = padHost().kind;
        // the picture editor, open
        const c = document.createElement('canvas'); c.width = 400; c.height = 300;
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 300);
        const pic = addNote({ x: 4200, y: 0 }, { pic: true, ar: 4 / 3, w: 400, h: 300, edit: false, body: picBody(c.toDataURL('image/png'), 'phone') });
        editPicture(pic.id);
        for (let i = 0; i < 40 && !ST.img; i++) await new Promise((res) => setTimeout(res, 50));
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const kindStudio = padHost().kind;
        onPadMessage({ t: 'down', id: 'q3', x: 0.4, y: 0.5, p: 0.1, tool: 'pen', size: 1, color: 'blue' });
        const pts2 = [];
        for (let i = 1; i <= 10; i++) pts2.push(0.4 + i * 0.01, 0.5, 0.1 + i * 0.08);
        onPadMessage({ t: 'move', id: 'q3', pts: pts2 });
        onPadMessage({ t: 'up', id: 'q3' });
        const m = ST.marks[0];
        const studioOut = { kind: kindStudio, n: ST.marks.length, type: m && m.type, rgb: m && /^rgb/.test(m.color), ws: !!(m && m.ws && m.ws[5] > m.ws[1]) };
        onPadMessage({ t: 'undo' });
        studioOut.undone = ST.marks.length;
        closeStudio();
        return { sketch: sketchOut, studio: studioOut, board: (state.ink || []).length === inkBefore };
      });
      const s = r.sketch, st = r.studio;
      ok(s.kind === 'sketch' && s.fits, 'with a drawing note open the phone is a region of the note\'s page: ' + JSON.stringify(s));
      ok(s.n === 1 && s.tool === 'brush' && s.color === 'red' && s.ws, 'the phone\'s line is in the drawing, with its pressure: ' + JSON.stringify(s));
      ok(s.off >= 0 && s.off < 0.5, 'where the pen was, through the drawing\'s own view: ' + s.off);
      ok(s.erased === 0 && s.back === 1 && s.kept === 1, 'the phone\'s eraser and undo work on the drawing, and Done keeps it: ' + JSON.stringify(s));
      ok(s.after === 'board', 'closing the note gives the phone the board back');
      ok(st.kind === 'studio' && st.n === 1 && st.type === 'pen' && st.rgb && st.ws, 'the picture editor takes the phone\'s pen, in a real colour, with pressure: ' + JSON.stringify(st));
      ok(st.undone === 0, 'and its undo');
      ok(r.board, 'nothing landed on the board behind either');
    });
  }
];
