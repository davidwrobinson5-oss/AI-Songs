import fs from 'node:fs';

function replaceAllIn(path, replacements) {
  if (!fs.existsSync(path)) return;
  let source = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) source = source.split(from).join(to);
  fs.writeFileSync(path, source);
}

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

const pageReplacements = [
  ['AI SONGS', 'PieInEars'],
  ['AI Songs', 'PieInEars'],
  ['Your cloud music studio', "THE KITCHEN'S OPEN"],
  ['Create a song from your phone.', "The Kitchen's Open."],
  ['Start with music, lyrics, or a melody. Build the song, vocals, mix, master, stems, MIDI, and sheet music in one mobile-first workspace.', 'Bring the idea. Build the beat. Write the lyrics. Track the vocal. Mix it down. Let them cook.'],
  ['Song project', "Today's Recipe"],
  ['Song Project', "Today's Recipe"],
  ['Describe the song', 'Cook Up the Sound'],
  ['Song Description', 'Cook Up the Sound'],
  ['How do you want to start?', 'Where Are We Starting?'],
  ['Generation length', 'Cook Time'],
  ['Generating Music…', 'Cooking…'],
  ['Generate Music v2', '🔥 Cook Up Track'],
  ['Plan Song Before Generating', 'Plan the Recipe'],
  ['Planning…', 'Prepping…'],
  ['Your songs & versions.', 'Your Songs & Versions.'],
  ['Song Library', 'THE VAULT'],
  ['Build songs together.', 'Cook together. Build on each other.'],
  ['Invitation-only collaboration for ideas, lyrics, arrangements, mixes, and song directions. Every member contributes from their own account.', 'The shared studio kitchen for ideas, lyrics, arrangements, mixes, and song directions. Invite the band in, build on each other, and let them cook.'],
  ['🎶<small>Music</small>', '🥧<small>Kitchen</small>'],
  ['<span>AI</span><b>SONGS</b>', '<span>🥧</span><b>PIEINEARS</b>'],
  ['LIVE STUDIO', 'KITCHEN LIVE'],
];
for (const [from, to] of pageReplacements) page = page.split(from).join(to);

if (!page.includes('kitchenStudioStrip')) {
  const heroVisualEnd = `        </div>`;
  const heroVisualIndex = page.indexOf('className="heroVisual noPrint"');
  if (heroVisualIndex >= 0) {
    const closeIndex = page.indexOf(heroVisualEnd, heroVisualIndex);
    if (closeIndex >= 0) {
      const insertAt = closeIndex + heroVisualEnd.length;
      const strip = `
        <div className="kitchenStudioStrip noPrint" aria-hidden="true">
          <div><b>01</b><span>IDEA</span></div>
          <i />
          <div><b>02</b><span>LYRICS</span></div>
          <i />
          <div><b>03</b><span>BEAT</span></div>
          <i />
          <div><b>04</b><span>VOCAL</span></div>
          <i />
          <div><b>05</b><span>MIX</span></div>
        </div>`;
      page = page.slice(0, insertAt) + strip + page.slice(insertAt);
    }
  }
}
fs.writeFileSync(pagePath, page);

replaceAllIn('app/AccountControl.tsx', [['AI Songs', 'PieInEars']]);
replaceAllIn('app/BandWorkspace.tsx', [['AI Songs', 'PieInEars']]);
replaceAllIn('app/PasskeySetupBanner.tsx', [['AI Songs', 'PieInEars']]);

const layoutPath = 'app/layout.tsx';
if (fs.existsSync(layoutPath)) {
  let layout = fs.readFileSync(layoutPath, 'utf8');
  layout = layout.replace("title: 'AI Songs'", "title: 'PieInEars'");
  layout = layout.replace("description: 'Mobile-first AI songwriting studio'", "description: 'PieInEars — The Kitchen\'s Open. Let Them Cook.'");
  layout = layout.replace("themeColor: '#070914'", "themeColor: '#120d08'");
  fs.writeFileSync(layoutPath, layout);
}

