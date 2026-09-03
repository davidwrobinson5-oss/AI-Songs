'use client';

import { useEffect, useState } from 'react';

const CAPTURE_JOBS_KEY='pieCaptureJobs';
const CAPTURE_OUTPUTS_KEY='pieCaptureOutputs';
const CAPTURE_TITLE_KEY='pieCaptureTitle';
const CAPTURE_STAGED_KEY='pieCaptureStagedPath';

function clearProcessingSession(){
  sessionStorage.removeItem(CAPTURE_JOBS_KEY);
  sessionStorage.removeItem(CAPTURE_OUTPUTS_KEY);
  sessionStorage.removeItem(CAPTURE_TITLE_KEY);
  sessionStorage.removeItem(CAPTURE_STAGED_KEY);
}

export default function ProcessingRetryAssist(){
  const [visible,setVisible]=useState(false);
  const [retrying,setRetrying]=useState(false);
  const [message,setMessage]=useState('');
  const [resetRequired,setResetRequired]=useState(false);

  useEffect(()=>{
    const update=()=>{
      const text=(document.body?.innerText||'').toLowerCase();
      setVisible(
        text.includes('processing needs attention')||
        text.includes('pie hit a processing problem')||
        text.includes('analysis jobs needs attention')
      );
    };
    update();
    const observer=new MutationObserver(update);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    return()=>observer.disconnect();
  },[]);

  async function retry(){
    setRetrying(true);
    setMessage('Retrying from your saved recording…');
    try{
      const response=await fetch('/api/sheets/retry-processing',{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        if(data?.reset){
          clearProcessingSession();
          setResetRequired(true);
        }
        throw new Error(data?.error||'Could not retry processing.');
      }
      const jobs=data.jobs&&typeof data.jobs==='object'?data.jobs:{};
      if(!Object.keys(jobs).length)throw new Error('Pie did not return any retry jobs.');

      sessionStorage.setItem(CAPTURE_JOBS_KEY,JSON.stringify(jobs));
      sessionStorage.setItem(CAPTURE_OUTPUTS_KEY,JSON.stringify(data.outputs||{}));
      sessionStorage.setItem(CAPTURE_TITLE_KEY,String(data.title||'Android playback recording'));
      if(data.stagedPath)sessionStorage.setItem(CAPTURE_STAGED_KEY,String(data.stagedPath));
      setMessage(data.remainingAttempts===0?'Processing restarted for the final attempt.':`Processing restarted.${typeof data.remainingAttempts==='number'?` ${data.remainingAttempts} attempt${data.remainingAttempts===1?'':'s'} remaining.`:''}`);
      window.setTimeout(()=>window.location.reload(),500);
    }catch(error){
      setMessage(error instanceof Error?error.message:'Could not retry processing.');
    }finally{
      setRetrying(false);
    }
  }

  function reset(){
    clearProcessingSession();
    setMessage('Processing reset. Start a new recording when you are ready.');
    setResetRequired(false);
    setVisible(false);
    window.setTimeout(()=>window.location.reload(),500);
  }

  if(!visible&&!message)return null;

  return <div style={{position:'fixed',left:12,right:12,bottom:18,zIndex:12000,maxWidth:520,margin:'0 auto',padding:14,borderRadius:18,background:'linear-gradient(145deg,#24143d,#120d22)',border:'1px solid rgba(192,132,252,.5)',boxShadow:'0 18px 55px rgba(0,0,0,.55)',color:'white'}}>
    <strong style={{display:'block'}}>{resetRequired?'Processing reset needed':'Your recording is saved.'}</strong>
    <span style={{display:'block',fontSize:13,opacity:.78,marginTop:4}}>{message||'Pie will retry processing up to three total attempts before resetting.'}</span>
    {!resetRequired?<button className="primary" type="button" disabled={retrying} onClick={()=>{void retry();}} style={{width:'100%',marginTop:10,opacity:retrying?.65:1}}>
      {retrying?'Retrying…':'Retry processing — use saved recording'}
    </button>:<button className="primary" type="button" onClick={reset} style={{width:'100%',marginTop:10}}>Reset and record again</button>}
  </div>;
}
