/* Mental Board — settings.js
   The settings panel and every dialog behind it.

   Part 17 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 15. settings UI + dialogs ─────────────── */
/* ---- the line at the foot of the panel ----
   The hint for whatever row the pointer or the focus is on. The hints are the
   same `p.set-note` elements that used to sit under each control — they stay
   in the DOM, hidden, so filterSettings() still searches them — and a unit is
   a control plus every note that immediately follows it, exactly as the
   search groups them. Nothing under the pointer: the footer says so, quietly. */
const DESC_UNIT = '.set-row, .set-check, .theme-grid, .ct-box, .path-box, .set-btns, .paper-row, #statusList, #tplList, .keys';
/* ---- the space around a note's writing (2.4) ----
   Four sliders over one example note. The note is a real `.note` reading the
   same --pad-* properties as every note on the board, so what it shows is not
   an illustration of the setting: it is the setting. Dragging writes straight
   to <body> through applyNotePad() — no re-render, the board behind the panel
   reflows with it — and the save waits for the hand to come off. */
function paintPadStudio() {
  const p = state.settings.notePad || PAD_PRESETS.cosy;
  PAD_SIDES.forEach((k) => {
    const K = k.toUpperCase();
    const inp = $('pad' + K), val = $('pad' + K + 'Val');
    if (inp && +inp.value !== p[k]) inp.value = p[k];
    if (val) val.textContent = num(p[k]) + ' px';
  });
  const eg = $('padEg');
  if (eg) paintColor(eg, state.settings.noteColor || 'default', 'default');
}
function wirePadStudio() {
  const box = $('padStudio');
  if (!box) return;
  box.querySelectorAll('input[type="range"]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const s = state.settings;
      const v = clamp(Math.round(+inp.value || 0), 0, PAD_MAX);
      const p = Object.assign({}, s.notePad);
      if ($('padLink').checked) PAD_SIDES.forEach((k) => { p[k] = v; });
      else p[inp.dataset.side] = v;
      s.notePad = p;
      s.noteDensity = padPreset(p);
      applyNotePad();
      document.body.dataset.density = s.noteDensity;
      $('densitySeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.density === s.noteDensity));
      paintPadStudio();
    });
    inp.addEventListener('change', () => { ghostCache.clear(); saveSoon(); });
  });
}

function settingsHintFor(el) {
  const unit = el && el.closest ? el.closest(DESC_UNIT) : null;
  if (!unit) return '';
  const out = [];
  let n = unit.nextElementSibling;
  while (n && n.matches('p.set-note')) {
    // the lines that stay inline are content, not commentary on the row above
    if (n.id === 'setVersion' || n.id === 'setStats') break;
    const txt = n.textContent.trim();
    if (txt && !n.classList.contains('hidden')) out.push(txt);
    n = n.nextElementSibling;
  }
  return out.join(' ');
}
function wireSettingsDesc() {
  const panes = $('setPanes'), desc = $('setDesc');
  if (!panes || !desc) return;
  const show = (el) => {
    const html = settingsDescHtml(el);      // the name, what it does, and its default (3.0)
    desc.innerHTML = html;
    desc.classList.toggle('on', !!html);
  };
  panes.addEventListener('mouseover', (e) => show(e.target));
  panes.addEventListener('mouseleave', () => show(null));
  panes.addEventListener('focusin', (e) => show(e.target));
  desc.dataset.empty = t('set.descEmpty');
}

function openSettings() {
  $('settings').classList.remove('hidden');
  /* A search left over from last time would open the panel on a filtered list
     with a box the user has to notice before any of it makes sense. */
  const box = $('setSearch');
  if (box) box.value = '';
  clearSettingsFilter();
  /* Before syncSettingsUI(), which paints from the cache. This is the one place
     the two expensive figures are worked out as a matter of course; everything
     else that can change them says so explicitly. */
  refreshSettingsStats();
  syncSettingsUI();
  renderTemplateList();
}
function closeSettings() { $('settings').classList.add('hidden'); }

/* Eighteen cards in one wall read as a swatch book, not as a choice: nothing
   tells you where the light ones stop and the dark ones start, so you scan the
   lot every time. Split under two headings and the half you are not in that
   moment stops competing for attention. Both halves are always shown — hiding
   one would make "swap between your light and dark picks" impossible to set
   up, which is the whole point of the two modes above.

   Built from THEMES rather than from a list of its own, so adding a theme is
   a row in that array and a token block in css/later.css and nothing here.
   See MAP.md §3c. */
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
/* --- finding a setting ---------------------------------------------------

   Nine tabs is a much better answer than one long scroll, and it is still the
   wrong answer to "where is the thing that turns off the note buttons" — you
   have to already know it lives under Notes. Typing in the box shows every
   matching row from every pane at once.

   How it groups, and why: the panes are a flat list of rows, checkboxes,
   button strips and hint paragraphs, and a hint belongs to the control above
   it. So a **unit** is one control plus every `p.set-note` that immediately
   follows it, matched on their combined text — which means searching for
   "bin" finds the trash row through the wording of its own explanation, not
   only through its label. Hiding a row and leaving its hint behind, or the
   reverse, is what makes a filtered list look broken.

   Three rules keep it honest:

   - **Headings follow their content.** A pane's `h3` is shown when anything in
     that pane matched, and a `.set-sub-h` when anything under it did. Results
     with no heading over them are a list of controls with no idea which part of
     the app they belong to.
   - **A row the panel itself has hidden stays hidden.** `pairRow`, `clockRow`,
     `customBox` and the rest carry `.hidden` when they do not apply, and that
     class is `!important`, so search cannot reveal one — but it could still
     count it as a match and draw a heading over nothing. They are skipped.
   - **Nothing is matched against markup.** The text comes from `textContent`
     and goes through `foldSearch()` on both sides, so the box finds Arabic the
     way Ctrl+F does — see §4a.

   `sf-off` and not `.hidden`, deliberately: `.hidden` is the panel's own
   channel for "this control does not apply right now", and one mechanism
   writing to another's flag is how a control ends up permanently invisible. */
const SF_OFF = 'sf-off';

function settingsUnits(pane) {
  const paneHead = pane.querySelector(':scope > h3');
  const units = [];
  let sub = null, unit = null;
  [...pane.children].forEach((el) => {
    if (el.tagName === 'H3') { sub = (el === paneHead) ? null : el; unit = null; return; }
    // a hint belongs to the control above it
    if (unit && el.matches('p.set-note')) {
      unit.els.push(el);
      unit.text += ' ' + (el.textContent || '');
      return;
    }
    unit = { sub, els: [el], text: el.textContent || '' };
    units.push(unit);
  });
  return { paneHead, units };
}

function clearSettingsFilter() {
  const panes = $('setPanes');
  if (!panes) return;
  panes.querySelectorAll('.' + SF_OFF).forEach((el) => el.classList.remove(SF_OFF));
  $('setNoMatch').classList.add('hidden');
  document.body.classList.remove('set-searching');
  showSetTab(setTab);            // back to whichever tab was open
}

