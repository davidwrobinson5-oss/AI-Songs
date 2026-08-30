'use client';

import { useEffect, useRef } from 'react';
import { useSession } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import {
  exportLocalLibrary,
  importCloudLibrary,
  type SavedSong,
  type SavedVersion,
} from './songStore';

const SUPABASE_URL = 'https://ynkrlatwwwaachijacmb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const LIBRARY_URL = `${SUPABASE_URL}/functions/v1/pie-library`;
const BUCKET = 'pie-song-audio';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type CloudFile = { url: string; type?: string };
type CloudVersion = Omit<SavedVersion,
  'melodyBlob' | 'precisionGuideBlob' | 'generatedBlob' | 'backingBlob' | 'guideVocalBlob' | 'drobVocalBlob' | 'masterBlob'
> & { files?: Record<string, CloudFile> };

type CloudLibrary = {
  songs: SavedSong[];
  versions: CloudVersion[];
};

const blobFields = [
  'melodyBlob',
  'precisionGuideBlob',
  'generatedBlob',
  'backingBlob',
  'guideVocalBlob',
  'drobVocalBlob',
  'masterBlob',
] as const;

type BlobField = (typeof blobFields)[number];

function extensionFor(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('aac')) return 'aac';
  return 'mp3';
}

async function libraryRequest(token: string, body: unknown) {
  const res = await fetch(LIBRARY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Cloud library request failed.');
  return data;
}

async function uploadVersion(token: string, song: SavedSong, version: SavedVersion) {
  const files: Record<string, { path: string; type?: string }> = {};

  for (const field of blobFields) {
    const blob = version[field];
    if (!(blob instanceof Blob) || blob.size === 0) continue;

    const fileName = `${field}.${extensionFor(blob)}`;
    const prepared = await libraryRequest(token, {
      action: 'prepareUpload',
      songId: song.id,
      versionId: version.id,
      fileName,
    });

    const { error } = await supabase.storage
      .from(BUCKET)
      .uploadToSignedUrl(prepared.path, prepared.token, blob, {
        contentType: blob.type || 'application/octet-stream',
        upsert: true,
      });
    if (error) throw error;
    files[field] = { path: prepared.path, type: blob.type || undefined };
  }

  await libraryRequest(token, {
    action: 'upsertVersion',
    song,
    version: {
      id: version.id,
      songId: version.songId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      prompt: version.prompt,
      mode: version.mode,
      vocalRange: version.vocalRange,
      durationMs: version.durationMs,
      instrumental: version.instrumental,
      lyrics: version.lyrics,
      melodyAnalysis: version.melodyAnalysis,
    },
    files,
  });
}

async function cloudVersionToLocal(version: CloudVersion): Promise<SavedVersion> {
  const local: SavedVersion = {
    id: version.id,
    songId: version.songId,
    versionNumber: version.versionNumber,
    createdAt: version.createdAt,
    prompt: version.prompt,
    mode: version.mode,
    vocalRange: version.vocalRange,
    durationMs: version.durationMs,
    instrumental: version.instrumental,
    lyrics: version.lyrics,
    melodyAnalysis: version.melodyAnalysis,
  };

  for (const field of blobFields) {
    const file = version.files?.[field];
    if (!file?.url) continue;
    const res = await fetch(file.url, { cache: 'no-store' });
    if (!res.ok) continue;
    const raw = await res.blob();
    local[field] = new Blob([raw], { type: file.type || raw.type || 'application/octet-stream' });
  }
  return local;
}

async function synchronize(token: string) {
  const local = await exportLocalLibrary();
  let cloud = await libraryRequest(token, { action: 'list' }) as CloudLibrary;
  const cloudVersionIds = new Set(cloud.versions.map((version) => version.id));
  const songById = new Map(local.songs.map((song) => [song.id, song]));

  // First preserve everything that exists on this exact browser origin.
  for (const version of local.versions) {
    if (cloudVersionIds.has(version.id)) continue;
    const song = songById.get(version.songId);
    if (!song) continue;
    await uploadVersion(token, song, version);
  }

  // Then merge the shared account library back into this browser's offline cache.
  cloud = await libraryRequest(token, { action: 'list' }) as CloudLibrary;
  const localVersionIds = new Set(local.versions.map((version) => version.id));
  const missingCloudVersions = cloud.versions.filter((version) => !localVersionIds.has(version.id));
  const downloaded: SavedVersion[] = [];
  for (const version of missingCloudVersions) downloaded.push(await cloudVersionToLocal(version));
  await importCloudLibrary(cloud.songs, downloaded);

  window.dispatchEvent(new CustomEvent('pie-library-synced', {
    detail: {
      cloudSongs: cloud.songs.length,
      uploadedVersions: local.versions.filter((version) => !cloudVersionIds.has(version.id)).length,
      downloadedVersions: downloaded.length,
    },
  }));
}

export default function CloudSongSync() {
  const { session, isLoaded } = useSession();
  const running = useRef(false);

  useEffect(() => {
    if (!isLoaded || !session || running.current) return;
    running.current = true;

    let cancelled = false;
    (async () => {
      try {
        const token = await session.getToken();
        if (!token || cancelled) return;
        await synchronize(token);
      } catch (error) {
        console.error('Pie cloud song sync failed:', error);
      } finally {
        running.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [isLoaded, session]);

  return null;
}