const manifestPath = 'public/manifest.webmanifest';
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.name = 'PieInEars';
    manifest.short_name = 'PieInEars';
    manifest.description = "The Kitchen's Open. Let Them Cook.";
    manifest.theme_color = '#120d08';
    manifest.background_color = '#080604';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } catch {}
}

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIEINEARS STUDIO KITCHEN MOCKUP */';
if (!css.includes(marker)) {
  css += `
${marker}
:root{--hot:#ff7a1a!important;--coral:#d95020!important;--orange:#f2a52b!important;--violet:#8b5d35!important;--electric:#ffd071!important;--pieCream:#f5ead8;--pieInk:#0b0907;--pieBrown:#2c1b10;--pieGold:#d99423}
html,body{background:#080604!important;color:#f7efe3!important}
body:before{background:radial-gradient(circle at 18% 8%,rgba(255,122,26,.18),transparent 28%),radial-gradient(circle at 82% 16%,rgba(217,148,35,.13),transparent 31%),radial-gradient(circle at 48% 76%,rgba(102,61,28,.18),transparent 35%)!important;filter:blur(20px)!important}
body:after{background-image:linear-gradient(rgba(255,193,102,.016) 1px,transparent 1px),linear-gradient(90deg,rgba(255,193,102,.012) 1px,transparent 1px)!important;background-size:32px 32px!important}
.hero{background:linear-gradient(155deg,rgba(35,22,13,.98),rgba(10,8,7,.99) 53%,rgba(26,15,8,.98))!important;border-color:rgba(242,165,43,.2)!important;box-shadow:0 28px 85px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,224,180,.06)!important}
.hero:before{background:conic-gradient(from 40deg,#ff7a1a,#f2a52b,#7c4422,#ffd071,#ff7a1a)!important;opacity:.24!important}.hero:after{background:linear-gradient(90deg,transparent,#ff7a1a,#f2a52b,#ffd071,#8b5d35,transparent)!important}
.brand{background:linear-gradient(110deg,rgba(255,122,26,.16),rgba(242,165,43,.12))!important;border-color:rgba(242,165,43,.38)!important;color:#ffe8c2!important;box-shadow:0 0 28px rgba(255,122,26,.12)!important;letter-spacing:.16em!important}
.hero h1{background:linear-gradient(100deg,#fff8ec 8%,#ffe1ad 38%,#ffb44f 63%,#f4d099 88%)!important;-webkit-background-clip:text!important;background-clip:text!important;color:transparent!important}
.hero .sub{color:#c9bba8!important}.eyebrow{color:#bfa987!important}
.heroAlbum{background:radial-gradient(circle at 50% 35%,#ffd986 0 12%,#e88d27 38%,#9c4b19 72%,#3c1c0e 100%)!important;border:1px solid rgba(255,222,165,.32)!important;box-shadow:0 14px 32px rgba(255,122,26,.2),inset 0 1px 0 rgba(255,255,255,.22)!important;transform:rotate(-1deg)!important}.heroAlbum:before{border-color:rgba(255,240,206,.42)!important;box-shadow:0 0 0 10px rgba(73,35,11,.22),0 0 0 20px rgba(255,210,132,.08)!important}.heroAlbum span{font-size:34px!important;filter:drop-shadow(0 3px 7px rgba(0,0,0,.28))}.heroAlbum b{font-size:7px!important;letter-spacing:.17em!important;color:#fff1d3!important}.heroNow>i{background:#ffac35!important;box-shadow:0 0 13px #ff8b24!important}.heroWave i{background:linear-gradient(to top,#8f401b,#ff7a1a 44%,#ffd071)!important;box-shadow:0 0 10px rgba(255,122,26,.2)!important}.heroSpecs span{background:rgba(255,193,102,.055)!important;border-color:rgba(255,193,102,.09)!important;color:#d9c5a8!important}
.kitchenStudioStrip{position:relative;z-index:2;display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:12px;padding:11px 12px;border:1px solid rgba(242,165,43,.12);border-radius:16px;background:rgba(4,3,2,.34)}.kitchenStudioStrip>div{display:grid;justify-items:center;gap:2px}.kitchenStudioStrip b{font-size:8px;color:#ff9b31;letter-spacing:.08em}.kitchenStudioStrip span{font-size:7px;color:#9e8c76;font-weight:850;letter-spacing:.07em}.kitchenStudioStrip i{display:block;width:1px;height:24px;background:linear-gradient(transparent,rgba(242,165,43,.26),transparent)}
.panel{background:linear-gradient(160deg,rgba(24,17,12,.97),rgba(8,7,6,.99))!important;border-color:rgba(226,160,79,.11)!important;box-shadow:0 20px 55px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,235,205,.035)!important}.panel:before{background:linear-gradient(#ff7a1a,#f2a52b,transparent)!important}.panel h2{color:#f8ecdb!important}
input,textarea{background:rgba(5,4,3,.84)!important;border-color:rgba(232,176,100,.12)!important;color:#fff6e9!important}input:focus,textarea:focus{border-color:rgba(255,140,39,.62)!important;box-shadow:0 0 0 3px rgba(255,122,26,.09),inset 0 1px 5px rgba(0,0,0,.25)!important}
.modeCard{background:linear-gradient(145deg,rgba(30,21,14,.98),rgba(8,7,6,.99))!important;border-color:rgba(229,168,91,.1)!important}.modeCard .icon{background:linear-gradient(135deg,rgba(255,122,26,.2),rgba(151,88,37,.22))!important}.modeCard.active{background:linear-gradient(135deg,rgba(255,122,26,.19),rgba(112,62,29,.28) 58%,rgba(11,9,7,.99))!important;border-color:rgba(255,158,55,.58)!important;box-shadow:0 14px 38px rgba(255,122,26,.1),inset 0 1px 0 rgba(255,255,255,.09)!important}.modeCard.active:after{background:linear-gradient(135deg,#ff7a1a,#e7a331)!important;box-shadow:0 5px 14px rgba(255,122,26,.24)!important}
.primary{background:linear-gradient(100deg,#ff6f16 0%,#f39022 43%,#e0ab42 78%,#ffd071 118%)!important;color:#140b05!important;box-shadow:0 12px 32px rgba(255,122,26,.2),inset 0 1px 0 rgba(255,255,255,.28)!important;text-shadow:none!important}.secondary{background:linear-gradient(180deg,rgba(33,24,17,.97),rgba(12,9,7,.99))!important;border-color:rgba(226,160,79,.13)!important;color:#e9dcc9!important}.chip{background:rgba(20,14,10,.96)!important;border-color:rgba(235,177,104,.1)!important;color:#d8c7b2!important}.activeChip{background:linear-gradient(105deg,#ff7619,#d9952d)!important;color:#160b04!important;box-shadow:0 7px 18px rgba(255,122,26,.17)!important}
.smartDescriptionCard{background:linear-gradient(150deg,rgba(48,29,16,.88),rgba(20,14,10,.96) 48%,rgba(10,8,7,.99))!important;border-color:rgba(244,172,78,.15)!important}.smartDescriptionCard:before{background:radial-gradient(circle,rgba(255,122,26,.17),rgba(217,148,35,.08) 38%,transparent 70%)!important}.smartMagicButton{background:linear-gradient(145deg,#fff4df,#f4c985)!important;color:#251207!important}.smartSuggestionRail button,.descriptionPill{border-color:rgba(232,176,100,.1)!important;background:rgba(255,180,85,.045)!important;color:#e6d3bb!important}.descriptionPillActive{background:rgba(255,144,39,.11)!important;border-color:rgba(255,163,62,.28)!important}
.playerCard,.mixChannel,.mixFx,.result,.songLibraryRow,.bandPost{background:linear-gradient(155deg,rgba(27,19,13,.97),rgba(8,7,6,.99))!important;border-color:rgba(226,160,79,.1)!important}.songCoverButton,.songLibraryCard:before{background:linear-gradient(145deg,#ff7a1a,#f2a52b 44%,#8f4b1f 77%,#ffd071)!important;box-shadow:0 10px 24px rgba(255,122,26,.18)!important}.songLibraryCard:nth-child(3n+2):before,.songLibraryCard:nth-child(3n+3):before{background:linear-gradient(145deg,#e2a73c,#b95b20 48%,#5c331c 78%,#f5d392)!important}
.bottomNav{background:rgba(9,7,5,.91)!important;border-color:rgba(235,177,104,.13)!important;box-shadow:0 20px 60px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,225,180,.035)!important}.bottomNav span:before{background:linear-gradient(135deg,rgba(255,122,26,.21),rgba(217,148,35,.13))!important}.bandNavGlyph{background:linear-gradient(135deg,#ff7a1a,#d9952d 60%,#ffd071)!important;color:#211005!important}.bandHeaderCard{background:linear-gradient(145deg,rgba(49,28,16,.95),rgba(19,13,9,.98) 56%,rgba(10,8,6,.97))!important;border-color:rgba(235,177,104,.13)!important}.bandInviteButton{background:linear-gradient(135deg,#ff7a1a,#d9952d)!important;color:#1c0f06!important}.bandKindRail .activeBandKind{background:linear-gradient(135deg,rgba(255,122,26,.22),rgba(217,148,35,.2))!important;border-color:rgba(255,162,57,.32)!important}.bandParentPreview{border-left-color:#e2942f!important;background:rgba(226,148,47,.065)!important}
.statusBox{background:linear-gradient(120deg,rgba(54,34,18,.9),rgba(30,23,15,.92))!important;border-color:rgba(233,163,68,.22)!important;color:#ead7bb!important}
@media(max-width:430px){.kitchenStudioStrip{gap:5px;padding:9px 7px}.kitchenStudioStrip span{font-size:6px}.kitchenStudioStrip b{font-size:7px}}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Applied reversible PieInEars studio-kitchen mockup branding.');
