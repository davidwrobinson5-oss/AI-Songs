import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

const projectPanel = `      <section className="panel">
        <h2>Song project</h2>
        <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
        {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
      </section>

`;

if (source.includes(projectPanel)) source = source.replace(projectPanel, '');

const describeStart = `      <section className="panel">
        <h2>Describe the song</h2>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />`;

const combined = `      <section className="panel songProjectPanel">
        <div className="songProjectBlock">
          <h2>Song project</h2>
          <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
          {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
        </div>
        <div className="songDescriptionBlock">
          <h2>Describe the song</h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />
        </div>`;

if (!source.includes('className="panel songProjectPanel"')) {
  if (!source.includes(describeStart)) throw new Error('Describe-song panel not found.');
  source = source.replace(describeStart, combined);
}

const stateNeedle = `  const [saveStatus, setSaveStatus] = useState('');`;
if (!source.includes('const [promptEnhancing, setPromptEnhancing]')) {
  if (!source.includes(stateNeedle)) throw new Error('Prompt state insertion point not found.');
  source = source.replace(stateNeedle, `${stateNeedle}
  const [promptEnhancing, setPromptEnhancing] = useState(false);
  const [promptEnhanceStatus, setPromptEnhanceStatus] = useState('');
  const [promptUndo, setPromptUndo] = useState('');
  const [aiPromptSuggestions, setAiPromptSuggestions] = useState<string[]>([]);`);
}

