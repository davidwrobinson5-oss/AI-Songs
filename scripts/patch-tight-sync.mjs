import fs from 'node:fs';

const path = 'app/DrobMixPlayer.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes("from './vocalAlignment'")) {
  source = source.replace(
    "import { useRef, useState } from 'react';",
    "import { useRef, useState } from 'react';\nimport { analyzeVocalAlignment, type VocalAlignmentPlan } from './vocalAlignment';",
  );
}

source = source.replace(
  "  const [presetName, setPresetName] = useState('Natural');",
  "  const [presetName, setPresetName] = useState('Natural');\n  const [fineTimingMs, setFineTimingMs] = useState(0);",
);

const helperMarker = "function audioBufferToWav(buffer: AudioBuffer) {";
if (!source.includes('function scheduleAlignedVocal(')) {
  const helper = `function scheduleAlignedVocal(\n  context: BaseAudioContext,\n  buffer: AudioBuffer,\n  plan: VocalAlignmentPlan,\n  input: AudioNode,\n  baseStart: number,\n  fineTimingMs: number,\n) {\n  const sources: AudioBufferSourceNode[] = [];\n  const fineSeconds = fineTimingMs / 1000;\n\n  for (const segment of plan.segments) {\n    let sourceStart = segment.sourceStart;\n    let duration = segment.duration;\n    let outputStart = segment.outputStart + fineSeconds;\n\n    if (outputStart < 0) {\n      const trim = -outputStart;\n      sourceStart += trim;\n      duration -= trim;\n      outputStart = 0;\n    }\n    if (duration <= 0.02 || sourceStart >= buffer.duration) continue;\n    duration = Math.min(duration, buffer.duration - sourceStart);\n\n    const sourceNode = context.createBufferSource();\n    const edgeGain = context.createGain();\n    sourceNode.buffer = buffer;\n    sourceNode.connect(edgeGain).connect(input);\n\n    const startTime = baseStart + outputStart;\n    const fade = Math.min(0.012, duration / 6);\n    edgeGain.gain.setValueAtTime(0, startTime);\n    edgeGain.gain.linearRampToValueAtTime(1, startTime + fade);\n    edgeGain.gain.setValueAtTime(1, Math.max(startTime + fade, startTime + duration - fade));\n    edgeGain.gain.linearRampToValueAtTime(0, startTime + duration);\n    sourceNode.start(startTime, sourceStart, duration);\n    sources.push(sourceNode);\n  }\n\n  return sources;\n}\n\nfunction alignmentLabel(plan: VocalAlignmentPlan, fineTimingMs: number) {\n  const offsetMs = Math.round(plan.offsetSeconds * 1000) + fineTimingMs;\n  const confidence = Math.round(plan.confidence * 100);\n  const phrases = plan.segments.length;\n  const method = plan.method === 'tight-sync' ? 'Tight Sync' : 'onset fallback';\n  return \`${'${method}'} · ${'${phrases}'} phrase${'${phrases === 1 ? \'\' : \'s\'}'} · ${'${offsetMs >= 0 ? \'\' : \'−\'}'}${'${Math.abs(offsetMs)}'} ms · ${'${plan.driftMs >= 0 ? \'+\' : \'−\'}'}${'${Math.abs(plan.driftMs)}'} ms drift · ${'${confidence}'}% match\`;\n}\n\n`;
  source = source.replace(helperMarker, helper + helperMarker);
}

const playStart = source.indexOf('  async function playAligned() {');
const renderStart = source.indexOf('  async function renderMaster() {');
if (playStart < 0 || renderStart < 0) throw new Error('Could not find Drob alignment functions.');

const newPlay = `  async function playAligned() {\n    stop();\n    setStatus('Analyzing Drob timing across the full vocal…');\n    try {\n      const { context, backing, guide, drob } = await loadAudio();\n      const alignment = analyzeVocalAlignment(guide, drob);\n      const backingSource = context.createBufferSource();\n      const backingGain = context.createGain();\n      const vocalChain = createVocalChain(context, settings);\n      const master = createMasterBus(context);\n\n      backingSource.buffer = backing;\n      backingGain.gain.value = 0.9;\n      backingSource.connect(backingGain).connect(master.input);\n      vocalChain.output.connect(master.input);\n      master.output.connect(context.destination);\n\n      const startAt = context.currentTime + 0.15;\n      backingSource.start(startAt);\n      const vocalSources = scheduleAlignedVocal(context, drob, alignment, vocalChain.input, startAt, fineTimingMs);\n      sourcesRef.current = [backingSource, ...vocalSources];\n      setStatus(\`${'${presetName}'} polish · ${'${alignmentLabel(alignment, fineTimingMs)}'} · pitch preserved\`);\n    } catch (error) {\n      setStatus(error instanceof Error ? error.message : 'Could not Tight Sync these stems.');\n    }\n  }\n\n`;
source = source.slice(0, playStart) + newPlay + source.slice(renderStart);

