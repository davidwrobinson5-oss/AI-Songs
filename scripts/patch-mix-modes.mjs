import fs from 'node:fs';

const path = 'app/MixWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Mix modes patch source block not found: ${from.slice(0, 120)}`);
  source = source.replace(from, to);
}

replaceOnce(
`const DEFAULT_MIX: MixSettings = {
  cleanup: 0.62,
  compression: 0.58,
  deEss: 0.54,
  air: 0.4,
  reverb: 0.08,
  delay: 0.03,
  timingMs: 0,
  masterLevel: 0.94,
  glue: 0.5,
};`,
`const DEFAULT_MIX: MixSettings = {
  cleanup: 0.62,
  compression: 0.58,
  deEss: 0.54,
  air: 0.4,
  reverb: 0.08,
  delay: 0.03,
  timingMs: 0,
  masterLevel: 0.94,
  glue: 0.5,
};

type WorkspaceMode = 'mix' | 'remix' | 'master';
type MasterProfileKey = 'streaming' | 'video' | 'loud' | 'dynamic' | 'archive';

const REMIX_STYLES = [
  { id: 'modern-pop', label: 'Modern Pop', prompt: 'modern polished pop, punchy drums, deep controlled bass, bright wide synths, clean contemporary production' },
  { id: 'worship', label: 'Worship / Arena', prompt: 'modern worship and arena pop, spacious guitars and keys, emotional builds, wide drums, uplifting cinematic dynamics' },
  { id: 'hiphop', label: 'Hip-Hop', prompt: 'modern hip-hop, hard drums, deep 808 bass, tasteful keys and textures, strong pocket, polished commercial production' },
  { id: 'rnb', label: 'R&B / Soul', prompt: 'modern R&B and soul, warm bass, rich keys, silky textures, laid-back pocket, premium vocal-friendly production' },
  { id: 'gospel', label: 'Gospel', prompt: 'contemporary gospel, expressive keys and organ, powerful drums and bass, uplifting dynamics, live musical energy' },
  { id: 'funk', label: 'Funk', prompt: 'modern funk, tight live drums, syncopated bass, rhythmic guitar and keys, energetic groove, polished production' },
  { id: 'rock', label: 'Rock', prompt: 'modern rock, powerful live drums, wide guitars, strong bass, energetic dynamics, clean radio-ready production' },
  { id: 'edm', label: 'EDM / Dance', prompt: 'modern electronic dance production, four-on-the-floor energy, powerful low end, bright synths, builds and drops' },
  { id: 'acoustic', label: 'Acoustic', prompt: 'organic acoustic production, natural piano and guitar, warm percussion, intimate dynamics, spacious realistic room sound' },
  { id: 'cinematic', label: 'Cinematic', prompt: 'cinematic production, orchestral textures, deep percussion, emotional swells, wide atmospheric sound design' },
];

const MASTER_PROFILES: Record<MasterProfileKey, { label: string; description: string; masterLevel: number; glue: number }> = {
  streaming: { label: 'Streaming', description: 'Balanced level and controlled dynamics for general music streaming.', masterLevel: 0.9, glue: 0.54 },
  video: { label: 'YouTube / Video', description: 'Clear, present master with a little extra headroom for video platforms.', masterLevel: 0.9, glue: 0.48 },
  loud: { label: 'Loud / Car / Club', description: 'Denser, more aggressive presentation for high-energy playback.', masterLevel: 0.99, glue: 0.76 },
  dynamic: { label: 'Dynamic / Hi-Fi', description: 'More transient impact and breathing room for critical listening.', masterLevel: 0.86, glue: 0.3 },
  archive: { label: 'WAV / Archive', description: 'Conservative full-resolution master for storage or later mastering.', masterLevel: 0.84, glue: 0.24 },
};`,
);

replaceOnce(
`  const [rendering, setRendering] = useState(false);
  const [masterUrl, setMasterUrl] = useState('');`,
`  const [rendering, setRendering] = useState(false);
  const [masterUrl, setMasterUrl] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mix');
  const [remixStyle, setRemixStyle] = useState('modern-pop');
  const [remixCustom, setRemixCustom] = useState('');
  const [remixStrength, setRemixStrength] = useState<'medium' | 'high' | 'xhigh'>('high');
  const [remixing, setRemixing] = useState(false);
  const [remixUrl, setRemixUrl] = useState('');
  const [selectedMasterProfile, setSelectedMasterProfile] = useState<MasterProfileKey>('streaming');
  const effectiveMusicUrl = remixUrl || musicUrl;`,
);

replaceOnce(
`      music: musicUrl,`,
`      music: effectiveMusicUrl,`,
);

source = source.replace(/if \(!musicUrl && !leadVocalUrl\)/g, `if (!effectiveMusicUrl && !leadVocalUrl)`);

