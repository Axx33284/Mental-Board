/* Mental Board — shapes.js
   A note's shape, and where its writing sits inside it (2.4).

   One of 23 scripts. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 12b. note shapes ───────────────

   A note is a rectangle until someone right-clicks it and picks another shape.
   The shape is **drawn, not clipped**: an <svg> stretched over the note paints
   the fill and the outline, and the note's own box goes transparent. Clipping
   the box (clip-path) would cut the outline, the selection ring and the shadow
   off along with the corners — a heart with no edge is a pink blob.

   The writing does not follow the curve. Each shape has a *safe rectangle*
   (FORM_SAFE, percentages of the note's box) that lies wholly inside it, and
   the note becomes a grid whose middle cell is that rectangle; the text, the
   icon and the status pill live there. So the text never pokes out of a
   triangle, and resizing the note resizes the safe rectangle with it.

   Where the writing sits in that rectangle is the note's own too: one of nine
   places (`n.textAt`, the same two-letter codes as a workflow's title, so the
   3×3 picker is shared), and a nudge either way (`n.tx`, `n.ty`, in % of the
   note) for the cases nine places cannot reach.

   Everything here is presentation stored on the note. Nothing changes x/y/w/h,
   so a shape can be tried and taken back without the board moving. */

/* Each path is drawn in a 100×100 box and stretched to the note with
   preserveAspectRatio="none" — so a circle on a wide note is an ellipse, which
   is what you want: the note keeps the size you gave it. */
