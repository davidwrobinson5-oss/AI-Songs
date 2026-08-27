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
`              {(versionsBySong[song.id] || []).map((version) => (
                <button className="secondary" key={version.id} onClick={() => loadSavedVersion(song, version)}>
                  Open Version {version.versionNumber} · {new Date(version.createdAt).toLocaleString()}
                </button>
              ))}`,
`              {(versionsBySong[song.id] || []).map((version) => (
                <div className="playerCard" key={version.id}>
                  <strong>Version {version.versionNumber}</strong>
                  <small>{new Date(version.createdAt).toLocaleString()}</small>
                  {(version.masterBlob || version.generatedBlob || version.backingBlob) && (
                    <audio controls src={blobUrl(version.masterBlob || version.generatedBlob || version.backingBlob)} />
                  )}
                  <button className="secondary" onClick={() => loadSavedVersion(song, version)}>
                    Open Version {version.versionNumber}
                  </button>
                </div>
              ))}`,
);

replaceOnce(
`          <p className="sub">Saved locally on this device so your audio, lyrics, melodies, and versions survive refreshes.</p>`,
`          <p className="sub">Every generated track is saved automatically in your music library on this device. Open any version to keep editing vocals, mix, lyrics, or sheets.</p>`,
);

fs.writeFileSync(path, source);
console.log('Enabled automatic Songs library storage for every generated track.');
