'use client';

import { useMemo, useState } from 'react';

type Props = { onNavigate: (screen: string) => void };

type VideoType = 'Cinematic Narrative' | 'Performance' | 'Hybrid' | 'Lyric Video' | 'Visualizer' | 'Social Short';

const videoTypes: VideoType[] = ['Cinematic Narrative','Performance','Hybrid','Lyric Video','Visualizer','Social Short'];
const ratios = ['16:9 · YouTube','9:16 · Reels / TikTok','1:1 · Square','4:5 · Feed'];
const visualStyles = ['Cinematic Realism','Dreamy Film','High Energy Pop','Dark + Moody','Vintage Analog','Futuristic','Minimal Studio','Animation / Stylized'];
const cameraStyles = ['Natural handheld','Smooth gimbal','Locked cinematic','Fast cuts + movement','Slow push-ins','Mixed by section'];

export default function VideoWorkspace({ onNavigate }: Props) {
  const [videoType, setVideoType] = useState<VideoType>('Hybrid');
  const [ratio, setRatio] = useState(ratios[0]);
  const [visualStyle, setVisualStyle] = useState(visualStyles[0]);
  const [cameraStyle, setCameraStyle] = useState(cameraStyles[5]);
  const [concept, setConcept] = useState('');
  const [story, setStory] = useState('');
  const [performance, setPerformance] = useState('');
  const [location, setLocation] = useState('');
  const [wardrobe, setWardrobe] = useState('');
  const [colorNotes, setColorNotes] = useState('');
  const [mustHave, setMustHave] = useState('');
  const [avoid, setAvoid] = useState('');
  const [duration, setDuration] = useState('3:00');
  const [referenceNames, setReferenceNames] = useState<string[]>([]);
  const [treatment, setTreatment] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const briefStrength = useMemo(() => {
    const fields = [concept, story, performance, location, wardrobe, colorNotes, mustHave, avoid].filter((value) => value.trim()).length;
    return Math.min(100, 30 + fields * 8 + (referenceNames.length ? 8 : 0));
  }, [concept, story, performance, location, wardrobe, colorNotes, mustHave, avoid, referenceNames]);

  async function buildTreatment() {
    if (loading) return;
    setLoading(true);
    setStatus('');
    try {
      const response = await fetch('/api/video-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoType, ratio, visualStyle, cameraStyle, concept, story, performance, location,
          wardrobe, colorNotes, mustHave, avoid, duration, referenceNames,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not build video plan.');
      setTreatment(String(data.text || ''));
      setStatus('Treatment + storyboard ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not build video plan.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="growthWorkspace">
      <section className="hero">
        <p className="eyebrow">See the Song</p>
        <h1>Music Video</h1>
        <p className="sub">Turn a finished Pie song into a visual concept, treatment, storyboard, shot list, performance plan, social cutdowns, and eventually the final AI-assisted video render.</p>
      </section>

      <section className="panel">
        <div className="mixButtons">
          <button className="primary" type="button" onClick={() => onNavigate('songs')}>🎵 Choose Song</button>
          <button className="secondary" type="button" onClick={() => setStatus('Upload/reference assets can be added below.')}>＋ New Video Project</button>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">1. Format</p>
        <h2>What are we making?</h2>
        <div className="chips">
          {videoTypes.map((item) => <button key={item} type="button" className={`chip ${videoType === item ? 'activeChip' : ''}`} onClick={() => setVideoType(item)}>{item}</button>)}
        </div>
        <div className="controlGrid">
          <label><span className="controlLabel">Aspect ratio</span><select value={ratio} onChange={(event) => setRatio(event.target.value)}>{ratios.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="controlLabel">Song duration</span><input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="3:24" /></label>
          <label><span className="controlLabel">Visual style</span><select value={visualStyle} onChange={(event) => setVisualStyle(event.target.value)}>{visualStyles.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span className="controlLabel">Camera language</span><select value={cameraStyle} onChange={(event) => setCameraStyle(event.target.value)}>{cameraStyles.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">2. Creative Direction</p>
        <h2>Give Pie the world of the video</h2>
        <div style={{display:'grid',gap:12}}>
          <label><span className="controlLabel">One-sentence concept</span><textarea value={concept} onChange={(event) => setConcept(event.target.value)} placeholder="What should someone remember visually after watching once?" /></label>
          <label><span className="controlLabel">Story / emotional journey</span><textarea value={story} onChange={(event) => setStory(event.target.value)} placeholder="Beginning → tension → turn → ending. What changes visually as the song progresses?" /></label>
          <label><span className="controlLabel">Performance moments</span><textarea value={performance} onChange={(event) => setPerformance(event.target.value)} placeholder="Band performance, solo artist, lip-sync closeups, instruments, crowd, choreography…" /></label>
          <div className="controlGrid">
            <label><span className="controlLabel">Locations / sets</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Studio, rooftop, forest, warehouse…" /></label>
            <label><span className="controlLabel">Wardrobe / character look</span><input value={wardrobe} onChange={(event) => setWardrobe(event.target.value)} placeholder="Signature clothing, hair, props…" /></label>
            <label><span className="controlLabel">Color + lighting</span><input value={colorNotes} onChange={(event) => setColorNotes(event.target.value)} placeholder="Warm sunset, neon blue, black & white…" /></label>
            <label><span className="controlLabel">Must-have visual</span><input value={mustHave} onChange={(event) => setMustHave(event.target.value)} placeholder="The shot or moment we absolutely need…" /></label>
          </div>
          <label><span className="controlLabel">Avoid</span><input value={avoid} onChange={(event) => setAvoid(event.target.value)} placeholder="Looks, clichés, objects, environments, or effects we do not want…" /></label>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">3. Reference Library</p>
        <h2>Keep the artist consistent</h2>
        <p className="sub">Add artist photos, wardrobe references, locations, props, artwork, logos, frame references, and approved video clips. These become continuity references for future video-generation providers.</p>
        <label className="primary" style={{cursor:'pointer',display:'inline-flex'}}>
          ＋ Add Photos / Video References
          <input hidden multiple type="file" accept="image/*,video/*" onChange={(event) => setReferenceNames(Array.from(event.target.files || []).map((file) => file.name))} />
        </label>
        {referenceNames.length > 0 && <div className="statusBox" style={{marginTop:10}}>{referenceNames.length} reference file{referenceNames.length === 1 ? '' : 's'} selected: {referenceNames.slice(0,5).join(', ')}{referenceNames.length > 5 ? '…' : ''}</div>}
      </section>

      <section className="panel">
        <p className="eyebrow">4. Director AI</p>
        <h2>Treatment + storyboard + shot list</h2>
        <p className="sub">Pie turns the brief into a section-by-section video plan with visual motifs, timestamps, camera direction, continuity notes, performance coverage, transitions, B-roll, hero frames, and social cutdowns.</p>
        <div className="statusBox">Creative brief strength: <strong>{briefStrength}/100</strong></div>
        <button className="primary" type="button" onClick={() => void buildTreatment()} disabled={loading}>{loading ? 'Directing…' : '🎬 Build Music Video Plan'}</button>
        {status && <div className="statusBox" style={{marginTop:10}}>{status}</div>}
        {treatment && <div className="result" style={{marginTop:12}}><pre style={{whiteSpace:'pre-wrap'}}>{treatment}</pre></div>}
      </section>

      <section className="growthCardGrid">
        <article className="panel growthFeatureCard"><strong>🎞 Storyboard</strong><small>Convert the treatment into ordered scenes with timestamps, framing, movement, environment, action, emotion, and transition notes.</small><button className="secondary" type="button" onClick={() => void buildTreatment()}>Build / Refresh</button></article>
        <article className="panel growthFeatureCard"><strong>🧍 Character Continuity</strong><small>Lock approved artist appearance, wardrobe, hair, props, locations, logos, and recurring visual details so generated shots stay consistent.</small><button className="secondary" type="button" onClick={() => setStatus('Add continuity references in the Reference Library above.')}>Set References</button></article>
        <article className="panel growthFeatureCard"><strong>🎤 Performance Sync</strong><small>Plan lip-sync, instrument performance, closeups, wides, cutaways, and chorus hero shots around the actual song structure.</small><button className="secondary" type="button" onClick={() => setStatus('Choose the song from Songs so performance timing can be tied to the final audio.')}>Use Final Audio</button></article>
        <article className="panel growthFeatureCard"><strong>📱 Social Cutdowns</strong><small>Create 9:16 hooks, teaser moments, chorus clips, looping visuals, lyric clips, thumbnails, and platform-specific cut plans from the main video.</small><button className="secondary" type="button" onClick={() => setRatio('9:16 · Reels / TikTok')}>Plan Vertical</button></article>
        <article className="panel growthFeatureCard"><strong>✨ AI Render Queue</strong><small>Provider-ready shot prompts, start/end frames, durations, motion notes, seed/reference controls, retries, upscales, and approved takes will live here.</small><button className="secondary" type="button" disabled>Connect Video Provider</button></article>
        <article className="panel growthFeatureCard"><strong>✂️ Final Edit</strong><small>Sequence approved clips against the master audio, check beat/lyric sync, add titles, logo, captions, transitions, color consistency, and export versions.</small><button className="secondary" type="button" disabled>Render Provider Needed</button></article>
      </section>

      <section className="panel">
        <p className="eyebrow">5. Deliverables</p>
        <h2>One project, every release format</h2>
        <div className="chips"><span className="chip activeChip">4K / 1080p Master</span><span className="chip">YouTube 16:9</span><span className="chip">Reels / TikTok 9:16</span><span className="chip">Square 1:1</span><span className="chip">Thumbnail / Cover Frame</span><span className="chip">Captioned Version</span><span className="chip">Clean / Alternate Cut</span></div>
      </section>
    </main>
  );
}
