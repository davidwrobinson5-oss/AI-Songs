'use client';

import { useEffect, useMemo, useState } from 'react';

const CAPTURE_STARTED_KEY='pieCaptureStartedAt';
const CAPTURE_ID_KEY='pieCaptureSessionId';
const CAPTURE_JOBS_KEY='pieCaptureJobs';
const CAPTURE_OUTPUTS_KEY='pieCaptureOutputs';
const CAPTURE_TITLE_KEY='pieCaptureTitle';
const CAPTURE_STAGED_KEY='pieCaptureStagedPath';

type JobMap=Record<string,string>;
type StatusMap=Record<string,string>;
type OutputMap={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};
type ParsedCapture={jobs:JobMap;outputs:OutputMap;title:string;awaitingSelection:boolean;stagedPath:string};

function parseResult(raw:unknown):ParsedCapture|null{
  if(typeof raw!=='string'||!raw.trim())return null;
  try{
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object')return null;
    const jobs=parsed.jobs&&typeof parsed.jobs==='object'?parsed.jobs as JobMap:{};
    const outputs=parsed.outputs&&typeof parsed.outputs==='object'?parsed.outputs as OutputMap:{};
    return {
      jobs,
      outputs,
      title:String(parsed.title||'Android playback recording'),
      awaitingSelection:Boolean(parsed.awaitingSelection),
      stagedPath:String(parsed.stagedPath||''),
    };
  }catch{return null;}
}

function allDone(statuses:StatusMap,jobs:JobMap){
  const ids=Object.keys(jobs);
  return ids.length>0&&ids.every(key=>statuses[key]==='COMPLETED');
}

function hasFailed(statuses:StatusMap){
  return Object.values(statuses).some(value=>['FAILED','ERROR','CANCELLED'].includes(String(value).toUpperCase()));
}

