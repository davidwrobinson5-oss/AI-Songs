import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

const oldDurations = `const durations = [
  { label: '30 sec', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '2 min', value: 120000 },
];`;

const newDurations = `const durations = [
  { label: '30 sec', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '2 min', value: 120000 },
  { label: '3 min', value: 180000 },
  { label: '3:30', value: 210000 },
];`;

if (!source.includes("{ label: '3 min', value: 180000 }")) {
  if (!source.includes(oldDurations)) throw new Error('Song duration options block not found.');
  source = source.replace(oldDurations, newDurations);
}

fs.writeFileSync(path, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS MOBILE SONG ART FIX */';
if (!css.includes(marker)) {
  css += `
${marker}
.songLibraryCard{padding-left:92px!important;min-height:92px!important}
.songLibraryCard:before{left:12px!important;top:12px!important;width:54px!important;height:54px!important;padding:6px!important;border-radius:15px!important;font-size:18px!important;box-sizing:content-box!important}
@media(max-width:430px){
  .songLibraryCard{padding-left:88px!important;padding-right:12px!important;min-height:88px!important}
  .songLibraryCard:before{left:11px!important;top:11px!important;width:52px!important;height:52px!important;padding:6px!important;border-radius:14px!important;font-size:17px!important}
}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added 3:00 and 3:30 song duration options and fixed mobile song artwork sizing.');
