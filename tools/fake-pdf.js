/* A small PDF built byte by byte for the tests — two pages, each a line of
   text in Helvetica (a standard font, so pdf.js uses its own copy) and a
   filled box. No real document is checked in. Returns a Buffer. */
'use strict';
module.exports = function fakePdf() {
  const pages = [
    'BT /F1 36 Tf 72 700 Td (Page one: worksheet) Tj ET 0.2 0.5 0.9 rg 72 400 300 200 re f',
    'BT /F1 36 Tf 72 700 Td (Page two: answers) Tj ET 0.9 0.4 0.2 rg 150 300 250 250 re f'
  ];
  const objs = [];
  const fontId = 3 + pages.length * 2;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  pages.forEach((c, i) => {
    objs[3 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objs[4 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  objs[fontId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let out = '%PDF-1.4\n';
  const offs = [];
  for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
};
