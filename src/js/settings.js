/* Mental Board — settings.js
   The settings panel and every dialog behind it.

   Part 14 of 15. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 15. settings UI + dialogs ─────────────── */
function openSettings() {
  $('settings').classList.remove('hidden');
  syncSettingsUI();
  renderTemplateList();
}
function closeSettings() { $('settings').classList.add('hidden'); }

/* Twelve cards in one wall read as a swatch book, not as a choice: nothing
   tells you where the light ones stop and the dark ones start, so you scan the
   lot every time. Split under two headings and the half you are not in that
   moment stops competing for attention. Both halves are always shown — hiding
   one would make "swap between your light and dark picks" impossible to set
   up, which is the whole point of the two modes above. */
function buildThemeGrid() {
  const grid = $('themeGrid');
  const card = (raw) => buildThemeCard(themeById(raw.id));
  const half = (mode) => THEMES.filter((th) => themeById(th.id).mode === mode);
  grid.innerHTML =
    `<div class="tg-head">${icon('light_mode')}<span>${te('set.themesLight')}</span></div>` +
    `<div class="tg-row">${half('light').map(card).join('')}</div>` +
    `<div class="tg-head">${icon('dark_mode')}<span>${te('set.themesDark')}</span></div>` +
    `<div class="tg-row">${half('dark').map(card).join('')}</div>`;
  grid.querySelectorAll('.theme-card').forEach((b) =>
    b.addEventListener('click', () => pickTheme(b.dataset.theme)));
}

/* One card. The light/dark badge the cards used to carry is gone: the heading
   above the row says which half you are looking at, and a badge repeating that
   on every card was twelve more marks on the busiest control in the app. */
function buildThemeCard(th) {
  const label = te('theme.' + th.id);
  const edge = th.mode === 'dark' ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.12)';
  return `<button class="theme-card" data-theme="${th.id}" title="${label}">
     <span class="tc-preview" style="background:${th.swatch[0]}">
       <span class="tc-note" style="background:${th.swatch[1]};border-color:${edge}">
         <i style="background:${th.swatch[2]}"></i><i style="background:${th.swatch[2]};width:60%"></i>
       </span>
     </span>
     <span class="tc-name">${label}</span>
   </button>`;
}

/* --- your light theme and your dark theme -------------------------------
   The pair that `system` and `clock` swap between. It has always been stored —
   `settings.lightTheme` and `settings.darkTheme` — but until now the only way
   to *set* it was sideways: pick a card, which recorded it into whichever slot
   matched that theme's own mode and dropped you into `fixed` at the same time.
   So building a day/night pair meant switching to fixed, picking a light theme,
   picking a dark theme, then switching back, and nothing on screen said that
   was what you were doing.

   Two pickers say it directly.

   Both lists hold **every** theme, not the light ones on the left and the dark
   ones on the right. The slots do not mean "a light-mode palette" and "a
   dark-mode palette" — they mean *the one you want in the day* and *the one you
   want at night*, and someone who wants Dim in the afternoon and Midnight at
   two in the morning has picked two dark themes on purpose. Filtering the lists
   would be the app telling them they are wrong about their own eyes.

   Custom is in both, and `themeById()` resolves its mode and swatch from
   settings, so it behaves like any other entry here. */
function themeOptions(sel) {
  return THEMES.map((th) => {
    const t2 = themeById(th.id);
    const mark = t2.mode === 'dark' ? te('set.themesDark') : te('set.themesLight');
    return `<option value="${esc(th.id)}"${th.id === sel ? ' selected' : ''}>${te('theme.' + th.id)} · ${mark}</option>`;
  }).join('');
}

/* The three colours of the chosen theme, beside its name. A dropdown showing
   only "Ocean" tells you nothing about what you are choosing; the same three
   swatches the cards use tell you at a glance, and they follow a Custom palette
   as it is edited because themeById() reads it from settings every time. */
function paintPairSwatch(el, id) {
  if (!el) return;
  const th = themeById(id);
  el.innerHTML = th.swatch.map((c) => `<i style="background:${esc(c)}"></i>`).join('');
}

function buildPairPickers() {
  const s = state.settings;
  const light = $('setLightTheme'), dark = $('setDarkTheme');
  if (!light || !dark) return;
  light.innerHTML = themeOptions(s.lightTheme);
  dark.innerHTML = themeOptions(s.darkTheme);
  paintPairSwatch($('pfSwLight'), s.lightTheme);
  paintPairSwatch($('pfSwDark'), s.darkTheme);
}

/* --- the settings tabs --------------------------------------------------
   Every pane stays in the DOM; only a class moves. syncSettingsUI() is one
   pass over controls that always exist, and nothing has to be rebuilt when the
   tab changes — which also means a control can be read or written by id from
   anywhere without first asking which tab is open. */
let setTab = 'appearance';
function showSetTab(id) {
  const nav = $('setNav'), panes = $('setPanes');
  if (!nav || !panes) return;
  const known = [...nav.querySelectorAll('.set-tab')].some((b) => b.dataset.tab === id);
  setTab = known ? id : 'appearance';
  nav.querySelectorAll('.set-tab').forEach((b) => {
    const on = b.dataset.tab === setTab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  panes.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('on', p.dataset.pane === setTab));
  panes.scrollTop = 0;
}
function wireSetTabs() {
  const nav = $('setNav');
  if (!nav) return;
  nav.querySelectorAll('.set-tab').forEach((b) =>
    b.addEventListener('click', () => showSetTab(b.dataset.tab)));
  showSetTab(setTab);
}

/* Each swatch is a small canvas wearing the pattern it selects.

   The samples are the real rules: a swatch carries data-grid and lives inside
   an element with the same attribute, so css/chrome.css draws it exactly as it
   draws the board. No second set of preview styles to keep in step with the
   first — which is the way a preview stops being a lie after the third edit. */
function buildGridPicker() {
  const wrap = $('gridPicker');
  if (!wrap) return;
  wrap.innerHTML = GRID_STYLES.map((g) =>
    `<button class="paper" data-pick="${g}" title="${te('set.grid.' + g)}">
       <span class="paper-eg" data-grid="${g}"><span id="pg-${g}" class="paper-in"></span></span>
       <span class="paper-name">${te('set.grid.' + g)}</span>
     </button>`).join('');
  wrap.querySelectorAll('.paper').forEach((b) => b.addEventListener('click', () => {
    state.settings.grid = b.dataset.pick;
    applySettings(); syncSettingsUI(); saveSoon();
  }));
}

/* --- rope colour swatches ----------------------------------------------
   The nine note colours plus whatever hex the picker below them holds, so the
   ropes can either match the palette the notes already use or be their own
   thing entirely. Painted inline from the same custom properties the notes
   read, which is what keeps a rope the same red as a red note. */
function buildLinkSwatches() {
  const wrap = $('linkSwatches');
  if (!wrap) return;
  wrap.innerHTML = COLORS.map((c) =>
    `<button data-lkc="${c}" title="${esc(te('colour.' + c))}" style="background:var(--c-${c}-c)"></button>`).join('');
  wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.linkColor = b.dataset.lkc;
    applyLinkStyle(); syncSettingsUI(); saveSoon();
  }));
}

