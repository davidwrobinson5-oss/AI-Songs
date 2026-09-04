'use client';

import { useEffect, useMemo, useState } from 'react';

type SupportCase={id:string;user_id:string;case_number?:string;support_type:string;business_stage?:string;preferred_contact?:string;subject:string;status:string;priority:string;assigned_to?:string;specialist_type?:string;due_at?:string;escalated_at?:string;created_at:string;updated_at:string;closed_at?:string};
type SupportMessage={id:string;sender_role:string;body:string;created_at:string};

async function api(method:'GET'|'POST'='GET',body?:Record<string,unknown>){
  const r=await fetch('/api/support-admin',{method,headers:method==='POST'?{'Content-Type':'application/json'}:undefined,body:method==='POST'?JSON.stringify(body||{}):undefined,cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(String(d?.error||'Support operations failed.'));
  return d;
}

export default function SupportAdminPage(){
  const [cases,setCases]=useState<SupportCase[]>([]);
  const [selected,setSelected]=useState<SupportCase|null>(null);
  const [messages,setMessages]=useState<SupportMessage[]>([]);
  const [reply,setReply]=useState('');
  const [assignedTo,setAssignedTo]=useState('');
  const [specialistType,setSpecialistType]=useState('');
  const [priority,setPriority]=useState('normal');
  const [status,setStatus]=useState('open');
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');

  async function load(){setBusy(true);setNotice('');try{const d=await api();const next=Array.isArray(d.cases)?d.cases:[];setCases(next);if(selected){const updated=next.find((x:SupportCase)=>x.id===selected.id);if(updated)setSelected(updated);}}catch(e){setNotice(e instanceof Error?e.message:'Could not load support cases.');}finally{setBusy(false);}}
  useEffect(()=>{load();},[]);

  async function openCase(item:SupportCase){setSelected(item);setAssignedTo(item.assigned_to||'');setSpecialistType(item.specialist_type||'');setPriority(item.priority||'normal');setStatus(item.status||'open');setMessages([]);try{const d=await api('POST',{action:'messages',caseId:item.id});setMessages(Array.isArray(d.messages)?d.messages:[]);}catch(e){setNotice(e instanceof Error?e.message:'Could not load case messages.');}}
  async function saveCase(extra:Record<string,unknown>={}){if(!selected)return;setBusy(true);setNotice('');try{await api('POST',{action:'update',caseId:selected.id,assignedTo,specialistType,priority,status,...extra});await load();setNotice('Case updated.');}catch(e){setNotice(e instanceof Error?e.message:'Could not update case.');}finally{setBusy(false);}}
  async function sendReply(){if(!selected||!reply.trim())return;setBusy(true);setNotice('');try{await api('POST',{action:'reply',caseId:selected.id,message:reply.trim()});setReply('');await openCase(selected);await load();}catch(e){setNotice(e instanceof Error?e.message:'Could not send reply.');}finally{setBusy(false);}}

  const stats=useMemo(()=>({open:cases.filter(x=>!['resolved','closed'].includes(x.status)).length,urgent:cases.filter(x=>x.priority==='urgent').length,high:cases.filter(x=>x.priority==='high').length,unassigned:cases.filter(x=>!x.assigned_to&&!['resolved','closed'].includes(x.status)).length}),[cases]);

  return <main style={{minHeight:'100vh',background:'#080910',color:'#fff',padding:'18px 14px 60px'}}><div style={{width:'min(100%,1180px)',margin:'0 auto',display:'grid',gap:14}}>
    <header><a href="/" style={{color:'#a78bfa',textDecoration:'none'}}>← Back to Pie</a><h1 style={{fontSize:32,margin:'10px 0 4px'}}>🛟 Support Operations</h1><p style={{color:'#9ca3af'}}>Assignment, specialist routing, priorities, escalations, replies, and case history.</p></header>
    <section style={panel}><div style={grid}>{[['Open',stats.open],['Urgent',stats.urgent],['High',stats.high],['Unassigned',stats.unassigned]].map(([label,value])=><div key={String(label)} style={box}><small>{label}</small><strong style={{fontSize:28}}>{value}</strong></div>)}</div><button onClick={load} disabled={busy} style={{...secondary,marginTop:10}}>{busy?'Refreshing…':'Refresh'}</button></section>
    <section style={{display:'grid',gridTemplateColumns:'minmax(300px,.9fr) minmax(0,1.4fr)',gap:14}}>
      <div style={panel}><strong>Cases</strong><div style={{display:'grid',gap:8,marginTop:10,maxHeight:'70vh',overflow:'auto'}}>{cases.length===0?<small style={{color:'#9ca3af'}}>No cases.</small>:cases.map(item=><button key={item.id} onClick={()=>openCase(item)} style={{textAlign:'left',padding:11,borderRadius:12,border:selected?.id===item.id?'1px solid #8b5cf6':'1px solid #2c2f3c',background:'#0d0f16',color:'#fff'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{item.case_number||'Pie case'}</strong><small>{item.priority}</small></div><div style={{fontSize:12,fontWeight:800,marginTop:4}}>{item.subject}</div><small style={{display:'block',marginTop:4,color:'#9295a1'}}>{item.support_type} · {item.status}</small><small style={{display:'block',marginTop:3,color:'#737683'}}>{new Date(item.updated_at).toLocaleString()}</small></button>)}</div></div>
      <div style={panel}>{!selected?<small style={{color:'#9ca3af'}}>Select a case.</small>:<div style={{display:'grid',gap:12}}>
        <div><strong>{selected.case_number} · {selected.subject}</strong><small style={{display:'block',color:'#9ca3af',marginTop:4}}>{selected.support_type} · user {selected.user_id}</small></div>
        <div style={grid}><label style={label}>Status<select value={status} onChange={e=>setStatus(e.target.value)} style={input}><option>open</option><option>pending</option><option>investigating</option><option>resolved</option><option>closed</option></select></label><label style={label}>Priority<select value={priority} onChange={e=>setPriority(e.target.value)} style={input}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></label><label style={label}>Assigned to<input value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} style={input} placeholder="Support owner"/></label><label style={label}>Specialist<input value={specialistType} onChange={e=>setSpecialistType(e.target.value)} style={input} placeholder="Attorney, CPA/EA, booking, technical…"/></label></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button onClick={()=>saveCase()} disabled={busy} style={primary}>Save Case</button><button onClick={()=>saveCase({escalate:true,status:'investigating'})} disabled={busy} style={secondary}>Escalate</button><button onClick={()=>saveCase({status:'resolved'})} disabled={busy} style={secondary}>Resolve</button></div>
        <div style={{display:'grid',gap:8,maxHeight:330,overflow:'auto',padding:10,borderRadius:12,background:'#090a10',border:'1px solid #252836'}}>{messages.length===0?<small style={{color:'#8b8e9a'}}>No messages loaded.</small>:messages.map(m=><div key={m.id} style={{padding:10,borderRadius:10,background:m.sender_role==='support'?'#151d25':'#17162b'}}><strong style={{fontSize:11}}>{m.sender_role==='support'?'Pie Support':'User'}</strong><div style={{whiteSpace:'pre-wrap',marginTop:4,fontSize:13,lineHeight:1.45}}>{m.body}</div><small style={{display:'block',marginTop:5,color:'#767985'}}>{new Date(m.created_at).toLocaleString()}</small></div>)}</div>
        <textarea value={reply} onChange={e=>setReply(e.target.value)} style={{...input,minHeight:110}} placeholder="Reply as Pie Support…"/><button onClick={sendReply} disabled={busy||!reply.trim()} style={primary}>{busy?'Sending…':'Send Support Reply'}</button>
      </div>}</div>
    </section>{notice&&<div style={{...panel,color:'#c4b5fd'}}>{notice}</div>}
  </div></main>;
}

const panel:React.CSSProperties={padding:16,borderRadius:18,background:'#11131b',border:'1px solid #292c39'};
const grid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10};
const box:React.CSSProperties={display:'grid',gap:4,padding:12,borderRadius:12,background:'#0d0f16',border:'1px solid #2b2e3a'};
const label:React.CSSProperties={display:'grid',gap:6,fontSize:12,fontWeight:800};
const input:React.CSSProperties={width:'100%',padding:10,borderRadius:10,border:'1px solid #343746',background:'#090a10',color:'#fff'};
const primary:React.CSSProperties={minHeight:42,border:0,borderRadius:10,background:'#7c3aed',color:'#fff',fontWeight:900,padding:'0 14px'};
const secondary:React.CSSProperties={minHeight:42,borderRadius:10,border:'1px solid #343746',background:'#151822',color:'#fff',fontWeight:850,padding:'0 14px'};
