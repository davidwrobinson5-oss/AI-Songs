import fs from 'node:fs';

// 1) Put the visible saved library below Analyze Music Link.
{
  const path='app/SheetImportTools.tsx';
  let source=fs.readFileSync(path,'utf8');
  const importLine="import SavedSheetsStemsLibrary from './SavedSheetsStemsLibrary';";
  if(!source.includes(importLine)){
    const marker="import { stagePieFile } from './stagedUpload';";
    if(!source.includes(marker)) throw new Error('Could not find SheetImportTools import anchor.');
    source=source.replace(marker,`${marker}\n${importLine}`);
  }
  if(!source.includes('<SavedSheetsStemsLibrary />')){
    const anchor='      {stemReady&&stemJob&&<div className="sheetExportGrid">{STEMS.map(([key,icon,label])=><div className="sheetExportCard" key={key}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><audio controls preload="none" src={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`}/><a href={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`} download={`${key}.wav`}>Download WAV</a></span></div>)}</div>}\n    </div>';
    if(!source.includes(anchor)) throw new Error('Could not find Analyze Music Link closing anchor.');
    source=source.replace(anchor,`${anchor}\n\n    <SavedSheetsStemsLibrary />`);
  }
  fs.writeFileSync(path,source);
}

// 2) Keep persistence in AudioProcessorWorkspace, but remove its duplicate visible library.
{
  const path='app/AudioProcessorWorkspace.tsx';
  let source=fs.readFileSync(path,'utf8');

  // Broadcast saves so the moved library updates immediately.
  const saveAnchor='      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));\n      localStorage.setItem(ACTIVE_KEY,sessionId);';
  if(source.includes(saveAnchor)&&!source.includes("window.dispatchEvent(new Event('pie-sheets-stems-library-changed'))")){
    source=source.replace(saveAnchor,`${saveAnchor}\n      window.dispatchEvent(new Event('pie-sheets-stems-library-changed'));`);
  }

  // Allow Open/Delete in the moved library to update this active processor view.
  const effectAnchor='  useEffect(()=>{\n    const saved=readLibrary();\n    setLibrary(saved);\n    const activeId=localStorage.getItem(ACTIVE_KEY)||\'\';\n    const active=saved.find(item=>item.id===activeId)||saved[0];\n    if(active)restoreSession(active);\n    setHydrated(true);\n  },[]);';
  if(source.includes(effectAnchor)&&!source.includes("pie-sheets-stems-library-action")){
    const listener=`${effectAnchor}\n\n  useEffect(()=>{\n    const handler=(event:Event)=>{\n      const detail=(event as CustomEvent<{action?:string;id?:string}>).detail||{};\n      const saved=readLibrary();\n      setLibrary(saved);\n      if(detail.action==='open'&&detail.id){\n        const item=saved.find(entry=>entry.id===detail.id);\n        if(item)restoreSession(item);\n      }else if(detail.action==='delete'&&detail.id===sessionId){\n        const replacement=saved[0];\n        if(replacement)restoreSession(replacement);\n        else{\n          setSessionId('');setSourceName('');setJobs({});setStatuses({});setChords([]);setStemStarted(false);\n          setStatus('Choose an audio file to create sheet music and stems.');\n        }\n      }\n    };\n    window.addEventListener('pie-sheets-stems-library-action',handler);\n    return()=>window.removeEventListener('pie-sheets-stems-library-action',handler);\n  },[sessionId]);`;
    source=source.replace(effectAnchor,listener);
  }

  // Hide/remove the duplicate visible block, regardless of whether the previous always-show patch ran.
  const label='<p className="eyebrow">SAVED SHEETS & STEMS</p>';
  const labelIndex=source.indexOf(label);
  if(labelIndex!==-1){
    const sectionIndex=source.lastIndexOf('<section className="panel"',labelIndex);
    const conditionalIndex=source.lastIndexOf('{library.length>0&&<section className="panel"',labelIndex);
    const start=Math.max(sectionIndex,conditionalIndex);
    if(start!==-1){
      const nextMarker='\n\n    {hasStarted&&<section className="panel"';
      const end=source.indexOf(nextMarker,labelIndex);
      if(end!==-1) source=source.slice(0,start)+source.slice(end+2);
    }
  }

  fs.writeFileSync(path,source);
}

console.log('Moved Saved Sheets & Stems below Analyze Music Link.');