function syncSettingsUI() {
  const s = state.settings;
  const active = resolvedTheme().id;
  buildLangPicker();
  $('themeGrid').querySelectorAll('.theme-card').forEach((b) => {
    b.classList.toggle('on', b.dataset.theme === active);
    /* The "this is one of your two" badge belongs to any mode that swaps
       between them, not just to following Windows — under the clock the pair
       is doing exactly the same job. */
    const paired = s.themeMode !== 'fixed';
    b.classList.toggle('auto', paired && (b.dataset.theme === s.lightTheme || b.dataset.theme === s.darkTheme));
  });

  // what picks the theme, the pair it swaps between, and the two times if it is the clock
  $('themeModeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.themeMode));
  const clockOn = s.themeMode === 'clock';
  /* The pair belongs to both `system` and `clock`. Under `fixed` nothing swaps,
     so two pickers for a swap that never happens would be furniture. */
  $('pairRow').classList.toggle('hidden', s.themeMode === 'fixed');
  $('pairHint').classList.toggle('hidden', s.themeMode === 'fixed');
  buildPairPickers();
  $('clockRow').classList.toggle('hidden', !clockOn);
  $('clockHint').classList.toggle('hidden', !clockOn);
  $('setDayAt').value = s.dayAt;
  $('setNightAt').value = s.nightAt;
  if (clockOn) {
    $('clockHint').textContent = t('set.clockHint', {
      light: themeName(s.lightTheme), day: s.dayAt,
      dark: themeName(s.darkTheme), night: s.nightAt
    });
  }

  /* The custom editor is shown when Custom is the theme in play — which under
     the clock or Windows means "it is one of your two", not just "you picked
     it". Hiding it while the palette it edits is on screen would be the one
     time you cannot reach the controls. */
  const ct = s.customTheme;
  const customInPlay = active === 'custom' || s.theme === 'custom' ||
    (s.themeMode !== 'fixed' && (s.lightTheme === 'custom' || s.darkTheme === 'custom'));
  $('customBox').classList.toggle('hidden', !customInPlay);
  $('ctBg').value = ct.bg;
  $('ctSurface').value = ct.surface;
  $('ctText').value = ct.text;
  $('ctModeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.ctmode === ct.mode));

  // ropes
  $('linkSwatches').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lkc === s.linkColor));
  $('linkColorPick').value = isHex(s.linkColor) ? s.linkColor : swatchHex(s.linkColor);
  $('linkStyleSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lks === s.linkStyle));
  $('linkAnchorSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.lka === s.linkAnchor));
  $('linkWidth').value = s.linkWidth;
  $('linkWidthVal').textContent = num(s.linkWidth);
  $('setEmbeds').checked = !!s.embeds;

  /* The bin row says how much is in it, and says so even when the answer is
     nothing — that is the case someone reading this row actually wants
     answered. Empty is disabled rather than hidden, so the button that would
     do the irreversible thing is never a surprise the first time it appears. */
  const tb = trashOf();
  const tn = tb ? tb.notes.length + tb.frames.length : 0;
  $('trashCount').textContent = t('count.items', { n: tn });
  $('btnOpenTrash').disabled = !tn;
  $('btnEmptyTrash').disabled = !tn;
  $('gridPicker').querySelectorAll('.paper').forEach((b) => b.classList.toggle('on', b.dataset.pick === s.grid));
  $('gridSize').value = s.gridSize;
  $('gridSizeVal').textContent = num(s.gridSize);
  $('gridFade').value = s.gridFade;
  $('gridFadeVal').textContent = pct(s.gridFade);
  /* The pitch and the strength say nothing about a blank page, so they step
     back rather than vanish — a control that disappears takes the fact that it
     exists with it, and someone who turns the paper off has not stopped
     wanting to know it can be turned back on. */
  const paper = s.grid !== 'plain';
  $('gridSize').disabled = !paper;
  $('gridFade').disabled = !paper;
  $('wheelSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.wheel === s.wheel));
  $('perfSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.perf === s.perf));
  /* Say which one Auto landed on, and why. "Auto" that will not tell you its
     answer is a setting you cannot reason about — and the whole question this
     control exists to settle is "is my machine being treated as the slow one?" */
  $('perfHint').textContent = s.perf === 'auto'
    ? t('set.perfAutoHint', { mode: t(detectPerf() === 'lite' ? 'set.perfLite' : 'set.perfFull') })
    : t(s.perf === 'lite' ? 'set.perfLiteHint' : 'set.perfFullHint');
  /* Rebuilt rather than re-marked: the row's contents depend on which accent
     is selected — a preset outside the shown nine is appended so it can still
     be seen as chosen — so there is nothing to re-mark until it is rebuilt.
     Ten elements; it costs nothing, and it is never called mid-drag. */
  buildAccentSwatches();
  $('fontScale').value = s.fontScale;
  $('fontScaleVal').textContent = pct(s.fontScale);
  $('setSnap').checked = !!s.snap;
  $('setCompass').checked = !!s.compass;
  $('setSpell').checked = !!s.spell;
  $('railSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.rail === s.railMode));
  $('shapeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.shape === s.noteShape));
  $('densitySeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.density === s.noteDensity));
  $('setNoteChrome').checked = !!s.noteChrome;
  renderStatusList();
  $('setShowArchived').checked = !!s.showArchived;
  /* Where the off-disk copies go, and when the last one landed. A backup
     setting that will not tell you whether it is actually working is a comfort
     blanket, so this says the folder and the date or says plainly that there
     is none. */
  $('setBackupAuto').checked = !!s.backupAuto;
  $('btnBackupNow').disabled = false;
  $('backupWhere').textContent = s.backupDir
    ? t('set.backupWhere', { dir: s.backupDir }) +
      (s.lastBackup ? ' · ' + t('set.backupLast', { when: fmtWhen(s.lastBackup) }) : ' · ' + t('set.backupNever'))
    : t('set.backupNone');
  /* What the boards are actually carrying. Counted from the folder, not from
     the notes — the whole point of the row next to it is the gap between the
     two, and a figure derived from the notes could never show one. */
  const files = $('filesCount');
  if (files) {
    let n = 0, bytes = 0;
    if (FILES && FILES.listAttachments) {
      state.boards.forEach((b) => {
        (FILES.listAttachments(b.id) || []).forEach((f) => { n++; bytes += f.size || 0; });
      });
    }
    files.textContent = n ? t('set.filesCount', { n, size: fmtBytes(bytes) }) : t('set.filesNone');
    $('btnCleanFiles').disabled = !n || !canCleanFiles();
  }
  // a picture of the board is for somewhere else, so it gets its own theme
  $('setExportTheme').innerHTML =
    `<option value="app"${s.exportTheme === 'app' ? ' selected' : ''}>${te('set.pictureApp')}</option>` +
    themeOptions(s.exportTheme);
  $('setBackground').checked = !!s.background;
  $('setCapture').checked = !!s.capture;
  $('setDaily').checked = !!s.daily;
  $('dailyBoardRow').classList.toggle('hidden', !s.daily);
  // only boards that can actually receive a note
  $('setDailyBoard').innerHTML = state.boards
    .filter((b) => !b.archived && !b.enc)
    .map((b) => `<option value="${esc(b.id)}">${esc(boardLabel(b))}</option>`).join('');
  if (s.dailyBoard) $('setDailyBoard').value = s.dailyBoard;
  if (!$('setDailyBoard').value && state.boards.length) $('setDailyBoard').value = state.activeBoard;
  /* Count across every board, not just the open one. "Your board" in Settings
     is about the file on disk, and the file holds all of them — a word count
     that silently ignored four boards would be worse than none. */
  syncActiveBoard();
  let notes = 0, frames = 0, links = 0, words = 0;
  state.boards.forEach((b) => {
    notes += b.notes.length; frames += b.frames.length; links += b.links.length;
    b.notes.forEach((n) => { words += noteText(n).split(/\s+/).filter(Boolean).length; });
  });
  $('setStats').textContent = t('set.stats', {
    boards: t('count.boards', { n: state.boards.length }),
    notes: t('count.notes', { n: notes }),
    frames: t('count.frames', { n: frames }),
    links: t('count.links', { n: links }),
    words: t('count.words', { n: words })
  });
  if (DATA && DATA.paths) {
    try {
      const p = DATA.paths();
      $('setPath').textContent = p.userData;
      $('setVersion').textContent = p.version ? t('set.version', { v: p.version }) : '';
    } catch (_) {}
  } else {
    $('setPath').textContent = t('set.browserMode');
    $('setVersion').textContent = '';
  }
  $('setSafety').textContent = t('set.safety');
}

/* The picker lists every catalogue registered in assets/lang, by its own name
   ("العربية", not "Arabic"), plus an entry that follows Windows. Drop a new
   file in and it appears here with no further wiring. */
function buildLangPicker() {
  const sel = $('setLang');
  if (!sel) return;
  const auto = resolveLang('auto');
  const autoName = (LANGS[auto] && LANGS[auto]._native) || auto;
  sel.innerHTML =
    `<option value="auto">${te('set.langAuto')} — ${esc(autoName)}</option>` +
    LANG_IDS.map((id) => {
      const l = LANGS[id];
      return `<option value="${esc(id)}" lang="${esc(id)}">${esc(l._native || l._name || id)}</option>`;
    }).join('');
  sel.value = state.settings.lang;
}

/* The status editor in Settings.

   Rebuilt whole on every change rather than patched. The list is at most a
   handful of rows, and a patched list is where "I renamed one and the colour
   dot next to a different one changed" comes from. */
function renderStatusList() {
  const wrap = $('statusList');
  if (!wrap) return;
  if (!state.statuses.length) {
    wrap.innerHTML = `<p class="set-note">${te('status.empty')}</p>`;
    return;
  }
  wrap.innerHTML = state.statuses.map((s, i) => `
    <div class="st-row" data-id="${esc(s.id)}">
      <button class="st-swatch" data-color="${esc(s.color)}" data-act="colour" title="${te('status.colour')}"></button>
      <input class="st-name" value="${esc(statusName(s))}" maxlength="40" data-t-aria="status.rename">
      <button class="st-act${s.done ? ' on' : ''}" data-act="done" title="${te('status.doneHint')}"><span class="b-ic"></span></button>
      <button class="st-act" data-act="up" ${i === 0 ? 'disabled' : ''} title="${te('status.up')}"><span class="b-ic"></span></button>
      <button class="st-act" data-act="down" ${i === state.statuses.length - 1 ? 'disabled' : ''} title="${te('status.down')}"><span class="b-ic"></span></button>
      <button class="st-act danger" data-act="del" title="${te('status.del')}"><span class="b-ic"></span></button>
    </div>`).join('');

  // the glyphs, after the rows exist
  wrap.querySelectorAll('.st-row').forEach((row) => {
    const g = (sel, name) => { const el = row.querySelector(sel); if (el) el.innerHTML = icon(name); };
    g('[data-act="done"] .b-ic', 'check_circle');
    g('[data-act="up"] .b-ic', 'arrow_upward');
    g('[data-act="down"] .b-ic', 'arrow_downward');
    g('[data-act="del"] .b-ic', 'delete');
  });

  wrap.querySelectorAll('.st-name').forEach((inp) => {
    const commit = () => {
      const s = statusById(inp.closest('.st-row').dataset.id);
      if (!s) return;
      const v = inp.value.trim().slice(0, 40);
      /* Typing the built-in name back in is the same as never having renamed
         it, so it goes back to translating. Storing "To do" literally would
         freeze it in English for an Arabic window. */
      s.name = (v && v !== t('status.' + s.id)) ? v : '';
      repaintStatuses(); saveSoon();
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
  });

  wrap.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const row = b.closest('.st-row');
    const id = row.dataset.id;
    const i = state.statuses.findIndex((s) => s.id === id);
    const s = state.statuses[i];
    if (!s) return;
    switch (b.dataset.act) {
      case 'colour': s.color = COLORS[(COLORS.indexOf(s.color) + 1) % COLORS.length]; break;
      case 'done': s.done = !s.done; break;
      case 'up': if (i > 0) state.statuses.splice(i - 1, 0, state.statuses.splice(i, 1)[0]); break;
      case 'down': if (i < state.statuses.length - 1) state.statuses.splice(i + 1, 0, state.statuses.splice(i, 1)[0]); break;
      case 'del': {
        /* Say how many notes lose their status, because from the settings panel
           there is no way to see that this one is on forty of them. The notes
           keep the id — see the comment in adoptBoard — so undoing the delete
           by adding a status back with the same id restores every one. */
        const n = countWithStatus(id);
        const ok = await confirmDlg(
          t('status.delTitle', { name: statusName(s) }),
          n ? t('status.delBody', { n }) : t('status.delBodyNone'),
          t('status.del'));
        if (!ok) return;
        state.statuses.splice(i, 1);
        break;
      }
    }
    renderStatusList(); repaintStatuses(); saveSoon();
  }));
}
const countWithStatus = (id) =>
  state.boards.reduce((sum, b) => sum + (b.enc ? 0 : b.notes.filter((n) => n.status === id).length), 0);

// every mounted note repaints its pill — colours, names and deletions all show
function repaintStatuses() {
  state.notes.forEach((n) => { const el = els.get(n.id); if (el) paintNoteStatus(el, n); });
}

function addStatus() {
  if (state.statuses.length >= 12) { toast(t('status.tooMany')); return; }
  state.statuses.push({ id: uid(), name: t('status.newName'), color: 'default', done: false });
  renderStatusList(); saveSoon();
  const last = $('statusList').querySelector('.st-row:last-child .st-name');
  if (last) { last.focus(); last.select(); }
}

/* Nine swatches, plus whatever the user is already on if it is not one of them,
   plus their own colour at the end.

   The "already on" row is what makes shortening the list safe. Someone whose
   board says `crimson` still sees crimson selected in the picker rather than
   having their choice quietly become indigo the first time they open Settings
   — the list decides what is offered, never what is kept. */
function buildAccentSwatches() {
  const cur = state.settings.accent;
  const keys = ACCENT_CHOICES.slice();
  if (ACCENTS[cur] && !keys.includes(cur)) keys.push(cur);
  $('accentSwatches').innerHTML =
    keys.map((k) => `<button data-accent="${k}"${k === cur ? ' class="on"' : ''} title="${te('accent.' + k)}" style="background:${ACCENTS[k]}"></button>`).join('') +
    /* The custom swatch is a real swatch showing the colour it holds, with the
       picker behind it — not a separate control below the row. Mixing your own
       is one of the choices, so it belongs among them. */
    `<label class="sw-own${cur === 'custom' ? ' on' : ''}" title="${te('set.accentOwn')}" style="background:${esc(state.settings.accentCustom)}">` +
      `${icon('colorize')}<input type="color" id="accentPick" value="${esc(state.settings.accentCustom)}" data-t-aria="set.accentOwn">` +
    `</label>`;
  $('accentSwatches').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.accent = b.dataset.accent; applyTheme(); syncSettingsUI(); saveSoon();
  }));
  const pick = $('accentPick');
  if (pick) pick.addEventListener('input', () => {
    if (!isHex(pick.value)) return;
    state.settings.accentCustom = pick.value;
    state.settings.accent = 'custom';
    applyTheme(); saveSoon();
    // repaint the swatch under the picker without rebuilding it mid-drag
    const own = pick.closest('.sw-own');
    if (own) { own.style.background = pick.value; own.classList.add('on'); }
    $('accentSwatches').querySelectorAll('button').forEach((b) => b.classList.remove('on'));
  });
}

/* [key, what it does]. A key that is itself a phrase ("Double-click") carries a
   `kb.*` catalogue key instead of literal text; a real key name like Ctrl + Z
   is the same in every language and stays literal. */
const SHORTCUTS = [
  ['N', 'key.newNote'], ['G', 'key.newFrame'], ['L', 'key.linkNote'],
  ['kb.dblclick', 'key.editNote'], ['Esc', 'key.stopEditing'],
  ['kb.spaceDrag', 'key.pan'], ['kb.middleDrag', 'key.panMiddle'],
  ['kb.dragEmpty', 'key.lasso'], ['kb.shiftClick', 'key.addSel'],
  ['kb.scroll', 'key.zoom'], ['Ctrl + 0', 'key.zoom100'], ['Shift + 1', 'key.fit'],
  ['Ctrl + D', 'key.duplicate'], ['Ctrl + G', 'key.group'],
  ['Ctrl + Shift + G', 'key.arrange'],
  ['Ctrl + C / V / X', 'key.copy'], ['Delete', 'key.delete'],
  ['Ctrl + Z', 'key.undo'], ['Ctrl + Shift + Z', 'key.redo'],
  ['Ctrl + F', 'key.find'], ['Ctrl + B', 'key.boards'], ['Ctrl + P', 'key.palette'],
  ['Ctrl + ,', 'key.settings'],
  ['/', 'key.blocks'], ['Ctrl + K', 'key.link']
];
function buildKeyList() {
  $('keyList').innerHTML = SHORTCUTS.map(([k, d]) =>
    `<div class="key-row"><span>${te(d)}</span><kbd dir="auto">${k.startsWith('kb.') ? te(k) : esc(k)}</kbd></div>`).join('');
}

/* --- the board rail ----------------------------------------------------
   A column of tiles down the left edge, one per board, active one lit. It is
   always visible rather than hidden behind a menu, because a switcher nobody
   can see is a feature nobody uses — and because it is the one control that
   tells a new user boards exist at all.

   Diffing would be pointless here: there are a handful of tiles, they change
   only when a board is added, renamed or removed, and nothing about them
   animates per-frame the way the compass chips do. */
/* The bin's tile, or nothing at all. Separate from the tile list because it is
   not one of the boards you switch between — it sits under the divider with the
   Add button, which is where the things that are *about* boards live rather
   than the boards themselves. */
function trashTileHtml() {
  const tb = trashOf();
  const n = tb ? tb.notes.length + tb.frames.length : 0;
  if (!n) return '';
  const label = esc(t('board.trash'));
  /* No action cluster on this one. Renaming the bin, giving it an icon or
     opening the board menu on it are all meaningless — the same reason
     openBoardMenu() builds it a menu of its own. It is a row, not a board. */
  return `<div class="br-row br-row-plain" data-board="${esc(tb.id)}">
            <button class="br-tile br-trash${tb.id === state.activeBoard ? ' on' : ''}"
                    data-board="${esc(tb.id)}" data-color="default" title="${label}">
              <span class="br-ic">${icon('delete')}</span>
              <span class="br-name">${label}</span>
              <span class="br-count">${num(n)}</span>
            </button>
          </div>`;
}

/* One board's row in the window.

   The tile is the switch target and the three buttons beside it are the two
   things people do most to a board plus a way to everything else. All of it
   used to be behind a right-click: renaming meant right-click → Rename or
   knowing that double-click works, and changing the icon meant right-click →
   Icon. Neither is discoverable, and both are things you do while you are
   *looking at the list*, which is exactly where the controls should be.

   The row is a <div> wrapping a <button>, not one big button, because a button
   inside a button is invalid and silently reparents. Hover state therefore
   lives on the row and is pushed down to the tile. */
function boardRowHtml(b) {
  const label = esc(boardLabel(b));
  const locked = isLocked(b);
  // a locked board's contents are ciphertext, so there is nothing to count
  const count = locked ? 0 : b.notes.length + b.frames.length;
  const act = (a, ic, tip) =>
    `<button class="br-act" data-act="${a}" title="${tip}" aria-label="${tip}">${icon(ic)}</button>`;
  return `<div class="br-row${b.id === state.activeBoard ? ' on' : ''}" data-board="${esc(b.id)}">
            <button class="br-tile${b.id === state.activeBoard ? ' on' : ''}${b.archived ? ' archived' : ''}"
                    data-board="${esc(b.id)}"
                    data-color="${esc(b.iconColor === 'auto' ? 'default' : b.iconColor)}" title="${label}">
              <span class="br-ic" style="color:${iconColorVar(b.iconColor)}">${icon(locked ? 'lock' : (b.icon || 'sticky_note_2'))}</span>
              <span class="br-name">${label}</span>
              ${b.archived ? `<span class="br-flag">${icon('archive')}</span>` : ''}
              <span class="br-count">${count ? num(count) : ''}</span>
            </button>
            <span class="br-acts">
              ${act('icon', 'mood', te('board.icon'))}
              ${act('rename', 'edit', te('board.rename'))}
              ${act('more', 'more_horiz', te('board.more'))}
            </span>
          </div>`;
}

function renderBoardRail() {
  const rail = $('boardRail');
  if (!rail) return;
  const mode = RAIL_MODES.includes(state.settings.railMode) ? state.settings.railMode : 'pinned';
  const on = mode !== 'off';
  /* Only `pinned` insets the canvas. In hover mode the rail floats over it —
     insetting on hover would shift every note sideways each time the pointer
     brushed the edge, which reads as the board jumping about. */
  /* Standing in the bin is a different place, and the canvas says so. */
  document.body.classList.toggle('on-trash', onTrashBoard());
  document.body.classList.toggle('has-rail', mode === 'pinned');
  document.body.classList.toggle('rail-hover', mode === 'hover');
  rail.classList.toggle('hidden', !on);
  if (!on) {
    document.body.classList.remove('rail-open');
    /* Empty it rather than just hiding it. Returning here used to leave the
       whole list of rows in the document with every listener still attached —
       invisible, but re-created on each render and never collected. */
    rail.innerHTML = '';
    return;
  }

  /* In hover mode the rail is a small launcher with a flyout hanging off it; in
     pinned mode the launcher is hidden by CSS and the panel is the rail itself.
     One markup shape for both, so switching modes is a class, not a re-render
     with different structure. */
  rail.innerHTML =
    `<button class="br-launcher" id="brLauncher" title="${te('board.switch')}" aria-label="${te('board.switch')}">` +
      icon('space_dashboard') +
      `<span class="br-badge">${num(state.boards.length)}</span>` +
    `</button>` +
    `<div class="br-panel">` +
    /* A title strip, so the flyout reads as a small window rather than as a
       menu that happened to open. It also gives the count somewhere to live
       that is not the launcher badge, which is hidden the moment the panel
       covers it. */
    `<div class="br-head">${icon('space_dashboard')}<span>${te('board.switch')}</span>` +
      `<span class="br-head-n">${num(liveBoards().length)}</span></div>` +
    `<div class="br-list" id="brList">` +
    state.boards.filter((b) => !b.trash && (!b.archived || state.settings.showArchived))
      .map(boardRowHtml).join('') +
    `</div>` +
    `<button class="br-add" id="brAdd" title="${te('board.add')}">${icon('add')}<span>${te('board.add')}</span></button>` +
    /* The bin appears when it has something in it and goes away when it does
       not. A permanent empty bin is a row of chrome that says nothing; one that
       turns up the first time you delete something is how you find out the
       delete was reversible, at the moment that matters. */
    trashTileHtml() +
    `</div>`;

  rail.querySelectorAll('.br-tile').forEach((el) => {
    el.addEventListener('click', (e) => {
      // a click that lands on the name while renaming must not switch away
      if (el.querySelector('.br-name[contenteditable]')) return;
      e.preventDefault();
      switchBoard(el.dataset.board);
    });
    el.addEventListener('dblclick', (e) => { e.preventDefault(); renameBoard(el.dataset.board); });
  });
  /* Right-click anywhere on the row, not just on the tile — the action cluster
     is part of the row, and a right-click that does nothing over one third of a
     list item reads as the menu being broken. */
  rail.querySelectorAll('.br-row').forEach((row) => {
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openBoardMenu(e.clientX, e.clientY, row.dataset.board);
    });
  });
  /* The three buttons. `stopPropagation` first: they sit inside the row whose
     tile switches board, and the rail's own pointerdown/click handlers would
     otherwise switch away from the board being renamed the moment the pencil
     was pressed. holdRail keeps the flyout up — every one of these takes the
     pointer somewhere else, which in hover mode is what closes it. */
  rail.querySelectorAll('.br-act').forEach((el) => {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = el.closest('.br-row').dataset.board;
      holdRail(true);
      // the picker is a modal overlay, so the flyout behind it has no job left
      if (el.dataset.act === 'icon') { openIconPicker('board:' + id); holdRail(false); return; }
      if (el.dataset.act === 'rename') { renameBoard(id); return; }
      const r = el.getBoundingClientRect();
      openBoardMenu(RTL ? r.right : r.left, r.bottom + 6, id);
    });
  });
  const add = $('brAdd');
  if (add) add.addEventListener('click', addBoard);

  /* Clicking the launcher latches the flyout open. Hover alone is fine for
     glancing, but not for a deliberate trip to the far side of the panel — and
     it is the only way in for anyone not using a mouse. */
  const launcher = $('brLauncher');
  if (launcher) launcher.addEventListener('click', (e) => {
    e.stopPropagation();
    holdRail(!document.body.classList.contains('rail-open'));
  });
}

