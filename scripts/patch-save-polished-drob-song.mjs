import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = 'SAVE_POLISHED_DROB_AS_SONG';

if (!source.includes(marker)) {
  const from = `<DrobMixPlayer backingUrl={backingUrl} guideVocalUrl={guideVocalUrl} drobVocalUrl={drobVocalUrl} onMasterRendered={setMasterBlob} />`;
  if (!source.includes(from)) throw new Error('Could not find DrobMixPlayer polished master callback.');

  const to = `<DrobMixPlayer\n                backingUrl={backingUrl}\n                guideVocalUrl={guideVocalUrl}\n                drobVocalUrl={drobVocalUrl}\n                onMasterRendered={async (blob) => {\n                  /* ${marker} */\n                  setMasterBlob(blob);\n                  setSaveStatus('Saving polished Drob master to Songs…');\n                  try {\n                    const [savedBacking, savedGuide, savedDrob] = await Promise.all([\n                      urlToBlob(backingUrl || audioUrl),\n                      urlToBlob(guideVocalUrl),\n                      urlToBlob(drobVocalUrl),\n                    ]);\n                    const baseTitle = songTitle.trim() || 'Untitled Song';\n                    const saved = await saveVersion({\n                      title: \`${'${baseTitle}'} · Polished Drob\`,\n                      prompt,\n                      mode,\n                      vocalRange,\n                      durationMs,\n                      instrumental,\n                      lyrics: lyrics || undefined,\n                      melodyBlob: melodyBlob || undefined,\n                      melodyAnalysis: melodyAnalysis || undefined,\n                      precisionGuideBlob: precisionGuideBlob || undefined,\n                      generatedBlob: generatedBlob || undefined,\n                      backingBlob: savedBacking,\n                      guideVocalBlob: savedGuide,\n                      drobVocalBlob: savedDrob,\n                      masterBlob: blob,\n                    });\n                    setSaveStatus(\`Saved to Songs · \${saved.song.title}\`);\n                  } catch (error) {\n                    setSaveStatus(error instanceof Error ? \`Polished Drob rendered, but Songs save failed: \${error.message}\` : 'Polished Drob rendered, but Songs save failed.');\n                  }\n                }}\n              />`;

  source = source.replace(from, to);
  fs.writeFileSync(path, source);
}

console.log('Saves each polished Drob master as a separate Songs-list entry.');
