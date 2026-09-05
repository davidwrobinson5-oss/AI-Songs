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
  return (
    pathname.startsWith('/_next/') ||
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icon-') ||
    /\.(?:svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf)$/i.test(pathname)
  );
}

function isLoginRoute(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname === '/api/auth/login';
}

function isSignupRoute(pathname: string) {
  return pathname === '/signup' || pathname.startsWith('/signup/');
}

function isPublicAccessRequest(pathname: string) {
  return pathname === '/api/access-request';
}

function isLegacyVerifyRequest(pathname: string) {
  return pathname === '/api/auth/legacy-verify';
}

function isAndroidCaptureRequest(pathname: string) {
  return pathname === '/api/sheets/mobile-process';
}

function isCaptureSessionRequest(pathname: string) {
  return pathname === '/api/capture-session';
}

function isAudioUploadRequest(pathname: string) {
  return pathname === '/api/song-audio-upload';
}

function isStudioPasswordRequest(req: NextRequest) {
  return req.nextUrl.pathname === '/login' && req.nextUrl.searchParams.get('legacy') === '1';
}

function isCloudConnectRequest(req: NextRequest) {
  return req.nextUrl.pathname === '/login' && req.nextUrl.searchParams.get('cloud') === '1';
}

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

function enforceApiEnvelope(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return null;
  const method = req.method.toUpperCase();
  const allowPatch = isAudioUploadRequest(req.nextUrl.pathname);
  const allowedMethods = allowPatch ? ['GET', 'POST', 'PATCH', 'HEAD'] : ['GET', 'POST', 'HEAD'];
  const allowHeader = allowedMethods.join(', ');

  if (method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: {
        Allow: allowHeader,
        'Access-Control-Allow-Methods': allowHeader,
        'Access-Control-Allow-Origin': 'null',
        'Cache-Control': 'no-store',
      },
    });
  }

  if (!allowedMethods.includes(method)) {
    return NextResponse.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: allowHeader, 'Cache-Control': 'no-store' } },
    );
  }

  if (!sameOrigin(req) && !isLegacyVerifyRequest(req.nextUrl.pathname)) {
    return NextResponse.json(
      { error: 'Cross-site API requests are not allowed.' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return null;
}

async function legacySessionValid(req: NextRequest) {
  if (!authConfigured()) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.AI_SONGS_SESSION_SECRET);
}

function isCaptureBootstrap(pathname: string) {
  return isAndroidCaptureRequest(pathname) || isCaptureSessionRequest(pathname);
}

async function legacyProxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();
  const apiEnvelope = enforceApiEnvelope(req);
  if (apiEnvelope) return apiEnvelope;
  if (isPublicAccessRequest(pathname) || isSignupRoute(pathname) || isStudioPasswordRequest(req) || isLegacyVerifyRequest(pathname) || isCaptureBootstrap(pathname)) return NextResponse.next();

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
  if (isPublicAccessRequest(pathname) || isSignupRoute(pathname) || isStudioPasswordRequest(req) || isLegacyVerifyRequest(pathname) || isCaptureBootstrap(pathname)) return NextResponse.next();

  const clerkAuth = await auth();
  const legacyValid = await legacySessionValid(req);
  const authenticated = clerkAuth.isAuthenticated || legacyValid;

  if (isLoginRoute(pathname)) {
    if (isCloudConnectRequest(req) && !clerkAuth.isAuthenticated) return NextResponse.next();

    if (authenticated && pathname === '/login') {
      const home = req.nextUrl.clone();
      home.pathname = '/';
      home.search = '';
      return NextResponse.redirect(home);
    }
    return NextResponse.next();
  }
  if (!authenticated) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone();
    login.pathname = '/login';
    return NextResponse.redirect(login);
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

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!clerkConfigured()) return legacyProxy(req);

  try {
    return await clerkProxy(req, event);
  } catch (error) {
    console.error('Clerk middleware failed; falling back to legacy studio authentication.', error);

    if (isLoginRoute(req.nextUrl.pathname) && req.nextUrl.searchParams.get('legacy') !== '1') {
      const login = req.nextUrl.clone();
      login.pathname = '/login';
      login.search = '?legacy=1';
      return NextResponse.redirect(login);
    }

    return legacyProxy(req);
  }
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/(api|trpc)(.*)', '/__clerk/(.*)'] };