/* --- dragging a note onto another board ---------------------------------
   Drag towards the rail and it opens; drop on a tile and the selection moves
   to that board.

   It is pointer-driven rather than HTML5 drag-and-drop because the canvas
   already owns the pointer: beginMove() calls setPointerCapture on the
   viewport, so no dragstart ever fires and no dragover ever reaches the rail.
   Fighting that would mean rewriting the gesture engine for one feature.
   elementFromPoint on each move is what the capture leaves available. */
let dropTile = null;

function markDropTile(el) {
  if (dropTile === el) return;
  if (dropTile) dropTile.classList.remove('br-drop');
  dropTile = el;
  if (dropTile) dropTile.classList.add('br-drop');
}

function trackBoardDrop(e) {
  if (state.settings.railMode === 'off') return;
  // pointer capture retargets events, so ask the document what is really there
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const rail = $('boardRail');
  const near = under && (under.closest('#boardRail') || under.closest('.br-launcher'));
  /* Opening the flyout while dragging is the whole affordance — you cannot drop
     on a tile you cannot see. Only in hover mode; pinned is already open. */
  if (state.settings.railMode === 'hover') {
    const overRail = !!near || (rail && e.clientX <= rail.getBoundingClientRect().right + 12 && !RTL) ||
                     (rail && RTL && e.clientX >= rail.getBoundingClientRect().left - 12);
    if (overRail) holdRail(true);
  }
  const tile = under && under.closest('.br-tile');
  // dropping onto the board you are already on would be a no-op that still
  // looks like it did something
  markDropTile(tile && tile.dataset.board !== state.activeBoard ? tile : null);
  document.body.classList.toggle('board-dragging', !!near || !!tile);
}

