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
console.log('Added 3:00 and 3:30 song duration options.');
