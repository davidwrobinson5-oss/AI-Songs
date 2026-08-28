import fs from 'node:fs';

const path = 'scripts/patch-master-meter.mjs';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "`      setStatus(\\`${profile.label} master rendered and saved as a new Songs version.\\`);`,",
  "`      setStatus(\\`\\${profile.label} master rendered and saved as a new Songs version.\\`);`,",
);

source = source.replace(
  "`      setStatus(\\`${profile.label} master saved · ${metrics.integratedLufs.toFixed(1)} LUFS est. · ${metrics.truePeakDb.toFixed(1)} dBTP est.${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\\`);`,",
  "`      setStatus(\\`\\${profile.label} master saved · \\${metrics.integratedLufs.toFixed(1)} LUFS est. · \\${metrics.truePeakDb.toFixed(1)} dBTP est.\\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' :