'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';

const categories = [
  ['🎧','Genre Fan Base','Audience segments by genre, geography, platform, live-music behavior, and adjacent artists.'],
  ['🎼','Music Directors','Music directors for radio, venues, churches, events, TV, film, and other programming organizations.'],
  ['🎟️','Booking Agents','Agents, buyers, promoters, talent buyers, venue bookers, and festival contacts.'],
  ['🏷️','Record Labels','Labels, A&R teams, label managers, distributors, and independent imprints.'],
  ['🎙️','Podcasts','Music, culture, faith, entertainment, regional, and genre-specific podcasts and hosts.'],
  ['📻','Radio + Hosts','Radio stations, music directors, program directors, DJs, specialty shows, and hosts.'],
  ['🎬','Film + TV','Directors, producers, music supervisors, production companies, and sync-relevant contacts.'],
  ['🎉','Event + Party Planners','Wedding, corporate, college, nightlife, private-event, and festival planners.'],
  ['🏟️','Venues + Promoters','Clubs, theaters, festivals, fairs, casinos, colleges, promoters, and live-event buyers.'],
  ['📰','Press + Creators','Journalists, bloggers, reviewers, creators, influencers, and local entertainment media.'],
  ['💿','Playlists + DJs','Independent playlist curators, DJs, tastemakers, and programming contacts where lawful and available.'],
  ['🤝','Brands + Sponsors','Brands, agencies, sponsorship contacts, local businesses, and partnership decision-makers.'],
];
const genreOptions=['All genres','Pop','Hip-Hop / Rap','R&B / Soul','Christian / Gospel','Rock','Alternative','Country','Electronic / Dance','Jazz','Latin','Indie','Other'];
const geoOptions=['Local','Regional','United States','Canada','United Kingdom','Europe','Latin America','Asia-Pacific','International'];
type DataRequest={id:string;genre:string;geography:string;categories:string[];notes?:string;status:string;requested_count?:number;delivered_count?:number;created_at:string;updated_at:string;fulfilled_at?:string;cancelled_at?:string};
function creditsForLevel(level:number){return [0,0,25,100,250,500,1000,5000,25000][Math.max(0,Math.min(8,level))]||0;}

