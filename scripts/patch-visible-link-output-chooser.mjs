import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const start=source.lastIndexOf('    <div className="sheetSourceCard">\n      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>');
if(start<0)throw new Error('Analyze Music Link card not found.');

// Analyze Music Link is the final card inside the SheetImportTools wrapper.
// Replace everything from that card to the component wrapper close so build-
// time changes inside the card cannot make this patch brittle.
const componentClose=source.lastIndexOf('\n  </div>;\n}');
if(componentClose<0||componentClose<=start)throw new Error('SheetImportTools component close not found.');

const replacement=`    <div className="sheetSourceCard">
      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>
      <p className="sub">Paste a YouTube or supported media link, choose exactly what you want Pie to create, then analyze it.</p>
    </div>`;

source=source.slice(0,start)+replacement+source.slice(componentClose);
fs.writeFileSync(path,source);
console.log('Analyze Music Link now ends after its description.');
