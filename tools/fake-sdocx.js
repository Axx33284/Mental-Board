/* A Samsung Notes file for the tests — tools/test-store.js reads it through
   store.readSamsung, tools/test-app-features.js imports it into the app.
   Nothing here ships. */
'use strict';

/* A small Samsung Notes file, built byte by byte to the layout src/sdocx.js
   reads (MAP.md §4w): a title, a body with a bold word and a picture in it, and
   one page holding a stroke, a square and an object that is garbage. */
module.exports = function fakeSdocx() {
  const zlib = require('zlib');
  const B = (n) => Buffer.alloc(n);
  const u8 = (v) => Buffer.from([v]);
  const u16 = (v) => { const b = B(2); b.writeUInt16LE(v); return b; };
  const u32 = (v) => { const b = B(4); b.writeUInt32LE(v >>> 0); return b; };
  const i32 = (v) => { const b = B(4); b.writeInt32LE(v); return b; };
  const f32 = (v) => { const b = B(4); b.writeFloatLE(v); return b; };
  const f64 = (v) => { const b = B(8); b.writeDoubleLE(v); return b; };
  const s16 = (s) => Buffer.concat([u16(s.length), Buffer.from(s, 'utf16le')]);
  const s32 = (s) => Buffer.concat([u32(s.length), Buffer.from(s, 'utf16le')]);
  const cat = (...a) => Buffer.concat(a);
  const sm = (v, unit) => { const m = Math.round(Math.abs(v) * unit); return u16((v < 0 ? 0x8000 : 0) | m); };
  // a frame: size, type, flexible offset, the two masks, fixed, flexible
  const frame = (type, pm, fm, fixed, flex) => {
    const head = 4 + 2 + 4 + 1 + pm.length + 1 + fm.length;
    const b = B(head);
    b.writeUInt32LE(head + fixed.length + flex.length, 0); b.writeInt16LE(type, 4); b.writeUInt32LE(head + fixed.length, 6);
    b[10] = pm.length; Buffer.from(pm).copy(b, 11); b[11 + pm.length] = fm.length; Buffer.from(fm).copy(b, 12 + pm.length);
    return cat(b, fixed, flex);
  };
  const base = (x0, y0, x1, y1) => frame(0, [0x08, 0], [0, 0, 0, 0],
    cat(u32(4000), s16('x'.repeat(36)).subarray(0, 2), Buffer.from('u'.repeat(36)), B(8), f64(x0), f64(y0), f64(x1), f64(y1), B(5)), B(0));
  const span = (type, s, e, payload) => { const body = cat(u32(type), u32(s), u32(e), u32(0), payload); return cat(u16(body.length), body); };
  const textCommon = (text, spans, objects) => cat(s32(text), u32(spans.length), ...spans, u32(0), B(17), u16(0),
    u32(objects.length ? 1 : 0), u32(0), objects.length ? cat(u32(objects.length), ...objects) : B(0));
  const textFrames = (tc) => cat(base(0, 0, 0, 0), frame(6, [0], [0], B(0), B(0)), frame(7, [0], [1, 0, 0, 0], B(0), cat(u32(tc.length), tc)));
  const object = (type, payload) => cat(u8(type), u16(0), u32(payload.length + 32), payload, B(32));

  // the inline picture: 0 + 6 + 7 (a picture fill naming media 7) + 3
  const img = cat(base(0, 0, 40, 30), frame(6, [0], [0], B(0), B(0)),
    frame(7, [0], [0x20, 0, 0, 0], B(0), cat(u32(62), u8(2), u8(0), i32(7), B(57))), frame(3, [0], [0, 0, 0, 0], B(0), B(0)));
  const objSpan = (() => { const b = cat(u32(img.length), u32(3), img, i32(14), u32(0), u32(0)); return cat(u32(b.length), b); })();
  const body = textCommon('Milk and eggs\n￼', [span(5, 0, 4, u32(1)), span(3, 0, 15, f32(15))], [objSpan]);
  const title = textCommon('Groceries', [], []);
  const tf = textFrames(title), bf = textFrames(body);
  const noteFixed = cat(u32(5400), s16(''), u32(1), B(16), u32(1000), u32(2000), B(12), u32(tf.length), tf, u32(bf.length), bf);
  const noteHead = cat(u8(4), B(4), u8(4), B(4));
  const note = cat(u32(4 + noteHead.length + noteFixed.length), noteHead, noteFixed, B(32));

  // a compressed stroke: three points, three pressures, three times, two tool bytes
  const strokeFixed = cat(u16(3), f64(100), f64(200), sm(1, 32), sm(-0.5, 32), sm(0, 32), sm(3, 32),
    f32(0.5), sm(0.25, 4096), sm(-0.5, 4096), i32(0), u16(5), u16(5), u8(0), u8(0));
  const stroke = object(1, cat(base(100, 199, 101, 203), frame(1, [0x01, 0], [0x0c, 0, 0, 0], strokeFixed, cat(Buffer.from([0xcc, 0x66, 0x33, 0xff]), f32(6)))));
  // a square as a saved path, outlined 3 wide
  const path = cat(u32(5), u8(1), f64(10), f64(10), u8(2), f64(50), f64(10), u8(2), f64(50), f64(50), u8(2), f64(10), f64(50), u8(6));
  const square = object(7, cat(base(10, 10, 50, 50), frame(6, [0], [0x08, 0, 0, 0], B(0), cat(u32(12), f32(3), B(8))),
    frame(7, [0], [0, 0, 0, 0], cat(u32(4), f64(10), f64(10), f64(50), f64(50), f32(0), u32(path.length), path, u8(0), B(32)), B(0))));
  const garbage = object(1, Buffer.from('this is not a frame at all, just bytes'));
  const pageHead = cat(u8(4), B(4), u8(4), B(4), u32(0), u32(1000), u32(2000));
  const layer = cat(u32(12), u32(0), u8(1), B(1), u8(1), B(1), u32(3), garbage, stroke, square, B(32));
  const page = cat(u32(8 + pageHead.length), u32(0), pageHead, u16(1), u16(0), layer, B(32), Buffer.from('Page for SAMSUNG S-Pen SDK'));
  const uuid = 'p1';
  const pageIds = cat(B(32), u16(1), s16(uuid), B(32));
  const rec = cat(u32(7), s16('7@pic.png'), u16(0), u16(1), B(8), u8(0));
  const mediaInfo = cat(u32(5500), u16(1), u32(rec.length), rec, Buffer.from('EOFX'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

  // the zip around it, every entry deflated
  const entries = [['note.note', note], ['pageIdInfo.dat', pageIds], [`${uuid}.page`, page], ['media/mediaInfo.dat', mediaInfo], ['media/7@pic.png', png]];
  const local = [], central = [];
  let off = 0;
  for (const [name, data] of entries) {
    const z = zlib.deflateRawSync(data), n = Buffer.from(name), crc = zlib.crc32 ? zlib.crc32(data) : 0;
    const lh = B(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(z.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = B(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(z.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    local.push(lh, n, z); central.push(ch, n);
    off += 30 + n.length + z.length;
  }
  const cd = cat(...central);
  const end = B(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  // Samsung appends its own record after the zip; the reader has to look past it
  return cat(...local, cd, end, Buffer.from('Document for S-Pen SDK'));
};
