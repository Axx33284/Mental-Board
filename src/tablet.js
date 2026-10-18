/* Mental Board — tablet.js
   A phone as a drawing tablet (2.2, MAP.md §4w). Runs in main; plain Node, no
   Electron, so tools/test-tablet.js can drive it without launching the app.

   Settings ▸ Extra ▸ Pair a phone calls start(). That opens one HTTP server on
   this computer's Wi-Fi address and shows a QR code of
   `http://<address>:<port>/t/<token>`. The phone's camera opens that page
   (src/tablet/phone.html — no app to install), the page opens a WebSocket back
   to the same server, and from then on every pen event the phone sees is one
   small JSON message, checked here and handed to the renderer, which draws it
   through js/ink.js like a stroke made with the mouse.

   What keeps a listening socket on the LAN from being a liability — every one
   of these is load-bearing:

   - **Off until asked, and it stops by itself.** Nothing listens until Pair is
     pressed. It stops on Stop, when the app quits or the window reloads, five
     minutes after pairing began if nobody scanned, and a minute after the
     phone drops off if it does not come back.
   - **One phone, one use of the token.** The token in the QR code is 128 random
     bits and opens exactly one WebSocket; the socket that used it is given a
     second secret, `resume`, which is the only way back in after a drop. A
     photo of the QR code taken after the phone paired opens nothing.
   - **Bound to one LAN address, and private peers only.** Never 0.0.0.0, and a
     connection from anything but 10/8, 172.16/12, 192.168/16 or loopback is
     closed before a byte is read.
   - **It serves one page and reads no files at run time.** The page is read
     once, from a fixed path, when pairing starts; nothing in a request names a
     file. Every other URL is a 404.
   - **The Origin of the upgrade must be the page's own.** A web page some other
     site serves to a browser on the same network cannot open the socket even
     if it guessed the token.
   - **The phone can only *send* strokes.** Nothing about the board — not a
     note, not a name, not a picture — ever goes to the phone; what it is told
     is the window's shape, whether the board can be drawn on, and the nine ink
     colours. A stranger who got in could scribble; they could not read.
   - **Every message is re-checked here** (`clean()`): known kinds only, numbers
     finite and clamped, at most 64 KB a frame and a few hundred a second.

   Plain http, not https: a self-signed certificate is a full-screen warning on
   the phone every time, and the traffic is pen positions on a home network.
   That trade is written down in MAP.md §4w, along with what it costs (no Wake
   Lock on the phone, for one — it needs a secure context). */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const qr = require('./qr.js');

const PAIR_MS = 5 * 60 * 1000;      // to scan the code, from Pair
const RESUME_MS = 60 * 1000;        // for a phone that dropped off to come back
const SILENT_MS = 15 * 1000;        // a socket this quiet is gone (the page pings every 2 s)
const MAX_FRAME = 64 * 1024;
const MAX_RATE = 500;               // messages a second; a pen at 240 Hz sends half that
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const PAGE_FILE = path.join(__dirname, 'tablet', 'phone.html');

let pad = null;   // the one pairing: { srv, host, port, token, resume, sock, timers, hooks… }

/* ---- which address ---- */
function isPrivate(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const a = +m[1], b = +m[2];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
/* The computer's private IPv4 addresses, the likeliest first: Wi-Fi, then a
   cable, then the virtual adapters Hyper-V, WSL and VPNs add, which a phone
   can almost never reach. Link-local (169.254) is left out — it means the
   adapter never got an address. */
function addresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.internal || !(a.family === 'IPv4' || a.family === 4)) continue;
      if (!isPrivate(a.address) || a.address.startsWith('127.')) continue;
      const virt = /vEthernet|virtual|vmware|hyper-v|wsl|vbox|loopback|bluetooth|tailscale|zerotier|vpn|tap|tun/i.test(name);
      const wifi = /wi-?fi|wireless|wlan/i.test(name);
      out.push({ address: a.address, name, rank: virt ? 2 : wifi ? 0 : 1 });
    }
  }
  return out.sort((x, y) => x.rank - y.rank).map(({ address, name }) => ({ address, name }));
}

