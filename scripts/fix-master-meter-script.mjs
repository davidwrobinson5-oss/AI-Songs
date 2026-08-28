import fs from 'node:fs';

const path = 'scripts/patch-master-meter.mjs';
let source = fs.readFileSync(path, 'utf8');

source = source.replaceAll('${profile.label}', '\\${profile.label}');
source = source.replaceAll('${metrics.integratedLufs.toFixed(1)}', '\\${metrics.integratedLufs.toFixed(1)}');
source = source.replaceAll('${metrics.truePeakDb.toFixed(1)}', '\\${metrics.truePeakDb.toFixed(1)}');
source = source.replaceAll("${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}", "\\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}");

fs.writeFileSync(path, source);
console.log('Prepared mastering meter patch templates.');
