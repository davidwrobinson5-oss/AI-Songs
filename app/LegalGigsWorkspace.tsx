'use client';

import { useEffect, useMemo, useState } from 'react';

type Workspace = 'legal' | 'gigs';
type Props = { workspace: Workspace; onNavigate: (screen: string) => void };

type Item = {
  id: string;
  title: string;
  date: string;
  status: string;
  contact: string;
  location: string;
  amount: number;
  notes: string;
};

const legalCards: [string, string][] = [
  ['Contracts', 'Organize artist, band, label, publishing, management, booking, producer, featured-artist, contractor, vendor, brand, sync, distribution, and collaboration agreements.'],
  ['Entity + Governance', 'Track business entities, ownership, members, managers, operating agreements, registrations, annual filings, and important corporate records.'],
  ['Copyright + Registrations', 'Track songs, masters, artwork, videos, registrations, submission dates, registration numbers, deposits, ownership, and renewal or follow-up tasks.'],
  ['Trademark + Brand', 'Track artist names, logos, slogans, marks, classes, applications, registrations, renewal dates, specimens, and brand-use evidence.'],
  ['Disputes + Claims', 'Maintain a private issue log for disputes, takedowns, claims, notices, demand letters, missed obligations, evidence, deadlines, and counsel contacts.'],
  ['Legal Deadlines', 'Track option periods, termination windows, renewal dates, response deadlines, filing dates, notice requirements, and contract milestones.'],
  ['Insurance + Compliance', 'Organize liability coverage, event insurance, workers or contractor documents, permits, releases, waivers, privacy requirements, and compliance records.'],
  ['Counsel + Professionals', 'Keep attorneys, accountants, business managers, registered agents, insurers, and other professional contacts tied to the relevant matter.'],
  ['Signature + Evidence Vault', 'Store signed agreements, amendments, releases, approvals, permission emails, notices, invoices, registrations, and dated evidence in one matter record.'],
];

const gigCards: [string, string][] = [
  ['Gig Pipeline', 'Track leads, holds, offers, confirmed shows, declined dates, cancellations, completed gigs, promoter contacts, and next actions.'],
  ['Venue + Promoter', 'Store venue address, capacity, buyer/promoter, production contact, hospitality contact, phone, email, parking, green room, and venue notes.'],
  ['Offer + Deal Terms', 'Track guarantee, door split, bonuses, deposits, merch percentage, ticket allocation, settlement method, payment status, and special conditions.'],
  ['Show Schedule', 'Keep arrival, load-in, soundcheck, doors, support acts, set time, curfew, meet-and-greet, load-out, and departure times together.'],
  ['Setlist + Performance', 'Attach the approved setlist, keys, tempos, count-ins, backing tracks, charts, transitions, stage cues, and performance notes.'],
  ['Production + Stage', 'Track PA, monitors, IEMs, microphones, backline, power, stage size, input list, stage plot, lighting, video, and technical contacts.'],
  ['Hospitality + Guest List', 'Manage dressing room, food, drinks, passes, guest list, VIPs, media, photo access, credentials, and promoter-provided amenities.'],
  ['Merch + Settlement', 'Allocate merch inventory to the show, record venue cuts, gross sales, fees, card/cash totals, settlement, remaining stock, and payout.'],
  ['Travel + Lodging', 'Connect the gig to travel routing, hotels, vehicles, parking, crew movements, gear transport, and the next show.'],
  ['Post-Show Follow-up', 'Record attendance, revenue, merch, fan signups, contacts made, content captured, promoter feedback, expenses, lessons learned, and rebooking opportunity.'],
];

const legalStatuses = ['Draft', 'Review', 'Waiting on Other Party', 'Needs Signature', 'Signed', 'Active', 'Expiring', 'Closed'];
const gigStatuses = ['Lead', 'Hold', 'Offer', 'Confirmed', 'Completed', 'Cancelled', 'Declined'];

function todayString() { return new Date().toISOString().slice(0, 10); }