/* Returns true when the drop was handled, so endGesture stops there. */
function finishBoardDrop(g) {
  const tile = dropTile;
  markDropTile(null);
  document.body.classList.remove('board-dragging');
  if (!tile) { if (state.settings.railMode === 'hover') holdRail(false); return false; }
  const target = boardById(tile.dataset.board);
  if (!target || target.id === state.activeBoard) { holdRail(false); return false; }
  if (isLocked(target)) { toast(t('msg.boardLockedDrop')); holdRail(false); return false; }

  /* beginMove() pushed a geometry-only step, and geometry cannot express this:
     the notes are about to leave this board, so putting their old x and y back
     on a board they are no longer on restores nothing at all. Swap it for a
     full snapshot — taken with the drag's starting positions temporarily back
     in place, so what it records is genuinely the board *before* the drag and
     not the board mid-gesture. */
  popUndo();
  const moved = g.items.map(({ it, ox, oy }) => ({ it, x: it.x, y: it.y, ox, oy }));
  moved.forEach((m) => { m.it.x = m.ox; m.it.y = m.oy; });
  /* Both boards, not just this one. A step that only knew about the board being
     dragged *from* put the note back here and left the copy it had just made on
     the board it went to — one Ctrl+Z, two notes. */
  pushUndoWithBoard(target);
  moved.forEach((m) => { m.it.x = m.x; m.it.y = m.y; });

  const ids = g.items.map(({ it }) => it.id);
  const notes = ids.map((id) => state.notes.find((n) => n.id === id)).filter(Boolean);
  const frames = ids.map((id) => state.frames.find((f) => f.id === id)).filter(Boolean);
  if (!notes.length && !frames.length) { holdRail(false); return false; }

  const moving = new Set([...notes, ...frames].map((x) => x.id));
  // links whose both ends travel come along; the rest are cut
  const keptLinks = state.links.filter((l) => moving.has(l.from) && moving.has(l.to));
  state.notes = state.notes.filter((n) => !moving.has(n.id));
  state.frames = state.frames.filter((f) => !moving.has(f.id));
  state.links = state.links.filter((l) => !moving.has(l.from) && !moving.has(l.to));

  notes.forEach((n) => { n.z = ++target.nextZ; target.notes.push(n); });
  frames.forEach((f) => target.frames.push(f));
  keptLinks.forEach((l) => target.links.push(l));
  target.updatedAt = Date.now();

  clearSelection();
  render(); drawCompass(); renderBoardRail();
  save();
  holdRail(false);
  toast(t('msg.movedToBoard', { n: notes.length + frames.length, name: boardLabel(target) }));
  return true;
}

