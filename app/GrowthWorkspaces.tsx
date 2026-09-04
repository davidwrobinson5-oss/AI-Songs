'use client';

import { useEffect, useMemo, useState } from 'react';

type SponsorOpportunity = {
  id: string;
  brand: string;
  partnership: string;
  status: string;
  value?: number;
};

type Workspace = 'marketing' | 'band' | 'licensing';

type Props = {
  workspace: Workspace;
  onNavigate: (screen: string) => void;
};

const marketingCards = [
  ['Campaign Builder', 'Choose a song, audience, goal, budget, channels, launch date, and call-to-action. Pie turns it into a coordinated release plan.'],
  ['Content Calendar', 'Plan teaser clips, lyric posts, behind-the-scenes, countdowns, release-day content, follow-ups, contests, and giveaways.'],
  ['Brand Library', 'Keep approved photos, video references, logos, colors, artwork, bios, press copy, and visual references together.'],
  ['Distribution', 'Prepare release metadata and track delivery tasks for social channels and distributor services without losing the marketing plan around them.'],
  ['Fan Database', 'Track opt-in email, phone, text, mailing, messages, notes, segments, superfans, and follow-up schedules.'],
  ['Business Contacts', 'Build a music-business CRM for venues, promoters, labels, publishers, sync supervisors, music supervisors, brands, agencies, media, radio, playlist contacts, distributors, managers, booking contacts, collaborators, and vendors. Store company, role, email, phone, social links, location, relationship status, tags, notes, last contact, next follow-up, and opportunities.'],
  ['Endorsements + Sponsorships', 'Build brand partnerships, endorsement proposals, sponsored content, event support, product placement, affiliate offers, and long-term ambassador relationships.'],
  ['Performance', 'Score campaigns by reach, saves, clicks, follows, streams, conversion, fan growth, and cost per result.'],
];

const bandCards = [
  ['Band Room', 'A shared space for invited members to contribute ideas, lyrics, riffs, recordings, mixes, comments, and references.'],
  ['Song Tasks', 'Assign vocals, guitar, bass, drums, keys, production, artwork, rehearsal, approvals, and deadlines.'],
  ['Versions + Feedback', 'Keep every contribution attached to the correct song and version. Compare takes without overwriting anyone else’s work.'],
  ['Setlists + Rehearsal', 'Build live setlists, rehearsal notes, keys, tempos, count-ins, charts, and performance cues.'],
  ['Member Permissions', 'Invite individual Pie accounts and control who can view, contribute, approve, publish, or manage the band.'],
  ['Decision Log', 'Record final creative decisions so the band knows which lyric, arrangement, mix, artwork, or master was approved.'],
];

const licensingCards = [
  ['Rights Split Sheet', 'Track writers, composers, producers, performers, publishers, ownership percentages, PROs, and approval status.'],
  ['Master Ownership', 'Record who owns the recording, dates, contributors, work-for-hire status, and master-use permissions.'],
  ['Use Existing Music', 'Bring another creator’s song, beat, loop, recording, sample, stem, or instrumental into a Pie project and track the source, rights owners, intended use, territories, term, fees, approvals, and supporting documents before release.'],
  ['Cover Opportunities', 'Create a list of songs you want to cover and, later, discover songs whose writers, publishers, or owners are open to covers, reinterpretations, remixes, collaborations, or other licensed uses. Track key, range, arrangement idea, contact, terms, request status, and release plan.'],
  ['Cover + Remix Clearance', 'Organize the permissions and evidence connected to a cover, remix, interpolation, adaptation, or derivative-style project. Pie can track composition rights, master-use rights when an existing recording is involved, approval contacts, requests, responses, and clearance status without treating an unfinished request as permission.'],
  ['Sample + Interpolation Log', 'Document samples, references, interpolations, third-party loops, licenses, clearance status, and source files.'],
  ['Sync Readiness', 'Store instrumental, clean, explicit, stems, lyrics, BPM, key, mood, themes, contact, ownership, and one-stop status.'],
  ['License Requests', 'Track film, TV, ad, game, creator, venue, brand, cover, remix, sample, and third-party music requests from inquiry through quote, approval, contract, and payment.'],
  ['Evidence Vault', 'Keep dated drafts, recordings, lyric versions, stems, score exports, registrations, contracts, permission emails, licenses, and originality reports together.'],
];

