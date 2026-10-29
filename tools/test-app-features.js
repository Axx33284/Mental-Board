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

    // 2.7, MAP.md §4z4: a picture, a photo or a PDF under a drawing
    const pdfB64 = require('./fake-pdf.js')().toString('base64');
    await test('2.7 pictures and PDFs to draw over: a picture becomes a drawing, a PDF becomes pages, and their files are kept', async () => {
      const r = await page(async (pdfB64) => {
        const bin = atob(pdfB64);
        const pdf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) pdf[i] = bin.charCodeAt(i);
        // a picture on the board becomes a drawing note with that picture under the ink
        const c = document.createElement('canvas'); c.width = 300; c.height = 200;
        const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 300, 200);
        const url = await keepSketchPicture(c.toDataURL('image/png'), 'map.png');
        const n = addNote({ x: 5000, y: 0 }, { pic: true, ar: 1.5, w: 300, h: 200, edit: false, body: picBody(url, 'map.png') });
        const bodyBefore = n.body;
        pictureToSketch(n.id);
        const conv = { open: sketchOpen(), pic: !!n.pic, pics: (n.sketch.pics || []).length, title: n.sketch.title, sameBody: n.body === bodyBefore, editorPics: sk.pics.length };
        // a PDF's pages come in under it, one step back takes them all away
        const got = await sketchImport([{ name: 'sheet.pdf', kind: 'pdf', ext: 'pdf', bytes: pdf }]);
        const pages = sk.pics.slice(1).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, file: /^mbf:.*sheet%20p\d\.png$/.test(p.url) }));
        const below = sk.pics[1].y >= sk.pics[0].y + sk.pics[0].h && sk.pics[1].x === sk.pics[0].x;
        sketchUndo(true);
        const undone = sk.pics.length;
        sketchUndo(false);
        // a picture from a file
        await sketchImport([{ name: 'dot.png', kind: 'image', ext: 'png', dataUrl: c.toDataURL('image/png') }]);
        closeSketch();
        const files = sketchPicFiles(n);
        const kept = referencedFileUrls();
        const el = els.get(n.id);
        const pics = await loadExportPictures(activeBoard());
        let painted = true;
        try { withTheme(pictureTheme(), () => paintBoardCanvas(activeBoard(), 1, pics)); } catch (e) { painted = String(e); }
        // a board that changes id takes its drawing's pictures with it (relinkBoardHost reads bodies)
        const copy = JSON.parse(JSON.stringify({ notes: [n] }));
        relinkBoardHost(copy, state.activeBoard, 'elsewhere');
        const moved = sketchPicFiles(copy.notes[0]).every((f) => f.url.startsWith('mbf://elsewhere/'));
        await saveNow();
        return { id: n.id, conv, got, pages, below, undone, pics: n.sketch.pics.length, files: files.length,
          allKept: files.every((f) => kept.includes(f.url)), shown: el.querySelectorAll('.sk-svg image').length,
          exported: pics.has(n.id + '#0') && pics.has(n.id + '#2'), painted, moved };
      }, pdfB64);
      ok(r.conv.open && !r.conv.pic && r.conv.pics === 1 && r.conv.sameBody && r.conv.editorPics === 1 && r.conv.title === 'map',
        'Draw on it: the picture is now a drawing note with itself underneath, nothing copied: ' + JSON.stringify(r.conv));
      ok(r.got === 2 && r.pages.length === 2 && r.pages.every((p) => p.file && p.w === 900), 'a two-page PDF is two pictures in the board\'s folder: ' + JSON.stringify(r.pages));
      ok(r.below, 'the pages go under what was there, lined up with it');
      ok(r.undone === 1, 'one undo takes the whole PDF away');
      ok(r.pics === 4 && r.files === 4 && r.shown === 4, 'kept as four pictures, their files in the body: ' + JSON.stringify(r));
      ok(r.allKept, 'every picture under a drawing is on the clean-up\'s list of files in use');
      ok(r.exported && r.painted === true, 'the board picture draws them: ' + r.painted);
      ok(r.moved, 'a board that changes id takes them with it');
      const disk = onDisk().notes.find((x) => x.id === r.id);
      ok(disk && disk.sketch && disk.sketch.pics.length === 4 && (disk.body.match(/<img /g) || []).length === 4, 'on disk: four places, four files');
    });

    // 2.7.1, MAP.md §4z5: saved as it is drawn; select, move, resize, delete; drops; rename; tools on the press; the phone's arrow
    await test('2.7.1 a drawing note saves as it is drawn, selects and moves, takes drops, renames, and the bars act on the press', async () => {
      const r = await page(async () => {
        const out = {};
        const n = addSketch({ x: 7000, y: 0 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const svg = $('skSvg'), box = $('skStage').getBoundingClientRect();
        const scr = (x, y) => ({ x: box.left + sk.view.x + x * sk.view.z, y: box.top + sk.view.y + y * sk.view.z });
        const pe = (type, p, extra) => new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 77, pointerType: 'mouse', clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }, extra || {}));
        // a tool is taken on the press — a press with no click behind it
        const pickTool = (tool) => $('skBar').querySelector(`[data-tool="${tool}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        pickTool('pen');
        out.pressPen = state.settings.sketchPen.tool;
        const line = (x0, y0, x1, y1) => {
          svg.dispatchEvent(pe('pointerdown', scr(x0, y0)));
          for (let i = 1; i <= 6; i++) window.dispatchEvent(pe('pointermove', scr(x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6)));
          window.dispatchEvent(pe('pointerup', scr(x1, y1)));
        };
        line(20, 20, 220, 40);
        // saved with the editor still open
        await new Promise((res) => setTimeout(res, 100));
        await saveNow();
        out.savedOpen = (n.sketch.strokes || []).length;
        // a picture, then the arrow: select it, move it, resize it from the corner, delete it
        const c = document.createElement('canvas'); c.width = 200; c.height = 100; c.getContext('2d').fillRect(0, 0, 200, 100);
        await sketchImport([{ name: 'p.png', kind: 'image', ext: 'png', dataUrl: c.toDataURL('image/png') }]);
        await new Promise((res) => requestAnimationFrame(res));
        pickTool('select');
        const p0 = sk.pics[0];
        const a = scr(p0.x + 50, p0.y + 50), b = scr(p0.x + 150, p0.y + 80);
        svg.dispatchEvent(pe('pointerdown', a)); window.dispatchEvent(pe('pointermove', b)); window.dispatchEvent(pe('pointerup', b));
        const p1 = sk.pics[0];
        out.moved = [Math.round(p1.x - p0.x), Math.round(p1.y - p0.y)];
        const c0 = scr(p1.x + p1.w, p1.y + p1.h), c1 = scr(p1.x + p1.w + 100, p1.y + p1.h);
        svg.dispatchEvent(pe('pointerdown', c0)); window.dispatchEvent(pe('pointermove', c1)); window.dispatchEvent(pe('pointerup', c1));
        const p2 = sk.pics[0];
        out.resized = { w: Math.round(p2.w), shape: Math.abs(p2.w / p2.h - 2) < 0.01 };
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
        out.deleted = sk.pics.length;
        sketchUndo(true);
        // a lasso round the line selects it, and the phone's bin takes it
        const l0 = scr(0, 0), l1 = scr(240, 60);
        svg.dispatchEvent(pe('pointerdown', l0)); window.dispatchEvent(pe('pointermove', l1)); window.dispatchEvent(pe('pointerup', l1));
        out.lassoed = [...sk.sel].filter((it) => it.pts).length;
        onPadMessage({ t: 'sel', act: 'delete' });
        out.phoneDeleted = sk.strokes.length;
        sketchUndo(true);
        closeSketch();
        out.stepsOnBoard = (() => { const before = n.sketch.strokes.length; undo(); const after = (state.notes.find((x) => x.id === n.id) || {}).sketch; redo(); return [before, after ? after.strokes.length : -1]; })();
        // undo and redo rebuilt the board's notes: from here on, the note as it is now
        const live = () => state.notes.find((x) => x.id === n.id);
        // rename in place
        renameSketch(n.id);
        const tl = els.get(n.id).querySelector('.sk-title');
        tl.textContent = 'Monday';
        tl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        out.title = live().sketch.title;
        // a drop: a picture goes in, a document is named as refused
        const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
        let said = '';
        const ot = window.toast; window.toast = (m) => { said += m; };
        const picsBefore = (live().sketch.pics || []).length;
        await dropIntoSketch(n.id, [new File([blob], 'shot.png', { type: 'image/png' }), new File(['x'], 'report.docx', { type: 'application/msword' })]);
        window.toast = ot;
        closeSketch();
        out.dropped = live().sketch.pics.length - picsBefore;
        out.refused = said.includes('report.docx');
        // the board's pen: a click on a note puts the pen away and selects it; nothing is drawn
        const other = addNote({ x: 9000, y: 0 }, { edit: false });
        flyTo({ x: other.x + other.w / 2, y: other.y + other.h / 2 }, 1, 1);
        await new Promise((res) => setTimeout(res, 50));
        toggleInk(true);
        const inkBefore = state.ink.length;
        const vr = vpRect(), sp = toScreen(other.x + other.w / 2, other.y + other.h / 2);
        const at = { clientX: vr.left + sp.x, clientY: vr.top + sp.y };
        const ev = (type) => new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, pointerId: 78, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 }, at));
        $('viewport').dispatchEvent(ev('pointerdown'));
        window.dispatchEvent(ev('pointerup'));
        out.penClick = { inkMode, selected: selection.has(other.id), drew: state.ink.length - inkBefore };
        return out;
      });
      ok(r.pressPen === 'pen', 'a press on a tool takes it, no click needed');
      ok(r.savedOpen === 1, 'the line is in the note while the editor is still open: ' + r.savedOpen);
      ok(r.moved[0] === 100 && r.moved[1] === 30, 'the arrow moves a picture: ' + JSON.stringify(r.moved));
      ok(r.resized.w === 300 && r.resized.shape, 'its corner resizes it, keeping its shape: ' + JSON.stringify(r.resized));
      ok(r.deleted === 0, 'Delete takes it');
      ok(r.lassoed === 1 && r.phoneDeleted === 0, 'a lasso selects the line, and the phone\'s bin deletes it from the drawing: ' + JSON.stringify(r));
      ok(r.stepsOnBoard[0] === 1 && r.stepsOnBoard[1] === 0, 'the whole visit is one step of the board\'s undo: ' + JSON.stringify(r.stepsOnBoard));
      ok(r.title === 'Monday', 'renamed on the board');
      ok(r.dropped === 1 && r.refused, 'a dropped picture goes in, a document is named as refused');
      ok(!r.penClick.inkMode && r.penClick.selected && r.penClick.drew === 0, 'a click on a note with the pen out selects it: ' + JSON.stringify(r.penClick));
    });
  },

  /* ---- 2.8, MAP.md §4z6: Notion's slash menu, and databases in a note ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await page(async () => {
      confirmDlg = async () => true;
      const b = makeBoard('Twenty-eight');
      b.notes.push({ id: 'da', x: 0, y: 0, w: 300, h: 200, z: 1, color: 'default', body: '<p>start</p>' },
        { id: 'db', x: 900, y: 0, w: 300, h: 200, z: 2, color: 'default', body: '<p><br></p>' });
      state.boards.push(b);
      await switchBoard(b.id);
      flyTo({ x: 300, y: 100 }, 1, 1);
      await new Promise((r) => setTimeout(r, 60));
    });
    const onDisk = () => {
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-eight'));
      return JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8'));
    };

    await test('2.8 the slash menu: Notion\'s sections in order, a picture beside the row, and typing still ranks', async () => {
      const r = await page(async () => {
        const n = state.notes.find((x) => x.id === 'da');
        enterEdit(n);
        document.execCommand('insertText', false, '/');
        openSlash(editing);
        const heads = [...$('slashList').querySelectorAll('.sm-head')].map((h) => h.textContent);
        const want = ['basic', 'media', 'database', 'advanced', 'inline'].map((s) => t('blocks.sec.' + s));
        slash.sel = slash.items.findIndex((it) => it.run && it.run.k === 'dbBoard');
        markSlashSel();
        const peek = { shown: !$('slashPeek').classList.contains('hidden'), board: !!$('slashPeekPic').querySelector('.pk-board'), cap: $('slashPeekCap').textContent === t('block.dbBoard.d') };
        // 2.8.1: the list scrolling under a resting pointer does not take the selection; a real move does
        const rows = $('slashList').querySelectorAll('.sm-item');
        slash.sel = 12; markSlashSel();
        rows[3].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 0, movementY: 0 }));
        const keptByKeys = slash.sel === 12;
        rows[3].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 2, movementY: 1 }));
        const takenByMouse = slash.sel === 3;
        const firstFor = (q) => { slash.query = q; renderSlash(); return slash.items[0] && slash.items[0].run.k; };
        const ranks = { table: firstFor('table'), link: firstFor('link'), kanban: firstFor('kanban'), hr: firstFor('hr') };
        closeSlash();
        const peekGone = $('slashPeek').classList.contains('hidden');
        exitEdit();
        return { heads: heads.join('|'), want: want.join('|'), peek, ranks, peekGone, keptByKeys, takenByMouse };
      });
      ok(r.keptByKeys && r.takenByMouse, 'a scroll under a resting pointer keeps the arrow keys\' row; moving the mouse picks one: ' + JSON.stringify([r.keptByKeys, r.takenByMouse]));
      ok(r.heads === r.want, 'the sections, in Notion\'s order: ' + r.heads);
      ok(r.peek.shown && r.peek.board && r.peek.cap, 'the row under the cursor has its picture and its description beside the menu: ' + JSON.stringify(r.peek));
      ok(r.ranks.table === 'table' && r.ranks.link === 'link', '/table is still the plain table and /link still the link: ' + JSON.stringify(r.ranks));
      ok(r.ranks.kanban === 'dbBoard' && r.ranks.hr === 'divider', 'Notion\'s keywords find a block: ' + JSON.stringify(r.ranks));
      ok(r.peekGone, 'the picture goes with the menu');
    });

    await test('2.8 a database: inserted, edited in a closed note, kept on disk, undone, and its data is all it stores', async () => {
      const r = await page(async () => {
        const out = {};
        const n = state.notes.find((x) => x.id === 'da');
        enterEdit(n);
        insertDatabase('board');
        exitEdit();
        const live = () => state.notes.find((x) => x.id === 'da');
        out.grown = [live().w >= 680, live().h >= 420];
        const el = els.get('da').querySelector('.mb-db');
        out.cols = el.querySelectorAll('.db-col').length;
        out.stored = !live().body.includes('db-face') && live().body.includes('data-db=');
        let ctx = dbCtx(el);
        const title = ctx.data.props[0].id, status = ctx.data.props.find((p) => p.type === 'status');
        // a press on a card in a closed note is the card's, not the start of a move
        const card = el.querySelector('.db-card');
        const cr = card.getBoundingClientRect();
        const at = { clientX: cr.left + 10, clientY: cr.top + 10, bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 81, pointerType: 'mouse' };
        const x0 = live().x;
        card.dispatchEvent(new PointerEvent('pointerdown', at));
        window.dispatchEvent(new PointerEvent('pointerup', at));
        card.click();
        out.pageOpen = !$('dbRowDlg').classList.contains('hidden');
        out.noteStayed = live().x === x0;
        $('dbRdTitle').value = 'Ship it';
        $('dbRdText').value = 'Everything on the list.';
        closeDbRow();
        ctx = dbCtx(els.get('da').querySelector('.mb-db'));
        out.row = [dbTitle(ctx.data, ctx.data.rows[0]), ctx.data.rows[0].t];
        // a cell, a new option, a new property, a new view
        const blk = els.get('da').querySelector('.mb-db');
        const opt = dbAddOpt(blk, status.id, 'Blocked');
        dbSetCell(blk, ctx.data.rows[1].id, status.id, opt.id);
        dbEdit(blk, (c) => { c.data.props.push({ id: 'phrs', name: 'Hours', type: 'number' }); });
        dbSetCell(blk, ctx.data.rows[1].id, 'phrs', 7.5);
        dbEdit(blk, (c) => { c.own.views.push({ id: 'vt', type: 'table', name: '' }); c.own.cur = 'vt'; }, 'view');
        out.tableCells = els.get('da').querySelectorAll('.db-td[data-act="cell"]').length;
        // undo takes the last change back, in a note nobody is typing in
        undo();
        const back = adoptDb(new DOMParser().parseFromString(live().body, 'text/html').querySelector('.mb-db').getAttribute('data-db'));
        out.undone = back.views.length === 1 && back.props.some((p) => p.id === 'phrs');
        redo();
        await saveNow();
        return out;
      });
      ok(r.grown[0] && r.grown[1], 'the note grew to hold a board');
      ok(r.cols === 3, 'a new board has a column per status: ' + r.cols);
      ok(r.stored, 'the note stores the data, not the drawing');
      ok(r.pageOpen && r.noteStayed, 'a card opens as a page, and pressing it did not move the note: ' + JSON.stringify(r));
      ok(r.row[0] === 'Ship it' && r.row[1] === 'Everything on the list.', 'the page\'s title and text are kept: ' + JSON.stringify(r.row));
      ok(r.tableCells === 3 * 4, 'a second view, a table, draws every row and property: ' + r.tableCells);
      ok(r.undone, 'one undo takes back one change');
      const disk = onDisk().notes.find((x) => x.id === 'da');
      const raw = /data-db="([^"]*)"/.exec(disk.body);
      const db = raw && JSON.parse(raw[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      ok(db && db.views.length === 2 && db.rows[1].c.phrs === 7.5 && db.props.find((p) => p.type === 'status').opts.some((o) => o.name === 'Blocked'), 'on disk: two views, the number and the new option');
    });

    await test('2.8 a database survives a paste and a crafted one carries no markup; Backspace does not delete it; search and Markdown see it', async () => {
      const r = await page(async () => {
        const out = {};
        const n = state.notes.find((x) => x.id === 'da');
        const blk = els.get('da').querySelector('.mb-db');
        const d = document.createElement('div');
        d.innerHTML = sanitize(blk.outerHTML);
        const pb = d.querySelector('.mb-db');
        out.paste = !!pb && !pb.querySelector('.db-face') && adoptDb(pb.getAttribute('data-db')).rows.length === 3;
        const evil = document.createElement('div');
        evil.innerHTML = sanitize(`<div class="mb-db" data-db='{"props":[{"id":"a","name":"<img src=x onerror=alert(1)>","type":"title"}],"rows":[{"id":"r","c":{"a":"<b>x</b>"}}]}'></div>`);
        paintDatabases(evil);
        out.evil = evil.querySelectorAll('img, b').length;
        enterEdit(n);
        const tail = editing.lastElementChild;
        tail.innerHTML = 'after';
        placeCaret(tail.firstChild, 0);
        const ev = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
        editing.dispatchEvent(ev);
        out.guarded = ev.defaultPrevented && !!editing.querySelector('.mb-db');
        tail.innerHTML = '<br>';
        exitEdit();
        out.search = stripHtml(n.body).includes('Ship it');
        out.md = noteToMarkdown(n.body, () => '').includes('| Ship it |');
        // a cell saying "a > b" leaves no bare ">" in the stored attribute, which the far-zoom ghost reads by regex
        const b2 = els.get('da').querySelector('.mb-db'), c2 = dbCtx(b2);
        dbSetCell(b2, c2.data.rows[1].id, c2.data.props[0].id, 'a > b <c>');
        const body = state.notes.find((x) => x.id === 'da').body;
        out.noBareAngle = !/data-db="[^"]*[<>]/.test(body) && dbTitle(dbCtx(els.get('da').querySelector('.mb-db')).data, dbCtx(els.get('da').querySelector('.mb-db')).data.rows[1]) === 'a > b <c>';
        out.ghost = ghostBlocks(body).every((g) => !/[{}]/.test(String(g.n)));
        return out;
      });
      ok(r.noBareAngle, 'angle brackets in a cell are kept, and never bare in the stored attribute');
      ok(r.paste, 'a pasted database keeps its rows and drops its drawing');
      ok(r.evil === 0, 'a crafted database paste draws its text as text');
      ok(r.guarded, 'Backspace under a database does not delete it');
      ok(r.search && r.md, 'search and Markdown see a database\'s rows: ' + JSON.stringify(r));
    });

    await test('2.8 a linked view reads and writes another note\'s rows; every layout draws', async () => {
      const r = await page(async () => {
        const out = {};
        const src = dbCtx(els.get('da').querySelector('.mb-db'));
        const n = state.notes.find((x) => x.id === 'db');
        enterEdit(n);
        const view = { id: 'vl', type: 'list', name: '' };
        insertHTML(dbBlockHtml({ v: 1, id: 'dlink', src: src.own.id, views: [view], cur: 'vl' }) + '<p><br></p>');
        afterDbInsert('list');
        exitEdit();
        const lb = els.get('db').querySelector('.mb-db');
        out.rows = lb.querySelectorAll('.db-li').length;
        const lctx = dbCtx(lb);
        dbSetCell(lb, lctx.data.rows[2].id, lctx.data.props[0].id, 'From the linked view');
        const srcBody = state.notes.find((x) => x.id === 'da').body, linkBody = state.notes.find((x) => x.id === 'db').body;
        out.wrote = srcBody.includes('From the linked view') && !linkBody.includes('From the linked view');
        // a map needs a place: added through the linked view, it lands in the source
        dbEdit(lb, (c) => { c.data.props.push({ id: 'pplace', name: 'Place', type: 'place' }); c.data.rows[0].c.pplace = '48.8566, 2.3522'; });
        out.layouts = [];
        for (const [type, chart] of DB_LAYOUTS) {
          dbSetView(lb, (v) => { v.type = type; if (chart) v.chart = chart; else delete v.chart; });
          const face = lb.querySelector('.db-face');
          out.layouts.push(type + (chart ? '/' + chart : '') + ':' + (face.querySelector('.db-body').children.length > 0 && !face.querySelector('.db-hint')));
        }
        return out;
      });
      ok(r.rows === 3, 'the linked view shows the source\'s rows: ' + r.rows);
      ok(r.wrote, 'a change in the linked view is written to the source note');
      ok(r.layouts.every((x) => x.endsWith(':true')), 'all fifteen layouts draw from the data: ' + r.layouts.join(' '));
    });
  },

  /* ---- 2.9, MAP.md §4z7: the block handle, Turn into, colours, toggles ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await page(async () => {
      confirmDlg = async () => true;
      /* A dialog an earlier suite left open would sit over the note, and the
         handle test hovers by screen position (elementFromPoint). */
      document.querySelectorAll('.overlay:not(.hidden)').forEach((o) => { console.info('2.9 suite closed a leftover', o.id); o.classList.add('hidden'); });
      const b = makeBoard('Twenty-nine');
      b.notes.push({ id: 'ba', x: 0, y: 0, w: 460, h: 520, z: 1, color: 'default', body: '<p><br></p>' });
      state.boards.push(b);
      await switchBoard(b.id);
      flyTo({ x: 230, y: 260 }, 1, 1);
      await new Promise((r) => setTimeout(r, 60));
    });
    const onDisk = () => {
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Twenty-nine'));
      return JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8'));
    };
    // the note open, with this in it
    const fill = (html) => page(async (h) => {
      const n = state.notes.find((x) => x.id === 'ba');
      exitEdit();
      n.body = h;
      repaintNoteBody(els.get('ba'), n);
      enterEdit(n);
      await new Promise((r) => setTimeout(r, 30));
    }, html);

    await test('2.9 Turn into keeps the words, splits a list round an item and joins it back, and carries what hangs under', async () => {
      await fill('<p>Words here</p><ul><li>one</li><li>two</li><li>three</li></ul><div class="mb-toggle mb-open"><div class="mb-tg-head">Fold</div><div class="mb-tg-body"><p>kept inside</p></div></div><p><br></p>');
      const r = await page(() => {
        const out = {};
        let blk = editing.querySelector('p');
        out.kinds = TURN_KINDS.filter((k) => k !== 'text').concat('text').map((k) => {
          blk = turnBlockInto(blk, k); finishBlockEdit();
          return blockKind(blk) === k && blk.textContent.includes('Words here');
        });
        const two = [...editing.querySelectorAll('li')].find((x) => x.textContent === 'two');
        const h = turnBlockInto(two, 'h2'); finishBlockEdit();
        out.split = !!h && h.previousElementSibling.tagName === 'UL' && h.nextElementSibling.tagName === 'UL';
        turnBlockInto(h, 'bullet'); finishBlockEdit();
        out.joined = editing.querySelectorAll('ul').length === 1 && editing.querySelector('ul').children.length === 3;
        const tg = editing.querySelector('.mb-toggle');
        const p = turnBlockInto(tg, 'text'); finishBlockEdit();
        out.carried = p.textContent === 'Fold' && p.nextElementSibling.textContent === 'kept inside';
        return out;
      });
      ok(r.kinds.every(Boolean), 'every kind there and back keeps the words: ' + JSON.stringify(r.kinds));
      ok(r.split && r.joined, 'an item turned into a heading splits its list, and turned back joins it: ' + JSON.stringify(r));
      ok(r.carried, 'a toggle turned into text leaves its inside under it');
    });

    await test('2.9 colours: a block, selected words, /red from the slash menu, kept on disk and through a paste', async () => {
      await fill('<p>Colour these words</p><p>Second line</p><p><br></p>');
      const r = await page(async () => {
        const out = {};
        const [a, b] = editing.querySelectorAll('p');
        setBlockColor(a, 'tc', 'red'); setBlockColor(a, 'bc', 'amber');
        out.block = a.className;
        setBlockColor(a, 'bc', 'default');
        out.reset = a.className;
        const range = document.createRange(); range.setStart(b.firstChild, 0); range.setEnd(b.firstChild, 6);
        getSelection().removeAllRanges(); getSelection().addRange(range);
        colorSelection('bc', 'blue');
        out.words = b.innerHTML;
        // "/red" offers the text colour first; picking it colours the caret's block
        placeCaret(b.lastChild, b.lastChild.length);
        document.execCommand('insertText', false, '/');
        openSlash(editing);
        document.execCommand('insertText', false, 'red');          // the input event narrows the menu, as typing does
        const first = slash.items[0];
        out.offered = first && first.kind === 'color' && first.part === 'tc' && first.color === 'red';
        runSlash(0);
        out.slashed = b.classList.contains('mb-tc-red') && !b.textContent.includes('/red');
        const d = document.createElement('div'); d.innerHTML = sanitize(editing.innerHTML);
        out.paste = !!d.querySelector('p.mb-tc-red') && !!d.querySelector('span.mb-bc-blue');
        exitEdit();
        await saveNow();
        return out;
      });
      ok(r.block === 'mb-tc-red mb-bc-amber' && r.reset === 'mb-tc-red', 'a block takes a text and a background colour, and Default takes one off: ' + JSON.stringify(r));
      ok(r.words === '<span class="mb-bc-blue">Second</span> line', 'selected words are coloured, the rest left alone: ' + r.words);
      ok(r.offered && r.slashed, '/red colours the block the caret is in');
      ok(r.paste, 'colours survive a paste');
      const disk = onDisk().notes.find((x) => x.id === 'ba');
      ok(/mb-tc-red/.test(disk.body) && /mb-bc-blue/.test(disk.body), 'and are on disk');
    });

    await test('2.9 toggles: Enter in the title, Enter out of the inside, Backspace back to text, the arrow on a closed note', async () => {
      await fill('<div class="mb-toggle mb-open mb-tg-h2"><div class="mb-tg-head">Title words</div><div class="mb-tg-body"><p>inside</p><p><br></p></div></div><p>after</p>');
      const r = await page(async () => {
        const out = {};
        const key = (k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); editing.dispatchEvent(e); return e.defaultPrevented; };
        const tg = editing.querySelector('.mb-toggle'), head = tg.querySelector('.mb-tg-head');
        placeCaret(head.firstChild, 5);                                    // "Title| words"
        key('Enter');
        out.enterHead = head.textContent === 'Title' && tg.querySelector('.mb-tg-body').firstElementChild.textContent === ' words';
        const last = tg.querySelector('.mb-tg-body').lastElementChild;      // the empty last line
        placeCaret(last, 0);
        key('Enter');
        out.stepOut = tg.nextElementSibling === last && !tg.contains(last);
        out.toc = tocHeadings(editing).includes(head) && tocLevel(head) === 'h2';
        // markdown shortcuts are off in a title, and a heading picked there sets the level
        caretToEnd(head);
        out.levelled = slashInToggleHead('h3') && tg.classList.contains('mb-tg-h3');
        // the arrow, pressed on a closed note: it folds, it is saved, the note does not move
        exitEdit();
        const n = state.notes.find((x) => x.id === 'ba');
        const h2 = els.get('ba').querySelector('.mb-tg-head'), hr = h2.getBoundingClientRect();
        const at = { clientX: hr.left + 6, clientY: hr.top + hr.height / 2, bubbles: true, cancelable: true, button: 0, buttons: 1, pointerId: 91, pointerType: 'mouse' };
        const x0 = n.x;
        h2.dispatchEvent(new PointerEvent('pointerdown', at));
        window.dispatchEvent(new PointerEvent('pointerup', at));
        h2.dispatchEvent(new MouseEvent('click', at));
        out.folded = !els.get('ba').querySelector('.mb-toggle').classList.contains('mb-open') && !/mb-open/.test(n.body);
        out.stayed = n.x === x0;
        // Backspace at the start of the title turns it back into text, the inside under it
        enterEdit(n);
        const h3 = editing.querySelector('.mb-tg-head');
        placeCaret(h3.firstChild, 0);
        out.bs = key('Backspace');
        out.unwrapped = !editing.querySelector('.mb-toggle') && editing.firstElementChild.tagName === 'P' && editing.firstElementChild.textContent === 'Title';
        out.md = noteToMarkdown('<div class="mb-toggle mb-tg-h1"><div class="mb-tg-head">Big</div><div class="mb-tg-body"><p>under</p></div></div>', () => '');
        exitEdit();
        return out;
      });
      ok(r.enterHead, 'Enter in a title takes the words after the caret inside');
      ok(r.stepOut, 'Enter on the empty last line inside steps out of the toggle');
      ok(r.toc, 'a toggle heading is in the table of contents at its level');
      ok(r.levelled, 'a heading chosen on a title sets the toggle\'s level');
      ok(r.folded && r.stayed, 'the arrow folds a closed note\'s toggle, saved, without moving the note: ' + JSON.stringify([r.folded, r.stayed]));
      ok(r.bs && r.unwrapped, 'Backspace at the start of a title turns it back into text');
      ok(/^# Big\n\nunder/.test(r.md), 'a toggle heading goes out to Markdown as a heading with its inside: ' + JSON.stringify(r.md));
    });

    await test('2.9 the block handle: shown beside the hovered block, its menu, a drag, Ctrl+Shift+arrows, duplicate and delete', async () => {
      await fill('<p>alpha</p><p>beta</p><p>gamma</p><p><br></p>');
      const r = await page(async () => {
        const out = {};
        const ps = () => [...editing.querySelectorAll('p')].map((p) => p.textContent).filter(Boolean).join(',');
        const centre = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 4, y: b.top + b.height / 2 }; };
        const beta = [...editing.querySelectorAll('p')][1];
        let c = centre(beta);
        beta.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: c.x, clientY: c.y }));
        const h = $('blockHandle');
        out.shown = !h.classList.contains('hidden') && bh.blk === beta;
        const hit = document.elementFromPoint(c.x, c.y);
        out.why = { win: [innerWidth, innerHeight], at: [Math.round(c.x), Math.round(c.y)], hit: hit && (hit.id || hit.className || hit.tagName), note: [...Object.values(editing.closest('.note').getBoundingClientRect().toJSON())].slice(0, 4).map(Math.round), slash: slash.open, pop: !!dbPopS, blk: !!blockAtPoint(c.x, c.y) };
        // a click on the grip opens the menu, under the grip
        const g = $('bhGrip').getBoundingClientRect();
        const gp = { clientX: g.left + 5, clientY: g.top + 5, button: 0, buttons: 1, bubbles: true, cancelable: true, pointerId: 92, pointerType: 'mouse' };
        $('bhGrip').dispatchEvent(new PointerEvent('pointerdown', gp));
        window.dispatchEvent(new PointerEvent('pointerup', gp));
        const pr = $('dbPop').getBoundingClientRect();
        out.menu = !!dbPopS && Math.abs(pr.top - g.bottom) < 12 && dbPopS.spec.items.some((it) => it.label === t('bh.turnInto'));
        closeDbPop(true);
        // a drag on the grip moves the block to where it is let go: beta below gamma
        beta.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: c.x, clientY: c.y }));
        const g2 = $('bhGrip').getBoundingClientRect();
        const gamma = [...editing.querySelectorAll('p')][2], gr = gamma.getBoundingClientRect();
        const ev = (type, x, y) => new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: 1, bubbles: true, cancelable: true, pointerId: 93, pointerType: 'mouse' });
        $('bhGrip').dispatchEvent(ev('pointerdown', g2.left + 5, g2.top + 5));
        window.dispatchEvent(ev('pointermove', gr.left + 20, gr.top + gr.height * 0.8));
        window.dispatchEvent(ev('pointermove', gr.left + 20, gr.top + gr.height * 0.85));
        window.dispatchEvent(ev('pointerup', gr.left + 20, gr.top + gr.height * 0.85));
        out.dragged = ps();
        // Ctrl+Shift+Up moves the caret's block, the caret with it
        const b2 = [...editing.querySelectorAll('p')].find((p) => p.textContent === 'beta');
        placeCaret(b2.firstChild, 2);
        const k = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
        editing.dispatchEvent(k);
        out.keyed = ps();
        out.caretKept = getSelection().anchorNode === b2.firstChild && getSelection().anchorOffset === 2;
        // duplicate a database: the copy is a database of its own
        const p = document.createElement('div'); p.innerHTML = dbBlockHtml(newDbData('table'));
        editing.prepend(p.firstChild); paintDatabases(editing);
        const db = editing.querySelector('.mb-db');
        const copy = duplicateBlock(db);
        out.dbCopy = copy.dataset.dbid && copy.dataset.dbid !== db.dataset.dbid && adoptDb(copy.getAttribute('data-db')).id === copy.dataset.dbid;
        deleteBlock(copy); deleteBlock(db);
        // delete everything: the note is still something to type in
        [...editing.children].forEach((x) => deleteBlock(x));
        out.emptyOk = editing.children.length === 1 && editing.firstElementChild.tagName === 'P';
        // typing puts the handle away
        editing.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        out.hiddenTyping = h.classList.contains('hidden');
        exitEdit();
        return out;
      });
      ok(r.shown, 'the handle is beside the hovered block: ' + JSON.stringify(r.why));
      ok(r.menu, 'a click on the grip opens the block menu under it');
      ok(r.dragged === 'alpha,gamma,beta', 'a drag on the grip moves the block: ' + r.dragged);
      ok(r.keyed === 'alpha,beta,gamma' && r.caretKept, 'Ctrl+Shift+Up moves the caret\'s block and keeps the caret: ' + JSON.stringify([r.keyed, r.caretKept]));
      ok(r.dbCopy, 'a duplicated database gets an id of its own');
      ok(r.emptyOk, 'deleting every block leaves a line to type on');
      ok(r.hiddenTyping, 'typing puts the handle away');
    });
  },

  /* ---- 2.10: words, the clipboard and pictures edited inside a drawing note;
     the autosave interval; ropes that stand still are not rewritten; the
     phone's pictures carry no hover ring (MAP.md §4z8) ---- */
  async ({ page, test, ok, BOARDS, fs, path }) => {
    await test('2.10 words on a drawing note: typed where pressed, kept on disk, drawn on the board, found by search', async () => {
      const r = await page(async () => {
        const out = {};
        const b = makeBoard('Two-ten');
        state.boards.push(b);
        await switchBoard(b.id);
        const n = addSketch({ x: 0, y: 0 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const svg = $('skSvg'), box = $('skStage').getBoundingClientRect();
        const scr = (x, y) => ({ x: box.left + sk.view.x + x * sk.view.z, y: box.top + sk.view.y + y * sk.view.z });
        const pe = (type, p) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 81, pointerType: 'mouse', clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 });
        // T picks the text tool; a press on the paper opens a box there, with the caret in it
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 't', code: 'KeyT', bubbles: true }));
        out.tool = state.settings.sketchPen.tool;
        svg.dispatchEvent(pe('pointerdown', scr(40, 60))); window.dispatchEvent(pe('pointerup', scr(40, 60)));
        const ta = document.querySelector('.sk-text-in');
        out.box = !!ta && document.activeElement === ta;
        ta.value = 'Due Friday\nask Sam';
        // the drawing's letter keys are letters in the box, and Escape keeps the words
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true, cancelable: true }));
        out.toolKept = state.settings.sketchPen.tool;
        ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        out.open = sketchOpen();
        out.texts = sk.texts.map((x) => [Math.round(x.x), Math.round(x.y), x.text]);
        // a press on the words types in them; emptied, they go; undo brings them back
        svg.dispatchEvent(pe('pointerdown', scr(50, 70))); window.dispatchEvent(pe('pointerup', scr(50, 70)));
        const ta2 = document.querySelector('.sk-text-in');
        out.editing = ta2 && ta2.value;
        ta2.value = '';
        closeSketchText(true);
        out.emptied = sk.texts.length;
        sketchUndo(true);
        out.undone = sk.texts.length;
        closeSketch();
        await saveNow();
        out.board = [...els.get(n.id).querySelectorAll('.sk-text')].map((x) => x.textContent);
        out.search = noteText(n);
        out.healed = okSketch({ title: '', strokes: [], texts: [
          { x: 1, y: 2, size: 20, color: 'red', text: 'ok' }, { x: 'a', y: 0, text: 'bad' }, { x: 0, y: 0, text: '   ' },
          { x: 0, y: 0, text: 5 }, { x: 0, y: 0, color: '<b>', text: 'c' }] }).texts;
        out.id = n.id;
        return out;
      });
      ok(r.tool === 'text', 'T picks the text tool: ' + r.tool);
      ok(r.box, 'a press on the paper opens a focused box');
      ok(r.toolKept === 'text', 'a letter typed in the box is not a tool key: ' + r.toolKept);
      ok(r.open, 'Escape in the box keeps the words and leaves the drawing open');
      ok(r.texts.length === 1 && r.texts[0][0] === 40 && r.texts[0][1] === 60 && r.texts[0][2] === 'Due Friday\nask Sam', 'the words, where pressed: ' + JSON.stringify(r.texts));
      ok(r.editing === 'Due Friday\nask Sam', 'a press on the words types in them');
      ok(r.emptied === 0 && r.undone === 1, 'emptied words go, undo brings them back');
      ok(r.board.length === 1 && r.board[0].includes('Due Friday') && r.board[0].includes('ask Sam'), 'drawn on the board: ' + JSON.stringify(r.board));
      ok(r.search.includes('ask Sam'), 'search finds the words: ' + JSON.stringify(r.search));
      ok(r.healed.length === 2 && r.healed[1].color === 'text', 'nonsense off the disk is dropped: ' + JSON.stringify(r.healed));
      const dir = fs.readdirSync(BOARDS).find((d) => d.startsWith('Two-ten'));
      const note = JSON.parse(fs.readFileSync(path.join(BOARDS, dir, 'board.json'), 'utf8')).notes.find((x) => x.id === r.id);
      ok(note && note.sketch.texts && note.sketch.texts[0].text === 'Due Friday\nask Sam', 'on disk');
    });

    await test('2.10 the clipboard in a drawing note: board notes come in as themselves, outside text as words, its own copy as itself, never onto the board', async () => {
      const r = await page(async () => {
        const out = {};
        const realImg = toSystemClipboardImage;
        let imgs = 0;
        toSystemClipboardImage = async () => { imgs++; return true; };     // never touch the real clipboard
        toSystemClipboard = async () => {};
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        // a text note and a picture note, copied on the board
        const tn = addNote({ x: 2000, y: 0 }, { body: '<h2>Plan</h2><p>one</p>', edit: false });
        const c = document.createElement('canvas'); c.width = 200; c.height = 100; c.getContext('2d').fillRect(0, 0, 200, 100);
        const pn = await addPicture({ x: 2400, y: 0 }, { url: c.toDataURL('image/png'), name: 'box.png' });
        setSelection([tn.id, pn.id], false);
        copySelection(false);
        const n = addSketch({ x: 2000, y: 600 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const key = (code, o) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: code.replace('Key', '').toLowerCase(), code, bubbles: true, cancelable: true }, o)));
        const count = () => sk.pics.length + sk.texts.length + sk.strokes.length;
        const notes0 = state.notes.length;
        // Ctrl+V with no paste event behind it: the board's notes, as what they look like
        key('KeyV', { ctrlKey: true });
        await sleep(300);
        out.fromBoard = { pics: sk.pics.length, texts: sk.texts.map((x) => x.text), sel: sk.sel.size, tool: state.settings.sketchPen.tool };
        // plain text copied outside the app since: words on the page
        sysClipAt = performance.now() + 1;
        const dt = new DataTransfer(); dt.setData('text/plain', 'from outside');
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        out.outside = sk.texts.some((x) => x.text === 'from outside');
        // Ctrl+A, Ctrl+C: the drawing's own copy, and a picture of it for other apps
        key('KeyA', { ctrlKey: true });
        const all = sk.sel.size;
        key('KeyC', { ctrlKey: true });
        await sleep(400);
        out.copied = { all, clip: skClip && skClip.pics.length + skClip.texts.length + skClip.strokes.length, imgs };
        // the drawing's copy is now the newest: a paste carrying older outside text pastes the copy
        const c0 = count();
        const dt2 = new DataTransfer(); dt2.setData('text/plain', 'stale');
        document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt2, bubbles: true, cancelable: true }));
        out.internal = { added: count() - c0, stale: sk.texts.some((x) => x.text === 'stale') };
        // Ctrl+D duplicates the selection; Ctrl+X cuts it; one undo each
        const c1 = count();
        key('KeyD', { ctrlKey: true });
        out.dup = count() - c1;
        const c2 = count();
        key('KeyX', { ctrlKey: true });
        out.cut = c2 - count();
        sketchUndo(true);
        out.cutUndone = count() === c2;
        out.boardUntouched = state.notes.length === notes0;
        closeSketch();
        out.bodyImgs = (n.body.match(/<img/g) || []).length === n.sketch.pics.length;
        toSystemClipboardImage = realImg;
        return out;
      });
      ok(r.fromBoard.pics === 1 && r.fromBoard.texts.includes('Plan\none'), 'a picture note is a picture, a text note its words: ' + JSON.stringify(r.fromBoard));
      ok(r.fromBoard.sel === 2 && r.fromBoard.tool === 'select', 'what was pasted is selected, with the arrow out');
      ok(r.outside, 'text from outside the app becomes words');
      ok(r.copied.all === r.copied.clip && r.copied.all === 3 && r.copied.imgs === 1, 'Ctrl+A, Ctrl+C: all of it, and one picture for other apps: ' + JSON.stringify(r.copied));
      ok(r.internal.added === 3 && !r.internal.stale, 'the newer copy wins: ' + JSON.stringify(r.internal));
      ok(r.dup === 3 && r.cut === 3 && r.cutUndone, 'duplicate and cut: ' + JSON.stringify([r.dup, r.cut, r.cutUndone]));
      ok(r.boardUntouched, 'nothing lands on the board behind the drawing');
      ok(r.bodyImgs, 'every picture\'s file is in the note\'s body');
    });

    await test('2.10 a picture in a drawing note: edited over it in full screen — crop, black and white — Escape closes only the editor, undo takes it back', async () => {
      const r = await page(async () => {
        const out = {};
        const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
        const n = addSketch({ x: 2000, y: 1400 });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const c = document.createElement('canvas'); c.width = 300; c.height = 200;
        const g = c.getContext('2d');
        ['#e33', '#3a3', '#33e'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 100, 0, 100, 200); });
        await sketchImport([{ name: 'bars.png', kind: 'image', ext: 'png', dataUrl: c.toDataURL('image/png') }], { x: 0, y: 0 });
        const p0 = sk.pics[0];
        state.settings.sketchPen = healSketchPen({ tool: 'select', color: 'text', size: 1 }); buildSketchBar();
        sk.sel = new Set([p0]); drawSketchStrokes();
        const btn = $('skBar').querySelector('[data-sk="editpic"]');
        out.enabled = !btn.disabled;
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
        await sleep(500);
        out.inside = !$('studio').classList.contains('hidden') && $('studio').parentNode === $('sketchDlg');
        out.phoneOn = padHost().kind;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        out.escape = { studio: $('studio').classList.contains('hidden'), sketch: sketchOpen(), home: $('studio').parentNode === document.body };
        editSketchPicture(sk.pics[0]);
        await sleep(500);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', bubbles: true, cancelable: true }));
        out.adjust = ST.tool === 'adjust' && !$('stAdjust').classList.contains('hidden');
        // a slider dragged is one undo step and keeps where it was dragged to
        const steps0 = ST.undo.length, sat = $('stSat');
        sat.value = 40; sat.dispatchEvent(new Event('input'));
        sat.value = 30; sat.dispatchEvent(new Event('input')); sat.dispatchEvent(new Event('change'));
        out.slider = { s: ST.adj.s, shown: sat.value, steps: ST.undo.length - steps0 };
        studioUndo(true);
        out.sliderUndone = ST.adj.s;
        $('stGray').click();
        studioStep(); ST.crop = { x: 0, y: 0, w: 150, h: 200 };
        applyStudio();
        await sleep(1200);
        const p1 = sk.pics[0];
        out.after = { w: p1.w, h: p1.h, edited: /edited/.test(p1.url) && p1.url !== p0.url, body: n.body.includes(p1.url.replace(/&/g, '&amp;')) };
        const img = new Image(); img.src = await toDataUrl(p1.url); await img.decode();
        const k = document.createElement('canvas'); k.width = img.naturalWidth; k.height = img.naturalHeight;
        const kg = k.getContext('2d'); kg.drawImage(img, 0, 0);
        const px = kg.getImageData(10, 10, 1, 1).data;
        out.size = [img.naturalWidth, img.naturalHeight];
        out.gray = Math.abs(px[0] - px[1]) < 4 && Math.abs(px[1] - px[2]) < 4;
        sketchUndo(true);
        out.undone = sk.pics[0].url === p0.url && sk.pics[0].h === p0.h;
        closeSketch();
        return out;
      });
      ok(r.enabled, 'Edit picture is on with one picture selected');
      ok(r.inside, 'the picture editor opens inside the full-screen drawing');
      ok(r.phoneOn === 'studio', 'a paired phone draws in the picture editor while it is open: ' + r.phoneOn);
      ok(r.escape.studio && r.escape.sketch && r.escape.home, 'Escape closes the editor, not the drawing: ' + JSON.stringify(r.escape));
      ok(r.adjust, 'J is the colours tool, and its panel shows');
      ok(r.slider.s === 30 && r.slider.shown === '30' && r.slider.steps === 1 && r.sliderUndone === 100, 'a slider drag is one step and stays put: ' + JSON.stringify([r.slider, r.sliderUndone]));
      ok(r.after.edited && r.after.w === 300 && r.after.h === 400 && r.after.body, 'the edited copy takes its place, the width kept and the shape the crop\'s: ' + JSON.stringify(r.after));
      ok(r.size[0] === 150 && r.size[1] === 200 && r.gray, 'cropped and black and white in the pixels: ' + JSON.stringify([r.size, r.gray]));
      ok(r.undone, 'one undo puts the original back');
    });

    await test('2.10 the autosave interval is a setting: 4, 5, 6 or 10 minutes, kept, and anything else is 5', async () => {
      const r = await page(async () => {
        const t0 = autosaveTimer;
        $('autosaveSeg').querySelector('[data-autosave="6"]').click();
        const out = { set: state.settings.autosaveMin, restarted: autosaveTimer !== t0, on: $('autosaveSeg').querySelector('.on').dataset.autosave,
          label: $('autosaveSeg').querySelector('[data-autosave="10"]').textContent };
        await saveNow();
        out.payload = settingsPayload().settings.autosaveMin;
        out.choices = AUTOSAVE_MINUTES.join(',');
        $('autosaveSeg').querySelector('[data-autosave="5"]').click();
        return out;
      });
      ok(r.set === 6 && r.on === '6' && r.restarted, 'chosen, shown, and the clock restarted: ' + JSON.stringify(r));
      ok(r.payload === 6, 'kept with the settings');
      ok(r.choices === '4,5,6,10' && /10/.test(r.label), 'the four choices, labelled: ' + r.label);
      const st = fs.readFileSync(path.join(BOARDS, 'settings.json'), 'utf8');
      ok(/"autosaveMin":\s*[56]/.test(st), 'on disk');
    });

    await test('2.10 a pan rewrites no rope that did not move; a moved note\'s rope does follow', async () => {
      const r = await page(async () => {
        const a = addNote({ x: 6000, y: 0 }, { edit: false }), b = addNote({ x: 6600, y: 300 }, { edit: false });
        state.links.push({ id: uid(), from: a.id, to: b.id });
        state.view = { x: -5800, y: 100, z: 1 }; applyView(); drawLinks();
        const writes = [];
        const mo = new MutationObserver((m) => writes.push(...m));
        mo.observe($('linksInner'), { attributes: true, subtree: true });
        for (let i = 0; i < 5; i++) { state.view.x -= 10; applyView(); drawLinks(); }
        await new Promise((res) => setTimeout(res, 0));
        const still = writes.length;
        a.x += 40; drawLinks(new Set([a.id]));
        await new Promise((res) => setTimeout(res, 0));
        mo.disconnect();
        return { still, moved: writes.length - still };
      });
      ok(r.still === 0, 'standing ropes are left alone on a pan: ' + r.still + ' attribute writes');
      ok(r.moved > 0, 'a moved note\'s rope is redrawn');
    });

    await test('2.10 the hover ring is on this screen and never in the pictures the phone is sent', async () => {
      const r = await page(async () => {
        const was = padInfo;
        padInfo = { state: 'connected' };
        showPadCursor(0.5, 0.5);
        padShot.busy = false; padShot.dirty = true;
        const going = padPump();
        await new Promise((res) => requestAnimationFrame(res));
        const during = $('padCursor').style.visibility;
        await going;
        const after = $('padCursor').style.visibility;
        hidePadCursor();
        padInfo = was; padShot.busy = false;
        return { during, after };
      });
      ok(r.during === 'hidden' && r.after === '', 'hidden while the picture is taken, back after: ' + JSON.stringify(r));
    });
  },

  /* ---- 2.11: the far-zoom canvas (far.js, MAP.md §4c) ----
     Below FAR_Z a big board is one <canvas>, not thousands of DOM stubs. What
     can break: notes still mounted (the stall comes back), a press that finds
     nothing (the board goes dead at far zoom), and a small board or a lighter
     tier drawn differently from before. Each of these was checked by breaking
     it: mounting stubs again fails the first, dropping farNoteAt() from the
     pointer routing fails the second. */
  async ({ page, test, ok, sleep }) => {
    await page(async () => {
      confirmDlg = async () => true;
      const b = makeBoard('Far');
      // well over the culling threshold on every tier: rows of notes, each tied to its neighbour
      const COLS = 20, N = Math.max(160, CULL_MIN.full * 3);
      for (let i = 0; i < N; i++) {
        b.notes.push({ id: 'f' + i, x: (i % COLS) * 400, y: Math.floor(i / COLS) * 360, w: 260, h: 200, z: i + 1,
          color: COLORS[i % COLORS.length], status: i % 3 ? '' : 'done', body: `<h3>note ${i}</h3><p>words on the far zoom canvas ${i}</p>` });
      }
      for (let i = 0; i + 1 < N; i++) if ((i + 1) % COLS) b.links.push({ id: 'fl' + i, from: 'f' + i, to: 'f' + (i + 1) });
      state.boards.push(b);
      await switchBoard(b.id);
      // straight ropes from the facing edges, so a rope's middle is in the gap; no guides to nudge a drag
      window.__farWas = { style: state.settings.linkStyle, anchor: state.settings.linkAnchor, guides: state.settings.guides };
      state.settings.linkStyle = 'straight'; state.settings.linkAnchor = 'edge'; state.settings.guides = false; applySettings();
      window.__farSee = (z) => {
        const r = vpRect();
        state.view = { z, x: r.width / 2 - 2000 * z, y: r.height / 2 - 1500 * z };
        applyView();
        lastScaleAt = 0;              // as if the wheel had been still for a while
        syncMounted();
      };
      window.__farAt = (id, fx, fy) => {
        const n = state.notes.find((x) => x.id === id), r = vpRect();
        const s = toScreen(n.x + n.w * (fx == null ? .5 : fx), n.y + n.h * (fy == null ? .5 : fy));
        return { x: s.x + r.left, y: s.y + r.top };
      };
      window.__farPress = (type, p, extra) => {
        const t = type === 'pointerdown' ? $('viewport') : window;
        t.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: p.x, clientY: p.y, pointerId: 11 }, extra || {})));
      };
    });

    await test('2.11 below FAR_Z a big board is one canvas: no note and no rope in the document, every note on screen drawn', async () => {
      const r = await page(() => {
        __farSee(FAR_Z[document.body.dataset.perf] * .5);
        drawFar();
        const notes = [...els.values()].filter((el) => el.classList.contains('note')).length;
        const cv = $('farCanvas'), ctx = cv.getContext('2d'), dpr = cv.width / vpRect().width;
        const p = __farAt('f45', .5, .1), r = vpRect();
        const px = ctx.getImageData(Math.round((p.x - r.left) * dpr), Math.round((p.y - r.top) * dpr), 1, 1).data;
        return { far: farMode, shown: farShown, notes, ropes: linkEls.size, svg: $('linksInner').childElementCount, alpha: px[3], ms: farLastDraw };
      });
      ok(r.far && r.shown, 'far zoom with the canvas showing: ' + JSON.stringify(r));
      ok(r.notes === 0 && r.ropes === 0 && r.svg === 0, 'nothing mounted: ' + JSON.stringify(r));
      ok(r.alpha > 200, 'the note is painted on the canvas: alpha ' + r.alpha);
    });

    await test('2.11 at far zoom a press selects and drags a canvas note, Shift adds one, and none of it mounts them', async () => {
      const r = await page(() => {
        clearSelection();
        const n = state.notes.find((x) => x.id === 'f45'), x0 = n.x, y0 = n.y, z = state.view.z;
        const p = __farAt('f45');
        __farPress('pointerdown', p);
        __farPress('pointermove', { x: p.x + 20, y: p.y + 10 });
        __farPress('pointermove', { x: p.x + 40, y: p.y + 20 });
        __farPress('pointerup', { x: p.x + 40, y: p.y + 20 });
        const moved = { dx: Math.round((n.x - x0) * z), dy: Math.round((n.y - y0) * z) };
        const sel1 = [...selection];
        __farPress('pointerdown', __farAt('f48'), { shiftKey: true });
        __farPress('pointerup', __farAt('f48'), { shiftKey: true });
        syncMounted();
        return { moved, sel1, sel2: [...selection].sort(), mounted: els.has('f45') || els.has('f48') };
      });
      ok(r.sel1.length === 1 && r.sel1[0] === 'f45', 'selected by a press: ' + r.sel1);
      ok(Math.abs(r.moved.dx - 40) <= 2 && Math.abs(r.moved.dy - 20) <= 2, 'dragged with the pointer: ' + JSON.stringify(r.moved));
      ok(r.sel2.join() === 'f45,f48', 'Shift adds: ' + r.sel2);
      ok(!r.mounted, 'still drawn on the canvas, not mounted');
    });

    await test('2.11 at far zoom the lasso, the right-click menu and a double-click reach canvas notes', async () => {
      const r = await page(() => {
        const out = {};
        // the lasso, from the gap between rows to the far side of two notes
        const a = __farAt('f61', -.05, -.05), b = __farAt('f62', .5, .5);
        __farPress('pointerdown', a); __farPress('pointermove', b); __farPress('pointerup', b);
        out.lasso = [...selection].sort();
        // right-click
        const p = __farAt('f63');
        $('viewport').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: p.x, clientY: p.y }));
        out.menu = !$('ctxMenu').classList.contains('hidden');
        out.acts = [...document.querySelectorAll('#ctxMenu .cm-item')].map((x) => x.dataset.act);
        out.menuSel = [...selection];
        closeCtxMenu();
        // double-click opens it to type in, mounted and pinned while it is open
        $('viewport').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
        out.edit = editNote && editNote.id;
        out.editing = !!(els.get('f63') && els.get('f63').classList.contains('editing'));
        syncMounted();
        out.kept = els.has('f63');
        exitEdit(); syncMounted();
        out.after = els.has('f63');
        return out;
      });
      ok(r.lasso.join() === 'f61,f62', 'the lasso took the two notes in its box: ' + r.lasso);
      ok(r.menu && r.acts.includes('icon') && r.acts.includes('del') && r.menuSel[0] === 'f63', 'the note\'s own menu: ' + JSON.stringify(r));
      ok(r.edit === 'f63' && r.editing && r.kept, 'double-click edits it, and the sweep keeps it: ' + JSON.stringify(r));
      ok(!r.after, 'closed, it goes back to the canvas');
    });

    await test('2.11 at far zoom a rope on the canvas is followed by a press and has its own right-click menu', async () => {
      const r = await page(async () => {
        clearSelection();
        // the straight rope f80 → f81 crosses the gap between them
        const a = state.notes.find((x) => x.id === 'f80'), rr = vpRect();
        const s = toScreen(a.x + a.w + 40, a.y + a.h / 2), p = { x: s.x + rr.left, y: s.y + rr.top };
        const hit = farRopeAt(p.x, p.y);
        $('viewport').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: p.x, clientY: p.y }));
        const goes = [...document.querySelectorAll('#ctxMenu .cm-go')].map((x) => x.dataset.note).sort();
        const icon = !!document.querySelector('#ctxMenu [data-act="icon"]');
        closeCtxMenu();
        __farPress('pointerdown', p); __farPress('pointerup', p);
        await new Promise((res) => setTimeout(res, 900));
        return { hit: hit && hit.id, goes, icon, sel: [...selection], z: state.view.z };
      });
      ok(r.hit === 'fl80', 'the hit test finds the rope: ' + r.hit);
      ok(r.goes.join() === 'f80,f81' && !r.icon, 'the rope menu, not the note menu: ' + JSON.stringify(r));
      ok(r.sel.length === 1 && r.sel[0] === 'f81', 'flew to the far end: ' + r.sel);
    });

    await test('2.11 leaving far zoom mounts the notes back a few a frame, and the canvas goes when they are all in', async () => {
      const r = await page(async () => {
        __farSee(FAR_Z[document.body.dataset.perf] * .5);
        __farSee(1);
        const first = [...els.values()].filter((el) => el.classList.contains('note')).length;
        for (let i = 0; i < 240 && farShown; i++) await new Promise((res) => requestAnimationFrame(res));
        const v = state.view, vr = vpRect();
        const V = { x0: -v.x / v.z, y0: -v.y / v.z, x1: (vr.width - v.x) / v.z, y1: (vr.height - v.y) / v.z };
        const onScreen = state.notes.filter((n) => inRect(n, V));
        const missing = onScreen.filter((n) => !els.has(n.id) || els.get(n.id).dataset.stub).map((n) => n.id);
        return { first, want: onScreen.length, missing, shown: farShown, far: farMode, ropes: linkEls.size };
      });
      ok(!r.far && !r.shown, 'out of far zoom, canvas gone: ' + JSON.stringify(r));
      ok(r.want > 0 && !r.missing.length && r.ropes > 0, 'every note on screen is a finished note again, the ropes are SVG: ' + JSON.stringify(r));
    });

    await test('2.11 a small board is untouched by it, and the Light tier starts it at its own FAR_Z', async () => {
      const r = await page(async () => {
        const out = {};
        const was = state.settings.perf;
        state.settings.perf = 'lite'; applySettings(); updateCulling();
        __farSee(FAR_Z.lite - .05);
        out.lite = { far: farMode, shown: farShown, notes: [...els.values()].filter((el) => el.classList.contains('note')).length };
        __farSee(FAR_Z.lite + .05);
        out.liteAbove = { far: farMode };
        state.settings.perf = was; applySettings();
        // a board under cullMin(): same zoom, every note mounted, no canvas
        const s = makeBoard('Small far');
        for (let i = 0; i < 8; i++) s.notes.push({ id: 's' + i, x: i * 300, y: 0, w: 240, h: 160, z: 1, color: 'default', body: '<p>s</p>' });
        state.boards.push(s);
        await switchBoard(s.id);
        __farSee(.1);
        out.small = { culling, far: farMode, shown: farShown, notes: [...els.values()].filter((el) => el.classList.contains('note')).length };
        state.settings.linkStyle = __farWas.style; state.settings.linkAnchor = __farWas.anchor; state.settings.guides = __farWas.guides; applySettings();
        return out;
      });
      ok(r.lite.far && r.lite.shown && r.lite.notes === 0, 'Light: canvas below its FAR_Z: ' + JSON.stringify(r.lite));
      ok(!r.liteAbove.far, 'Light: and not above it');
      ok(!r.small.culling && !r.small.far && !r.small.shown && r.small.notes === 8, 'small board as before: ' + JSON.stringify(r.small));
    });
  },
  /* ---- 3.0: Escape, pictures out, stable ink, Handwrite it, books, the wallpaper, the options screen ---- */
  async ({ page, test, ok }) => {
    await page(() => { if (sketchOpen()) closeSketch(); if (bookOpen()) closeBook(); closeSettings(); clearSelection(); });

    await test('3.0 Escape with nothing to back out of opens Settings, and the next closes it', async () => {
      const r = await page(async () => {
        const esc = () => $('viewport').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        $('viewport').focus();
        esc();
        const opened = !$('settings').classList.contains('hidden');
        esc();
        const closed = $('settings').classList.contains('hidden');
        // a selection is let go first, as before
        const n = addNote({ x: 9400, y: 9400 }, { edit: false });
        setSelection([n.id], false);
        esc();
        const keptShut = $('settings').classList.contains('hidden') && !selection.size;
        return { opened, closed, keptShut };
      });
      ok(r.opened && r.closed && r.keptShut, JSON.stringify(r));
    });

    await test('3.0 a picture goes out as a PNG: the menu row, Ctrl+C on a lone picture, and a drawing as itself', async () => {
      const r = await page(async (png) => {
        const real = toSystemClipboardImage;
        const got = [];
        toSystemClipboardImage = async (blob) => { got.push(blob.type + ':' + blob.size); return true; };     // never the real clipboard
        try {
          const n = addNote({ x: 9600, y: 9600 }, { pic: true, ar: 1, body: picBody(png, 'dot.png'), w: 80, h: 80, edit: false });
          const viaMenu = await copyPictureOut(notePictureSrc(n));
          setSelection([n.id], false);
          copySelection(false);
          await new Promise((res) => setTimeout(res, 200));
          const internal = clipboard.length === 1 && lastCopy.board > sysClipAt;
          const s = addNote({ x: 9800, y: 9600 }, { sketch: { title: 'out', strokes: [{ id: 'o1', tool: 'pen', color: 'red', size: 3, pts: [0, 0, 40, 40] }] }, w: 200, h: 160, edit: false });
          const viaSketch = await copySketchOut(s);
          openCtxMenu(100, 100, n.id);
          const row = !!document.querySelector('#ctxMenu [data-act="copyPic"]');
          closeCtxMenu();
          return { viaMenu, viaSketch, got, internal, row };
        } finally { toSystemClipboardImage = real; }
      }, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
      ok(r.viaMenu && r.viaSketch && r.row, 'copied: ' + JSON.stringify(r));
      ok(r.got.length === 3 && r.got.every((x) => x.startsWith('image/png:')), 'three PNGs to the clipboard: ' + r.got);
      ok(r.internal, 'the board still has its own copy, and it is the newer one');
    });

    await test('3.0 on Light paper the ink keeps its colour when the theme turns dark', async () => {
      const r = await page(async () => {
        const was = state.settings.theme, paper = state.settings.sketchPaper;
        const n = addNote({ x: 10000, y: 9600 }, { sketch: { title: 'ink', strokes: [{ id: 'k1', tool: 'pen', color: 'text', size: 3, pts: [0, 0, 40, 40] }, { id: 'k2', tool: 'pen', color: 'red', size: 3, pts: [0, 40, 40, 0] }] }, w: 200, h: 160, edit: false });
        const read = () => { const el = ensureMounted(n.id); return [...el.querySelectorAll('.ink')].map((p) => getComputedStyle(p).stroke); };
        const out = {};
        for (const paperKind of ['light', 'note']) {
          state.settings.sketchPaper = paperKind;
          pickTheme('paper'); applySettings(); const day = read();
          pickTheme('dark'); applySettings(); const night = read();
          out[paperKind] = { day, night };
        }
        state.settings.sketchPaper = paper; pickTheme(was); applySettings();
        return Object.assign(out, { hex: [sketchInkHex('text'), sketchInkHex('red')] });
      });
      ok(r.light.day.join() === r.light.night.join(), 'Light paper: the same in both themes: ' + JSON.stringify(r.light));
      ok(r.light.day[0] === 'rgb(28, 28, 28)', 'black is black: ' + r.light.day[0]);
      ok(r.note.day[0] !== r.note.night[0], '"the note\'s colour" still lets the theme decide: ' + JSON.stringify(r.note));
    });

    await test('3.0 Handwrite it: the background goes, a line is drawn, a fill is kept, a word is written in a hand', async () => {
      const r = await page(async () => {
        // a white picture with a thin black line, a thin blue curve, and a big pale fill
        const W = 400, H = 300, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, 40); g.lineTo(380, 40); g.stroke();
        g.strokeStyle = '#2050d0'; g.beginPath(); g.arc(80, 200, 40, 0, Math.PI); g.stroke();
        g.fillStyle = '#f6dce8'; g.fillRect(200, 120, 160, 150);
        const A = hwAnalyse(g.getImageData(0, 0, W, H), W, H, []);
        const black = A.paths.find((p) => p.color === 'text' && p.w < 6);
        const blue = A.paths.find((p) => /^#/.test(p.color) && parseInt(p.color.slice(5, 7), 16) > 150);
        // a word, traced in the hand and placed in its box
        const strokes = hwWordStrokes({ t: 'hello', box: { x: 10, y: 10, w: 120, h: 40 }, color: [20, 20, 20], stroke: 4 }, { h: 40, rtl: false }, 1, (x, y) => [x, y]);
        let x0 = Infinity, x1 = -Infinity;
        for (const s of strokes) for (let i = 0; i < s.pts.length; i += 2) { x0 = Math.min(x0, s.pts[i]); x1 = Math.max(x1, s.pts[i]); }
        const pick = hwBestReading([{ lang: 'en-US', lines: [{ words: [{ t: 'Özd#' }, { t: 'swilar' }] }] }, { lang: 'tr', lines: [{ words: [{ t: 'Özdeş' }, { t: 'sıvılar' }] }] }], 'en-US');
        return { bg: A.bg.slice(0, 3), paths: A.paths.length, black: !!black, blue: !!blue, cut: A.cut && [A.cut.x, A.cut.y, A.cut.w, A.cut.h], words: strokes.length, x0, x1, ink: strokes[0] && strokes[0].color, lang: pick.lang };
      });
      ok(r.bg.join() === '255,255,255', 'the background is the edge colour: ' + r.bg);
      ok(r.black && r.blue, 'the black line and the blue curve are drawn, in their colours: ' + JSON.stringify(r));
      ok(r.cut && Math.abs(r.cut[0] - 200) < 6 && Math.abs(r.cut[2] - 160) < 10, 'the pale fill is kept, cut to itself: ' + r.cut);
      ok(r.words > 2 && r.x0 >= 8 && r.x1 <= 10 + 120 * 1.25, 'the word is written where it was: ' + JSON.stringify(r));
      ok(r.ink === 'text', 'black text becomes the paper\'s ink');
      ok(r.lang === 'tr', 'the reading with real letters wins: ' + r.lang);
    });

    await test('3.0 a book: a notebook made, written in, a page added, kept through a save and a reload', async () => {
      const r = await page(async () => {
        const n = addNotebook({ x: 10400, y: 9600 });
        // the reader lays itself out two frames after it opens, once the window has its size
        for (let i = 0; i < 4; i++) await new Promise((res) => requestAnimationFrame(res));
        const open = bookOpen() && !!document.querySelector('#bkSpread .bk-page');
        // a stroke on the first page through the reader's own pointer path
        bk.tool = 'pen';
        const pg = document.querySelector('#bkSpread .bk-page');
        const R = pg.getBoundingClientRect();
        const at = (fx, fy, type, buttons) => new PointerEvent(type, { bubbles: true, clientX: R.left + R.width * fx, clientY: R.top + R.height * fy, pointerId: 31, pointerType: 'mouse', button: 0, buttons });
        pg.dispatchEvent(at(0.2, 0.2, 'pointerdown', 1));
        for (let i = 1; i < 12; i++) window.dispatchEvent(at(0.2 + i * 0.03, 0.2 + i * 0.01, 'pointermove', 1));
        window.dispatchEvent(at(0.55, 0.3, 'pointerup', 0));
        bookAddPage();
        const pages = n.book.pages, at0 = bk.at;
        bookGo(-1);
        closeBook();
        const healed = okBook(JSON.parse(JSON.stringify(n.book)));
        syncActiveBoard();
        const board = adoptBoard(JSON.parse(JSON.stringify(boardPayload(activeBoard()))));
        const back = board.notes.find((x) => x.id === n.id);
        return { open, ink: (n.book.ink[0] || []).length, pages, at0, kept: back && back.book && back.book.pages, keptInk: back && (back.book.ink[0] || []).length, healed: healed.pages, title: noteTitle(n) };
      });
      ok(r.open, 'it opens on a page');
      ok(r.ink === 1 && r.keptInk === 1, 'the stroke is on page one, and survives the round trip: ' + JSON.stringify(r));
      ok(r.pages === 13 && r.at0 === 12 && r.kept === 13 && r.healed === 13, 'a page added and kept: ' + JSON.stringify(r));
    });

    await test('3.0 a book from a PDF: the file in the board, its pages counted, a page drawn when shown', async () => {
      const r = await page(async (b64) => {
        const att = await FILES.attachBytes('data:application/pdf;base64,' + b64, state.activeBoard, 'worksheet.pdf');
        const doc = await bookOpenPdf(att.url);
        const pages = doc.numPages;
        doc.destroy();
        const n = addNote({ x: 10800, y: 9600 }, { book: { title: 'worksheet', kind: 'pdf', pages, ar: 792 / 612, paper: 'plain' }, body: bookBody('', att.url, 'worksheet.pdf'), w: 220, h: 330, edit: false });
        const inBody = notesFileUrls([n]).includes(att.url);
        openBook(n.id);
        for (let i = 0; i < 60 && !(bk.cache && bk.cache.size); i++) await new Promise((res) => setTimeout(res, 100));
        const c = document.querySelector('#bkSpread canvas');
        const px = c ? c.getContext('2d').getImageData(0, 0, c.width, c.height).data : [];
        let dark = 0;
        for (let i = 0; i < px.length; i += 4) if (px[i] < 100) dark++;
        bk.view = 'scroll'; bookLayout();
        const slots = document.querySelectorAll('#bkScroll .bk-slot').length;
        closeBook();
        return { pages, inBody, dark, slots };
      }, require('./fake-pdf.js')().toString('base64'));
      ok(r.pages === 2 && r.inBody, 'two pages, and the PDF is one of the board\'s files: ' + JSON.stringify(r));
      ok(r.dark > 50, 'page one was drawn: ' + r.dark);
      ok(r.slots === 2, 'the scroll view lays out every page');
    });

    // 3.0.2, MAP.md §4z9: a book has the drawing note's camera, and a paired phone draws, pans, zooms and turns in it
    await test('3.0.2 a book: Space drags it, Ctrl+wheel zooms at the pointer, the phone draws, pans, zooms and turns it', async () => {
      const r = await page(async () => {
        const frames = async (k) => { for (let i = 0; i < k; i++) await new Promise((res) => requestAnimationFrame(res)); };
        const n = addNotebook({ x: 11200, y: 9600 });
        await frames(4);
        bk.tool = 'pen';
        const stage = $('bkStage'), S = stage.getBoundingClientRect();
        const pe = (type, x, y, extra) => new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 41, pointerType: 'mouse', button: 0, buttons: 1 }, extra));
        const out = { fit: bk.cam.z };
        // Space held: a press drags the pages and writes nothing, even with the pen out
        const c0 = Object.assign({}, bk.cam);
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true }));
        const pg = document.querySelector('#bkSpread .bk-page');
        pg.dispatchEvent(pe('pointerdown', S.left + 300, S.top + 200));
        window.dispatchEvent(pe('pointermove', S.left + 360, S.top + 230));
        window.dispatchEvent(pe('pointerup', S.left + 360, S.top + 230, { buttons: 0 }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true }));
        out.space = { dx: bk.cam.x - c0.x, dy: bk.cam.y - c0.y, ink: Object.keys(bk.ink).length };
        // Ctrl+wheel: closer, and the point under the pointer stays under it
        const px = S.left + S.width / 2 + 40, py = S.top + S.height / 2;
        const c1 = Object.assign({}, bk.cam);
        const wx = (px - S.left - c1.x) / c1.z, wy = (py - S.top - c1.y) / c1.z;
        stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -200, clientX: px, clientY: py }));
        const c2 = bk.cam;
        out.wheel = { z: c2.z, drift: Math.hypot(S.left + c2.x + wx * c2.z - px, S.top + c2.y + wy * c2.z - py) };
        // the hand drags too, and a drag does not turn the page
        bk.tool = 'hand'; buildBookBar();
        const c3 = Object.assign({}, bk.cam), at3 = bk.at;
        document.querySelector('#bkSpread .bk-page').dispatchEvent(pe('pointerdown', S.left + S.width / 2 + 100, S.top + 300));
        window.dispatchEvent(pe('pointermove', S.left + S.width / 2 + 40, S.top + 260));
        window.dispatchEvent(pe('pointerup', S.left + S.width / 2 + 40, S.top + 260, { buttons: 0 }));
        out.hand = { dx: bk.cam.x - c3.x, dy: bk.cam.y - c3.y, at: bk.at === at3 };
        bookFit();
        // the phone: what it is on, its pan, its zoom
        onPadMessage({ t: 'size', a: 0.5, px: 1080 });
        out.kind = padHost().kind;
        const c4 = Object.assign({}, bk.cam), p = padRect();
        onPadMessage({ t: 'pan', dx: 0.05, dy: 0.02, n: 1 });
        out.pan = { dx: bk.cam.x - c4.x - 0.05 * p.w, dy: bk.cam.y - c4.y - 0.02 * p.h };
        onPadMessage({ t: 'zoom', f: 1.5, x: 0.5, y: 0.5, n: 2 });
        out.zoom = bk.cam.z;
        bookFit();
        await frames(2);
        // a phone line lands on the page under the pen, in that page's units
        const P = padRect(), R = stage.getBoundingClientRect();
        const cx = R.left + P.x + 0.75 * P.w, cy = R.top + P.y + 0.4 * P.h;
        const under = [...document.querySelectorAll('#bkSpread > .bk-side > .bk-page')].find((e) => { const q = e.getBoundingClientRect(); return cx >= q.left && cx <= q.right && cy >= q.top && cy <= q.bottom; });
        const ur = under && under.getBoundingClientRect();
        const page = under ? +under.dataset.p : -1;
        onPadMessage({ t: 'down', id: 'b1', x: 0.75, y: 0.4, p: 0.3, tool: 'brush', size: 1, color: 'red', k: 1 });
        const pts = [];
        for (let i = 1; i <= 8; i++) pts.push(0.75 + i * 0.01, 0.4 + i * 0.005, 0.3 + i * 0.05);
        onPadMessage({ t: 'move', id: 'b1', pts });
        onPadMessage({ t: 'up', id: 'b1' });
        const s = (bk.ink[page] || [])[0];
        const want = ur ? { x: (cx - ur.left) / (ur.width / BOOK_U), y: (cy - ur.top) / (ur.width / BOOK_U) } : { x: NaN, y: NaN };
        out.line = { page, n: (bk.ink[page] || []).length, tool: s && s.tool, ws: !!(s && s.ws), off: s ? Math.hypot(s.pts[0] - want.x, s.pts[1] - want.y) : -1, kept: (n.book.ink[page] || []).length, inked: Object.keys(bk.ink), cx, cy, R: [R.left, R.top, R.width, R.height], P };
        onPadMessage({ t: 'undo' });
        out.undone = (bk.ink[page] || []).length;
        const at5 = bk.at;
        onPadMessage({ t: 'page', d: 1 });
        await new Promise((res) => setTimeout(res, 900));
        out.turned = bk.at !== at5;
        // the scroll view has the same camera: Space-free, the plain wheel moves it down the column
        bk.view = 'scroll'; bookLayout();
        const c6 = Object.assign({}, bk.cam);
        stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 300, clientX: px, clientY: py }));
        out.scroll = { moved: c6.y - bk.cam.y, filled: document.querySelectorAll('#bkScroll .bk-page').length };
        bk.view = 'book';
        closeBook();
        out.after = padHost().kind;
        return out;
      });
      ok(r.fit === 1, 'it opens at 100%');
      ok(r.space.dx === 60 && r.space.dy === 30 && r.space.ink === 0, 'Space drags the pages and writes nothing: ' + JSON.stringify(r.space));
      ok(r.wheel.z > 1 && r.wheel.drift < 1, 'Ctrl+wheel zooms at the pointer: ' + JSON.stringify(r.wheel));
      ok(r.hand.dx === -60 && r.hand.dy === -40 && r.hand.at, 'the hand drags without turning: ' + JSON.stringify(r.hand));
      ok(r.kind === 'book' && r.after === 'board', 'the phone is on the book while it is open: ' + r.kind + ' / ' + r.after);
      ok(Math.abs(r.pan.dx) < 0.5 && Math.abs(r.pan.dy) < 0.5, 'the phone pans the pages: ' + JSON.stringify(r.pan));
      ok(Math.abs(r.zoom - 1.5) < 0.01, 'the phone zooms them: ' + r.zoom);
      ok(r.line.page >= 0 && r.line.n === 1 && r.line.tool === 'brush' && r.line.ws && r.line.off < 1 && r.line.kept === 1, 'a phone line on the page under the pen, kept: ' + JSON.stringify(r.line));
      ok(r.undone === 0, 'the phone\'s undo is the book\'s');
      ok(r.turned, 'the phone turns the page');
      ok(r.scroll.moved > 100 && r.scroll.filled > 0, 'the scroll view moves with the wheel and fills what it shows: ' + JSON.stringify(r.scroll));
    });

    await test('3.0 the wallpaper: rain and snow draw, a YouTube link waits for a link, none clears it', async () => {
      const r = await page(async () => {
        const was = { kind: state.settings.wpKind, url: state.settings.wpUrl };
        const out = {};
        state.settings.wpKind = 'rain'; applySettings();
        await new Promise((res) => setTimeout(res, 300));
        out.rain = { shown: !$('wallpaper').classList.contains('hidden'), drops: wp.drops.length };
        state.settings.wpKind = 'snow'; applySettings();
        await new Promise((res) => setTimeout(res, 300));
        out.snow = { flakes: wp.flakes.length };
        state.settings.wpKind = 'youtube'; state.settings.wpUrl = 'not a link'; applySettings();
        out.badLink = !$('wallpaper').classList.contains('hidden');
        state.settings.wpKind = 'none'; applySettings();
        out.none = $('wallpaper').classList.contains('hidden') && !wp.raf;
        state.settings.wpKind = was.kind; state.settings.wpUrl = was.url; applySettings();
        return out;
      });
      ok(r.rain.shown && r.rain.drops > 0 && r.snow.flakes > 0, 'it draws: ' + JSON.stringify(r));
      ok(!r.badLink && r.none, 'a non-link shows nothing, and none stops the loop');
    });

    await test('3.0 the options screen: every choice is ‹ value ›, the arrows change it, the description names its default', async () => {
      const r = await page(async () => {
        openSettings();
        const stp = document.querySelector('.set-row:has(#motionSeg) .stp');
        const before = state.settings.motion;
        stp.querySelector('[data-d="1"]').click();
        const after = state.settings.motion;
        const shown = stp.querySelector('.stp-v').textContent;
        stp.querySelector('[data-d="-1"]').click();
        const row = document.querySelector('.set-row:has(#motionSeg)');
        row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        const desc = $('setDesc').textContent;
        const checks = document.querySelectorAll('#setPanes label.set-check .stp').length === document.querySelectorAll('#setPanes label.set-check').length;
        closeSettings();
        return { before, after, shown, back: state.settings.motion, desc, checks, face: document.body.dataset.uifont };
      });
      ok(r.after !== r.before && r.back === r.before, 'the arrow steps through the options and back: ' + JSON.stringify(r));
      ok(r.shown.length > 0 && r.checks, 'the value is shown, and every check box is a two-option row');
      ok(/\(.+\)/.test(r.desc) && r.desc.length > 30, 'the description, ending in its default: ' + r.desc);
      ok(r.face === 'clean', 'the app is set in the clean face (Frutiger, Univers Condensed): ' + r.face);
    });
  }
];