/* In hover mode CSS opens the rail on :hover, which is right for pointing at it
   and wrong for everything that outlives the pointer. Renaming a board and
   opening its menu both take the mouse somewhere else, and the rail sliding
   shut mid-rename takes the input with it. `rail-open` pins it until whatever
   started is finished. */
function holdRail(on) {
  document.body.classList.toggle('rail-open', !!on);
}

/* Ctrl+B. The window lives in a corner, and a corner is a thing you have to
   aim at — which is fine once you know it is there and is the wrong cost for
   something you do twenty times an hour.

   Turning the rail back on when it is off is deliberate, and it is what
   renameBoard() already does: the user asked for the boards window, so give
   them the boards window rather than a shortcut that silently does nothing.
   'hover' rather than 'pinned', because it is the mode that costs no canvas. */
function toggleBoardWindow() {
  if (state.settings.railMode === 'off') {
    state.settings.railMode = 'hover';
    applySettings();
    saveSoon();
    holdRail(true);
    return;
  }
  const open = document.body.classList.contains('rail-open');
  holdRail(!open);
  // in hover mode the launcher is invisible at rest; show where the panel came from
  if (!open) flashRail(2400);
}

/* ---- the peek corner ----
   In hover mode the launcher is invisible until the pointer reaches the corner
   it lives in. That corner is measured, not drawn.

   The CSS-only version of this — an invisible padded box with `:hover` — has to
   accept pointer events to be hoverable, and a 90px invisible square accepting
   pointer events in the corner of an infinite canvas is a dead zone: it eats
   the double-click that makes a note, the drag that starts a lasso, and the
   note you tried to drop there. Reading `clientX/clientY` on a move we are
   already handling costs nothing and covers nothing.

   The zone is anchored to the *viewport*, not the window, so it does not sit
   under the titlebar; and it flips to the right-hand corner in an RTL layout,
   because that is where the launcher is. */
