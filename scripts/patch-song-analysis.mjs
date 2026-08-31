import fs from 'node:fs';

// This feature belongs in Sheets, not on the main Music creation screen.
// The late build patch also hands an analyzed score directly into the
// Sheet → Song renderer so the user never has to upload the same score twice.

const sheetsPath = 'app/SheetsWorkspace.tsx';
let sheets = fs.readFileSync(sheetsPath, 'utf8');

if (!sheets.includes("import SongAnalysisWorkspace from './SongAnalysisWorkspace';")) {
  const importNeedle = "import SheetImportTools from './SheetImportTools';";
  if (!sheets.includes(importNeedle)) throw new Error('Song analysis patch could not find Sheets import anchor.');
  sheets = sheets.replace(importNeedle, `${importNeedle}\nimport SongAnalysisWorkspace from './SongAnalysisWorkspace';`);
}

if (!sheets.includes("const [sheetAnalysisPlan,setSheetAnalysisPlan]")) {
  const stateNeedle = "  const [stemStarted,setStemStarted]=useState(false);";
  if (!sheets.includes(stateNeedle)) throw new Error('Song analysis patch could not find Sheets state anchor.');
  sheets = sheets.replace(
    stateNeedle,
    `${stateNeedle}\n  const [sheetAnalysisPlan,setSheetAnalysisPlan]=useState('');\n  const [analysisVocalRange,setAnalysisVocalRange]=useState('Baritone');`
  );
}

if (!sheets.includes('<SongAnalysisWorkspace')) {
  const returnNeedle = '  return <section className="panel sheetsWorkspace exportSheetsWorkspace">\n    <SheetImportTools />';
  if (!sheets.includes(returnNeedle)) throw new Error('Song analysis patch could not find Sheets workspace return anchor.');
  const replacement = `  return <section className="panel sheetsWorkspace exportSheetsWorkspace">\n    <SongAnalysisWorkspace\n      vocalRange={analysisVocalRange}\n      onVocalRangeChange={setAnalysisVocalRange}\n      onApply={(plan,range)=>{setAnalysisVocalRange(range);setSheetAnalysisPlan(plan)}}\n    />\n    <SheetImportTools analysisPlan={sheetAnalysisPlan} />`;
  sheets = sheets.replace(returnNeedle, replacement);
} else {
  sheets = sheets.replace('<SheetImportTools />', '<SheetImportTools analysisPlan={sheetAnalysisPlan} />');
}

fs.writeFileSync(sheetsPath, sheets);

const toolsPath = 'app/SheetImportTools.tsx';
let tools = fs.readFileSync(toolsPath, 'utf8');

tools = tools.replace(
  'async function productionRender(score:Score,parts:ScorePart[],full:boolean){\n  const prompt=productionPrompt(score,parts,full);',
  "async function productionRender(score:Score,parts:ScorePart[],full:boolean,analysisPlan=''){\n  const basePrompt=productionPrompt(score,parts,full);\n  const prompt=analysisPlan.trim()?`${basePrompt}\\n\\nPIE ANALYSIS SETTINGS\\n${analysisPlan}`:basePrompt;"
);

tools = tools.replace(
  'export default function SheetImportTools(){',
  "export default function SheetImportTools({analysisPlan=''}:{analysisPlan?:string}){"
);

tools = tools.replaceAll(
  'productionRender(score,[part],false)',
  'productionRender(score,[part],false,analysisPlan)'
);
tools = tools.replaceAll(
  'productionRender(score,parts,true)',
  'productionRender(score,parts,true,analysisPlan)'
);

if (!tools.includes('renderResultsRef')) {
  const refNeedle = "  const chooserRef=useRef<HTMLDivElement>(null);";
  if (!tools.includes(refNeedle)) throw new Error('Song analysis patch could not find render ref anchor.');
  tools = tools.replace(refNeedle, `${refNeedle}\n  const renderResultsRef=useRef<HTMLDivElement>(null);`);
}

if (!tools.includes("pie-score-analyzed")) {
  const cleanupNeedle = "  useEffect(()=>()=>{for(const item of renders)URL.revokeObjectURL(item.url)},[renders]);";
  if (!tools.includes(cleanupNeedle)) throw new Error('Song analysis patch could not find SheetImportTools effect anchor.');
  const handoff = `${cleanupNeedle}\n\n  useEffect(()=>{\n    const useAnalyzedScore=(next:Score|null)=>{\n      if(!next||!Array.isArray(next.parts)||!next.parts.length)return;\n      setScore(next); setRenders([]); setSelected({}); setFullArrangement(false);\n      setScoreStatus('Score already analyzed. Choose the parts you want to render — no second upload needed.');\n      setTimeout(()=>chooserRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),140);\n    };\n    try{\n      const saved=sessionStorage.getItem('pie-last-analyzed-score');\n      if(saved)useAnalyzedScore(JSON.parse(saved) as Score);\n    }catch{}\n    const onAnalyzed=(event:Event)=>useAnalyzedScore((event as CustomEvent<Score>).detail||null);\n    window.addEventListener('pie-score-analyzed',onAnalyzed);\n    return()=>window.removeEventListener('pie-score-analyzed',onAnalyzed);\n  },[]);`;
  tools = tools.replace(cleanupNeedle, handoff);
}

