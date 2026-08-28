import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

const visual = `
        <div className="heroVisual noPrint" aria-hidden="true">
          <div className="heroAlbum"><span>AI</span><b>SONGS</b></div>
          <div className="heroVisualBody">
            <div className="heroNow"><i /> LIVE STUDIO</div>
            <div className="heroWave">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className="heroSpecs"><span>24-BIT</span><span>44.1 / 48 / 96K</span><span>TIGHT SYNC</span></div>
          </div>
        </div>`;

const createNeedle = `        <p className="sub">Start with music, lyrics, or a melody. Build the song, vocals, mix, master, stems, MIDI, and sheet music in one mobile-first workspace.</p>`;
if (!page.includes('heroVisual noPrint')) {
  if (!page.includes(createNeedle)) throw new Error('Create hero copy not found for flashy UI patch.');
  page = page.replace(createNeedle, createNeedle + visual);
}

page = page.replace('<div className="playerCard" key={song.id}>', '<div className="playerCard songLibraryCard" key={song.id}>');
fs.writeFileSync(pagePath, page);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS FLASHY MOBILE V2 */';
if (!css.includes(marker)) {
  css += `
${marker}
:root{--hot:#ff3d81;--coral:#ff6547;--orange:#ff9a3d;--violet:#8b5cff;--electric:#55e7ff;--ink:#07070b;--card:#111118}
html,body{background:#050507!important;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;overflow-x:hidden}
body:before{content:'';position:fixed;z-index:-2;inset:-22vh -30vw;background:radial-gradient(circle at 18% 10%,rgba(255,61,129,.22),transparent 24%),radial-gradient(circle at 82% 18%,rgba(139,92,255,.22),transparent 28%),radial-gradient(circle at 50% 74%,rgba(85,231,255,.12),transparent 28%);filter:blur(18px);animation:auroraFloat 14s ease-in-out infinite alternate;pointer-events:none}
body:after{content:'';position:fixed;z-index:-1;inset:0;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.45),transparent 70%);pointer-events:none}
@keyframes auroraFloat{0%{transform:translate3d(-2%,0,0) scale(1)}100%{transform:translate3d(3%,2%,0) scale(1.08)}}
main{position:relative;max-width:820px!important;padding:16px 14px 116px!important}
.hero{position:relative;overflow:hidden;margin:4px 0 18px;padding:24px 20px 20px!important;border:1px solid rgba(255,255,255,.11);border-radius:30px;background:linear-gradient(150deg,rgba(28,20,32,.94),rgba(11,10,18,.96) 48%,rgba(8,14,22,.96));box-shadow:0 28px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08)}
.hero:before{content:'';position:absolute;width:270px;height:270px;right:-105px;top:-120px;border-radius:50%;background:conic-gradient(from 40deg,var(--hot),var(--orange),var(--violet),var(--electric),var(--hot));filter:blur(24px);opacity:.32;animation:spinGlow 16s linear infinite;pointer-events:none}
.hero:after{height:2px!important;background:linear-gradient(90deg,transparent,var(--hot),var(--orange),var(--violet),var(--electric),transparent)!important;opacity:.8}
@keyframes spinGlow{to{transform:rotate(360deg)}}
.brand{position:relative;z-index:1!important;background:linear-gradient(110deg,rgba(255,61,129,.18),rgba(139,92,255,.18))!important;border:1px solid rgba(255,107,151,.42)!important;color:#fff!important;box-shadow:0 0 30px rgba(255,61,129,.16)!important;font-size:11px!important;letter-spacing:.22em!important}
.eyebrow{position:relative;z-index:1;color:#d8cfdd!important;font-weight:700;letter-spacing:.02em}
.hero h1{position:relative;z-index:1;font-size:42px!important;line-height:.98!important;letter-spacing:-.055em!important;max-width:600px;background:linear-gradient(100deg,#fff 8%,#ffe4ef 34%,#ffc678 58%,#b9a7ff 80%,#8ff3ff);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:none!important}
.hero .sub{position:relative;z-index:1;color:#c1bdc9!important;max-width:620px;font-size:14px;line-height:1.55}
.heroVisual{position:relative;z-index:1;display:grid;grid-template-columns:112px 1fr;gap:16px;align-items:center;margin-top:20px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:linear-gradient(120deg,rgba(255,255,255,.075),rgba(255,255,255,.025));box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 18px 44px rgba(0,0,0,.25);overflow:hidden}
.heroVisual:after{content:'';position:absolute;inset:auto -20% -70% 20%;height:130px;background:radial-gradient(ellipse,rgba(255,61,129,.24),transparent 65%);pointer-events:none}
.heroAlbum{position:relative;display:grid;place-content:center;width:112px;aspect-ratio:1;border-radius:23px;background:radial-gradient(circle at 30% 25%,#ffd46d 0 8%,transparent 24%),conic-gradient(from 210deg,#ff315d,#ff8b3d,#8b5cff,#36d5ff,#ff315d);box-shadow:0 14px 32px rgba(255,61,129,.24),inset 0 1px 0 rgba(255,255,255,.35);overflow:hidden;transform:rotate(-2deg)}
.heroAlbum:before{content:'';position:absolute;width:72px;height:72px;border-radius:50%;left:20px;top:20px;border:1px solid rgba(255,255,255,.38);box-shadow:0 0 0 12px rgba(0,0,0,.09),0 0 0 24px rgba(255,255,255,.07)}
.heroAlbum:after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.24),transparent 33%,rgba(0,0,0,.2));mix-blend-mode:soft-light}
.heroAlbum span,.heroAlbum b{position:relative;z-index:2;text-align:center;text-shadow:0 2px 12px rgba(0,0,0,.35)}
.heroAlbum span{font-size:30px;font-weight:950;line-height:.9}.heroAlbum b{font-size:9px;letter-spacing:.24em;margin-top:5px}
.heroVisualBody{display:grid;gap:10px;min-width:0}.heroNow{font-size:10px;font-weight:900;letter-spacing:.15em;color:#fff;display:flex;align-items:center;gap:7px}.heroNow>i{display:block;width:7px;height:7px;border-radius:50%;background:#54ffa8;box-shadow:0 0 13px #54ffa8;animation:livePulse 1.4s ease-in-out infinite}
@keyframes livePulse{50%{opacity:.35;transform:scale(.8)}}
.heroWave{height:54px;display:flex;align-items:center;gap:3px;overflow:hidden}.heroWave i{display:block;flex:1;min-width:2px;max-width:7px;height:14px;border-radius:999px;background:linear-gradient(to top,var(--hot),var(--orange) 46%,var(--electric));box-shadow:0 0 10px rgba(255,80,140,.22);transform-origin:center;animation:waveBeat 1.05s ease-in-out infinite alternate}.heroWave i:nth-child(3n){height:36px;animation-delay:-.35s}.heroWave i:nth-child(4n){height:48px;animation-delay:-.7s}.heroWave i:nth-child(5n){height:25px;animation-delay:-.18s}.heroWave i:nth-child(7n){height:42px;animation-delay:-.56s}
@keyframes waveBeat{from{transform:scaleY(.38);opacity:.58}to{transform:scaleY(1);opacity:1}}
.heroSpecs{display:flex;gap:6px;flex-wrap:wrap}.heroSpecs span{padding:5px 7px;border-radius:999px;background:rgba(255,255,255,.075);border:1px solid rgba(255,255,255,.08);font-size:8px;font-weight:850;letter-spacing:.08em;color:#dcd9e2}
.panel{position:relative;overflow:hidden;border-radius:26px!important;background:linear-gradient(160deg,rgba(20,19,28,.95),rgba(10,10,16,.97))!important;border:1px solid rgba(255,255,255,.09)!important;box-shadow:0 20px 54px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.055)!important;padding:18px!important}
.panel:before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(var(--hot),var(--violet),transparent);opacity:.55}
.panel h2{font-size:17px!important;letter-spacing:-.02em;color:#fff}
main>.hero+.panel{background:linear-gradient(125deg,rgba(40,23,39,.96),rgba(15,13,23,.98))!important;border-color:rgba(255,99,151,.18)!important}
input,textarea{background:rgba(5,5,9,.82)!important;border:1px solid rgba(255,255,255,.105)!important;color:#fff!important;box-shadow:inset 0 1px 5px rgba(0,0,0,.25)!important;transition:border-color .18s ease,box-shadow .18s ease}
input:focus,textarea:focus{border-color:rgba(255,83,145,.68)!important;box-shadow:0 0 0 3px rgba(255,61,129,.10),inset 0 1px 5px rgba(0,0,0,.22)!important}
.modeGrid{gap:10px!important}.modeCard{position:relative;overflow:hidden;min-height:98px;border-radius:20px!important;background:linear-gradient(145deg,rgba(24,22,31,.98),rgba(9,9,14,.98))!important;border:1px solid rgba(255,255,255,.085)!important;box-shadow:0 12px 30px rgba(0,0,0,.18)!important}.modeCard:before{content:'';position:absolute;width:90px;height:90px;right:-35px;bottom:-45px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,255,.25),transparent 68%)}.modeCard .icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,rgba(255,61,129,.22),rgba(139,92,255,.25));box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}.modeCard.active{background:linear-gradient(135deg,rgba(255,61,129,.22),rgba(112,54,164,.25) 55%,rgba(16,22,30,.98))!important;border-color:rgba(255,104,155,.68)!important;box-shadow:0 14px 38px rgba(255,61,129,.13),inset 0 1px 0 rgba(255,255,255,.13)!important}.modeCard.active:after{content:'✓';position:absolute;right:12px;top:11px;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--hot),var(--orange));font-weight:900;font-size:12px;box-shadow:0 5px 14px rgba(255,61,129,.28)}
.primary{position:relative;overflow:hidden;background:linear-gradient(100deg,#ff315f 0%,#ff6547 38%,#a64dff 74%,#4edfff 118%)!important;color:#fff!important;border:1px solid rgba(255,255,255,.18)!important;box-shadow:0 12px 32px rgba(255,61,129,.24),inset 0 1px 0 rgba(255,255,255,.24)!important;text-shadow:0 1px 7px rgba(0,0,0,.16);min-height:50px;transition:transform .15s ease,filter .15s ease}.primary:before{content:'';position:absolute;inset:-100% auto -100% -35%;width:36%;transform:rotate(18deg);background:linear-gradient(90deg,transparent,rgba(255,255,255,.32),transparent);animation:buttonShine 4s ease-in-out infinite}.primary:active{transform:scale(.985)}
@keyframes buttonShine{0%,55%{left:-40%}78%,100%{left:125%}}
.secondary{background:linear-gradient(180deg,rgba(28,27,37,.96),rgba(12,12,18,.98))!important;border-color:rgba(255,255,255,.11)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
.chip{background:rgba(15,14,21,.94)!important;border:1px solid rgba(255,255,255,.09)!important}.activeChip{background:linear-gradient(105deg,var(--hot),var(--violet))!important;color:white!important;box-shadow:0 7px 18px rgba(255,61,129,.2)!important}
.playerCard,.mixChannel,.mixFx,.result{border-radius:20px!important;background:linear-gradient(155deg,rgba(22,21,29,.96),rgba(9,9,14,.98))!important;border:1px solid rgba(255,255,255,.085)!important}.playerCard:has(audio){box-shadow:inset 0 2px 0 rgba(255,80,143,.22),0 14px 34px rgba(0,0,0,.21)!important}.playerCard audio{border-radius:14px;filter:saturate(1.15)}
.songLibraryCard{position:relative;min-height:112px;padding-left:106px!important;margin-bottom:12px}.songLibraryCard:before{content:'♫';position:absolute;left:14px;top:14px;width:78px;height:78px;display:grid;place-items:end start;padding:11px;border-radius:19px;background:radial-gradient(circle at 25% 20%,rgba(255,255,255,.72),transparent 11%),linear-gradient(145deg,#ff365f,#ff933d 45%,#8b5cff 75%,#39d8ff);font-size:24px;font-weight:900;color:white;box-shadow:0 12px 27px rgba(255,61,129,.2),inset 0 1px 0 rgba(255,255,255,.3);text-shadow:0 2px 8px rgba(0,0,0,.25)}.songLibraryCard:nth-child(3n+2):before{background:linear-gradient(145deg,#4cd8ff,#4b72ff 45%,#a24cff 78%,#ff4ea1)}.songLibraryCard:nth-child(3n+3):before{background:linear-gradient(145deg,#ffd14a,#ff7147 45%,#ff315f 72%,#8b5cff)}
.mixConsole{gap:14px!important}.mixChannel{position:relative;overflow:hidden}.mixChannel:before{content:'';position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,var(--hot),var(--orange),var(--electric));opacity:.58}.mixBadge{background:linear-gradient(105deg,rgba(255,61,129,.18),rgba(139,92,255,.18))!important;border-color:rgba(255,100,154,.28)!important;color:#fff!important}.mixTiny.activeMixTiny{background:linear-gradient(135deg,var(--hot),var(--violet))!important;color:#fff!important}
.statusBox{background:linear-gradient(120deg,rgba(40,24,51,.92),rgba(12,28,42,.92))!important;border-color:rgba(164,100,255,.27)!important}.errorBox{box-shadow:0 0 24px rgba(255,50,91,.08)}
.bottomNav{bottom:10px!important;padding:7px!important;border-radius:24px!important;background:rgba(8,8,12,.88)!important;border:1px solid rgba(255,255,255,.12)!important;box-shadow:0 20px 60px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.06)!important;backdrop-filter:blur(28px) saturate(170%)!important}.bottomNav span{position:relative;min-height:54px;justify-content:center;border-radius:17px;transition:.18s ease!important}.bottomNav span:before{content:'';position:absolute;inset:4px;border-radius:14px;background:linear-gradient(135deg,rgba(255,61,129,.24),rgba(139,92,255,.18));opacity:0;transform:scale(.82);transition:.18s ease}.bottomNav span>*{position:relative;z-index:1}.bottomNav .navActive{color:#fff!important;transform:translateY(-2px)}.bottomNav .navActive:before{opacity:1;transform:scale(1);box-shadow:0 8px 22px rgba(255,61,129,.14)}.bottomNav small{font-weight:750;letter-spacing:.02em}
@media(max-width:430px){.hero{padding:21px 17px 18px!important;border-radius:27px}.hero h1{font-size:39px!important}.heroVisual{grid-template-columns:92px 1fr;padding:11px;gap:12px}.heroAlbum{width:92px;border-radius:19px}.heroAlbum:before{width:60px;height:60px;left:16px;top:16px}.heroWave{height:47px}.heroSpecs span{font-size:7px}.panel{padding:16px!important}.modeCard{min-height:94px}.bottomNav{width:calc(100% - 18px)!important}}
@media(min-width:700px){.hero{padding:34px 30px 28px!important}.hero h1{font-size:58px!important}.heroVisual{grid-template-columns:140px 1fr}.heroAlbum{width:140px}.heroWave{height:70px}}
@media(prefers-reduced-motion:reduce){body:before,.hero:before,.heroNow>i,.heroWave i,.primary:before{animation:none!important}}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Applied flashy mobile music-app visual identity.');
