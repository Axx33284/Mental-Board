/* Tests for the phone-as-tablet server (src/tablet.js) and the QR encoder
   behind its pairing code (src/qr.js). Plain Node, no Electron, no network
   beyond 127.0.0.1. Run with `npm test`; nothing here ships. MAP.md §4w.

   The QR half reads every symbol back — unmask, walk the zigzag, de-interleave,
   check every Reed-Solomon block's syndromes are zero, parse the bytes — so an
   encoder bug shows up as a failed read here and not as a phone that will not
   scan. The server half is the security list in tablet.js's header, one test
   per promise: a wrong token, a wrong Origin, a second socket, a reused token,
   a message that is not one of ours, and Stop actually closing the port. */
'use strict';
const http = require('http');
const crypto = require('crypto');
const assert = require('assert');
const path = require('path');

const qr = require(path.join(__dirname, '..', 'src', 'qr.js'));
const tablet = require(path.join(__dirname, '..', 'src', 'tablet.js'));
let failures = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok   ' + name); }
  catch (err) { failures++; console.log('  FAIL ' + name + '\n       ' + String(err && err.stack || err).split('\n').slice(0, 9).join('\n       ')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- reading a symbol back ---- */
function readBack(sym) {
  const { blank, drawFunction, MASKS, EC_M, mul, EXP } = qr._test;
  const s = sym.size, v = (s - 17) / 4;
  const M = sym.rows.map((r) => [...r].map((c) => c === '1'));
  // both copies of the format information agree, and say level M + this mask
  const bit = (x, y) => (M[y][x] ? 1 : 0);
  let a = 0, b = 0;
  const A = [], B = [];
  for (let i = 0; i <= 5; i++) A.push([8, i]);
  A.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) A.push([14 - i, 8]);
  for (let i = 0; i < 8; i++) B.push([s - 1 - i, 8]);
  for (let i = 8; i < 15; i++) B.push([8, s - 15 + i]);
  A.forEach(([x, y], i) => { a |= bit(x, y) << i; });
  B.forEach(([x, y], i) => { b |= bit(x, y) << i; });
  assert.strictEqual(a, b, 'the two format copies differ');
  assert.strictEqual(a, qr.formatBits(sym.mask), 'format bits');
  assert.ok(M[s - 8][8], 'dark module');
  // finders
  for (const [cx, cy] of [[0, 0], [s - 7, 0], [0, s - 7]]) {
    for (let i = 0; i < 7; i++) assert.ok(M[cy][cx + i] && M[cy + 6][cx + i] && M[cy + i][cx] && M[cy + i][cx + 6], 'finder ring');
    assert.ok(M[cy + 3][cx + 3], 'finder core');
  }
  // the data, in placement order
  const q = blank(s);
  drawFunction(q, v);
  const bits = [];
  for (let right = s - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < s; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? s - 1 - vert : vert;
      if (q.fn[y][x]) continue;
      bits.push(M[y][x] !== MASKS[sym.mask](x, y) ? 1 : 0);
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const [ec, blocks, per] = EC_M[v];
  const data = [], ecs = [];
  for (let k = 0; k < blocks; k++) { data.push([]); ecs.push([]); }
  let p = 0;
  for (let i = 0; i < per; i++) for (let k = 0; k < blocks; k++) data[k].push(bytes[p++]);
  for (let i = 0; i < ec; i++) for (let k = 0; k < blocks; k++) ecs[k].push(bytes[p++]);
  // every block is a codeword: its polynomial is zero at α^0 … α^(ec-1)
  for (let k = 0; k < blocks; k++) {
    const cw = data[k].concat(ecs[k]);
    for (let i = 0; i < ec; i++) {
      let sum = 0;
      for (const c of cw) sum = mul(sum, EXP[i]) ^ c;
      assert.strictEqual(sum, 0, `block ${k} syndrome ${i}`);
    }
  }
  const flat = [].concat(...data);
  const stream = flat.map((x) => x.toString(2).padStart(8, '0')).join('');
  assert.strictEqual(stream.slice(0, 4), '0100', 'byte mode');
  const len = parseInt(stream.slice(4, 12), 2);
  const out = [];
  for (let i = 0; i < len; i++) out.push(parseInt(stream.slice(12 + i * 8, 20 + i * 8), 2));
  return new TextDecoder().decode(Uint8Array.from(out));
}

/* ---- a WebSocket client small enough to see every byte of ---- */
function wsConnect(url, origin) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname, headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), Origin: origin, 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130'
      }
    });
    req.on('response', (res) => resolve({ status: res.statusCode }));
    req.on('error', (err) => resolve({ status: 0, error: err.code }));
    req.on('upgrade', (res, sock, head) => {
      const got = [];
      let buf = Buffer.alloc(0), closed = false;
      // the frames that arrived with the 101 come in `head`, not as data
      const take = (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
          if (buf.length < off + len) break;
          const op = buf[0] & 0x0f;
          if (op === 1) got.push(JSON.parse(buf.subarray(off, off + len).toString()));
          if (op === 8) closed = true;
          buf = buf.subarray(off + len);
        }
      };
      sock.on('data', take);
      if (head && head.length) take(head);
      sock.on('close', () => { closed = true; });
      const send = (obj) => {
        const body = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj));
        const mask = crypto.randomBytes(4);
        const head = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 255]);
        const m = Buffer.from(body); for (let i = 0; i < m.length; i++) m[i] ^= mask[i & 3];
        sock.write(Buffer.concat([head, mask, m]));
      };
      resolve({ status: 101, sock, got, send, isClosed: () => closed });
    });
    req.end();
  });
}
const get = (url) => new Promise((resolve) => {
  http.get(url, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b })); })
    .on('error', (err) => resolve({ status: 0, error: err.code }));
});
async function until(fn, ms) {
  for (let t = 0; t < (ms || 2000); t += 20) { if (fn()) return true; await sleep(20); }
  return false;
}

