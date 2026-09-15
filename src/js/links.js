/* Mental Board — links.js
   The ropes between notes.

   Part 6 of 17. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* ─────────────── 10. links ─────────────── */
let linkFrom = null;

function startLinking(id) {
  linkFrom = id;
  document.body.classList.add('linking');
  $('viewport').classList.add('linking');
  hint(t('msg.linkHint'));
}
function cancelLinking() {
  if (!linkFrom) return;
  linkFrom = null;
  document.body.classList.remove('linking');
  $('viewport').classList.remove('linking');
  $('linkGhost').classList.add('hidden');
  document.querySelectorAll('.note.link-target').forEach((e) => e.classList.remove('link-target'));
  hint('');
}
function finishLinking(toId) {
  if (!linkFrom || toId === linkFrom) { cancelLinking(); return; }
  const dupe = state.links.some((l) => (l.from === linkFrom && l.to === toId) || (l.to === linkFrom && l.from === toId));
  if (!dupe) {
    pushUndo();
    state.links.push({ id: uid(), from: linkFrom, to: toId });
    drawLinks(); saveSoon();
    toast(t('msg.linked'));
  }
  cancelLinking();
}

/* The rope's colour, width and shape are settings, and all three are pure
   presentation — nothing here is stored per link, so changing any of them
   restyles every rope on every board at once and can never move a note.

   `--rope` is a variable rather than a class per colour so a literal hex from
   the picker works exactly like a named one. */
function ropeColor() {
  const c = state.settings.linkColor;
  if (isHex(c)) return c;
  return COLORS.includes(c) ? `var(--c-${c}-c)` : 'var(--c-red-c)';
}
/* One of the nine note colours as a literal hex, for the `<input type="color">`
   that sits beside the swatches — it cannot show a custom property, and an
   empty picker beside nine filled swatches reads as broken. Resolved from the
   live stylesheet rather than duplicated in JS, so it follows the theme. */
