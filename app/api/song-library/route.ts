import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

const BUCKET = 'pie-song-audio';
const LEGACY_OWNER_ID = 'legacy-studio';

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'audio.bin';
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!key) throw new Error('Cloud song storage is not configured on the server.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveOwnerId() {
  try {
    const clerk = await auth();
    if (clerk.userId) return clerk.userId;
  } catch {
    // Legacy studio sessions do not require Clerk to be signed in.
  }

  const jar = await cookies();
  const validLegacy = await verifySessionToken(
    jar.get(SESSION_COOKIE)?.value,
    process.env.AI_SONGS_SESSION_SECRET,
  );
  return validLegacy ? LEGACY_OWNER_ID : '';
}

async function assertOwnedOrMissing(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  table: 'pie_songs' | 'pie_song_versions',
  id: string,
  ownerId: string,
) {
  const { data, error } = await supabase.from(table).select('owner_id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (data && data.owner_id !== ownerId) throw new Error('This library item belongs to another account.');
}

export async function POST(req: NextRequest) {
  const ownerId = await resolveOwnerId();
  if (!ownerId) return noStore({ error: 'Authentication required.' }, 401);

  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const action = body?.action;

    if (action === 'prepareUpload') {
      const songId = String(body.songId || '');
      const versionId = String(body.versionId || '');
      const fileName = safeFileName(String(body.fileName || 'audio.bin'));
      if (!songId || !versionId) return noStore({ error: 'Missing song/version id.' }, 400);

      const path = `${safeFileName(ownerId)}/${safeFileName(songId)}/${safeFileName(versionId)}/${fileName}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
      if (error || !data?.token) throw error || new Error('Could not create upload URL.');
      return noStore({ path, token: data.token });
    }

    if (action === 'upsertVersion') {
      const song = body.song || {};
      const version = body.version || {};
      const songId = String(song.id || '');
      const versionId = String(version.id || '');
      const versionSongId = String(version.songId || '');
      if (!songId || !versionId || !versionSongId || versionSongId !== songId) {
        return noStore({ error: 'Invalid song version.' }, 400);
      }

      await assertOwnedOrMissing(supabase, 'pie_songs', songId, ownerId);
      await assertOwnedOrMissing(supabase, 'pie_song_versions', versionId, ownerId);

      const { error: songError } = await supabase.from('pie_songs').upsert({
        id: songId,
        owner_id: ownerId,
        title: String(song.title || 'Untitled Song'),
        created_at: song.createdAt || new Date().toISOString(),
        updated_at: song.updatedAt || new Date().toISOString(),
      }, { onConflict: 'id' });
      if (songError) throw songError;

      const { error: versionError } = await supabase.from('pie_song_versions').upsert({
        id: versionId,
        owner_id: ownerId,
        song_id: versionSongId,
        version_number: Number(version.versionNumber || 1),
        created_at: version.createdAt || new Date().toISOString(),
        prompt: String(version.prompt || ''),
        mode: String(version.mode || 'music'),
        vocal_range: String(version.vocalRange || 'Baritone'),
        duration_ms: Number(version.durationMs || 0),
        instrumental: Boolean(version.instrumental),
        lyrics: typeof version.lyrics === 'string' ? version.lyrics : null,
        melody_analysis: version.melodyAnalysis || null,
        files: body.files && typeof body.files === 'object' ? body.files : {},
      }, { onConflict: 'id' });
      if (versionError) throw versionError;

      return noStore({ ok: true });
    }

    if (action === 'list') {
      const { data: songs, error: songsError } = await supabase
        .from('pie_songs')
        .select('id,title,created_at,updated_at')
        .eq('owner_id', ownerId)
        .order('updated_at', { ascending: false });
      if (songsError) throw songsError;

      const { data: versions, error: versionsError } = await supabase
        .from('pie_song_versions')
        .select('id,song_id,version_number,created_at,prompt,mode,vocal_range,duration_ms,instrumental,lyrics,melody_analysis,files')
        .eq('owner_id', ownerId)
        .order('version_number', { ascending: false });
      if (versionsError) throw versionsError;

      const signedVersions = [];
      for (const version of versions || []) {
        const files = version.files && typeof version.files === 'object'
          ? version.files as Record<string, { path?: string; type?: string } | string>
          : {};
        const signedFiles: Record<string, { url: string; type?: string }> = {};

        for (const [key, value] of Object.entries(files)) {
          const path = typeof value === 'string' ? value : value?.path;
          const type = typeof value === 'object' && value ? value.type : undefined;
          if (!path || !path.startsWith(`${safeFileName(ownerId)}/`)) continue;
          const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
          if (data?.signedUrl) signedFiles[key] = { url: data.signedUrl, type };
        }

        signedVersions.push({
          id: version.id,
          songId: version.song_id,
          versionNumber: version.version_number,
          createdAt: version.created_at,
          prompt: version.prompt,
          mode: version.mode,
          vocalRange: version.vocal_range,
          durationMs: version.duration_ms,
          instrumental: version.instrumental,
          lyrics: version.lyrics || undefined,
          melodyAnalysis: version.melody_analysis || undefined,
          files: signedFiles,
        });
      }

      return noStore({
        songs: (songs || []).map((song) => ({
          id: song.id,
          title: song.title,
          createdAt: song.created_at,
          updatedAt: song.updated_at,
        })),
        versions: signedVersions,
      });
    }

    return noStore({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('Song library API failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Cloud library request failed.' }, 500);
  }
}
