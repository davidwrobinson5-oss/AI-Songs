import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function monthOffset(date: Date, offset: number) {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.SIMILARWEB_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Similarweb is not connected yet.' }, { status: 503 });

  const rawDomain = request.nextUrl.searchParams.get('domain')?.trim().toLowerCase() || '';
  const country = (request.nextUrl.searchParams.get('country') || 'us').trim().toLowerCase();
  const domain = rawDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return NextResponse.json({ error: 'Enter a valid website domain, such as example.com.' }, { status: 400 });
  }
  if (!/^(world|[a-z]{2})$/i.test(country)) {
    return NextResponse.json({ error: 'Country must be a two-letter code or world.' }, { status: 400 });
  }

  const now = new Date();
  const startDate = monthOffset(now, -3);
  const endDate = monthOffset(now, -1);
  const endpoint = new URL(`https://api.similarweb.com/v1/website/${encodeURIComponent(domain)}/total-traffic-and-engagement/visits`);
  endpoint.searchParams.set('api_key', apiKey);
  endpoint.searchParams.set('start_date', startDate);
  endpoint.searchParams.set('end_date', endDate);
  endpoint.searchParams.set('country', country);
  endpoint.searchParams.set('granularity', 'monthly');
  endpoint.searchParams.set('main_domain_only', 'false');
  endpoint.searchParams.set('format', 'json');

  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const text = await response.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { payload = { raw: text }; }

    if (!response.ok) {
      const message = payload?.meta?.error_message || payload?.error || payload?.message || `Similarweb returned ${response.status}`;
      return NextResponse.json({ error: message }, { status: response.status >= 400 && response.status < 600 ? response.status : 502 });
    }

    return NextResponse.json({ domain, country, startDate, endDate, ...payload });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Similarweb request failed.' }, { status: 502 });
  }
}
