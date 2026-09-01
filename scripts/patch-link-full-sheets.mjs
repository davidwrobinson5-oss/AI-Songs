import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const stateAnchor="  const [stemReady,setStemReady]=useState(false);";
if(source.includes(stateAnchor)&&!source.includes('linkJobs,setLinkJobs')){
  source=source.replace(stateAnchor,`${stateAnchor}\n  const [linkJobs,setLinkJobs]=useState<Record<string,string>>({});\n  const [linkStatuses,setLinkStatuses]=useState<Record<string,string>>({});\n  const [linkChords,setLinkChords]=useState<Array<[number,number,string]>>([]);\n  const [linkStemStarted,setLinkStemStarted]=useState(false);\n  const [linkSourceName,setLinkSourceName]=useState('');\n  const [linkSessionId,setLinkSessionId]=useState('');\n  const [linkOutputs,setLinkOutputs]=useState({stems:true,fullSheet:true,partSheets:false,chords:true});`);
}else if(source.includes(stateAnchor)&&!source.includes('linkOutputs,setLinkOutputs')){
  source=source.replace(stateAnchor,`${stateAnchor}\n  const [linkOutputs,setLinkOutputs]=useState({stems:true,fullSheet:true,partSheets:false,chords:true});`);
}
source=source.replace("\n  const [linkAuthorized,setLinkAuthorized]=useState(false);",'');

const beginStart='  async function beginStemAnalysis(body:BodyInit,headers?:HeadersInit){';
const analyzeLinkStart='  async function analyzeLink(){';
const beginIndex=source.indexOf(beginStart);
const analyzeLinkIndex=source.indexOf(analyzeLinkStart,beginIndex);
if(beginIndex!==-1&&analyzeLinkIndex!==-1){
  const replacement=`  async function beginLinkProcessing(payload:Record<string,unknown>){\n    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkJobs({}); setLinkStatuses({}); setLinkChords([]); setLinkStemStarted(false); setLinkStatus('Starting selected analysis…');\n    try{\n      const r=await fetch('/api/sheets/link-process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});\n      const d=await responseJson(r,'Could not analyze this music source.');\n      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');\n      const next=(d.jobs||{}) as Record<string,string>;\n      const id=crypto.randomUUID();\n      setLinkSessionId(id); setLinkSourceName(String(d.sourceLabel||payload.name||'Music link')); setLinkJobs(next); setStemJob(String(next.separation||''));\n      setLinkStatus('Processing your selected outputs…');\n    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}\n  }\n\n`;
  source=source.slice(0,beginIndex)+replacement+source.slice(analyzeLinkIndex);
}

source=source.replace(
  "    await beginStemAnalysis(JSON.stringify({url:link.trim()}),{'Content-Type':'application/json'});",
  "    if(!linkOutputs.stems&&!linkOutputs.fullSheet&&!linkOutputs.partSheets&&!linkOutputs.chords){setLinkStatus('Choose at least one output first.');return}\n    await beginLinkProcessing({url:link.trim(),outputs:linkOutputs});"
);
source=source.replace(
  "    await beginLinkProcessing({url:link.trim()});",
  "    if(!linkOutputs.stems&&!linkOutputs.fullSheet&&!linkOutputs.partSheets&&!linkOutputs.chords){setLinkStatus('Choose at least one output first.');return}\n    await beginLinkProcessing({url:link.trim(),outputs:linkOutputs});"
);

const mediaStart='  async function analyzeMedia(file:File){';
const pollStart='  useEffect(()=>{\n    if(!stemJob||stemReady)return;';
const mediaIndex=source.indexOf(mediaStart);
const pollIndex=source.indexOf(pollStart,mediaIndex);
if(mediaIndex!==-1&&pollIndex!==-1){
  const replacement=`  async function analyzeMedia(file:File){\n    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkJobs({}); setLinkStatuses({}); setLinkChords([]); setLinkStemStarted(false); setLinkStatus('Preparing media for secure upload…');\n    try{\n      if(!linkOutputs.stems&&!linkOutputs.fullSheet&&!linkOutputs.partSheets&&!linkOutputs.chords)throw new Error('Choose at least one output first.');\n      if(file.size>45*1024*1024) throw new Error('Audio/video files must be 45 MB or smaller.');\n      const stagedPath=await stagePieFile(file,percent=>setLinkStatus('Uploading media… '+percent+'%'));\n      await beginLinkProcessing({stagedPath,name:file.name,type:file.type||'application/octet-stream',outputs:linkOutputs});\n    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.');setLinkBusy(false)}\n  }\n\n`;
  source=source.slice(0,mediaIndex)+replacement+source.slice(pollIndex);
}

