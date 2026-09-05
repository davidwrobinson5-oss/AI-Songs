import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const dataRoutes = [
    Boolean(process.env.APOLLO_API_KEY),
    Boolean(process.env.ALEADS_API_KEY || process.env.A_LEADS_API_KEY),
    Boolean(process.env.AUDIENCELAB_API_KEY || process.env.AUDIENCELAB_TOKEN || process.env.AUDIENCELAB_CLIENT_ID),
  ];

  return NextResponse.json({
    websiteIntelligence: Boolean(process.env.SIMILARWEB_API_KEY),
    dataRoutesReady: dataRoutes.filter(Boolean).length,
    dataRoutesTotal: dataRoutes.length,
    streamingAds: Boolean(process.env.VIBE_API_KEY || process.env.VIBE_CLIENT_ID),
    commercialStudio: Boolean(process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
