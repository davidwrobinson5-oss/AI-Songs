import fs from 'node:fs';

const path='app/CloudSongSync.tsx';
let source=fs.readFileSync(path,'utf8');

const oldDownloader=`async function cloudVersionToLocal(version: CloudVersion): Promise<SavedVersion> {
  const local = cloudMetadataVersion(version);

  for (const field of blobFields) {
    const file = version.files?.[field];
    if (!file?.url) continue;
    try {
      const res = await fetch(file.url, { cache: 'no-store' });
      if (!res.ok) continue;
      const raw = await res.blob();
      local[field] = new Blob([raw], { type: file.type || raw.type || 'application/octet-stream' });
    } catch (error) {
      console.warn(\`Pie cloud audio restore skipped \${field}:\`, error);
    }
  }
  return local;
}`;

const fastDownloader=`async function cloudVersionToLocal(version: CloudVersion): Promise<SavedVersion> {
  const local = cloudMetadataVersion(version);
  // Songs only needs one good playback source to make the thumbnail usable.
  // Prefer the mastered track, then the generated track, then backing audio.
  const field = (['masterBlob','generatedBlob','backingBlob'] as const).find((candidate) => Boolean(version.files?.[candidate]?.url));
  if (!field) return local;
  const file = version.files?.[field];
  if (!file?.url) return local;
  try {
    const res = await fetch(file.url, { cache: 'no-store' });
    if (!res.ok) return local;
    const raw = await res.blob();
    if (raw.size > 0) local[field] = new Blob([raw], { type: file.type || raw.type || 'application/octet-stream' });
  } catch (error) {
    console.warn(\`Pie cloud playback restore skipped \${field}:\`, error);
  }
  return local;
}`;

if(!source.includes(fastDownloader)){
  if(!source.includes(oldDownloader))throw new Error('Cloud version downloader not found.');
  source=source.replace(oldDownloader,fastDownloader);
}

const oldRestore=`  const refreshedLocal = await exportLocalLibrary();
  const localVersionById = new Map(refreshedLocal.versions.map((version) => [version.id, version]));
  const cloudVersionsNeedingAudio = cloud.versions.filter((version) => {
    const localVersion = localVersionById.get(version.id);
    if (!localVersion) return true;
    return blobFields.some((field) => {
      if (!version.files?.[field]?.url) return false;
      const blob = localVersion[field];
      return !(blob instanceof Blob) || blob.size === 0;
    });
  });
  const downloaded: SavedVersion[] = [];
  for (const version of cloudVersionsNeedingAudio) {
    try { downloaded.push(await cloudVersionToLocal(version)); }
    catch (error) { console.error('Pie cloud version restore skipped:', error); }
  }
  if (downloaded.length) await importCloudLibrary([], downloaded);`;

const fastRestore=`  const refreshedLocal = await exportLocalLibrary();
  const playbackFields = ['masterBlob','generatedBlob','backingBlob'] as const;
  const localPlayableSongIds = new Set(
    refreshedLocal.versions
      .filter((version) => playbackFields.some((field) => {
        const blob = version[field];
        return blob instanceof Blob && blob.size > 0;
      }))
      .map((version) => version.songId),
  );
  const scheduledSongIds = new Set<string>();
  const cloudVersionsNeedingAudio = cloud.versions.filter((version) => {
    if (localPlayableSongIds.has(version.songId) || scheduledSongIds.has(version.songId)) return false;
    const hasCloudPlayback = playbackFields.some((field) => Boolean(version.files?.[field]?.url));
    if (!hasCloudPlayback) return false;
    scheduledSongIds.add(version.songId);
    return true;
  });

  let downloadedVersions = 0;
  for (const version of cloudVersionsNeedingAudio) {
    try {
      const restored = await cloudVersionToLocal(version);
      const playable = playbackFields.some((field) => {
        const blob = restored[field];
        return blob instanceof Blob && blob.size > 0;
      });
      if (!playable) continue;
      await importCloudLibrary([], [restored]);
      downloadedVersions += 1;
      // Enable this song's thumbnail immediately instead of waiting for every
      // other cloud song to finish restoring.
      window.dispatchEvent(new CustomEvent('pie-library-synced', {
        detail: { cloudSongs: cloud.songs.length, uploadedVersions, downloadedVersions },
      }));
    } catch (error) {
      console.error('Pie cloud playback restore skipped:', error);
    }
  }`;

if(!source.includes(fastRestore)){
  if(!source.includes(oldRestore))throw new Error('Patched cloud audio restore block not found.');
  source=source.replace(oldRestore,fastRestore);
}

fs.writeFileSync(path,source);
console.log('Cloud Songs now restore one playable track per song and enable thumbnails immediately.');
