import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
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

    let clerkSignedIn = false;
    try {
      const clerk = await auth();
      clerkSignedIn = Boolean(clerk.userId);
    } catch {
      clerkSignedIn = false;
    }

    const jar = await cookies();
    const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
    const legacyValid = clerkSignedIn
      ? false
      : await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);

    if (!clerkSignedIn && !legacyValid) {
      return noStore({ error: 'Authentication required.' }, 401);
    }

    const vercelOidcToken = await getVercelOidcToken().catch(() => '');
    if (!vercelOidcToken) {
      console.error('Pie cloud library could not obtain the Vercel OIDC token.');
      return noStore({ error: 'Cloud library identity is temporarily unavailable.' }, 503);
    }

    const response = await fetch(LIBRARY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'X-Pie-Vercel-OIDC': vercelOidcToken,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.info('Pie cloud response diagnostic', {
        status: response.status,
        error: typeof data?.error === 'string' ? data.error : 'unknown',
      });
    }
    return noStore(data, response.status);
  } catch (error) {
    console.error('Song library proxy failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Cloud library request failed.' }, 500);
  }
}
