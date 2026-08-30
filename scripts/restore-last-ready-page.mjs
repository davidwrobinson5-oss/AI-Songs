import fs from 'node:fs';

const url = 'https://raw.githubusercontent.com/davidwrobinson5-oss/AI-Songs/72d40a50d360fdef15c806cea1f537921fd317a9/app/page.tsx';
const response = await fetch(url, { cache: 'no-store' });
if (!response.ok) throw new Error(`Could not restore known-good app/page.tsx: ${response.status}`);
const source = await response.text();
if (!source.includes("type Screen = 'create' | 'songs';") || !source.includes('export default function Home()')) {
  throw new Error('Known-good page source failed validation.');
}
fs.writeFileSync('app/page.tsx', source);
console.log('Restored known-good app/page.tsx before build patches.');
