import fs from 'node:fs';

const path='app/SheetsWorkspace.tsx';
let source=fs.readFileSync(path,'utf8');

const start=source.indexOf('  return <section className="panel sheetsWorkspace exportSheetsWorkspace">');
const end=source.lastIndexOf('\n}');
if(start<0||end<0||end<=start)throw new Error('SheetsWorkspace render block not found.');

const replacement=`  return <section className="panel sheetsWorkspace exportSheetsWorkspace">
    <SheetImportTools />
  </section>`;

source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(path,source);
console.log('Removed legacy Song → Sheets, export cards, downloads, and white preview from Sheets.');
