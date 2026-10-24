/* Mental Board — embeds.js
   Pasted links: bookmark cards, click-to-play video, and the paste-as menu.

   Part 10 of 22. These files are plain scripts sharing one global
   scope, loaded in the order index.html lists them — that order is the only
   thing holding them together, so a file may use anything declared above it
   at load time and anything at all once init() runs. See MAP.md §4. */
/* --- pasted links: bookmarks and video embeds --------------------------
   Everything in this block obeys one rule: **nothing reaches the network until
   the user asks it to.**

   The app is offline by design and its CSP says so — `default-src 'self'`, no
   remote images, no remote fonts. A video embed is the single deliberate
   exception, and it is narrowed twice over: `frame-src` names two player
   origins and nothing else, and the frame is not created until the play button
   is pressed. A board full of embeds that you never play contacts nobody, so
   opening the app cannot become a list of what you have been reading.

   What is *stored* is the link and two data attributes — never the player, and
   never a fetched title or thumbnail. The card you see is painted at render
   time from those attributes, so a note's markup stays small enough to sit in
   an undo snapshot and readable enough that the plain <a> is what survives if
   this code ever goes away. */
const EMBEDS = [
  { kind: 'yt', name: 'YouTube',
    re: /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,20})/i,
    frame: (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&modestbranding=1` },
  { kind: 'vimeo', name: 'Vimeo',
    re: /vimeo\.com\/(?:video\/)?(\d{6,12})/i,
    frame: (id) => `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1` }
];
function videoOf(url) {
  for (const e of EMBEDS) {
    const m = e.re.exec(url || '');
    if (m) return { kind: e.kind, name: e.name, id: m[1] };
  }
  return null;
}
const embedByKind = (k) => EMBEDS.find((e) => e.kind === k) || null;
// the bit of a URL worth showing: the host without its www, never the query
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./i, ''); } catch (_) { return (url || '').slice(0, 40); }
}

/* The shell that gets stored. `contenteditable="false"` for the same reason an
   inline icon needs it: without it the caret can land inside the card and the
   next keystroke inserts a node in the middle of it. */
function embedHtml(url, vid, meta) {
  const kind = vid ? vid.kind : 'link';
  const id = vid ? vid.id : '';
  const m = meta || {};
  /* Title, channel and thumbnail are stored on the shell, not fetched again on
     every render — the whole point of looking them up once. The thumbnail is a
     file:// path into the board's own thumbs folder, so a card that has been
     drawn once keeps its picture with no network at all, and `img-src file:`
     in the CSP already allows it without opening anything up. */
  const at = (k, v) => (v ? ` data-${k}="${esc(v)}"` : '');
  return `<div class="mb-embed" data-embed="${esc(kind)}" data-vid="${esc(id)}"` +
         at('title', m.title) + at('author', m.author) + at('thumb', m.thumb) +
         ` contenteditable="false">` +
         `<a class="emb-src" href="${esc(url)}">${esc(url)}</a></div><p><br></p>`;
}

/* Ask what the video is called, then redraw the card with the answer.

   Deliberately after the card exists rather than before it: the card appears
   the moment you choose "Embed video", and the title arrives when it arrives.
   Waiting on a network round trip before showing anything would make a paste
   feel broken on a slow connection, and make it fail outright offline — where
   this way you simply get the plain card, which still plays. */
/* Asked-and-answered, for this session. A card that could not be described —
   offline, private, no longer there — would otherwise be asked again on every
   render, and a note is re-rendered every time it is remounted by the culling.
   One attempt per video per session is enough to pick it up when the network
   comes back at the next launch. */
const described = new Set();
async function describeEmbed(box, note, body) {
  if (!FILES || !FILES.describeEmbed) return;
  const kind = box.dataset.embed, id = box.dataset.vid;
  if (!kind || !id || box.dataset.title) return;
  const key = kind + ':' + id;
  if (described.has(key)) return;
  described.add(key);
  box.classList.add('emb-loading');
  let meta = null;
  try { meta = await FILES.describeEmbed(kind, id); } catch (_) {}
  box.classList.remove('emb-loading');
  if (!meta || !document.body.contains(box)) return;
  if (meta.title) box.dataset.title = meta.title;
  if (meta.author) box.dataset.author = meta.author;
  if (meta.thumb) box.dataset.thumb = meta.thumb;
  const face = box.querySelector('.emb-face');
  if (face) face.remove();
  paintEmbeds(box.parentElement || box);
  if (note && body) { note.body = bodyHtml(body); saveSoon(); }
}

/* Paint the visible card onto every shell that has not got one. Runs after any
   render of a note body, and is idempotent — the face is rebuilt rather than
   duplicated, because a note is re-rendered every time it is remounted. */
function paintEmbeds(root) {
  if (!root) return;
  root.querySelectorAll('.mb-embed').forEach((box) => {
    box.setAttribute('contenteditable', 'false');
    if (box.querySelector('iframe')) return;          // already playing; leave it alone
    /* Rebuild from the link and the two data attributes rather than trusting
       what is in the box. A card that came in through a paste has been through
       sanitize(), which keeps the shell and its <a> but strips the classes off
       everything inside — so the old face is there as anonymous divs, and
       painting around it would stack a second caption on top of the first. The
       <a> is the payload; everything else is redrawn. */
    const a = box.querySelector('a');
    if (a) a.className = 'emb-src';
    [...box.childNodes].forEach((nd) => { if (nd !== a) nd.remove(); });
    const url = a ? a.getAttribute('href') || '' : '';
    const kind = box.dataset.embed || 'link';
    const def = embedByKind(kind);
    const playable = !!(def && box.dataset.vid && state.settings.embeds);
    box.classList.toggle('is-video', playable);
    const face = document.createElement('div');
    const thumb = box.dataset.thumb || '';
    const title = box.dataset.title || '';
    const author = box.dataset.author || '';
    /* Two shapes for one card.

       With a thumbnail it is the poster everybody recognises: the still, a play
       button over the middle of it, the title under that and the channel beside
       the site. Without one — offline, a bookmark, a video that would not
       describe itself — it stays the single quiet row it has always been. The
       difference is a class, so the fallback is not a second component that can
       rot; it is this one with less in it. */
    if (playable && thumb) {
      box.classList.add('has-thumb');
      face.className = 'emb-face emb-poster';
      face.innerHTML =
        `<span class="emb-shot">` +
          `<img src="${esc(thumb)}" alt="" draggable="false">` +
          `<button class="emb-play" type="button" aria-label="${esc(t('embed.play'))}">${icon('play_circle')}</button>` +
        `</span>` +
        `<span class="emb-meta">` +
          `<b class="emb-title">${esc(title || (def ? def.name : hostOf(url)))}</b>` +
          `<span class="emb-by">` +
            (author ? `<span class="emb-chan">${esc(author)}</span><span class="emb-dot">·</span>` : '') +
            `<span dir="ltr">${esc(hostOf(url))}</span>` +
          `</span>` +
        `</span>` +
        `<span class="emb-go">${icon('open_in_new')}</span>`;
    } else {
      box.classList.remove('has-thumb');
      face.className = 'emb-face';
      face.innerHTML =
        (playable
          ? `<button class="emb-play" type="button" aria-label="${esc(t('embed.play'))}">${icon('play_circle')}</button>`
          : `<span class="emb-mark">${icon('bookmark')}</span>`) +
        `<span class="emb-cap"><b>${esc(title || (def ? def.name : hostOf(url)))}</b>` +
        `<span dir="ltr">${esc(author || url)}</span></span>` +
        `<span class="emb-go">${icon('open_in_new')}</span>`;
    }
    box.appendChild(face);
  });
}

/* Swap the card for the player. This is the only place in the app that creates
   a remote frame, and it is only ever reached from a click. */
async function playEmbed(box) {
  const def = embedByKind(box.dataset.embed);
  if (!def || !box.dataset.vid || box.querySelector('iframe')) return;
  /* The player is not framed from here. A page loaded from file:// has no web
     origin, and YouTube's player will not run on one — "Error 153, video player
     configuration error", which is about the page and not about the video. Main
     serves a one-page site on 127.0.0.1 whose only content is the player, and
     that page has an origin the player accepts. See main.js.

     So the URL comes from main rather than being built here: the port and the
     session token are its business, and a renderer that could assemble the URL
     itself could be talked into assembling a different one. */
  if (!FILES || !FILES.playerUrl) return;
  box.classList.add('emb-starting');
  let url = null;
  try { url = await FILES.playerUrl(box.dataset.embed, box.dataset.vid); } catch (_) {}
  box.classList.remove('emb-starting');
  if (!url || !document.body.contains(box)) { toast(t('msg.playFailed')); return; }

  const face = box.querySelector('.emb-face');
  const frame = document.createElement('iframe');
  frame.setAttribute('src', url);
  frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
  frame.setAttribute('allowfullscreen', '');
  frame.setAttribute('title', def.name);
  if (face) face.remove();
  box.classList.add('playing');
  box.appendChild(frame);
}
// stop every player in a note — called when the note closes or is unmounted
function stopEmbeds(root) {
  if (!root) return;
  root.querySelectorAll('.mb-embed.playing').forEach((box) => {
    box.querySelectorAll('iframe').forEach((f) => f.remove());
    box.classList.remove('playing');
  });
  paintEmbeds(root);
}

/* --- the paste-as menu -------------------------------------------------- */
let pasteCtx = null;
function closePasteMenu() {
  const m = $('pasteMenu');
  if (m) m.classList.add('hidden');
  pasteCtx = null;
}
function openPasteMenu(url, body, n) {
  const m = $('pasteMenu');
  const vid = videoOf(url);
  if (!m) { insertHTML(esc(url)); n.body = bodyHtml(body); saveSoon(); return; }
  pasteCtx = { url, body, n, vid };
  const item = (act, ic, label) =>
    `<button class="cm-item" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
  m.innerHTML =
    `<div class="cm-label">${icon('content_paste')}<span>${te('paste.as')}</span></div>` +
    (vid && state.settings.embeds ? item('embed', 'play_circle', te('paste.embed')) : '') +
    item('bookmark', 'bookmark', te('paste.bookmark')) +
    item('link', 'link', te('paste.link')) +
    item('text', 'text_fields', te('paste.text'));
  m.classList.remove('hidden');
  /* At the caret, not at the pointer — a paste can come from the keyboard, and
     Ctrl+V with the mouse parked in a corner would otherwise open the menu
     nowhere near what is being pasted into. */
  const r = caretRect() || { left: innerWidth / 2, bottom: innerHeight / 2 };
  const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = clamp(r.left, 8, innerWidth - w - 8) + 'px';
  m.style.top = clamp(r.bottom + 6, 44, innerHeight - h - 8) + 'px';
  m.querySelectorAll('.cm-item').forEach((el, i) => {
    if (!i) el.classList.add('sel');
    el.addEventListener('click', () => applyPasteAs(el.dataset.act));
  });
}
function caretRect() {
  const s = getSelection();
  if (!s || !s.rangeCount) return null;
  const r = s.getRangeAt(0).getBoundingClientRect();
  return (r.width || r.height || r.top) ? r : null;
}
function applyPasteAs(act) {
  const ctx = pasteCtx;
  closePasteMenu();
  if (!ctx || !editing) return;
  const { url, body, n, vid } = ctx;
  editing.focus();
  if (act === 'embed' && vid) insertHTML(embedHtml(url, vid));
  else if (act === 'bookmark') insertHTML(embedHtml(url, null));
  else if (act === 'link') insertHTML(`<a href="${esc(url)}">${esc(url)}</a>&nbsp;`);
  else insertHTML(esc(url));
  normalizeBody(body);
  paintEmbeds(body);
  n.body = bodyHtml(body);
  saveSoon();
  const fresh = [...body.querySelectorAll('.mb-embed[data-vid]')].pop();
  if (fresh) describeEmbed(fresh, n, body);
}
/* --- /video ------------------------------------------------------------
   The slash-menu route to the same card the paste menu builds. One field,
   because a video embed has exactly one input, and the overlay stashes the
   caret range the way the link dialog does — opening any overlay collapses the
   selection, so the range has to be put back before anything is inserted. */
