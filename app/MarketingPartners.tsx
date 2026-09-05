'use client';

import { useEffect, useMemo, useState } from 'react';

type PartnerStatus = { similarweb: boolean; apollo: boolean; aLeads: boolean; vibe: boolean; runway: boolean };
type ProviderMetrics = { spend: string; customers: string };
type ProviderMetricsMap = { apollo: ProviderMetrics; aLeads: ProviderMetrics };

const EMPTY_STATUS: PartnerStatus = { similarweb: false, apollo: false, aLeads: false, vibe: false, runway: false };
const EMPTY_METRICS: ProviderMetricsMap = { apollo: { spend: '', customers: '' }, aLeads: { spend: '', customers: '' } };

function money(value: number) { return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }); }
function parseNumber(value: string) { const parsed = Number(value.replace(/[^0-9.-]/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
function ProviderBadge({ ready }: { ready: boolean }) { return <small>{ready ? 'API READY' : 'NEEDS API KEY'}</small>; }

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
      const raw = localStorage.getItem('pie-marketing-data-provider-metrics-v1');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.apollo && parsed?.aLeads) setMetrics(parsed);
    } catch {}
  }, []);

  function updateMetrics(provider: keyof ProviderMetricsMap, field: keyof ProviderMetrics, value: string) {
    setMetrics((current) => {
      const next = { ...current, [provider]: { ...current[provider], [field]: value } };
      try { localStorage.setItem('pie-marketing-data-provider-metrics-v1', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const economics = useMemo(() => {
    const apolloSpend = parseNumber(metrics.apollo.spend);
    const apolloCustomers = parseNumber(metrics.apollo.customers);
    const aLeadsSpend = parseNumber(metrics.aLeads.spend);
    const aLeadsCustomers = parseNumber(metrics.aLeads.customers);
    const apolloCac = apolloCustomers > 0 ? apolloSpend / apolloCustomers : null;
    const aLeadsCac = aLeadsCustomers > 0 ? aLeadsSpend / aLeadsCustomers : null;
    let winner = '';
    if (apolloCac !== null && aLeadsCac !== null) winner = apolloCac < aLeadsCac ? 'Apollo' : aLeadsCac < apolloCac ? 'A-Leads' : 'Tie';
    return { apolloCac, aLeadsCac, winner };
  }, [metrics]);

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
      <div><p className="eyebrow">Business Lead Data</p><h2>Apollo + A-Leads</h2><p className="sub">Keep Apollo as the full GTM option and add A-Leads as a second data provider. Measure both by actual customer acquisition cost instead of assuming that a cheaper lead is a cheaper customer.</p></div>
      <div className="growthCardGrid">
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Apollo</strong><ProviderBadge ready={status.apollo} /></div><small>Use Apollo as the broad prospecting and outreach baseline. Connect the API when ready and compare the real cost per acquired customer.</small><a className="secondary" href="https://www.apollo.io/pricing" target="_blank" rel="noreferrer">Review Apollo</a></article>
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>A-Leads</strong><ProviderBadge ready={status.aLeads} /></div><small>Use A-Leads as a second data source for verified business contacts, then route more volume to the lower observed customer-acquisition cost.</small><a className="secondary" href="https://www.a-leads.co/pricing/" target="_blank" rel="noreferrer">Review A-Leads</a></article>
      </div>
      <div className="controlGrid"><label><span className="controlLabel">Apollo spend</span><input inputMode="decimal" value={metrics.apollo.spend} onChange={(event) => updateMetrics('apollo','spend',event.target.value)} placeholder="$ spent" /></label><label><span className="controlLabel">Apollo customers won</span><input inputMode="numeric" value={metrics.apollo.customers} onChange={(event) => updateMetrics('apollo','customers',event.target.value)} placeholder="0" /></label><label><span className="controlLabel">A-Leads spend</span><input inputMode="decimal" value={metrics.aLeads.spend} onChange={(event) => updateMetrics('aLeads','spend',event.target.value)} placeholder="$ spent" /></label><label><span className="controlLabel">A-Leads customers won</span><input inputMode="numeric" value={metrics.aLeads.customers} onChange={(event) => updateMetrics('aLeads','customers',event.target.value)} placeholder="0" /></label></div>
      <div className="controlGrid"><div className="statusBox"><small>APOLLO COST / CUSTOMER</small><strong>{economics.apolloCac === null ? '—' : money(economics.apolloCac)}</strong></div><div className="statusBox"><small>A-LEADS COST / CUSTOMER</small><strong>{economics.aLeadsCac === null ? '—' : money(economics.aLeadsCac)}</strong></div><div className="statusBox"><small>LOWER OBSERVED CAC</small><strong>{economics.winner || 'Run both first'}</strong></div></div>
      <small>Recommendation: keep Apollo available for its broader prospecting + outreach stack, add A-Leads as a second source, and route more volume to whichever provider produces the lower verified cost per acquired customer after a real campaign test.</small>
    </section>

    <section className="growthCardGrid">
      <article className="panel growthFeatureCard"><p className="eyebrow">Streaming / CTV</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Vibe.co</strong><ProviderBadge ready={status.vibe} /></div><small>Plan streaming-TV campaigns from Marketing and connect Vibe’s developer platform when the API credentials are ready.</small><a className="secondary" href="https://www.vibe.co/developers" target="_blank" rel="noreferrer">Open Vibe</a></article>
      <article className="panel growthFeatureCard"><p className="eyebrow">Product Commercials</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Runway</strong><ProviderBadge ready={status.runway} /></div><small>Turn Brand Library product references into product ads, campaign images, and UGC-style commercial concepts through Runway’s API.</small><a className="secondary" href="https://dev.runwayml.com/" target="_blank" rel="noreferrer">Open Runway Dev</a></article>
    </section>
  </>;
}
