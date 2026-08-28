import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes("import BandWorkspace from './BandWorkspace';")) {
  const importNeedles = ["import SheetsWorkspace from './SheetsWorkspace';", "import MixWorkspace from './MixWorkspace';", "import DrobMixPlayer from './DrobMixPlayer';"];
  const needle = importNeedles.find((item) => source.includes(item));
  if (!needle) throw new Error('Band import insertion point not found.');
  source = source.replace(needle, `${needle}\nimport BandWorkspace from './BandWorkspace';`);
}

source = source.replace(
  /type Screen = ([^;]+);/,
  (full, union) => union.includes("'band'") ? full : `type Screen = ${union.replace(/\s+$/, '')} | 'band';`,
);

const bandBlock = `  if (screen === 'band') {
    return (
      <main className="bandScreen">
        <section className="hero noPrint bandHero">
          <div className="brand">AI SONGS</div>
          <p className="eyebrow">Band</p>
          <h1>Build songs together.</h1>
          <p className="sub">Invitation-only collaboration for ideas, lyrics, arrangements, mixes, and song directions. Every member contributes from their own account.</p>
        </section>
        <BandWorkspace
          currentSongTitle={songTitle}
          currentPrompt={prompt}
          onBuild={(title, direction) => {
            setSongTitle(title || 'Band Build');
            setPrompt(direction);
            setMode('music');
            setScreen('create');
          }}
        />
        <nav className="bottomNav noPrint">
          <span onClick={() => setScreen('create')}>🎶<small>Music</small></span>
          <span onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span className="navActive" onClick={() => setScreen('band')}><span className="bandNavGlyph">♬</span><small>Band</small></span>
          <span onClick={() => setScreen('mix')}>🎚️<small>Mix</small></span>
          <span onClick={() => setScreen('sheets')}>📄<small>Sheets</small></span>
        </nav>
      </main>
    );
  }

`;

if (!source.includes("if (screen === 'band')")) {
  const candidates = ["  if (screen === 'sheets') {", "  if (screen === 'mix') {", "  if (screen === 'songs') {"];
  const needle = candidates.find((item) => source.includes(item));
  if (!needle) throw new Error('Band screen insertion point not found.');
  source = source.replace(needle, bandBlock + needle);
}

function nav(active) {
  const cls = (name) => name === active ? ' className="navActive"' : '';
  return `<nav className="bottomNav noPrint">
          <span${cls('create')} onClick={() => setScreen('create')}>🎶<small>Music</small></span>
          <span${cls('train')} onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span${cls('songs')} onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span${cls('band')} onClick={() => setScreen('band')}><span className="bandNavGlyph">♬</span><small>Band</small></span>
          <span${cls('mix')} onClick={() => setScreen('mix')}>🎚️<small>Mix</small></span>
          <span${cls('sheets')} onClick={() => setScreen('sheets')}>📄<small>Sheets</small></span>
        </nav>`;
}

source = source.replace(/<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/g, (full) => {
  if (/navActive[^>]*>[\s\S]*?Band/.test(full)) return nav('band');
  if (/className="navActive"[^>]*>🎵/.test(full)) return nav('songs');
  if (/className="navActive"[^>]*>🎤/.test(full)) return nav('train');
  if (/className="navActive"[^>]*>🎚️/.test(full)) return nav('mix');
  if (/className="navActive"[^>]*>📄/.test(full)) return nav('sheets');
  return nav('create');
});

