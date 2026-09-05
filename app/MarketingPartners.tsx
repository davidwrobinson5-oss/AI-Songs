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

function parseNumber(value: string) { const parsed = Number(value.replace(/[^0-9.-]/g, '')); return Number.isFinite(parsed) ? parsed : 0; }
function ProviderBadge({ ready }: { ready: boolean }) { return <small>{ready ? 'READY' : 'SETUP REQUIRED'}</small>; }

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

  const routing = useMemo(() => {
    const ready = [status.apollo, status.aLeads, status.audienceLab].filter(Boolean).length;
    const rows = (Object.keys(metrics) as ProviderKey[]).map((provider) => {
      const spend = parseNumber(metrics[provider].spend);
      const customers = parseNumber(metrics[provider].customers);
      return { provider, cac: customers > 0 ? spend / customers : null };
    });
    const usable = rows.filter((row): row is { provider: ProviderKey; cac: number } => row.cac !== null);
    const best = usable.length >= 2 ? usable.reduce((winner, row) => row.cac < winner.cac ? row : winner) : null;
    return { ready, best };
  }, [metrics, status]);

  async function analyzeDomain() {
    if (!domain.trim()) return;
    setSimilarwebLoading(true); setSimilarwebError(''); setSimilarwebResult(null);
    try {
      const response = await fetch(`/api/marketing/similarweb?domain=${encodeURIComponent(domain.trim())}&country=us`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Website intelligence request failed');
      setSimilarwebResult(data);
    } catch (error) {
      setSimilarwebError(error instanceof Error ? error.message : 'Website intelligence request failed');
    } finally { setSimilarwebLoading(false); }
  }

  const visitSeries = Array.isArray(similarwebResult?.visits) ? similarwebResult.visits : Array.isArray(similarwebResult?.data?.visits) ? similarwebResult.data.visits : [];
  const latestVisit = visitSeries.length > 0 ? visitSeries[visitSeries.length - 1] : null;
  const latestVisitValue = typeof latestVisit === 'number' ? latestVisit : Number(latestVisit?.visits ?? latestVisit?.value ?? latestVisit?.count ?? NaN);

  return <>
    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <div><p className="eyebrow">Audience + Competitive Intelligence</p><h2>Pie Website Intelligence</h2><p className="sub">Research websites, competitors, traffic, audience behavior, and campaign opportunities without leaving Pie.</p></div>
      <div className="statusBox" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><strong>Website intelligence</strong><ProviderBadge ready={status.similarweb} /></div>
      <div className="controlGrid"><label><span className="controlLabel">Website or competitor domain</span><input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" /></label></div>
      <div className="mixButtons"><button className="primary" type="button" onClick={analyzeDomain} disabled={!domain.trim() || similarwebLoading || !status.similarweb}>{similarwebLoading ? 'Analyzing…' : 'Analyze Website'}</button></div>
      {!status.similarweb && <small>Website intelligence is not connected yet.</small>}
      {similarwebError && <div className="statusBox"><small>{similarwebError}</small></div>}
      {similarwebResult && <div className="controlGrid"><div className="statusBox"><small>DOMAIN</small><strong>{similarwebResult.domain || domain}</strong></div><div className="statusBox"><small>LATEST VISITS</small><strong>{Number.isFinite(latestVisitValue) ? Math.round(latestVisitValue).toLocaleString() : 'Data returned'}</strong></div><div className="statusBox"><small>COUNTRY</small><strong>{String(similarwebResult.country || 'us').toUpperCase()}</strong></div><div className="statusBox"><small>DATA POINTS</small><strong>{visitSeries.length || 'Available'}</strong></div></div>}
    </section>

    <section className="panel" style={{ display: 'grid', gap: 12 }}>
      <div><p className="eyebrow">Pie Data</p><h2>Pie Data Network</h2><p className="sub">One Pie-branded data product with multiple private upstream routes. Pie chooses the best available route for coverage, quality, freshness, fit, cost, and delivery speed.</p></div>
      <div className="controlGrid">
        <div className="statusBox"><small>DATA ROUTES READY</small><strong>{routing.ready} / 3</strong></div>
        <div className="statusBox"><small>ROUTING</small><strong>Automatic</strong></div>
        <div className="statusBox"><small>RAW PIPELINE</small><strong>Normalized</strong></div>
        <div className="statusBox"><small>CUSTOMER BRAND</small><strong>Pie Data</strong></div>
      </div>
      <div className="growthCardGrid">
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><strong>Audience + contact discovery</strong><small>Build business and consumer audiences, industry lists, contact sets, and campaign segments through Pie without exposing the upstream vendor.</small></article>
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><strong>Identity + enrichment</strong><small>Normalize, enrich, deduplicate, score freshness, and resolve overlapping records before anything reaches the customer.</small></article>
        <article className="statusBox" style={{ display: 'grid', gap: 8 }}><strong>Raw data delivery</strong><small>API, HTTP, webhook, and database ingestion routes feed the same internal Pie schema with provenance retained privately.</small></article>
      </div>
      <small>Provider identities, source-selection logic, vendor-specific pricing, and routing economics remain internal infrastructure. Customer-facing Pie screens show Pie Data only.</small>
    </section>

    <section className="panel" style={{ display: 'grid', gap: 10 }}>
      <div><p className="eyebrow">White-Label Architecture</p><h2>Pie Owns the Customer Experience</h2><p className="sub">Upstream data services are interchangeable infrastructure beneath Pie. Provider provenance stays in the backend for compliance, audits, suppression, refresh history, and routing decisions, while customer-facing records and workflows remain Pie-branded.</p></div>
      <div className="controlGrid"><div className="statusBox"><small>CLIENT BRAND</small><strong>Pie</strong></div><div className="statusBox"><small>UPSTREAM IDENTITY</small><strong>Private</strong></div><div className="statusBox"><small>PROVENANCE</small><strong>Internal + preserved</strong></div><div className="statusBox"><small>LICENSE GATE</small><strong>Enforced</strong></div></div>
      <small>White-label routing should only use providers and datasets whose executed agreements permit Pie to redistribute or present the data under the Pie brand.</small>
    </section>

    <section className="growthCardGrid">
      <article className="panel growthFeatureCard"><p className="eyebrow">Streaming / CTV</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Pie Streaming Ads</strong><ProviderBadge ready={status.vibe} /></div><small>Plan streaming-TV campaigns inside Pie while the media platform remains backend infrastructure.</small></article>
      <article className="panel growthFeatureCard"><p className="eyebrow">Product Commercials</p><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>Pie Commercial Studio</strong><ProviderBadge ready={status.runway} /></div><small>Turn Brand Library product references into product ads, campaign images, and UGC-style commercial concepts while generation providers remain abstracted.</small></article>
    </section>
  </>;
}
