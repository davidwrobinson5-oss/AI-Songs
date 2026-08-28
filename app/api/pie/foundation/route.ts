import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const modules = {
  studio: ['music', 'vocal', 'mix', 'sheets'],
  songs: ['projects', 'versions', 'assets'],
  band: ['members', 'posts', 'permissions'],
  brand: ['assets', 'photos', 'videos', 'references', 'templates'],
  launch: ['releases', 'campaigns', 'social', 'contests', 'giveaways', 'followUps'],
  fans: ['contacts', 'segments', 'consent', 'activity', 'messaging'],
  analytics: ['campaigns', 'fans', 'social', 'releases'],
} as const;

export async function GET() {
  return NextResponse.json({
    product: 'Pie',
    foundationVersion: 1,
    modules,
    databaseConfigured: Boolean(process.env.DATABASE_URL),
    storageConfigured: Boolean(process.env.PIE_STORAGE_PROVIDER),
    providers: {
      email: Boolean(process.env.RESEND_API_KEY),
      smsVoice: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
      physicalMail: Boolean(process.env.LOB_API_KEY),
      musicDistribution: Boolean(process.env.DISTRIBUTION_PROVIDER && process.env.DISTRIBUTION_API_KEY),
      tiktok: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
      youtube: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
