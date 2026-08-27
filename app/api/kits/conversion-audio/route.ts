import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function GET(req: Request) {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  }

  try {
    const statusResponse = await fetch(`${KITS_BASE}/voice-conversions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });

    const conversion = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) {
      return NextResponse.json(conversion, { status: statusResponse.status });
    }

    if (conversion.status !== 'success') {
      return NextResponse.json({ error: 'Voice conversion is not complete.', status: conversion.status }, { status: 409 });
    }

    const audioUrl = conversion.outputFileUrl || conversion.lossyOutputFileUrl || conversion.recombinedAudioFileUrl;
    if (!audioUrl || typeof audioUrl !== 'string') {
      return NextResponse.json({ error: 'Kits did not return converted audio.' }, { status: 502 });
    }

    const audioResponse = await fetch(audioUrl, { cache: 'no-store' });
    if (!audioResponse.ok) {
      return NextResponse.json({ error: 'Could not retrieve converted Kits audio.' }, { status: 502 });
    }

    const bytes = await audioResponse.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': audioResponse.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Could not proxy converted Kits audio.' }, { status: 500 });
  }
}
