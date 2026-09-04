import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const start=source.lastIndexOf('    <div className="sheetSourceCard">\n      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>');
if(start<0)throw new Error('Analyze Music Link card not found.');

// Remove the entire final Analyze Music Link section, including its heading,
// description, input/actions/options, and anything below it inside this tool.
const componentClose=source.lastIndexOf('\n  </div>;\n}');
if(componentClose<0||componentClose<=start)throw new Error('SheetImportTools component close not found.');

source=source.slice(0,start)+source.slice(componentClose);
fs.writeFileSync(path,source);
console.log('Removed the entire Analyze Music Link section from Sheets.');
