import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes('type ConfirmedRenderSettings =')){
  const anchor="type RenderedPart = { key:string; label:string; blob:Blob; url:string; extension:string };";
  if(!source.includes(anchor)) throw new Error('Confirm render patch could not find type anchor.');
  source=source.replace(anchor,`${anchor}\ntype ConfirmedRenderSettings = { key:string; bpm:number; timeSignature:string; vocalRange:string; renderMode:string };`);
}

if(!source.includes('const [showRenderConfirm,setShowRenderConfirm]')){
  const stateAnchor="  const [renderBusy,setRenderBusy]=useState(false);";
  if(!source.includes(stateAnchor)) throw new Error('Confirm render patch could not find render state anchor.');
  source=source.replace(stateAnchor,`${stateAnchor}\n  const [showRenderConfirm,setShowRenderConfirm]=useState(false);\n  const [confirmKey,setConfirmKey]=useState('');\n  const [confirmBpm,setConfirmBpm]=useState(100);\n  const [confirmTimeSignature,setConfirmTimeSignature]=useState('4/4');\n  const [confirmVocalRange,setConfirmVocalRange]=useState(vocalRange||'Baritone');\n  const [confirmRenderMode,setConfirmRenderMode]=useState('Hybrid');`);
}

if(!source.includes('function openRenderConfirmation()')){
  const fnAnchor='  function toggle(index:number){setSelected(prev=>({...prev,[index]:!prev[index]}));}\n\n';
  if(!source.includes(fnAnchor)) throw new Error('Confirm render patch could not find toggle anchor.');
  const helper=`  function openRenderConfirmation(){\n    if(!score)return;\n    const modeMatch=analysisPlan.match(/Render mode:\\s*(Real Performance|Note-Perfect|Hybrid)/i);\n    setConfirmKey(score.key||'C Major');\n    setConfirmBpm(Math.max(35,Math.min(240,Math.round(Number(score.tempo)||100))));\n    setConfirmTimeSignature(score.timeSignature||'4/4');\n    setConfirmVocalRange(vocalRange||'Baritone');\n    setConfirmRenderMode(modeMatch?.[1]||'Hybrid');\n    setShowRenderConfirm(true);\n    setScoreStatus('Review the final settings below. Nothing will render until you confirm them.');\n  }\n\n`;
  source=source.replace(fnAnchor,fnAnchor+helper);
}

const start=source.indexOf('  async function renderSelected(');
const end=source.indexOf('\n  async function beginStemAnalysis',start);
if(start<0||end<0) throw new Error('Confirm render patch could not locate renderSelected.');
let renderFn=source.slice(start,end);
if(!renderFn.includes('confirmed?:ConfirmedRenderSettings')){
  renderFn=renderFn.replace('  async function renderSelected(){','  async function renderSelected(confirmed?:ConfirmedRenderSettings){');
  renderFn=renderFn.replace('    if(!score)return;','    if(!score)return;\n    const renderScore:Score={...score,key:confirmed?.key||score.key,tempo:confirmed?.bpm||score.tempo,timeSignature:confirmed?.timeSignature||score.timeSignature};\n    const renderVocalRange=confirmed?.vocalRange||vocalRange;\n    const renderPlan=`${analysisPlan}${confirmed?.renderMode?`\\nFINAL CONFIRMED RENDER MODE: ${confirmed.renderMode}`:\'\'}`;');
  renderFn=renderFn.replaceAll('score.parts','renderScore.parts');
  renderFn=renderFn.replaceAll('productionRender(score,','productionRender(renderScore,');
  renderFn=renderFn.replaceAll('productionRender(renderScore,[part],false,analysisPlan,vocalRange)','productionRender(renderScore,[part],false,renderPlan,renderVocalRange)');
  renderFn=renderFn.replaceAll('productionRender(renderScore,parts,true,analysisPlan,vocalRange)','productionRender(renderScore,parts,true,renderPlan,renderVocalRange)');
  renderFn=renderFn.replaceAll('durationFor(score,parts)','durationFor(renderScore,parts)');
  renderFn=renderFn.replaceAll('score.lyrics','renderScore.lyrics');
  renderFn=renderFn.replaceAll("title:score.title||'Untitled Song'","title:renderScore.title||'Untitled Song'");
  renderFn=renderFn.replaceAll("prompt:analysisPlan.trim()||'Rendered automatically from imported music sheets.'","prompt:renderPlan.trim()||'Rendered automatically from imported music sheets.'");
  renderFn=renderFn.replace('            vocalRange,','            vocalRange:renderVocalRange,');
}
source=source.slice(0,start)+renderFn+source.slice(end);