const PEEK_W = 96, PEEK_H = 86;
/* The pointer has to have been *outside* the corner at least once before it can
   open anything. Windows leaves the cursor wherever it was when you launched,
   so opening the app with the pointer already parked in that corner — from a
   desktop icon, from a taskbar button — would bring the window up with the
   flyout already out, which looks exactly like the old always-visible rail.
   A reveal has to be something you did, not something you happened to be
   sitting on. */
let peekArmed = false;
let peeking = false;

function setPeek(on) {
  if (on === peeking) return;
  peeking = on;
  document.body.classList.toggle('rail-peek', on);
}

/* Deliberately arithmetic on the event and two constants — no
   getBoundingClientRect. This runs on every pointer move in the window, and a
   layout read per move is the kind of thing that shows up as a stutter on a
   slow machine while dragging a note. In hover mode the rail floats rather than
   insetting #stage, so the viewport's origin is known: TITLEBAR_H down from the
   top, and the window edge on the side the launcher is on. */
const TITLEBAR_H = 38;
function trackRailPeek(e) {
  if (state.settings.railMode !== 'hover') { setPeek(false); return; }
  // a latched flyout, a rename or a drag is already keeping it up
  if (document.body.classList.contains('rail-open')) return;
  const y = e.clientY - TITLEBAR_H;
  const x = RTL ? (innerWidth - e.clientX) : e.clientX;
  const inZone = x < PEEK_W && y < PEEK_H && y > -TITLEBAR_H;
  if (!peekArmed) { if (!inZone) peekArmed = true; return; }
  setPeek(inZone);
}

/* Introduce it once. The launcher is invisible at rest by design, and a control
   nobody ever sees is a feature nobody uses — so it is shown for a few seconds
   at startup and after the mode is switched to hover, then fades out on its
   own. Time rather than space: nothing is left on screen afterwards. */
let railFlashTimer = null;
function flashRail(ms) {
  clearTimeout(railFlashTimer);
  if (state.settings.railMode !== 'hover') { setPeek(false); return; }
  setPeek(true);
  railFlashTimer = setTimeout(() => setPeek(false), ms || 2600);
}

/* Right-click a tile. Its own menu rather than the canvas one, because none of
   the canvas actions (colour, bring to front, group) mean anything to a board. */