function swatchHex(name) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${name}-c`).trim();
    if (isHex(v)) return v;
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(v);
    if (m) return rgbToHex([+m[1], +m[2], +m[3]]);
  } catch (_) {}
  return '#e05a5a';
}
const themeName = (id) => t('theme.' + id);
function applyLinkStyle() {
  const root = document.documentElement;
  root.style.setProperty('--rope', ropeColor());
  root.style.setProperty('--rope-w', String(state.settings.linkWidth || 2));
  document.body.dataset.rope = state.settings.linkStyle;
}

/* Where a rope leaves a note.

   'top' pins both ends to the middle of the top edge, which is what pinned
   string on a board actually does — the ends stay put while the note moves, so
   a board with many ropes reads as a set of fixed pins rather than as lines
   that slide around every edge as you drag.

   'edge' is the original: the point on the border facing the other note, so
   the rope always takes the shortest visible path. */
function anchor(rect, to) {
  if (state.settings.linkAnchor === 'top') return { x: rect.x + rect.w / 2, y: rect.y - 6 };
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const dx = to.x - cx, dy = to.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const hw = rect.w / 2 + 4, hh = rect.h / 2 + 4;
  const sx = dx ? hw / Math.abs(dx) : Infinity;
  const sy = dy ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

/* The path between two anchor points, in the shape the user picked. */
function ropePath(p1, p2, a, b) {
  const style = state.settings.linkStyle;
  if (style === 'straight') return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  if (style === 'thread') {
    /* String hangs. The sag grows with the span so a short hop is nearly taut
       and a long one droops, and it is clamped so a rope across a whole board
       does not dive off the bottom of it. A quadratic through a single control
       point below the midpoint is the whole catenary anyone can see at this
       scale. */
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
    const sag = clamp(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.16, 10, 130);
    return `M ${p1.x} ${p1.y} Q ${mx} ${my + sag}, ${p2.x} ${p2.y}`;
  }
  /* Pinned at the top, a curve arcs *over* both pins rather than bending
     between them. Bending is right when the ends face each other on the
     nearest side; with both ends on the top edge it sends the rope straight
     down through the note it just left, so most of every rope on a column of
     stacked notes is hidden behind them. Lifting it clears both cards and
     leaves the whole rope visible, which is also what a string pulled taut
     between two pins actually looks like. */
  if (state.settings.linkAnchor === 'top') {
    const span = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const lift = clamp(span * 0.28, 34, 170);
    /* Two notes stacked in a column have their pins on the same vertical line,
       and an arc between two points that share an x collapses into a straight
       line that overshoots above the higher pin — a stray tail sticking out of
       the top of the note. Bow it out to the side instead, far enough to clear
       the wider of the two cards, so the rope goes around rather than through.
       `bow` is the half-width of the widest note plus a margin, which is why
       the rects are passed in rather than just their pins. */
    const dxs = p2.x - p1.x;
    if (Math.abs(dxs) < 30) {
      const bow = Math.max(a.w, b.w) / 2 + 46;
      const c1y = p1.y + (p2.y - p1.y) * 0.15;
      const c2y = p1.y + (p2.y - p1.y) * 0.85;
      return `M ${p1.x} ${p1.y} C ${p1.x + bow} ${c1y}, ${p2.x + bow} ${c2y}, ${p2.x} ${p2.y}`;
    }
    const top = Math.min(p1.y, p2.y) - lift;
    return `M ${p1.x} ${p1.y} C ${p1.x} ${top}, ${p2.x} ${top}, ${p2.x} ${p2.y}`;
  }
  /* curve — bend along whichever axis the two notes are further apart on, or
     the curve doubles back on itself for stacked notes. */
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dy) > Math.abs(dx)) {
    const k = clamp(Math.abs(dy) * 0.45, 26, 220) * Math.sign(dy || 1);
    return `M ${p1.x} ${p1.y} C ${p1.x} ${p1.y + k}, ${p2.x} ${p2.y - k}, ${p2.x} ${p2.y}`;
  }
  const k = clamp(Math.abs(dx) * 0.45, 26, 220) * Math.sign(dx || 1);
  return `M ${p1.x} ${p1.y} C ${p1.x + k} ${p1.y}, ${p2.x - k} ${p2.y}, ${p2.x} ${p2.y}`;
}

/* Redrawing the ropes happens on every pointer move of every drag, so the two
   lookups per link have to be O(1). Scanning `state.notes` for each end was
   O(links × notes) sixty times a second — invisible at twenty notes, a stall at
   a thousand. The map is rebuilt per call, which is one pass over the notes
   instead of one pass per link. */
function noteIndex() {
  const m = new Map();
  for (const n of state.notes) m.set(n.id, n);
  return m;
}

/* ---- drawing the ropes ------------------------------------------------
   This used to be one `innerHTML =` over every rope on the board, and it ran
   on **every pointermove of every drag**. On a board with 600 ropes that is
   2400 SVG nodes thrown away and re-parsed sixty times a second: measured at
   ~5 ms of script per move on a fast machine before the browser has laid out
   or painted any of it. On the kind of machine this app is meant to stay
   usable on, that alone is the difference between dragging a note and watching
   a slideshow.

   Three changes, in order of how much they buy:

   · **The elements are reused.** One <g> per rope, built once, its `d` and two
     centres updated in place — the same diff-don't-rebuild rule the compass
     chips already follow, and for the same reason.
   · **Ropes off screen are not in the document.** Gated on the same `culling`
     flag the notes use, so a small board keeps every rope mounted and none of
     this can affect it.
   · **A drag only redraws the ropes that moved.** Everything else is standing
     still; recomputing its path was work with a guaranteed-identical result.

   The <g> matters for more than tidiness: `.lk-hit:hover + .lk-line` in the
   stylesheet is an adjacent-sibling rule, so the hit path and the visible line
   have to stay next to each other. Grouping keeps that true no matter what
   order the ropes are mounted in. */
const SVGNS = 'http://www.w3.org/2000/svg';
const linkEls = new Map();          // link id -> <g>, for the ropes that are MOUNTED

function makeLinkEl(l) {
  const g = document.createElementNS(SVGNS, 'g');
  const hit = document.createElementNS(SVGNS, 'path');
  hit.setAttribute('class', 'lk-hit');
  hit.setAttribute('data-id', l.id);
  const tip = document.createElementNS(SVGNS, 'title');
  tip.textContent = t('msg.linkClickHint');
  hit.appendChild(tip);
  const line = document.createElementNS(SVGNS, 'path');
  line.setAttribute('class', 'lk-line');
  const dotA = document.createElementNS(SVGNS, 'circle');
  dotA.setAttribute('class', 'lk-dot');
  dotA.setAttribute('r', '3.5');
  const dotB = dotA.cloneNode(false);
  g.appendChild(hit); g.appendChild(line); g.appendChild(dotA); g.appendChild(dotB);
  g._rope = { hit, line, dotA, dotB };
  return g;
}

/* The union of the two notes, grown by the most a rope can bow away from them
   — `lift` and `bow` in ropePath() top out around 170. Cheaper than measuring
   the path and never wrong in the direction that matters. */
const ROPE_SLACK = 200;
function ropeVisible(a, b, R) {
  const x0 = Math.min(a.x, b.x) - ROPE_SLACK, y0 = Math.min(a.y, b.y) - ROPE_SLACK;
  const x1 = Math.max(a.x + a.w, b.x + b.w) + ROPE_SLACK, y1 = Math.max(a.y + a.h, b.y + b.h) + ROPE_SLACK;
  return x0 < R.x1 && x1 > R.x0 && y0 < R.y1 && y1 > R.y0;
}

/* `moving` is the set of note ids under the pointer right now. Pass it during a
   gesture and only the ropes tied to those notes are recomputed; leave it out
   and this is a full sync — every rope checked, mounted, unmounted and redrawn.
   Everything that changes the board calls the full form; only the drag loop
   calls the cheap one. */
function drawLinks(moving) {
  const g = $('linksInner');
  if (!g) return;
  const byId = noteIndex();
  const pinned = state.settings.linkAnchor === 'top';
  const R = culling ? visibleWorldRect() : null;
  const keep = moving ? null : new Set();

  for (const l of state.links) {
    const a = byId.get(l.from), b = byId.get(l.to);
    if (!a || !b) continue;
    if (R && !ropeVisible(a, b, R)) continue;
    if (keep) keep.add(l.id);

    let el = linkEls.get(l.id);
    const fresh = !el;
    if (fresh) { el = makeLinkEl(l); linkEls.set(l.id, el); g.appendChild(el); }
    // standing still and already drawn — its path cannot have changed
    else if (moving && !moving.has(l.from) && !moving.has(l.to)) continue;

    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const p1 = anchor(a, cb), p2 = anchor(b, ca);
    const d = ropePath(p1, p2, a, b);
    const r = el._rope;
    r.hit.setAttribute('d', d);
    r.line.setAttribute('d', d);
    /* A pin at both ends when the ropes are pinned to the top edge — one dot
       floating at the far end of a line that starts nowhere reads as an arrow
       head, which says a direction these links do not have. */
    r.dotA.setAttribute('cx', p1.x); r.dotA.setAttribute('cy', p1.y);
    r.dotB.setAttribute('cx', p2.x); r.dotB.setAttribute('cy', p2.y);
    r.dotA.style.display = pinned ? '' : 'none';
  }

  // a partial pass never unmounts: what it skipped it did not look at
  if (keep) {
    linkEls.forEach((el, id) => { if (!keep.has(id)) { el.remove(); linkEls.delete(id); } });
  }
}
// the ropes are rebuilt from scratch — render() empties the layer under them
function resetLinks() { linkEls.clear(); const g = $('linksInner'); if (g) g.textContent = ''; }
/* One delegated listener for the life of the app, rather than one per rope on
   every frame of every drag. Binding them per redraw meant a board with two
   hundred ropes did four hundred addEventListener calls per pointer move. */
function wireLinkClicks() {
  const g = $('linksInner');
  if (!g) return;
  g.addEventListener('click', (e) => {
    const p = e.target.closest ? e.target.closest('.lk-hit') : null;
    if (!p) return;
    e.stopPropagation();
    pushUndo();
    deleteLink(p.dataset.id);
  });
}
function deleteLink(id) {
  state.links = state.links.filter((l) => l.id !== id);
  drawLinks(); saveSoon(); toast(t('msg.linkRemoved'));
}