const oldPollStart='  useEffect(()=>{\n    if(!stemJob||stemReady)return;';
const chooserStart='\n  const chooser=';
const oldPollIndex=source.indexOf(oldPollStart);
const chooserIndex=source.indexOf(chooserStart,oldPollIndex);
if(oldPollIndex!==-1&&chooserIndex!==-1){
  const newPoll=`  useEffect(()=>{\n    if(!Object.keys(linkJobs).length)return;\n    let dead=false;\n    const startStem=async(stem:string)=>{\n      const r=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId:linkJobs.separation})});\n      const d=await responseJson(r,'Could not start stem notation.');\n      if(!r.ok)throw new Error(d.error||'Could not start stem notation.');\n      return String(d.jobId||'');\n    };\n    const poll=async()=>{\n      try{\n        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:linkJobs})});\n        const d=await responseJson(r,'Could not check transcription status.');\n        if(!r.ok)throw new Error(d.error||'Could not check transcription status.');\n        if(dead)return;\n        const nextStatuses=(d.statuses||{}) as Record<string,string>;\n        setLinkStatuses(nextStatuses);\n        if(Array.isArray(d.chords))setLinkChords(d.chords);\n        if(nextStatuses.separation==='COMPLETED')setStemReady(true);\n\n        if(linkOutputs.partSheets&&nextStatuses.separation==='COMPLETED'&&!linkStemStarted&&linkJobs.separation){\n          setLinkStemStarted(true); setLinkStatus('Creating selected individual part sheet music…');\n          const mapping:[string,string][]=[['vocals','lead'],['drums','drums'],['bass','bass'],['guitar','guitar'],['piano','keys']];\n          const results=await Promise.allSettled(mapping.map(([stem])=>startStem(stem)));\n          if(dead)return;\n          const additions:Record<string,string>={};\n          results.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)additions[mapping[index][1]]=result.value;});\n          setLinkJobs(prev=>({...prev,...additions}));\n          setLinkStatus('Individual part notation is processing…');\n          return;\n        }\n\n        const relevant=Object.keys(linkJobs).filter(key=>key!=='separation'||linkOutputs.stems||linkOutputs.partSheets);\n        const allReady=relevant.length>0&&relevant.every(key=>nextStatuses[key]==='COMPLETED');\n        if(allReady&&!linkOutputs.partSheets)setLinkStatus('Done — your selected analysis is ready below.');\n      }catch(e){if(!dead)setLinkStatus(e instanceof Error?e.message:'Could not check transcription status.')}\n    };\n    void poll(); const t=setInterval(()=>void poll(),4000); return()=>{dead=true;clearInterval(t)};\n  },[linkJobs,linkStemStarted,linkOutputs.partSheets,linkOutputs.stems]);\n\n  useEffect(()=>{\n    if(!linkSessionId||!linkSourceName||!Object.keys(linkJobs).length)return;\n    try{\n      const key='pie-sheets-stems-library-v1';\n      const now=Date.now();\n      const existing=JSON.parse(localStorage.getItem(key)||'[]');\n      const list=Array.isArray(existing)?existing:[];\n      const old=list.find((item:any)=>item?.id===linkSessionId);\n      const entry={id:linkSessionId,sourceName:linkSourceName,createdAt:old?.createdAt||now,updatedAt:now,jobs:linkJobs,statuses:linkStatuses,chords:linkChords,status:linkStatus,stemStarted:linkStemStarted,outputs:linkOutputs};\n      const next=[entry,...list.filter((item:any)=>item?.id!==linkSessionId)].slice(0,20);\n      localStorage.setItem(key,JSON.stringify(next));\n      localStorage.setItem('pie-sheets-stems-active-v1',linkSessionId);\n      window.dispatchEvent(new Event('pie-sheets-stems-library-changed'));\n    }catch{}\n  },[linkSessionId,linkSourceName,linkJobs,linkStatuses,linkChords,linkStatus,linkStemStarted,linkOutputs]);\n`;
  source=source.slice(0,oldPollIndex)+newPoll+source.slice(chooserIndex);
}

for(const old of [
  '<p className="sub">Paste a direct music/media link or upload an audio/video file. Pie separates the performance into six individual stems.</p>',
  '<p className="sub">Paste a supported direct music/media link or upload an audio/video file. Pie creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>',
  '<p className="sub">Paste a YouTube or supported direct media link, or upload audio/video. Pie streams the audio, creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>'
]){
  if(source.includes(old))source=source.replace(old,'<p className="sub">Paste a YouTube or supported media link, choose exactly what you want Pie to create, then analyze it.</p>');
}

