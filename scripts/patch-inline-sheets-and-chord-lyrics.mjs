import fs from 'node:fs';

const path='app/CapturedSongResults.tsx';
let source=fs.readFileSync(path,'utf8');

const stateNeedle=`  const [playingFileKey,setPlayingFileKey]=useState('');`;
if(!source.includes(`const [inlineSheetUrl,setInlineSheetUrl]`)){
  if(!source.includes(stateNeedle))throw new Error('Inline audio state not found.');
  source=source.replace(stateNeedle,stateNeedle+`\n  const [inlineSheetUrl,setInlineSheetUrl]=useState('');\n  const [inlineSheetTitle,setInlineSheetTitle]=useState('');\n  const [chordSheet,setChordSheet]=useState<any>(null);\n  const [chordBusy,setChordBusy]=useState(false);`);
}

const functionNeedle=`  function fileVisual(key:string){`;
if(!source.includes('async function generateChordLyricSheet(){')){
  const idx=source.indexOf(functionNeedle);
  if(idx<0)throw new Error('File visual helper not found.');
  const helpers=String.raw`  async function generateChordLyricSheet(){
    if(!selected?.jobs?.chords||!selected.stagedPath||chordBusy)return;
    setChordBusy(true);setFileStatus('Building chord + lyric sheet…');setInlineSheetUrl('');
    try{
      const response=await fetch('/api/sheets/chord-sheet',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'generate',chordJobId:selected.jobs.chords,stagedPath:selected.stagedPath,title:selected.title||'Untitled Song'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.chart)throw new Error(data?.error||'Could not build chord + lyric sheet.');
      setChordSheet(data.chart);setFileStatus('Chord + lyric sheet ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'Could not build chord + lyric sheet.');}
    finally{setChordBusy(false);}
  }

  async function downloadChordLyricPdf(){
    if(!chordSheet)return;
    setFileStatus('Preparing chord + lyric PDF…');
    try{
      const response=await fetch('/api/sheets/chord-sheet',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'pdf',chart:chordSheet})});
      if(!response.ok)throw new Error('Could not create chord + lyric PDF.');
      const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='pie-chord-lyrics.pdf';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),3000);setFileStatus('Chord + lyric PDF ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'Could not create chord + lyric PDF.');}
  }

  function showInlineSheet(url:string,label:string){
    setChordSheet(null);setInlineSheetTitle(label);
    setInlineSheetUrl(url.includes('/api/sheets/download/')?url+(url.includes('?')?'&':'?')+'inline=1':url);
    setFileStatus('Sheet opened in Pie.');
  }

`;
  source=source.slice(0,idx)+helpers+source.slice(idx);
}

const fileRowStart=source.indexOf('  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){');
const selectedStart=source.indexOf('\n  if(selected){',fileRowStart);
if(fileRowStart<0||selectedStart<0)throw new Error('Inline fileRow block not found.');
const newFileRow=String.raw`  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){
    const visual=fileVisual(key);
    const playable=key==='recording'||key.startsWith('stem:');
    const isPlaying=playable&&playingFileKey===key;
    const isSheet=key==='sheet';
    const isChords=key==='chords';
    const activate=()=>playable?void toggleInlineFileAudio(key,url):isSheet?showInlineSheet(url,label):isChords?void generateChordLyricSheet():void openFile(url);
    return <article className="songListRow capturedFileRow">
      <button type="button" className={'songCoverButton songCoverTone'+visual.tone+' fileThumb'} onClick={activate} aria-label={(isPlaying?'Stop ':playable?'Play ':'Open ')+label}><span>{playable?(isPlaying?'■':'▶'):visual.icon}</span></button>
      <button type="button" className="songRowInfo" onClick={activate}>
        <div className="songTitleLine"><strong>{label.replace(/^[^A-Za-z0-9]+\s*/, '').replace(/\s*·\s*(PDF|WAV)$/i,'')}</strong><span>{visual.kind}</span></div>
        <small className="songDescription">{playable?(isPlaying?'Playing full audio · tap to stop':'Tap to play full audio'):isSheet?'Tap to preview sheet in Pie':isChords?(chordBusy?'Building chord + lyric sheet…':'Tap for chords + lyrics'):(saved?'Saved in Pie · tap to open':'Ready · saving into Pie…')}</small>
        <div className="songMeta"><span>{visual.kind}</span><span>{playable?'Full length':isChords?'Lyrics aligned':'Inline preview'}</span></div>
      </button>
      <div className="songMenuWrap"><button type="button" className="songMenuButton" aria-label={'Options for '+label} aria-haspopup="menu" aria-expanded={menuKey===key} onClick={()=>setMenuKey(current=>current===key?'':key)}>•••</button>
        {menuKey===key&&<><button type="button" className="songMenuDismiss" aria-label="Close file menu" onClick={()=>setMenuKey('')} /><div className="songActionMenu" role="menu">
          <div className="songActionMenuTitle"><strong>{label}</strong><small>{saved?'Saved in Pie':'Ready'}</small></div>
          {playable&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void toggleInlineFileAudio(key,url)}}>{isPlaying?'■ Stop':'▶ Play'}</button>}
          {isSheet&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');showInlineSheet(url,label)}}>▤ Preview in Pie</button>}
          {isChords&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void generateChordLyricSheet()}}>♬ Chords + Lyrics</button>}
          {!playable&&!isSheet&&!isChords&&<button role="menuitem" type="button" onClick={()=>void openFile(url)}>Open</button>}
          {!isChords&&<button role="menuitem" type="button" onClick={()=>void downloadFile(url,name)}>↓ Download</button>}
          {isChords&&chordSheet&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void downloadChordLyricPdf()}}>↓ Download PDF</button>}
          {!isChords&&<button role="menuitem" type="button" onClick={()=>void shareFile(url,name)}>↗ Share</button>}
        </div></>}
      </div>
    </article>;
  }
`;
source=source.slice(0,fileRowStart)+newFileRow+source.slice(selectedStart);