export default function PlaybackRecorderCard(){
  const [sourceUrl,setSourceUrl]=useState('');
  const [status,setStatus]=useState('');
  const [confirming,setConfirming]=useState(false);
  const [permissionConfirmed,setPermissionConfirmed]=useState(false);
  const [recording,setRecording]=useState(false);
  const [jobs,setJobs]=useState<JobMap>({});
  const [outputs,setOutputs]=useState<OutputMap>({});
  const [jobStatuses,setJobStatuses]=useState<StatusMap>({});
  const [captureTitle,setCaptureTitle]=useState('');
  const [stemJobsStarted,setStemJobsStarted]=useState(false);
  const [pendingStagedPath,setPendingStagedPath]=useState('');
  const [choosingOutputs,setChoosingOutputs]=useState(false);
  const [processingSelection,setProcessingSelection]=useState(false);
  const [selectedOutputs,setSelectedOutputs]=useState<OutputMap>({stems:false,fullSheet:false,partSheets:false,chords:false});

  useEffect(()=>{
    try{
      const savedJobs=JSON.parse(sessionStorage.getItem(CAPTURE_JOBS_KEY)||'{}');
      const savedOutputs=JSON.parse(sessionStorage.getItem(CAPTURE_OUTPUTS_KEY)||'{}');
      if(savedJobs&&typeof savedJobs==='object')setJobs(savedJobs);
      if(savedOutputs&&typeof savedOutputs==='object')setOutputs(savedOutputs);
      setCaptureTitle(sessionStorage.getItem(CAPTURE_TITLE_KEY)||'');
      const staged=sessionStorage.getItem(CAPTURE_STAGED_KEY)||'';
      if(staged){
        setPendingStagedPath(staged);
        setChoosingOutputs(true);
      }
    }catch{}
  },[]);

  useEffect(()=>{
    let stopped=false;
    let timer:number|undefined;

    const finishCapture=(message:string,clearJobs=false)=>{
      setStatus(message);
      setRecording(false);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
      if(clearJobs){
        sessionStorage.removeItem(CAPTURE_JOBS_KEY);
        sessionStorage.removeItem(CAPTURE_OUTPUTS_KEY);
        sessionStorage.removeItem(CAPTURE_TITLE_KEY);
      }
    };

    const saveProcessing=(nextJobs:JobMap,nextOutputs:OutputMap,title:string)=>{
      setJobs(nextJobs);
      setOutputs(nextOutputs);
      setCaptureTitle(title);
      sessionStorage.setItem(CAPTURE_JOBS_KEY,JSON.stringify(nextJobs));
      sessionStorage.setItem(CAPTURE_OUTPUTS_KEY,JSON.stringify(nextOutputs));
      sessionStorage.setItem(CAPTURE_TITLE_KEY,title);
      sessionStorage.removeItem(CAPTURE_STAGED_KEY);
      setPendingStagedPath('');
      setChoosingOutputs(false);
      setRecording(false);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
      setStatus('Processing started for the items you selected.');
    };

    const offerSelection=(stagedPath:string,title:string)=>{
      setRecording(false);
      setCaptureTitle(title);
      setPendingStagedPath(stagedPath);
      setSelectedOutputs({stems:false,fullSheet:false,partSheets:false,chords:false});
      setChoosingOutputs(true);
      sessionStorage.setItem(CAPTURE_STAGED_KEY,stagedPath);
      sessionStorage.setItem(CAPTURE_TITLE_KEY,title);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
      setStatus('Recording saved. Choose what you want Pie to create.');
    };

    const checkCapture=async()=>{
      const id=sessionStorage.getItem(CAPTURE_ID_KEY)||'';
      if(!id||stopped)return;
      try{
        const res=await fetch('/api/capture-session',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'status',id}),
          credentials:'same-origin',
          cache:'no-store',
        });
        const data=await res.json().catch(()=>({}));
        if(!res.ok){
          if(res.status===404) finishCapture('Recording session could not be found. Please try again.');
          return;
        }
        const captureStatus=String(data?.status||'');
        if(captureStatus==='accepted'){
          const parsed=parseResult(data?.result);
          if(parsed?.awaitingSelection&&parsed.stagedPath){
            offerSelection(parsed.stagedPath,parsed.title);
          }else if(parsed&&Object.keys(parsed.jobs).length){
            saveProcessing(parsed.jobs,parsed.outputs,parsed.title);
          }else{
            finishCapture('Recording received by Pie.');
          }
        }else if(captureStatus==='processingFailed') finishCapture('Recording finished, but processing needs attention.');
        else if(captureStatus==='uploadFailed') finishCapture('Recording finished, but upload to Pie failed.');
        else if(captureStatus==='uploading'){
          setRecording(true);
          setStatus('Recording finished. Uploading to Pie…');
        }else{
          setRecording(true);
          setStatus('Capture started. Waiting for Android to finish recording.');
        }
      }catch{
        // Keep the session alive and retry; a temporary network change should not lose the capture.
      }
    };

    const reconcileReturn=()=>{
      const current=new URL(window.location.href);
      const result=current.searchParams.get('pieCapture');
      if(result){
        if(result==='accepted') setStatus('Recording received. Loading your choices…');
        else if(result==='processing') setStatus('Recording finished. Returning to Pie…');
        else if(result==='processingFailed') finishCapture('Recording finished, but processing needs attention.');
        else setStatus('Recording session finished.');
        current.searchParams.delete('pieCapture');
        window.history.replaceState({},'',current.toString());
      }

      const startedAt=Number(sessionStorage.getItem(CAPTURE_STARTED_KEY)||0);
      if(startedAt>0){
        setRecording(true);
        void checkCapture();
      }
    };

    reconcileReturn();
    timer=window.setInterval(()=>{void checkCapture();},1500);
    window.addEventListener('pageshow',reconcileReturn);
    window.addEventListener('focus',reconcileReturn);
    document.addEventListener('visibilitychange',reconcileReturn);
    return()=>{
      stopped=true;
      if(timer!==undefined)window.clearInterval(timer);
      window.removeEventListener('pageshow',reconcileReturn);
      window.removeEventListener('focus',reconcileReturn);
      document.removeEventListener('visibilitychange',reconcileReturn);
    };
  },[]);

  useEffect(()=>{
    if(!Object.keys(jobs).length)return;
    let dead=false;
    let timer:number|undefined;

    const startPartSheets=async(separationJobId:string)=>{
      if(stemJobsStarted||!outputs.partSheets)return;
      setStemJobsStarted(true);
      setStatus('Stems are ready. Pie is creating the instrument sheets.');
      try{
        const stemNames=['vocals','drums','bass','guitar','piano'];
        const ids=await Promise.all(stemNames.map(async stem=>{
          const r=await fetch('/api/sheets/transcribe',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({mode:'stem',stem,separationJobId}),
          });
          const d=await r.json();
          if(!r.ok)throw new Error(d.error||'Could not create instrument sheet.');
          return String(d.jobId);
        }));
        if(dead)return;
        const next={...jobs,lead:ids[0],drums:ids[1],bass:ids[2],guitar:ids[3],keys:ids[4]};
        setJobs(next);
        sessionStorage.setItem(CAPTURE_JOBS_KEY,JSON.stringify(next));
      }catch(error){
        if(!dead)setStatus(error instanceof Error?error.message:'Could not create instrument sheets.');
      }
    };

    const poll=async()=>{
      try{
        const r=await fetch('/api/sheets/status',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({jobs}),
          cache:'no-store',
        });
        const d=await r.json();
        if(!r.ok)throw new Error(d.error||'Could not check processing status.');
        if(dead)return;
        const statuses=d.statuses||{};
        setJobStatuses(statuses);
        if(hasFailed(statuses)){
          setStatus('Pie hit a processing problem. Your recording is safe, but one of the selected analysis jobs needs attention.');
          return;
        }
        if(statuses.separation==='COMPLETED'&&outputs.partSheets&&!jobs.lead)void startPartSheets(jobs.separation);
        else if(allDone(statuses,jobs)) setStatus('Ready — the items you selected are complete.');
        else if(statuses.separation==='COMPLETED') setStatus('Stems are ready. Pie is finishing your other selected items.');
        else setStatus('Working on your selected items…');
      }catch(error){
        if(!dead)setStatus(error instanceof Error?error.message:'Could not check processing status.');
      }
    };

    void poll();
    timer=window.setInterval(()=>{void poll();},3500);
    return()=>{dead=true;if(timer!==undefined)window.clearInterval(timer)};
  },[jobs,outputs,stemJobsStarted]);

  const processingSteps=useMemo(()=>{
    if(!Object.keys(jobs).length)return [];
    const steps=[
      ['Upload','COMPLETED'],
      ['Analyze',Object.values(jobStatuses).some(Boolean)?'COMPLETED':'PROCESSING'],
      ['Stems',outputs.stems&&jobs.separation?jobStatuses.separation||'PROCESSING':'SKIPPED'],
      ['Full sheet',outputs.fullSheet&&jobs.full?jobStatuses.full||'PROCESSING':'SKIPPED'],
      ['Instrument sheets',outputs.partSheets&&jobs.separation?(jobs.lead&&jobs.drums&&jobs.bass&&jobs.guitar&&jobs.keys?'COMPLETED':jobStatuses.separation||'PROCESSING'):'SKIPPED'],
      ['Chords',outputs.chords&&jobs.chords?jobStatuses.chords||'PROCESSING':'SKIPPED'],
    ];
    return steps;
  },[jobs,jobStatuses,outputs]);

  function openSource(){
    const value=sourceUrl.trim();
    if(!value){setStatus('Paste the song or source URL first.');return;}
    try{
      const parsed=new URL(value);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('invalid');
      window.open(parsed.toString(),'_blank','noopener,noreferrer');
      setStatus('Source opened. Return to Pie and tap Record when ready.');
    }catch{
      setStatus('Enter a valid web URL.');
    }
  }

  async function startRecorder(){
    const value=sourceUrl.trim();
    if(!permissionConfirmed){setStatus('Confirm that you have permission to record this content.');return;}
    if(!value){setStatus('Paste the song or source URL first.');setConfirming(false);return;}
    try{
      const parsed=new URL(value);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('invalid');
    }catch{
      setStatus('Enter a valid web URL.');setConfirming(false);return;
    }

    setConfirming(false);
    setPermissionConfirmed(false);
    setRecording(true);
    setJobs({});setOutputs({});setJobStatuses({});setCaptureTitle('');setStemJobsStarted(false);
    setPendingStagedPath('');setChoosingOutputs(false);
    sessionStorage.removeItem(CAPTURE_JOBS_KEY);
    sessionStorage.removeItem(CAPTURE_OUTPUTS_KEY);
    sessionStorage.removeItem(CAPTURE_TITLE_KEY);
    sessionStorage.removeItem(CAPTURE_STAGED_KEY);
    setStatus('Preparing secure Pie capture…');

    try{
      const res=await fetch('/api/capture-session',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'create'}),
        credentials:'same-origin',
        cache:'no-store',
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data?.id||!data?.secret)throw new Error(data?.error||'Could not create capture session.');

      const params=new URLSearchParams();
      params.set('url',value);
      params.set('return',window.location.href);
      params.set('captureId',String(data.id));
      params.set('captureSecret',String(data.secret));

      sessionStorage.setItem(CAPTURE_STARTED_KEY,String(Date.now()));
      sessionStorage.setItem(CAPTURE_ID_KEY,String(data.id));
      setStatus('Android will place its required app-sharing permission over Pie. Choose only the music app you want to capture.');
      window.location.href=`pie-recorder://capture/start?${params.toString()}`;
    }catch(error){
      setRecording(false);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
      setStatus(error instanceof Error?error.message:'Could not start Pie capture.');
    }
  }

  async function startSelectedProcessing(){
    if(!pendingStagedPath)return;
    if(!Object.values(selectedOutputs).some(Boolean)){
      setStatus('Select at least one item to create.');
      return;
    }

    setProcessingSelection(true);
    setStatus('Starting only the items you selected…');
    try{
      const response=await fetch('/api/sheets/process-upload',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          stagedPath:pendingStagedPath,
          name:captureTitle||'Android playback recording',
          type:'audio/wav',
          outputs:selectedOutputs,
        }),
        credentials:'same-origin',
        cache:'no-store',
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data?.error||'Could not start the selected processing.');
      const nextJobs=data.jobs&&typeof data.jobs==='object'?data.jobs as JobMap:{};
      if(!Object.keys(nextJobs).length)throw new Error('Pie did not return any processing jobs.');
      const nextOutputs=data.outputs&&typeof data.outputs==='object'?data.outputs as OutputMap:{...selectedOutputs};
      setJobs(nextJobs);
      setOutputs(nextOutputs);
      setJobStatuses({});
      setStemJobsStarted(false);
      sessionStorage.setItem(CAPTURE_JOBS_KEY,JSON.stringify(nextJobs));
      sessionStorage.setItem(CAPTURE_OUTPUTS_KEY,JSON.stringify(nextOutputs));
      sessionStorage.setItem(CAPTURE_TITLE_KEY,String(data.title||captureTitle||'Android playback recording'));
      sessionStorage.removeItem(CAPTURE_STAGED_KEY);
      setPendingStagedPath('');
      setChoosingOutputs(false);
      setStatus('Processing started for the items you selected.');
    }catch(error){
      setStatus(error instanceof Error?error.message:'Could not start the selected processing.');
    }finally{
      setProcessingSelection(false);
    }
  }

  function toggleOutput(key:keyof OutputMap){
    setSelectedOutputs(current=>({...current,[key]:!current[key]}));
  }

  const chooserOptions:[keyof OutputMap,string,string][]=[
    ['fullSheet','Full sheet','Full-song notation / transcription'],
    ['partSheets','Instrument sheets','Lead, drums, bass, guitar, and keys'],
    ['chords','Chords','Chord recognition and chord chart data'],
    ['stems','Stems','Separated vocals and instruments'],
  ];

  return <section className="panel" style={{padding:20,marginBottom:16,position:'relative',overflow:'hidden'}}>
    <div style={{position:'absolute',inset:'0 0 auto 0',height:4,background:'linear-gradient(90deg,#7c3aed,#c084fc,#f59e0b)'}} />
    <p className="eyebrow">PLAYBACK RECORDER</p>
    <h2 style={{marginTop:4}}>Record into Pie</h2>
    <p className="sub">Capture one music app on your Android phone without leaving a separate recorder screen open.</p>
    <input
      value={sourceUrl}
      onChange={event=>setSourceUrl(event.target.value)}
      placeholder="Paste YouTube, Suno, Spotify, or other URL"
      inputMode="url"
      style={{width:'100%',padding:12,borderRadius:12,marginTop:10}}
    />
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
      <button className="secondary" type="button" onClick={openSource}>Open URL / Choose App</button>
      {!recording?<button className="primary" type="button" onClick={()=>{setPermissionConfirmed(false);setConfirming(true);}}>● Record</button>:<button className="primary" type="button" disabled aria-disabled="true">● Recording — awaiting Android finish</button>}
    </div>
    {status&&<div className="statusBox" style={{marginTop:12}}>{status}</div>}

    {processingSteps.length>0&&<div style={{marginTop:14,padding:14,borderRadius:16,background:'rgba(124,58,237,.08)',border:'1px solid rgba(192,132,252,.25)'}}>
      <strong style={{display:'block',marginBottom:10}}>{captureTitle||'Mobile recording'}</strong>
      <div style={{display:'grid',gap:8}}>{processingSteps.map(([label,value])=>{
        const ready=value==='COMPLETED';
        const skipped=value==='SKIPPED';
        return <div key={label} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <span>{label}</span><span style={{opacity:skipped?.55:1}}>{skipped?'—':ready?'✓ Ready':'… Working'}</span>
        </div>;
      })}</div>
    </div>}

    {confirming&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:10000,display:'grid',placeItems:'center',padding:20,background:'rgba(8,5,15,.72)',backdropFilter:'blur(8px)'}}>
      <div style={{width:'min(430px,100%)',borderRadius:24,padding:22,background:'linear-gradient(145deg,#24143d,#120d22)',border:'1px solid rgba(192,132,252,.45)',boxShadow:'0 24px 70px rgba(0,0,0,.5)'}}>
        <div style={{fontSize:36,marginBottom:8}}>🥧</div>
        <p className="eyebrow" style={{color:'#d8b4fe'}}>PIE CAPTURE</p>
        <h2 style={{margin:'4px 0 8px'}}>Ready to record?</h2>
        <p style={{margin:0,opacity:.85,lineHeight:1.5}}>Next, Android will place its secure permission sheet over Pie. Keep <strong>Share one app</strong> selected and choose only the app playing your song.</p>
        <button
          type="button"
          aria-pressed={permissionConfirmed}
          onClick={()=>setPermissionConfirmed(value=>!value)}
          style={{width:'100%',marginTop:18,padding:'14px 16px',borderRadius:14,textAlign:'left',fontWeight:700,border:permissionConfirmed?'1px solid rgba(134,239,172,.7)':'1px solid rgba(192,132,252,.45)',background:permissionConfirmed?'rgba(34,197,94,.16)':'rgba(255,255,255,.04)',color:'inherit'}}
        >
          {permissionConfirmed?'✓':'○'} I have permission to record this content
        </button>
        <div style={{display:'flex',gap:10,marginTop:18}}>
          <button className="secondary" type="button" onClick={()=>{setPermissionConfirmed(false);setConfirming(false);}} style={{flex:1}}>Cancel</button>
          <button className="primary" type="button" disabled={!permissionConfirmed} aria-disabled={!permissionConfirmed} onClick={()=>{void startRecorder();}} style={{flex:1,opacity:permissionConfirmed?1:.5}}>Continue</button>
        </div>
      </div>
    </div>}

    {choosingOutputs&&<div role="dialog" aria-modal="true" style={{position:'fixed',inset:0,zIndex:10001,display:'grid',placeItems:'center',padding:20,background:'rgba(8,5,15,.78)',backdropFilter:'blur(8px)'}}>
      <div style={{width:'min(460px,100%)',maxHeight:'calc(100dvh - 40px)',overflowY:'auto',borderRadius:24,padding:22,background:'linear-gradient(145deg,#24143d,#120d22)',border:'1px solid rgba(192,132,252,.45)',boxShadow:'0 24px 70px rgba(0,0,0,.5)'}}>
        <div style={{fontSize:34,marginBottom:8}}>🥧</div>
        <p className="eyebrow" style={{color:'#d8b4fe'}}>RECORDING SAVED</p>
        <h2 style={{margin:'4px 0 8px'}}>What do you want Pie to create?</h2>
        <p style={{margin:'0 0 14px',opacity:.82,lineHeight:1.5}}>Nothing starts until you choose. Select only what you want from this recording.</p>
        <div style={{display:'grid',gap:10}}>{chooserOptions.map(([key,label,copy])=>{
          const selected=Boolean(selectedOutputs[key]);
          return <button key={key} type="button" aria-pressed={selected} onClick={()=>toggleOutput(key)} style={{width:'100%',padding:'13px 14px',borderRadius:14,textAlign:'left',border:selected?'1px solid rgba(134,239,172,.7)':'1px solid rgba(192,132,252,.35)',background:selected?'rgba(34,197,94,.14)':'rgba(255,255,255,.035)',color:'inherit'}}>
            <div style={{fontWeight:800}}>{selected?'✓':'○'} {label}</div>
            <div style={{fontSize:13,opacity:.72,marginTop:3}}>{copy}</div>
          </button>;
        })}</div>
        <button className="primary" type="button" disabled={processingSelection||!Object.values(selectedOutputs).some(Boolean)} onClick={()=>{void startSelectedProcessing();}} style={{width:'100%',marginTop:16,opacity:processingSelection||!Object.values(selectedOutputs).some(Boolean)?.55:1}}>
          {processingSelection?'Starting…':'Create selected items'}
        </button>
      </div>
    </div>}
  </section>;
}
