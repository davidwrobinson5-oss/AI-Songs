'use client';

import { useMemo, useState } from 'react';
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

const genreOptions = ['All genres','Pop','Hip-Hop / Rap','R&B / Soul','Christian / Gospel','Rock','Alternative','Country','Electronic / Dance','Jazz','Latin','Indie','Other'];
const geoOptions = ['Local','Regional','United States','Canada','United Kingdom','Europe','Latin America','Asia-Pacific','International'];

function creditsForLevel(level: number) {
  return [0,0,25,100,250,500,1000,5000,25000][Math.max(0, Math.min(8, level))] || 0;
}

export default function DataWorkspace() {
  const { user } = useUser();
  const publicMetadata = (user?.publicMetadata || {}) as Record<string, unknown>;
  const unsafeMetadata = (user?.unsafeMetadata || {}) as Record<string, unknown>;
  const existingBeta = !Boolean(publicMetadata.piePlanLevel || publicMetadata.pieOnboardingCompleted || unsafeMetadata.pieOnboardingStartedAt);
  const level = existingBeta ? 8 : Math.max(1, Number(publicMetadata.piePlanLevel || 1));
  const credits = creditsForLevel(level);
  const [selected, setSelected] = useState<string[]>([]);
  const [genre, setGenre] = useState('All genres');
  const [geo, setGeo] = useState('Local');
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const selectedLabels = useMemo(() => categories.filter(([,label])=>selected.includes(label)).map(([,label])=>label), [selected]);

  function toggle(label: string) {
    setSaved(false);
    setSelected((current)=>current.includes(label) ? current.filter((item)=>item!==label) : [...current,label]);
  }

  function saveRequest() {
    const request = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), genre, geo, categories: selectedLabels, notes };
    try {
      const raw = localStorage.getItem('pie-data-requests-v1');
      const list = raw ? JSON.parse(raw) : [];
      localStorage.setItem('pie-data-requests-v1', JSON.stringify([request, ...(Array.isArray(list)?list:[])]));
    } catch {}
    setSaved(true);
  }

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">Find the Right People</p>
        <h1>Data</h1>
        <p className="sub">Build targeted audience and industry lists for the exact stage of your music business—fans, media, radio, booking, labels, film/TV, events, sponsors, and the people who can move the next step forward.</p>
      </section>

      <section className="panel">
        <div className="controlGrid">
          <div className="statusBox"><small>PIE STAGE</small><strong>{level}</strong></div>
          <div className="statusBox"><small>MONTHLY DATA CREDITS</small><strong>{existingBeta ? 'Beta' : credits.toLocaleString()}</strong></div>
          <div className="statusBox"><small>SELECTED LISTS</small><strong>{selected.length}</strong></div>
        </div>
        <p style={{color:'#8e8f9f',fontSize:11,lineHeight:1.5,marginBottom:0}}>Data access expands with the subscription level. Pie should use licensed, permissioned, public-business, or otherwise lawfully sourced records and respect opt-outs, applicable privacy laws, and provider terms. Sensitive personal data should not be sold through this workspace.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">Build a Target List</p>
        <div className="controlGrid">
          <label><span className="controlLabel">Genre / audience</span><select value={genre} onChange={(e)=>setGenre(e.target.value)}>{genreOptions.map((item)=><option key={item}>{item}</option>)}</select></label>
          <label><span className="controlLabel">Geography</span><select value={geo} onChange={(e)=>setGeo(e.target.value)}>{geoOptions.map((item)=><option key={item}>{item}</option>)}</select></label>
        </div>
      </section>

      <section className="growthCardGrid">
        {categories.map(([icon,label,copy])=>{
          const active = selected.includes(label);
          return <article className="panel growthFeatureCard" key={label} style={{outline:active?'2px solid rgba(139,92,246,.75)':'none'}}>
            <strong>{icon} {label}</strong>
            <small>{copy}</small>
            <button type="button" className="secondary" onClick={()=>toggle(label)}>{active?'✓ Added':'Add to Request'}</button>
          </article>;
        })}
      </section>

      <section className="panel" style={{display:'grid',gap:10}}>
        <p className="eyebrow">Data Request</p>
        <strong>{selected.length ? selectedLabels.join(' · ') : 'Choose one or more data categories above'}</strong>
        <textarea value={notes} onChange={(e)=>{setNotes(e.target.value);setSaved(false);}} placeholder="Example: Contemporary Christian fans in Seattle and Portland; radio music directors; faith podcasts; venues under 1,500 capacity; booking contacts with verified business email." style={{minHeight:120}} />
        <button type="button" className="primary" disabled={!selected.length} onClick={saveRequest}>{saved?'✓ Request Saved':'Save Data Request'}</button>
      </section>

      <section className="panel">
        <h2>Progressive Data Access</h2>
        <div style={{display:'grid',gap:8}}>
          <small><strong>Stage 3:</strong> starter audience, creator, podcast, press, and release-contact discovery.</small>
          <small><strong>Stages 4–5:</strong> larger campaign lists, radio, planners, brands, and targeted market expansion.</small>
          <small><strong>Stage 6:</strong> booking, venues, promoters, festivals, and touring-market data.</small>
          <small><strong>Stage 7:</strong> national-scale industry, media, label, sponsor, and market data.</small>
          <small><strong>Stage 8:</strong> international market, media, touring, label, rights, partner, and campaign data.</small>
        </div>
      </section>
    </main>
  );
}
