import { NextResponse } from 'next/server';

const BASE = 'https://api.mureka.ai';

type Signal = { field: string; state: 'positive' | 'zero' | 'negative' | 'unknown' };

function collectCreditSignals(value: unknown, path = '', out: Signal[] = [], depth = 0) {
  if (depth > 6 || value == null) return out;

  if (Array.isArray(value)) {
    value.slice(0, 10).forEach((item, index) => collectCreditSignals(item, `${path}[${index}]`, out, depth + 1));
    return out;
  }

  if (typeof value !== 'object') return out;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (/(credit|balance|quota|remaining|available)/i.test(key)) {
      const numeric = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
      out.push({
        field: nextPath,
        state: numeric == null ? 'unknown' : numeric > 0 ? 'positive' : numeric === 0 ? 'zero' : 'negative',
      });
    }
    collectCreditSignals(raw, nextPath, out, depth + 1);
  }
  return out;
}

export async function GET() {
  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, connected: false, error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const response = await fetch(`${BASE}/v1/account/billing`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.message || data?.error || `Mureka returned ${response.status}.`;
      return NextResponse.json({ ok: false, connected: false, status: response.status, error: message }, { status: response.status });
    }

    const creditSignals = collectCreditSignals(data).slice(0, 20);
    return NextResponse.json({ ok: true, connected: true, status: response.status, provider: 'mureka', creditSignals });
  } catch (error) {
    return NextResponse.json({ ok: false, connected: false, error: error instanceof Error ? error.message : 'Could not reach Mureka.' }, { status: 502 });
  }
}