const functionNeedle = `  async function generateDirection() {`;
if (!source.includes('async function enhanceSongPrompt()')) {
  if (!source.includes(functionNeedle)) throw new Error('Prompt helper insertion point not found.');
  const helpers = `  function promptSuggestions(value: string) {
    const lower = value.toLowerCase();
    const suggestions: string[] = [...aiPromptSuggestions];
    const add = (...items: string[]) => suggestions.push(...items);

    if (/hip[ -]?hop|rap|808/.test(lower)) add('crisp punchy drums', 'deep 808 bass', 'syncopated groove', 'melodic hook', 'modern polished mix');
    if (/r&b|rnb|soul|neo-soul/.test(lower)) add('warm Rhodes', 'silky bass guitar', 'soulful harmonies', 'laid-back pocket', 'lush vocal layers');
    if (/worship|gospel|praise|church/.test(lower)) add('anthemic build', 'warm piano', 'ambient electric guitar', 'live drums', 'big final chorus');
    if (/funk|groove|disco/.test(lower)) add('funk bass guitar', 'tight live drums', 'rhythmic guitar', 'brass accents', 'danceable groove');
    if (/rock|alternative|indie/.test(lower)) add('driving live drums', 'wide electric guitars', 'dynamic build', 'memorable chorus', 'raw energy');
    if (/electronic|edm|dance|house|synth/.test(lower)) add('layered synths', 'four-on-the-floor', 'wide stereo image', 'rising transitions', 'club-ready low end');
    if (/acoustic|folk|country/.test(lower)) add('acoustic guitar', 'organic percussion', 'natural room sound', 'storytelling feel', 'warm bass');
    if (/cinematic|orchestral|film/.test(lower)) add('cinematic strings', 'deep percussion', 'dramatic dynamics', 'wide orchestration', 'emotional climax');
    if (/dark|moody|sad|melanch/.test(lower)) add('minor-key tension', 'intimate atmosphere', 'haunting texture');
    if (/happy|joy|uplift|hope|bright/.test(lower)) add('uplifting energy', 'bright major-key feel', 'celebratory lift');
    if (/slow|ballad|intimate/.test(lower)) add('72 BPM', 'spacious arrangement', 'close intimate vocal');
    if (/fast|energetic|upbeat|dance/.test(lower)) add('118 BPM', 'high-energy chorus', 'driving rhythm');

    add('92 BPM', 'warm analog texture', 'radio-ready production', 'strong hook', 'dynamic arrangement', 'wide stereo mix', 'live drum feel', 'subtle ear candy');
    const seen = new Set<string>();
    return suggestions.filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key) || lower.includes(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 9);
  }

  function promptQuality(value: string) {
    const lower = value.toLowerCase();
    const checks = [
      /pop|rock|hip[ -]?hop|rap|r&b|rnb|soul|gospel|worship|funk|jazz|country|folk|electronic|edm|house|cinematic|classical|reggae|latin/.test(lower),
      /uplift|happy|joy|dark|moody|sad|hope|warm|intimate|triumph|energetic|reflective|romantic|aggressive|peaceful/.test(lower),
      /piano|guitar|bass|drum|synth|string|brass|organ|rhodes|808|percussion|violin|choir/.test(lower),
      /\\b\\d{2,3}\\s?bpm\\b|groove|swing|half[ -]?time|four-on-the-floor|syncopated|pocket/.test(lower),
      /mix|production|analog|stereo|reverb|polished|raw|lo-fi|hi-fi|cinematic|room sound/.test(lower),
      /verse|chorus|hook|bridge|build|drop|intro|outro|vocal|harmony|dynamic|climax/.test(lower),
    ];
    const score = checks.filter(Boolean).length;
    const next = ['Add a genre or subgenre','Add the emotional mood','Name 1–3 key instruments','Add BPM or groove','Describe the production texture','Describe the hook or arrangement arc'][checks.findIndex((item) => !item)] || 'Detailed prompt — ready to generate';
    return { score, next };
  }

  function addPromptSuggestion(suggestion: string) {
    setPromptUndo(prompt);
    setPrompt((current) => {
      const clean = current.trim().replace(/[,.\\s]+$/, '');
      return clean ? clean + ', ' + suggestion : suggestion;
    });
    setPromptEnhanceStatus('');
  }

  function undoPromptChange() {
    if (!promptUndo) return;
    const current = prompt;
    setPrompt(promptUndo);
    setPromptUndo(current);
    setPromptEnhanceStatus('Restored the previous description.');
  }

  function randomPromptIdea() {
    const ideas = [
      'Uplifting soul-pop with warm Rhodes, melodic bass guitar, crisp live drums, a joyful singable hook, 102 BPM, polished modern production, and a bigger final chorus',
      'Moody cinematic R&B with intimate piano, deep sub bass, sparse percussion, atmospheric synth textures, 76 BPM, emotional verses, and a wide soaring chorus',
      'Energetic Christian hip-hop with punchy drums, deep 808 bass, bright piano accents, confident hopeful energy, 94 BPM, memorable hook, and a clean radio-ready mix',
      'Groovy funk-pop with tight live drums, syncopated bass guitar, rhythmic electric guitar, brass accents, 114 BPM, playful verses, and an explosive danceable chorus',
      'Anthemic modern worship with warm piano, ambient electric guitar, live drums, gradual dynamic build, 74 BPM, intimate opening, and a huge uplifting final chorus',
      'Smooth neo-soul with warm Rhodes, silky bass, pocket drums, subtle guitar fills, 86 BPM, expressive lead vocal space, lush harmonies, and analog warmth',
    ];
    setPromptUndo(prompt);
    setPrompt(ideas[Math.floor(Math.random() * ideas.length)]);
    setAiPromptSuggestions([]);
    setPromptEnhanceStatus('New inspiration loaded.');
  }

  async function enhanceSongPrompt() {
    if (!prompt.trim() || promptEnhancing) return;
    setPromptEnhancing(true);
    setPromptEnhanceStatus('Optimizing the description for music generation…');
    try {
      const response = await fetch('/api/prompt-enhance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vocalRange, instrumental, mode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not enhance the song description.');
      const enhanced = typeof data.enhancedPrompt === 'string' ? data.enhancedPrompt.trim() : '';
      if (!enhanced) throw new Error('No enhanced description was returned.');
      setPromptUndo(prompt);
      setPrompt(enhanced);
      setAiPromptSuggestions(Array.isArray(data.suggestions) ? data.suggestions.filter((item: unknown) => typeof item === 'string').slice(0, 8) : []);
      setPromptEnhanceStatus('AI-enhanced for clearer genre, mood, instrumentation, groove, arrangement, and production direction.');
    } catch (error) {
      setPromptEnhanceStatus(error instanceof Error ? error.message : 'Could not enhance the song description.');
    } finally { setPromptEnhancing(false); }
  }

`;
  source = source.replace(functionNeedle, helpers + functionNeedle);
}

