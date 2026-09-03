import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import CapturedSongResults from './CapturedSongResults';")){
  const importNeedle="import DrobMixPlayer from './DrobMixPlayer';";
  if(!source.includes(importNeedle))throw new Error('Could not find Home import insertion point.');
  source=source.replace(importNeedle,`${importNeedle}\nimport CapturedSongResults from './CapturedSongResults';`);
}

const stateNeedle="  const [screen, setScreen] = useState<Screen>('create');";
if(!source.includes("screenParam === 'songs'")){
  if(!source.includes(stateNeedle))throw new Error('Could not find screen state.');
  source=source.replace(stateNeedle,`${stateNeedle}\n\n  useEffect(() => {\n    const screenParam = new URL(window.location.href).searchParams.get('screen');\n    if (screenParam === 'songs') setScreen('songs');\n  }, []);`);
}

if(!source.includes('<CapturedSongResults />')){
  const libraryNeedle='<section className="songsLibraryPanel">';
  if(!source.includes(libraryNeedle))throw new Error('Could not find Songs library panel.');
  source=source.replace(libraryNeedle,`${libraryNeedle}\n          <div id="captured"><CapturedSongResults /></div>`);
}

fs.writeFileSync(path,source);
console.log('Integrated captured recordings and generated outputs into Songs library.');
