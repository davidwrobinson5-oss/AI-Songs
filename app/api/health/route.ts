import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';
import { clerkKeyMode, pieDeploymentTarget, pieLaunchGateEnabled, pieProductionConfigurationReady, piePublicLaunchEnabled, stripeSecretMode } from '../../deploymentEnvironment';
import { stripeEnvironmentSafe, stripePlanConfigurationReady } from '../../stripePlans';

export const dynamic = 'force-dynamic';

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function probe(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function authorizedProbes(request: NextRequest) {
  const expected = process.env.PIE_HEALTHCHECK_SECRET?.trim() || '';
  const supplied = request.headers.get('x-pie-healthcheck-secret')?.trim() || '';
  if (expected.length < 32 || !constantTimeEqual(expected, supplied)) return null;

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '') || '';
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim() || '';
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim() || '';

  const [supabase, stripe, clerk] = await Promise.all([
    supabaseUrl ? probe(`${supabaseUrl}/auth/v1/health`, { headers: supabaseKey ? { apikey: supabaseKey } : undefined }) : false,
    stripeSecret ? probe('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${stripeSecret}` } }) : false,
    clerkSecret ? probe('https://api.clerk.com/v1/users?limit=1', { headers: { Authorization: `Bearer ${clerkSecret}` } }) : false,
  ]);
  return { supabase, stripe, clerk };
}

export async function GET(request: NextRequest) {
  const oidc = await getVercelOidcToken().catch(() => '');
  const target = pieDeploymentTarget();
  const production = target === 'production';
  const ownerPassword = process.env.AI_SONGS_PASSWORD || '';
  const ownerSecret = process.env.AI_SONGS_SESSION_SECRET || '';
  const supabaseConfigured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
  const webhookConfigured = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const clerkMode = clerkKeyMode();
  const expectedClerkMode = production ? 'live' : 'test';
  const checks = {
    app: true,
    ownerAuth: ownerPassword.length >= 12 && ownerSecret.length >= 32,
    clerk: clerkMode === expectedClerkMode,
    stripe: stripeEnvironmentSafe() && webhookConfigured,
    stripePrices: stripePlanConfigurationReady(),
    supabase: supabaseConfigured && Boolean(oidc),
    mapbox: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
  };

  const coreHealthy = checks.app && checks.ownerAuth && checks.clerk && checks.stripe && checks.stripePrices && checks.supabase;
  const probes = await authorizedProbes(request);

  return NextResponse.json(
    {
      status: coreHealthy ? 'ok' : 'degraded',
      ready: coreHealthy && (!probes || Object.values(probes).every(Boolean)),
      service: 'pie',
      environment: target,
      launch: {
        public: piePublicLaunchEnabled(),
        gated: pieLaunchGateEnabled(),
        configurationReady: pieProductionConfigurationReady(),
      },
      modes: {
        clerk: clerkMode,
        stripe: stripeSecretMode(),
      },
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      timestamp: new Date().toISOString(),
      checks,
      ...(probes ? { probes } : {}),
    },
    {
      status: coreHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