if(!source.includes('Final Render Confirmation')){
  const buttonPattern=/<button type="button" className="primary" disabled=\{renderBusy\} onClick=\{\(\)=>void renderSelected\(\)\}[^>]*>[\s\S]*?<\/button>/;
  if(!buttonPattern.test(source)) throw new Error('Confirm render patch could not find render button.');
  const replacement=`<button type="button" className="primary" disabled={renderBusy} onClick={openRenderConfirmation} style={{marginTop:16}}>{renderBusy?'⏳ Rendering…':'Review & Render'}</button>\n        {showRenderConfirm&&score&&<div className="sheetSourceCard" style={{marginTop:14,border:'1px solid rgba(255,255,255,.18)'}}>\n          <p className="eyebrow">Final Render Confirmation</p>\n          <h3 style={{marginTop:4}}>Confirm exactly what Pie will render</h3>\n          <p className="sub">Change anything you want here. These final values override the analyzed defaults.</p>\n          <div style={{display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>\n            <label><small>Key</small><input value={confirmKey} onChange={e=>setConfirmKey(e.target.value)} placeholder="G Major"/></label>\n            <label><small>BPM</small><div style={{display:'flex',gap:6,alignItems:'center'}}><button type="button" onClick={()=>setConfirmBpm(v=>Math.max(35,v-5))}>−5</button><input type="number" min={35} max={240} value={confirmBpm} onChange={e=>setConfirmBpm(Math.max(35,Math.min(240,Number(e.target.value)||35)))} style={{minWidth:72}}/><button type="button" onClick={()=>setConfirmBpm(v=>Math.min(240,v+5))}>+5</button></div></label>\n            <label><small>Time Signature</small><select value={confirmTimeSignature} onChange={e=>setConfirmTimeSignature(e.target.value)}><option>4/4</option><option>3/4</option><option>6/8</option><option>12/8</option><option>2/4</option><option>5/4</option><option>7/8</option></select></label>\n            <label><small>Lead Vocal Range</small><select value={confirmVocalRange} onChange={e=>setConfirmVocalRange(e.target.value)}><option>Bass</option><option>Baritone</option><option>Tenor</option><option>Alto</option><option>Soprano</option></select></label>\n            <label><small>Render Mode</small><select value={confirmRenderMode} onChange={e=>setConfirmRenderMode(e.target.value)}><option>Real Performance</option><option>Note-Perfect</option><option>Hybrid</option></select></label>\n          </div>\n          <div style={{marginTop:14}}>\n            <small>Parts to Render</small>\n            <div style={{display:'grid',gap:8,marginTop:7}}>{score.parts.map((part,index)=><button type="button" key={'confirm-'+index} className={selected[index]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>toggle(index)} style={{minHeight:54}}><span><strong>{partLabel(part)}</strong><small>{part.instrument||'Vocal'}</small></span><b>{selected[index]?'✓':'+'}</b></button>)}</div>\n          </div>\n          <button type="button" className={fullArrangement?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setFullArrangement(v=>!v)} style={{minHeight:62,marginTop:12}}><span><strong>Full Arrangement</strong><small>{fullArrangement?'Included in final render':'Tap to include the complete mix'}</small></span><b>{fullArrangement?'✓':'+'}</b></button>\n          <div className="statusBox" style={{marginTop:12}}><strong>Final settings</strong><small style={{display:'block',marginTop:4}}>{confirmKey} · {confirmBpm} BPM · {confirmTimeSignature} · {confirmVocalRange} · {confirmRenderMode}</small></div>\n          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>\n            <button type="button" onClick={()=>setShowRenderConfirm(false)}>Back</button>\n            <button type="button" className="primary" disabled={renderBusy||(!fullArrangement&&!Object.keys(selected).some(i=>selected[Number(i)]))} onClick={()=>{setShowRenderConfirm(false);void renderSelected({key:confirmKey.trim()||score.key||'C Major',bpm:confirmBpm,timeSignature:confirmTimeSignature,vocalRange:confirmVocalRange,renderMode:confirmRenderMode})}}>Confirm & Render</button>\n          </div>\n        </div>}`;
  source=source.replace(buttonPattern,replacement);
}

fs.writeFileSync(path,source);
console.log('Added editable final confirmation before Sheets rendering.');