/* ---- the page ---- */
function pageHtml(strings, host, port) {
  const nonce = crypto.randomBytes(16).toString('base64');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; ` +
    `connect-src ws://${host}:${port}; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
  // a string that cannot close the <script> it is written into
  const json = JSON.stringify(strings || {}).replace(/</g, '\\u003c');
  return {
    csp,
    body: pad.page.replace(/__NONCE__/g, nonce).replace('__STRINGS__', json).replace('__TITLE__', escHtml((strings && strings.title) || 'Mental Board'))
  };
}
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/* ---- what the phone may say ---- */
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const TOOLS = ['pen', 'marker', 'brush', 'eraser'];
function clean(m) {
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return null;
  const id = typeof m.id === 'string' && /^[\w-]{1,24}$/.test(m.id) ? m.id : null;
  switch (m.t) {
    case 'down': {
      const x = num(m.x, -0.5, 1.5), y = num(m.y, -0.5, 1.5);
      if (!id || x == null || y == null || !TOOLS.includes(m.tool)) return null;
      const size = Math.round(num(m.size, 0, 2) || 0);
      const color = typeof m.color === 'string' && /^(text|[a-z]{2,12}|#[0-9a-f]{6})$/i.test(m.color) ? m.color : 'text';
      const p = num(m.p, 0, 1);
      return { t: 'down', id, x, y, p, tool: m.tool, size, color };
    }
    case 'move': {
      if (!id || !Array.isArray(m.pts) || !m.pts.length || m.pts.length % 3 || m.pts.length > 3 * 128) return null;
      const pts = [];
      for (let i = 0; i < m.pts.length; i += 3) {
        const x = num(m.pts[i], -0.5, 1.5), y = num(m.pts[i + 1], -0.5, 1.5), p = num(m.pts[i + 2], -1, 1);
        if (x == null || y == null || p == null) return null;
        pts.push(x, y, p);
      }
      return { t: 'move', id, pts };
    }
    case 'up': return id ? { t: 'up', id } : null;
    case 'hover': {
      const x = num(m.x, -0.5, 1.5), y = num(m.y, -0.5, 1.5);
      return x == null || y == null ? null : { t: 'hover', x, y };
    }
    case 'leave': return { t: 'leave' };
    case 'pan': {
      const dx = num(m.dx, -2, 2), dy = num(m.dy, -2, 2);
      return dx == null || dy == null ? null : { t: 'pan', dx, dy };
    }
    case 'zoom': {
      const f = num(m.f, 0.5, 2), x = num(m.x, -0.5, 1.5), y = num(m.y, -0.5, 1.5);
      return f == null || x == null || y == null ? null : { t: 'zoom', f, x, y };
    }
    case 'undo': return { t: 'undo' };
    default: return null;
  }
}
// and what the renderer may tell it: the window's shape, whether it can be drawn on, the colours
function cleanOut(m) {
  if (!m || m.t !== 'view') return null;
  const a = num(m.a, 0.1, 10);
  if (a == null) return null;
  const pal = Array.isArray(m.pal) ? m.pal.slice(0, 16).filter((c) => c && typeof c.k === 'string' && typeof c.c === 'string')
    .map((c) => ({ k: c.k.slice(0, 12), c: c.c.slice(0, 40) })) : [];
  return { t: 'view', a, ro: !!m.ro, pal };
}

/* ---- a WebSocket, the 30 lines of RFC 6455 this needs ----
   Text frames only, never fragmented (a browser does not fragment a message
   this small), client frames masked as the RFC requires. Anything else closes
   the socket. */
function wsSend(sock, text) {
  if (!sock || sock.destroyed) return;
  const body = Buffer.from(text);
  let head;
  if (body.length < 126) head = Buffer.from([0x81, body.length]);
  else if (body.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(body.length, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(body.length, 6); }
  sock.write(Buffer.concat([head, body]));
}
function wsControl(sock, op, body) {
  if (!sock || sock.destroyed) return;
  const b = body || Buffer.alloc(0);
  sock.write(Buffer.concat([Buffer.from([0x80 | op, b.length]), b]));
}
function wsReader(sock, onText, onClose) {
  let buf = Buffer.alloc(0);
  const kill = () => { try { wsControl(sock, 0x8, Buffer.from([0x03, 0xea])); sock.end(); } catch (_) {} onClose(); };
  sock.on('data', (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; if (buf.readUInt32BE(2)) return kill(); len = buf.readUInt32BE(6); off = 10; }
      if (!masked || !fin || len > MAX_FRAME) return kill();
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const body = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (op === 0x1) onText(body.toString('utf8'));
      else if (op === 0x8) { try { wsControl(sock, 0x8); sock.end(); } catch (_) {} onClose(); return; }
      else if (op === 0x9) wsControl(sock, 0xa, body);
      else if (op === 0xa) { /* a pong; nothing to do */ }
      else return kill();
    }
  });
}

