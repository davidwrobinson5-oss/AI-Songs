import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import AudioProcessorWorkspace from './AudioProcessorWorkspace';")){
  const marker="import SheetsWorkspace from './SheetsWorkspace';";
  if(!source.includes(marker)) throw new Error('Inline audio processor patch could not find Sheets import.');
  source=source.replace(marker,`${marker}\nimport AudioProcessorWorkspace from './AudioProcessorWorkspace';`);
}

if(!source.includes('<AudioProcessorWorkspace />')){
  const oldBlock=`        <section className="panel noPrint" style={{marginBottom:16}}>\n          <p className="eyebrow">Audio Import</p>\n          <h2>Turn an audio file into sheets and stems</h2>\n          <p className="sub">Upload a finished WAV, MP3, M4A, or other audio file and start the real transcription and source-separation jobs directly.</p>\n          <a className="primary" href="/process-audio" style={{display:'inline-block',textDecoration:'none'}}>Audio → Sheets & Stems</a>\n        </section>\n`;
  if(source.includes(oldBlock)) source=source.replace(oldBlock,'        <AudioProcessorWorkspace />\n');
  else {
    const marker='        <SheetsWorkspace';
    if(!source.includes(marker)) throw new Error('Inline audio processor patch could not find Sheets workspace.');
    source=source.replace(marker,'        <AudioProcessorWorkspace />\n'+marker);
  }
}

fs.writeFileSync(path,source);
console.log('Embedded Audio → Sheets & Stems directly inside Sheets.');