fs.writeFileSync(path, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS BAND WORKSPACE */';
if (!css.includes(marker)) {
  css += `
${marker}
.bottomNav{grid-template-columns:repeat(6,1fr)!important}.bandNavGlyph{display:grid;place-items:center;width:24px;height:24px;border-radius:9px;background:linear-gradient(135deg,#ff4e8a,#975cff 58%,#4de1ff);color:#fff;font-size:16px;line-height:1;box-shadow:0 5px 15px rgba(151,92,255,.22)}.bandWorkspace{display:grid;gap:14px}.bandHero h1{max-width:600px}.bandMark{width:50px;height:50px;display:block;filter:drop-shadow(0 8px 18px rgba(139,92,255,.18))}.bandMarkLarge{width:78px;height:78px}.bandWelcome{display:grid;justify-items:center;text-align:center;padding:10px 8px 4px}.bandWelcome h2{font-size:27px!important;margin:4px 0 8px!important}.bandWelcome .sub{max-width:520px}.bandCreateCard,.bandInvites,.bandExisting{display:grid;gap:10px;padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:20px;background:linear-gradient(155deg,rgba(25,23,34,.97),rgba(10,10,16,.98))}.bandInvites>button,.bandExisting>button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px 13px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.035);color:#fff;text-align:left}.bandInvites>button span{display:grid;gap:3px}.bandInvites>button small{color:#8f8f9b}.bandInvites>button em{font-style:normal;padding:7px 10px;border-radius:999px;background:linear-gradient(135deg,#ff4e8a,#975cff);font-size:11px;font-weight:900}.bandExisting>button b{color:#a7a4af}.bandHeaderCard{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:linear-gradient(145deg,rgba(38,23,39,.94),rgba(17,15,25,.97) 56%,rgba(11,18,25,.95));box-shadow:0 20px 55px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.06)}.bandHeaderIdentity{display:flex;align-items:center;gap:12px;min-width:0}.bandHeaderIdentity>div{min-width:0}.bandHeaderIdentity h2{margin:1px 0 3px;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bandHeaderIdentity small{color:#8d8997}.bandHeaderActions{display:flex;align-items:center;gap:8px}.bandInviteButton{min-height:40px;padding:9px 12px;border:0;border-radius:13px;background:linear-gradient(135deg,#ff4e8a,#955cff);color:#fff;font-size:12px;font-weight:900}.bandMemberRail{display:flex;gap:13px;overflow-x:auto;padding:3px 2px 8px;scrollbar-width:none}.bandMemberRail::-webkit-scrollbar{display:none}.bandMember{flex:0 0 auto;display:grid;justify-items:center;gap:4px}.bandMember img,.bandMember>span{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:linear-gradient(135deg,#ff4e8a,#875cff,#4de1ff);border:2px solid rgba(255,255,255,.12);font-weight:900}.bandMember small{max-width:76px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#85818d;font-size:9px}.bandComposer{margin-top:0!important;display:grid;gap:12px}.bandComposerTop{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.bandComposerTop h2{margin:1px 0 0!important}.bandCancelBuild{width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.06);color:#aaa6b2;font-size:24px}.bandParentPreview{padding:10px 12px;border-left:2px solid #9b5cff;background:rgba(155,92,255,.07);border-radius:10px;color:#aaa6b4;font-size:11px;line-height:1.45}.bandKindRail{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}.bandKindRail button{flex:0 0 auto;padding:8px 11px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.035);color:#c8c4cd;font-size:11px}.bandKindRail .activeBandKind{background:linear-gradient(135deg,rgba(255,78,138,.25),rgba(151,92,255,.25));border-color:rgba(255,110,162,.35);color:#fff}.bandComposer textarea{min-height:110px!important}.bandComposerActions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.bandComposerActions button{margin-top:0!important}.bandFeedHead{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:6px 2px 0}.bandFeedHead h2{margin:0;font-size:23px}.bandFeedHead button{width:40px;height:40px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:rgba(255,255,255,.04);color:#c5c1cb;font-size:19px}.bandFeed{display:grid;gap:11px}.bandPost{padding:15px;border:1px solid rgba(255,255,255,.085);border-radius:20px;background:linear-gradient(155deg,rgba(23,21,30,.96),rgba(9,9,14,.98));box-shadow:0 13px 34px rgba(0,0,0,.18)}.bandPostTop{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:9px;align-items:center}.bandPostAvatar,.bandPostAvatar img{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;object-fit:cover;background:linear-gradient(135deg,#ff4e8a,#895cff);font-weight:900}.bandPostTop>div{display:grid;gap:2px;min-width:0}.bandPostTop>div strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bandPostTop>div small{color:#74717c;font-size:9px}.bandPostTop>b{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.055);color:#9d98a5;font-size:9px}.bandPost h3{margin:13px 0 4px;font-size:16px}.bandPost p{margin:11px 0;color:#d2ced7;line-height:1.52;font-size:13px}.bandBuildLine{margin-top:10px;padding-left:50px;color:#817c88;font-size:10px}.bandPostActions{display:flex;gap:8px;flex-wrap:wrap}.bandPostActions button{min-height:38px;padding:8px 11px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.035);color:#d9d5de;font-size:10px;font-weight:800}.bandEmptyFeed,.bandEmpty{display:grid;justify-items:center;gap:8px;padding:34px 18px;text-align:center;color:#9a96a1}.bandEmptyFeed strong,.bandEmpty h2{color:#fff}.bandEmptyFeed small{max-width:330px;line-height:1.45}.bandStatus{position:sticky;bottom:98px;z-index:5}
@media(max-width:520px){.bottomNav{padding:6px!important}.bottomNav span{min-height:50px!important;font-size:16px!important}.bottomNav small{font-size:8px!important}.bandNavGlyph{width:22px;height:22px;font-size:14px}.bandHeaderCard{align-items:flex-start;flex-direction:column}.bandHeaderActions{width:100%;justify-content:space-between}.bandComposerActions{grid-template-columns:1fr}.bandPostTop{grid-template-columns:38px minmax(0,1fr) auto}.bandPostAvatar,.bandPostAvatar img{width:38px;height:38px}.bandPostTop>b{max-width:84px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added invitation-gated Band collaboration screen and navigation icon.');
