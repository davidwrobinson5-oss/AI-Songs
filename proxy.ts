import { NextRequest, NextResponse } from 'next/server';
import { authConfigured, SESSION_COOKIE, verifySessionToken } from './app/auth';

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

function isPublicAsset(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icon-')
  );
}

function isLoginRoute(pathname: string) {
  return pathname === '/login' || pathname === '/api/auth/login';
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();

  const method = req.method.toUpperCase();

  if (pathname.startsWith('/api/')) {
    if (method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          Allow: 'GET, POST, HEAD',
          'Access-Control-Allow-Origin': 'null',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (!['GET', 'POST', 'HEAD'].includes(method)) {
      return NextResponse.json(
        { error: 'Method not allowed.' },
        { status: 405, headers: { Allow: 'GET, POST, HEAD', 'Cache-Control': 'no-store' } },
      );
    }

    if (!sameOrigin(req)) {
      return NextResponse.json(
        { error: 'Cross-site API requests are not allowed.' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  }

  if (!authConfigured()) {
    if (isLoginRoute(pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Studio authentication is not configured.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  const sessionSecret = process.env.AI_SONGS_SESSION_SECRET;
  const validSession = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, sessionSecret);

  if (isLoginRoute(pathname)) {
    if (validSession && pathname === '/login') {
      const home = req.nextUrl.clone();
      home.pathname = '/';
      home.search = '';
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }

  if (!validSession) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    response.headers.set('Access-Control-Allow-Origin', 'null');
  }
  return response;
}

export const config = {
  matcher: '/((?!_next/static|_next/image).*)',
};
