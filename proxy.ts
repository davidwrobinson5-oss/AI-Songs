import { NextRequest, NextResponse } from 'next/server';

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';

  if (secFetchSite === 'cross-site') return false;
  if (!origin || !host) return true;

  try {
    return new URL(origin).origin === `${proto}://${host}`;
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Allow': 'GET, POST',
        'Access-Control-Allow-Origin': 'null',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !sameOrigin(req)) {
    return NextResponse.json(
      { error: 'Cross-site API requests are not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
