import fs from 'node:fs';

const pagePath='app/page.tsx';
let source=fs.readFileSync(pagePath,'utf8');

if(!source.includes("import DataWorkspace from './DataWorkspace';")){
  if(source.includes("import LegalGigsWorkspace from './LegalGigsWorkspace';")) source=source.replace("import LegalGigsWorkspace from './LegalGigsWorkspace';", "import LegalGigsWorkspace from './LegalGigsWorkspace';\nimport DataWorkspace from './DataWorkspace';\nimport ScoreboardWorkspace from './ScoreboardWorkspace';\nimport CyberSecurityWorkspace from './CyberSecurityWorkspace';\nimport PieGuide from './PieGuide';");
  else source=source.replace("'use client';", "'use client';\n\nimport DataWorkspace from './DataWorkspace';\nimport ScoreboardWorkspace from './ScoreboardWorkspace';\nimport CyberSecurityWorkspace from './CyberSecurityWorkspace';\nimport PieGuide from './PieGuide';");
} else {
  if(!source.includes("import ScoreboardWorkspace from './ScoreboardWorkspace';")) source=source.replace("import DataWorkspace from './DataWorkspace';", "import DataWorkspace from './DataWorkspace';\nimport ScoreboardWorkspace from './ScoreboardWorkspace';");
  if(!source.includes("import CyberSecurityWorkspace from './CyberSecurityWorkspace';")) source=source.replace("import ScoreboardWorkspace from './ScoreboardWorkspace';", "import ScoreboardWorkspace from './ScoreboardWorkspace';\nimport CyberSecurityWorkspace from './CyberSecurityWorkspace';");
}

if(!source.includes("'data'")) source=source.replace(/type Screen = ([^;]+);/, (match, union) => `type Screen = ${union} | 'data';`);
if(!source.includes("'scoreboard'")) source=source.replace(/type Screen = ([^;]+);/, (match, union) => `type Screen = ${union} | 'scoreboard';`);
if(!source.includes("'cyber'")) source=source.replace(/type Screen = ([^;]+);/, (match, union) => `type Screen = ${union} | 'cyber';`);

const songsAnchor="  if (screen === 'songs') {";
if(!source.includes("screen === 'data'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for Data tab.');
  source=source.replace(songsAnchor,`  if (screen === 'data') {\n    return (\n      <>\n        <DataWorkspace />\n        <PieGuide />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n${songsAnchor}`);
}

if(!source.includes("screen === 'scoreboard'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for Scoreboard tab.');
  source=source.replace(songsAnchor,`  if (screen === 'scoreboard') {\n    return (\n      <>\n        <ScoreboardWorkspace />\n        <PieGuide />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n${songsAnchor}`);
}

if(!source.includes("screen === 'cyber'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for Cyber Security tab.');
  source=source.replace(songsAnchor,`  if (screen === 'cyber') {\n    return (\n      <>\n        <CyberSecurityWorkspace />\n        <PieGuide />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n${songsAnchor}`);
}

source=source.replace(/(<PieBottomNav active=\{screen\} onNavigate=\{\(next\) => setScreen\(next as Screen\)\} \/>)/g, (match, nav, offset, whole) => {
  const before=whole.slice(Math.max(0,offset-80),offset);
  return before.includes('<PieGuide />') ? match : `<PieGuide />\n        ${nav}`;
});

if(!source.includes('<DataWorkspace')) throw new Error('Data workspace missing after data/guide patch.');
if(!source.includes('<ScoreboardWorkspace')) throw new Error('Scoreboard workspace missing after data/guide patch.');
if(!source.includes('<CyberSecurityWorkspace')) throw new Error('Cyber Security workspace missing after data/guide patch.');
if(!source.includes('<PieGuide')) throw new Error('Pie Guide missing after data/guide patch.');

fs.writeFileSync(pagePath,source);
console.log('Added Data, Scoreboard, Cyber Security, and always-available Pie Guide.');
