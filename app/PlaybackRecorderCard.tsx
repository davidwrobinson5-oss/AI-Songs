'use client';

import { useEffect, useState } from 'react';

const CAPTURE_STARTED_KEY='pieCaptureStartedAt';
const CAPTURE_ID_KEY='pieCaptureSessionId';

export default function PlaybackRecorderCard(){
  const [sourceUrl,setSourceUrl]=useState('');
  const [status,setStatus]=useState('');
  const [confirming,setConfirming]=useState(false);
  const [recording,setRecording]=useState(false);

  useEffect(()=>{
    let stopped=false;
    let timer:number|undefined;

    const finish=(message:string)=>{
      setStatus(message);
      setRecording(false);
      sessionStorage.removeItem(CAPTURE_STARTED_KEY);
      sessionStorage.removeItem(CAPTURE_ID_KEY);
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
          if(res.status===404) finish('Recording session could not be found. Please try again.');
          return;
        }
        const captureStatus=String(data?.status||'');
        if(captureStatus==='accepted') finish('Recording sent to Pie. Processing has started.');
        else if(captureStatus==='processingFailed') finish('Recording finished, but processing needs attention.');
        else if(captureStatus==='uploadFailed') finish('Recording finished, but upload to Pie failed.');
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
        if(result==='accepted') finish('Recording sent to Pie. Processing has started.');
        else if(result==='processing') setStatus('Recording finished. Pie is processing it.');
        else if(result==='processingFailed') finish('Recording finished, but processing needs attention.');
        else finish('Recording session finished.');
        current.searchParams.delete('pieCapture');
        window.history.replaceState({},'',current.toString());
        return;
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
