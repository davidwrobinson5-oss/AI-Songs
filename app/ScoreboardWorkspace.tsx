'use client';

import { useEffect, useMemo, useState } from 'react';

type Leader={display_name:string;entity_type:string;current_stage:number;current_score:number;all_time_high:number;completion_points:number;quality_points:number;determination_points:number;connections_points:number;execution_points:number;badges?:unknown[]};
type Profile=Leader & { user_id?:string; is_public?:boolean };

const caps={completion:250,quality:250,determination:150,connections:150,execution:200};

export default function ScoreboardWorkspace(){
  const [leaders,setLeaders]=useState<Leader[]>([]);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [publicOptIn,setPublicOptIn]=useState(false);
  const [entityType,setEntityType]=useState<'artist'|'band'>('artist');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');

  async function call(action:string,extra:Record<string,unknown>={}){
    const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Scoreboard request failed.');
    return data;
  }

  async function refresh(){
    try{
      const [top,mine]=await Promise.all([call('scoreTop100'),call('scoreProfile')]);
      setLeaders(Array.isArray(top.leaders)?top.leaders:[]);
      setProfile(mine.profile||null);
      if(mine.profile){setPublicOptIn(Boolean(mine.profile.is_public));setEntityType(mine.profile.entity_type==='band'?'band':'artist');}
    }catch(error){setStatus(error instanceof Error?error.message:'Could not load scoreboard.');}
  }

  useEffect(()=>{refresh();},[]);

  const score=profile?.current_score||0;
  const high=profile?.all_time_high||0;
  const rank=useMemo(()=>leaders.findIndex(item=>item.display_name===profile?.display_name&&item.all_time_high===high)+1,[leaders,profile,high]);

  async function saveIdentity(){
    setBusy(true);setStatus('');
    try{
      const stage=Math.max(1,Number(profile?.current_stage||1));
      const data=await call('scoreIdentity',{displayName:profile?.display_name||'Pie Artist',entityType,isPublic:publicOptIn,currentStage:stage});
      setProfile(data.profile||profile);setStatus('Scoreboard profile updated.');await refresh();
    }catch(error){setStatus(error instanceof Error?error.message:'Could not update scoreboard profile.');}
    finally{setBusy(false);}
  }

  return <main className="growthWorkspace">
    <section className="hero">
      <p className="eyebrow">Pie Score</p>
      <h1>Scoreboard</h1>
      <p className="sub">All-time Top 100 artists and bands, ranked by a 1,000-point system that rewards completion, quality, determination, connections, and execution across Pie.</p>
    </section>

    <section className="panel">
      <div className="controlGrid">
        <div className="statusBox"><small>YOUR SCORE</small><strong>{score.toLocaleString()}</strong></div>
        <div className="statusBox"><small>ALL-TIME HIGH</small><strong>{high.toLocaleString()}</strong></div>
        <div className="statusBox"><small>PUBLIC RANK</small><strong>{rank>0?`#${rank}`:'—'}</strong></div>
        <div className="statusBox"><small>MAX SCORE</small><strong>1,000</strong></div>
      </div>
      <div style={{display:'grid',gap:8,marginTop:14}}>
        {[
          ['Completion',profile?.completion_points||0,caps.completion],
          ['Quality',profile?.quality_points||0,caps.quality],
          ['Determination',profile?.determination_points||0,caps.determination],
          ['Connections',profile?.connections_points||0,caps.connections],
          ['Execution',profile?.execution_points||0,caps.execution],
        ].map(([label,value,cap])=><div key={String(label)} style={{display:'grid',gridTemplateColumns:'110px 1fr 70px',alignItems:'center',gap:10}}>
          <strong>{label}</strong><div style={{height:10,borderRadius:999,background:'#242633',overflow:'hidden'}}><div style={{height:'100%',width:`${Math.min(100,Number(value)/Number(cap)*100)}%`,background:'linear-gradient(90deg,#7c3aed,#22d3ee)'}} /></div><small>{value}/{cap}</small>
        </div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10,marginTop:16}}>
        <label>Profile type<select value={entityType} onChange={e=>setEntityType(e.target.value==='band'?'band':'artist')}><option value="artist">Artist</option><option value="band">Band</option></select></label>
        <label style={{display:'flex',gap:8,alignItems:'center',marginTop:24}}><input type="checkbox" checked={publicOptIn} onChange={e=>setPublicOptIn(e.target.checked)} /> Show me on public Top 100</label>
      </div>
      <button type="button" className="primary" onClick={saveIdentity} disabled={busy} style={{marginTop:12}}>{busy?'Saving…':'Save Scoreboard Settings'}</button>
      {status&&<small style={{display:'block',marginTop:10}}>{status}</small>}
    </section>

    <section className="panel">
      <div className="songsSectionHead"><strong>All-Time High Score · Top 100</strong><span>{leaders.length}</span></div>
      <div style={{display:'grid',gap:8,marginTop:10}}>
        {leaders.length===0?<div className="statusBox">No public scores yet. Be the first.</div>:leaders.map((item,index)=><article key={`${item.display_name}-${index}`} className="statusBox" style={{display:'grid',gridTemplateColumns:'54px minmax(0,1fr) auto',alignItems:'center',gap:10}}>
          <strong style={{fontSize:18}}>#{index+1}</strong>
          <div><strong>{item.display_name}</strong><small style={{display:'block'}}>{item.entity_type==='band'?'Band':'Artist'} · Stage {item.current_stage}</small></div>
          <div style={{textAlign:'right'}}><strong>{item.all_time_high.toLocaleString()}</strong><small style={{display:'block'}}>all-time high</small></div>
        </article>)}
      </div>
    </section>

    <section className="panel">
      <h2>How Pie Score Works</h2>
      <p className="sub">Completion and quality each carry 25% of the score. Execution carries 20%. Determination and connections carry 15% each. Points are earned from verified actions and results across Pie instead of self-reported claims. The same milestone cannot be counted twice.</p>
      <div className="growthCardGrid">
        <article className="growthFeatureCard"><strong>Completion · 250</strong><small>Finish setup, songs, sheets, rights, release plans, campaigns, business, accounting, merch, gigs, and other stage milestones.</small></article>
        <article className="growthFeatureCard"><strong>Quality · 250</strong><small>Song Score, originality, mix/master readiness, release assets, contract completeness, data quality, and campaign-quality checks.</small></article>
        <article className="growthFeatureCard"><strong>Determination · 150</strong><small>Consistent activity, follow-through, retrying failed steps, completing weekly plans, and sustained progress over time.</small></article>
        <article className="growthFeatureCard"><strong>Connections · 150</strong><small>Qualified fan, media, booking, venue, brand, collaborator, professional, sponsor, and industry relationship development.</small></article>
        <article className="growthFeatureCard"><strong>Execution · 200</strong><small>Releases launched, campaigns completed, gigs performed, deals closed, merch sold, filings completed, and measurable business outcomes.</small></article>
      </div>
    </section>
  </main>;
}
