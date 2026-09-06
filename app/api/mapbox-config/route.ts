import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const candidates = [
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    process.env.MAPBOX_ACCESS_TOKEN,
    process.env.MAPBOX_TOKEN,
  ];
  const token = candidates.find((value) => value?.trim().startsWith('pk.'))?.trim() || '';

  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
  );
}
