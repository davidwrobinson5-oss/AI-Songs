import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const start=source.lastIndexOf('    <div className="sheetSourceCard">\n      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>');
if(start<0)throw new Error('Analyze Music Link card not found.');
const endMarker='\n    </div>\n  </div>;\n}';
const end=source.indexOf(endMarker,start);
if(end<0)throw new Error('Analyze Music Link card end not found.');

const replacement=`    <div className="sheetSourceCard">
      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>
      <p className="sub">Paste a YouTube or supported media link, choose exactly what you want Pie to create, then analyze it.</p>
    </div>`;

source=source.slice(0,start)+replacement+source.slice(end+('\n    </div>').length);
fs.writeFileSync(path,source);
console.log('Analyze Music Link now ends after its description.');
