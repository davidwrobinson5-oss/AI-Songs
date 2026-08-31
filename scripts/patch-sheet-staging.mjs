import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import { stagePieFile } from './stagedUpload';")){
  source=source.replace("import { useEffect, useMemo, useRef, useState } from 'react';", "import { useEffect, useMemo, useRef, useState } from 'react';\nimport { stagePieFile } from './stagedUpload';");
}

if(!source.includes('async function readApiResponse(response:Response)')){
  source=source.replace('function partLabel(part: ScorePart) {', `async function readApiResponse(response:Response){\n  const raw=await response.text();\n  let data:any={};\n  if(raw){\n    try{data=JSON.parse(raw);}catch{}\n  }\n  if(!response.ok){\n    if(response.status===504) throw new Error('Score analysis took too long. Please try again; larger scores can take a few minutes.');\n    throw new Error(data?.error||raw||('Request failed ('+response.status+').'));\n  }\n  if(!raw) return {};\n  if(!data||typeof data!=='object'||Array.isArray(data)) throw new Error('Pie received an invalid response from the analysis service. Please try again.');\n  return data;\n}\n\nfunction partLabel(part: ScorePart) {`);
}

const oldScore=`  async function analyzeScore(file:File){\n    setScoreBusy(true); setScoreStatus('Reading notes, lyrics, instruments, and choir parts…'); setScore(null); setRenders([]); setSelected({}); setFullArrangement(false);\n    try{\n      const fd=new FormData(); fd.append('file',file);\n      const r=await fetch('/api/sheets/import-score',{method:'POST',body:fd}); const d=await r.json();\n      if(!r.ok) throw new Error(d.error||'Could not read music sheets.');\n      setScore(d.score as Score); setScoreStatus('Score analyzed. What parts do you want to render?');\n    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not read music sheets.')}finally{setScoreBusy(false)}\n  }`;
const stagedScore=`  async function analyzeScore(file:File){\n    setScoreBusy(true); setScoreStatus('Preparing music sheets for secure upload…'); setScore(null); setRenders([]); setSelected({}); setFullArrangement(false);\n    try{\n      if(file.size>20*1024*1024) throw new Error('Music-sheet files must be 20 MB or smaller.');\n      const stagedPath=await stagePieFile(file,percent=>setScoreStatus('Uploading music sheets… '+percent+'%'));\n      setScoreStatus('Reading notes, lyrics, instruments, and choir parts…');\n      const r=await fetch('/api/sheets/import-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/pdf'})}); const d=await readApiResponse(r);\n      setScore(d.score as Score); setScoreStatus('Score analyzed. What parts do you want to render?');\n    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not read music sheets.')}finally{setScoreBusy(false)}\n  }`;
if(source.includes(oldScore)) source=source.replace(oldScore,stagedScore);
else source=source.replace(/  async function analyzeScore\(file:File\)\{[\s\S]*?\n  \}\n\n  function toggle/, stagedScore+'\n\n  function toggle');

const oldMedia=`  async function analyzeMedia(file:File){\n    const fd=new FormData(); fd.append('file',file); await beginStemAnalysis(fd);\n  }`;
const stagedMedia=`  async function analyzeMedia(file:File){\n    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkStatus('Preparing media for secure upload…');\n    try{\n      if(file.size>45*1024*1024) throw new Error('Audio/video files must be 45 MB or smaller.');\n      const stagedPath=await stagePieFile(file,percent=>setLinkStatus('Uploading media… '+percent+'%'));\n      setLinkStatus('Starting six-part stem analysis…');\n      const r=await fetch('/api/sheets/link-stems',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/octet-stream'})}); const d=await readApiResponse(r);\n      setStemJob(String(d.jobId)); setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');\n    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}\n  }`;
if(source.includes(oldMedia)) source=source.replace(oldMedia,stagedMedia);
else source=source.replace(/  async function analyzeMedia\(file:File\)\{[\s\S]*?\n  \}\n\n  useEffect/, stagedMedia+'\n\n  useEffect');

fs.writeFileSync(path,source);
console.log('Routed Sheets uploads through chunk staging with safe API parsing.');