const previewNeedle=`        {fileStatus&&<div className="statusBox" style={{padding:10,fontSize:12}}>{fileStatus}</div>}\n`;
if(!source.includes('className="pieInlineSheetPreview"')){
  if(!source.includes(previewNeedle))throw new Error('File status insertion point not found.');
  const preview=String.raw`
        {inlineSheetUrl&&<div className="pieInlineSheetPreview">
          <div className="pieInlineSheetHead"><strong>{inlineSheetTitle||'Sheet music'}</strong><button type="button" className="secondary" onClick={()=>setInlineSheetUrl('')}>Close</button></div>
          <iframe src={inlineSheetUrl} title={inlineSheetTitle||'Sheet music preview'} />
        </div>}
        {chordSheet&&<div className="pieChordSheetPreview">
          <div className="pieInlineSheetHead"><div><strong>{chordSheet.title||'Chord + Lyric Sheet'}</strong>{chordSheet.likelyKey&&<small>Likely key: {chordSheet.likelyKey}</small>}</div><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>void downloadChordLyricPdf()}>PDF</button><button type="button" className="secondary" onClick={()=>setChordSheet(null)}>Close</button></div></div>
          <div className="pieChordSheetPaper">{(chordSheet.lines||[]).map((line:any,index:number)=><div className="pieChordLine" key={index}>{line.section&&<h4>{line.section}</h4>}<pre>{line.chords||' '}</pre><p>{line.lyrics}</p></div>)}</div>
        </div>}
`;
  source=source.replace(previewNeedle,previewNeedle+preview);
}

fs.writeFileSync(path,source);

const cssPath='app/globals.css';
let css=fs.readFileSync(cssPath,'utf8');
const marker='/* PIE INLINE SHEETS AND CHORD LYRICS */';
if(!css.includes(marker)){
  css+=`\n${marker}\n.pieInlineSheetPreview,.pieChordSheetPreview{display:grid;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.025)}.pieInlineSheetHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.pieInlineSheetHead>div:first-child{display:grid;gap:2px}.pieInlineSheetHead small{color:#8d8d98}.pieInlineSheetPreview iframe{width:100%;height:min(72vh,760px);border:0;border-radius:12px;background:white}.pieChordSheetPaper{background:#fff;color:#111;border-radius:12px;padding:22px 18px;overflow:auto;max-height:72vh}.pieChordLine{margin:0 0 14px}.pieChordLine h4{font-family:Georgia,serif;font-style:italic;margin:18px 0 7px;font-size:15px}.pieChordLine pre{margin:0;white-space:pre-wrap;font:800 14px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;color:#111}.pieChordLine p{margin:1px 0 0;font:16px/1.4 Georgia,serif;color:#111}@media(max-width:430px){.pieInlineSheetPreview,.pieChordSheetPreview{padding:9px}.pieInlineSheetPreview iframe{height:64vh}.pieChordSheetPaper{padding:18px 12px}.pieChordLine pre{font-size:12px}.pieChordLine p{font-size:15px}}\n`;
  fs.writeFileSync(cssPath,css);
}
console.log('Added inline PDF previews and chord + lyric sheet rendering.');