const newRenderStart = source.indexOf('  async function renderMaster() {');
const returnStart = source.indexOf('\n  return (', newRenderStart);
if (newRenderStart < 0 || returnStart < 0) throw new Error('Could not replace Drob render function.');

const newRender = `  async function renderMaster() {\n    setRendering(true);\n    setStatus('Rendering pitch-safe Tight Sync Drob master…');\n    if (masterUrl) {\n      URL.revokeObjectURL(masterUrl);\n      setMasterUrl('');\n    }\n    try {\n      const { backing, guide, drob } = await loadAudio();\n      const alignment = analyzeVocalAlignment(guide, drob);\n      const sampleRate = 44100;\n      const fineSeconds = fineTimingMs / 1000;\n      const finalVocalEnd = alignment.segments.reduce((max, segment) => Math.max(max, segment.outputStart + fineSeconds + segment.duration), 0);\n      const totalDuration = Math.max(backing.duration, finalVocalEnd) + 1.4;\n      const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);\n      const backingSource = offline.createBufferSource();\n      const backingGain = offline.createGain();\n      const vocalChain = createVocalChain(offline, settings);\n      const master = createMasterBus(offline);\n\n      backingSource.buffer = backing;\n      backingGain.gain.value = 0.9;\n      backingSource.connect(backingGain).connect(master.input);\n      vocalChain.output.connect(master.input);\n      master.output.connect(offline.destination);\n\n      backingSource.start(0);\n      scheduleAlignedVocal(offline, drob, alignment, vocalChain.input, 0, fineTimingMs);\n      const rendered = await offline.startRendering();\n      const wav = audioBufferToWav(rendered);\n      onMasterRendered?.(wav);\n      const url = URL.createObjectURL(wav);\n      setMasterUrl(url);\n      setStatus(\`Polished master rendered · ${'${alignmentLabel(alignment, fineTimingMs)}'} · no speed/pitch shift\`);\n    } catch (error) {\n      setStatus(error instanceof Error ? error.message : 'Could not render the Tight Sync Drob master.');\n    } finally {\n      setRendering(false);\n    }\n  }\n`;
source = source.slice(0, newRenderStart) + newRender + source.slice(returnStart);

const detailClose = `        <label className="controlLabel">Space · {Math.round(settings.space * 100)}%\n          <input type="range" min="0" max="0.24" step="0.01" value={settings.space} onChange={(e) => updateSetting('space', Number(e.target.value))} />\n        </label>\n      </details>`;
const detailReplacement = `        <label className="controlLabel">Space · {Math.round(settings.space * 100)}%\n          <input type="range" min="0" max="0.24" step="0.01" value={settings.space} onChange={(e) => updateSetting('space', Number(e.target.value))} />\n        </label>\n      </details>\n\n      <div className="playerCard">\n        <strong>Timing · Tight Sync</strong>\n        <small>AI Songs matches Drob to the original guide across the whole performance and moves phrase boundaries without changing vocal pitch.</small>\n        <label className="controlLabel">Fine Timing · {fineTimingMs >= 0 ? '+' : ''}{fineTimingMs} ms\n          <input type="range" min="-250" max="250" step="5" value={fineTimingMs} onChange={(e) => setFineTimingMs(Number(e.target.value))} />\n        </label>\n        <button className="secondary" onClick={() => setFineTimingMs(0)}>Reset Fine Timing</button>\n      </div>`;
if (source.includes(detailClose)) source = source.replace(detailClose, detailReplacement);
else if (!source.includes('Timing · Tight Sync')) throw new Error('Could not insert Tight Sync controls.');

source = source.replace(
  '<strong>Drob Vocal Polish + Precision Mix</strong>',
  '<strong>Drob Vocal Polish + Tight Sync Mix</strong>',
);
source = source.replace(
  '<small>Non-destructive cleanup: low-cut, mud reduction, presence, de-essing, compression, air, light room space, and master protection.</small>',
  '<small>Phrase-aware timing correction plus non-destructive cleanup. Tight Sync keeps playback speed at 1.0 so Drob stays in pitch.</small>',
);

fs.writeFileSync(path, source);
console.log('Applied Drob Tight Sync phrase alignment and fine timing controls.');
