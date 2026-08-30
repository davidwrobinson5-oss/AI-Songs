import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

const LIBRARY_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-library';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const jar = await cookies();
    const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
    const legacyValid = await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);

    let clerkToken = '';
    if (!legacyValid) {
      try {
        const clerk = await auth();
        if (clerk.userId) clerkToken = await clerk.getToken() || '';
      } catch {
        clerkToken = '';
      }
    }

    if (!legacyValid && !clerkToken) return noStore({ error: 'Authentication required.' }, 401);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
    };
    if (legacyValid) headers['X-Pie-Legacy-Session'] = legacyToken;
    else headers.Authorization = `Bearer ${clerkToken}`;

    const response = await fetch(LIBRARY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return noStore(data, response.status);
  } catch (error) {
    console.error('Song library proxy failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Cloud library request failed.' }, 500);
  }
}
