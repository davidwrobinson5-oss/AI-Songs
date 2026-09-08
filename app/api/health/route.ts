import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const oidc = await getVercelOidcToken().catch(() => '');
  const checks = {
    app: true,
    clerk: Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    supabase: Boolean(oidc),
    mapbox: Boolean(process.env.MAPBOX_ACCESS_TOKEN),
  };

  const coreHealthy = checks.app && checks.clerk && checks.stripe && checks.supabase;

  return NextResponse.json(
    {
      status: coreHealthy ? 'ok' : 'degraded',
      service: 'pie',
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: coreHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
