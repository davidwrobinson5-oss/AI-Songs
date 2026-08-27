'use client';

import type { MelodyAnalysis } from './MelodyWorkspace';

export type SavedSong = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type SavedVersion = {
  id: string;
  songId: string;
  versionNumber: number;
  createdAt: string;
  prompt: string;
  mode: 'music' | 'lyrics' | 'melody';
  vocalRange: string;
  durationMs: number;
  instrumental: boolean;
  lyrics?: string;
  melodyBlob?: Blob;
  melodyAnalysis?: MelodyAnalysis;
  precisionGuideBlob?: Blob;
  generatedBlob?: Blob;
  backingBlob?: Blob;
  guideVocalBlob?: Blob;
  drobVocalBlob?: Blob;
  masterBlob?: Blob;
};

type SaveVersionInput = Omit<SavedVersion, 'id' | 'songId' | 'versionNumber' | 'createdAt'> & {
  songId?: string;
  title: string;
};

const DB_NAME = 'ai-songs-library';
const DB_VERSION = 1;
const SONGS = 'songs';
const VERSIONS = 'versions';

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

async function openDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    throw new Error('Song saving is not supported in this browser.');
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SONGS)) {
        db.createObjectStore(SONGS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(VERSIONS)) {
        const store = db.createObjectStore(VERSIONS, { keyPath: 'id' });
        store.createIndex('songId', 'songId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the song library.'));
  });
}

export async function saveVersion(input: SaveVersionInput) {
  const db = await openDb();
  try {
    const existingSongId = input.songId;
    let songId = existingSongId;
    let song: SavedSong | undefined;

    if (songId) {
      const tx = db.transaction(SONGS, 'readonly');
      song = await requestToPromise(tx.objectStore(SONGS).get(songId) as IDBRequest<SavedSong | undefined>);
      await transactionDone(tx);
    }

    const now = new Date().toISOString();
    if (!song) {
      songId = uid('song');
      song = { id: songId, title: input.title, createdAt: now, updatedAt: now };
    } else {
      song = { ...song, title: input.title, updatedAt: now };
    }

    const versions = await getSongVersions(songId);
    const versionNumber = versions.reduce((max, version) => Math.max(max, version.versionNumber), 0) + 1;
    const version: SavedVersion = {
      id: uid('version'),
      songId,
      versionNumber,
      createdAt: now,
      prompt: input.prompt,
      mode: input.mode,
      vocalRange: input.vocalRange,
      durationMs: input.durationMs,
      instrumental: input.instrumental,
      lyrics: input.lyrics,
      melodyBlob: input.melodyBlob,
      melodyAnalysis: input.melodyAnalysis,
      precisionGuideBlob: input.precisionGuideBlob,
      generatedBlob: input.generatedBlob,
      backingBlob: input.backingBlob,
      guideVocalBlob: input.guideVocalBlob,
      drobVocalBlob: input.drobVocalBlob,
      masterBlob: input.masterBlob,
    };

    const tx = db.transaction([SONGS, VERSIONS], 'readwrite');
    tx.objectStore(SONGS).put(song);
    tx.objectStore(VERSIONS).put(version);
    await transactionDone(tx);
    return { song, version };
  } finally {
    db.close();
  }
}

export async function listSongs() {
  const db = await openDb();
  try {
    const tx = db.transaction(SONGS, 'readonly');
    const songs = await requestToPromise(tx.objectStore(SONGS).getAll() as IDBRequest<SavedSong[]>);
    await transactionDone(tx);
    return songs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally {
    db.close();
  }
}

export async function getSongVersions(songId: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(VERSIONS, 'readonly');
    const index = tx.objectStore(VERSIONS).index('songId');
    const versions = await requestToPromise(index.getAll(IDBKeyRange.only(songId)) as IDBRequest<SavedVersion[]>);
    await transactionDone(tx);
    return versions.sort((a, b) => b.versionNumber - a.versionNumber);
  } finally {
    db.close();
  }
}

export async function getSong(songId: string) {
  const db = await openDb();
  try {
    const tx = db.transaction(SONGS, 'readonly');
    const song = await requestToPromise(tx.objectStore(SONGS).get(songId) as IDBRequest<SavedSong | undefined>);
    await transactionDone(tx);
    return song;
  } finally {
    db.close();
  }
}
