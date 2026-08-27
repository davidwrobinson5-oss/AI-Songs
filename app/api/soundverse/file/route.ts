import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

export async function GET(req: Request) {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });

  try {
    const fileId = new URL(req.url).searchParams.get('fileId');
    if (!fileId) return NextResponse.json({ error: 'fileId is required.' }, { status: 400 });

    const linkRes = await fetch(`${BASE}/v1/files/${encodeURIComponent(fileId)}/download`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const link = await linkRes.json().catch(() => ({}));
    if (!linkRes.ok) return NextResponse.json(link, { status: linkRes.status });
    const url = link?.download_url || link?.signed_url || link?.url;
    if (!url) return NextResponse.json({ error: 'Soundverse did not return a download URL.' }, { status: 502 });

    const audioRes = await fetch(String(url), { cache: 'no-store' });
    if (!audioRes.ok) return NextResponse.json({ error: 'Could not download Soundverse audio.' }, { status: 502 });
    const bytes = await audioRes.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': audioRes.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not proxy Soundverse file.' }, { status: 500 });
  }
}
