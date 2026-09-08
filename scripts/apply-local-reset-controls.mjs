import fs from 'node:fs';

function replaceRequired(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Missing ${label} anchor`);
  return source.replace(needle, replacement);
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(path, after);
    console.log(`updated ${path}`);
  } else {
    console.log(`no changes ${path}`);
  }
}

update('app/page.tsx', (input) => {
  let source = input;

  if (!source.includes('function resetMusicGenerationSettings()')) {
    const anchor = `  function newSong() {\n`;
    const block = `  function resetMusicGenerationSettings() {\n    if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);\n    setReferenceAudioBlob(null);\n    setReferenceAudioUrl('');\n    setReferenceAudioName('');\n    setReferenceAudioDurationMs(30000);\n    setDurationMs(30000);\n    setInstrumental(true);\n    setMusicError('');\n    setResult('');\n    setSaveStatus('Music generation settings reset. Song description, lyrics, melody, and saved Songs were kept.');\n  }\n\n  function clearGeneratedMusic() {\n    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));\n    const urls = [audioUrl, backingUrl, drobVocalUrl, precisionGuideBlob ? '' : guideVocalUrl];\n    for (const url of urls) {\n      if (url && url.startsWith('blob:')) {\n        try { URL.revokeObjectURL(url); } catch {}\n      }\n    }\n    setGeneratedBlob(null);\n    setAudioUrl('');\n    setBackingUrl('');\n    if (!precisionGuideBlob) setGuideVocalUrl('');\n    setDrobVocalUrl('');\n    setMasterBlob(null);\n    setMusicError('');\n    setDrobError('');\n    setDrobStatus('');\n    setResult('');\n    setSaveStatus('Current generated output cleared. Saved Songs and your song setup were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing page newSong anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('onReset={() => {\n                setMelodyBlob(null);')) {
    const anchor = `              onPrecisionGuide={(blob, matchingBacking) => {\n                setPrecisionGuideBlob(blob);\n                setGuideVocalUrl(URL.createObjectURL(blob));\n                if (matchingBacking) setBackingUrl(URL.createObjectURL(matchingBacking));\n                setDrobVocalUrl('');\n              }}\n            />`;
    const replacement = `              onPrecisionGuide={(blob, matchingBacking) => {\n                setPrecisionGuideBlob(blob);\n                setGuideVocalUrl(URL.createObjectURL(blob));\n                if (matchingBacking) setBackingUrl(URL.createObjectURL(matchingBacking));\n                setDrobVocalUrl('');\n              }}\n              onReset={() => {\n                setMelodyBlob(null);\n                setMelodyAnalysis(null);\n                setPrecisionGuideBlob(null);\n                if (guideVocalUrl && precisionGuideBlob) { try { URL.revokeObjectURL(guideVocalUrl); } catch {} }\n                if (precisionGuideBlob) setGuideVocalUrl('');\n                setSaveStatus('Melody workspace reset. Existing song audio and saved Songs were kept.');\n              }}\n              onAnalysisReset={() => {\n                setMelodyAnalysis(null);\n                setPrecisionGuideBlob(null);\n                if (guideVocalUrl && precisionGuideBlob) { try { URL.revokeObjectURL(guideVocalUrl); } catch {} }\n                if (precisionGuideBlob) setGuideVocalUrl('');\n                setSaveStatus('Melody analysis and guide cleared. Melody recording and saved Songs were kept.');\n              }}\n              onGuideReset={() => {\n                setPrecisionGuideBlob(null);\n                if (guideVocalUrl && precisionGuideBlob) { try { URL.revokeObjectURL(guideVocalUrl); } catch {} }\n                if (precisionGuideBlob) setGuideVocalUrl('');\n                setSaveStatus('Precision guide cleared. Existing song audio and saved Songs were kept.');\n              }}\n            />`;
    if (!source.includes(anchor)) throw new Error('Missing MelodyWorkspace callback anchor in page');
    source = source.replace(anchor, replacement);
  }

  if (!source.includes('↺ Reset generation')) {
    const anchor = `            <div className="playerCard">\n              <strong>Reference audio</strong>`;
    const replacement = `            <div className="playerCard">\n              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>\n                <strong>Music generation settings</strong>\n                <button type="button" className="secondary" onClick={resetMusicGenerationSettings} disabled={musicLoading}>↺ Reset generation</button>\n              </div>\n              <small>Reset length, instrumental mode, and reference audio without changing your song description, lyrics, melody, or saved Songs.</small>\n            </div>\n            <div className="playerCard">\n              <strong>Reference audio</strong>`;
    if (!source.includes(anchor)) throw new Error('Missing Reference audio anchor');
    source = source.replace(anchor, replacement);
  }

  if (!source.includes('Clear generated')) {
    const anchor = `                <strong>Generated track</strong><audio controls src={audioUrl} />`;
    const replacement = `                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Generated track</strong><button type="button" className="secondary" onClick={clearGeneratedMusic} disabled={musicLoading}>Clear generated</button></div><audio controls src={audioUrl} />`;
    if (!source.includes(anchor)) throw new Error('Missing Generated track anchor');
    source = source.replace(anchor, replacement);
  }

  return source;
});