export default function GrowthWorkspaces({ workspace, onNavigate }: Props) {
  const [notes, setNotes] = useState<Record<Workspace, string>>({ marketing: '', band: '', licensing: '' });
  const [sponsors, setSponsors] = useState<SponsorOpportunity[]>([]);
  const [brand, setBrand] = useState('');
  const [partnership, setPartnership] = useState('Sponsorship');
  const [sponsorStatus, setSponsorStatus] = useState('Prospect');
  const [sponsorValue, setSponsorValue] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pie-marketing-sponsors-v1');
      const parsed = raw ? JSON.parse(raw) : [];
      setSponsors(Array.isArray(parsed) ? parsed : []);
    } catch {
      setSponsors([]);
    }
  }, []);

  function saveSponsors(next: SponsorOpportunity[]) {
    setSponsors(next);
    try { localStorage.setItem('pie-marketing-sponsors-v1', JSON.stringify(next)); } catch {}
  }

  function addSponsor() {
    if (!brand.trim()) return;
    const numericValue = sponsorValue.trim() ? Number(sponsorValue.replace(/[^0-9.-]/g, '')) : undefined;
    saveSponsors([{
      id: crypto.randomUUID(),
      brand: brand.trim(),
      partnership,
      status: sponsorStatus,
      value: Number.isFinite(numericValue) ? numericValue : undefined,
    }, ...sponsors]);
    setBrand('');
    setSponsorValue('');
  }
  const content = useMemo(() => {
    if (workspace === 'marketing') return { eyebrow: 'Grow the Song', title: 'Marketing', intro: 'Turn finished songs into coordinated campaigns, distribution plans, content, fan follow-up, business relationships, and measurable growth.', cards: marketingCards };
    if (workspace === 'band') return { eyebrow: 'Create Together', title: 'Band', intro: 'Give invited collaborators one shared place to build on each other’s work while keeping songs, versions, ownership, and decisions organized.', cards: bandCards };
    return { eyebrow: 'Protect + Place', title: 'Licensing', intro: 'Manage your own rights and also organize legitimate opportunities to use, cover, remix, sample, adapt, or collaborate around music owned by other people.', cards: licensingCards };
  }, [workspace]);

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="sub">{content.intro}</p>
      </section>

      <section className="panel growthQuickActions">
        <div className="mixButtons">
          <button className="primary" type="button">＋ New {workspace === 'band' ? 'Band Project' : workspace === 'marketing' ? 'Campaign' : 'Rights / Clearance Record'}</button>
          <button className="secondary" type="button" onClick={() => onNavigate('songs')}>Choose From Songs</button>
        </div>
      </section>

      <section className="growthCardGrid">
        {content.cards.map(([title, copy]) => (
          <article className="panel growthFeatureCard" key={title}>
            <strong>{title}</strong>
            <small>{copy}</small>
            <button className="secondary" type="button">Open</button>
          </article>
        ))}
      </section>

      {workspace === 'marketing' && (
        <section className="panel" style={{ display: 'grid', gap: 12 }}>
          <div>
            <p className="eyebrow">Partnership Revenue</p>
            <h2>Endorsements + Sponsorships</h2>
            <p className="sub">Track brands, deal types, pipeline status, and projected value from first conversation through activation.</p>
          </div>
          <div className="controlGrid">
            <label><span className="controlLabel">Brand or partner</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Brand, agency, or sponsor" /></label>
            <label><span className="controlLabel">Partnership</span><select value={partnership} onChange={(event) => setPartnership(event.target.value)}><option>Sponsorship</option><option>Endorsement</option><option>Brand Ambassador</option><option>Sponsored Content</option><option>Product Placement</option><option>Affiliate</option></select></label>
            <label><span className="controlLabel">Status</span><select value={sponsorStatus} onChange={(event) => setSponsorStatus(event.target.value)}><option>Prospect</option><option>Contacted</option><option>Pitching</option><option>Negotiating</option><option>Active</option><option>Closed</option></select></label>
            <label><span className="controlLabel">Projected value</span><input inputMode="decimal" value={sponsorValue} onChange={(event) => setSponsorValue(event.target.value)} placeholder="$0.00" /></label>
          </div>
          <button className="primary" type="button" disabled={!brand.trim()} onClick={addSponsor}>＋ Add Opportunity</button>
          {sponsors.length > 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              {sponsors.map((sponsor) => (
                <article className="statusBox" key={sponsor.id} style={{ display: 'grid', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{sponsor.brand}</strong><small>{sponsor.status}</small></div>
                  <small>{sponsor.partnership}{typeof sponsor.value === 'number' ? ` · ${sponsor.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}</small>
                  <button className="secondary" type="button" onClick={() => saveSponsors(sponsors.filter((item) => item.id !== sponsor.id))}>Remove</button>
                </article>
              ))}
            </div>
          ) : <small>No opportunities yet. Add the first brand or sponsor above.</small>}
        </section>
      )}

      <section className="panel">
        <h2>{workspace === 'marketing' ? 'Campaign Notes' : workspace === 'band' ? 'Band Notes' : 'Licensing Notes'}</h2>
        <textarea
          value={notes[workspace]}
          onChange={(event) => setNotes((current) => ({ ...current, [workspace]: event.target.value }))}
          placeholder="Capture ideas, decisions, contacts, deadlines, rights questions, permission requests, or next actions here…"
          style={{ minHeight: 180 }}
        />
      </section>
    </main>
  );
}
