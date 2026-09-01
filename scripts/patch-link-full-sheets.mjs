import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const stateAnchor="  const [stemReady,setStemReady]=useState(false);";
if(source.includes(stateAnchor)&&!source.includes('linkJobs,setLinkJobs')){
  source=source.replace(stateAnchor,`${stateAnchor}\n  const [linkJobs,setLinkJobs]=useState<Record<string,string>>({});\n  const [linkStatuses,setLinkStatuses]=useState<Record<string,string>>({});\n  const [linkChords,setLinkChords]=useState<Array<[number,number,string]>>([]);\n  const [linkStemStarted,setLinkStemStarted]=useState(false);\n  const [linkSourceName,setLinkSourceName]=useState('');\n  const [linkSessionId,setLinkSessionId]=useState('');`);
}
source=source.replace("\n  const [linkAuthorized,setLinkAuthorized]=useState(false);",'');

const beginStart='  async function beginStemAnalysis(body:BodyInit,headers?:HeadersInit){';
const analyzeLinkStart='  async function analyzeLink(){';
const beginIndex=source.indexOf(beginStart);
const analyzeLinkIndex=source.indexOf(analyzeLinkStart,beginIndex);
if(beginIndex!==-1&&analyzeLinkIndex!==-1){
  const replacement=`  async function beginLinkProcessing(payload:Record<string,string>){\n    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkJobs({}); setLinkStatuses({}); setLinkChords([]); setLinkStemStarted(false); setLinkStatus('Starting full transcription, chords, and six-part stem analysis…');\n    try{\n      const r=await fetch('/api/sheets/link-process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});\n      const d=await responseJson(r,'Could not analyze this music source.');\n      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');\n      const next=(d.jobs||{}) as Record<string,string>;\n      if(!next.full||!next.chords||!next.separation)throw new Error('Pie did not receive all transcription job IDs.');\n      const id=crypto.randomUUID();\n      setLinkSessionId(id); setLinkSourceName(String(d.sourceLabel||payload.name||'Music link')); setLinkJobs(next); setStemJob(String(next.separation));\n      setLinkStatus('Processing full score, chords, and six stems…');\n    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}\n  }\n\n`;
  source=source.slice(0,beginIndex)+replacement+source.slice(analyzeLinkIndex);
}

source=source.replace(
  "    await beginStemAnalysis(JSON.stringify({url:link.trim()}),{'Content-Type':'application/json'});",
  "    await beginLinkProcessing({url:link.trim()});"
);
source=source.replace(
  "    await beginLinkProcessing({url:link.trim(),authorized:linkAuthorized});",
  "    await beginLinkProcessing({url:link.trim()});"
);

const mediaStart='  async function analyzeMedia(file:File){';
const pollStart='  useEffect(()=>{\n    if(!stemJob||stemReady)return;';
const mediaIndex=source.indexOf(mediaStart);
const pollIndex=source.indexOf(pollStart,mediaIndex);
if(mediaIndex!==-1&&pollIndex!==-1){
  const replacement=`  async function analyzeMedia(file:File){\n    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkJobs({}); setLinkStatuses({}); setLinkChords([]); setLinkStemStarted(false); setLinkStatus('Preparing media for secure upload…');\n    try{\n      if(file.size>45*1024*1024) throw new Error('Audio/video files must be 45 MB or smaller.');\n      const stagedPath=await stagePieFile(file,percent=>setLinkStatus('Uploading media… '+percent+'%'));\n      await beginLinkProcessing({stagedPath,name:file.name,type:file.type||'application/octet-stream'});\n    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.');setLinkBusy(false)}\n  }\n\n`;
  source=source.slice(0,mediaIndex)+replacement+source.slice(pollIndex);
}

