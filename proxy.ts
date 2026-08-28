import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { authConfigured, SESSION_COOKIE, verifySessionToken } from './app/auth';

function sameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const secFetchSite = req.headers.get('sec-fetch-site');
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (secFetchSite === 'cross-site') return false;
  if (!origin || !host) return true;
  try { return new URL(origin).origin === `${proto}://${host}`; } catch { return false; }
}

function isPublicAsset(pathname: string) {
  return pathname.startsWith('/_next/') || pathname === '/manifest.webmanifest' || pathname === '/favicon.ico' || pathname.startsWith('/icon-');
}

function isLoginRoute(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname === '/api/auth/login';
}

function isPublicAccessRequest(pathname: string) {
  return pathname === '/api/access-request';
}

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function enforceApiEnvelope(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return null;
  const method = req.method.toUpperCase();
  if (method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: { Allow: 'GET, POST, HEAD', 'Access-Control-Allow-Origin': 'null', 'Cache-Control': 'no-store' } });
  if (!['GET', 'POST', 'HEAD'].includes(method)) return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST, HEAD', 'Cache-Control': 'no-store' } });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'Cross-site API requests are not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return null;
}

async function legacySessionValid(req: NextRequest) {
  if (!authConfigured()) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.AI_SONGS_SESSION_SECRET);
}

async function legacyProxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();
  const apiEnvelope = enforceApiEnvelope(req);
  if (apiEnvelope) return apiEnvelope;
  if (isPublicAccessRequest(pathname)) return NextResponse.next();

  if (!authConfigured()) {
    if (isLoginRoute(pathname)) return NextResponse.next();
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Studio authentication is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone(); login.pathname = '/login'; login.search = ''; return NextResponse.redirect(login);
  }

  const validSession = await legacySessionValid(req);
  if (isLoginRoute(pathname)) {
    if (validSession && pathname === '/login') { const home = req.nextUrl.clone(); home.pathname = '/'; home.search = ''; return NextResponse.redirect(home); }
    return NextResponse.next();
  }
  if (!validSession) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone(); login.pathname = '/login'; login.search = ''; return NextResponse.redirect(login);
  }
  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) { response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow'); response.headers.set('Access-Control-Allow-Origin', 'null'); }
  return response;
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();
  const apiEnvelope = enforceApiEnvelope(req);
  if (apiEnvelope) return apiEnvelope;
  if (isPublicAccessRequest(pathname)) return NextResponse.next();

  const clerkAuth = await auth();
  const legacyValid = await legacySessionValid(req);
  const authenticated = clerkAuth.isAuthenticated || legacyValid;

  if (isLoginRoute(pathname)) {
    if (authenticated && pathname === '/login') { const home = req.nextUrl.clone(); home.pathname = '/'; home.search = ''; return NextResponse.redirect(home); }
    return NextResponse.next();
  }
  if (!authenticated) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone(); login.pathname = '/login'; login.search = ''; return NextResponse.redirect(login);
  }
  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) { response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow'); response.headers.set('Access-Control-Allow-Origin', 'null'); }
  return response;
}, {
  authorizedParties: [
    'https://ai-songs-drobinhood1.vercel.app',
    'https://ai-songs-bice.vercel.app',
    'https://ai-songs-git-main-drobinhood1.vercel.app',
  ],
  contentSecurityPolicy: { strict: true, directives: { 'media-src': ["'self'", 'blob:', 'data:'], 'connect-src': ['blob:'], 'manifest-src': ["'self'"], 'object-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
});

export function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured()) return legacyProxy(req);
  return clerkProxy(req, event);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/(api|trpc)(.*)', '/__clerk/(.*)'] };