function filterSettings(raw) {
  const q = foldSearch(String(raw == null ? '' : raw).trim());
  const panes = $('setPanes');
  if (!panes) return;
  if (!q) { clearSettingsFilter(); return; }

  document.body.classList.add('set-searching');
  let total = 0;
  panes.querySelectorAll('[data-pane]').forEach((pane) => {
    /* Every pane on screen at once. `.on` is what makes a pane visible and the
       tabs are what normally set it; while the box has something in it the
       tabs mean nothing, which is why clicking one clears the box. */
    pane.classList.add('on');
    const { paneHead, units } = settingsUnits(pane);
    const subs = new Set();
    let hit = false;
    units.forEach((u) => {
      // a control the panel has switched off is not a result, hidden or not
      const off = u.els[0].classList.contains('hidden');
      const on = !off && foldSearch(u.text).includes(q);
      u.els.forEach((el) => el.classList.toggle(SF_OFF, !on));
      if (!on) return;
      total++; hit = true;
      if (u.sub) subs.add(u.sub);
    });
    pane.querySelectorAll(':scope > h3').forEach((h) => {
      const keep = (h === paneHead) ? hit : subs.has(h);
      h.classList.toggle(SF_OFF, !keep);
    });
    pane.classList.toggle(SF_OFF, !hit);
  });

  const none = $('setNoMatch');
  none.textContent = t('set.searchNone', { q: String(raw).trim() });
  none.classList.toggle('hidden', total > 0);
}

function wireSetTabs() {
  const nav = $('setNav');
  if (!nav) return;
  /* Picking a tab is picking a place, and the search is the other way of
     finding one — so a click here empties the box rather than fighting it.
     `setTab` is assigned first so clearSettingsFilter()'s own showSetTab()
     lands on the tab that was just asked for. */
  nav.querySelectorAll('.set-tab').forEach((b) => b.addEventListener('click', () => {
    setTab = b.dataset.tab;
    const desc = $('setDesc');
    if (desc) { desc.innerHTML = ''; desc.classList.remove('on'); }    // a row on the last tab is not described on this one
    const box = $('setSearch');
    if (box && box.value) { box.value = ''; clearSettingsFilter(); return; }
    showSetTab(b.dataset.tab);
  }));
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

/* --- the two figures that are expensive to work out ----------------------

   The word count walks every note on every board, and the file count is a
   readdir + a stat per file, per board, straight through the preload bridge on
   the UI thread. Both used to be inside syncSettingsUI(), which runs on *every*
   control in the panel: clicking a theme card, nudging the rope thickness or
   switching a tab paid for a full directory scan of the attachment store and a
   pass over every word the user has ever written. On a handful of boards with a
   few hundred files that is a visible hitch on a control that should feel
   instant — and the clock tick in §3 called it once a minute for free.

   Neither figure can change while the panel sits open unless something in here
   changed it, so they are computed when the panel opens and re-computed by the
   handful of actions that move them. Everything else paints the cached text.

   Cached as the finished strings rather than as numbers: they are translated,
   and applyLang() calls refreshSettingsStats() anyway. */
let statsCache = null;
/* Something that moves one of the two figures has happened. Nulling the cache
   rather than recomputing here means the cost is paid once, on the next paint,
   however many of these fire in a row. */
function markStatsStale() { statsCache = null; }
function computeSettingsStats() {
  /* Count across every board, not just the open one. "Your board" in Settings
     is about the file on disk, and the file holds all of them — a word count
     that silently ignored four boards would be worse than none. */
  syncActiveBoard();
  let notes = 0, frames = 0, links = 0, words = 0;
  state.boards.forEach((b) => {
    notes += b.notes.length; frames += b.frames.length; links += b.links.length;
    b.notes.forEach((n) => { words += noteText(n).split(/\s+/).filter(Boolean).length; });
  });
  /* What the boards are actually carrying. Counted from the folder, not from
     the notes — the whole point of the row next to it is the gap between the
     two, and a figure derived from the notes could never show one. */
  let fileN = 0, bytes = 0;
  if (FILES && FILES.listAttachments) {
    state.boards.forEach((b) => {
      (FILES.listAttachments(b.id) || []).forEach((f) => { fileN++; bytes += f.size || 0; });
    });
  }
  statsCache = {
    stats: t('set.stats', {
      boards: t('count.boards', { n: state.boards.length }),
      notes: t('count.notes', { n: notes }),
      frames: t('count.frames', { n: frames }),
      links: t('count.links', { n: links }),
      words: t('count.words', { n: words })
    }),
    files: fileN ? t('set.filesCount', { n: fileN, size: fmtBytes(bytes) }) : t('set.filesNone'),
    fileN
  };
}
function refreshSettingsStats() { computeSettingsStats(); paintSettingsStats(); }
function paintSettingsStats() {
  if (!statsCache) computeSettingsStats();
  const files = $('filesCount');
  if (files) {
    files.textContent = statsCache.files;
    $('btnCleanFiles').disabled = !statsCache.fileN || !canCleanFiles();
  }
  const st = $('setStats');
  if (st) st.textContent = statsCache.stats;
}

/* --- what a new note starts as -----------------------------------------
   The same nine swatches the right-click menu offers, painted from the same
   custom properties, so the colour you pick here is visibly the colour a note
   will arrive in. Deliberately not a dropdown of names: "amber" and "orange"
   are two words for the same idea until you see them side by side.

   Nothing here reaches an existing note. That is the whole reason this row can
   sit under a heading of its own — see .set-sub-h in css/later.css §48. */
function buildNoteColorSwatches() {
  const wrap = $('noteColorSwatches');
  if (!wrap) return;
  wrap.innerHTML = COLORS.map((c) =>
    `<button data-nc="${c}" title="${esc(te('colour.' + c))}" style="background:var(--c-${c}-c)"></button>`).join('');
  wrap.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.settings.noteColor = b.dataset.nc;
    syncSettingsUI(); saveSoon();
  }));
}

/* --- back to how the app arrived ----------------------------------------

   Settings only. Not one note, board, template or status is touched, and the
   dialog says so in those words — "reset" is a word people have been burned by
   in other apps, and somebody who reads it as "delete everything" will never
   press it even when it is the thing they need.

   Three fields survive, and each for a different reason:

     backupDir / lastBackup  a folder the user chose on this machine, and the
                             record of what has been written to it. Forgetting
                             it would silently stop the off-disk copies while
                             the checkbox still said they were on.
     lang                    because the toast confirming what just happened is
                             written in it. Resetting the language as part of a
                             reset means the one sentence explaining the change
                             arrives in a language the user may not read.

   Everything else, including the theme, goes back to the defaults. Only
   `state.settings` is replaced — `appVersion`, `boards`, `templates` and
   `statuses` all live one level up and are not touched, which is what the
   confirm dialog promises in those words. */
