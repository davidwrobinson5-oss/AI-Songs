import fs from 'node:fs';

const pagePath='app/page.tsx';
let source=fs.readFileSync(pagePath,'utf8');

if(!source.includes("import PieBottomNav from './PieBottomNav';")){
  const importAnchor="import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';";
  if(source.includes(importAnchor)) source=source.replace(importAnchor,`${importAnchor}\nimport PieBottomNav from './PieBottomNav';\nimport GrowthWorkspaces from './GrowthWorkspaces';\nimport VideoWorkspace from './VideoWorkspace';\nimport OperationsWorkspaces from './OperationsWorkspaces';`);
  else source=source.replace("'use client';",`'use client';\n\nimport PieBottomNav from './PieBottomNav';\nimport GrowthWorkspaces from './GrowthWorkspaces';\nimport VideoWorkspace from './VideoWorkspace';\nimport OperationsWorkspaces from './OperationsWorkspaces';`);
} else {
  if(!source.includes("import VideoWorkspace from './VideoWorkspace';")) source=source.replace("import GrowthWorkspaces from './GrowthWorkspaces';", "import GrowthWorkspaces from './GrowthWorkspaces';\nimport VideoWorkspace from './VideoWorkspace';");
  if(!source.includes("import OperationsWorkspaces from './OperationsWorkspaces';")) source=source.replace("import VideoWorkspace from './VideoWorkspace';", "import VideoWorkspace from './VideoWorkspace';\nimport OperationsWorkspaces from './OperationsWorkspaces';");
}

source=source.replace(/type Screen = [^;]+;/, "type Screen = 'create' | 'songs' | 'train' | 'mix' | 'sheets' | 'video' | 'marketing' | 'band' | 'licensing' | 'calendar' | 'travel' | 'business' | 'accounting';");