const row='<div className="referenceUrlRow"><input value={link} onChange={e=>setLink(e.target.value)} placeholder="Paste music or YouTube link…" inputMode="url"/><button type="button" className="primary" disabled={linkBusy} onClick={()=>void analyzeLink()}>{linkBusy?\'Analyzing…\':\'Analyze Link\'}</button></div>';
if(source.includes(row)&&!source.includes('What do you want to create?')){
  const chooser=`<div style={{marginTop:14}}><p className="eyebrow">What do you want to create?</p><div className="sheetExportGrid">{([['stems','🎚️','Stems','Separate vocals, drums, bass, guitar, keys, and other'],['fullSheet','🎼','Full Sheet Music','Complete song transcription'],['partSheets','🎵','Individual Part Sheets','Vocal, drums, bass, guitar, and keys notation'],['chords','🎹','Chords','Chord progression with timing']] as const).map(([key,icon,label,description])=><button type="button" key={key} className={(linkOutputs as any)[key]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setLinkOutputs(prev=>({...prev,[key]:!(prev as any)[key]}))}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><small>{description}</small></span><b>{(linkOutputs as any)[key]?'✓':'+'}</b></button>)}</div></div>`;
  source=source.replace(row,`${row}\n      ${chooser}`);
}

source=source.replace(/\n\s*<label style=\{\{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontSize:13,lineHeight:1\.35\}\}><input type="checkbox" checked=\{linkAuthorized\} onChange=\{e=>setLinkAuthorized\(e\.target\.checked\)\} style=\{\{marginTop:2\}\}\/><span>I own this source or have permission to process its audio\.<\/span><\/label>/,'');

const stemGrid='{stemReady&&stemJob&&<div className="sheetExportGrid">{STEMS.map(([key,icon,label])=><div className="sheetExportCard" key={key}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><audio controls preload="none" src={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`}/><a href={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`} download={`${key}.wav`}>Download WAV</a></span></div>)}</div>}';
if(source.includes(stemGrid)){
  source=source.replace(stemGrid,"{linkOutputs.stems&&stemReady&&stemJob&&<div className=\"sheetExportGrid\">{STEMS.map(([key,icon,label])=><div className=\"sheetExportCard\" key={key}><span className=\"sheetExportIcon\">{icon}</span><span><strong>{label}</strong><audio controls preload=\"none\" src={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`}/><a href={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`} download={`${key}.wav`}>Download WAV</a></span></div>)}</div>}");
}

if(!source.includes('LINK NOTATION DOWNLOADS')){
  const marker="    </div>\n  </div>;\n}";
  const notation=`      {Object.keys(linkJobs).length>0&&<div className="sheetSourceCard" style={{marginTop:16}}>\n        <p className="eyebrow">ANALYSIS RESULTS</p>\n        {(linkOutputs.fullSheet||linkOutputs.partSheets)&&<><h3>Sheet music</h3><div style={{display:'grid',gap:10}}>\n          {([['full','Full Score'],['lead','Lead Vocal'],['drums','Drums'],['bass','Bass'],['guitar','Guitar'],['keys','Keys / Piano']] as const).filter(([key])=>key==='full'?linkOutputs.fullSheet:linkOutputs.partSheets).map(([key,label])=>{\n            const jobId=linkJobs[key]; const ready=Boolean(jobId&&linkStatuses[key]==='COMPLETED');\n            return <div className="statusBox" key={key}><strong>{label}</strong><span style={{marginLeft:8}}>{jobId?(linkStatuses[key]||'QUEUED'):'Waiting'}</span>{ready&&jobId&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/pdf\`}>PDF</a><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/xml\`}>MusicXML</a><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/midi_quant\`}>MIDI</a></div>}</div>;\n          })}\n        </div></>}\n        {linkOutputs.chords&&<div style={{marginTop:14}}><h3>Detected chords</h3>{linkChords.length?linkChords.map((c,i)=><p key={i}>{Number(c[0]).toFixed(1)}s — {c[2]}</p>):<p className="sub">Chord analysis is processing…</p>}</div>}\n      </div>}\n`;
  if(source.includes(marker))source=source.replace(marker,`${notation}    </div>\n  </div>;\n}`);
}

fs.writeFileSync(path,source);
console.log('Analyze Music Link now asks which outputs to create and only runs the selected jobs.');
