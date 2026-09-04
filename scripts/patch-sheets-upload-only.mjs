import fs from 'node:fs';

const path='app/SheetsWorkspace.tsx';
let source=fs.readFileSync(path,'utf8');

const start=source.indexOf('  return <section className="panel sheetsWorkspace exportSheetsWorkspace">');
const end=source.lastIndexOf('\n}');
if(start<0||end<0||end<=start)throw new Error('SheetsWorkspace render block not found.');

// Keep the intended three-part Sheets flow:
// 1) Audio upload is rendered above SheetsWorkspace by AudioProcessorWorkspace.
// 2) Auto Analyze / Upload Song or Score lives here in the middle.
// 3) SheetImportTools follows below for the link/source workflow.
// Only the old Song → Sheets/export-card/white-preview block is removed.
const replacement=`  return <section className="panel sheetsWorkspace exportSheetsWorkspace">
    <SongAnalysisWorkspace
      vocalRange={analysisVocalRange}
      onVocalRangeChange={setAnalysisVocalRange}
      onApply={(plan,range)=>{setAnalysisVocalRange(range);setSheetAnalysisPlan(plan)}}
    />
    <SheetImportTools analysisPlan={sheetAnalysisPlan} vocalRange={analysisVocalRange} />
  </section>`;

source=source.slice(0,start)+replacement+source.slice(end);
fs.writeFileSync(path,source);
console.log('Kept Auto Analyze in the middle while removing only the legacy Song → Sheets/export preview block.');