function closeBoardMenu() {
  const m = $('boardMenu');
  if (m) m.classList.add('hidden');
  // only release the rail if nothing else is holding it (a rename, say)
  if (!document.querySelector('.br-name[contenteditable]')) holdRail(false);
}
function openBoardMenu(clientX, clientY, id) {
  const b = boardById(id);
  const menu = $('boardMenu');
  if (!b || !menu) return;
  closeCtxMenu();
  holdRail(true);       // the menu is off the rail; do not let it slide shut
  const item = (act, ic, label, cls) =>
    `<button class="cm-item${cls ? ' ' + cls : ''}" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
  const locked = !!b.enc;
  /* The bin is not a board you do board things to. Renaming it, locking it or
     archiving it are all meaningless, and offering them would suggest it is
     something you own rather than somewhere things go. */
  if (b.trash) {
    menu.innerHTML =
      `<div class="cm-label">${icon('delete')}<span>${esc(t('board.trash'))}</span></div>` +
      item('open', 'open_in_full', te('board.open')) +
      item('empty', 'delete_forever', te('menu.emptyTrash'), 'danger');
    menu.classList.remove('hidden');
    const w0 = menu.offsetWidth, h0 = menu.offsetHeight;
    menu.style.left = clamp(RTL ? clientX - w0 : clientX, 6, innerWidth - w0 - 6) + 'px';
    menu.style.top = clamp(clientY, 44, innerHeight - h0 - 6) + 'px';
    menu.querySelectorAll('.cm-item').forEach((el) => el.addEventListener('click', () => {
      const act = el.dataset.act;
      closeBoardMenu();
      if (act === 'open') switchBoard(id); else emptyTrash();
    }));
    return;
  }
  menu.innerHTML =
    `<div class="cm-label">${icon(locked ? 'lock' : 'space_dashboard')}<span>${esc(boardLabel(b))}</span></div>` +
    item('open', 'open_in_full', te('board.open')) +
    item('rename', 'edit', te('board.rename')) +
    item('icon', 'mood', te('board.icon')) +
    item('dup', 'content_copy', te('board.duplicate')) +
    `<div class="cm-sep"></div>` +
    item('send', 'share', te('board.send')) +
    item('image', 'image', te('board.sendImage')) +
    /* Written out rather than picked with a ternary inside the call: the icon
       checker reads these call sites to know which glyphs are drawn, and a
       ternary in the icon slot hides one of them from it. */
    (b.archived ? item('archive', 'unarchive', te('board.unarchive'))
                : item('archive', 'archive', te('board.archive'))) +
    (locked ? item('lock', 'lock_open', te('board.unlock'))
            : item('lock', 'lock', te('board.lock'))) +
    `<div class="cm-sep"></div>` +
    item('del', 'delete', te('board.delete'), 'danger');
  menu.classList.remove('hidden');
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = clamp(RTL ? clientX - w : clientX, 6, innerWidth - w - 6) + 'px';
  menu.style.top = clamp(clientY, 44, innerHeight - h - 6) + 'px';
  menu.querySelectorAll('.cm-item').forEach((el) => el.addEventListener('click', () => {
    const act = el.dataset.act;
    closeBoardMenu();
    switch (act) {
      case 'open': switchBoard(id); break;
      case 'rename': renameBoard(id); break;
      case 'icon': openIconPicker('board:' + id); break;
      case 'dup': duplicateBoard(id); break;
      case 'send': exportOneBoard(id); break;
      case 'image': exportBoardImage(id); break;
      case 'archive': archiveBoard(id, !b.archived); break;
      case 'lock': b.enc ? removeBoardLock(id) : lockBoard(id); break;
      case 'del': deleteBoard(id); break;
    }
  }));
}

/* --- link dialog ------------------------------------------------------- */
let savedRange = null;
function openLinkDialog() {
  if (!editing) return;
  const s = getSelection();
  savedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  let a = null;
  let node = s.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  if (node) a = node.closest('a');
  $('linkText').value = a ? a.textContent : (savedRange ? savedRange.toString() : '');
  $('linkUrl').value = a ? a.getAttribute('href') || '' : '';
  $('linkRemove').classList.toggle('hidden', !a);
  $('linkDlg').classList.remove('hidden');
  setTimeout(() => $('linkUrl').focus(), 30);
}
function closeLinkDialog() { $('linkDlg').classList.add('hidden'); savedRange = null; }
function applyLink() {
  const text = $('linkText').value.trim();
  let url = $('linkUrl').value.trim();
  closeLinkDialog();
  if (!url || !editing) return;
  /* A Windows path is a perfectly good thing to link to, and this used to turn
     `C:\budget\FY26.xlsx` into `https://C:\budget\FY26.xlsx`. Recognise the two
     shapes a local path comes in — a drive letter and a UNC share — and make a
     real file: URL out of them; leave file: alone; prefix everything else the
     way it always did. */
  url = toLinkHref(url);
  editing.focus();
  if (savedRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  insertHTML(`<a href="${esc(url)}">${esc(text || url)}</a>&nbsp;`);
  persistEdit();
}
function removeLink() {
  closeLinkDialog();
  if (!editing) return;
  editing.focus();
  document.execCommand('unlink');
  persistEdit();
}

/* --- confirm ----------------------------------------------------------- */
let confirmResolve = null;
/* `tone` is 'danger' by default because most confirmations here are about
   throwing something away. Recovery prompts pass 'safe': a red button on
   "open the folder so you can get your board back" reads as one more thing
   about to be destroyed. */
function confirmDlg(title, body, okLabel, tone) {
  $('confirmTitle').textContent = title;
  $('confirmBody').textContent = body;
  $('confirmYes').textContent = okLabel || t('confirm.do');
  $('confirmYes').classList.toggle('danger', tone !== 'safe');
  $('confirmYes').classList.toggle('primary', tone === 'safe');
  $('confirmDlg').classList.remove('hidden');
  return new Promise((res) => { confirmResolve = res; });
}
function endConfirm(v) {
  $('confirmDlg').classList.add('hidden');
  if (confirmResolve) { confirmResolve(v); confirmResolve = null; }
}

/* --- toast + hint ------------------------------------------------------ */
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms || 1900);
}
function hint(msg) {
  const h = $('tbHint');
  h.textContent = msg || '';
  h.classList.toggle('on', !!msg);
}

/* --- backups somewhere else -------------------------------------------
   Everything the app already does to protect a board — the .bak, twenty dated
   snapshots, a copy before every version — lands in %APPDATA%, on the same disk
   as the board. That is the right answer to "I deleted the wrong thing" and no
   answer at all to a dead drive or a stolen laptop, which for anyone keeping
   real work in here is the bigger of the two risks. Nothing in the interface
   used to mention it.

   One folder, chosen once. A synced drive, a stick, a share — the app does not
   care and deliberately does not try to be a sync service. It writes the same
   JSON Export writes, dated, and keeps the newest ten.

   `lastBackup` is stored so the row can say when, and so the automatic copy
   knows whether today's has already been written. */
const backupName = () => `mental-board-${new Date().toISOString().slice(0, 10)}.json`;

async function chooseBackupFolder() {
  if (!DATA || !DATA.pickBackupDir) { toast(t('msg.needDesktop')); return; }
  const dir = await DATA.pickBackupDir();
  if (!dir) return;                       // cancelled is not a failure
  state.settings.backupDir = dir;
  save();
  syncSettingsUI();
  backupNow();                            // prove it works, now, while they are looking
}

/* `quiet` is for the automatic one on launch: it must not put a toast over the
   board every morning, but a *failure* is still said out loud — a backup folder
   that has silently stopped working is worse than never having set one up. */
async function backupNow(quiet) {
  const dir = state.settings.backupDir;
  if (!dir) { chooseBackupFolder(); return; }
  if (!DATA || !DATA.backupTo) { toast(t('msg.needDesktop')); return; }
  /* The board *and* the files it carries. Only the boards whose plaintext we
     actually hold: a locked board is ciphertext, so there is no file list to
     read out of it and nothing to copy. */
  const ids = state.boards.filter((b) => !isLocked(b)).map((b) => b.id);
  const r = await DATA.backupTo(dir, serialise(true), backupName(), ids);
  if (!r || r.error) {
    toast(t('msg.backupFailed', { err: (r && r.error) || '?' }), 7000);
    return;
  }
  state.settings.lastBackup = Date.now();
  save();
  syncSettingsUI();
  /* A failure copying the files does not undo the JSON that already landed, so
     it is said separately rather than turning the whole backup into a failure —
     and it is said even on the automatic one, for the same reason a failed
     backup is: a backup you have stopped checking is worse than none. */
  if (r.filesError) { toast(t('msg.backupFilesFailed', { err: r.filesError }), 7000); return; }
  if (!quiet) toast(r.files ? t('msg.backedUpFiles', { n: r.files }) : t('msg.backedUp'));
}

/* Once a day, on launch, if a folder has been chosen. Deliberately not on a
   timer and not on every save: a backup is a thing you want to exist, not a
   thing you want to watch happening, and writing to a synced folder on every
   keystroke is how you end up fighting the sync client. */
function maybeAutoBackup() {
  const s = state.settings;
  if (!s.backupDir || !s.backupAuto) return;
  const day = 24 * 3600e3;
  if (s.lastBackup && Date.now() - s.lastBackup < day) return;
  // after the board has settled, so a first launch is not competing with render
  setTimeout(() => backupNow(true), 4000);
}