const songsAnchor="  if (screen === 'songs') {";
if(!source.includes("screen === 'video'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for Video tab.');
  const video=`  if (screen === 'video') {\n    return (\n      <>\n        <VideoWorkspace onNavigate={(next) => setScreen(next as Screen)} />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n`;
  source=source.replace(songsAnchor,video+songsAnchor);
}

if(!source.includes("screen === 'marketing'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for growth tabs.');
  const growth=`  if (screen === 'marketing' || screen === 'band' || screen === 'licensing') {\n    return (\n      <>\n        <GrowthWorkspaces workspace={screen} onNavigate={(next) => setScreen(next as Screen)} />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n`;
  source=source.replace(songsAnchor,growth+songsAnchor);
}

if(!source.includes("screen === 'calendar'")){
  if(!source.includes(songsAnchor)) throw new Error('Songs screen anchor not found for operations tabs.');
  const operations=`  if (screen === 'calendar' || screen === 'travel' || screen === 'business' || screen === 'accounting') {\n    return (\n      <>\n        <OperationsWorkspaces workspace={screen} onNavigate={(next) => setScreen(next as Screen)} />\n        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />\n      </>\n    );\n  }\n\n`;
  source=source.replace(songsAnchor,operations+songsAnchor);
}

source=source.replace(/<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/g, '<PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />');

if(!source.includes("pie-originality-score")){
  const deletePattern=/(<button[^>]*className="songDeleteAction"[^>]*>🗑 Delete Song<\/button>)/;
  const deleteMatch=source.match(deletePattern);
  const actionBlock=`<button type="button" role="menuitem" onClick={() => { setSongMenuId(null); window.dispatchEvent(new CustomEvent('pie-song-score', { detail: { songId: song.id, title: song.title, lyrics: latest?.lyrics || '', prompt: latest?.prompt || '', vocalRange: latest?.vocalRange || '' } })); }}>🎯 Song Score</button>\n                          <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); window.dispatchEvent(new CustomEvent('pie-originality-score', { detail: { songId: song.id, title: song.title, lyrics: latest?.lyrics || '', prompt: latest?.prompt || '' } })); }}>🧬 Originality Score</button>\n                          `;
  if(deleteMatch) source=source.replace(deletePattern,actionBlock+'$1');
  else {
    const versionsNeedle='{versions.length > 1 && <div className="songVersionMenu">';
    if(!source.includes(versionsNeedle)) throw new Error('Song menu insertion point not found for scoring actions.');
    source=source.replace(versionsNeedle,actionBlock+versionsNeedle);
  }
}

if(!source.includes("<PieBottomNav")) throw new Error('Expanded navigation missing after growth patch.');
if(!source.includes("<VideoWorkspace")) throw new Error('Video workspace missing after growth patch.');
if(!source.includes("<OperationsWorkspaces")) throw new Error('Operations workspaces missing after growth patch.');
if(!source.includes("Originality Score")) throw new Error('Originality Score menu action missing after growth patch.');

fs.writeFileSync(pagePath,source);

const cssPath='app/globals.css';
let css=fs.readFileSync(cssPath,'utf8');
const marker='/* PIE GROWTH TABS + SCORING */';
if(!css.includes(marker)){
  css += `\n${marker}\n.pieExpandedNav{position:fixed;left:0;right:0;bottom:0;z-index:20000;background:rgba(9,9,14,.96);border-top:1px solid rgba(255,255,255,.09);backdrop-filter:blur(22px);padding:7px 6px calc(7px + env(safe-area-inset-bottom));}.pieExpandedNavScroller{display:flex;gap:3px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}.pieExpandedNavScroller::-webkit-scrollbar{display:none}.pieExpandedNav button{flex:0 0 66px;min-height:54px;border:0;border-radius:13px;background:transparent;color:#777784;display:grid;place-items:center;gap:1px;padding:5px 4px}.pieExpandedNav button b{font-size:20px;line-height:1}.pieExpandedNav button small{font-size:9px;font-weight:800}.pieExpandedNav button.navActive{color:#fff;background:rgba(255,255,255,.07)}.growthWorkspace{padding-bottom:104px}.growthCardGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.growthFeatureCard{display:grid;gap:9px;align-content:start;margin:0!important}.growthFeatureCard>strong{font-size:18px}.growthFeatureCard>small{color:#a3a3af;line-height:1.45}.growthFeatureCard>.secondary{margin-top:auto}.originalityBackdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(0,0,0,.7);display:flex;align-items:flex-end;justify-content:center;padding:12px}.originalitySheet{width:min(720px,100%);max-height:88vh;overflow:auto;border-radius:24px 24px 18px 18px;background:#111118;border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 90px rgba(0,0,0,.68);padding:18px}.originalityHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.originalityHead h2{margin:.15em 0}.originalityHeroScore{display:flex;align-items:end;gap:4px;margin:18px 0}.originalityHeroScore>strong{font-size:68px;line-height:.9;letter-spacing:-.06em}.originalityHeroScore>span{font-size:20px;color:#858591;margin-right:12px}.originalityHeroScore>div{display:grid;gap:4px}.originalityHeroScore>div small{color:#858591}.originalityDimensions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.originalityDimensionTop{display:flex;justify-content:space-between;gap:10px;margin-bottom:5px}.originalityEvidence{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.07)}.originalityEvidence span{display:grid;gap:3px}.originalityEvidence small{color:#8f8f9a}.originalityEvidence em{font-style:normal;font-size:10px;font-weight:850;color:#b8b8c3;white-space:nowrap}.originalityDisclaimer{display:block;color:#777784;line-height:1.45;margin-top:12px}@media(max-width:620px){.growthCardGrid,.originalityDimensions{grid-template-columns:1fr}.originalityHeroScore>strong{font-size:58px}.pieExpandedNav button{flex-basis:62px}}\n`;
  fs.writeFileSync(cssPath,css);
}

console.log('Added Video, Marketing, Band, Licensing, Calendar, Travel, Business, Accounting tabs plus scoring actions.');