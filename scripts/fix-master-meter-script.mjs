import fs from 'node:fs';

const path = 'scripts/patch-master-meter.mjs';
let source = fs.readFileSync(path, 'utf8');

// Kept as a compatibility step; patch-master-meter.mjs now contains escaped
// template placeholders directly and does not need repeated rewriting.

fs.writeFileSync(path, source);
console.log('Prepared mastering meter patch templates.');