/* ---- the pairing ---- */
function setState(state, extra) {
  if (!pad) return;
  pad.state = state;
  try { pad.onState(Object.assign({ state }, extra || {})); } catch (_) {}
}
function clearTimers() {
  if (!pad) return;
  clearTimeout(pad.pairTimer); clearTimeout(pad.resumeTimer); clearInterval(pad.silentTimer);
}

/* opts: { address, strings, onMessage(msg), onState(st), host (tests only) }.
   Resolves { ok, url, qr, address, addresses, until } or { ok: false, error }. */
function start(opts) {
  stop('restart');
  opts = opts || {};
  const list = addresses();
  const host = opts.host || (list.find((a) => a.address === opts.address) || list[0] || {}).address;
  if (!host) return Promise.resolve({ ok: false, error: 'no-network' });
  let page;
  try { page = fs.readFileSync(PAGE_FILE, 'utf8'); } catch (err) { return Promise.resolve({ ok: false, error: 'no-page' }); }
  const me = {
    host, port: 0, page, strings: opts.strings || {},
    token: crypto.randomBytes(16).toString('hex'), resume: '', sock: null,
    onMessage: opts.onMessage || (() => {}), onState: opts.onState || (() => {}),
    state: 'waiting', srv: null, lastHeard: 0, rate: { t: 0, n: 0 }
  };
  pad = me;
  return new Promise((done) => {
    const srv = http.createServer((req, res) => onRequest(me, req, res));
    srv.on('upgrade', (req, sock) => onUpgrade(me, req, sock));
    srv.on('connection', (sock) => { if (!isPrivate(sock.remoteAddress)) sock.destroy(); });
    srv.on('error', (err) => {
      if (pad === me && !me.port) { pad = null; done({ ok: false, error: (err && err.code) || 'listen' }); }
    });
    srv.listen(0, host, () => {
      if (pad !== me) { try { srv.close(); } catch (_) {} return done({ ok: false, error: 'stopped' }); }
      me.srv = srv;
      me.port = srv.address().port;
      const url = `http://${host}:${me.port}/t/${me.token}`;
      me.until = Date.now() + PAIR_MS;
      me.pairTimer = setTimeout(() => { if (pad === me && !me.resume) stop('expired'); }, PAIR_MS);
      const info = { url, qr: qr.encode(url).rows, address: host, addresses: list, until: me.until };
      setState('waiting', info);
      done(Object.assign({ ok: true }, info));
    });
  });
}

