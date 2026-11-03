/* A WebSocket client small enough to see every byte of — the phone's side of
   src/tablet.js's socket, for tools/test-tablet.js and the app suite
   (tools/test-app-features.js plays the phone against the running app).

   Text frames arrive parsed in `got`; a binary frame (a picture) as
   { bin: <length>, head: <first two bytes in hex>, at: <ms since connect> }.
   Never shipped. */
'use strict';
const http = require('http');
const crypto = require('crypto');

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
      const got = [], t0 = Date.now();
      let buf = Buffer.alloc(0), closed = false;
      // when each message arrived, in ms since the socket opened — not enumerable, so deepStrictEqual ignores it
      const stamp = (m) => { Object.defineProperty(m, 'at', { value: Date.now() - t0, enumerable: false }); return m; };
      // the frames that arrived with the 101 come in `head`, not as data
      const take = (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 2) {
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
          else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
          if (buf.length < off + len) break;
          const op = buf[0] & 0x0f;
          if (op === 1) got.push(stamp(JSON.parse(buf.subarray(off, off + len).toString())));
          if (op === 2) got.push(stamp({ bin: len, head: buf.subarray(off, off + 2).toString('hex') }));
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

module.exports = { wsConnect };
