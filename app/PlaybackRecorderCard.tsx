'use client';

import { useState } from 'react';

export default function PlaybackRecorderCard(){
  const [sourceUrl,setSourceUrl]=useState('');
  const [status,setStatus]=useState('');

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

  function record(){
    const params=new URLSearchParams();
    if(sourceUrl.trim())params.set('url',sourceUrl.trim());
    params.set('return',window.location.href);
    window.location.href=`pie-recorder://capture?${params.toString()}`;
    setStatus('Opening Pie Recorder. Android will ask which app you want to share.');
  }

  return <section className="panel" style={{padding:20,marginBottom:16}}>
    <p className="eyebrow">PLAYBACK RECORDER</p>
    <h2 style={{marginTop:4}}>Record into Pie</h2>
    <p className="sub">Capture audio playing on your Android phone, then bring it back into Pie for stems and sheet music.</p>
    <input
      value={sourceUrl}
      onChange={event=>setSourceUrl(event.target.value)}
      placeholder="Paste YouTube, Suno, Spotify, or other URL"
      inputMode="url"
      style={{width:'100%',padding:12,borderRadius:10,marginTop:10}}
    />
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}>
      <button className="secondary" type="button" onClick={openSource}>Open URL / Choose App</button>
      <button className="primary" type="button" onClick={record}>Record</button>
    </div>
    <small style={{display:'block',marginTop:10}}>When Android asks what to share, choose the app playing your song. Android requires this permission screen for playback capture.</small>
    {status&&<div className="statusBox" style={{marginTop:12}}>{status}</div>}
  </section>;
}
