import { NextResponse } from 'next/server';
import { rateLimit } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

// Connectivity probe for the production Music Generator integration.
// Rebuilt after ELEVENLABS_API_KEY was corrected in Vercel.
export async function GET(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-status', 6, 60_000);
  if (limited) return limited;

  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ ok: false, error: 'Sign in to check Music Engine status.' }, { status: 401 });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 503 });
  }

  const response = await fetch('https://api.elevenlabs.io/v1/user', {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
    },
    cache: 'no-store',
  });

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    connected: response.ok,
    model: 'music_v2',
    detail: response.ok ? 'Music Engine credentials verified without generating billable audio.' : 'Music Engine credentials could not be verified.',
  }, { status: response.ok ? 200 : response.status });
}
