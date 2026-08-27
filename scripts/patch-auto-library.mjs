import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Auto-library patch source block not found: ${from.slice(0, 100)}`);
  source = source.replace(from, to);
}

replaceOnce(
`      const blob = await res.blob();
      setGeneratedBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (instrumental) setBackingUrl(url);`,
`      const blob = await res.blob();
      setGeneratedBlob(blob);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (instrumental) setBackingUrl(url);

      try {
        const saved = await saveVersion({
          songId: currentSongId,
          title: songTitle.trim() || 'Untitled Song',
          prompt,
          mode,
          vocalRange,
          durationMs,
          instrumental,
          lyrics: lyrics || undefined,
          melodyBlob: melodyBlob || undefined,
          melodyAnalysis: melodyAnalysis || undefined,
          precisionGuideBlob: precisionGuideBlob || undefined,
          generatedBlob: blob,
          backingBlob: instrumental ? blob : undefined,
        });
        setCurrentSongId(saved.song.id);
        setCurrentVersionNumber(saved.version.versionNumber);
        setSaveStatus(\`Auto-saved to Songs · Version \${saved.version.versionNumber}\`);
      } catch (saveError) {
        setSaveStatus(saveError instanceof Error ? \`Music created, but auto-save failed: \${saveError.message}\` : 'Music created, but auto-save failed.');
      }`,
);

replaceOnce(
`  function newSong() {`,
`  function bestSavedAudio(version: SavedVersion) {
    return version.masterBlob || version.generatedBlob || version.backingBlob;
  }

  function safeDownloadName(value: string) {
    return value.replace(/[^a-z0-9-_ ]+/gi, '').trim().replace(/\\s+/g, '-') || 'ai-song';
  }

  function playSavedVersion(version: SavedVersion) {
    const blob = bestSavedAudio(version);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => URL.revokeObjectURL(url);
    void audio.play();
  }

  function downloadSavedVersion(song: SavedSong, version: SavedVersion) {
    const blob = bestSavedAudio(version);
    if (!blob) return;
    const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') ? 'm4a' : 'mp3';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = \`${safeDownloadName(song.title)}-v\${version.versionNumber}.\${extension}\`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function shareSavedVersion(song: SavedSong, version: SavedVersion) {
    const blob = bestSavedAudio(version);
    if (!blob) return;
    const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') ? 'm4a' : 'mp3';
    const file = new File([blob], \`${safeDownloadName(song.title)}-v\${version.versionNumber}.\${extension}\`, { type: blob.type || 'audio/mpeg' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: song.title, text: \`${song.title} — Version \${version.versionNumber}\`, files: [file] });
      } else {
        downloadSavedVersion(song, version);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      downloadSavedVersion(song, version);
    }
  }

  function newSong() {`,
);

replaceOnce(
`          <p className="sub">Saved locally on this device so your audio, lyrics, melodies, and versions survive refreshes.</p>
          <button className="primary" onClick={newSong}>＋ New Song</button>`,
`          <p className="sub">Every generated track is saved automatically in your music library on this device. Play it, edit the project, download the audio, or share it from your phone.</p>`,
);

replaceOnce(
`              {(versionsBySong[song.id] || []).map((version) => (
                <button className="secondary" key={version.id} onClick={() => loadSavedVersion(song, version)}>
                  Open Version {version.versionNumber} · {new Date(version.createdAt).toLocaleString()}
                </button>
              ))}`,
`              {(versionsBySong[song.id] || []).map((version) => (
                <div className="playerCard" key={version.id}>
                  <strong>Version {version.versionNumber}</strong>
                  <small>{new Date(version.createdAt).toLocaleString()}</small>
                  <div className="mixButtons">
                    <button className="secondary" onClick={() => playSavedVersion(version)} disabled={!bestSavedAudio(version)}>▶ Play</button>
                    <button className="secondary" onClick={() => loadSavedVersion(song, version)}>✏️ Edit</button>
                    <button className="secondary" onClick={() => downloadSavedVersion(song, version)} disabled={!bestSavedAudio(version)}>⬇ Download</button>
                    <button className="secondary" onClick={() => shareSavedVersion(song, version)} disabled={!bestSavedAudio(version)}>↗ Share</button>
                  </div>
                </div>
              ))}`,
);

fs.writeFileSync(path, source);
console.log('Enabled automatic Songs library storage with Play, Edit, Download, and Share actions.');