const oldPollStart='  useEffect(()=>{\n    if(!stemJob||stemReady)return;';
const chooserStart='\n  const chooser=';
const oldPollIndex=source.indexOf(oldPollStart);
const chooserIndex=source.indexOf(chooserStart,oldPollIndex);
if(oldPollIndex!==-1&&chooserIndex!==-1){
  const newPoll=`  useEffect(()=>{\n    if(!Object.keys(linkJobs).length)return;\n    let dead=false;\n    const startStem=async(stem:string)=>{\n      const r=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId:linkJobs.separation})});\n      const d=await responseJson(r,'Could not start stem notation.');\n      if(!r.ok)throw new Error(d.error||'Could not start stem notation.');\n      return String(d.jobId||'');\n    };\n    const poll=async()=>{\n      try{\n        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:linkJobs})});\n        const d=await responseJson(r,'Could not check transcription status.');\n        if(!r.ok)throw new Error(d.error||'Could not check transcription status.');\n        if(dead)return;\n        const nextStatuses=(d.statuses||{}) as Record<string,string>;\n        setLinkStatuses(nextStatuses);\n        if(Array.isArray(d.chords))setLinkChords(d.chords);\n        if(nextStatuses.separation==='COMPLETED')setStemReady(true);\n\n        if(nextStatuses.separation==='COMPLETED'&&!linkStemStarted&&linkJobs.separation){\n          setLinkStemStarted(true); setLinkStatus('Stems are ready. Creating vocal, drum, bass, guitar, and keys sheet music…');\n          const mapping:[string,string][]=[['vocals','lead'],['drums','drums'],['bass','bass'],['guitar','guitar'],['piano','keys']];\n          const results=await Promise.allSettled(mapping.map(([stem])=>startStem(stem)));\n          if(dead)return;\n          const additions:Record<string,string>={};\n          results.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)additions[mapping[index][1]]=result.value;});\n          setLinkJobs(prev=>({...prev,...additions}));\n          setLinkStatus('Stems are ready. Individual instrument notation is processing…');\n          return;\n        }\n\n        const notationKeys=['full','lead','drums','bass','guitar','keys'].filter(key=>linkJobs[key]);\n        const allNotationReady=notationKeys.length>=1&&notationKeys.every(key=>nextStatuses[key]==='COMPLETED');\n        if(allNotationReady&&nextStatuses.chords==='COMPLETED'&&nextStatuses.separation==='COMPLETED')setLinkStatus('Done — stems and sheet music are ready below.');\n      }catch(e){if(!dead)setLinkStatus(e instanceof Error?e.message:'Could not check transcription status.')}\n    };\n    void poll(); const t=setInterval(()=>void poll(),4000); return()=>{dead=true;clearInterval(t)};\n  },[linkJobs,linkStemStarted]);\n\n  useEffect(()=>{\n    if(!linkSessionId||!linkSourceName||!Object.keys(linkJobs).length)return;\n    try{\n      const key='pie-sheets-stems-library-v1';\n      const now=Date.now();\n      const existing=JSON.parse(localStorage.getItem(key)||'[]');\n      const list=Array.isArray(existing)?existing:[];\n      const old=list.find((item:any)=>item?.id===linkSessionId);\n      const entry={id:linkSessionId,sourceName:linkSourceName,createdAt:old?.createdAt||now,updatedAt:now,jobs:linkJobs,statuses:linkStatuses,chords:linkChords,status:linkStatus,stemStarted:linkStemStarted};\n      const next=[entry,...list.filter((item:any)=>item?.id!==linkSessionId)].slice(0,20);\n      localStorage.setItem(key,JSON.stringify(next));\n      localStorage.setItem('pie-sheets-stems-active-v1',linkSessionId);\n      window.dispatchEvent(new Event('pie-sheets-stems-library-changed'));\n    }catch{}\n  },[linkSessionId,linkSourceName,linkJobs,linkStatuses,linkChords,linkStatus,linkStemStarted]);\n`;
  source=source.slice(0,oldPollIndex)+newPoll+source.slice(chooserIndex);
}

source=source.replace(
  '<p className="sub">Paste a direct music/media link or upload an audio/video file. Pie separates the performance into six individual stems.</p>',
  '<p className="sub">Paste a YouTube or supported direct media link, or upload audio/video. Pie streams the audio, creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>'
);
source=source.replace(
  '<p className="sub">Paste a supported direct music/media link or upload an audio/video file. Pie creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>',
  '<p className="sub">Paste a YouTube or supported direct media link, or upload audio/video. Pie streams the audio, creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>'
);
source=source.replace(
  '<p className="sub">Paste a YouTube or supported direct media link, or upload audio/video. Pie temporarily streams authorized audio, creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>',
  '<p className="sub">Paste a YouTube or supported direct media link, or upload audio/video. Pie streams the audio, creates a full transcription, detects chords, separates six stems, then creates sheet music for the individual parts.</p>'
);

source=source.replace(/\n\s*<label style=\{\{display:'flex',gap:10,alignItems:'flex-start',marginTop:10,fontSize:13,lineHeight:1\.35\}\}><input type="checkbox" checked=\{linkAuthorized\} onChange=\{e=>setLinkAuthorized\(e\.target\.checked\)\} style=\{\{marginTop:2\}\}\/><span>I own this source or have permission to process its audio\.<\/span><\/label>/,'');

const stemGrid='{stemReady&&stemJob&&<div className="sheetExportGrid">{STEMS.map(([key,icon,label])=><div className="sheetExportCard" key={key}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><audio controls preload="none" src={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`}/><a href={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`} download={`${key}.wav`}>Download WAV</a></span></div>)}</div>}';
if(source.includes(stemGrid)&&!source.includes('LINK NOTATION DOWNLOADS')){
  const notation=`${stemGrid}\n      {Object.keys(linkJobs).length>0&&<div className="sheetSourceCard" style={{marginTop:16}}>\n        <p className="eyebrow">LINK NOTATION DOWNLOADS</p>\n        <h3>Sheet music</h3>\n        <div style={{display:'grid',gap:10}}>\n          {([['full','Full Score'],['lead','Lead Vocal'],['drums','Drums'],['bass','Bass'],['guitar','Guitar'],['keys','Keys / Piano']] as const).map(([key,label])=>{\n            const jobId=linkJobs[key]; const ready=Boolean(jobId&&linkStatuses[key]==='COMPLETED');\n            return <div className="statusBox" key={key}><strong>{label}</strong><span style={{marginLeft:8}}>{jobId?(linkStatuses[key]||'QUEUED'):'Waiting for stems'}</span>{ready&&jobId&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/pdf\`}>PDF</a><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/xml\`}>MusicXML</a><a href={\`/api/sheets/download/\${encodeURIComponent(jobId)}/midi_quant\`}>MIDI</a></div>}</div>;\n          })}\n        </div>\n        {linkChords.length>0&&<div style={{marginTop:14}}><h3>Detected chords</h3>{linkChords.map((c,i)=><p key={i}>{Number(c[0]).toFixed(1)}s — {c[2]}</p>)}</div>}\n      </div>}`;
  source=source.replace(stemGrid,notation);
}

fs.writeFileSync(path,source);
console.log('Analyze Music Link now creates stems, full score, chords, and instrument notation without a confirmation checkbox.');
