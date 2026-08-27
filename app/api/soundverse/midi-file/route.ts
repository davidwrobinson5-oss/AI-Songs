import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const data = new URL(req.url).searchParams.get('data');
    if (!data || data.length > 250_000) return NextResponse.json({ error: 'Invalid MIDI payload.' }, { status: 400 });
    const bytes = Buffer.from(data, 'base64url');
    if (bytes.length < 14 || bytes.subarray(0, 4).toString('ascii') !== 'MThd') {
      return NextResponse.json({ error: 'Invalid MIDI file.' }, { status: 400 });
    }
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': 'audio/midi',
        'Content-Disposition': 'inline; filename="ai-songs-melody.mid"',
        'Cache-Control': 'public, max-age=600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not serve MIDI.' }, { status: 400 });
  }
}
