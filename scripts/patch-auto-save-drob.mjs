import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = 'AUTO_SAVE_DROB_VERSION';

if (!source.includes(marker)) {
  const helperAnchor = `  async function saveCurrentVersion() {`;
  if (!source.includes(helperAnchor)) throw new Error('Could not find saveCurrentVersion anchor for Drob auto-save.');

  source = source.replace(
    helperAnchor,
    `  /* ${marker} */\n  async function saveDrobRenderVersion(drobUrl: string, guideOverride?: Blob, backingOverride?: Blob) {\n    setSaveStatus('Saving Drob vocal as a new Songs version…');\n    try {\n      const [savedDrob, savedGuide, savedBacking] = await Promise.all([\n        urlToBlob(drobUrl),\n        guideOverride ? Promise.resolve(guideOverride) : urlToBlob(guideVocalUrl),\n        backingOverride ? Promise.resolve(backingOverride) : urlToBlob(backingUrl || audioUrl),\n      ]);\n      if (!savedDrob) throw new Error('Could not read the rendered Drob vocal.');\n\n      const saved = await saveVersion({\n        songId: currentSongId,\n        title: songTitle.trim() || 'Untitled Song',\n        prompt,\n        mode,\n        vocalRange,\n        durationMs,\n        instrumental,\n        lyrics: lyrics || undefined,\n        melodyBlob: melodyBlob || undefined,\n        melodyAnalysis: melodyAnalysis || undefined,\n        precisionGuideBlob: precisionGuideBlob || undefined,\n        generatedBlob: generatedBlob || undefined,\n        backingBlob: savedBacking,\n        guideVocalBlob: savedGuide,\n        drobVocalBlob: savedDrob,\n        masterBlob: masterBlob || undefined,\n      });\n\n      setCurrentSongId(saved.song.id);\n      setCurrentVersionNumber(saved.version.versionNumber);\n      setSaveStatus(\`Drob vocal saved automatically · Version \${saved.version.versionNumber}\`);\n      return saved.version.versionNumber;\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? \`Drob vocal rendered, but automatic library save failed: \${error.message}\` : 'Drob vocal rendered, but automatic library save failed.');\n      return undefined;\n    }\n  }\n\n${helperAnchor}`,
  );

  const precisionFrom = `      await waitForConversion(conversionJob.id);\n      setDrobVocalUrl(\`/api/kits/conversion-audio?id=\${encodeURIComponent(String(conversionJob.id))}\`);\n      setDrobStatus('Drob precision vocal is ready.');`;
  const precisionTo = `      await waitForConversion(conversionJob.id);\n      const renderedDrobUrl = \`/api/kits/conversion-audio?id=\${encodeURIComponent(String(conversionJob.id))}\`;\n      setDrobVocalUrl(renderedDrobUrl);\n      const savedVersion = await saveDrobRenderVersion(renderedDrobUrl, guideBlob);\n      setDrobStatus(savedVersion ? \`Drob precision vocal is ready · automatically saved as Version \${savedVersion}.\` : 'Drob precision vocal is ready. Automatic library save did not complete.');`;
  if (!source.includes(precisionFrom)) throw new Error('Could not find precision Drob completion block.');
  source = source.replace(precisionFrom, precisionTo);

  const cleanFrom = `      await waitForConversion(conversionJob.id);\n      setDrobVocalUrl(\`/api/kits/conversion-audio?id=\${encodeURIComponent(String(conversionJob.id))}\`);\n      setDrobStatus('Drob voice is ready. Use the auto-aligned mix below.');`;
  const cleanTo = `      await waitForConversion(conversionJob.id);\n      const renderedDrobUrl = \`/api/kits/conversion-audio?id=\${encodeURIComponent(String(conversionJob.id))}\`;\n      setDrobVocalUrl(renderedDrobUrl);\n      const savedVersion = await saveDrobRenderVersion(renderedDrobUrl, guideVocalBlob, backingBlob);\n      setDrobStatus(savedVersion ? \`Drob voice is ready · automatically saved as Version \${savedVersion}.\` : 'Drob voice is ready. Automatic library save did not complete.');`;
  if (!source.includes(cleanFrom)) throw new Error('Could not find clean-stem Drob completion block.');
  source = source.replace(cleanFrom, cleanTo);

  fs.writeFileSync(path, source);
}

console.log('Auto-saves every completed Drob render as a new Songs Library version.');
