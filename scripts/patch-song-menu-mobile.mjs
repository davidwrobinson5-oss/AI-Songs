import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let source = fs.readFileSync(pagePath, 'utf8');

// Remove the invisible full-screen dismiss button. On mobile browsers it can
// become the top hit target and swallow taps intended for the action menu.
source = source.replace(/\n\s*<button className="songMenuDismiss" aria-label="Close song options" onClick=\{\(\) => setSongMenuId\(null\)\} \/>/g, '');

// Make all Songs menu controls explicit non-submit buttons so they cannot
// accidentally submit any surrounding form state on mobile.
source = source.replace('<button className="songMenuButton"', '<button type="button" className="songMenuButton"');
source = source.replace(/<button role="menuitem"/g, '<button type="button" role="menuitem"');
source = source.replace(/<button className="songDeleteAction" role="menuitem"/g, '<button type="button" className="songDeleteAction" role="menuitem"');
source = source.replace(/<button key=\{version\.id\}/g, '<button type="button" key={version.id}');

// Keep pointer events inside the menu from bubbling into row-level handlers.
source = source.replace(
  '<div className="songActionMenu" role="menu">',
  '<div className="songActionMenu" role="menu" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>',
);

// Add a reliable explicit close control since the full-screen dismiss layer is gone.
if (!source.includes('className="songMenuCloseAction"')) {
  const menuEndNeedle = '                          {versions.length > 1 && <div className="songVersionMenu"><small>OLDER VERSIONS</small><div>{versions.slice(1).map((version) => <button type="button" key={version.id} onClick={() => { setSongMenuId(null); loadSavedVersion(song, version); }}>Version {version.versionNumber}<span>{new Date(version.createdAt).toLocaleDateString()}</span></button>)}</div></div>}';
  const deleteNeedle = '                          <button type="button" className="songDeleteAction" role="menuitem" onClick={() => void deleteSavedSong(song)}>🗑 Delete Song</button>';
  if (source.includes(deleteNeedle)) {
    source = source.replace(deleteNeedle, `${deleteNeedle}\n                          <button type="button" className="songMenuCloseAction" onClick={() => setSongMenuId(null)}>Close</button>`);
  } else if (source.includes(menuEndNeedle)) {
    source = source.replace(menuEndNeedle, `${menuEndNeedle}\n                          <button type="button" className="songMenuCloseAction" onClick={() => setSongMenuId(null)}>Close</button>`);
  }
}

fs.writeFileSync(pagePath, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIE MOBILE SONG MENU FIX */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.songMenuWrap{z-index:40}.songActionMenu{pointer-events:auto!important;touch-action:manipulation!important}.songActionMenu button{pointer-events:auto!important;touch-action:manipulation!important;cursor:pointer}.songMenuDismiss{display:none!important;pointer-events:none!important}.songActionMenu .songMenuCloseAction{margin-top:6px!important;border-top:1px solid rgba(255,255,255,.08)!important;color:#a9a9b4!important;text-align:center!important}@media(max-width:700px){.songActionMenu{position:fixed!important;left:12px!important;right:12px!important;bottom:78px!important;top:auto!important;width:auto!important;max-height:72vh!important;overflow:auto!important;z-index:2147483000!important;border-radius:20px!important}.songMenuWrap{z-index:2147483000!important}}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Hardened Songs 3-dot menu taps and actions for mobile.');
