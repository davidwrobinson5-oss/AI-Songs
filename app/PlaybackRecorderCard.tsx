'use client';

import { useEffect, useMemo, useState } from 'react';

const CAPTURE_STARTED_KEY='pieCaptureStartedAt';
const CAPTURE_ID_KEY='pieCaptureSessionId';
const CAPTURE_JOBS_KEY='pieCaptureJobs';
const CAPTURE_OUTPUTS_KEY='pieCaptureOutputs';
const CAPTURE_TITLE_KEY='pieCaptureTitle';

type JobMap=Record<string,string>;
type StatusMap=Record<string,string>;
type OutputMap={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};

function parseResult(raw:unknown){
  if(typeof raw!=='string'||!raw.trim())return null;
  try{
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object')return null;
    const jobs=parsed.jobs&&typeof parsed.jobs==='object'?parsed.jobs as JobMap:{};
    const outputs=parsed.outputs&&typeof parsed.outputs==='object'?parsed.outputs as OutputMap:{};
    return {jobs,outputs,title:String(parsed.title||'Android playback recording')};
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
  const [recording,setRecording]=useState(false);
  const [jobs,setJobs]=useState<JobMap>({});
  const [outputs,setOutputs]=useState<OutputMap>({});
  const [jobStatuses,setJobStatuses]=useState<StatusMap>({});
  const [captureTitle,setCaptureTitle]=useState('');
  const [stemJobsStarted,setStemJobsStarted]=useState(false);

  useEffect(()=>{
    try{
      const savedJobs=JSON.parse(sessionStorage.getItem(CAPTURE_JOBS_KEY)||'{}');
      const savedOutputs=JSON.parse(sessionStorage.getItem(CAPTURE_OUTPUTS_KEY)||'{}');
      if(savedJobs&&typeof savedJobs==='object')setJobs(savedJobs);
      if(savedOutputs&&typeof savedOutputs==='object')setOutputs(savedOutputs);
      setCaptureTitle(sessionStorage.getItem(CAPTURE_TITLE_KEY)||'');
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
      setRecording(false);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
      setStatus('Recording received. Pie is analyzing the music now.');
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
          if(parsed&&Object.keys(parsed.jobs).length){
            saveProcessing(parsed.jobs,parsed.outputs,parsed.title);
          }else{
            finishCapture('Recording sent to Pie. Processing has started.');
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
        if(result==='accepted') setStatus('Recording received. Pie is loading the processing jobs…');
        else if(result==='processing') setStatus('Recording finished. Pie is processing it.');
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
          setStatus('Pie hit a processing problem. Your recording is safe, but one of the analysis jobs needs attention.');
          return;
        }
        if(statuses.separation==='COMPLETED'&&outputs.partSheets&&!jobs.lead)void startPartSheets(jobs.separation);
        else if(allDone(statuses,jobs)) setStatus('Ready — your stems and sheet-music analysis are complete.');
        else if(statuses.separation==='COMPLETED') setStatus('Stems are ready. Pie is finishing the notation and chord analysis.');
        else setStatus('Analyzing music… creating stems, notation, and chords.');
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
      ['Stems',jobs.separation?jobStatuses.separation||'PROCESSING':'SKIPPED'],
      ['Sheets',jobs.full?jobStatuses.full||'PROCESSING':'SKIPPED'],
      ['Chords',jobs.chords?jobStatuses.chords||'PROCESSING':'SKIPPED'],
    ];
    return steps;
  },[jobs,jobStatuses]);

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
    if(!value){setStatus('Paste the song or source URL first.');setConfirming(false);return;}
    try{
      const parsed=new URL(value);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('invalid');
    }catch{
      setStatus('Enter a valid web URL.');setConfirming(false);return;
    }

    setConfirming(false);
    setRecording(true);
    setJobs({});setOutputs({});setJobStatuses({});setCaptureTitle('');setStemJobsStarted(false);
    sessionStorage.removeItem(CAPTURE_JOBS_KEY);
    sessionStorage.removeItem(CAPTURE_OUTPUTS_KEY);
    sessionStorage.removeItem(CAPTURE_TITLE_KEY);
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
      params.set('stems','true');
      params.set('fullSheet','true');
      params.set('partSheets','true');
      params.set('chords','true');

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
      {!recording?<button className="primary" type="button" onClick={()=>setConfirming(true)}>● Record</button>:<button className="primary" type="button" disabled aria-disabled="true">● Recording — awaiting Android finish</button>}
    </div>
    <small style={{display:'block',marginTop:10}}>Pie keeps the helper invisible. Android still requires its own secure “Share one app” permission sheet, and Android controls that sheet’s colors and buttons.</small>
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
        <div style={{display:'flex',gap:10,marginTop:18}}>
          <button className="secondary" type="button" onClick={()=>setConfirming(false)} style={{flex:1}}>Cancel</button>
          <button className="primary" type="button" onClick={()=>{void startRecorder();}} style={{flex:1}}>Continue</button>
        </div>
      </div>
    </div>}
  </section>;
}