replaceOnce(
`  async function renderMaster() {
    if (!effectiveMusicUrl && !leadVocalUrl) {`,
`  async function renderMaster(profileKey: MasterProfileKey = selectedMasterProfile) {
    if (!effectiveMusicUrl && !leadVocalUrl) {`,
);

replaceOnce(
`    setRendering(true);
    setStatus('Rendering full-quality WAV master…');
    try {
      const { buffers, guide } = await decodeAll();`,
`    const profile = MASTER_PROFILES[profileKey];
    setSelectedMasterProfile(profileKey);
    setRendering(true);
    setStatus(\`Rendering \${profile.label} WAV master…\`);
    try {
      const { buffers, guide } = await decodeAll();
      const masterMix = { ...mix, masterLevel: profile.masterLevel, glue: profile.glue };`,
);

replaceOnce(
`      const master = createMasterBus(offline, mix);`,
`      const master = createMasterBus(offline, masterMix);`,
);

replaceOnce(
`      setStatus('Master rendered and saved as a new Songs version.');`,
`      setStatus(\`\${profile.label} master rendered and saved as a new Songs version.\`);`,
);

replaceOnce(
`  const channel = (key: TrackKey, label: string, available: boolean) => (`,
`  async function createRemix() {
    const sourceUrl = effectiveMusicUrl;
    if (!sourceUrl) {
      setStatus('Create or load music before making a remix.');
      return;
    }
    const selectedStyle = REMIX_STYLES.find((style) => style.id === remixStyle) || REMIX_STYLES[0];
    const styleDirection = [selectedStyle.prompt, remixCustom.trim()].filter(Boolean).join(', ');
    setRemixing(true);
    setStatus(\`Building \${selectedStyle.label} remix…\`);
    try {
      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok) throw new Error('Could not load the current backing track.');
      const sourceBlob = await sourceResponse.blob();
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('This browser cannot analyze the remix source.');
      const context = contextRef.current || new AudioContextCtor();
      contextRef.current = context;
      const decoded = await context.decodeAudioData((await sourceBlob.arrayBuffer()).slice(0));
      const durationMs = Math.min(300000, Math.max(3000, Math.round(decoded.duration * 1000)));

      const form = new FormData();
      form.append('file', sourceBlob, 'current-backing.mp3');
      form.append('style', styleDirection);
      form.append('duration_ms', String(durationMs));
      form.append('condition_strength', remixStrength);
      const response = await fetch('/api/elevenlabs/remix', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not create this remix.');
      }
      const blob = await response.blob();
      if (remixUrl) URL.revokeObjectURL(remixUrl);
      setRemixUrl(URL.createObjectURL(blob));
      setStatus(\`\${selectedStyle.label} remix ready. It is now the backing used by Mix and Master until you choose Original.\`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create this remix.');
    } finally {
      setRemixing(false);
    }
  }

  function useOriginalBacking() {
    if (remixUrl) URL.revokeObjectURL(remixUrl);
    setRemixUrl('');
    setStatus('Original backing restored.');
  }

  const channel = (key: TrackKey, label: string, available: boolean) => (`,
);

const returnStart = source.indexOf(`  return (\n    <section className="panel mixConsole">`);
if (returnStart < 0) throw new Error('Mix modes patch could not find MixWorkspace return block.');

