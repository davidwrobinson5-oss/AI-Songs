'use client';

import { useEffect, useState } from 'react';

type Selection={sheets:boolean;chords:boolean;stems:boolean};
type CaptureReady={stagedPath:string;title:string};

const JOBS_KEY='pieCaptureJobs';
const OUTPUTS_KEY='pieCaptureOutputs';
const TITLE_KEY='pieCaptureTitle';
const PENDING_ID_KEY='piePendingCaptureId';
const CAPTURE_LIBRARY_KEY='pie-captured-songs-v1';

export default function CaptureOptionsPage(){
  const [captureId,setCaptureId]=useState('');
  const [ready,setReady]=useState<CaptureReady|null>(null);
  const [selection,setSelection]=useState<Selection>({sheets:false,chords:false,stems:false});
  const [status,setStatus]=useState('Loading your recording…');
  const [processing,setProcessing]=useState(false);

  useEffect(()=>{
    const id=new URL(window.location.href).searchParams.get('captureId')||sessionStorage.getItem(PENDING_ID_KEY)||'';
    setCaptureId(id);
    if(!id){setStatus('The recording session could not be found.');return;}

    let stopped=false;
    let timer:number|undefined;
    const check=async()=>{
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
          if(!stopped)setStatus(data?.error||'Could not load the recording.');
          return;
        }
        const captureStatus=String(data?.status||'');
        if(captureStatus==='uploading'||captureStatus==='recording'){
          if(!stopped)setStatus('Finishing the recording upload…');
          return;
        }
        if(captureStatus==='uploadFailed'||captureStatus==='processingFailed'){
          if(!stopped)setStatus('The recording upload needs attention.');
          return;
        }
        if(captureStatus==='accepted'){
          try{
            const parsed=JSON.parse(String(data?.result||''));
            if(parsed?.awaitingSelection&&parsed?.stagedPath){
              if(stopped)return;
              setReady({stagedPath:String(parsed.stagedPath),title:String(parsed.title||'Android playback recording')});
              setStatus('Recording ready. Choose what Pie should create.');
              if(timer!==undefined)window.clearInterval(timer);
              return;
            }
          }catch{}
          if(!stopped)setStatus('The recording is ready, but Pie could not load the output choices.');
        }
      }catch{
        if(!stopped)setStatus('Waiting for the recording upload…');
      }
    };

    void check();
    timer=window.setInterval(()=>{void check();},1200);
    return()=>{stopped=true;if(timer!==undefined)window.clearInterval(timer);};
  },[]);

  const selectedCount=Number(selection.sheets)+Number(selection.chords)+Number(selection.stems);

  function saveCaptureToLibrary(data:{jobs:Record<string,string>;outputs:Record<string,boolean>;title:string;stagedPath:string}){
    let current:any[]=[];
    try{
      const parsed=JSON.parse(localStorage.getItem(CAPTURE_LIBRARY_KEY)||'[]');
      if(Array.isArray(parsed))current=parsed;
    }catch{}
    const record={
      id:`capture_${captureId}`,
      captureId,
      title:data.title||ready?.title||'Captured recording',
      createdAt:new Date().toISOString(),
      stagedPath:data.stagedPath||ready?.stagedPath||'',
      jobs:data.jobs||{},
      outputs:data.outputs||{},
      statuses:{},
      state:'processing',
    };
    const next=[record,...current.filter(item=>item?.id!==record.id)].slice(0,40);
    localStorage.setItem(CAPTURE_LIBRARY_KEY,JSON.stringify(next));
    window.dispatchEvent(new Event('pie-captured-songs-changed'));
  }

  async function beginProcessing(){
    if(!ready||!captureId||selectedCount===0)return;
    setProcessing(true);
    setStatus('Starting only the outputs you selected…');
    try{
      const outputs={
        stems:selection.stems,
        fullSheet:selection.sheets,
        partSheets:false,
        chords:selection.chords,
      };
      const res=await fetch('/api/sheets/process-upload',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({stagedPath:ready.stagedPath,name:ready.title,type:'audio/wav',outputs}),
        credentials:'same-origin',
        cache:'no-store',
      });
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data?.jobs)throw new Error(data?.error||'Could not start processing.');

      sessionStorage.setItem(JOBS_KEY,JSON.stringify(data.jobs));
      sessionStorage.setItem(OUTPUTS_KEY,JSON.stringify(data.outputs||outputs));
      sessionStorage.setItem(TITLE_KEY,String(data.title||ready.title));
      saveCaptureToLibrary({
        jobs:data.jobs,
        outputs:data.outputs||outputs,
        title:String(data.title||ready.title),
        stagedPath:String(data.stagedPath||ready.stagedPath),
      });
      sessionStorage.removeItem(PENDING_ID_KEY);
      sessionStorage.removeItem('pieCaptureSessionId');
      sessionStorage.removeItem('pieCaptureStartedAt');
      window.location.replace('/?screen=songs#captured');
    }catch(error){
      setProcessing(false);
      setStatus(error instanceof Error?error.message:'Could not start processing.');
    }
  }

  function option(key:keyof Selection,title:string,copy:string){
    const checked=selection[key];
    return <button
      type="button"
      aria-pressed={checked}
      onClick={()=>setSelection(current=>({...current,[key]:!current[key]}))}
      style={{width:'100%',padding:16,borderRadius:16,textAlign:'left',border:checked?'1px solid rgba(134,239,172,.75)':'1px solid rgba(192,132,252,.35)',background:checked?'rgba(34,197,94,.14)':'rgba(255,255,255,.04)',color:'inherit'}}
    >
      <strong style={{display:'block',fontSize:17}}>{checked?'✓':'○'} {title}</strong>
      <span style={{display:'block',marginTop:4,opacity:.72,lineHeight:1.4}}>{copy}</span>
    </button>;
  }

  return <main style={{minHeight:'100dvh',padding:'20px 16px 100px',overflowY:'auto'}}>
    <section className="panel" style={{width:'min(520px,100%)',margin:'0 auto',padding:22,maxHeight:'calc(100dvh - 40px)',overflowY:'auto',overscrollBehavior:'contain'}}>
      <p className="eyebrow">RECORDING COMPLETE</p>
      <h1 style={{margin:'6px 0 8px'}}>What do you want Pie to make?</h1>
      <p className="sub" style={{marginTop:0}}>Nothing starts until you choose. Select one or more outputs for this recording.</p>

      <div style={{display:'grid',gap:10,marginTop:18}}>
        {option('sheets','Sheets','Create the main music transcription / notation.')}
        {option('chords','Chords','Analyze the chord progression and timing.')}
        {option('stems','Stems','Separate the recording into individual musical stems.')}
      </div>

      <div className="statusBox" style={{marginTop:14}}>{status}</div>
      <button
        className="primary"
        type="button"
        disabled={!ready||selectedCount===0||processing}
        onClick={()=>{void beginProcessing();}}
        style={{width:'100%',marginTop:14,opacity:!ready||selectedCount===0||processing?.55:1}}
      >
        {processing?'Starting…':selectedCount?`Process ${selectedCount} selected`:'Select an output'}
      </button>
    </section>
  </main>;
}
