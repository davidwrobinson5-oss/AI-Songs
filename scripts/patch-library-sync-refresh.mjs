import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = '/* PIE LIBRARY SYNC REFRESH */';
if (!source.includes(marker)) {
  const needle = `  useEffect(() => {\n    if (screen === 'songs') refreshLibrary();\n  }, [screen]);`;
  if (!source.includes(needle)) throw new Error('Songs refresh effect not found after build patches.');
  const replacement = `${needle}\n\n  ${marker}\n  useEffect(() => {\n    const onSynced = () => {\n      if (screen === 'songs') void refreshLibrary();\n    };\n    window.addEventListener('pie-library-synced', onSynced);\n    return () => window.removeEventListener('pie-library-synced', onSynced);\n  }, [screen]);`;
  source = source.replace(needle, replacement);
  fs.writeFileSync(path, source);
}
console.log('Enabled immediate Songs refresh after cloud sync.');