function onRequest(me, req, res) {
  const url = (req.url || '').split('?')[0];
  if (req.method === 'GET' && pad === me && url === `/t/${me.token}`) {
    const { csp, body } = pageHtml(me.strings, me.host, me.port);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(body);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('no');
}

function refuse(sock, code) {
  try { sock.end(`HTTP/1.1 ${code} No\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch (_) {}
}
function onUpgrade(me, req, sock) {
  if (pad !== me || !isPrivate(sock.remoteAddress)) return refuse(sock, 403);
  const url = (req.url || '').split('?')[0];
  const key = req.headers['sec-websocket-key'];
  if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13' ||
      !key || !/^[A-Za-z0-9+/]{22}==$/.test(key)) return refuse(sock, 400);
  if (req.headers.origin !== `http://${me.host}:${me.port}`) return refuse(sock, 403);
  /* /ws/<token> pairs, once; /ws/r/<resume> comes back after a drop. Either
     way there is never a second socket while one is open. */
  let first = false;
  const m = /^\/ws\/(r\/)?([0-9a-f]{32})$/.exec(url);
  if (!m || me.sock) return refuse(sock, 403);
  if (m[1]) { if (!me.resume || !same(m[2], me.resume)) return refuse(sock, 403); }
  else { if (me.resume || !same(m[2], me.token)) return refuse(sock, 403); first = true; }

  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  // a pen is many tiny writes; Nagle would hold each one back for the next
  sock.setNoDelay(true);
  if (first) { me.resume = crypto.randomBytes(16).toString('hex'); clearTimeout(me.pairTimer); }
  clearTimeout(me.resumeTimer);
  me.sock = sock;
  me.lastHeard = Date.now();
  const ua = String(req.headers['user-agent'] || '').slice(0, 300);
  let gone = false;
  const lost = () => {
    if (gone) return;
    gone = true;
    try { sock.destroy(); } catch (_) {}
    if (pad !== me || me.sock !== sock) return;
    me.sock = null;
    clearInterval(me.silentTimer);
    setState('away');
    me.resumeTimer = setTimeout(() => { if (pad === me && !me.sock) stop('lost'); }, RESUME_MS);
  };
  // `end` as well as `close`: an http server's sockets are half-open, so a
  // phone that hangs up only ever says so with `end`
  sock.on('end', lost);
  sock.on('close', lost);
  sock.on('error', lost);
  me.silentTimer = setInterval(() => { if (Date.now() - me.lastHeard > SILENT_MS) lost(); }, 2000);
  wsReader(sock, (text) => onText(me, sock, text), lost);
  wsSend(sock, JSON.stringify({ t: 'hello', resume: me.resume }));
  if (me.view) wsSend(sock, JSON.stringify(me.view));
  setState('connected', { device: describe(ua) });
}
/* "Android · Chrome", from the user agent — enough to tell the person which
   device is drawing on their board, and nothing that has to be parsed right. */
function describe(ua) {
  const os_ = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os_, br].filter(Boolean).join(' · ');
}

function onText(me, sock, text) {
  if (pad !== me || me.sock !== sock) return;
  me.lastHeard = Date.now();
  const now = Date.now();
  if (now - me.rate.t > 1000) { me.rate.t = now; me.rate.n = 0; }
  if (++me.rate.n > MAX_RATE) return;
  let m;
  try { m = JSON.parse(text); } catch (_) { return; }
  // the page measures its own round trip; answered here, so it measures the network and not the renderer
  if (m && m.t === 'ping') { wsSend(sock, JSON.stringify({ t: 'pong', n: num(m.n, 0, 1e12) })); return; }
  const c = clean(m);
  if (c) { try { me.onMessage(c); } catch (_) {} }
}

// from the renderer, to the phone
function send(m) {
  const c = cleanOut(m);
  if (!c || !pad) return false;
  pad.view = c;          // kept, so a phone that comes back is told at once
  if (pad.sock) wsSend(pad.sock, JSON.stringify(c));
  return true;
}

function stop(reason) {
  const me = pad;
  if (!me) return;
  clearTimers();
  if (me.sock) { try { wsSend(me.sock, JSON.stringify({ t: 'bye', reason: reason || 'stopped' })); wsControl(me.sock, 0x8); me.sock.destroy(); } catch (_) {} }
  me.sock = null;
  try { if (me.srv) { me.srv.close(); if (me.srv.closeAllConnections) me.srv.closeAllConnections(); } } catch (_) {}
  setState('off', { reason: reason || 'stopped' });
  pad = null;
}

const status = () => (pad ? { state: pad.state, port: pad.port, host: pad.host } : { state: 'off' });

module.exports = { start, stop, send, status, addresses, isPrivate, clean, cleanOut, describe };
