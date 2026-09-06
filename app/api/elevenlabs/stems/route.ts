import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import { rateLimit, readResponseBytesLimited, safeClientError, validateAudioFile } from '../../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../../usageEntitlements';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-stems', 4, 60_000);
  if (limited) return limited;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Stem separation is temporarily unavailable.' }, { status: 503 });

  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to separate stems.' }, { status: 401 });

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 82 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio upload is too large.' }, { status: 413 });
    }

    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    validateAudioFile(file, 80 * 1024 * 1024);

    const entitlement = await consumeUsage('elevenlabs_stem_separations', FREE_LIMITS.musicGenerationsPerMonth);
    if (!entitlement.allowed) {
      return NextResponse.json({
        error: usageDeniedMessage('stem separations', entitlement),
        code: 'PIE_USAGE_LIMIT',
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const form = new FormData();
    form.append('file', file, 'generated-song.mp3');
    form.append('stem_variation_id', 'two_stems_v1');

    const response = await fetch(`${ELEVENLABS_BASE}/v1/music/stem-separation?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('Music Engine stem separation failed', response.status);
      return NextResponse.json({ error: 'Stem separation provider rejected the request.' }, { status: response.status >= 500 ? 502 : 400 });
    }

    const zip = await readResponseBytesLimited(response, 140 * 1024 * 1024);
    return new NextResponse(zip, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Music Engine stem separation request failed');
    return NextResponse.json({ error: safeClientError(error, 'Stem separation failed.') }, { status: 400 });
  }
}
