import fs from 'node:fs';
import path from 'node:path';

const appDir = path.join(process.cwd(), 'app');
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const heatCopy = 'Turning up the heat…';

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (sourceExtensions.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const processingCopy = /(['"`])((?:Generating|Writing|Improving|Creating|Finding|Converting|Saving|Sending|Analyzing|Preparing|Processing|Loading|Syncing|Uploading|Mixing|Mastering|Rendering|Exporting|Building|Separating|Transcribing|Detecting|Applying|Running|Polishing|Working|Please wait)[^'"`\n]{0,140}(?:…|\.{3}))\1/g;

let changedFiles = 0;

for (const file of collectSourceFiles(appDir)) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;

  // Keep provider implementation details and API paths intact while removing
  // provider branding from anything that can surface in product copy/errors.
  after = after.replaceAll('ElevenLabs Music v2', 'Music Generator');
  after = after.replaceAll('ElevenLabs', 'Music Engine');

  // Use one simple Pie-branded message while work is actively in progress.
  after = after.replace(processingCopy, (_match, quote) => `${quote}${heatCopy}${quote}`);

  if (after !== before) {
    fs.writeFileSync(file, after);
    changedFiles += 1;
  }
}

console.log(`Applied Pie brand copy to ${changedFiles} source file(s).`);
