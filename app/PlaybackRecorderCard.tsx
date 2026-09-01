'use client';

import { useEffect, useState } from 'react';

export default function PlaybackRecorderCard(){
  const [sourceUrl,setSourceUrl]=useState('');
  const [status,setStatus]=useState('');
  const [confirming,setConfirming]=useState(false);
  const [recording,setRecording]=useState(false);

  useEffect(()=>{
    const current=new URL(window.location.href);
    if(current.searchParams.get('pieCapture')==='accepted'){
      setStatus('Recording sent to Pie. Processing has started.');
      setRecording(false);
      current.searchParams.delete('pieCapture');
      window.history.replaceState({},'',current.toString());
    }
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

  function startRecorder(){
    const value=sourceUrl.trim();
    if(!value){setStatus('Paste the song or source URL first.');setConfirming(false);return;}
    try{
      const parsed=new URL(value);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw new Error('invalid');
    }catch{
      setStatus('Enter a valid web URL.');setConfirming(false);return;
    }
    const params=new URLSearchParams();
    params.set('url',value);
    params.set('return',window.location.href);
    params.set('stems','true');
    params.set('fullSheet','true');
    params.set('partSheets','true');
    params.set('chords','true');
    setConfirming(false);
    setRecording(true);
    setStatus('Android will place its required app-sharing permission over Pie. Choose only the music app you want to capture.');
    window.location.href=`pie-recorder://capture/start?${params.toString()}`;
  }

  function stopRecorder(){
    const params=new URLSearchParams();
    params.set('return',window.location.href);
    window.location.href=`pie-recorder://capture/stop?${params.toString()}`;
    setStatus('Stopping the recording and sending it back to Pie…');
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
      {!recording?<button className="primary" type="button" onClick={()=>setConfirming(true)}>● Record</button>:<button className="primary" type="button" onClick={stopRecorder}>■ Stop & Send to Pie</button>}
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
          <button className="primary" type="button" onClick={startRecorder} style={{flex:1}}>Continue</button>
        </div>
      </div>
    </div>}
  </section>;
}