source = source.slice(0, returnStart) + `  return (
    <section className="panel mixConsole">
      <div className="mixTopline">
        <div><p className="eyebrow">Finish the record</p><h2>{songTitle || 'Untitled Song'}</h2></div>
        <div className="mixBadge">{workspaceMode === 'mix' ? 'Mix' : workspaceMode === 'remix' ? 'Remix' : 'Master'}</div>
      </div>

      <div className="modeGrid" style={{ marginBottom: 16 }}>
        <button className={workspaceMode === 'mix' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('mix')}>
          <span className="icon">🎚️</span><strong>Mix</strong><small>Balance music, Drob, doubles and harmonies. Shape the vocal and stereo image.</small>
        </button>
        <button className={workspaceMode === 'remix' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('remix')}>
          <span className="icon">🔄</span><strong>Remix</strong><small>Re-produce the backing in a new style while keeping your lead vocal separate.</small>
        </button>
        <button className={workspaceMode === 'master' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('master')}>
          <span className="icon">💿</span><strong>Master</strong><small>Render the current original or remix using an output-focused mastering profile.</small>
        </button>
      </div>

      {remixUrl && <div className="statusBox">🔄 Remix backing is active. Mix and Master are using the remix instead of the original.</div>}

      {workspaceMode === 'mix' && (
        <>
          <div className="mixTransport">
            <button className="primary" onClick={playMix}>▶ Play Mix</button>
            <button className="secondary" onClick={stop}>■ Stop</button>
          </div>

          <div className="mixChannels">
            {channel('music', remixUrl ? 'Remix Music' : 'Music', Boolean(effectiveMusicUrl))}
            {channel('lead', 'Lead Vocal', Boolean(leadVocalUrl))}
            {channel('double', 'Double', Boolean(doubleUrl))}
            {channel('harmony', 'Harmony', Boolean(harmonyUrl))}
          </div>

          <div className="mixUploads">
            <label className="secondary">＋ Add Double<input type="file" accept="audio/*" hidden onChange={(e) => loadUpload('double', e.target.files?.[0])} /></label>
            <label className="secondary">＋ Add Harmony<input type="file" accept="audio/*" hidden onChange={(e) => loadUpload('harmony', e.target.files?.[0])} /></label>
          </div>

          <div className="mixFx">
            <h3>Vocal polish</h3>
            {([['cleanup', 'EQ / Cleanup'], ['compression', 'Compression'], ['deEss', 'De-ess'], ['air', 'Air / Clarity'], ['reverb', 'Reverb'], ['delay', 'Delay']] as Array<[keyof MixSettings, string]>).map(([key, label]) => (
              <label key={key}>{label}<span>{Math.round(mix[key] * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix[key]} onChange={(e) => updateMix(key, Number(e.target.value))} /></label>
            ))}
            <label>Lead timing <span>{mix.timingMs >= 0 ? '+' : ''}{Math.round(mix.timingMs)} ms</span><input type="range" min="-500" max="500" step="5" value={mix.timingMs} onChange={(e) => updateMix('timingMs', Number(e.target.value))} /></label>
          </div>
        </>
      )}

      {workspaceMode === 'remix' && (
        <>
          <div className="playerCard">
            <strong>Choose a remix style</strong>
            <small>The backing is regenerated section-by-section from the current song. Drob stays separate so you keep the same vocal identity.</small>
            <div className="chips" style={{ marginTop: 10 }}>
              {REMIX_STYLES.map((style) => <button key={style.id} className={remixStyle === style.id ? 'chip activeChip' : 'chip'} onClick={() => setRemixStyle(style.id)}>{style.label}</button>)}
            </div>
            <label className="controlLabel">Extra direction</label>
            <textarea value={remixCustom} onChange={(event) => setRemixCustom(event.target.value)} maxLength={500} placeholder="Example: darker drums, warmer piano, more live bass, bigger chorus…" />
          </div>

          <div className="playerCard">
            <strong>How far should it move?</strong>
            <div className="chips">
              <button className={remixStrength === 'xhigh' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('xhigh')}>Keep Close</button>
              <button className={remixStrength === 'high' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('high')}>Balanced</button>
              <button className={remixStrength === 'medium' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('medium')}>More Different</button>
            </div>
            <small>Keep Close follows the original backing more strongly. More Different gives the new style more freedom.</small>
          </div>

          <button className="primary" onClick={createRemix} disabled={remixing || !effectiveMusicUrl}>{remixing ? 'Creating Remix…' : '🔄 Create Remix'}</button>
          {remixUrl && (
            <div className="playerCard">
              <strong>Current remix backing</strong>
              <audio controls src={remixUrl} />
              <div className="mixButtons">
                <button className="primary" onClick={() => setWorkspaceMode('mix')}>Mix This Remix</button>
                <button className="secondary" onClick={useOriginalBacking}>Use Original</button>
              </div>
              <small>The existing lead, double and harmony tracks are not regenerated. They remain available in Mix.</small>
            </div>
          )}
        </>
      )}

      {workspaceMode === 'master' && (
        <>
          <div className="playerCard">
            <strong>Master for the destination</strong>
            <small>These are practical tonal/dynamics profiles, not certified LUFS or true-peak measurements. A future meter can make these targets exact.</small>
            <div className="modeGrid" style={{ marginTop: 10 }}>
              {(Object.entries(MASTER_PROFILES) as Array<[MasterProfileKey, typeof MASTER_PROFILES[MasterProfileKey]]>).map(([key, profile]) => (
                <button key={key} className={selectedMasterProfile === key ? 'modeCard active' : 'modeCard'} onClick={() => setSelectedMasterProfile(key)}>
                  <strong>{profile.label}</strong><small>{profile.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="mixFx">
            <h3>Master fine-tune</h3>
            <label>Master level <span>{Math.round(MASTER_PROFILES[selectedMasterProfile].masterLevel * 100)}%</span></label>
            <label>Glue compression <span>{Math.round(MASTER_PROFILES[selectedMasterProfile].glue * 100)}%</span></label>
          </div>

          <button className="primary" onClick={() => renderMaster(selectedMasterProfile)} disabled={rendering}>{rendering ? 'Rendering Master…' : \`💿 Render \${MASTER_PROFILES[selectedMasterProfile].label} Master\`}</button>
          {masterUrl && <div className="playerCard"><strong>Latest master</strong><audio controls src={masterUrl} /><small>Saved to Songs as a new version. Use Songs to share or download MP3/WAV.</small></div>}
        </>
      )}

      {status && <div className="statusBox">{status}</div>}
    </section>
  );
}
`;

fs.writeFileSync(path, source);
console.log('Added Mix / Remix / Master workspace modes.');
