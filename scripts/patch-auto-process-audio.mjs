import fs from 'node:fs';

// One audio upload in Auto Analyze should continue into the existing
// Song → Sheets transcription and source-separation workflow automatically.

const analysisPath='app/SongAnalysisWorkspace.tsx';
let analysis=fs.readFileSync(analysisPath,'utf8');

if(!analysis.includes("pie-audio-upload-ready")){
  const analyzePattern=/      const lower=file\.name\.toLowerCase\(\);let result:Analysis;[\s\S]*?      acceptAnalysis\(result\);/;
  if(!analyzePattern.test(analysis)) throw new Error('Auto-process audio patch could not find analyzeFile anchor.');
  const next=`      const lower=file.name.toLowerCase();let result:Analysis;\n      const isAudio=file.type.startsWith('audio/')||/\\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(lower);\n      if(lower.endsWith('.mid')||lower.endsWith('.midi'))result=parseMidi(new Uint8Array(await file.arrayBuffer()),file.name);\n      else if(isAudio)result=await analyzeAudio(file);\n      else result=await analyzeScore(file,setStatus);\n      acceptAnalysis(result);\n      if(isAudio){\n        try{window.dispatchEvent(new CustomEvent('pie-audio-upload-ready',{detail:{file,name:file.name}}));}catch{}\n        setStatus('Analysis ready. Pie is also creating sheet music and separating individual stems below…');\n      }`;
  analysis=analysis.replace(analyzePattern,next);
}
fs.writeFileSync(analysisPath,analysis);

const sheetsPath='app/SheetsWorkspace.tsx';
let sheets=fs.readFileSync(sheetsPath,'utf8');

if(!sheets.includes('const AUDIO_STEMS =')){
  const sheetsPattern=/const SHEETS = \[[\s\S]*?\] as const;/;
  const match=sheets.match(sheetsPattern);
  if(!match) throw new Error('Auto-process audio patch could not find SHEETS anchor.');
  sheets=sheets.replace(match[0],`${match[0]}\n\nconst AUDIO_STEMS = [\n  ['vocals','🎤','Vocals'],['drums','🥁','Drums'],['bass','🎸','Bass'],['guitar','🎸','Guitar'],['piano','🎹','Piano / Keys'],['other','🎻','Other']\n] as const;`);
}

if(!sheets.includes('async function generateFromUploadedAudio(')){
  const generateMarker='  async function generate(){';
  if(!sheets.includes(generateMarker)) throw new Error('Auto-process audio patch could not find generate function.');
  const helper=`  async function generateFromUploadedAudio(file:File){\n    setBusy(true); setStatus('Preparing uploaded audio for sheet music and stem separation…'); setJobs({}); setStatuses({}); setChords([]); setStemStarted(false);\n    try{\n      const musicBlob=await compactForTranscription(file);\n      setStatus('Starting full score, chord analysis, and six-part stem separation…');\n      const [full,chord,separation]=await Promise.all([startFile('full',musicBlob),startFile('chords',musicBlob),startFile('separate',musicBlob)]);\n      setJobs({full,chords:chord,separation});\n      setStatus('Processing uploaded audio: building sheet music and separating vocals, drums, bass, guitar, piano, and other instruments…');\n    }catch(e){\n      setStatus(e instanceof Error?e.message:'Could not process uploaded audio into sheets and stems.');\n    }finally{setBusy(false)}\n  }\n\n  useEffect(()=>{\n    const onAudio=(event:Event)=>{\n      const detail=(event as CustomEvent<{file?:File}>).detail;\n      const file=detail?.file;\n      if(file instanceof File)void generateFromUploadedAudio(file);\n    };\n    window.addEventListener('pie-audio-upload-ready',onAudio);\n    return()=>window.removeEventListener('pie-audio-upload-ready',onAudio);\n  },[]);\n\n`;
  sheets=sheets.replace(generateMarker,helper+generateMarker);
}

if(!sheets.includes('<p className="eyebrow">Individual Stems</p>')){
  const statusAnchor='{status&&<div className="statusBox">{status}</div>}';
  if(!sheets.includes(statusAnchor)) throw new Error('Auto-process audio patch could not find status UI anchor.');
  const stemUi=`${statusAnchor}\n      {jobs.separation&&statuses.separation==='COMPLETED'&&<div style={{marginTop:16}}>\n        <p className="eyebrow">Individual Stems</p>\n        <div className="sheetExportGrid">{AUDIO_STEMS.map(([key,icon,label])=><div className="sheetExportCard" key={key}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><audio controls preload="none" src={\`/api/sheets/stem/\${encodeURIComponent(jobs.separation!)}/\${key}\`}/><a href={\`/api/sheets/stem/\${encodeURIComponent(jobs.separation!)}/\${key}\`} download={\`\${key}.wav\`}>Download WAV</a></span></div>)}</div>\n      </div>}`;
  sheets=sheets.replace(statusAnchor,stemUi);
}

fs.writeFileSync(sheetsPath,sheets);
console.log('Auto Analyze audio now continues into sheet transcription and individual stem separation.');
