import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    similarweb: Boolean(process.env.SIMILARWEB_API_KEY),
    apollo: Boolean(process.env.APOLLO_API_KEY),
    aLeads: Boolean(process.env.ALEADS_API_KEY || process.env.A_LEADS_API_KEY),
    vibe: Boolean(process.env.VIBE_API_KEY || process.env.VIBE_CLIENT_ID),
    runway: Boolean(process.env.RUNWAYML_API_SECRET || process.env.RUNWAY_API_KEY),
  });
}
