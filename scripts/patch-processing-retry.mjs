import fs from 'node:fs';

const file='app/PlaybackRecorderCard.tsx';
let src=fs.readFileSync(file,'utf8');

function replaceOnce(find,replacement,label){
  if(!src.includes(find)){
    if(src.includes(replacement))return;
    throw new Error(`patch-processing-retry: missing ${label}`);
  }
  src=src.replace(find,replacement);
}

replaceOnce(
"  const [processingSelection,setProcessingSelection]=useState(false);\n  const [selectedOutputs,setSelectedOutputs]=useState<OutputMap>({stems:false,fullSheet:false,partSheets:false,chords:false});",
"  const [processingSelection,setProcessingSelection]=useState(false);\n  const [retryingProcessing,setRetryingProcessing]=useState(false);\n  const [selectedOutputs,setSelectedOutputs]=useState<OutputMap>({stems:false,fullSheet:false,partSheets:false,chords:false});",
'state');

replaceOnce(
"      if(staged){\n        setPendingStagedPath(staged);\n        setChoosingOutputs(true);\n      }",
"      if(staged){\n        setPendingStagedPath(staged);\n        if(!savedJobs||typeof savedJobs!=='object'||Object.keys(savedJobs).length===0)setChoosingOutputs(true);\n      }",
'restore staged source');

replaceOnce(
"      sessionStorage.removeItem(CAPTURE_STAGED_KEY);\n      setPendingStagedPath('');\n      setChoosingOutputs(false);",
"      setChoosingOutputs(false);",
'preserve staged source after processing starts');

replaceOnce(
"      sessionStorage.removeItem(CAPTURE_STAGED_KEY);\n      setPendingStagedPath('');\n      setChoosingOutputs(false);\n      setStatus('Processing started for the items you selected.');",
"      sessionStorage.setItem(CAPTURE_STAGED_KEY,pendingStagedPath);\n      setChoosingOutputs(false);\n      setStatus('Processing started for the items you selected.');",
'preserve staged source after selection');

replaceOnce(
"  function toggleOutput(key:keyof OutputMap){\n    setSelectedOutputs(current=>({...current,[key]:!current[key]}));\n  }",
"  async function retryProcessing(){\n    setRetryingProcessing(true);\n    setStatus('Retrying processing from your saved recording…');\n    try{\n      const response=await fetch('/api/sheets/retry-processing',{method:'POST',credentials:'same-origin',cache:'no-store'});\n      const data=await response.json().catch(()=>({}));\n      if(!response.ok)throw new Error(data?.error||'Could not retry processing.');\n      const nextJobs=data.jobs&&typeof data.jobs==='object'?data.jobs as JobMap:{};\n      if(!Object.keys(nextJobs).length)throw new Error('Pie did not return any retry jobs.');\n      const nextOutputs=data.outputs&&typeof data.outputs==='object'?data.outputs as OutputMap:{...outputs};\n      const nextTitle=String(data.title||captureTitle||'Android playback recording');\n      const stagedPath=String(data.stagedPath||pendingStagedPath||'');\n      setJobs(nextJobs);\n      setOutputs(nextOutputs);\n      setJobStatuses({});\n      setCaptureTitle(nextTitle);\n      setStemJobsStarted(false);\n      if(stagedPath){setPendingStagedPath(stagedPath);sessionStorage.setItem(CAPTURE_STAGED_KEY,stagedPath);}\n      sessionStorage.setItem(CAPTURE_JOBS_KEY,JSON.stringify(nextJobs));\n      sessionStorage.setItem(CAPTURE_OUTPUTS_KEY,JSON.stringify(nextOutputs));\n      sessionStorage.setItem(CAPTURE_TITLE_KEY,nextTitle);\n      setStatus('Processing restarted from your saved recording.');\n    }catch(error){\n      setStatus(error instanceof Error?error.message:'Could not retry processing.');\n    }finally{\n      setRetryingProcessing(false);\n    }\n  }\n\n  function toggleOutput(key:keyof OutputMap){\n    setSelectedOutputs(current=>({...current,[key]:!current[key]}));\n  }",
'retry function');

replaceOnce(
"    {status&&<div className=\"statusBox\" style={{marginTop:12}}>{status}</div>}\n\n    {processingSteps.length>0&&",
"    {status&&<div className=\"statusBox\" style={{marginTop:12}}>{status}</div>}\n    {(hasFailed(jobStatuses)||status.toLowerCase().includes('processing needs attention'))&&<button className=\"primary\" type=\"button\" disabled={retryingProcessing} onClick={()=>{void retryProcessing();}} style={{marginTop:10,width:'100%',opacity:retryingProcessing?.65:1}}>{retryingProcessing?'Retrying…':'Retry processing — use saved recording'}</button>}\n\n    {processingSteps.length>0&&",
'retry button');

fs.writeFileSync(file,src);
console.log('Applied processing retry UI patch');
