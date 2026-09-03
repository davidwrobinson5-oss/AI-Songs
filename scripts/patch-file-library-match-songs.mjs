import fs from 'node:fs';

// Make Saved Sheets & Stems use the exact compact Songs-library row language.
const savedPath = 'app/SavedSheetsStemsLibrary.tsx';
let saved = fs.readFileSync(savedPath, 'utf8');

const savedReturnStart = saved.indexOf('  return <div className="sheetSourceCard" style={{marginTop:16}}>');
if (savedReturnStart < 0) throw new Error('Saved Sheets & Stems return block not found.');
const savedReturnEnd = saved.lastIndexOf('\n}')
if (savedReturnEnd < savedReturnStart) throw new Error('Saved Sheets & Stems component end not found.');

const savedReturn = `  return <section className="songsLibraryPanel fileLibraryPanel" style={{marginTop:16}}>
    <div className="songsSectionHead"><strong>Saved Sheets & Stems</strong><span>{library.length} {library.length===1?'file':'files'}</span></div>
    {library.length===0&&<div className="songsEmpty"><span>▤</span><strong>No saved files yet</strong><small>Your next sheet or stem job will appear here automatically.</small></div>}
    <div className="songsList fileLibraryList">
      {library.map((item,index)=><article className={\`songListRow fileLibraryRow \${activeId===item.id?'fileLibraryRowActive':''}\`} key={item.id}>
        <button type="button" className={\`songCoverButton songCoverTone\${index%4} fileThumb\`} aria-label={\`Open \${item.sourceName}\`} onClick={()=>openSession(item.id)}>
          <span>▤</span>
        </button>
        <button type="button" className="songRowInfo" onClick={()=>openSession(item.id)}>
          <div className="songTitleLine"><strong>{item.sourceName}</strong>{activeId===item.id&&<span>OPEN</span>}</div>
          <small className="songDescription">Sheets & stems</small>
          <div className="songMeta"><span>{new Date(item.updatedAt).toLocaleDateString()}</span>{item.status&&<span>{item.status}</span>}</div>
        </button>
        <div className="songMenuWrap">
          <button type="button" className="songMenuButton" aria-label={\`Options for \${item.sourceName}\`} onClick={()=>deleteSession(item.id)}>•••</button>
        </div>
      </article>)}
    </div>
  </section>;`;

saved = saved.slice(0, savedReturnStart) + savedReturn + saved.slice(savedReturnEnd);
fs.writeFileSync(savedPath, saved);

// Make captured-song file rows and the opened capture use the same Songs card sizes/classes.
const capturedPath = 'app/CapturedSongResults.tsx';
let captured = fs.readFileSync(capturedPath, 'utf8');

const fileRowStart = captured.indexOf('  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){');
const selectedStart = captured.indexOf('\n  if(selected){', fileRowStart);
if (fileRowStart < 0 || selectedStart < 0) throw new Error('Captured fileRow block not found.');

