'use client';

import { useState } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { importRecoveredAudio } from '../songStore';

type RecoveryEntry = {
  filename: string;
  title: string;
  createdAt?: string;
};

type RecoveryManifest = {
  format: string;
  entries: RecoveryEntry[];
};

function mimeFor(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  return 'audio/mpeg';
}

function titleFromFilename(name: string) {
  return name
    .replace(/\.(mp3|wav|m4a|ogg|aac)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Recovered Song';
}

export default function RecoverSongsPage() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function importBundle(file: File) {
    setBusy(true);
    setStatus('Turning up the heat…');
    try {
      const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
      const manifestBytes = archive['pie-recovery-manifest.json'];
      if (!manifestBytes) throw new Error('This is not a Pie recovery bundle.');
      const manifest = JSON.parse(strFromU8(manifestBytes)) as RecoveryManifest;
      if (manifest.format !== 'pie-recovery-v1' || !Array.isArray(manifest.entries)) {
        throw new Error('Unsupported recovery bundle.');
      }

      let imported = 0;
      let skipped = 0;
      for (const entry of manifest.entries) {
        const bytes = archive[entry.filename];
        if (!bytes) continue;
        const blob = new Blob([bytes], { type: mimeFor(entry.filename) });
        const result = await importRecoveredAudio({
          sourceName: entry.filename,
          title: entry.title,
          createdAt: entry.createdAt,
          blob,
        });
        if (result.imported) imported += 1;
        else skipped += 1;
      }

      window.dispatchEvent(new CustomEvent('pie-library-synced'));
      setStatus(`Recovered ${imported} song${imported === 1 ? '' : 's'}${skipped ? ` · ${skipped} already in your library` : ''}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not recover songs.');
    } finally {
      setBusy(false);
    }
  }

  async function importAudioFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setStatus(`Importing ${files.length} audio file${files.length === 1 ? '' : 's'}…`);
    try {
      let imported = 0;
      let skipped = 0;
      for (const file of files) {
        const result = await importRecoveredAudio({
          sourceName: file.name,
          title: titleFromFilename(file.name),
          createdAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
          blob: file,
        });
        if (result.imported) imported += 1;
        else skipped += 1;
      }
      window.dispatchEvent(new CustomEvent('pie-library-synced'));
      setStatus(`Recovered ${imported} song${imported === 1 ? '' : 's'}${skipped ? ` · ${skipped} already in your library` : ''}. Open My Songs to verify them.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import those audio files.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '28px 18px 90px', maxWidth: 620, margin: '0 auto' }}>
      <section className="panel">
        <p className="eyebrow">PIE RECOVERY</p>
        <h1 style={{ marginTop: 0 }}>Recover Songs</h1>
        <p className="sub">Restore old Pie audio from your phone. You can select several MP3, WAV, M4A, or OGG files at once, or import a Pie recovery ZIP.</p>

        <label className="primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Recovering…' : 'Choose Audio Files'}
          <input
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac"
            multiple
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(event) => {
              const selected = Array.from(event.target.files || []);
              if (selected.length) void importAudioFiles(selected);
              event.currentTarget.value = '';
            }}
          />
        </label>

        <label className="secondary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: busy ? 'default' : 'pointer', marginTop: 12 }}>
          Choose Recovery ZIP
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBundle(file);
              event.currentTarget.value = '';
            }}
          />
        </label>

        {status && <div className="statusBox" style={{ marginTop: 14 }}>{status}</div>}
        <a href="/" className="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 12, textDecoration: 'none' }}>Back to Pie</a>
      </section>
    </main>
  );
}