export default function DataWorkspace(){
  const {user}=useUser();
  const publicMetadata=(user?.publicMetadata||{}) as Record<string,unknown>;
  const unsafeMetadata=(user?.unsafeMetadata||{}) as Record<string,unknown>;
  const existingBeta=!Boolean(publicMetadata.piePlanLevel||publicMetadata.pieOnboardingCompleted||unsafeMetadata.pieOnboardingStartedAt);
  const level=existingBeta?8:Math.max(1,Number(publicMetadata.piePlanLevel||1));
  const credits=creditsForLevel(level);
  const [selected,setSelected]=useState<string[]>([]);const [genre,setGenre]=useState('All genres');const [geo,setGeo]=useState('Local');const [notes,setNotes]=useState('');const [requests,setRequests]=useState<DataRequest[]>([]);const [busy,setBusy]=useState(false);const [status,setStatus]=useState('');

  async function load(){try{const r=await fetch('/api/data',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load data requests.');setRequests(Array.isArray(d.requests)?d.requests:[]);}catch(e){setStatus(e instanceof Error?e.message:'Could not load data requests.');}}
  useEffect(()=>{load();},[]);
  const selectedLabels=useMemo(()=>categories.filter(([,label])=>selected.includes(label)).map(([,label])=>label),[selected]);
  const stats=useMemo(()=>{const counts=new Map<string,number>();const markets=new Set<string>();let lists=0;for(const request of requests){markets.add(request.geography);lists+=request.categories.length;for(const c of request.categories)counts.set(c,(counts.get(c)||0)+1);}return {total:requests.length,lists,markets:markets.size,delivered:requests.reduce((n,r)=>n+Number(r.delivered_count||0),0),top:[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3)};},[requests]);
  function toggle(label:string){setSelected(current=>current.includes(label)?current.filter(x=>x!==label):[...current,label]);}
  async function saveRequest(){if(!selectedLabels.length)return;setBusy(true);setStatus('');try{const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',genre,geography:geo,categories:selectedLabels,notes,requestKey:crypto.randomUUID()})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not save data request.');setSelected([]);setNotes('');setStatus('Request saved to your private Pie Data workspace.');await load();}catch(e){setStatus(e instanceof Error?e.message:'Could not save data request.');}finally{setBusy(false);}}
  async function cancel(requestId:string){setBusy(true);try{const r=await fetch('/api/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'cancel',requestId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not cancel request.');await load();setStatus('Data request cancelled.');}catch(e){setStatus(e instanceof Error?e.message:'Could not cancel request.');}finally{setBusy(false);}}

  return <main className="growthWorkspace">
    <section className="hero"><p className="eyebrow">Find the Right People</p><h1>Pie Data</h1><p className="sub">Build targeted audience and industry lists for the exact stage of your music business—fans, media, radio, booking, labels, film/TV, events, sponsors, and the people who can move the next step forward.</p></section>
    <section className="panel"><div className="controlGrid"><div className="statusBox"><small>PIE STAGE</small><strong>{level}</strong></div><div className="statusBox"><small>MONTHLY DATA CREDITS</small><strong>{existingBeta?'Beta':credits.toLocaleString()}</strong></div><div className="statusBox"><small>SAVED REQUESTS</small><strong>{stats.total}</strong></div><div className="statusBox"><small>DELIVERED RECORDS</small><strong>{stats.delivered.toLocaleString()}</strong></div></div><p style={{color:'#8e8f9f',fontSize:11,lineHeight:1.5,marginBottom:0}}>Pie Data only delivers licensed, permissioned, public-business, or otherwise lawfully sourced records. Pie preserves source provenance, refresh dates, suppression handling, and provider terms privately in the backend while customer-facing workflows remain Pie-branded. Sensitive personal data is excluded.</p></section>
    <section className="panel"><p className="eyebrow">Data Statistics</p><h2>Request Activity</h2><div className="controlGrid"><div className="statusBox"><small>TARGET LISTS</small><strong>{stats.lists}</strong></div><div className="statusBox"><small>MARKETS</small><strong>{stats.markets}</strong></div></div><div style={{display:'grid',gap:8,marginTop:12}}><small><strong>Top requested categories</strong></small>{stats.top.length?stats.top.map(([c,n])=><small key={c}>{c} · {n} request{n===1?'':'s'}</small>):<small>Save a request to begin tracking statistics.</small>}</div></section>
    <section className="panel"><p className="eyebrow">Build a Target List</p><div className="controlGrid"><label><span className="controlLabel">Genre / audience</span><select value={genre} onChange={e=>setGenre(e.target.value)}>{genreOptions.map(x=><option key={x}>{x}</option>)}</select></label><label><span className="controlLabel">Geography</span><select value={geo} onChange={e=>setGeo(e.target.value)}>{geoOptions.map(x=><option key={x}>{x}</option>)}</select></label></div></section>
    <section className="growthCardGrid">{categories.map(([icon,label,copy])=>{const active=selected.includes(label);return <article className="panel growthFeatureCard" key={label} style={{outline:active?'2px solid rgba(139,92,246,.75)':'none'}}><strong>{icon} {label}</strong><small>{copy}</small><button type="button" className="secondary" onClick={()=>toggle(label)}>{active?'✓ Added':'Add to Request'}</button></article>;})}</section>
    <section className="panel" style={{display:'grid',gap:10}}><p className="eyebrow">Data Request</p><strong>{selected.length?selectedLabels.join(' · '):'Choose one or more data categories above'}</strong><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Example: Contemporary Christian fans in Seattle and Portland; radio music directors; faith podcasts; venues under 1,500 capacity; booking contacts with verified business email." style={{minHeight:120}}/><button type="button" className="primary" disabled={!selected.length||busy} onClick={saveRequest}>{busy?'Saving…':'Save Data Request'}</button>{status&&<small>{status}</small>}</section>
    <section className="panel"><div className="songsSectionHead"><strong>Request History</strong><span>{requests.length}</span></div><div style={{display:'grid',gap:8,marginTop:10}}>{requests.length===0?<div className="statusBox">No Pie Data requests yet.</div>:requests.map(r=><article key={r.id} className="statusBox" style={{display:'grid',gap:5}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{r.categories.join(' · ')}</strong><small>{r.status}</small></div><small>{r.genre} · {r.geography} · {new Date(r.created_at).toLocaleString()}</small>{r.notes&&<small>{r.notes}</small>}<small>Pie Data delivered: {Number(r.delivered_count||0).toLocaleString()}</small>{!['fulfilled','cancelled'].includes(r.status)&&<button type="button" className="secondary" onClick={()=>cancel(r.id)} disabled={busy}>Cancel Request</button>}</article>)}</div></section>
    <section className="panel"><h2>Progressive Data Access</h2><div style={{display:'grid',gap:8}}><small><strong>Stage 3:</strong> starter audience, creator, podcast, press, and release-contact discovery.</small><small><strong>Stages 4–5:</strong> larger campaign lists, radio, planners, brands, and targeted market expansion.</small><small><strong>Stage 6:</strong> booking, venues, promoters, festivals, and touring-market data.</small><small><strong>Stage 7:</strong> national-scale industry, media, label, sponsor, and market data.</small><small><strong>Stage 8:</strong> international market, media, touring, label, rights, partner, and campaign data.</small></div></section>
  </main>;
}
