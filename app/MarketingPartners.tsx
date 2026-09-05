'use client';

import { useEffect, useMemo, useState } from 'react';

type PartnerStatus = { similarweb: boolean; apollo: boolean; aLeads: boolean; audienceLab: boolean; vibe: boolean; runway: boolean };
type ProviderKey = 'apollo' | 'aLeads' | 'audienceLab';
type ProviderMetrics = { spend: string; customers: string };
type ProviderMetricsMap = Record<ProviderKey, ProviderMetrics>;

const EMPTY_STATUS: PartnerStatus = { similarweb: false, apollo: false, aLeads: false, audienceLab: false, vibe: false, runway: false };
const EMPTY_METRICS: ProviderMetricsMap = {
  apollo: { spend: '', customers: '' },
  aLeads: { spend: '', customers: '' },
  audienceLab: { spend: '', customers: '' },
};

function money(value: number) { return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); }
function parseNumber(value: string) { const parsed = Number(value.replace(/[^0-9.-]/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
function ProviderBadge({ ready }: { ready: boolean }) { return <small>{ready ? 'API READY' : 'NEEDS API / LICENSE'}</small>; }

export default function MarketingPartners() {
  const [status, setStatus] = useState<PartnerStatus>(EMPTY_STATUS);
  const [metrics, setMetrics] = useState<ProviderMetricsMap>(EMPTY_METRICS);
  const [domain, setDomain] = useState('');
  const [similarwebLoading, setSimilarwebLoading] = useState(false);
  const [similarwebError, setSimilarwebError] = useState('');
  const [similarwebResult, setSimilarwebResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/marketing/partners/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to read partner status')))
      .then((data) => setStatus({ ...EMPTY_STATUS, ...data }))
      .catch(() => setStatus(EMPTY_STATUS));
    try {
      const raw = localStorage.getItem('pie-marketing-data-provider-metrics-v2');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed) setMetrics({ ...EMPTY_METRICS, ...parsed });
    } catch {}
  }, []);

  function updateMetrics(provider: ProviderKey, field: keyof ProviderMetrics, value: string) {
    setMetrics((current) => {
      const next = { ...current, [provider]: { ...current[provider], [field]: value } };
      try { localStorage.setItem('pie-marketing-data-provider-metrics-v2', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const economics = useMemo(() => {
    const rows = (Object.keys(metrics) as ProviderKey[]).map((provider) => {
      const spend = parseNumber(metrics[provider].spend);
      const customers = parseNumber(metrics[provider].customers);
      return { provider, cac: customers > 0 ? spend / customers : null };
    });
    const available = rows.filter((row): row is { provider: ProviderKey; cac: number } => row.cac !== null);
    const winner = available.length >= 2 ? available.reduce((best, row) => row.cac < best.cac ? row : best).provider : null;
    return { rows, winner };
  }, [metrics]);

  const providerLabel: Record<ProviderKey, string> = { apollo: 'Apollo', aLeads: 'A-Leads', audienceLab: 'AudienceLab' };

  async function analyzeDomain() {
    if (!domain.trim()) return;
    setSimilarwebLoading(true); setSimilarwebError(''); setSimilarwebResult(null);
    try {
      const response = await fetch(`/api/marketing/similarweb?domain=${encodeURIComponent(domain.trim())}&country=us`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Similarweb request failed');
      setSimilarwebResult(data);
    } catch (error) {
      setSimilarwebError(error instanceof Error ? error.message : 'Similarweb request failed');
    } finally { setSimilarwebLoading(false); }
  }

  const visitSeries = Array.isArray(similarwebResult?.visits) ? similarwebResult.visits : Array.isArray(similarwebResult?.data?.visits) ? similarwebResult.data.visits : [];
  const latestVisit = visitSeries.length > 0 ? visitSeries[visitSeries.length - 1] : null;
  const latestVisitValue = typeof latestVisit === 'number' ? latestVisit : Number(latestVisit?.visits ?? latestVisit?.value ?? latestVisit?.count ?? NaN);

  return <>
    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <div><p className="eyebrow">Audience + Competitive Intelligence</p><h2>Similarweb</h2><p className="sub">Research websites, competitors, traffic, audience behavior, and campaign opportunities without leaving the Marketing workspace.</p></div>
      <div className="statusBox" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><strong>Similarweb API</strong><ProviderBadge ready={status.similarweb} /></div>
      <div className="controlGrid"><label><span className="controlLabel">Website or competitor domain</span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" /></label></div>
      <div className="mixButtons"><button className="primary" type="button" onClick={analyzeDomain} disabled={!domain.trim() || similarwebLoading || !status.similarweb}>{similarwebLoading ? 'Analyzing…' : 'Analyze Website'}</button><a className="secondary" href="https://www.similarweb.com/" target="_blank" rel="noreferrer">Open Similarweb</a></div>
      {!status.similarweb && <small>Add SIMILARWEB_API_KEY to the Pie preview environment to turn on live website analysis.</small>}
      {similarwebError && <div className="statusBox"><small>{similarwebError}</small></div>}
      {similarwebResult && <div className="controlGrid"><div className="statusBox"><small>DOMAIN</small><strong>{similarwebResult.domain || domain}</strong></div><div className="statusBox"><small>LATEST VISITS</small><strong>{Number.isFinite(latestVisitValue) ? Math.round(latestVisitValue).toLocaleString() : 'Data returned'}</strong></div><div className="statusBox"><small>COUNTRY</small><strong>{String(similarwebResult.country || 'us').toUpperCase()}</strong></div><div className="statusBox"><small>DATA POINTS</small><strong>{visitSeries.length || 'Available'}</strong></div></div>}
    </section>

    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <div><p className="eyebrow">Pie Data Engine</p><h2>Apollo + A-Leads + AudienceLab</h2><p className="sub">Three provider lanes behind one Pie-branded data experience. Compare them using real cost per acquired customer, data quality, freshness, fit, and delivery speed instead of committing Pie to a single vendor.</p></div>
      <div className="growthCardGrid">
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Apollo</strong><ProviderBadge ready={status.apollo} /></div><small>Broad B2B prospecting and outreach baseline. Useful where company, title, contact, and GTM workflow coverage matters.</small><a className="secondary" href="https://www.apollo.io/" target="_blank" rel="noreferrer">Open Apollo</a></article>
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>A-Leads</strong><ProviderBadge ready={status.aLeads} /></div><small>Second contact-data lane for verified business contacts and cost comparison against Apollo.</small><a className="secondary" href="https://www.a-leads.co/" target="_blank" rel="noreferrer">Open A-Leads</a></article>
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>AudienceLab DaaS</strong><ProviderBadge ready={status.audienceLab} /></div><small>Third lane for B2B/B2C audience building, enrichment, intent, identity resolution, API/webhook delivery, and raw-data workflows. Use DaaS Mode when Pie has the required white-label rights.</small><a className="secondary" href="https://audiencelab.io/" target="_blank" rel="noreferrer">Open AudienceLab</a></article>
      </div>

      <div className="controlGrid">
        <label><span className="controlLabel">Apollo spend</span><input inputMode="decimal" value={metrics.apollo.spend} onChange={(event) => updateMetrics('apollo','spend',event.target.value)} placeholder="$ spent" /></label>
        <label><span className="controlLabel">Apollo customers won</span><input inputMode="numeric" value={metrics.apollo.customers} onChange={(event) => updateMetrics('apollo','customers',event.target.value)} placeholder="0" /></label>
        <label><span className="controlLabel">A-Leads spend</span><input inputMode="decimal" value={metrics.aLeads.spend} onChange={(event) => updateMetrics('aLeads','spend',event.target.value)} placeholder="$ spent" /></label>
        <label><span className="controlLabel">A-Leads customers won</span><input inputMode="numeric" value={metrics.aLeads.customers} onChange={(event) => updateMetrics('aLeads','customers',event.target.value)} placeholder="0" /></label>
        <label><span className="controlLabel">AudienceLab spend</span><input inputMode="decimal" value={metrics.audienceLab.spend} onChange={(event) => updateMetrics('audienceLab','spend',event.target.value)} placeholder="$ spent" /></label>
        <label><span className="controlLabel">AudienceLab customers won</span><input inputMode="numeric" value={metrics.audienceLab.customers} onChange={(event) => updateMetrics('audienceLab','customers',event.target.value)} placeholder="0" /></label>
      </div>
      <div className="controlGrid">
        {economics.rows.map((row) => <div className="statusBox" key={row.provider}><small>{providerLabel[row.provider].toUpperCase()} COST / CUSTOMER</small><strong>{row.cac === null ? '—' : money(row.cac)}</strong></div>)}
        <div className="statusBox"><small>LOWER OBSERVED CAC</small><strong>{economics.winner ? providerLabel[economics.winner] : 'Run at least two'}</strong></div>
      </div>
      <small>Pie should normalize provider records into one internal schema, preserve provider/source provenance, deduplicate identities, score freshness and confidence, apply suppression rules, and route requests to the best provider or combination of providers for each use case.</small>
    </section>

    <section className="panel" style={{ display: 'grid', gap: 10 }}>
      <div><p className="eyebrow">White-Label Data Layer</p><h2>AudienceLab DaaS Mode → Pie Data</h2><p className="sub">Architecturally, Pie can present the data tools as a native Pie product while AudienceLab operates behind the provider abstraction. Client-facing screens, subaccounts, audience builders, data delivery, and reporting stay Pie-branded when the applicable AudienceLab DaaS/agency agreement expressly permits it.</p></div>
      <div className="controlGrid"><div className="statusBox"><small>CLIENT BRAND</small><strong>Pie</strong></div><div className="statusBox"><small>UPSTREAM PROVIDER</small><strong>Abstracted</strong></div><div className="statusBox"><small>RAW PIPELINE</small><strong>API + HTTP / Webhook</strong></div><div className="statusBox"><small>LICENSE GATE</small><strong>Required</strong></div></div>
      <small>Do not hide or redistribute provider data beyond the rights in the executed AudienceLab agreement. Pie should only enable the white-label switch after the DaaS/agency license is confirmed, because AudienceLab’s general terms otherwise restrict white-labeling and redistribution of Available Data.</small>
    </section>

    <section className="growthCardGrid">
      <article className="panel growthFeatureCard"><p className="eyebrow">Streaming / CTV</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Vibe.co</strong><ProviderBadge ready={status.vibe} /></div><small>Plan streaming-TV campaigns from Marketing and connect Vibe’s developer platform when the API credentials are ready.</small><a className="secondary" href="https://www.vibe.co/developers" target="_blank" rel="noreferrer">Open Vibe</a></article>
      <article className="panel growthFeatureCard"><p className="eyebrow">Product Commercials</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Runway</strong><ProviderBadge ready={status.runway} /></div><small>Turn Brand Library product references into product ads, campaign images, and UGC-style commercial concepts through Runway’s API.</small><a className="secondary" href="https://dev.runwayml.com/" target="_blank" rel="noreferrer">Open Runway Dev</a></article>
    </section>
  </>;
}
