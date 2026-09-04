'use client';

import { useUser } from '@clerk/nextjs';
import { FormEvent, useMemo, useState } from 'react';

const stageNames = ['','Raw Talent','Hot Prospect','Talent Show Boss','Local Hero','Regional Hit','National Hitmaker','International Rock Star','World Legend'];
const starterPrompts = [
  'What should I do next?',
  'Build my plan for this week',
  'What am I missing before release?',
  'How do I grow from where I am now?',
];

export default function PieGuide() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const publicMetadata = (user?.publicMetadata || {}) as Record<string, unknown>;
  const unsafeMetadata = (user?.unsafeMetadata || {}) as Record<string, unknown>;
  const existingBeta = !Boolean(publicMetadata.piePlanLevel || publicMetadata.pieOnboardingCompleted || unsafeMetadata.pieOnboardingStartedAt);
  const level = existingBeta ? 8 : Math.max(1, Number(publicMetadata.piePlanLevel || 1));
  const stageName = useMemo(()=>stageNames[level] || `Stage ${level}`,[level]);

  async function askGuide(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setAnswer('');
    try {
      const response = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, level, stageName }),
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || 'Guide is unavailable right now.');
      setAnswer(data.answer || 'No guidance was returned.');
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'Guide is unavailable right now.');
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={()=>setOpen(true)} aria-label="Open Pie Guide" style={{position:'fixed',right:16,bottom:'calc(76px + env(safe-area-inset-bottom))',zIndex:19999,width:52,height:52,borderRadius:'50%',border:'1px solid rgba(255,255,255,.14)',background:'#7c3aed',color:'#fff',fontSize:24,boxShadow:'0 12px 30px rgba(0,0,0,.4)'}}>🥧</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Pie Guide" style={{position:'fixed',inset:0,zIndex:2147483500,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'flex-end',justifyContent:'center',padding:12}}>
      <section style={{width:'min(680px,100%)',maxHeight:'88vh',overflow:'auto',borderRadius:'24px 24px 18px 18px',background:'#111118',border:'1px solid rgba(255,255,255,.12)',padding:18,color:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}>
          <div><div style={{fontSize:11,color:'#9b7cff',fontWeight:900,letterSpacing:'.1em'}}>PIE GUIDE</div><h2 style={{margin:'5px 0'}}>Your AI Artist Manager</h2><div style={{color:'#9899a8',fontSize:12}}>Stage {level} · {stageName}</div></div>
          <button type="button" onClick={()=>setOpen(false)} style={{border:0,background:'transparent',color:'#aaa9bd',fontSize:26}}>×</button>
        </div>
        <p style={{color:'#a8a9b6',fontSize:13,lineHeight:1.5}}>Ask what to do next, how to prepare for a release, what data to find, how to build a campaign, how to book gigs, or how to advance to the next stage. The Guide should keep you focused on the few highest-value next actions.</p>
        <div style={{display:'flex',gap:7,flexWrap:'wrap',margin:'10px 0 14px'}}>{starterPrompts.map((prompt)=><button key={prompt} type="button" onClick={()=>setQuestion(prompt)} className="secondary">{prompt}</button>)}</div>
        <form onSubmit={askGuide} style={{display:'grid',gap:9}}>
          <textarea value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="What should I do next?" style={{minHeight:110}} />
          <button type="submit" className="primary" disabled={busy || !question.trim()}>{busy?'Thinking…':'Ask Pie Guide'}</button>
        </form>
        {answer && <div style={{marginTop:14,padding:14,borderRadius:15,background:'#0c0d14',border:'1px solid #292a36',whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.55}}>{answer}</div>}
      </section>
    </div>}
  </>;
}
