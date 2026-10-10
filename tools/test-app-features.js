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
  }
];