const basicDescription = `        <div className="songDescriptionBlock">
          <h2>Describe the song</h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />
        </div>`;

const smartDescription = `        <div className="songDescriptionBlock smartDescriptionCard">
          <div className="smartDescriptionHeader"><div><p className="smartDescriptionEyebrow">CREATE DIRECTION</p><h2>Song Description</h2></div><div className="smartPromptTools"><button type="button" aria-label="Undo last prompt change" title="Undo" onClick={undoPromptChange} disabled={!promptUndo}>↶</button><button type="button" className="smartMagicButton" aria-label="AI enhance song description" title="AI Enhance" onClick={enhanceSongPrompt} disabled={promptEnhancing || !prompt.trim()}>{promptEnhancing ? '…' : '✦'}</button><button type="button" aria-label="Random song inspiration" title="Random inspiration" onClick={randomPromptIdea}>⚄</button></div></div>
          <textarea className="smartPromptTextarea" value={prompt} onChange={(e) => { setPrompt(e.target.value); setPromptEnhanceStatus(''); }} maxLength={1400} placeholder="Describe the sound you want — genre, mood, instruments, groove, vocal feel, arrangement, production…" />
          <div className="promptQualityRow"><span><b>{promptQuality(prompt).score}/6</b> prompt detail</span><small>{promptQuality(prompt).next}</small></div>
          <div className="smartSuggestionRail" aria-label="Song description suggestions">{promptSuggestions(prompt).map((suggestion) => <button type="button" key={suggestion} onClick={() => addPromptSuggestion(suggestion)}>{suggestion}</button>)}</div>
          <div className="smartDescriptionFooter">{mode === 'music' && <button type="button" className={instrumental ? 'descriptionPill descriptionPillActive' : 'descriptionPill'} onClick={() => setInstrumental((value) => !value)}><span>{instrumental ? '✓' : '○'}</span>{instrumental ? 'Instrumental' : 'With vocals'}</button>}<button type="button" className={lyrics.trim() ? 'descriptionPill descriptionPillActive' : 'descriptionPill'} onClick={() => setMode('lyrics')}>{lyrics.trim() ? '✎' : '＋'} Lyrics</button></div>
          {promptEnhanceStatus && <div className="promptEnhanceStatus">{promptEnhanceStatus}</div>}
        </div>`;

if (!source.includes('className="songDescriptionBlock smartDescriptionCard"')) {
  if (!source.includes(basicDescription)) throw new Error('Combined description block not found for smart composer.');
  source = source.replace(basicDescription, smartDescription);
}

const oldInstrumentalToggle = `            <label className="toggleRow">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span><strong>Instrumental first</strong><small>Turn this off when you want ElevenLabs to create a guide singer that we can convert into Drob.</small></span>
            </label>

`;
if (source.includes(oldInstrumentalToggle)) source = source.replace(oldInstrumentalToggle, '');