tools = tools.replace(
  '<p className="eyebrow">Sheet → Song</p><h2>Upload Music Sheets</h2>',
  '<p className="eyebrow">Sheet → Song</p><h2>{score?\'Analyzed Score Ready\':\'Upload Music Sheets\'}</h2>'
);
tools = tools.replace(
  '<p className="sub">Upload a PDF, photo, MusicXML, or XML score. Pie reads the written parts first, then asks what you want rendered before creating any audio.</p>',
  '<p className="sub">{score?\'Pie already has this analyzed score. Choose the parts below and render — you do not need to upload it again.\':\'Upload a PDF, photo, MusicXML, or XML score. Pie reads the written parts first, then asks what you want rendered before creating any audio.\'}</p>'
);
tools = tools.replace(
  "{scoreBusy?'Reading score…':'⬆ Upload Music Sheets'}",
  "{scoreBusy?'Reading score…':score?'Analyze a Different Score':'⬆ Upload Music Sheets'}"
);

// Keep render feedback visible where the user taps, then jump to finished players.
if (!tools.includes('Rendering your selected score now…')) {
  const buttonNeedle = '<button type="button" className="primary" disabled={renderBusy} onClick={()=>void renderSelected()} style={{marginTop:16}}>{renderBusy?\'Creating Real Performances…\':\'▶ Render Real Instruments & Singers\'}</button>';
  if (!tools.includes(buttonNeedle)) throw new Error('Song analysis patch could not find render button.');
  const buttonReplacement = `<button type="button" className="primary" disabled={renderBusy} onClick={()=>void renderSelected()} style={{marginTop:16}}>{renderBusy?'⏳ Rendering…':'▶ Render Real Instruments & Singers'}</button>\n        {renderBusy&&<div className="statusBox" style={{marginTop:10}}><strong>Rendering your selected score now…</strong><small style={{display:'block',marginTop:4}}>{scoreStatus||'Pie is creating the performance. Keep this page open.'}</small></div>}`;
  tools = tools.replace(buttonNeedle, buttonReplacement);
}

if (!tools.includes('ref={renderResultsRef}')) {
  tools = tools.replace(
    '{renders.length>0&&<div className="renderedPartList">',
    '{renders.length>0&&<div ref={renderResultsRef} className="renderedPartList" style={{scrollMarginTop:24}}>'
  );
}

if (!tools.includes("renderResultsRef.current?.scrollIntoView")) {
  const completeNeedle = "      setScoreStatus('Production render complete. These are realistic performance renders of the written parts.');";
  if (!tools.includes(completeNeedle)) throw new Error('Song analysis patch could not find render completion anchor.');
  tools = tools.replace(
    completeNeedle,
    `${completeNeedle}\n      setTimeout(()=>renderResultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),180);`
  );
}

fs.writeFileSync(toolsPath, tools);

const analysisPath = 'app/SongAnalysisWorkspace.tsx';
let analysis = fs.readFileSync(analysisPath, 'utf8');
analysis = analysis.replaceAll('Use These Settings in Song', 'Use These Settings in Sheets');
analysis = analysis.replaceAll(
  'Analysis settings added to the song. Continue to the generator below.',
  'Analysis settings applied to Sheets. Your analyzed score is ready below.'
);

if (!analysis.includes("sessionStorage.setItem('pie-last-analyzed-score'")) {
  const scoreNeedle = "  const score=d.score||{},notes=(score.parts||[]).flatMap((p:any)=>p.notes||[]).map((n:any)=>Number(n.midi)).filter(Number.isFinite);";
  if (!analysis.includes(scoreNeedle)) throw new Error('Song analysis patch could not find analyzed score handoff anchor.');
  const scoreReplacement = `  const score=d.score||{};\n  try{\n    sessionStorage.setItem('pie-last-analyzed-score',JSON.stringify(score));\n    window.dispatchEvent(new CustomEvent('pie-score-analyzed',{detail:score}));\n  }catch{}\n  const notes=(score.parts||[]).flatMap((p:any)=>p.notes||[]).map((n:any)=>Number(n.midi)).filter(Number.isFinite);`;
  analysis = analysis.replace(scoreNeedle, scoreReplacement);
}

fs.writeFileSync(analysisPath, analysis);

console.log('Sheets analysis now reuses scores and keeps render progress/results visible.');