let embedRange = null;
/* 2.8: `/bookmark` (Notion's "Web bookmark") is the same window asking for any
   page, which becomes the card the paste menu's Bookmark makes. The window
   says which it is, so neither one quietly does the other's job. */
let embedMode = 'video';
function openEmbedDialog(mode) {
  if (!editing) return;
  embedMode = mode === 'bookmark' ? 'bookmark' : 'video';
  const mark = embedMode === 'bookmark';
  const dlg = $('embedDlg');
  dlg.classList.toggle('bookmark', mark);
  dlg.querySelector('.sheet-head h2').textContent = t(mark ? 'embed.bookmarkTitle' : 'embed.title');
  dlg.querySelector('.set-note').textContent = t(mark ? 'embed.bookmarkHint' : 'embed.hint');
  $('embedUrl').placeholder = mark ? 'https://' : 'https://youtube.com/watch?v=…';
  const s = getSelection();
  embedRange = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
  $('embedUrl').value = '';
  $('embedErr').textContent = '';
  $('embedDlg').classList.remove('hidden');
  setTimeout(() => $('embedUrl').focus(), 30);
}
function closeEmbedDialog() { $('embedDlg').classList.add('hidden'); embedRange = null; }
/* The other kind of video: a file on this computer, copied into the board's
   folder and put in the note at the caret, as a drop would. */
