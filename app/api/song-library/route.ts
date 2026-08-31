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

    // Prefer the signed-in Clerk account whenever it is available. Some browsers
    // can still carry an older valid studio cookie after moving to Clerk. If we
    // prefer that legacy cookie, the Supabase function has to call back through
    // Vercel deployment protection to verify it, which fails before Pie sees the
    // request. Clerk is therefore the canonical identity for account cloud sync.
    let clerkToken = '';
    try {
      const clerk = await auth();
      if (clerk.userId) clerkToken = await clerk.getToken() || '';
    } catch {
      clerkToken = '';
    }

    const jar = await cookies();
    const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
    const legacyValid = clerkToken
      ? false
      : await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);

    if (!clerkToken && !legacyValid) return noStore({ error: 'Authentication required.' }, 401);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
    };
    if (clerkToken) headers.Authorization = `Bearer ${clerkToken}`;
    else headers['X-Pie-Legacy-Session'] = legacyToken;

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
