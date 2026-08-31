import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

if (!page.includes("import SongAnalysisWorkspace from './SongAnalysisWorkspace';")) {
  const importNeedle = "import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';";
  if (!page.includes(importNeedle)) throw new Error('Song analysis patch could not find MelodyWorkspace import.');
  page = page.replace(importNeedle, `${importNeedle}\nimport SongAnalysisWorkspace from './SongAnalysisWorkspace';`);
}

if (!page.includes('<SongAnalysisWorkspace')) {
  const generatorNeedles = [
    '      <section className="panel">\n        <h2>Music Generator</h2>',
    '      <section className="panel">\n        <h2>ElevenLabs Music v2</h2>',
  ];
  const needle = generatorNeedles.find((item) => page.includes(item));
  if (!needle) throw new Error('Song analysis patch could not find the Music Generator section.');

  const workspace = `      <SongAnalysisWorkspace\n        vocalRange={vocalRange}\n        onVocalRangeChange={setVocalRange}\n        onApply={(plan, range) => {\n          setVocalRange(range);\n          setPrompt((current) => current.trim()\n            ? current.trim() + '\\n\\nPIE ANALYSIS SETTINGS\\n' + plan\n            : plan);\n        }}\n      />\n\n`;
  page = page.replace(needle, workspace + needle);
}

fs.writeFileSync(pagePath, page);
console.log('Added automatic song analysis workspace to Music flow.');
