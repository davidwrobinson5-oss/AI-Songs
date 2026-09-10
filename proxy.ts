import { NextFetchEvent, NextRequest, NextResponse } from 'next/server';
import { clerkMiddleware } from '@clerk/nextjs/server';
import { authConfigured, SESSION_COOKIE, verifySessionToken } from './app/auth';
import { pieLaunchGateEnabled } from './app/deploymentEnvironment';

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

function isOwnerLoginRoute(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/login/') || pathname === '/api/auth/login';
}

function isCustomerAuthRoute(pathname: string) {
  return (
    pathname === '/signup' || pathname.startsWith('/signup/') ||
    pathname === '/signin' || pathname.startsWith('/signin/') ||
    pathname === '/onboarding' || pathname.startsWith('/onboarding/')
  );
}

function isSignupCheckoutRequest(pathname: string) {
  return pathname === '/api/billing/checkout';
}

function isStripeWebhookRequest(pathname: string) {
  return pathname === '/api/billing/webhook';
}

function isPublicAccessRequest(pathname: string) {
  return pathname === '/api/access-request';
}

function isHealthRequest(pathname: string) {
  return pathname === '/api/health';
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

function isVoiceSwapRequest(pathname: string) {
  return pathname === '/api/voice-swap' || pathname.startsWith('/api/voice-swap/');
}

function isJobWorkerRequest(pathname: string) {
  return pathname === '/api/jobs/process';
}

function isCaptureBootstrap(pathname: string) {
  return isAndroidCaptureRequest(pathname) || isCaptureSessionRequest(pathname);
}

function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

function clerkFrontendApiProxyEnabled() {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim().startsWith('pk_live_') === true;
}

function addVercelParty(parties: Set<string>, value: string | undefined) {
  const host = value?.trim().toLowerCase();
  if (host && /^[a-z0-9.-]+\.vercel\.app$/.test(host)) parties.add(`https://${host}`);
}

function clerkAuthorizedParties() {
  const parties = new Set([
    'https://ai-songs-drobinhood1.vercel.app',
    'https://ai-songs-bice.vercel.app',
    'https://ai-songs-git-main-drobinhood1.vercel.app',
  ]);
  addVercelParty(parties, process.env.VERCEL_URL);
  addVercelParty(parties, process.env.VERCEL_BRANCH_URL);
  return [...parties];
}

function enforceApiEnvelope(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/')) return null;
  const method = req.method.toUpperCase();
  const allowPatch = isAudioUploadRequest(req.nextUrl.pathname);
  const allowDelete = isVoiceSwapRequest(req.nextUrl.pathname);
  const allowedMethods = ['GET', 'POST', ...(allowPatch ? ['PATCH'] : []), ...(allowDelete ? ['DELETE'] : []), 'HEAD'];
  const allowHeader = allowedMethods.join(', ');

  if (method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: { Allow: allowHeader, 'Access-Control-Allow-Methods': allowHeader, 'Access-Control-Allow-Origin': 'null', 'Cache-Control': 'no-store' } });
  }
  if (!allowedMethods.includes(method)) {
    return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: allowHeader, 'Cache-Control': 'no-store' } });
  }

  // Stripe webhooks are cross-site by design and authenticate with Stripe's
  // signed webhook header inside the route itself.
  if (!sameOrigin(req) && !isLegacyVerifyRequest(req.nextUrl.pathname) && !isJobWorkerRequest(req.nextUrl.pathname) && !isStripeWebhookRequest(req.nextUrl.pathname)) {
    return NextResponse.json({ error: 'Cross-site API requests are not allowed.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  return null;
}

async function legacySessionValid(req: NextRequest) {
  if (!authConfigured()) return false;
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.AI_SONGS_SESSION_SECRET);
}

async function enforceLaunchGate(req: NextRequest) {
  if (!pieLaunchGateEnabled()) return null;
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname) || isHealthRequest(pathname) || isOwnerLoginRoute(pathname) || isLegacyVerifyRequest(pathname) || isStripeWebhookRequest(pathname)) return null;
  if (await legacySessionValid(req)) return null;

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: 'Pie is not open to the public yet.' },
      { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } },
    );
  }

  const login = req.nextUrl.clone();
  login.pathname = '/login';
  login.search = 'launch=private';
  return NextResponse.redirect(login);
}

async function legacyProxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();
  const apiEnvelope = enforceApiEnvelope(req);
  if (apiEnvelope) return apiEnvelope;
  if (isPublicAccessRequest(pathname) || isHealthRequest(pathname) || isCustomerAuthRoute(pathname) || isOwnerLoginRoute(pathname) || isLegacyVerifyRequest(pathname) || isCaptureBootstrap(pathname) || isJobWorkerRequest(pathname) || isSignupCheckoutRequest(pathname) || isStripeWebhookRequest(pathname)) return NextResponse.next();

  if (!authConfigured()) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Studio authentication is not configured.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone(); login.pathname = '/login'; login.search = ''; return NextResponse.redirect(login);
  }

  const validSession = await legacySessionValid(req);
  if (!validSession) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const login = req.nextUrl.clone(); login.pathname = '/login'; login.search = ''; return NextResponse.redirect(login);
  }

  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow'); response.headers.set('Access-Control-Allow-Origin', 'null');
  }
  return response;
}

const clerkProxy = clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  if (isPublicAsset(pathname)) return NextResponse.next();
  const apiEnvelope = enforceApiEnvelope(req);
  if (apiEnvelope) return apiEnvelope;

  if (isPublicAccessRequest(pathname) || isHealthRequest(pathname) || isCustomerAuthRoute(pathname) || isOwnerLoginRoute(pathname) || isLegacyVerifyRequest(pathname) || isCaptureBootstrap(pathname) || isJobWorkerRequest(pathname) || isSignupCheckoutRequest(pathname) || isStripeWebhookRequest(pathname)) {
    return NextResponse.next();
  }

  const clerkAuth = await auth();
  const legacyValid = await legacySessionValid(req);
  const authenticated = clerkAuth.isAuthenticated || legacyValid;

  if (!authenticated) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const signin = req.nextUrl.clone(); signin.pathname = '/signin'; signin.search = ''; return NextResponse.redirect(signin);
  }

  const response = NextResponse.next();
  if (pathname.startsWith('/api/')) {
    response.headers.set('Cache-Control', 'no-store'); response.headers.set('X-Robots-Tag', 'noindex, nofollow'); response.headers.set('Access-Control-Allow-Origin', 'null');
  }
  return response;
}, {
  frontendApiProxy: { enabled: clerkFrontendApiProxyEnabled(), path: '/__clerk' },
  authorizedParties: clerkAuthorizedParties(),
  contentSecurityPolicy: { strict: true, directives: { 'media-src': ["'self'", 'blob:', 'data:'], 'connect-src': ['blob:'], 'manifest-src': ["'self'"], 'object-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
});

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  const launchGate = await enforceLaunchGate(req);
  if (launchGate) return launchGate;
  if (!clerkConfigured()) return legacyProxy(req);
  try { return await clerkProxy(req, event); }
  catch (error) { console.error('Clerk middleware failed; preserving owner studio fallback.', error); return legacyProxy(req); }
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)', '/(api|trpc)(.*)', '/__clerk/(.*)'] };
