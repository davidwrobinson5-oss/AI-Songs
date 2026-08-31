'use client';

import { useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import {
  exportLocalLibrary,
  importCloudLibrary,
  type SavedSong,
  type SavedVersion,
} from './songStore';

const PROJECT_ID = 'ynkrlatwwwaachijacmb';
const LIBRARY_URL = '/api/song-library';
const BUCKET = 'pie-song-audio';
const TUS_ENDPOINT = `https://${PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`;

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

function extensionFor(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('mp4') || type.includes('m4a')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('aac')) return 'aac';
  return 'mp3';
}

async function libraryRequest(body: unknown) {
  const res = await fetch(LIBRARY_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Cloud library request failed.');
  return data;
}

function versionMetadata(version: SavedVersion) {
  return {
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
}

function versionNeedsUpload(local: SavedVersion, cloud?: CloudVersion) {
  if (!cloud) return true;
  for (const field of blobFields) {
    const blob = local[field];
    if (blob instanceof Blob && blob.size > 0 && !cloud.files?.[field]?.url) return true;
  }
  return false;
}

function uploadWithTus(blob: Blob, path: string, token: string) {
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: TUS_ENDPOINT,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        'x-signature': token,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: BUCKET,
        objectName: path,
        contentType: blob.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError: (error) => reject(error),
      onSuccess: () => resolve(),
    });

    upload.findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) upload.resumeFromPreviousUpload(previousUploads[0]);
        upload.start();
      })
      .catch(reject);
  });
}

async function uploadVersion(song: SavedSong, version: SavedVersion) {
  // Persist metadata first. If the audio transfer is interrupted, the song and
  // version remain in the permanent library and a later sync retries the blob.
  await libraryRequest({
    action: 'upsertVersion',
    song,
    version: versionMetadata(version),
    files: {},
  });

  const files: Record<string, { path: string; type?: string }> = {};

  for (const field of blobFields) {
    const blob = version[field];
    if (!(blob instanceof Blob) || blob.size === 0) continue;

    const fileName = `${field}.${extensionFor(blob)}`;
    const prepared = await libraryRequest({
      action: 'prepareUpload',
      songId: song.id,
      versionId: version.id,
      fileName,
    });

    await uploadWithTus(blob, prepared.path, prepared.token);
    files[field] = { path: prepared.path, type: blob.type || undefined };
  }

  if (Object.keys(files).length > 0) {
    await libraryRequest({
      action: 'upsertVersion',
      song,
      version: versionMetadata(version),
      files,
    });
  }
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

async function synchronize() {
  const local = await exportLocalLibrary();
  let cloud = await libraryRequest({ action: 'list' }) as CloudLibrary;
  const cloudVersionById = new Map(cloud.versions.map((version) => [version.id, version]));
  const songById = new Map(local.songs.map((song) => [song.id, song]));
  let uploadedVersions = 0;

  for (const version of local.versions) {
    if (!versionNeedsUpload(version, cloudVersionById.get(version.id))) continue;
    const song = songById.get(version.songId);
    if (!song) continue;
    await uploadVersion(song, version);
    uploadedVersions += 1;
  }

  cloud = await libraryRequest({ action: 'list' }) as CloudLibrary;
  const localVersionIds = new Set(local.versions.map((version) => version.id));
  const missingCloudVersions = cloud.versions.filter((version) => !localVersionIds.has(version.id));
  const downloaded: SavedVersion[] = [];
  for (const version of missingCloudVersions) downloaded.push(await cloudVersionToLocal(version));
  await importCloudLibrary(cloud.songs, downloaded);

  window.dispatchEvent(new CustomEvent('pie-library-synced', {
    detail: {
      cloudSongs: cloud.songs.length,
      uploadedVersions,
      downloadedVersions: downloaded.length,
    },
  }));
}

export default function CloudSongSync() {
  const running = useRef(false);
  const queued = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const runSync = async () => {
      if (cancelled) return;
      if (running.current) {
        queued.current = true;
        return;
      }
      running.current = true;
      try {
        await synchronize();
      } catch (error) {
        console.error('Pie cloud song sync failed:', error);
      } finally {
        running.current = false;
        if (queued.current && !cancelled) {
          queued.current = false;
          void runSync();
        }
      }
    };

    const onLibraryChanged = () => { void runSync(); };
    const onOnline = () => { void runSync(); };
    const onFocus = () => { void runSync(); };

    window.addEventListener('pie-local-library-changed', onLibraryChanged);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    void runSync();

    return () => {
      cancelled = true;
      window.removeEventListener('pie-local-library-changed', onLibraryChanged);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