update('app/MelodyWorkspace.tsx', (input) => {
  let source = input;

  if (!source.includes('onReset?: () => void;')) {
    source = replaceRequired(
      source,
      `  onPrecisionGuide: (vocalBlob: Blob, backingBlob?: Blob) => void;\n};`,
      `  onPrecisionGuide: (vocalBlob: Blob, backingBlob?: Blob) => void;\n  onReset?: () => void;\n  onAnalysisReset?: () => void;\n  onGuideReset?: () => void;\n};`,
      'Melody props',
    );
  }

  if (!source.includes('onGuideReset }: Props)')) {
    source = replaceRequired(
      source,
      `export default function MelodyWorkspace({ prompt, vocalRange, lyrics, initialBlob, initialAnalysis, initialPrecisionGuide, onLyricsFitted, onMelodyChanged, onPrecisionGuide }: Props) {`,
      `export default function MelodyWorkspace({ prompt, vocalRange, lyrics, initialBlob, initialAnalysis, initialPrecisionGuide, onLyricsFitted, onMelodyChanged, onPrecisionGuide, onReset, onAnalysisReset, onGuideReset }: Props) {`,
      'Melody function signature',
    );
  }

  if (!source.includes('function resetMelodyTake()')) {
    const anchor = `  async function refreshStudioInputs() {`;
    const block = `  function clearPrecisionGuide() {\n    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);\n    setPrecisionGuideUrl('');\n    onGuideReset?.();\n    setStatus('Precision guide cleared. Melody recording and saved Songs were kept.');\n  }\n\n  function clearMelodyAnalysis() {\n    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);\n    setAnalysis(null);\n    setFitScore(null);\n    setFitNotes('');\n    setPrecisionGuideUrl('');\n    onAnalysisReset?.();\n    setStatus('Melody analysis, fit result, and precision guide cleared. Your melody recording and lyric text were kept.');\n  }\n\n  function resetMelodyTake() {\n    if (recording || studioRecording || analyzing || fitting || guideLoading) return;\n    if (audioUrl) URL.revokeObjectURL(audioUrl);\n    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);\n    setMelodyBlob(null);\n    setAudioUrl('');\n    setAnalysis(null);\n    setFitScore(null);\n    setFitNotes('');\n    setPrecisionGuideUrl('');\n    onReset?.();\n    setStatus('Melody take reset. Song description, lyric text, existing song audio, and saved Songs were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing Melody reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('Clear melody</button>')) {
    source = replaceRequired(
      source,
      `        <strong>1. Record or upload your melody</strong>`,
      `        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>1. Record or upload your melody</strong><button type="button" className="secondary" onClick={resetMelodyTake} disabled={recording||studioRecording||analyzing||fitting||guideLoading||(!melodyBlob&&!analysis&&!precisionGuideUrl)}>Clear melody</button></div>`,
      'Melody clear button',
    );
  }

  if (!source.includes('Clear analysis</button>')) {
    source = replaceRequired(
      source,
      `          <strong>Melody map</strong>`,
      `          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Melody map</strong><button type="button" className="secondary" onClick={clearMelodyAnalysis} disabled={analyzing||fitting||guideLoading}>Clear analysis</button></div>`,
      'Melody analysis clear button',
    );
  }

  if (!source.includes('Clear guide</button>')) {
    source = replaceRequired(
      source,
      `          <strong>Precision Vocal Engine — Mureka</strong>`,
      `          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Precision Vocal Engine — Mureka</strong>{precisionGuideUrl&&<button type="button" className="secondary" onClick={clearPrecisionGuide} disabled={guideLoading}>Clear guide</button>}</div>`,
      'Melody guide clear button',
    );
  }

  return source;
});

update('app/VoiceWorkspace.tsx', (input) => {
  let source = input;

  if (!source.includes('function resetVocalSettings()')) {
    const anchor = `  async function startRecording() {`;
    const block = `  function discardRenderedVocal() {\n    if (renderedUrl) URL.revokeObjectURL(renderedUrl);\n    setRenderedUrl('');\n    setRenderedBlob(null);\n  }\n\n  function resetVocalSettings() {\n    stopPreview();\n    discardRenderedVocal();\n    setPresetName('Natural');\n    setSettings({ ...PRESETS.Natural });\n    setStatus('Vocal settings reset to Natural. Recorded takes, the song, and saved Songs were kept.');\n  }\n\n  function clearVocalTakes() {\n    if (recording) return;\n    stopPreview();\n    discardRenderedVocal();\n    for (const take of takes) URL.revokeObjectURL(take.url);\n    setTakes([]);\n    setSelectedId('');\n    setStatus('Current vocal takes cleared. The backing track and saved Songs were kept.');\n  }\n\n  function clearRenderedVocal() {\n    discardRenderedVocal();\n    setStatus('Current polished render cleared. Recorded takes and saved Songs were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing Voice reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('Clear takes</button>')) {
    source = replaceRequired(
      source,
      `          <h2>Vocal takes</h2>`,
      `          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Vocal takes</h2><button type="button" className="secondary" onClick={clearVocalTakes} disabled={recording||takes.length===0}>Clear takes</button></div>`,
      'Voice clear takes button',
    );
  }

  if (!source.includes('Reset settings</button>')) {
    source = replaceRequired(
      source,
      `          <h2>Perfect the vocal</h2>`,
      `          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Perfect the vocal</h2><button type="button" className="secondary" onClick={resetVocalSettings}>↺ Reset settings</button></div>`,
      'Voice reset settings button',
    );
  }

  if (!source.includes('Clear render</button>')) {
    source = replaceRequired(
      source,
      `          <h2>Polished vocal</h2>`,
      `          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Polished vocal</h2><button type="button" className="secondary" onClick={clearRenderedVocal}>Clear render</button></div>`,
      'Voice clear render button',
    );
  }

  return source;
});

update('app/MixWorkspace.tsx', (input) => {
  let source = input;

  if (!source.includes('function resetMixControls()')) {
    const anchor = `  function loadUpload(kind: 'double' | 'harmony', file?: File) {`;
    const block = `  function resetMixControls() {\n    stop();\n    setTracks({\n      music: { ...DEFAULT_TRACKS.music },\n      lead: { ...DEFAULT_TRACKS.lead },\n      double: { ...DEFAULT_TRACKS.double },\n      harmony: { ...DEFAULT_TRACKS.harmony },\n    });\n    setMix({ ...DEFAULT_MIX });\n    setStatus('Mix and track controls reset. Source audio, uploaded doubles/harmonies, remix audio, and saved Songs were kept.');\n  }\n\n  function resetRemixControls() {\n    setRemixStyle('modern-pop');\n    setRemixCustom('');\n    setRemixStrength('high');\n    setStatus('Remix settings reset. Current remix audio and saved Songs were kept.');\n  }\n\n  function resetMasterControls() {\n    setSelectedMasterProfile('streaming');\n    setExportQuality('studio');\n    setMasterSampleRate(48000);\n    setMasterMetrics(null);\n    setStatus('Master settings reset to Streaming · Studio · 48 kHz. Source audio and saved Songs were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing Mix reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('↺ Reset mix')) {
    source = replaceRequired(
      source,
      `            <button className="secondary" onClick={stop}>■ Stop</button>`,
      `            <button className="secondary" onClick={stop}>■ Stop</button>\n            <button type="button" className="secondary" onClick={resetMixControls}>↺ Reset mix</button>`,
      'Mix reset button',
    );
  }

  if (!source.includes('↺ Reset remix')) {
    source = replaceRequired(
      source,
      `            <strong>Choose a remix style</strong>`,
      `            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Choose a remix style</strong><button type="button" className="secondary" onClick={resetRemixControls} disabled={remixing}>↺ Reset remix</button></div>`,
      'Remix reset button',
    );
  }

  if (!source.includes('↺ Reset master')) {
    source = replaceRequired(
      source,
      `            <strong>Master for the destination</strong>`,
      `            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Master for the destination</strong><button type="button" className="secondary" onClick={resetMasterControls} disabled={rendering}>↺ Reset master</button></div>`,
      'Master reset button',
    );
  }

  return source;
});

update('app/AudioProcessorWorkspace.tsx', (input) => {
  let source = input;

  if (!source.includes('function clearCurrentProcessingView()')) {
    const anchor = `  useEffect(()=>{\n    const saved=readLibrary();`;
    const block = `  function clearCurrentProcessingView() {\n    if (busy) return;\n    if (Object.keys(jobs).length && !window.confirm('Clear the current Sheets processing view? Processing jobs are not cancelled, and the saved session stays in your Sheets & Stems library.')) return;\n    localStorage.removeItem(ACTIVE_KEY);\n    setSessionId('');\n    setSourceName('');\n    setJobs({});\n    setStatuses({});\n    setChords([]);\n    setStemStarted(false);\n    setStatus('Current processing view cleared. Saved sheet/stem sessions and saved Songs were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing AudioProcessor reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('Clear current</button>')) {
    source = replaceRequired(
      source,
      `      <h2 style={{marginTop:4}}>Audio → Sheets & Stems</h2>`,
      `      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2 style={{marginTop:4}}>Audio → Sheets & Stems</h2><button type="button" className="secondary" onClick={clearCurrentProcessingView} disabled={busy||(!sourceName&&!Object.keys(jobs).length)}>Clear current</button></div>`,
      'Sheets processing clear button',
    );
  }

  return source;
});

update('app/SheetImportTools.tsx', (input) => {
  let source = input;

  if (!source.includes('function resetSheetChoices()')) {
    const anchor = `  const chooser=(items:Array<{part:ScorePart;index:number}>)=>`;
    const block = `  function resetSheetChoices() {\n    if (scoreBusy || renderBusy || linkBusy) return;\n    for (const item of renders) URL.revokeObjectURL(item.url);\n    setSelected({});\n    setFullArrangement(false);\n    setRenders([]);\n    setShowRenderConfirm(false);\n    setConfirmKey(score?.key || '');\n    setConfirmBpm(Math.max(35, Math.min(240, Math.round(Number(score?.tempo) || 100))));\n    setConfirmTimeSignature(score?.timeSignature || '4/4');\n    setConfirmVocalRange(vocalRange || 'Baritone');\n    setConfirmRenderMode('Hybrid');\n    setSavedSongId('');\n    setLinkOutputs({stems:true,fullSheet:true,partSheets:false,chords:true});\n    setScoreStatus('Sheet render choices reset. The analyzed score, active processing jobs, and saved Songs were kept.');\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing SheetImportTools reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('↺ Reset choices')) {
    source = replaceRequired(
      source,
      `        <h3>What parts do you want to render?</h3>`,
      `        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h3>What parts do you want to render?</h3><button type="button" className="secondary" onClick={resetSheetChoices} disabled={scoreBusy||renderBusy||linkBusy}>↺ Reset choices</button></div>`,
      'Sheet choices reset button',
    );
  }

  return source;
});

update('app/SongAnalysisWorkspace.tsx', (input) => {
  let source = input;

  if (!source.includes('function resetSongAnalysis()')) {
    const anchor = `  function apply(){`;
    const block = `  function resetSongAnalysis() {\n    if (busy) return;\n    setAnalysis(null);\n    setStatus('Analysis reset. Choose MIDI, music sheets, or a lyric/chord chart to analyze again.');\n    setChordText('');\n    setShowChordPaste(false);\n    setKey('Unknown');\n    setBpm(null);\n    setTimeSignature('4/4');\n    setTargetRange(RANGES.includes(vocalRange) ? vocalRange : 'Baritone');\n    setShift(0);\n    setRenderMode('Hybrid');\n    setSelectedParts(new Set(['Full Arrangement']));\n    setApplied('');\n    try { sessionStorage.removeItem('pie-last-analyzed-score'); } catch {}\n  }\n\n`;
    if (!source.includes(anchor)) throw new Error('Missing SongAnalysis reset function anchor');
    source = source.replace(anchor, block + anchor);
  }

  if (!source.includes('↺ Reset analysis')) {
    source = replaceRequired(
      source,
      `    <h2>Upload → Detect → Fit → Render</h2>`,
      `    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h2>Upload → Detect → Fit → Render</h2><button type="button" className="secondary" onClick={resetSongAnalysis} disabled={busy}>↺ Reset analysis</button></div>`,
      'Song analysis reset button',
    );
  }

  return source;
});

console.log('Local reset source migration complete.');
