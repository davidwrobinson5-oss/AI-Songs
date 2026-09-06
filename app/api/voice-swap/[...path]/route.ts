import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

const VOICE_SWAP_BASE = 'https://api.voice-swap.ai/v1';
const NO_STORE = { 'Cache-Control': 'no-store' };

function allowedPath(parts: string[], method: string) {
  const path = parts.join('/');
  if (method === 'GET') {
    return path === 'models'
      || /^models\/[A-Za-z0-9._:-]+$/.test(path)
      || /^training\/[A-Za-z0-9._:-]+\/progress$/.test(path)
      || /^inference\/[A-Za-z0-9._:-]+\/(status|result)$/.test(path);
  }
  if (method === 'POST') {
    return path === 'training/upload-url'
      || path === 'training/start'
      || path === 'inference/start';
  }
  if (method === 'DELETE') return /^models\/[A-Za-z0-9._:-]+$/.test(path);
  return false;
}

async function proxy(req: Request, context: { params: Promise<{ path?: string[] }> }) {
  const limited = rateLimit(req, 'voice-swap', 20, 60_000);
  if (limited) return limited;

  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: NO_STORE });

  const token = process.env.VOICE_SWAP_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'Voice-Swap is not connected yet.', code: 'VOICE_SWAP_NOT_CONFIGURED' }, { status: 503, headers: NO_STORE });

  const { path: rawParts = [] } = await context.params;
  const parts = rawParts.map((part) => decodeURIComponent(part));
  if (!allowedPath(parts, req.method)) return NextResponse.json({ error: 'Unsupported Voice-Swap operation.' }, { status: 404, headers: NO_STORE });

  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 64 * 1024 * 1024) return NextResponse.json({ error: 'Voice upload is too large for Pie.' }, { status: 413, headers: NO_STORE });

    const upstreamHeaders: Record<string, string> = { Authorization: `Bearer ${token}` };
    let body: BodyInit | undefined;
    if (!['GET', 'HEAD'].includes(req.method)) {
      const contentType = req.headers.get('content-type') || '';
      if (contentType.startsWith('application/json')) {
        const text = await req.text();
        if (new TextEncoder().encode(text).byteLength > 256_000) throw new Error('REQUEST_TOO_LARGE');
        JSON.parse(text || '{}');
        upstreamHeaders['Content-Type'] = 'application/json';
        body = text || '{}';
      } else if (contentType.startsWith('multipart/form-data')) {
        const form = await req.formData();
        const rebuilt = new FormData();
        for (const [key, value] of form.entries()) {
          if (typeof value === 'string') rebuilt.append(key, value.slice(0, 4000));
          else {
            if (value.size > 60 * 1024 * 1024) throw new Error('REQUEST_TOO_LARGE');
            rebuilt.append(key, value, value.name || 'voice-audio.wav');
          }
        }
        body = rebuilt;
      } else if (req.method !== 'DELETE') {
        return NextResponse.json({ error: 'Unsupported Voice-Swap request format.' }, { status: 415, headers: NO_STORE });
      }
    }

    const upstream = await fetch(`${VOICE_SWAP_BASE}/${parts.map(encodeURIComponent).join('/')}`, {
      method: req.method,
      headers: upstreamHeaders,
      body,
      cache: 'no-store',
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = await upstream.json().catch(() => ({}));
      if (!upstream.ok) console.error('Voice-Swap request failed', req.method, parts.join('/'), upstream.status);
      return NextResponse.json(payload, { status: upstream.status, headers: NO_STORE });
    }

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('UPSTREAM_FILE_TOO_LARGE');
    return new NextResponse(bytes, {
      status: upstream.status,
      headers: { ...NO_STORE, 'Content-Type': contentType || 'application/octet-stream' },
    });
  } catch (error) {
    console.error('Voice-Swap gateway failed');
    return NextResponse.json({ error: safeClientError(error, 'Voice-Swap request failed.') }, { status: 400, headers: NO_STORE });
  }
}

export async function GET(req: Request, context: { params: Promise<{ path?: string[] }> }) { return proxy(req, context); }
export async function POST(req: Request, context: { params: Promise<{ path?: string[] }> }) { return proxy(req, context); }
export async function DELETE(req: Request, context: { params: Promise<{ path?: string[] }> }) { return proxy(req, context); }