const fileRowReplacement = `  function fileVisual(key:string){
    if(key==='sheet')return {icon:'▤',tone:0,kind:'PDF'};
    if(key==='chords')return {icon:'♬',tone:2,kind:'CHORDS'};
    if(key==='recording')return {icon:'♫',tone:1,kind:'WAV'};
    const stem=key.replace('stem:','');
    const icons:Record<string,string>={vocals:'🎤',drums:'🥁',bass:'🎸',guitar:'🎸',piano:'🎹',other:'🎻'};
    return {icon:icons[stem]||'♪',tone:3,kind:'WAV'};
  }

  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){
    const visual=fileVisual(key);
    return <article className="songListRow capturedFileRow">
      <button type="button" className={\`songCoverButton songCoverTone\${visual.tone} fileThumb\`} onClick={()=>void openFile(url)} aria-label={\`Open \${label}\`}><span>{visual.icon}</span></button>
      <button type="button" className="songRowInfo" onClick={()=>void openFile(url)}>
        <div className="songTitleLine"><strong>{label.replace(/^[^A-Za-z0-9]+\\s*/, '').replace(/\\s*·\\s*(PDF|WAV)$/i,'')}</strong><span>{visual.kind}</span></div>
        <small className="songDescription">{saved?'Saved in Pie · tap to open':'Ready · saving into Pie…'}</small>
        <div className="songMeta"><span>{visual.kind}</span><span>Pie file</span></div>
      </button>
      <div className="songMenuWrap">
        <button type="button" className="songMenuButton" aria-label={\`Options for \${label}\`} aria-haspopup="menu" aria-expanded={menuKey===key} onClick={()=>setMenuKey(current=>current===key?'':key)}>•••</button>
        {menuKey===key&&<>
          <button type="button" className="songMenuDismiss" aria-label="Close file menu" onClick={()=>setMenuKey('')} />
          <div className="songActionMenu" role="menu">
            <div className="songActionMenuTitle"><strong>{label}</strong><small>{saved?'Saved in Pie':'Ready'}</small></div>
            <button role="menuitem" type="button" onClick={()=>void openFile(url)}>Open</button>
            <button role="menuitem" type="button" onClick={()=>void downloadFile(url,name)}>↓ Download</button>
            <button role="menuitem" type="button" onClick={()=>void shareFile(url,name)}>↗ Share</button>
          </div>
        </>}
      </div>
    </article>;
  }
`;

captured = captured.slice(0, fileRowStart) + fileRowReplacement + captured.slice(selectedStart);

const selectedHeaderOld = `<button type="button" className="secondary" onClick={()=>setSelectedId('')} style={{margin:'4px 0 12px'}}>← All songs</button>\n      <article className="statusBox" style={{display:'grid',gap:14,padding:16,borderRadius:20}}>\n        <div style={{display:'grid',gridTemplateColumns:'58px minmax(0,1fr)',gap:12,alignItems:'center'}}>\n          <div style={{width:58,height:58,borderRadius:16,display:'grid',placeItems:'center',fontSize:26,background:'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))',border:'1px solid rgba(255,255,255,.12)'}}>♫</div>\n          <div style={{minWidth:0}}><strong style={{display:'block',fontSize:19,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selected.title||'Captured recording'}</strong><small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(selected.createdAt).toLocaleString()}</small><small style={{display:'block',marginTop:4,opacity:.7}}>{assetSummary(selected)}</small></div>\n        </div>`;
const selectedHeaderNew = `<button type="button" className="secondary" onClick={()=>setSelectedId('')} style={{margin:'4px 0 12px'}}>← All files</button>\n      <article className="capturedOpenView">\n        <div className="songListRow capturedOpenHeader">\n          <div className="songCoverButton songCoverTone0 fileThumb" aria-hidden="true"><span>▤</span></div>\n          <div className="songRowInfo capturedOpenInfo">\n            <div className="songTitleLine"><strong>{selected.title||'Captured recording'}</strong><span>{state==='ready'?'READY':state==='failed'?'ATTENTION':'WORKING'}</span></div>\n            <small className="songDescription">{assetSummary(selected)}</small>\n            <div className="songMeta"><span>{new Date(selected.createdAt).toLocaleDateString()}</span><span>{selectedOutputCount(selected)} outputs</span></div>\n          </div>\n          <div className="songMenuWrap" aria-hidden="true"></div>\n        </div>`;
if (!captured.includes(selectedHeaderOld)) throw new Error('Captured selected header block not found.');
captured = captured.replace(selectedHeaderOld, selectedHeaderNew);

const filesHeaderOld = `<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><strong>Files</strong><span style={{fontSize:11,fontWeight:850,opacity:.75}}>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span></div>`;
const filesHeaderNew = `<div className="songsSectionHead capturedFilesHead"><strong>Files</strong><span>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span></div>`;
captured = captured.replace(filesHeaderOld, filesHeaderNew);

