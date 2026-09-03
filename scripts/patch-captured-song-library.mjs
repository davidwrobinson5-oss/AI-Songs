import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import CapturedSongResults from './CapturedSongResults';")){
  const anchor="import { getSongVersions, listSongs, saveVersion, type SavedSong, type SavedVersion } from './songStore';";
  if(!source.includes(anchor))throw new Error('Could not find songStore import.');
  source=source.replace(anchor,`${anchor}\nimport CapturedSongResults from './CapturedSongResults';`);
}

const screenState="  const [screen, setScreen] = useState<Screen>('create');";
if(!source.includes("new URL(window.location.href).searchParams.get('screen')")){
  if(!source.includes(screenState))throw new Error('Could not find screen state.');
  source=source.replace(screenState,`${screenState}\n\n  useEffect(() => {\n    const requested = new URL(window.location.href).searchParams.get('screen');\n    if (requested === 'songs') {\n      setScreen('songs');\n      window.requestAnimationFrame(() => {\n        document.getElementById('captured')?.scrollIntoView({ block: 'start' });\n      });\n    }\n  }, []);`);
}

if(!source.includes('<CapturedSongResults />')){
  const songsPanel='<section className="songsLibraryPanel">';
  if(!source.includes(songsPanel))throw new Error('Could not find Songs library panel.');
  source=source.replace(songsPanel,`<div id="captured"><CapturedSongResults /></div>\n\n        ${songsPanel}`);
}

fs.writeFileSync(path,source);
console.log('Captured recordings now open directly in Songs and render downloadable outputs.');
