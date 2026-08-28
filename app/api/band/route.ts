import { auth, clerkClient } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type BandPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorImage?: string;
  kind: 'idea' | 'song' | 'lyrics' | 'arrangement' | 'mix';
  body: string;
  projectTitle?: string;
  parentId?: string;
  createdAt: string;
};

const ALLOWED_KINDS = new Set(['idea', 'song', 'lyrics', 'arrangement', 'mix']);
const MAX_POSTS = 28;

function postsFromMetadata(value: unknown): BandPost[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BandPost => {
    if (!item || typeof item !== 'object') return false;
    const post = item as Record<string, unknown>;
    return typeof post.id === 'string' && typeof post.authorId === 'string' && typeof post.authorName === 'string' && typeof post.body === 'string' && typeof post.createdAt === 'string' && ALLOWED_KINDS.has(String(post.kind));
  }).slice(0, MAX_POSTS);
}

async function bandContext() {
  const session = await auth();
  if (!session.isAuthenticated || !session.userId) throw new Error('AUTH_REQUIRED');
  if (!session.orgId) throw new Error('BAND_REQUIRED');
  const client = await clerkClient();
  const organization = await client.organizations.getOrganization({ organizationId: session.orgId, includeMembersCount: true });
  return { session, client, organization };
}

export async function GET(req: Request) {
  const limited = rateLimit(req, 'band-read', 40, 60_000);
  if (limited) return limited;
  try {
    const { session, client, organization } = await bandContext();
    const memberships = await client.organizations.getOrganizationMembershipList({ organizationId: organization.id, limit: 100 });
    const members = memberships.data.map((membership) => {
      const publicUserData = membership.publicUserData;
      const name = [publicUserData?.firstName, publicUserData?.lastName].filter(Boolean).join(' ') || publicUserData?.identifier || 'Band member';
      return {
        userId: publicUserData?.userId || '',
        name,
        role: membership.role,
        imageUrl: publicUserData?.imageUrl || undefined,
      };
    });
    const privateMetadata = organization.privateMetadata as Record<string, unknown> | undefined;
    const posts = postsFromMetadata(privateMetadata?.aiSongsBandPosts);
    return NextResponse.json({
      active: true,
      band: { id: organization.id, name: organization.name },
      role: session.orgRole,
      posts,
      members,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in to use Band.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (message === 'BAND_REQUIRED') return NextResponse.json({ active: false, posts: [], members: [] }, { headers: { 'Cache-Control': 'no-store' } });
    console.error('band read failed', error);
    return NextResponse.json({ error: 'Could not load the Band workspace.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'band-write', 18, 60_000);
  if (limited) return limited;
  try {
    const { session, client, organization } = await bandContext();
    const body = await readJsonObject(req, 24_000);
    const action = textField(body.action, 30);
    if (action !== 'post') throw new Error('INVALID_ACTION');

    const kind = textField(body.kind, 30, 'idea');
    if (!ALLOWED_KINDS.has(kind)) throw new Error('INVALID_KIND');
    const contribution = textField(body.body, 320);
    if (!contribution) throw new Error('EMPTY_POST');
    const projectTitle = textField(body.projectTitle, 120);
    const parentId = textField(body.parentId, 120);

    const user = await client.users.getUser(session.userId);
    const authorName = user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Band member';
    const privateMetadata = organization.privateMetadata as Record<string, unknown> | undefined;
    const existing = postsFromMetadata(privateMetadata?.aiSongsBandPosts);
    const post: BandPost = {
      id: `band_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      authorId: session.userId,
      authorName: authorName.slice(0, 80),
      authorImage: user.imageUrl || undefined,
      kind: kind as BandPost['kind'],
      body: contribution,
      projectTitle: projectTitle || undefined,
      parentId: parentId || undefined,
      createdAt: new Date().toISOString(),
    };
    const nextPosts = [post, ...existing].slice(0, MAX_POSTS);
    await client.organizations.updateOrganizationMetadata(organization.id, { privateMetadata: { aiSongsBandPosts: nextPosts } as never });
    return NextResponse.json({ ok: true, post }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'AUTH_REQUIRED') return NextResponse.json({ error: 'Sign in to use Band.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    if (message === 'BAND_REQUIRED') return NextResponse.json({ error: 'Join or create a Band first.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    if (['INVALID_ACTION', 'INVALID_KIND', 'EMPTY_POST'].includes(message)) return NextResponse.json({ error: 'Invalid Band contribution.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    console.error('band write failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not share with the Band.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
