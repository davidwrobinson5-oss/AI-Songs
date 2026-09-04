'use client';

import { useEffect, useMemo, useState } from 'react';

type Workspace = 'calendar' | 'travel' | 'business' | 'accounting';

type Props = {
  workspace: Workspace;
  onNavigate: (screen: string) => void;
};

type RecordItem = {
  id: string;
  title: string;
  detail: string;
  date: string;
  amount?: number;
  kind?: string;
};

const workspaceContent: Record<Workspace, {
  eyebrow: string;
  title: string;
  intro: string;
  action: string;
  placeholder: string;
  cards: [string, string][];
}> = {
  calendar: {
    eyebrow: 'Run the Schedule',
    title: 'Calendar',
    intro: 'Put releases, writing sessions, rehearsals, studio time, gigs, travel, marketing, licensing deadlines, meetings, and follow-ups on one Pie calendar.',
    action: 'Event',
    placeholder: 'Release day, rehearsal, studio session, meeting…',
    cards: [
      ['Unified Music Calendar', 'See releases, writing sessions, studio bookings, rehearsals, gigs, content drops, licensing deadlines, travel, and business meetings together.'],
      ['Release Timelines', 'Work backward from a release date and schedule mastering, artwork, distribution, video, marketing, press, fan outreach, and launch-day tasks.'],
      ['Band + Team Scheduling', 'Coordinate member availability, rehearsals, studio sessions, shoots, interviews, meetings, and shared deadlines.'],
      ['Reminders + Follow-ups', 'Track callbacks, emails, payments, license responses, venue holds, deliverables, and recurring follow-up dates.'],
      ['Google Calendar Connection', 'Planned integration point for syncing selected Pie events with Google Calendar while keeping music-specific project context in Pie.'],
      ['Day / Week / Month Views', 'Move between a fast mobile agenda and broader weekly or monthly planning views.'],
    ],
  },
  travel: {
    eyebrow: 'Move the Team',
    title: 'Travel',
    intro: 'Plan artist and band travel around shows, sessions, shoots, meetings, tours, and personal creative trips without losing the music project context.',
    action: 'Trip',
    placeholder: 'Seattle → Los Angeles · video shoot…',
    cards: [
      ['Trip Planner', 'Store destination, purpose, travelers, dates, confirmation numbers, contacts, notes, and the Pie project connected to the trip.'],
      ['Flights + Hotels', 'Organize flight, hotel, rental car, train, rideshare, parking, check-in, cancellation, and loyalty details.'],
      ['Tour Routing', 'Plan show-to-show routing, drive times, load-in, soundcheck, doors, set time, curfew, lodging, and next-day travel.'],
      ['Venue + Local Logistics', 'Keep venue contacts, addresses, parking, green room, hospitality, backline, merch, security, and local transportation details.'],
      ['Crew + Gear', 'Track who is traveling, instruments, cases, checked baggage, carry-ons, rentals, carnets, power needs, and critical gear.'],
      ['Travel Budget + Receipts', 'Estimate transportation, lodging, food, per diem, gear, parking, and miscellaneous costs, then hand receipts into Accounting.'],
    ],
  },
  business: {
    eyebrow: 'Run the Company',
    title: 'Business',
    intro: 'Give Pie a business operating center for the artist, band, label, production company, or creative venture behind the music.',
    action: 'Business Item',
    placeholder: 'New deal, task, vendor, goal, contract…',
    cards: [
      ['Business Dashboard', 'Track priorities, deadlines, deals, projects, open decisions, revenue opportunities, expenses, and key operating numbers.'],
      ['Deals + Contracts', 'Organize label, publishing, distribution, management, booking, brand, sync, producer, contractor, vendor, and collaboration agreements.'],
      ['Vendors + Partners', 'Manage studios, engineers, photographers, video teams, designers, manufacturers, venues, agencies, lawyers, accountants, and other service providers.'],
      ['Merch + Products', 'Plan products, suppliers, unit costs, pricing, inventory, orders, fulfillment, margins, and campaign tie-ins.'],
      ['Team + Contractors', 'Track roles, responsibilities, rates, assignments, deliverables, approvals, onboarding information, and payment status.'],
      ['Goals + KPIs', 'Set release, audience, revenue, catalog, touring, content, fan-growth, licensing, and operational targets with measurable checkpoints.'],
    ],
  },
  accounting: {
    eyebrow: 'Know the Numbers',
    title: 'Accounting',
    intro: 'Track the money behind Pie projects: income, expenses, invoices, bills, royalties, splits, budgets, receipts, taxes, and profitability by song, release, campaign, or tour.',
    action: 'Transaction',
    placeholder: 'Studio invoice, streaming royalty, merch sale…',
    cards: [
      ['Income + Expenses', 'Categorize revenue and spending by song, release, tour, campaign, client, vendor, and business entity.'],
      ['Invoices + Bills', 'Create and track money owed to you and money you owe, with due dates, payment status, contacts, and linked contracts.'],
      ['Royalties + Splits', 'Reconcile incoming royalties against writer, producer, performer, publisher, master, collaborator, and recoupment obligations.'],
      ['Budgets + Profitability', 'Compare planned versus actual costs and revenue for songs, videos, releases, tours, marketing campaigns, and merchandise.'],
      ['Receipts + Tax Records', 'Keep receipts, business purpose, categories, mileage/travel notes, tax documents, and supporting records together.'],
      ['P&L + Cash Flow', 'Build project and business-level profit-and-loss, cash-flow, payable, receivable, and runway views once financial connections are enabled.'],
    ],
  },
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export default function OperationsWorkspaces({ workspace, onNavigate }: Props) {
  const content = workspaceContent[workspace];
  const [items, setItems] = useState<RecordItem[]>([]);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [date, setDate] = useState(todayString());
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState(workspace === 'accounting' ? 'Expense' : '');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`pie-ops-${workspace}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setItems(Array.isArray(parsed) ? parsed : []);
    } catch {
      setItems([]);
    }
    setKind(workspace === 'accounting' ? 'Expense' : '');
  }, [workspace]);

  function saveItems(next: RecordItem[]) {
    setItems(next);
    try { localStorage.setItem(`pie-ops-${workspace}`, JSON.stringify(next)); } catch {}
  }

  function addItem() {
    if (!title.trim()) return;
    const numericAmount = amount.trim() ? Number(amount.replace(/[^0-9.-]/g, '')) : undefined;
    const item: RecordItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      detail: detail.trim(),
      date,
      kind: kind || undefined,
      amount: Number.isFinite(numericAmount) ? numericAmount : undefined,
    };
    saveItems([item, ...items]);
    setTitle('');
    setDetail('');
    setAmount('');
  }

  const accountingSummary = useMemo(() => {
    if (workspace !== 'accounting') return null;
    let income = 0;
    let expenses = 0;
    for (const item of items) {
      const value = Number(item.amount || 0);
      if (item.kind === 'Income') income += value;
      else expenses += value;
    }
    return { income, expenses, net: income - expenses };
  }, [items, workspace]);

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="sub">{content.intro}</p>
      </section>

      {accountingSummary && (
        <section className="panel">
          <div className="controlGrid">
            <div className="statusBox"><small>INCOME</small><strong>${accountingSummary.income.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div className="statusBox"><small>EXPENSES</small><strong>${accountingSummary.expenses.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
            <div className="statusBox"><small>NET</small><strong>${accountingSummary.net.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
          </div>
        </section>
      )}

      <section className="panel">
        <p className="eyebrow">Quick Add</p>
        <h2>New {content.action}</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={content.placeholder} />
          <div className="controlGrid">
            <label><span className="controlLabel">Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
            {workspace === 'accounting' && <label><span className="controlLabel">Type</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option>Expense</option><option>Income</option></select></label>}
            {workspace === 'accounting' && <label><span className="controlLabel">Amount</span><input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="$0.00" /></label>}
          </div>
          <textarea value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Notes, people, location, confirmation numbers, linked project, next action…" style={{ minHeight: 100 }} />
          <button type="button" className="primary" onClick={addItem}>＋ Add {content.action}</button>
        </div>
      </section>

      {items.length > 0 && (
        <section className="panel">
          <div className="songsSectionHead"><strong>{workspace === 'calendar' ? 'Upcoming' : workspace === 'travel' ? 'Trips' : workspace === 'business' ? 'Business Items' : 'Recent Transactions'}</strong><span>{items.length}</span></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {items.slice(0, 12).map((item) => (
              <article key={item.id} className="statusBox" style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{item.title}</strong><small>{item.date}</small></div>
                {item.kind && <small>{item.kind}{typeof item.amount === 'number' ? ` · $${item.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}</small>}
                {item.detail && <small>{item.detail}</small>}
                <button type="button" className="secondary" onClick={() => saveItems(items.filter((entry) => entry.id !== item.id))}>Remove</button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="growthCardGrid">
        {content.cards.map(([cardTitle, copy]) => (
          <article className="panel growthFeatureCard" key={cardTitle}>
            <strong>{cardTitle}</strong>
            <small>{copy}</small>
            <button className="secondary" type="button">Open</button>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Connected Pie Workflows</h2>
        <div className="mixButtons">
          <button className="secondary" type="button" onClick={() => onNavigate('songs')}>Songs</button>
          <button className="secondary" type="button" onClick={() => onNavigate('marketing')}>Marketing</button>
          <button className="secondary" type="button" onClick={() => onNavigate('band')}>Band</button>
          <button className="secondary" type="button" onClick={() => onNavigate('licensing')}>Licensing</button>
        </div>
      </section>
    </main>
  );
}
