import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from './auth';

type AdminArea = 'support' | 'security';

export async function isPieAdmin(area: AdminArea) {
  try {
    const session = await auth();
    if (session.userId) {
      const user = await currentUser().catch(() => null);
      const metadata = (user?.publicMetadata || {}) as Record<string, unknown>;
      const allowedIds = (process.env.PIE_ADMIN_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
      const areaPermission = area === 'support' ? metadata.pieSupportAdmin === true : metadata.pieSecurityAdmin === true;
      return metadata.pieAdmin === true || areaPermission || allowedIds.includes(session.userId);
    }
  } catch {
    // A legacy session is considered only when that admin mode is explicitly enabled.
  }

  const legacyEnabled = area === 'support'
    ? process.env.PIE_ALLOW_LEGACY_SUPPORT_ADMIN === '1'
    : process.env.PIE_ALLOW_LEGACY_SECURITY_ADMIN === '1';
  if (!legacyEnabled) return false;

  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value || '', process.env.AI_SONGS_SESSION_SECRET);
}
