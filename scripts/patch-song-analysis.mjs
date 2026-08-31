import fs from 'node:fs';

// This feature belongs in Sheets, not on the main Music creation screen.
// app/page.tsx is restored/rebuilt earlier in the production build, so this
// late patch deliberately does not inject SongAnalysisWorkspace there.

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

fs.writeFileSync(toolsPath, tools);

const analysisPath = 'app/SongAnalysisWorkspace.tsx';
let analysis = fs.readFileSync(analysisPath, 'utf8');
analysis = analysis.replaceAll('Use These Settings in Song', 'Use These Settings in Sheets');
analysis = analysis.replaceAll(
  'Analysis settings added to the song. Continue to the generator below.',
  'Analysis settings applied to Sheets. Use the score renderer below.'
);
fs.writeFileSync(analysisPath, analysis);

console.log('Moved automatic song analysis workflow to Sheets and connected its settings to sheet rendering.');
