import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

if (!page.includes("import SongAnalysisWorkspace from './SongAnalysisWorkspace';")) {
  const importNeedle = "import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';";
  if (!page.includes(importNeedle)) throw new Error('Song analysis patch could not find MelodyWorkspace import.');
  page = page.replace(importNeedle, `${importNeedle}\nimport SongAnalysisWorkspace from './SongAnalysisWorkspace';`);
}

if (!page.includes('<SongAnalysisWorkspace')) {
  const workspace = `      <SongAnalysisWorkspace\n        vocalRange={vocalRange}\n        onVocalRangeChange={setVocalRange}\n        onApply={(plan, range) => {\n          setVocalRange(range);\n          setPrompt((current) => current.trim()\n            ? current.trim() + '\\n\\nPIE ANALYSIS SETTINGS\\n' + plan\n            : plan);\n        }}\n      />\n\n`;

  const createMainNeedle = '  return (\n    <main>';
  const index = page.lastIndexOf(createMainNeedle);
  if (index < 0) throw new Error('Song analysis patch could not find the Music page main return.');
  const insertAt = index + createMainNeedle.length;
  page = page.slice(0, insertAt) + '\n' + workspace + page.slice(insertAt);
}

fs.writeFileSync(pagePath, page);
console.log('Added automatic song analysis workspace to Music flow.');