export default function LegalGigsWorkspace({ workspace, onNavigate }: Props) {
  const isLegal = workspace === 'legal';
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState(isLegal ? legalStatuses[0] : gigStatuses[0]);
  const [contact, setContact] = useState('');
  const [location, setLocation] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`pie-${workspace}-items-v1`);
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch { setItems([]); }
    setStatus(isLegal ? legalStatuses[0] : gigStatuses[0]);
  }, [workspace, isLegal]);

  function persist(next: Item[]) {
    setItems(next);
    try { localStorage.setItem(`pie-${workspace}-items-v1`, JSON.stringify(next)); } catch {}
  }

  function addItem() {
    if (!title.trim()) return;
    const numericAmount = Number(amount.replace(/[^0-9.-]/g, '')) || 0;
    persist([{ id: crypto.randomUUID(), title: title.trim(), date, status, contact: contact.trim(), location: location.trim(), amount: numericAmount, notes: notes.trim() }, ...items]);
    setTitle(''); setContact(''); setLocation(''); setAmount(''); setNotes('');
  }

  const gigSummary = useMemo(() => {
    if (isLegal) return null;
    const confirmed = items.filter((item) => item.status === 'Confirmed').length;
    const completed = items.filter((item) => item.status === 'Completed').length;
    const bookedValue = items.filter((item) => item.status === 'Confirmed' || item.status === 'Completed').reduce((sum, item) => sum + item.amount, 0);
    return { confirmed, completed, bookedValue };
  }, [items, isLegal]);

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">{isLegal ? 'Protect the Business' : 'Take the Stage'}</p>
        <h1>{isLegal ? 'Legal' : 'Gigs'}</h1>
        <p className="sub">{isLegal ? 'Keep contracts, registrations, deadlines, disputes, compliance records, counsel, and signed evidence organized around the music business. Pie can organize matters and documents, but it is not a substitute for legal advice from qualified counsel.' : 'Manage the full live-show workflow from lead and offer through confirmation, travel, production, performance, settlement, merch, fan capture, and rebooking.'}</p>
        {isLegal && <button type="button" className="primary" onClick={()=>{window.location.href='/contracts';}} style={{marginTop:12}}>⚖️ Open Contract Studio</button>}
      </section>

      {gigSummary && <section className="panel"><div className="controlGrid">
        <div className="statusBox"><small>CONFIRMED</small><strong>{gigSummary.confirmed}</strong></div>
        <div className="statusBox"><small>COMPLETED</small><strong>{gigSummary.completed}</strong></div>
        <div className="statusBox"><small>BOOKED VALUE</small><strong>${gigSummary.bookedValue.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div>
      </div></section>}

      <section className="panel">
        <p className="eyebrow">Quick Add</p>
        <h2>New {isLegal ? 'Legal Matter' : 'Gig'}</h2>
        <div style={{display:'grid',gap:10}}>
          <input value={title} onChange={(event)=>setTitle(event.target.value)} placeholder={isLegal ? 'Producer agreement, trademark filing, dispute…' : 'Venue / event / festival name…'} />
          <div className="controlGrid">
            <label><span className="controlLabel">{isLegal ? 'Deadline / date' : 'Show date'}</span><input type="date" value={date} onChange={(event)=>setDate(event.target.value)} /></label>
            <label><span className="controlLabel">Status</span><select value={status} onChange={(event)=>setStatus(event.target.value)}>{(isLegal?legalStatuses:gigStatuses).map((item)=><option key={item}>{item}</option>)}</select></label>
            <label><span className="controlLabel">{isLegal ? 'Attorney / contact' : 'Promoter / buyer'}</span><input value={contact} onChange={(event)=>setContact(event.target.value)} placeholder="Name / company" /></label>
            {!isLegal && <label><span className="controlLabel">Venue / city</span><input value={location} onChange={(event)=>setLocation(event.target.value)} placeholder="Venue · Seattle, WA" /></label>}
            {!isLegal && <label><span className="controlLabel">Guarantee / expected pay</span><input inputMode="decimal" value={amount} onChange={(event)=>setAmount(event.target.value)} placeholder="$0.00" /></label>}
          </div>
          <textarea value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder={isLegal ? 'Parties, issue, obligations, documents, next action, notice requirements…' : 'Load-in, soundcheck, set time, deal terms, production, hospitality, merch, travel…'} style={{minHeight:110}} />
          <button type="button" className="primary" onClick={addItem}>＋ Add {isLegal ? 'Matter' : 'Gig'}</button>
        </div>
      </section>

      {items.length > 0 && <section className="panel">
        <div className="songsSectionHead"><strong>{isLegal ? 'Matters' : 'Gig Pipeline'}</strong><span>{items.length}</span></div>
        <div style={{display:'grid',gap:8}}>{items.slice(0,15).map((item)=><article key={item.id} className="statusBox" style={{display:'grid',gap:5}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.title}</strong><small>{item.date}</small></div>
          <small>{item.status}{item.contact ? ` · ${item.contact}` : ''}{item.location ? ` · ${item.location}` : ''}</small>
          {!isLegal && item.amount > 0 && <small>${item.amount.toLocaleString(undefined,{maximumFractionDigits:2})}</small>}
          {item.notes && <small>{item.notes}</small>}
          <button type="button" className="secondary" onClick={()=>persist(items.filter((entry)=>entry.id!==item.id))}>Remove</button>
        </article>)}</div>
      </section>}

      <section className="growthCardGrid">
        {(isLegal ? legalCards : gigCards).map(([cardTitle,copy])=><article className="panel growthFeatureCard" key={cardTitle}><strong>{cardTitle}</strong><small>{copy}</small>{isLegal&&cardTitle==='Contracts'?<button type="button" className="secondary" onClick={()=>{window.location.href='/contracts';}}>Open Contract Studio</button>:<button type="button" className="secondary">Open</button>}</article>)}
      </section>

      <section className="panel">
        <h2>Connected Pie Workflows</h2>
        <div className="mixButtons">
          {isLegal ? <>
            <button type="button" className="secondary" onClick={()=>{window.location.href='/contracts';}}>Contract Studio</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('licensing')}>Licensing</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('business')}>Business</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('accounting')}>Accounting</button>
          </> : <>
            <button type="button" className="secondary" onClick={()=>onNavigate('calendar')}>Calendar</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('travel')}>Travel</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('band')}>Band</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('merch')}>Merch</button>
            <button type="button" className="secondary" onClick={()=>onNavigate('marketing')}>Marketing</button>
          </>}
        </div>
      </section>
    </main>
  );
}
