import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes('Audio → Sheets & Stems')){
  const marker='        <SheetsWorkspace';
  if(!source.includes(marker)) throw new Error('Visible audio processor link patch could not find Sheets workspace.');
  const block=`        <section className="panel noPrint" style={{marginBottom:16}}>\n          <p className="eyebrow">Audio Import</p>\n          <h2>Turn an audio file into sheets and stems</h2>\n          <p className="sub">Upload a finished WAV, MP3, M4A, or other audio file and start the real transcription and source-separation jobs directly.</p>\n          <a className="primary" href="/process-audio" style={{display:'inline-block',textDecoration:'none'}}>Audio → Sheets & Stems</a>\n        </section>\n`;
  source=source.replace(marker,block+marker);
}

fs.writeFileSync(path,source);
console.log('Added visible Audio → Sheets & Stems button to Sheets.');
