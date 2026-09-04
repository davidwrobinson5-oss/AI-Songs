'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type SupportCase={id:string;case_number?:string;support_type:string;business_stage?:string;preferred_contact?:string;subject:string;message?:string;status:string;priority:string;assigned_to?:string;created_at:string;updated_at:string;closed_at?:string};
type SupportMessage={id:string;sender_role:string;body:string;created_at:string};

const supportTypes=['Backend setup + account connections','Coaching + strategy','Sales + booking','Tax + accounting','Legal + contracts','Marketing + growth','Distribution + release setup','Merch + e-commerce','Gigs + touring operations','Team + contractor setup','Funding + budgeting','Other / help me figure it out'];
const businessStages=['1 · Create for Fun','2 · Planning a Release','3 · Prelaunch','4 · Launch','5 · Campaign','6 · Gigs','7 · Local to National','8 · National to International'];

async function ops(action:string,extra:Record<string,unknown>={}){
  const response=await fetch('/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||'Live Support request failed.'));
  return data;
}

export default function LiveSupportCenter({onClose}:{onClose:()=>void}){
  const [cases,setCases]=useState<SupportCase[]>([]);
  const [selected,setSelected]=useState<SupportCase|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [supportType,setSupportType]=useState(supportTypes[0]);
  const [supportStage,setSupportStage]=useState(businessStages[0]);
  const [supportContact,setSupportContact]=useState('In-app message');
  const [supportSubject,setSupportSubject]=useState('');
  const [supportMessage,setSupportMessage]=useState('');
  const [reply,setReply]=useState('');

  async function refreshCases(){
    const data=await ops('supportList');
    const next=Array.isArray(data?.cases)?data.cases:[];
    setCases(next);
    if(selected){const updated=next.find((item:SupportCase)=>item.id===selected.id);if(updated)setSelected(updated);}
  }

  async function openCase(item:SupportCase){
    setSelected(item);setStatus('');setMessages([]);
    try{const data=await ops('supportMessages',{caseId:item.id});setMessages(Array.isArray(data?.messages)?data.messages:[]);}catch(error){setStatus(error instanceof Error?error.message:'Could not load case history.');}
  }

  useEffect(()=>{refreshCases().catch(error=>setStatus(error instanceof Error?error.message:'Could not load Live Support.'));},[]);

  async function createCase(event:FormEvent){
    event.preventDefault();if(busy||!supportSubject.trim()||!supportMessage.trim())return;
    setBusy(true);setStatus('');
    try{
      const data=await ops('supportCreate',{supportType,businessStage:supportStage,preferredContact:supportContact,subject:supportSubject.trim(),message:supportMessage.trim(),priority:supportType.includes('Legal')||supportType.includes('Tax')?'high':'normal',metadata:{origin:'account_control'}});
      setSupportSubject('');setSupportMessage('');setStatus(`Case ${data?.case?.case_number||''} opened.`.trim());
      await refreshCases();if(data?.case)await openCase(data.case);
    }catch(error){setStatus(error instanceof Error?error.message:'Could not open support case.');}
    finally{setBusy(false);}
  }

  async function sendReply(){
    if(!selected||busy||!reply.trim())return;setBusy(true);setStatus('');
    try{await ops('supportReply',{caseId:selected.id,message:reply.trim()});setReply('');await openCase(selected);await refreshCases();}
    catch(error){setStatus(error instanceof Error?error.message:'Could not send reply.');}
    finally{setBusy(false);}
  }

  const openCount=useMemo(()=>cases.filter(item=>item.status!=='closed'&&item.status!=='resolved').length,[cases]);

  return <div role="dialog" aria-modal="true" aria-label="Pie Live Support" style={{position:'fixed',inset:0,zIndex:11000,display:'grid',placeItems:'center',padding:14,background:'rgba(0,0,0,.72)'}}>
    <div style={{width:'min(100%,900px)',maxHeight:'92vh',overflow:'auto',display:'grid',gap:14,padding:20,borderRadius:22,border:'1px solid #34344a',background:'#151522',color:'#fff',boxShadow:'0 24px 70px rgba(0,0,0,.5)'}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}><div><div style={{fontSize:22,fontWeight:900}}>Live Support</div><div style={{marginTop:4,color:'#a5a5b5',fontSize:12}}>Real Pie cases with a permanent conversation history. {openCount} open.</div></div><button type="button" aria-label="Close Live Support" onClick={onClose} style={{border:0,background:'transparent',color:'#aaa9bd',fontSize:24}}>×</button></div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
        <form onSubmit={createCase} style={{display:'grid',gap:10,padding:14,borderRadius:16,border:'1px solid #2f3041',background:'#10101a'}}>
          <strong>Open a new case</strong>
          <label style={labelStyle}>Support area<select value={supportType} onChange={e=>setSupportType(e.target.value)} style={inputStyle}>{supportTypes.map(type=><option key={type}>{type}</option>)}</select></label>
          <label style={labelStyle}>Pie stage<select value={supportStage} onChange={e=>setSupportStage(e.target.value)} style={inputStyle}>{businessStages.map(stage=><option key={stage}>{stage}</option>)}</select></label>
          <label style={labelStyle}>Preferred contact<select value={supportContact} onChange={e=>setSupportContact(e.target.value)} style={inputStyle}><option>In-app message</option><option>Email</option><option>Phone</option><option>Video call</option></select></label>
          <label style={labelStyle}>Subject<input value={supportSubject} onChange={e=>setSupportSubject(e.target.value)} maxLength={160} required style={inputStyle} placeholder="What outcome do you need?"/></label>
          <label style={labelStyle}>Details<textarea value={supportMessage} onChange={e=>setSupportMessage(e.target.value)} maxLength={6000} required style={{...inputStyle,minHeight:130,resize:'vertical'}} placeholder="What is happening, what have you tried, and what does success look like?"/></label>
          <div style={{padding:'10px 11px',borderRadius:12,background:'#111320',color:'#9899aa',fontSize:10,lineHeight:1.5}}>Legal and tax cases can be organized and escalated through Pie, but consequential legal or tax advice should be reviewed by appropriately qualified professionals.</div>
          <button type="submit" disabled={busy||!supportSubject.trim()||!supportMessage.trim()} style={primaryButton}>{busy?'Opening…':'Open Support Case'}</button>
        </form>

        <section style={{display:'grid',alignContent:'start',gap:10,padding:14,borderRadius:16,border:'1px solid #2f3041',background:'#10101a'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><strong>Case history</strong><button type="button" onClick={()=>refreshCases().catch(()=>undefined)} style={secondaryButton}>Refresh</button></div>
          {cases.length===0?<small style={{color:'#9699a7'}}>No support cases yet.</small>:cases.map(item=><button type="button" key={item.id} onClick={()=>openCase(item)} style={{textAlign:'left',padding:11,borderRadius:12,border:selected?.id===item.id?'1px solid #8b5cf6':'1px solid #2d3040',background:'#151522',color:'#fff'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{item.case_number||'Pie case'}</strong><span style={{fontSize:10,textTransform:'uppercase',color:item.status==='resolved'||item.status==='closed'?'#86efac':'#facc15'}}>{item.status}</span></div><div style={{fontSize:12,fontWeight:800,marginTop:4}}>{item.subject}</div><small style={{display:'block',marginTop:4,color:'#9699a7'}}>{item.support_type} · {new Date(item.updated_at).toLocaleString()}</small></button>)}
        </section>
      </div>

      {selected&&<section style={{display:'grid',gap:10,padding:14,borderRadius:16,border:'1px solid #34344a',background:'#0d0d16'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}><div><strong>{selected.case_number} · {selected.subject}</strong><small style={{display:'block',marginTop:4,color:'#9699a7'}}>{selected.support_type} · priority {selected.priority}{selected.assigned_to?` · assigned ${selected.assigned_to}`:''}</small></div><span style={{fontSize:11,textTransform:'uppercase'}}>{selected.status}</span></div>
        <div style={{display:'grid',gap:8,maxHeight:300,overflow:'auto'}}>{messages.length===0?<small style={{color:'#9699a7'}}>Loading history…</small>:messages.map(message=><div key={message.id} style={{padding:10,borderRadius:12,background:message.sender_role==='user'?'#17162b':'#151d25',border:'1px solid #2b2d3c'}}><strong style={{fontSize:11}}>{message.sender_role==='user'?'You':'Pie Support'}</strong><div style={{whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.5,marginTop:4}}>{message.body}</div><small style={{display:'block',marginTop:5,color:'#797b88'}}>{new Date(message.created_at).toLocaleString()}</small></div>)}</div>
        <textarea value={reply} onChange={e=>setReply(e.target.value)} maxLength={6000} style={{...inputStyle,minHeight:90,resize:'vertical'}} placeholder="Reply to this case…"/>
        <button type="button" onClick={sendReply} disabled={busy||!reply.trim()} style={primaryButton}>{busy?'Sending…':'Send Reply'}</button>
      </section>}

      {status&&<div style={{padding:'10px 12px',borderRadius:12,background:'#17162b',color:'#c4b5fd',fontSize:12}}>{status}</div>}
    </div>
  </div>;
}

const labelStyle:React.CSSProperties={display:'grid',gap:7,color:'#d8d8e8',fontSize:12,fontWeight:800};
const inputStyle:React.CSSProperties={width:'100%',minHeight:44,padding:'10px 12px',borderRadius:12,border:'1px solid #34344a',background:'#0d0d16',color:'#fff',outline:'none',fontSize:13};
const primaryButton:React.CSSProperties={minHeight:48,border:0,borderRadius:13,background:'#7c3aed',color:'#fff',fontWeight:900};
const secondaryButton:React.CSSProperties={minHeight:34,borderRadius:10,border:'1px solid #34344a',background:'#151522',color:'#fff',fontWeight:800,padding:'0 10px'};
