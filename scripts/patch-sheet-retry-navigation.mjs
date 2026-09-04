import fs from 'node:fs';

// app/page.tsx is restored from a known-good source at the start of every build,
// so make active-tab persistence a build patch after the navigation patches run.
const pagePath='app/page.tsx';
let page=fs.readFileSync(pagePath,'utf8');
const screenState="  const [screen, setScreen] = useState<Screen>('create');";
const persistedScreen=`  const [screen, setScreen] = useState<Screen>('create');

  useEffect(() => {
    try {
      const saved=sessionStorage.getItem('pieActiveScreen')||'';
      if(['create','train','songs','mix','sheets'].includes(saved)&&saved!==screen){
        setScreen(saved as Screen);
      }
    } catch {}
    // Read only once after hydration. Persisting below keeps later tab taps current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('pieActiveScreen',screen); } catch {}
  }, [screen]);`;

if(!page.includes("sessionStorage.setItem('pieActiveScreen',screen)")){
  if(!page.includes(screenState))throw new Error('Active screen state was not found.');
  page=page.replace(screenState,persistedScreen);
  fs.writeFileSync(pagePath,page);
}

// A retry swaps failed Klangio job IDs for fresh IDs without changing the number
// of captured records. Re-arm polling when record contents change, not only when
// the list length changes.
const capturedPath='app/CapturedSongResults.tsx';
let captured=fs.readFileSync(capturedPath,'utf8');
if(captured.includes('},[records.length]);')){
  captured=captured.replace('},[records.length]);','},[records]);');
  fs.writeFileSync(capturedPath,captured);
}

console.log('Preserved the Sheets tab and restarted captured-job polling after retry.');
