import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const stateAnchor="  const [stemReady,setStemReady]=useState(false);";
if(!source.includes('linkOutputs,setLinkOutputs')&&source.includes(stateAnchor)){
  source=source.replace(stateAnchor,`${stateAnchor}\n  const [linkOutputs,setLinkOutputs]=useState({stems:true,fullSheet:true,partSheets:false,chords:true});`);
}

if(!source.includes('What do you want to create?')){
  const mediaAnchor='      <input ref={mediaInput}';
  const index=source.indexOf(mediaAnchor);
  if(index===-1)throw new Error('Could not find media upload input for link output chooser.');
  const chooser=`      <div style={{marginTop:14,marginBottom:14}}>
        <p className="eyebrow">What do you want to create?</p>
        <div className="sheetExportGrid">
          {([['stems','🎚️','Stems','Separate vocals, drums, bass, guitar, keys, and other'],['fullSheet','🎼','Full Sheet Music','Complete song transcription'],['partSheets','🎵','Individual Part Sheets','Vocal, drums, bass, guitar, and keys notation'],['chords','🎹','Chords','Chord progression with timing']] as const).map(([key,icon,label,description])=><button type="button" key={key} className={(linkOutputs as any)[key]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setLinkOutputs(prev=>({...prev,[key]:!(prev as any)[key]}))}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><small>{description}</small></span><b>{(linkOutputs as any)[key]?'✓':'+'}</b></button>)}
        </div>
      </div>\n`;
  source=source.slice(0,index)+chooser+source.slice(index);
}

fs.writeFileSync(path,source);
console.log('Link analysis output chooser is visibly anchored above media upload.');