(async () => {
  console.log('qr.js');

  await test('every length from 1 to 106 bytes reads back exactly', () => {
    for (let n = 1; n <= 106; n++) {
      const text = 'http://192.168.1.' + 'x'.repeat(Math.max(0, n - 17));
      const t = text.slice(0, n);
      const sym = qr.encode(t);
      assert.strictEqual(readBack(sym), t, 'length ' + n);
    }
  });
  await test('the longest pairing URL fits version 5 (37 modules), a short one version 4', () => {
    const long = qr.encode('http://192.168.100.200:65535/t/' + 'a'.repeat(32));
    assert.strictEqual(long.size, 37);
    assert.strictEqual(long.rows.length, 37);
    assert.strictEqual(qr.encode('http://192.168.1.20:50123/t/' + 'a'.repeat(32)).size, 33);
  });
  await test('text longer than version 6 holds is refused, not truncated', () => {
    assert.throws(() => qr.encode('x'.repeat(107)));
  });

  console.log('tablet.js');

  await test('private addresses only', () => {
    for (const ip of ['10.0.0.4', '172.16.0.1', '172.31.255.255', '192.168.1.2', '127.0.0.1', '::ffff:192.168.0.9']) assert.ok(tablet.isPrivate(ip), ip);
    for (const ip of ['8.8.8.8', '172.32.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fe80::1', '']) assert.ok(!tablet.isPrivate(ip), ip);
  });
  await test('a message is checked, clamped, or dropped', () => {
    assert.deepStrictEqual(tablet.clean({ t: 'down', id: 's1', x: 0.5, y: 2, p: 3, tool: 'brush', size: 9, color: 'red', extra: 1 }),
      { t: 'down', id: 's1', x: 0.5, y: 1.5, p: 1, tool: 'brush', size: 2, color: 'red' });
    assert.strictEqual(tablet.clean({ t: 'down', id: 's1', x: 0, y: 0, tool: 'laser' }), null);
    assert.strictEqual(tablet.clean({ t: 'down', id: '../x', x: 0, y: 0, tool: 'pen' }), null);
    assert.strictEqual(tablet.clean({ t: 'down', id: 's1', x: 0, y: 0, tool: 'pen', color: 'url(javascript:1)' }).color, 'text');
    assert.strictEqual(tablet.clean({ t: 'move', id: 's1', pts: [0, 0] }), null);
    assert.strictEqual(tablet.clean({ t: 'move', id: 's1', pts: [0, 'x', 0] }), null);
    assert.strictEqual(tablet.clean({ t: 'move', id: 's1', pts: new Array(3 * 129).fill(0) }), null);
    assert.strictEqual(tablet.clean({ t: 'zoom', f: 100, x: 0, y: 0 }).f, 2);
    assert.strictEqual(tablet.clean({ t: 'eval', code: '1' }), null);
    assert.strictEqual(tablet.clean('down'), null);
    assert.strictEqual(tablet.cleanOut({ t: 'board', notes: [] }), null, 'nothing but the view goes to the phone');
  });

  await test('pairing: the page, the token once, the Origin, resume, and Stop', async () => {
    const msgs = [], states = [];
    const r = await tablet.start({ host: '127.0.0.1', strings: { title: 'T<script>', pen: 'Pen</script>' }, onMessage: (m) => msgs.push(m), onState: (s) => states.push(s) });
    assert.ok(r.ok, 'started: ' + r.error);
    const u = new URL(r.url);
    const origin = `http://127.0.0.1:${u.port}`;
    const token = u.pathname.split('/').pop();
    assert.ok(/^[0-9a-f]{32}$/.test(token), 'token');
    assert.strictEqual(readBack({ size: r.qr.length, rows: r.qr, mask: qr.encode(r.url).mask }), r.url, 'the code is the URL');
    assert.strictEqual(states[states.length - 1].state, 'waiting');

    const page = await get(r.url);
    assert.strictEqual(page.status, 200);
    assert.ok(/connect-src ws:\/\/127\.0\.0\.1:\d+/.test(page.headers['content-security-policy']), 'csp');
    assert.ok(!/__(NONCE|STRINGS|TITLE)__/.test(page.body), 'placeholders filled');
    assert.ok(page.body.includes('"pen":"Pen' + String.fromCharCode(92) + 'u003c/script>"'), 'the strings are in the page');
    assert.ok(!page.body.includes('Pen</script>'), 'a string cannot close the script');
    assert.ok(!page.body.includes('<title>T<script>'), 'title escaped');
    assert.strictEqual((await get(`${origin}/t/${'0'.repeat(32)}`)).status, 404, 'wrong token');
    assert.strictEqual((await get(`${origin}/`)).status, 404);
    assert.strictEqual((await get(`${origin}/src/main.js`)).status, 404, 'serves no files');

    assert.strictEqual((await wsConnect(`${origin}/ws/${'0'.repeat(32)}`, origin)).status, 403, 'wrong token');
    assert.strictEqual((await wsConnect(`${origin}/ws/${token}`, 'http://evil.example')).status, 403, 'wrong origin');
    const a = await wsConnect(`${origin}/ws/${token}`, origin);
    assert.strictEqual(a.status, 101);
    await until(() => a.got.length);
    const hello = a.got[0];
    assert.strictEqual(hello.t, 'hello');
    assert.ok(/^[0-9a-f]{32}$/.test(hello.resume) && hello.resume !== token, 'a second secret');
    assert.strictEqual(states[states.length - 1].state, 'connected');
    assert.strictEqual(states[states.length - 1].device, 'Android · Chrome');
    assert.strictEqual((await wsConnect(`${origin}/ws/${token}`, origin)).status, 403, 'one phone at a time');

    a.send({ t: 'down', id: 'k1', x: 0.25, y: 0.5, p: 0.4, tool: 'pen', size: 1, color: 'blue' });
    a.send({ t: 'move', id: 'k1', pts: [0.3, 0.5, 0.5, 0.35, 0.55, 0.6] });
    a.send({ t: 'up', id: 'k1' });
    a.send({ t: 'exec', id: 'k1' });
    a.send('not json');
    a.send({ t: 'ping', n: 123 });
    await until(() => msgs.length >= 3 && a.got.some((m) => m.t === 'pong'));
    assert.deepStrictEqual(msgs.map((m) => m.t), ['down', 'move', 'up'], 'only our three');
    assert.strictEqual(a.got.find((m) => m.t === 'pong').n, 123);
    assert.ok(tablet.send({ t: 'view', a: 1.6, ro: false, pal: [{ k: 'text', c: 'rgb(0, 0, 0)' }] }));
    await until(() => a.got.some((m) => m.t === 'view'));
    assert.strictEqual(a.got.find((m) => m.t === 'view').a, 1.6);

    // a drop: away, then only the resume secret gets back in — the token is spent
    a.sock.destroy();
    await until(() => states[states.length - 1].state === 'away');
    assert.strictEqual(states[states.length - 1].state, 'away');
    assert.strictEqual((await wsConnect(`${origin}/ws/${token}`, origin)).status, 403, 'a used token opens nothing');
    const b = await wsConnect(`${origin}/ws/r/${hello.resume}`, origin);
    assert.strictEqual(b.status, 101, 'resume');
    await until(() => b.got.some((m) => m.t === 'view'));
    assert.ok(b.got.some((m) => m.t === 'view'), 'told the view again on the way back');

    tablet.stop('stopped');
    await until(() => b.isClosed());
    assert.ok(b.got.some((m) => m.t === 'bye'), 'bye');
    assert.strictEqual(states[states.length - 1].state, 'off');
    assert.strictEqual((await get(r.url)).status, 0, 'nothing listening after Stop');
  });

  await test('a frame that is not masked closes the socket', async () => {
    const r = await tablet.start({ host: '127.0.0.1' });
    const u = new URL(r.url);
    const origin = `http://127.0.0.1:${u.port}`;
    const a = await wsConnect(`${origin}/ws/${u.pathname.split('/').pop()}`, origin);
    a.sock.write(Buffer.concat([Buffer.from([0x81, 2]), Buffer.from('{}')]));
    assert.ok(await until(() => a.isClosed()), 'closed');
    tablet.stop();
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