async function embedVideoFile() {
  if (!FILES || !FILES.pickVideo || !FILES.attach) { toast(t('msg.needDesktop')); return; }
  const body = editing, n = editNote, range = embedRange;
  closeEmbedDialog();
  const p = await FILES.pickVideo();
  if (!p || !body || !n) return;
  const r = await FILES.attach(p, state.activeBoard, '');
  if (!r || r.error) { toast(t('msg.fileFailed', { name: p.split(/[\\/]/).pop() }), 5000); return; }
  body.focus();
  if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
  insertHTML(videoHtml(r.url, r.name) + '<p><br></p>');
  watchVideos(body);
  n.body = bodyHtml(body);
  saveSoon();
  toast(t('msg.videoAdded', { name: r.name }));
}
function submitEmbed() {
  const raw = $('embedUrl').value.trim();
  if (!raw) { closeEmbedDialog(); return; }
  const url = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  const vid = embedMode === 'bookmark' ? null : videoOf(url);
  if (embedMode === 'bookmark') {
    const body = editing, n = editNote, range = embedRange;
    closeEmbedDialog();
    if (!body || !n) return;
    body.focus();
    if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
    insertHTML(embedHtml(url, null));
    normalizeBody(body);
    paintEmbeds(body);
    n.body = bodyHtml(body);
    saveSoon();
    return;
  }
  /* Say which links work rather than silently inserting a bookmark card for a
     page that is not a video — the menu item said "video", and quietly doing
     something else is how a feature gets a reputation for being broken. */
  if (!vid) { $('embedErr').textContent = t('embed.notVideo'); return; }
  const body = editing, n = editNote;
  const range = embedRange;        // closeEmbedDialog() drops it; take it first
  closeEmbedDialog();
  if (!body || !n) return;
  body.focus();
  if (range) { const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
  insertHTML(embedHtml(url, vid));
  normalizeBody(body);
  paintEmbeds(body);
  n.body = bodyHtml(body);
  saveSoon();
  const fresh = [...body.querySelectorAll('.mb-embed[data-vid]')].pop();
  if (fresh) describeEmbed(fresh, n, body);
}

/* Keyboard on the paste menu: it opens with the first row selected, so Enter is
   "the obvious one" and Escape is "actually, just the text". */
function pasteMenuKey(e) {
  const m = $('pasteMenu');
  if (!m || m.classList.contains('hidden')) return false;
  const items = [...m.querySelectorAll('.cm-item')];
  if (!items.length) return false;
  let i = items.findIndex((x) => x.classList.contains('sel'));
  if (e.key === 'Escape') { e.preventDefault(); applyPasteAs('text'); return true; }
  if (e.key === 'Enter') { e.preventDefault(); applyPasteAs(items[Math.max(0, i)].dataset.act); return true; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    i = (i + (e.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length;
    items.forEach((x) => x.classList.remove('sel'));
    items[i].classList.add('sel');
    return true;
  }
  return false;
}