const FORM_PATHS = {
  circle:   'M1 50A49 49 0 1 1 99 50A49 49 0 1 1 1 50Z',
  triangle: 'M50 2L98 97Q99 98 97 98H3Q1 98 2 97Z',
  diamond:  'M50 1L99 50L50 99L1 50Z',
  heart:    'M50 95C22 74 2 56 2 32C2 15 14 4 28 4C38 4 46 10 50 19C54 10 62 4 72 4C86 4 98 15 98 32C98 56 78 74 50 95Z',
  hexagon:  'M25 2H75L99 50L75 98H25L1 50Z',
  pentagon: 'M50 1L99 37L80 99H20L1 37Z',
  octagon:  'M30 1H70L99 30V70L70 99H30L1 70V30Z',
  star:     (() => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 21 : 50, a = (-90 + i * 36) * Math.PI / 180;
      pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(54 + r * Math.sin(a)).toFixed(1)}`);
    }
    return 'M' + pts.join('L') + 'Z';
  })(),
  cloud:    'M24 88C10 88 2 78 3 66C4 55 12 49 21 49C19 36 29 25 42 26C47 14 60 9 72 14C83 18 88 29 86 40C95 43 99 52 98 61C97 76 87 88 74 88Z',
  bubble:   'M9 2H91Q98 2 98 9V69Q98 76 91 76H42L20 98L25 76H9Q2 76 2 69V9Q2 2 9 2Z',
  arrow:    'M2 26H60V3L99 50L60 97V74H2Z'
};
/* The writing's rectangle inside each shape: top, right, bottom, left, in %
   of the note's height (top/bottom) and width (left/right). Worked out from
   the paths above so the rectangle's corners touch the outline at most — a
   triangle's is its lower middle, a star's is the pentagon at its heart. */
const FORM_SAFE = {
  circle:   [15, 15, 15, 15],
  triangle: [48, 26, 4, 26],
  diamond:  [25, 25, 25, 25],
  heart:    [24, 18, 38, 18],
  hexagon:  [12, 22, 12, 22],
  pentagon: [28, 21, 4, 21],
  octagon:  [16, 16, 16, 16],
  star:     [38, 31, 39, 31],
  cloud:    [40, 16, 14, 20],
  bubble:   [3, 3, 26, 3],
  arrow:    [27, 40, 27, 3]
};
// the picker's order, rectangle first — it is how a note goes back to normal
const FORM_ORDER = ['rect', 'circle', 'triangle', 'diamond', 'heart', 'hexagon', 'pentagon', 'octagon', 'star', 'cloud', 'bubble', 'arrow'];
const FORM_LABEL = {
  rect: 'form.rect', circle: 'form.circle', triangle: 'form.triangle', diamond: 'form.diamond',
  heart: 'form.heart', hexagon: 'form.hexagon', pentagon: 'form.pentagon', octagon: 'form.octagon',
  star: 'form.star', cloud: 'form.cloud', bubble: 'form.bubble', arrow: 'form.arrow'
};
const NUDGE_MAX = 40;
// the nine places, named for the picker's tooltips — inside the note, not above it
const AT_LABEL = {
  tl: 'form.at.tl', tc: 'form.at.tc', tr: 'form.at.tr',
  il: 'form.at.il', ic: 'form.at.ic', ir: 'form.at.ir',
  bl: 'form.at.bl', bc: 'form.at.bc', br: 'form.at.br'
};

const okForm = (f) => (typeof f === 'string' && FORM_PATHS[f] ? f : undefined);
const okTextAt = (a) => (TITLE_POS.includes(a) ? a : undefined);
const okNudge = (v) => { const n = Math.round(+v || 0); return n ? clamp(n, -NUDGE_MAX, NUDGE_MAX) : undefined; };

/* Draw a note's shape onto its element. Called by fillNote() and stubNote()
   (both replace the element's insides, so the <svg> goes with them) and by the
   menu below after a change. Safe on a picture: pictures have no shape. */
function paintForm(el, n) {
  if (!el || !n || n.pic) return;
  const form = okForm(n.form);
  const at = okTextAt(n.textAt) || (form ? 'ic' : '');
  const tx = okNudge(n.tx) || 0, ty = okNudge(n.ty) || 0;
  let svg = el.querySelector(':scope > .note-form');
  if (form) {
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'note-form');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = '<path/>';
      el.insertBefore(svg, el.firstChild);
    }
    svg.firstChild.setAttribute('d', FORM_PATHS[form]);
    el.dataset.form = form;
  } else {
    if (svg) svg.remove();
    delete el.dataset.form;
  }
  /* The grid layout is only switched on for a note that asked for something —
     a shape, a place, a nudge. An ordinary note keeps the flex column it has
     always had, so nothing about the 99% case changes. */
  if (form || at || tx || ty) {
    const s = form ? FORM_SAFE[form] : [0, 0, 0, 0];
    const top = Math.max(0, s[0] + ty), bottom = Math.max(0, s[2] - ty);
    const left = Math.max(0, s[3] + tx), right = Math.max(0, s[1] - tx);
    el.dataset.at = at || 'tl';
    el.style.setProperty('--fi-t', top + '%');
    el.style.setProperty('--fi-r', right + '%');
    el.style.setProperty('--fi-b', bottom + '%');
    el.style.setProperty('--fi-l', left + '%');
  } else {
    delete el.dataset.at;
    ['--fi-t', '--fi-r', '--fi-b', '--fi-l'].forEach((k) => el.style.removeProperty(k));
  }
}

/* The same shape for the board picture (edit-ops.js paintBoardCanvas): the
   path in world coordinates, and the rectangle the writing is kept to. */
function formPath2D(n, form) {
  const p = new Path2D();
  p.addPath(new Path2D(FORM_PATHS[form]), new DOMMatrix().translate(n.x, n.y).scale(n.w / 100, n.h / 100));
  return p;
}
function formBox(n, form) {
  const s = FORM_SAFE[form] || [0, 0, 0, 0];
  const tx = okNudge(n.tx) || 0, ty = okNudge(n.ty) || 0;
  const t = Math.max(0, s[0] + ty), r = Math.max(0, s[1] - tx), b = Math.max(0, s[2] - ty), l = Math.max(0, s[3] + tx);
  return { x: n.x + n.w * l / 100, y: n.y + n.h * t / 100, w: n.w * (100 - l - r) / 100, h: n.h * (100 - t - b) / 100 };
}

/* What in a note will not sit well inside a shape. A shape's writing area is
   smaller than the note and has to scroll when it is full; a table, columns,
   a video or a picture is wide and fixed, and comes out cut off or squeezed.
   Nothing is refused — the user is told, and chooses. */
function formIssues(n) {
  const out = [];
  if (!n || !n.body) return out;
  const d = document.createElement('div');
  d.innerHTML = n.body;
  if (d.querySelector('table')) out.push('form.warnTable');
  if (d.querySelector('.mb-cols')) out.push('form.warnCols');
  if (d.querySelector('video, iframe, .mb-embed')) out.push('form.warnVideo');
  if (d.querySelector('img')) out.push('form.warnPicture');
  if (d.querySelector('pre, .mb-math-block')) out.push('form.warnCode');
  if ((d.textContent || '').length > 280) out.push('form.warnLong');
  return out;
}

function repaintForms(ids) {
  ids.forEach((id) => {
    const n = state.notes.find((x) => x.id === id);
    const el = els.get(id);
    if (n && el) paintForm(el, n);
  });
}

function setNoteForm(ids, form) {
  const f = okForm(form);
  pushUndo();
  ids.forEach((id) => {
    const n = state.notes.find((x) => x.id === id);
    if (!n || n.pic) return;
    if (f) n.form = f; else delete n.form;
  });
  repaintForms(ids);
  saveSoon(); scheduleMinimap();
}

/* ---- the panel ----
   The context menu's own element, filled with a shape grid, the 3×3 place
   picker and two nudge sliders. Every change lands on the board straight
   away, so the note under the panel *is* the preview. One undo step per
   change; a slider drag is one step, taken on its first movement. */
function openShapeMenu(clientX, clientY, ids) {
  const notes = ids.map((id) => state.notes.find((x) => x.id === id)).filter((n) => n && !n.pic);
  if (!notes.length) return;
  const menu = $('ctxMenu');
  const first = notes[0];
  const cur = okForm(first.form) || 'rect';
  const at = okTextAt(first.textAt) || (okForm(first.form) ? 'ic' : 'tl');
  const tile = (f) => {
    const shape = f === 'rect'
      ? '<rect x="4" y="12" width="92" height="76" rx="10"/>'
      : `<path d="${FORM_PATHS[f]}"/>`;
    return `<button class="sh-tile${f === cur ? ' on' : ''}" data-form="${f}" title="${te(FORM_LABEL[f])}">` +
      `<svg viewBox="-2 -2 104 104" aria-hidden="true">${shape}</svg><span>${te(FORM_LABEL[f])}</span></button>`;
  };
  menu.innerHTML =
    `<div class="cm-label">${icon('category')}<span>${te('form.title')}</span></div>` +
    `<div class="sh-grid">${FORM_ORDER.map(tile).join('')}</div>` +
    `<div class="sh-warn hidden" role="alert"></div>` +
    `<div class="cm-label">${icon('format_align_center')}<span>${te('form.textPos')}</span></div>` +
    `<div class="cm-pos sh-pos">` +
      TITLE_POS.map((p) => `<button data-tp="${p}" class="${p === at ? 'on' : ''}" title="${te(AT_LABEL[p])}"><i></i></button>`).join('') +
    `</div>` +
    `<label class="sh-sl"><span>${te('form.nudgeX')}</span><input type="range" id="shNx" min="${-NUDGE_MAX}" max="${NUDGE_MAX}" step="1" value="${okNudge(first.tx) || 0}"></label>` +
    `<label class="sh-sl"><span>${te('form.nudgeY')}</span><input type="range" id="shNy" min="${-NUDGE_MAX}" max="${NUDGE_MAX}" step="1" value="${okNudge(first.ty) || 0}"></label>` +
    `<button class="cm-item" data-act="resetPos">${icon('restart_alt')}<span>${te('form.resetPos')}</span></button>`;
  menu.classList.add('cm-wide');
  menu.classList.remove('hidden');
  // placed again whenever the warning opens or closes, which changes its height
  const place = () => {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = clamp(RTL ? clientX - w : clientX, 6, innerWidth - w - 6) + 'px';
    menu.style.top = clamp(clientY, 44, Math.max(44, innerHeight - h - 6)) + 'px';
  };
  place();

  const ids2 = notes.map((n) => n.id);
  const warn = menu.querySelector('.sh-warn');
  const mark = (f) => menu.querySelectorAll('.sh-tile').forEach((b) => b.classList.toggle('on', b.dataset.form === f));

  menu.querySelectorAll('.sh-tile').forEach((b) => b.addEventListener('click', () => {
    const f = b.dataset.form;
    warn.classList.add('hidden');
    if (f !== 'rect') {
      /* Warn first, apply only on "Use anyway". The note is not changed until
         then, so Cancel needs no undo. */
      const issues = [...new Set(notes.flatMap(formIssues))];
      if (issues.length) {
        warn.innerHTML =
          `<div class="sh-warn-head">${icon('warning')}<span>${te('form.warnTitle', { shape: t(FORM_LABEL[f]) })}</span></div>` +
          `<ul>${issues.map((k) => `<li>${te(k)}</li>`).join('')}</ul>` +
          `<div class="sh-warn-acts"><button class="sh-go">${te('form.useAnyway')}</button><button class="sh-no">${te('confirm.cancel')}</button></div>`;
        warn.classList.remove('hidden');
        place();
        warn.querySelector('.sh-go').addEventListener('click', () => {
          setNoteForm(ids2, f); mark(f); warn.classList.add('hidden'); place();
        });
        warn.querySelector('.sh-no').addEventListener('click', () => { warn.classList.add('hidden'); place(); });
        return;
      }
    }
    setNoteForm(ids2, f); mark(f);
  }));

  menu.querySelectorAll('.sh-pos button').forEach((b) => b.addEventListener('click', () => {
    pushUndo();
    notes.forEach((n) => { n.textAt = b.dataset.tp; });
    menu.querySelectorAll('.sh-pos button').forEach((x) => x.classList.toggle('on', x === b));
    repaintForms(ids2); saveSoon();
  }));

  ['tx', 'ty'].forEach((k) => {
    const inp = $(k === 'tx' ? 'shNx' : 'shNy');
    let took = false;
    inp.addEventListener('input', () => {
      if (!took) { pushUndo(); took = true; }
      const v = okNudge(inp.value);
      notes.forEach((n) => { if (v) n[k] = v; else delete n[k]; });
      repaintForms(ids2);
    });
    inp.addEventListener('change', () => { took = false; saveSoon(); });
  });

  menu.querySelector('[data-act="resetPos"]').addEventListener('click', () => {
    pushUndo();
    notes.forEach((n) => { delete n.textAt; delete n.tx; delete n.ty; });
    repaintForms(ids2); saveSoon();
    closeCtxMenu();
  });
}