const listOldStart = `  return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>\n    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'10px 2px 8px'}}><strong>Captured songs</strong><span style={{fontSize:12,opacity:.6}}>{sorted.length}</span></div>\n    <div style={{display:'grid',gap:9}}>{sorted.map((item,index)=>{const state=item.state||'processing';return <button key={item.id} type="button" onClick={()=>setSelectedId(item.id)} className="statusBox" style={{width:'100%',display:'grid',gridTemplateColumns:'56px minmax(0,1fr) auto',gap:12,alignItems:'center',padding:10,borderRadius:17,textAlign:'left',color:'inherit'}}><span style={{width:56,height:56,borderRadius:14,display:'grid',placeItems:'center',fontSize:24,background:index%2===0?'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))':'linear-gradient(145deg,rgba(236,72,153,.45),rgba(124,58,237,.35))',border:'1px solid rgba(255,255,255,.1)'}}>♫</span><span style={{minWidth:0}}><strong style={{display:'block',fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title||'Captured recording'}</strong><small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(item.createdAt).toLocaleString()}</small><small style={{display:'block',marginTop:4,opacity:.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{assetSummary(item)} · {selectedOutputCount(item)} selected output{selectedOutputCount(item)===1?'':'s'}</small></span><span style={{display:'grid',justifyItems:'end',gap:5}}><small style={{fontSize:10,fontWeight:850,opacity:.7}}>{state==='ready'?'READY':state==='failed'?'ATTENTION':'WORKING'}</small><span style={{fontSize:24,opacity:.55}}>›</span></span></button>;})}</div>\n  </section>;`;

const listNew = `  return <section id="captured" className="songsLibraryPanel capturedLibraryPanel">\n    <div className="songsSectionHead"><strong>Captured files</strong><span>{sorted.length}</span></div>\n    <div className="songsList">{sorted.map((item,index)=>{const state=item.state||'processing';return <article className="songListRow" key={item.id}>\n      <button type="button" className={\`songCoverButton songCoverTone\${index%4} fileThumb\`} onClick={()=>setSelectedId(item.id)} aria-label={\`Open \${item.title||'Captured recording'}\`}><span>▤</span></button>\n      <button type="button" className="songRowInfo" onClick={()=>setSelectedId(item.id)}>\n        <div className="songTitleLine"><strong>{item.title||'Captured recording'}</strong><span>{state==='ready'?'READY':state==='failed'?'ATTN':'WORKING'}</span></div>\n        <small className="songDescription">{assetSummary(item)}</small>\n        <div className="songMeta"><span>{new Date(item.createdAt).toLocaleDateString()}</span><span>{selectedOutputCount(item)} outputs</span></div>\n      </button>\n      <div className="songMenuWrap"><button type="button" className="songMenuButton" aria-label={\`Open \${item.title||'Captured recording'}\`} onClick={()=>setSelectedId(item.id)}>•••</button></div>\n    </article>;})}</div>\n  </section>;`;
if (!captured.includes(listOldStart)) throw new Error('Captured list block not found.');
captured = captured.replace(listOldStart, listNew);

fs.writeFileSync(capturedPath, captured);

// Tiny alignment layer only; all core sizing comes from the existing Songs classes.
const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIE FILE LIBRARY MATCH SONGS */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.fileLibraryPanel,.capturedLibraryPanel{margin:0 0 18px!important;padding:0 2px!important}.fileLibraryRowActive{background:rgba(255,255,255,.025)}.fileThumb{cursor:pointer}.capturedOpenView{display:grid;gap:10px;padding:0;background:transparent;border:0;box-shadow:none}.capturedOpenHeader{border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:2px}.capturedOpenInfo{pointer-events:none}.capturedFilesHead{padding-left:2px;padding-right:2px}.capturedFileRow{padding-left:0;padding-right:0}.capturedOpenView>.statusBox{margin:0}.capturedOpenView>button.secondary{justify-self:start}@media(max-width:430px){.fileLibraryPanel,.capturedLibraryPanel{padding-left:0!important;padding-right:0!important}}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Matched Sheets, Stems, and captured file views to the Songs library card and thumbnail system.');