fs.writeFileSync(path, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS SMART DESCRIPTION COMPOSER */';
if (!css.includes(marker)) {
  css += `
${marker}
.songProjectPanel{overflow:visible!important}.songProjectBlock{display:grid;gap:10px;padding-bottom:16px}.songProjectBlock h2{margin-bottom:0!important}.songDescriptionBlock.smartDescriptionCard{position:relative;overflow:hidden;margin:2px -2px -2px;padding:18px 16px 0;border:1px solid rgba(255,255,255,.105);border-radius:24px;background:linear-gradient(150deg,rgba(39,24,38,.78),rgba(19,16,27,.92) 46%,rgba(14,15,22,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.065),0 18px 45px rgba(0,0,0,.22)}.smartDescriptionCard:before{content:'';position:absolute;inset:-90px -100px auto auto;width:220px;height:220px;border-radius:50%;background:radial-gradient(circle,rgba(255,114,67,.18),rgba(255,61,129,.1) 35%,transparent 70%);pointer-events:none}.smartDescriptionHeader{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px}.smartDescriptionHeader h2{margin:2px 0 0!important;font-size:19px!important}.smartDescriptionEyebrow{margin:0;color:#918b99;font-size:9px;font-weight:900;letter-spacing:.15em}.smartPromptTools{display:flex;gap:8px}.smartPromptTools button{width:44px;height:44px;display:grid;place-items:center;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.055);color:#e8e5ec;font-size:23px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.smartPromptTools button:disabled{opacity:.32}.smartPromptTools .smartMagicButton{background:linear-gradient(145deg,#fff9f4,#f5edf9)!important;color:#16131b!important;border-color:rgba(255,255,255,.55)!important;box-shadow:0 7px 22px rgba(255,255,255,.08)!important;font-size:22px!important;font-weight:900}.smartPromptTextarea{position:relative;z-index:1;margin-top:16px;min-height:126px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;font-size:18px!important;line-height:1.5!important;letter-spacing:-.012em;resize:vertical!important}.smartPromptTextarea:focus{border:0!important;box-shadow:none!important}.smartPromptTextarea::placeholder{color:#77727e}.promptQualityRow{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px;color:#777482;font-size:10px}.promptQualityRow span{white-space:nowrap}.promptQualityRow b{color:#d4ceda}.promptQualityRow small{text-align:right;color:#85808c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.smartSuggestionRail{display:flex;gap:9px;overflow-x:auto;margin:14px -16px 0;padding:0 16px 15px;scrollbar-width:none;overscroll-behavior-x:contain}.smartSuggestionRail::-webkit-scrollbar{display:none}.smartSuggestionRail button{flex:0 0 auto;min-height:42px;padding:9px 15px;border-radius:999px;border:1px solid rgba(255,255,255,.065);background:rgba(255,255,255,.055);color:#e2dde5;font-size:13px;white-space:nowrap}.smartSuggestionRail button:active{background:rgba(255,255,255,.12);transform:scale(.98)}.smartDescriptionFooter{display:flex;justify-content:space-between;gap:10px;margin:0 -16px;padding:14px 16px;border-top:1px solid rgba(255,255,255,.085);background:rgba(0,0,0,.08)}.descriptionPill{width:auto!important;min-height:44px;margin:0!important;padding:9px 15px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.12)!important;background:rgba(255,255,255,.035)!important;color:#e7e4ea!important;font-weight:800!important}.descriptionPill span{display:inline-grid;place-items:center;margin-right:6px}.descriptionPillActive{border-color:rgba(255,255,255,.22)!important;background:rgba(255,255,255,.075)!important}.promptEnhanceStatus{margin:0 -16px;padding:10px 16px 13px;border-top:1px solid rgba(255,255,255,.055);color:#9a94a2;font-size:10px;line-height:1.45;background:rgba(139,92,255,.035)}
@media(max-width:430px){.songDescriptionBlock.smartDescriptionCard{padding:16px 14px 0;border-radius:22px}.smartPromptTools{gap:6px}.smartPromptTools button{width:40px;height:40px;font-size:21px}.smartPromptTextarea{font-size:17px!important;min-height:118px!important}.smartSuggestionRail{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}.smartDescriptionFooter{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}.promptEnhanceStatus{margin-left:-14px;margin-right:-14px;padding-left:14px;padding-right:14px}.descriptionPill{font-size:12px!important;padding:8px 13px!important}.promptQualityRow small{max-width:58%}}
`;
  fs.writeFileSync(cssPath, css);
}

console.log('Combined Song Project and a smart Suno-inspired song-description composer.');
