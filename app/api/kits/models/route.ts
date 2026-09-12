import { NextResponse } from 'next/server';
import { rateLimit } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

type RawModel = {
  id?: string | number;
  title?: string;
  tags?: unknown;
  demoUrl?: unknown;
  imageUrl?: unknown;
};

export async function GET(req: Request) {
  const limited = rateLimit(req, 'kits-models', 12, 60_000);
  if (limited) return limited;

  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI voice choices are temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  try {
    const url = new URL(`${KITS_BASE}/voice-models`);
    if (new URL(req.url).searchParams.get('myModels') === 'true') {
      url.searchParams.set('myModels', 'true');
    }
    url.searchParams.set('order', 'asc');
    url.searchParams.set('page', '1');
    url.searchParams.set('perPage', '100');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Kits model listing failed', response.status);
      return NextResponse.json({ error: 'AI voice choices are unavailable.' }, { status: response.status >= 500 ? 502 : 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const raw: RawModel[] = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : [];

    const models = raw.flatMap((model) => {
      const id = model?.id == null ? '' : String(model.id);
      const title = typeof model?.title === 'string' ? model.title.trim() : '';
      if (!id || !title) return [];
      const tags = Array.isArray(model.tags)
        ? model.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 16)
        : [];
      return [{
        id,
        title,
        tags,
        demoUrl: typeof model.demoUrl === 'string' ? model.demoUrl : '',
        imageUrl: typeof model.imageUrl === 'string' ? model.imageUrl : '',
      }];
    });

    return NextResponse.json({ models }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'AI voice choices are unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
