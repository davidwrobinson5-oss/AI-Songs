import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '../../../auth';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  const ok = await verifySessionToken(token, process.env.AI_SONGS_SESSION_SECRET);
  return NextResponse.json({ ok }, {
    status: ok ? 200 : 401,
    headers: { 'Cache-Control': 'no-store' },
  });
}
