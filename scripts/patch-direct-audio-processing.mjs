import fs from 'node:fs';

const analysisPath='app/SongAnalysisWorkspace.tsx';
let analysis=fs.readFileSync(analysisPath,'utf8');
if(!analysis.includes("pie-audio-processing-started")){
  const old=`      if(isAudio){\n        try{window.dispatchEvent(new CustomEvent('pie-audio-upload-ready',{detail:{file,name:file.name}}));}catch{}\n        setStatus('Analysis ready. Pie is also creating sheet music and separating individual stems below…');\n      }`;
  if(!analysis.includes(old)) throw new Error('Direct audio patch could not find audio handoff anchor.');
  const next=`      if(isAudio){\n        setStatus('Analysis ready. Uploading once more to start sheet music and stem processing…');\n        const stagedPath=await stagePieFile(file,(p)=>setStatus(\`Starting sheet/stem processing… \${p}%\`));\n        const processResponse=await fetch('/api/sheets/process-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'audio/mpeg'})});\n        const processRaw=await processResponse.text();let processData:any={};try{processData=JSON.parse(processRaw)}catch{processData={error:processRaw}}\n        if(!processResponse.ok)throw new Error(processData?.error||'Could not start sheet music and stem processing.');\n        try{\n          sessionStorage.setItem('pie-audio-processing-jobs',JSON.stringify(processData.jobs||{}));\n          window.dispatchEvent(new CustomEvent('pie-audio-processing-started',{detail:{jobs:processData.jobs||{},name:file.name}}));\n        }catch{}\n        setStatus('Analysis ready. Sheet music and individual stem processing have started below.');\n      }`;
  analysis=analysis.replace(old,next);
}
fs.writeFileSync(analysisPath,analysis);

const sheetsPath='app/SheetsWorkspace.tsx';
let sheets=fs.readFileSync(sheetsPath,'utf8');
if(!sheets.includes("pie-audio-processing-started")){
  const marker=`  useEffect(()=>{\n    const ids=Object.values(jobs).filter(Boolean); if(!ids.length) return;`;
  if(!sheets.includes(marker)) throw new Error('Direct audio patch could not find jobs polling effect.');
  const helper=`  useEffect(()=>{\n    const applyJobs=(incoming:JobMap)=>{\n      if(!incoming||!Object.keys(incoming).length)return;\n      setJobs(incoming);setStatuses({});setChords([]);setStemStarted(false);\n      setStatus('Sheet music and stem processing started. Tracking progress now…');\n    };\n    try{\n      const saved=sessionStorage.getItem('pie-audio-processing-jobs');\n      if(saved)applyJobs(JSON.parse(saved) as JobMap);\n    }catch{}\n    const onStarted=(event:Event)=>applyJobs(((event as CustomEvent<{jobs?:JobMap}>).detail?.jobs||{}) as JobMap);\n    window.addEventListener('pie-audio-processing-started',onStarted);\n    return()=>window.removeEventListener('pie-audio-processing-started',onStarted);\n  },[]);\n\n`;
  sheets=sheets.replace(marker,helper+marker);
}
fs.writeFileSync(sheetsPath,sheets);
console.log('Audio upload now starts server-side sheet and stem jobs directly.');
