import fs from 'node:fs';

const path='app/AudioProcessorWorkspace.tsx';
let source=fs.readFileSync(path,'utf8');

const start='{library.length>0&&<section className="panel" style={{padding:20,marginTop:16}}>';
const end='    </section>}\n\n    {hasStarted&&<section className="panel" style={{padding:20,marginTop:16}}>';

if(source.includes(start)){
  source=source.replace(start,'<section className="panel" style={{padding:20,marginTop:16}}>');
}
if(source.includes(end)){
  source=source.replace(end,'    </section>\n\n    {hasStarted&&<section className="panel" style={{padding:20,marginTop:16}}>');
}

const oldCopy='<p className="sub">Saved on this device so switching between Music, Songs, Mix, Voice, and Sheets does not erase the job.</p>';
const newCopy='<p className="sub">{library.length?\'Saved on this device so switching between Music, Songs, Mix, Voice, and Sheets does not erase the job.\':\'No saved jobs yet. Your next audio transcription will appear here automatically and remain available when you switch screens.\'}</p>';
if(source.includes(oldCopy)) source=source.replace(oldCopy,newCopy);

fs.writeFileSync(path,source);
console.log('Saved Sheets & Stems library is always visible.');
