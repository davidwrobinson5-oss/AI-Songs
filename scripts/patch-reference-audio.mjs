import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Reference-audio patch source block not found: ${from.slice(0, 80)}`);
  source = source.replace(from, to);
}

replaceOnce(
  "  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);",
  "  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);\n  const [referenceAudioBlob, setReferenceAudioBlob] = useState<Blob | null>(null);\n  const [referenceAudioUrl, setReferenceAudioUrl] = useState('');\n  const [referenceAudioName, setReferenceAudioName] = useState('');\n  const [referenceAudioDurationMs, setReferenceAudioDurationMs] = useState(30000);",
);

replaceOnce(
`      const res = await fetch('/api/elevenlabs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: productionPrompt, music_length_ms: durationMs, force_instrumental: instrumental }),
      });`,
`      let res: Response;
      if (referenceAudioBlob) {
        const form = new FormData();
        form.append('file', referenceAudioBlob, referenceAudioName || 'reference-audio');
        form.append('prompt', productionPrompt);
        form.append('music_length_ms', String(durationMs));
        form.append('reference_duration_ms', String(Math.min(30000, Math.max(50, referenceAudioDurationMs))));
        form.append('force_instrumental', String(instrumental));
        res = await fetch('/api/elevenlabs/generate-reference', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/elevenlabs/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: productionPrompt, music_length_ms: durationMs, force_instrumental: instrumental }),
        });
      }`,
);

replaceOnce(
`            <div>
              <div className="controlLabel">Generation length</div>`,
`            <div className="playerCard">
              <strong>Reference audio</strong>
              <small>Optional: upload music to guide the sound, instrumentation, tempo, groove, mood, and production style of a new Music v2 generation.</small>
              <label className="secondary">
                🎧 Upload Reference Audio
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
                    const url = URL.createObjectURL(file);
                    setReferenceAudioBlob(file);
                    setReferenceAudioUrl(url);
                    setReferenceAudioName(file.name);
                    setReferenceAudioDurationMs(30000);
                    const probe = new Audio(url);
                    probe.onloadedmetadata = () => {
                      if (Number.isFinite(probe.duration)) setReferenceAudioDurationMs(Math.min(30000, Math.max(50, Math.round(probe.duration * 1000))));
                    };
                  }}
                />
              </label>
              {referenceAudioUrl && (
                <>
                  <small>{referenceAudioName} · up to the first {Math.round(Math.min(30000, referenceAudioDurationMs) / 1000)} sec will guide the generation</small>
                  <audio controls src={referenceAudioUrl} />
                  <button className="secondary" onClick={() => {
                    URL.revokeObjectURL(referenceAudioUrl);
                    setReferenceAudioBlob(null);
                    setReferenceAudioUrl('');
                    setReferenceAudioName('');
                    setReferenceAudioDurationMs(30000);
                  }}>Remove Reference</button>
                </>
              )}
            </div>

            <div>
              <div className="controlLabel">Generation length</div>`,
);

replaceOnce(
`    setGeneratedBlob(null);
    setAudioUrl('');`,
`    setGeneratedBlob(null);
    if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
    setReferenceAudioBlob(null);
    setReferenceAudioUrl('');
    setReferenceAudioName('');
    setReferenceAudioDurationMs(30000);
    setAudioUrl('');`,
);

fs.writeFileSync(path, source);
console.log('Added Music First reference-audio upload and Music v2 conditioning.');
