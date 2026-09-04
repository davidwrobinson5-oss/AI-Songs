#!/usr/bin/env node
import fs from 'node:fs';

const input = process.argv[2] || 'code-health-report.md';
const output = process.argv[3] || input.replace(/\.md$/i, '.pdf');
const raw = fs.readFileSync(input, 'utf8')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[^ -~\n]/g, '?');

const wrap = (line, width = 94) => {
  const words = line.replace(/^#+\s*/, '').split(/\s+/);
  const rows = [];
  let row = '';
  for (const word of words) {
    if (!word) continue;
    if ((row + ' ' + word).trim().length > width) {
      if (row) rows.push(row);
      row = word;
    } else row = (row + ' ' + word).trim();
  }
  if (row || !rows.length) rows.push(row);
  return rows;
};

const lines = raw.split(/\r?\n/).flatMap((line) => wrap(line));
const pages = [];
for (let i = 0; i < lines.length; i += 54) pages.push(lines.slice(i, i + 54));
if (!pages.length) pages.push(['No report content.']);

const objects = [null];
const add = (value) => { objects.push(value); return objects.length - 1; };
const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
const pageIds = [];

for (const pageLines of pages) {
  const commands = ['BT', '/F1 9 Tf', '42 760 Td', '11 TL'];
  for (const line of pageLines) {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    commands.push(`(${escaped}) Tj`, 'T*');
  }
  commands.push('ET');
  const stream = commands.join('\n');
  const contentId = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  pageIds.push(add({ contentId }));
}

const pagesId = objects.length;
objects.push('');
for (const pageId of pageIds) {
  const { contentId } = objects[pageId];
  objects[pageId] = `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
}
objects[pagesId] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

let pdf = '%PDF-1.4\n';
const offsets = [0];
for (let id = 1; id < objects.length; id += 1) {
  offsets[id] = Buffer.byteLength(pdf);
  pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(output, pdf);
console.log(`PDF report written to ${output}.`);
