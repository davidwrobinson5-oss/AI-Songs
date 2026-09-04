import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

const old=`  { id: 'melody' as StartMode, icon: '🎤', title: 'Melody First', copy: 'Sing, hum, or upload a melody, then fit lyrics precisely to it.' },`;
const next=`  { id: 'melody' as StartMode, icon: '🎤', title: 'Melody and Chords First', copy: 'Sing, hum, whistle, or record your instrument, then build the song from your melody and chords.' },`;

if(!source.includes(next)){
  if(!source.includes(old))throw new Error('Melody First option copy not found.');
  source=source.replace(old,next);
}

fs.writeFileSync(path,source);
console.log('Renamed Melody First to Melody and Chords First and updated its description.');