/* --- files nothing points at any more -----------------------------------
   Attachments are never deleted on their own: a board's folder outlives the
   board, because deleting a board puts its notes in the bin and the bin has to
   stay reversible (§4n). So a folder slowly fills with files no note mentions —
   an emptied bin, a deleted note, a video dropped by mistake — and this is the
   one thing that clears them. It runs only because somebody asked it to.

   The whole of the safety is in what counts as *still referenced*, and it is
   deliberately generous. Four places hold a file: URL, and every one of them is
   somewhere the user can still get the file back:

     · a note body, on any board — including the bin, which is a board;
     · a note's `hist`, because restoring an old version has to restore its
       picture with it, and history is the one reference that is invisible on
       screen and so the easiest to forget;
     · the undo and redo stacks, whose full steps are whole boards as JSON —
       delete a file and one Ctrl+Z later the note is back with a hole in it;
     · a template, which is note markup the user saved on purpose.

   Anything missed here is a file deleted out from under something that could
   still ask for it. Anything over-counted is a file kept that need not be,
   which costs disk and nothing else. That asymmetry is the design: when in
   doubt, keep. */
const canCleanFiles = () => !!(FILES && FILES.unusedFiles && FILES.removeUnusedFiles);

function referencedFileUrls() {
  const out = new Set();
  const scan = (html) => {
    if (!html || html.indexOf('file:') < 0) return;
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('[src], [href]').forEach((el) => {
      const v = el.getAttribute('src') || el.getAttribute('href') || '';
      if (/^file:/i.test(v)) out.add(v);
    });
  };
  syncActiveBoard();
  state.boards.forEach((b) => {
    (b.notes || []).forEach((n) => {
      scan(n.body);
      (n.hist || []).forEach((h) => scan(h.body));
    });
  });
  (state.templates || []).forEach((tpl) => scan(tpl && tpl.body));
  /* The undo steps are raw JSON, not markup, so they are read with a regex
     rather than parsed into a document. A geom step holds only numbers and has
     no `json` at all, hence the filter. `&amp;` comes back to `&` because the
     URL was written through esc() on its way into the markup. */
  [...undoStack, ...redoStack].forEach((step) => {
    [step.json, step.other && step.other.json].filter(Boolean).forEach((json) => {
      (json.match(/file:[^"\\]+/g) || []).forEach((u) => out.add(u.replace(/&amp;/g, '&')));
    });
  });
  return [...out];
}

// bytes in the shortest honest unit — a sweep is judged on what it frees
function fmtBytes(n) {
  if (n < 1024) return t('size.b', { n: num(n) });
  if (n < 1024 * 1024) return t('size.kb', { n: num(Math.round(n / 1024)) });
  if (n < 1024 * 1024 * 1024) return t('size.mb', { n: num(Math.round(n / 104857.6) / 10) });
  return t('size.gb', { n: num(Math.round(n / 107374182.4) / 10) });
}

/* Count, ask, delete — and refuse outright when the count cannot be trusted.

   A locked board that has not been opened this session holds ciphertext, so
   there is no way to know which files it points at. Sweeping while one is shut
   would delete every picture on it and the user would find out the next time
   they unlocked it — which is exactly the shape of loss this app was rebuilt
   over. Refusing is the only honest answer, and the message names the board to
   open. Same rule as syncActiveBoard(), one layer out. */
async function cleanUpFiles() {
  if (!canCleanFiles()) { toast(t('msg.needDesktop')); return; }
  const shut = state.boards.filter(isLocked);
  if (shut.length) { toast(t('msg.cleanLocked', { name: shut.map(boardLabel).join(', ') }), 6000); return; }

  const found = await FILES.unusedFiles(referencedFileUrls());
  if (!found || found.error) { toast(t('msg.cleanFailed', { err: (found && found.error) || '?' }), 6000); return; }
  if (!found.files) { toast(t('msg.cleanNone')); return; }

  const list = found.names.length
    ? '\n\n' + found.names.join('\n') + (found.files > found.names.length ? '\n…' : '')
    : '';
  const ok = await confirmDlg(
    t('confirm.cleanTitle'),
    t('confirm.cleanBody', { n: found.files, size: fmtBytes(found.bytes) }) + list,
    t('confirm.cleanOk'));
  if (!ok) return;

  /* Scanned again rather than trusting the first pass. The dialog was open for
     as long as somebody took to read it, and a reminder firing or a daily note
     landing in that time could have written a file the first scan never saw. */
  const done = await FILES.removeUnusedFiles(referencedFileUrls());
  if (!done || done.error) { toast(t('msg.cleanFailed', { err: (done && done.error) || '?' }), 6000); return; }
  toast(t('msg.cleaned', { n: done.files, size: fmtBytes(done.bytes) }), 4500);
  syncSettingsUI();
}

/* --- export / import --------------------------------------------------- */
async function exportBoard() {
  const json = serialise(true);      // every board, not just the open one
  if (DATA && DATA.exportTo) {
    const r = await DATA.exportTo(json, `mental-board-${new Date().toISOString().slice(0, 10)}.json`);
    if (r && r.error) toast(t('msg.exportFailed')); else if (r) toast(t('msg.exported'));
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = 'mental-board.json'; a.click();
}
async function importBoard() {
  if (!DATA || !DATA.importFrom) { toast(t('msg.needDesktop')); return; }
  const r = await DATA.importFrom();
  if (!r || r.error) { if (r) toast(t('msg.readFailed')); return; }
  let parsed;
  try { parsed = JSON.parse(r.json); } catch (_) { toast(t('msg.notOurFile')); return; }
  // a 1.0.x export has notes/frames at the top level; a newer one has boards
  const looksOurs = Array.isArray(parsed.boards) || Array.isArray(parsed.notes) || Array.isArray(parsed.frames);
  if (!parsed || !looksOurs) { toast(t('msg.notOurFile')); return; }
  const ok = await confirmDlg(t('confirm.importTitle'), t('confirm.importBody'), t('confirm.importOk'));
  if (!ok) return;
  /* An import is the one thing that should lift the no-write latch. `loadFailed`
     exists so an unreadable file is never overwritten by an empty board the app
     invented — but the user has just chosen, in a confirm dialog, to replace
     the board with a file they picked. Leaving the latch on made Import the
     dead end at the end of the recovery instructions: it redrew the canvas,
     said "Imported", and wrote nothing. */
  if (loadFailed) { loadFailed = false; hint(''); lastWritten = ''; }
  const keepSettings = state.settings;
  adopt(parsed, keepSettings);      // heal the imported shape, keep my settings
  /* The pictures and clips, if they came with it. `r.path` is where the file
     was; its attachments are in a `files/` folder beside it, which is the shape
     backupNow() writes — so restoring a backup folder restores the media too,
     not just the words. Board ids survive an import of a whole export, so the
     copy lands in the folder the notes already point at. */
  if (r.path && FILES && FILES.adoptAttachments) {
    for (const b of state.boards) {
      if (b.enc) continue;
      const urls = attachmentUrls(b);
      if (!urls.length) continue;
      const got = await FILES.adoptAttachments(r.path, urls, b.id);
      if (got && got.map) relinkAttachments(b, got.map);
    }
  }
  /* Undo cannot reach across an import any more: the stack holds notes and
     frames, and after this the board they belonged to may not exist. Clearing
     it is honest — offering an undo that would restore one board's contents on
     top of another's is worse than offering none. */
  clearHistory();
  renderBoardRail(); render(); applySettings(); applyLang();
  save();
  closeSettings();
  toast(t('msg.imported'));
}