async function resetSettings() {
  const ok = await confirmDlg(t('confirm.resetTitle'), t('confirm.resetBody'), t('confirm.resetOk'));
  if (!ok) return;
  const keep = state.settings;
  const fresh = defaults().settings;
  fresh.lang = keep.lang;
  fresh.backupDir = keep.backupDir;
  fresh.lastBackup = keep.lastBackup;
  state.settings = fresh;
  /* applySettings() before the rebuilders: it writes every `data-` attribute
     the panel's own previews read, so a swatch or a paper sample built first
     would be drawn against the old theme for one frame. */
  applySettings();
  buildThemeGrid(); buildAccentSwatches(); buildGridPicker();
  buildLinkSwatches(); buildNoteColorSwatches();
  resetLinks(); drawLinks();   // the board style and the rope settings may have moved them
  syncSettingsUI();
  save();
  toast(t('msg.settingsReset'), 4200);
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
  $('autosaveSeg').querySelectorAll('button').forEach((b) => {
    b.textContent = t('set.minutes', { n: num(+b.dataset.autosave) });
    b.classList.toggle('on', +b.dataset.autosave === s.autosaveMin);
  });
  $('zoomSpeed').value = s.zoomSpeed;
  $('zoomSpeedVal').textContent = pct(s.zoomSpeed);
  $('setGuides').checked = !!s.guides;
  $('setFocusMode').checked = !!s.focusMode;
  $('perfSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.perf === s.perf));
  /* Say which one Auto landed on, and why. "Auto" that will not tell you its
     answer is a setting you cannot reason about — and the whole question this
     control exists to settle is "is my machine being treated as the slow one?" */
  const modeName = (m) => t(m === 'lite' ? 'set.perfLite' : m === 'balanced' ? 'set.perfBalanced' : 'set.perfFull');
  const modeHint = (m) => t(m === 'lite' ? 'set.perfLiteHint' : m === 'balanced' ? 'set.perfBalancedHint' : 'set.perfFullHint');
  $('perfHint').textContent = (s.perf === 'auto'
    ? t('set.perfAutoHint', { mode: modeName(detectPerf()) }) + (perfReason ? ' (' + perfReason.replace(/^ANGLE \(|\)$/g, '').slice(0, 80) + ')' : '') + ' ' + modeHint(detectPerf())
    : modeHint(s.perf)) +
    (noGpu ? ' ' + t('set.perfNoGpu') : '');
  $('setSounds').checked = !!s.sounds;
  $('soundVol').value = s.soundVol;
  $('soundVolVal').textContent = pct(s.soundVol);
  $('soundVol').disabled = !s.sounds;
  // the switches, named in the language — literal keys so check-lang.js sees each one
  const keyNames = { off: te('set.keyOff'), blue: te('set.keyBlue'), brown: te('set.keyBrown'), red: te('set.keyRed'),
    black: te('set.keyBlack'), membrane: te('set.keyMembrane'), typewriter: te('set.keyTypewriter') };
  $('setKeySounds').innerHTML = KEY_SOUNDS.map((k) => `<option value="${k}"${k === s.keySounds ? ' selected' : ''}>${keyNames[k]}</option>`).join('');
  $('keyVol').value = s.keyVol;
  $('keyVolVal').textContent = pct(s.keyVol);
  $('keyVol').disabled = s.keySounds === 'off';
  $('corkSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.cork === s.cork));
  $('setSoftware').checked = !!s.softwareRender;
  /* Rebuilt rather than re-marked: the row's contents depend on which accent
     is selected — a preset outside the shown nine is appended so it can still
     be seen as chosen — so there is nothing to re-mark until it is rebuilt.
     Ten elements; it costs nothing, and it is never called mid-drag. */
  buildAccentSwatches();
  $('fontScale').value = s.fontScale;
  $('fontScaleVal').textContent = pct(s.fontScale);
  $('setSnap').checked = !!s.snap;
  $('setCompass').checked = !!s.compass;
  $('setMinimap').checked = s.minimap !== false;
  $('setSpell').checked = !!s.spell;
  $('railSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.rail === s.railMode));
  $('shapeSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.shape === s.noteShape));
  $('densitySeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.density === s.noteDensity));
  paintPadStudio();
  $('fontSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.font === s.noteFont));
  $('shadowSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.shadow === s.noteShadow));
  $('motionSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.motion === s.motion));
  /* What a new note starts as. Rebuilt rather than re-marked, for the same
     reason the accent row is: the marked swatch is decided while it is built. */
  buildNoteColorSwatches();
  $('noteColorSwatches').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.nc === s.noteColor));
  $('noteW').value = s.noteW;
  $('noteWVal').textContent = num(s.noteW);
  $('noteH').value = s.noteH;
  $('noteHVal').textContent = num(s.noteH);
  $('setConfirmDelete').checked = !!s.confirmDelete;
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
  paintSettingsStats();
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
  if (DATA && DATA.paths) {
    try {
      const p = DATA.paths();
      $('setPath').textContent = p.root || p.userData;
      $('setVersion').textContent = p.version ? t('set.version', { v: p.version }) : '';
    } catch (_) {}
  } else {
    $('setPath').textContent = t('set.browserMode');
    $('setVersion').textContent = '';
  }
  $('setSafety').textContent = t('set.safety');
  syncSettings30();
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
    // mono is painted as what it is — white on dark, black on light — split corner to corner
    keys.map((k) => `<button data-accent="${k}"${k === cur ? ' class="on"' : ''} title="${te('accent.' + k)}" style="background:${k === 'mono' ? 'linear-gradient(135deg, #ffffff 0 50%, #000000 50% 100%)' : ACCENTS[k]}"></button>`).join('') +
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
  ['Ctrl + C / V / X', 'key.copy'], ['Ctrl + Shift + C', 'kb.copyBoard'], ['Delete', 'key.delete'],
  ['Ctrl + Z', 'key.undo'], ['Ctrl + Shift + Z', 'key.redo'],
  ['Ctrl + Q', 'key.quit'], ['Ctrl + F', 'key.find'], ['Ctrl + B', 'key.boards'], ['Ctrl + P', 'key.palette'],
  ['Ctrl + ,', 'key.settings'], ['Ctrl + .', 'key.focusMode'],
  ['/', 'key.blocks'], ['Ctrl + K', 'key.link'],
  ['Ctrl + Shift + D', 'view.agenda'], ['Ctrl + Shift + K', 'view.kanban'],
  // 2.1
  ['P', 'key.draw'], ['kb.holdPaste', 'key.holdPaste'], ['kb.clickRope', 'key.followRope']
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
  const count = (locked || b.unreadable) ? 0 : b.notes.length + b.frames.length;
  const act = (a, ic, tip) =>
    `<button class="br-act" data-act="${a}" title="${tip}" aria-label="${tip}">${icon(ic)}</button>`;
  return `<div class="br-row${b.id === state.activeBoard ? ' on' : ''}${b.unreadable ? ' unreadable' : ''}" data-board="${esc(b.id)}">
            <button class="br-tile${b.id === state.activeBoard ? ' on' : ''}${b.archived ? ' archived' : ''}"
                    data-board="${esc(b.id)}"
                    data-color="${esc(b.iconColor === 'auto' ? 'default' : b.iconColor)}" title="${b.unreadable ? te('msg.boardUnreadable') : label}">
              <span class="br-ic" style="color:${iconColorVar(b.iconColor)}">${icon(b.unreadable ? 'warning' : (locked ? 'lock' : (b.icon || 'sticky_note_2')))}</span>
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

/* The rows, with a heading over each group. Ungrouped boards first, then
   each group in the order it first appears — the same order the boards are
   kept in, because moveBoardToGroup() keeps them contiguous. */
function railRowsHtml() {
  const shown = state.boards.filter((b) => !b.trash && (!b.archived || state.settings.showArchived));
  let out = '', cur = null;
  shown.filter((b) => !b.group).forEach((b) => { out += boardRowHtml(b); });
  shown.filter((b) => b.group).forEach((b) => {
    if (b.group !== cur) {
      cur = b.group;
      out += `<div class="br-group">${icon('folder')}<span>${esc(cur)}</span></div>`;
    }
    out += boardRowHtml(b);
  });
  return out;
}

function renderBoardRail() {
  const rail = $('boardRail');
  if (!rail) return;
  /* Focus mode reads as 'off' here rather than being a second thing to handle
     everywhere else. That is not only the nav going away: `has-rail` is what
     insets #stage, so leaving it on would hold a rail's width of empty margin
     against the edge of a canvas that has no rail in it. One place, one rule. */
  const mode = state.settings.focusMode ? 'off'
             : (RAIL_MODES.includes(state.settings.railMode) ? state.settings.railMode : 'pinned');
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
    railRowsHtml() +
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
  // the pictures go with them — see carryNotesTo()
  carryNotesTo(notes, target.id).then((n) => { if (n) saveSoon(); });
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
  if (state.settings.focusMode || state.settings.railMode !== 'hover') { setPeek(false); return; }
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
  if (state.settings.focusMode || state.settings.railMode !== 'hover') { setPeek(false); return; }
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
  /* A board the store could not read: the one useful thing is to look at
     the folder. Nothing here may write to it. */
  if (b.unreadable) {
    menu.innerHTML =
      `<div class="cm-label">${icon('warning')}<span>${esc(boardLabel(b))}</span></div>` +
      `<p class="cm-hint">${te('msg.boardUnreadable')}</p>` +
      item('folder', 'folder_open', te('page.openFolder'));
    menu.classList.remove('hidden');
    const w1 = menu.offsetWidth, h1 = menu.offsetHeight;
    menu.style.left = clamp(RTL ? clientX - w1 : clientX, 6, innerWidth - w1 - 6) + 'px';
    menu.style.top = clamp(clientY, 44, innerHeight - h1 - 6) + 'px';
    menu.querySelector('.cm-item').addEventListener('click', () => { closeBoardMenu(); if (DATA && DATA.openBoardFolder) DATA.openBoardFolder(id); });
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
/* `savedRange` is shared with the selection toolbar, which stashes the caret
   in it on every mousedown. The link dialog keeps its own copy — `linkCtx` —
   because the toolbar is free to overwrite the shared one while the dialog is
   open, and it is the dialog's range that says where the link goes.

   **Why /link used to land at the top of the note.** applyLink() called
   closeLinkDialog() first, and closeLinkDialog() cleared the range — so the
   line that put the caret back always saw null, and `editing.focus()` on its
   own puts the caret at the start of a contenteditable. Every link made from
   the dialog was inserted before the first word of the note. The range is
   now read before anything is closed, and a range that no longer sits inside
   the note (the note was re-rendered under the dialog) falls back to the end
   of the note rather than the start. */
let savedRange = null;
let linkCtx = null;          // { range, anchor, note } — what the dialog was opened on
function openLinkDialog() {
  if (!editing) return;
  const s = getSelection();
  const range = s.rangeCount && editing.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null;
  let a = null;
  let node = s.anchorNode;
  if (node && node.nodeType === 3) node = node.parentElement;
  if (node && editing.contains(node)) a = node.closest('a');
  linkCtx = { range, anchor: a, note: editNote };
  $('linkText').value = a ? a.textContent : (range ? range.toString() : '');
  $('linkUrl').value = a && !a.classList.contains('mb-note') ? a.getAttribute('href') || '' : '';
  $('linkRemove').classList.toggle('hidden', !a);
  $('linkDlg').classList.remove('hidden');
  renderLinkNotes();
  setTimeout(() => $('linkUrl').focus(), 30);
}
function closeLinkDialog() { $('linkDlg').classList.add('hidden'); linkCtx = null; }

/* Put the caret back where the dialog was opened. Returns false when the note
   being edited is not the one the dialog was opened on — the link then goes
   nowhere rather than into the wrong note. */
function restoreLinkCaret(ctx) {
  if (!editing || !ctx || ctx.note !== editNote) return false;
  editing.focus();
  const s = getSelection();
  s.removeAllRanges();
  if (ctx.range && editing.contains(ctx.range.commonAncestorContainer)) s.addRange(ctx.range);
  else {
    const r = document.createRange();
    r.selectNodeContents(editing); r.collapse(false);
    s.addRange(r);
  }
  return true;
}
function applyLink() {
  const ctx = linkCtx;
  const text = $('linkText').value.trim();
  let url = $('linkUrl').value.trim();
  closeLinkDialog();
  if (!url || !restoreLinkCaret(ctx)) return;
  /* A Windows path is a perfectly good thing to link to, and this used to turn
     `C:\budget\FY26.xlsx` into `https://C:\budget\FY26.xlsx`. Recognise the two
     shapes a local path comes in — a drive letter and a UNC share — and make a
     real file: URL out of them; leave file: alone; prefix everything else the
     way it always did. */
  url = toLinkHref(url);
  writeLink(ctx, `<a href="${esc(url)}">${esc(text || url)}</a>`, (a) => {
    a.className = ''; a.removeAttribute('data-note'); a.removeAttribute('data-board');
    a.setAttribute('href', url); a.textContent = text || url;
  });
}
/* Editing a link the caret is in changes that link. It used to insert a second
   one at the caret — inside the first, which the browser then split into
   three fragments of two links. */
function writeLink(ctx, html, update) {
  if (ctx.anchor && editing.contains(ctx.anchor)) update(ctx.anchor);
  else insertHTML(html + '&nbsp;');
  normalizeBody(editing);
  persistEdit();
}
function removeLink() {
  const ctx = linkCtx;
  closeLinkDialog();
  if (!restoreLinkCaret(ctx)) return;
  if (ctx.anchor && editing.contains(ctx.anchor)) ctx.anchor.replaceWith(...ctx.anchor.childNodes);
  else document.execCommand('unlink');
  persistEdit();
}

/* ---- the formula window (2.3) ----
   One window for a new formula and for an existing one. It keeps the caret
   the way the link dialog does (restoreLinkCaret), draws the LaTeX live as you
   type, and offers the shapes nobody remembers the spelling of as buttons that
   insert at the cursor in the box. `\ce{…}` is chemistry (mhchem). */
const MATH_SNIPS = {
  'math.groupMath': [
    'x^{2}', 'x_{i}', '\\frac{a}{b}', '\\sqrt{x}', '\\sqrt[n]{x}', 'a^{n}', '\\pm', '\\times', '\\div',
    '\\cdot', '\\neq', '\\leq', '\\geq', '\\approx', '\\infty', '\\pi', '\\alpha', '\\beta', '\\theta',
    '\\lambda', '\\mu', '\\Delta', '\\sum_{i=1}^{n}', '\\prod_{i=1}^{n}', '\\int_{a}^{b}', '\\lim_{x\\to 0}',
    '\\log_{b} x', '\\sin\\theta', '\\vec{v}', '\\overline{x}', '|x|', '\\binom{n}{k}',
    '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', '\\to', '\\Rightarrow', '\\in', '\\mathbb{R}', '^{\\circ}'
  ],
  'math.groupChem': [
    '\\ce{H2O}', '\\ce{CO2}', '\\ce{H2SO4}', '\\ce{SO4^2-}', '\\ce{Fe^3+}', '\\ce{->}', '\\ce{<=>}',
    '\\ce{A + B -> C}', '\\ce{2H2 + O2 -> 2H2O}', '\\ce{NaCl(aq)}', '\\ce{^{14}_{6}C}', '\\ce{CH3-CH2-OH}',
    '\\ce{CO2 ^}', '\\ce{BaSO4 v}', '\\ce{->[\\Delta]}'
  ]
};
let mathCtx = null;          // { range, el, note }
let mathBlock = false;

function openMathDialog(el, opts) {
  if (!editing) return;
  const o = opts || {};
  const s = getSelection();
  const range = s.rangeCount && editing.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null;
  mathCtx = { range, el: el && editing.contains(el) ? el : null, note: editNote };
  const tex = mathCtx.el ? mathCtx.el.getAttribute('data-tex') || '' : (o.tex || '');
  mathBlock = mathCtx.el ? mathCtx.el.classList.contains('mb-math-block') : !!o.block;
  $('mathTex').value = tex;
  $('mathRemove').classList.toggle('hidden', !mathCtx.el);
  syncMathKind();
  buildMathSnips();
  drawMathPreview();
  $('mathDlg').classList.remove('hidden');
  setTimeout(() => { const ta = $('mathTex'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
}
function closeMathDialog() { $('mathDlg').classList.add('hidden'); mathCtx = null; }
function syncMathKind() {
  $('mathKind').querySelectorAll('[data-mk]').forEach((b) => b.classList.toggle('on', (b.dataset.mk === 'block') === mathBlock));
}
function drawMathPreview() {
  const tex = $('mathTex').value;
  const box = $('mathPreview');
  box.classList.toggle('empty', !tex.trim());
  if (!tex.trim()) { box.textContent = t('math.empty'); return; }
  renderTex(tex, box, mathBlock);
}
let mathSnipsBuilt = false;
function buildMathSnips() {
  if (mathSnipsBuilt) return;
  mathSnipsBuilt = true;
  const box = $('mathSnips');
  box.textContent = '';
  for (const [group, list] of Object.entries(MATH_SNIPS)) {
    const h = document.createElement('div');
    h.className = 'mx-group';
    h.textContent = t(group);
    box.appendChild(h);
    const row = document.createElement('div');
    row.className = 'mx-row';
    list.forEach((tex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-snip';
      b.title = tex;
      renderTex(tex, b, false);
      b.addEventListener('mousedown', (e) => e.preventDefault());     // keep the box's caret
      b.addEventListener('click', () => insertMathSnip(tex));
      row.appendChild(b);
    });
    box.appendChild(row);
  }
}
function insertMathSnip(tex) {
  const ta = $('mathTex');
  const a = ta.selectionStart, z = ta.selectionEnd;
  const v = ta.value;
  const pad = a > 0 && /[\w}]$/.test(v.slice(0, a)) && /^\\/.test(tex) ? ' ' : '';
  ta.value = v.slice(0, a) + pad + tex + v.slice(z);
  const at = a + pad.length + tex.length;
  ta.focus();
  ta.setSelectionRange(at, at);
  drawMathPreview();
}
function applyMath() {
  const ctx = mathCtx;
  const tex = $('mathTex').value.trim();
  const block = mathBlock;
  closeMathDialog();
  if (!ctx || !editing || ctx.note !== editNote) return;
  if (ctx.el && editing.contains(ctx.el)) {
    if (!tex) { ctx.el.remove(); persistEdit(); return; }
    let el = ctx.el;
    if (el.classList.contains('mb-math-block') !== block) {
      // inline ↔ own line is a different tag, so it is a new element in the same place
      const fresh = document.createElement(block ? 'div' : 'span');
      fresh.className = 'mb-math' + (block ? ' mb-math-block' : '');
      el.replaceWith(fresh);
      el = fresh;
    }
    el.setAttribute('data-tex', tex);
    paintMath(editing);
    normalizeBody(editing);
    ensureTail(editing);
    editing.focus();
    persistEdit();
    return;
  }
  if (!tex || !restoreLinkCaret(ctx)) return;
  insertMath(tex, block);
  ensureTail(editing);
  persistEdit();
}
function removeMath() {
  const ctx = mathCtx;
  closeMathDialog();
  if (ctx && ctx.el && editing && editing.contains(ctx.el)) { ctx.el.remove(); editing.focus(); persistEdit(); }
}
function wireMathDialog() {
  $('mathOk').addEventListener('click', applyMath);
  $('mathCancel').addEventListener('click', closeMathDialog);
  $('mathRemove').addEventListener('click', removeMath);
  $('mathTex').addEventListener('input', drawMathPreview);
  $('mathTex').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyMath(); }
    if (e.key === 'Escape') { e.preventDefault(); closeMathDialog(); editing && editing.focus(); }
  });
  $('mathKind').querySelectorAll('[data-mk]').forEach((b) => b.addEventListener('click', () => {
    mathBlock = b.dataset.mk === 'block';
    syncMathKind();
    drawMathPreview();
  }));
  $('mathDlg').addEventListener('mousedown', (e) => { if (e.target === $('mathDlg')) closeMathDialog(); });
}

/* ---- a link to a note ----
   The dialog also offers the notes on your boards: type part of a title in the
   address field and pick one. The link is `a.mb-note` with the note's id and
   its board's, and clicking it flies there — switching boards first if it has
   to. Notes on the open board come first, because that is usually what you
   meant; a locked board is skipped, it has nothing to search. */
function linkNoteMatches(q) {
  const out = [];
  const fq = foldSearch(q || '');
  const boards = [state.boards.find((b) => b.id === state.activeBoard), ...state.boards.filter((b) => b.id !== state.activeBoard)];
  for (const b of boards) {
    if (!b || b.trash || isLocked(b)) continue;
    const notes = b.id === state.activeBoard ? state.notes : (b.notes || []);
    for (const n of notes) {
      if (n.pic || (editNote && n.id === editNote.id)) continue;
      const title = noteTitle(n);
      if (fq && !foldSearch(title).includes(fq)) continue;
      out.push({ n, b, title });
      if (out.length >= 7) return out;
    }
    if (!fq && out.length) return out;      // nothing typed: this board's notes only
  }
  return out;
}
function renderLinkNotes() {
  const box = $('linkNotes');
  if (!box) return;
  const q = $('linkUrl').value.trim();
  // something that is plainly an address is not a search for a note
  const looksLikeUrl = /^[a-z][\w+.-]*:|^www\.|^\\\\|^[a-z]:\\|\.[a-z]{2,}(\/|$)/i.test(q);
  const hits = looksLikeUrl ? [] : linkNoteMatches(q);
  box.classList.toggle('hidden', !hits.length);
  box.innerHTML = hits.length
    ? `<div class="ln-head">${te('link.toNote')}</div>` + hits.map(({ n, b, title }) =>
        `<button class="ln-item" data-note="${esc(n.id)}" data-board="${esc(b.id)}">${icon('sticky_note_2')}<span class="ln-t">${esc(title)}</span>${b.id !== state.activeBoard ? `<span class="ln-b">${esc(boardLabel(b))}</span>` : ''}</button>`).join('')
    : '';
  box.querySelectorAll('.ln-item').forEach((el) => el.addEventListener('click', () => applyNoteLink(el.dataset.note, el.dataset.board)));
}
function applyNoteLink(noteId, boardId) {
  const ctx = linkCtx;
  const b = state.boards.find((x) => x.id === boardId);
  const n = b && (b.id === state.activeBoard ? state.notes : b.notes || []).find((x) => x.id === noteId);
  const text = $('linkText').value.trim() || (n ? noteTitle(n) : '');
  closeLinkDialog();
  if (!n || !restoreLinkCaret(ctx)) return;
  writeLink(ctx, `<a class="mb-note" data-note="${esc(noteId)}" data-board="${esc(boardId)}" href="#">${esc(text)}</a>`, (a) => {
    a.className = 'mb-note'; a.dataset.note = noteId; a.dataset.board = boardId;
    a.setAttribute('href', '#'); a.textContent = text;
  });
}
// following one: switch boards if it lives elsewhere, then fly to it
async function followNoteLink(a) {
  const id = a.dataset.note, bid = a.dataset.board || state.activeBoard;
  if (bid !== state.activeBoard) {
    const b = boardById(bid);
    if (!b || !(b.notes || []).some((n) => n.id === id)) { toast(t('msg.noteGone')); return; }
    await switchBoard(bid);
    if (state.activeBoard !== bid) return;          // the switch was refused (locked, unreadable)
  }
  goToNote(id);
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
   Everything the app already does to protect a board — the .bak, the dated
   copies in Backups\, a copy before every version — lands inside My Boards,
   on the same disk as the boards. That is the right answer to "I deleted the
   wrong thing" and no answer at all to a dead drive or a stolen laptop, which
   for anyone keeping real work in here is the bigger of the two risks.

   Two ways out, and they answer different questions:
   - **Back up now** mirrors the whole My Boards folder into a folder chosen
     once — a synced drive, a stick, a share — copying only what is new or
     changed, and never deleting anything there. Cheap enough to run every day
     on launch, which it does when `backupAuto` is on.
   - **Save a full copy…** writes a complete, dated copy of My Boards wherever
     you point, every time. For "before I try something".

   `lastBackup` is stored so the row can say when, and so the automatic copy
   knows whether today's has already been written. */
/* todayKey(), not toISOString(): the second one is today in UTC, which rolls
   over at 03:00 in Riyadh and 20:00 in Los Angeles. maybeAutoBackup() compares
   this name against the day it last ran, so a mismatched calendar meant the
   automatic copy could fire twice on one local day or skip one entirely. */
const backupName = () => `mental-board-${todayKey()}.json`;

// the store's refusal has its own words; anything else is the system's
const backupError = (r) => (r && r.error === 'inside My Boards')
  ? t('msg.backupInside') : t('msg.backupFailed', { err: (r && r.error) || '?' });

async function chooseBackupFolder() {
  if (!DATA || !DATA.pickBackupDir) { toast(t('msg.needDesktop')); return; }
  const dir = await DATA.pickBackupDir();
  if (!dir) return;                       // cancelled is not a failure
  /* A copy of My Boards inside My Boards copies itself until Windows refuses
     the path. The store refuses it too; saying so here keeps the bad folder
     from being remembered and failing every morning. */
  const norm = (p) => String(p || '').toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '');
  const rootDir = norm(DATA.paths && DATA.paths().root);
  const picked = norm(dir);
  if (rootDir && (picked === rootDir || picked.startsWith(rootDir + '\\'))) {
    toast(t('msg.backupInside'), 7000);
    return;
  }
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
  /* The whole My Boards folder, mirrored: every board, every file it carries,
     the settings. Written to disk first so the mirror is of *now*. */
  await saveNow();
  const r = await DATA.backupTo(dir);
  if (!r || r.error) {
    toast(backupError(r), 7000);
    return;
  }
  state.settings.lastBackup = Date.now();
  save();
  syncSettingsUI();
  if (!quiet) toast(r.files ? t('msg.backedUpFiles', { n: r.files }) : t('msg.backedUp'));
}

/* A complete, dated copy wherever the user points — a new folder every time.
   Written to disk first so the copy is of *now*. */
async function backupAll() {
  if (!DATA || !DATA.backupAll) { toast(t('msg.needDesktop')); return; }
  await saveNow();
  const r = await DATA.backupAll();
  if (!r) return;                       // cancelled
  if (r.error) { toast(backupError(r), 7000); return; }
  toast(t('msg.backedUpAllTo', { n: r.files, path: r.path }), 7000);
}

/* Everything, gone — to the Recycle Bin. Asked twice: once with the count of
   what is about to go, once more with the way out named. The window reloads
   afterwards so nothing held in memory is written over the fresh start, and
   `loadFailed` is set first so the debounce cannot get a write in between. */
async function eraseEverything() {
  if (!DATA || !DATA.eraseAll || !DATA.tally) { toast(t('msg.needDesktop')); return; }
  const n = DATA.tally();
  const ok1 = await confirmDlg(
    t('confirm.eraseAllTitle'),
    t('confirm.eraseAllBody', { boards: n.boards, files: n.files, size: fmtBytes(n.bytes) }),
    t('confirm.eraseAllOk'));
  if (!ok1) return;
  const ok2 = await confirmDlg(t('confirm.eraseAllTitle2'), t('confirm.eraseAllBody2'), t('confirm.eraseAllOk2'));
  if (!ok2) return;
  clearTimeout(saveTimer); saveTimer = null;
  loadFailed = true;                     // no write may land from here on
  exitEdit();
  const r = await DATA.eraseAll();
  if (!r || !r.ok) {
    loadFailed = false;
    toast(t('msg.eraseAllFailed', { err: (r && r.error) || '?' }), 8000);
    return;
  }
  location.reload();
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
    if (!html || (html.indexOf('mbf:') < 0 && html.indexOf('file:') < 0)) return;
    const d = document.createElement('div');
    d.innerHTML = html;
    d.querySelectorAll('[src], [href], [data-thumb]').forEach((el) => {
      const v = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('data-thumb') || '';
      if (isFileUrl(v)) out.add(v);
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
  // a board's background is a file in its folder that no note mentions
  state.boards.forEach((b) => { if (b.bg && b.bg.file) out.add(`mbf://${b.id}/${encodeURIComponent(b.bg.file)}`); });
  /* The undo steps are raw JSON, not markup, so they are read with a regex
     rather than parsed into a document. A geom step holds only numbers and has
     no `json` at all, hence the filter. `&amp;` comes back to `&` because the
     URL was written through esc() on its way into the markup. */
  [...undoStack, ...redoStack].forEach((step) => {
    [step.json, step.other && step.other.json].filter(Boolean).forEach((json) => {
      (json.match(/(?:mbf|file):[^"\\]+/g) || []).forEach((u) => out.add(u.replace(/&amp;/g, '&')));
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
  /* The same for a board whose board.json would not parse: its folder is
     still in the store's map, its notes are not in memory, so every file in
     it would look unused and go. */
  const dead = state.boards.filter((b) => b.unreadable);
  if (dead.length) { toast(t('msg.cleanUnreadable', { name: dead.map(boardLabel).join(', ') }), 6000); return; }

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
  markStatsStale();          // files just left the folder this row counts
  syncSettingsUI();
}

/* --- import --------------------------------------------------------------- */
/* Import *adds*. It used to replace every board with the file's — which made
   sense when the file was the whole store and does not now that each board
   is its own folder. A 2.0 board.json, a 1.x single-board export and a 1.x
   everything-export all arrive as boards added beside the ones here; a 1.0.x
   file with notes at the top level is read as one board. */
async function importBoard() {
  if (!DATA || !DATA.importBoard) { toast(t('msg.needDesktop')); return; }
  const r = await DATA.importBoard();
  if (!r) return;
  if (r.error) { toast(t('msg.readFailed')); return; }
  let parsed = r.data;
  if (parsed && !looksLikeBoards(parsed) && (Array.isArray(parsed.notes) || Array.isArray(parsed.frames))) {
    parsed = { boards: [{ name: '', icon: 'sticky_note_2', notes: parsed.notes, frames: parsed.frames, links: parsed.links, view: parsed.view, nextZ: parsed.nextZ }] };
  }
  if (!looksLikeBoards(parsed)) { toast(t('msg.notOurFile')); return; }
  closeSettings();
  await importBoardsFrom(parsed, r.beside || '', '');
}

/* ─── 3.0. the options screen: wallpaper, drawing, the app's face, and every choice as ‹ value › ───
   Settings ▸ Wallpaper (js/wallpaper.js), Settings ▸ Drawing (the paper,
   Handwrite it, js/sketch.js and js/handwrite.js) and the interface font with
   the font files behind it (main.js font:pick). Wired once by
   wireSettings30(), painted by syncSettings30() from syncSettingsUI(). */
function wireSettings30() {
  const s = () => state.settings;
  const seg = (id, attr, key, after) => $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset[attr];
    s()[key] = v;
    applySettings(); if (after) after(v);
    syncSettingsUI(); saveSoon();
  }));
  seg('uiFontSeg', 'uifont', 'uiFont');
  seg('skPaperSeg', 'skpaper', 'sketchPaper', () => { if (sk) { buildSketchBar(); $('sketchDlg').style.setProperty('--sk-bg', sketchPaper(sk.n)); } });
  seg('hwHandSeg', 'hwhand', 'hwHand', () => hwGlyphCache.clear());
  seg('wpKindSeg', 'wp', 'wpKind');
  const check = (id, key) => $(id).addEventListener('change', () => { s()[key] = $(id).checked; applySettings(); syncSettingsUI(); saveSoon(); });
  check('setHwAnimate', 'hwAnimate');
  check('setHwKeep', 'hwKeep');
  check('setWpSound', 'wpSound');
  check('setWpGrid', 'wpGrid');
  // the sliders paint as they move and the wallpaper follows, without a full repaint of the panel
  const range = (id, key, fmt) => $(id).addEventListener('input', () => {
    s()[key] = +$(id).value;
    $(id + 'Val').textContent = fmt(s()[key]);
    applyWallpaper(); saveSoon();
  });
  range('wpOpacity', 'wpOpacity', pct);
  range('wpDim', 'wpDim', pct);
  range('wpBlur', 'wpBlur', (v) => num(v) + ' px');
  range('wpAmount', 'wpAmount', pct);
  // a link is kept as it is typed, and the video changes once it is a link to one
  $('wpUrl').addEventListener('input', () => {
    s().wpUrl = $('wpUrl').value.trim().slice(0, 500);
    if (s().wpKind === 'youtube') applyWallpaper();
    paintWpUrlHint(); saveSoon();
  });
  $('wpUrl').addEventListener('keydown', (e) => e.stopPropagation());
  $('hwLang').addEventListener('change', () => { s().hwLang = $('hwLang').value; saveSoon(); });
  // the face from a file the user owns
  for (const kind of ['latin', 'arabic']) {
    const K = kind === 'latin' ? 'Latin' : 'Arabic';
    $('font' + K + 'Pick').addEventListener('click', async () => {
      if (!FILES || !FILES.pickFont) return;
      const r = await FILES.pickFont(kind);
      if (!r) return;
      if (r.error) { toast(t('set.fontFailed')); return; }
      s().uiFontNames = Object.assign({}, s().uiFontNames, { [kind]: r.name });
      await loadUiFont(kind);
      syncSettingsUI(); saveSoon();
      toast(t('set.fontLoaded', { name: r.name }));
    });
    $('font' + K + 'Forget').addEventListener('click', async () => {
      if (FILES && FILES.forgetFont) await FILES.forgetFont(kind);
      s().uiFontNames = Object.assign({}, s().uiFontNames, { [kind]: '' });
      for (const f of [...document.fonts]) if (f.family === UI_FONT_FAMILY[kind]) document.fonts.delete(f);
      syncSettingsUI(); saveSoon();
    });
  }
  stepperize();
}
function paintWpUrlHint() {
  const s = state.settings, bad = s.wpKind === 'youtube' && s.wpUrl && !(videoOf(s.wpUrl) || {}).kind;
  $('wpUrlHint').textContent = t(bad ? 'set.wpUrlBad' : 'set.wpUrlHint');
  $('wpUrlRow').classList.toggle('bad', !!bad);
}
function syncSettings30() {
  const s = state.settings;
  const on = (id, attr, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === String(v)));
  on('uiFontSeg', 'uifont', s.uiFont);
  on('skPaperSeg', 'skpaper', s.sketchPaper);
  on('hwHandSeg', 'hwhand', s.hwHand);
  on('wpKindSeg', 'wp', s.wpKind);
  $('setHwAnimate').checked = !!s.hwAnimate;
  $('setHwKeep').checked = !!s.hwKeep;
  $('setWpSound').checked = !!s.wpSound;
  $('setWpGrid').checked = !!s.wpGrid;
  for (const [id, fmt] of [['wpOpacity', pct], ['wpDim', pct], ['wpBlur', (v) => num(v) + ' px'], ['wpAmount', pct]]) {
    $(id).value = s[id];
    $(id + 'Val').textContent = fmt(s[id]);
  }
  if (document.activeElement !== $('wpUrl')) $('wpUrl').value = s.wpUrl;
  const vid = s.wpKind === 'youtube', live = s.wpKind === 'rain' || s.wpKind === 'snow';
  $('wpUrlRow').classList.toggle('hidden', !vid);
  $('wpUrlHint').classList.toggle('hidden', !vid);
  $('wpSoundRow').classList.toggle('hidden', !vid);
  $('wpAmountRow').classList.toggle('hidden', !live);
  paintWpUrlHint();
  paintHwLangs();
  const names = s.uiFontNames || {};
  for (const kind of ['latin', 'arabic']) {
    const K = kind === 'latin' ? 'Latin' : 'Arabic';
    $('font' + K + 'Name').textContent = names[kind] || t('set.fontNone');
    $('font' + K + 'Forget').classList.toggle('hidden', !names[kind]);
  }
  syncSteppers();
}
/* The languages Windows can read, asked for once (it starts PowerShell, so
   not on every repaint) and kept; the setting's own value is always listed,
   so a language removed from Windows still shows what was chosen. */
let hwLangs = null;
function paintHwLangs() {
  const sel = $('hwLang'), cur = state.settings.hwLang;
  const list = (hwLangs || []).slice();
  if (cur !== 'auto' && !list.includes(cur)) list.push(cur);
  const name = (tag) => { try { return new Intl.DisplayNames([state.settings.lang === 'ar' ? 'ar' : 'en'], { type: 'language' }).of(tag) || tag; } catch (_) { return tag; } };
  sel.innerHTML = `<option value="auto">${te('set.hwLangAuto')}</option>` + list.map((tag) => `<option value="${esc(tag)}">${esc(name(tag))}</option>`).join('');
  sel.value = cur;
  if (hwLangs === null && FILES && FILES.ocrLangs) {
    hwLangs = [];
    FILES.ocrLangs().then((r) => { hwLangs = (r && Array.isArray(r.langs)) ? r.langs.filter((x) => typeof x === 'string') : []; paintHwLangs(); }).catch(() => {});
  }
}

/* ---- the app's face from a file ----
   Registered under a name of its own, and an Arabic face only for Arabic
   letters, so the typewriter face keeps every Latin letter whichever was
   loaded first (mental.css §84 lists the families in order). */
const UI_FONT_FAMILY = { latin: 'MB UI Latin', arabic: 'MB UI Arabic' };
const UI_ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+FB50-FDFF, U+FE70-FEFF';
async function loadUiFont(kind) {
  if (!FILES || !FILES.readFont) return false;
  try {
    const r = await FILES.readFont(kind);
    if (!r || !r.bytes) return false;
    for (const f of [...document.fonts]) if (f.family === UI_FONT_FAMILY[kind]) document.fonts.delete(f);
    const face = new FontFace(UI_FONT_FAMILY[kind], r.bytes, kind === 'arabic' ? { unicodeRange: UI_ARABIC_RANGE } : {});
    await face.load();
    document.fonts.add(face);
    return true;
  } catch (err) { console.warn('the font file would not load', err); return false; }
}
function loadUiFonts() {
  const names = state.settings.uiFontNames || {};
  for (const kind of ['latin', 'arabic']) if (names[kind]) loadUiFont(kind);
}

/* ---- every choice as ‹ value › ----
   The reference's options rows: the value between two arrows, and a short
   bar per option under it with the chosen one lit. Built over the existing
   controls rather than instead of them — a row of .seg buttons stays in the
   document (hidden) and is still what every handler and syncSettingsUI()
   talk to; the arrows press its buttons, and a check box is a two-option row
   whose arrows click the box. So nothing that wires or reads a setting
   changed, and the search still finds the words on the buttons. */
function stepperize() {
  const panes = $('setPanes');
  panes.querySelectorAll('.set-row > .seg:not(.small)').forEach((seg) => {
    if (seg.nextElementSibling && seg.nextElementSibling.classList.contains('stp')) return;
    seg.classList.add('seg-under');
    const stp = document.createElement('div');
    stp.className = 'stp';
    stp.innerHTML = `<button class="stp-a" data-d="-1" tabindex="-1" aria-hidden="true">${icon('chevron_left')}</button>` +
      `<span class="stp-v"></span><button class="stp-a" data-d="1" tabindex="-1" aria-hidden="true">${icon('chevron_right')}</button><i class="stp-ticks"></i>`;
    seg.after(stp);
    stp._seg = seg;
    const step = (d) => {
      const bs = [...seg.querySelectorAll('button')];
      const i = bs.findIndex((b) => b.classList.contains('on'));
      const j = clamp((i < 0 ? 0 : i) + d, 0, bs.length - 1);
      if (j !== i) bs[j].click();
    };
    stp.querySelectorAll('.stp-a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); step(rtlFlip(+a.dataset.d)); }));
    stp.querySelector('.stp-v').addEventListener('click', () => {
      const bs = [...seg.querySelectorAll('button')], i = bs.findIndex((b) => b.classList.contains('on'));
      bs[(i + 1) % bs.length].click();
    });
    // the row answers the arrow keys, as an options screen does
    const row = seg.closest('.set-row');
    row.tabIndex = 0;
    row.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(rtlFlip(e.key === 'ArrowRight' ? 1 : -1)); }
    });
    new MutationObserver(() => paintStepper(stp)).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  panes.querySelectorAll('label.set-check').forEach((lab) => {
    if (lab.querySelector('.stp')) return;
    const box = lab.querySelector('input[type="checkbox"]');
    if (!box) return;
    const stp = document.createElement('span');
    stp.className = 'stp stp-check';
    stp.innerHTML = `<span class="stp-a" aria-hidden="true">${icon('chevron_left')}</span><span class="stp-v"></span>` +
      `<span class="stp-a" aria-hidden="true">${icon('chevron_right')}</span><i class="stp-ticks"><b></b><b></b></i>`;
    lab.appendChild(stp);
    stp._box = box;
    box.addEventListener('change', () => paintStepper(stp));
    lab.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === box) {
        e.preventDefault();
        const want = rtlFlip(e.key === 'ArrowRight' ? 1 : -1) > 0;
        if (box.checked !== want) box.click();
      }
    });
  });
  syncSteppers();
}
// in an Arabic window the arrows point the other way, and so do the keys
const rtlFlip = (d) => (document.documentElement.dir === 'rtl' ? -d : d);
function paintStepper(stp) {
  if (stp._seg) {
    const bs = [...stp._seg.querySelectorAll('button')];
    const i = bs.findIndex((b) => b.classList.contains('on'));
    stp.querySelector('.stp-v').textContent = i >= 0 ? bs[i].textContent.trim() : '';
    const ticks = stp.querySelector('.stp-ticks');
    if (ticks.childElementCount !== bs.length) ticks.innerHTML = '<b></b>'.repeat(bs.length);
    [...ticks.children].forEach((b, k) => b.classList.toggle('on', k === i));
    stp.querySelector('[data-d="-1"]').classList.toggle('off', i <= 0);
    stp.querySelector('[data-d="1"]').classList.toggle('off', i >= bs.length - 1);
  } else if (stp._box) {
    const v = stp._box.checked;
    stp.querySelector('.stp-v').textContent = t(v ? 'set.on' : 'set.off');
    const [a, b] = stp.querySelectorAll('.stp-ticks b');
    a.classList.toggle('on', !v); b.classList.toggle('on', v);
  }
}
function syncSteppers() { document.querySelectorAll('#setPanes .stp').forEach(paintStepper); }

/* ---- what the description column says ----
   The row's name, what it does, and — as the reference ends every one —
   what it was when the app arrived. The defaults come from defaults(), so
   they cannot drift from what Restore default settings puts back. */
const SET_KEYS = {
  themeModeSeg: 'themeMode', motionSeg: 'motion', wheelSeg: 'wheel', perfSeg: 'perf', railSeg: 'railMode',
  shapeSeg: 'noteShape', densitySeg: 'noteDensity', fontSeg: 'noteFont', shadowSeg: 'noteShadow',
  linkStyleSeg: 'linkStyle', linkAnchorSeg: 'linkAnchor', autosaveSeg: 'autosaveMin', corkSeg: 'cork',
  uiFontSeg: 'uiFont', skPaperSeg: 'sketchPaper', hwHandSeg: 'hwHand', wpKindSeg: 'wpKind',
  setEmbeds: 'embeds', setGuides: 'guides', setFocusMode: 'focusMode', setSounds: 'sounds', setSoftware: 'softwareRender',
  setSnap: 'snap', setCompass: 'compass', setMinimap: 'minimap', setSpell: 'spell', setConfirmDelete: 'confirmDelete',
  setShowArchived: 'showArchived', setBackupAuto: 'backupAuto', setBackground: 'background', setCapture: 'capture',
  setDaily: 'daily', setHwAnimate: 'hwAnimate', setHwKeep: 'hwKeep', setWpSound: 'wpSound', setWpGrid: 'wpGrid'
};
function settingDefaultText(unit) {
  const d = defaults().settings;
  const seg = unit.querySelector('.seg[id]');
  if (seg && SET_KEYS[seg.id]) {
    const v = String(d[SET_KEYS[seg.id]]);
    const b = [...seg.querySelectorAll('button')].find((x) => Object.values(x.dataset).some((y) => y === v));
    return b ? b.textContent.trim() : '';
  }
  const box = unit.querySelector('input[type="checkbox"][id]');
  if (box && SET_KEYS[box.id]) return t(d[SET_KEYS[box.id]] ? 'set.on' : 'set.off');
  return '';
}
function settingsDescHtml(el) {
  const unit = el && el.closest ? el.closest(DESC_UNIT) : null;
  if (!unit) return '';
  const hint = settingsHintFor(el);
  const lab = unit.querySelector(':scope > label, :scope > span:not(.stp), :scope > .set-row > label') || (unit.matches('label') ? unit : null);
  const name = lab ? [...lab.childNodes].filter((n) => !(n.classList && (n.classList.contains('stp') || n.classList.contains('set-val') || n.classList.contains('row-ic')))).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim() : '';
  const def = settingDefaultText(unit);
  if (!hint && !def) return '';
  return (name ? `<b class="sd-name">${esc(name)}</b>` : '') + (hint ? `<span class="sd-text">${esc(hint)}</span>` : '') +
    (def ? `<span class="sd-def">${esc(t('set.default', { v: def }))}</span>` : '');
}
