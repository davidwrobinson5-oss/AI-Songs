import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';
import { awardPieScore } from '../../scoreServer';

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function tokenStats(text: string) {
  const words = text.toLowerCase().match(/[a-z0-9']+/g) || [];
  const unique = new Set(words);
  const lexical = words.length ? unique.size / words.length : 0.5;
  const clichés = [
    'heart on my sleeve','lost without you','you complete me','break my heart','never let you go','all night long','take my breath away','one more chance','meant to be','forever and always','fire in my soul','stars align','end of the road','dancing in the dark','love of my life','without you','hold me close','set me free','piece of me','crazy for you',
  ];
  const lower = text.toLowerCase();
  const clichéHits = clichés.filter((phrase) => lower.includes(phrase)).length;
  return { words: words.length, lexical, clichéHits };
}

function titleTokens(title: string) {
  return new Set((title.toLowerCase().match(/[a-z0-9]+/g) || []).filter((word) => word.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (!a.size && !b.size) return 1;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

async function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))]);
}

async function musicBrainzTitleCheck(title: string) {
  if (!title.trim()) return { ok: false, count: 0, closest: '', similarity: 0 };
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(`recording:${title}`)}&fmt=json&limit=8`;
  const response = await withTimeout(fetch(url, { headers: { 'User-Agent': 'PieInEars/1.0 originality-check' }, cache: 'no-store' }), 6000);
  if (!response.ok) throw new Error('MUSICBRAINZ_UNAVAILABLE');
  const json = await response.json() as { count?: number; recordings?: Array<{ title?: string }> };
  let closest = '';
  let similarity = 0;
  const target = titleTokens(title);
  for (const row of json.recordings || []) {
    const candidate = String(row.title || '');
    const score = jaccard(target, titleTokens(candidate));
    if (score > similarity) { similarity = score; closest = candidate; }
  }
  return { ok: true, count: Number(json.count || 0), closest, similarity };
}

async function laionTitleCheck(title: string) {
  if (!title.trim()) return { ok: false, rows: 0, closest: '', similarity: 0 };
  const cleaned = title.replace(/'/g, "''").slice(0, 160);
  const where = `lower(title) LIKE '%${cleaned.toLowerCase()}%'`;
  const url = `https://datasets-server.huggingface.co/filter?dataset=${encodeURIComponent('laion/LAION-DISCO-12M')}&config=default&split=train&where=${encodeURIComponent(where)}&length=20`;
  const response = await withTimeout(fetch(url, { cache: 'no-store' }), 7000);
  if (!response.ok) throw new Error('LAION_UNAVAILABLE');
  const json = await response.json() as { rows?: Array<{ row?: { title?: string } }> };
  let closest = '';
  let similarity = 0;
  const target = titleTokens(title);
  for (const wrapped of json.rows || []) {
    const candidate = String(wrapped.row?.title || '');
    const score = jaccard(target, titleTokens(candidate));
    if (score > similarity) { similarity = score; closest = candidate; }
  }
  return { ok: true, rows: (json.rows || []).length, closest, similarity };
}

type AudioAnalysis = {
  chromaprint?: string;
  analyzedSeconds?: number;
  melody?: { score?: number; voicedFrames?: number; intervalDiversity?: number; repetition?: number; detail?: string };
  harmony?: { score?: number; key?: string; chordDiversity?: number; commonProgressionSimilarity?: number; detail?: string };
  localLibrary?: { compared?: number; maxSimilarity?: number; closestTitle?: string; fingerprintSimilarity?: number; melodySimilarity?: number; harmonySimilarity?: number };
};

async function acoustIdLookup(fingerprint: string, durationSeconds: number) {
  const key = process.env.ACOUSTID_API_KEY;
  if (!key || !fingerprint || !durationSeconds) return null;
  const url = `https://api.acoustid.org/v2/lookup?client=${encodeURIComponent(key)}&meta=recordings+releasegroups&duration=${encodeURIComponent(String(Math.max(1, Math.round(durationSeconds))))}&fingerprint=${encodeURIComponent(fingerprint)}`;
  const response = await withTimeout(fetch(url, { cache: 'no-store' }), 7000);
  if (!response.ok) throw new Error('ACOUSTID_UNAVAILABLE');
  const json = await response.json() as { status?: string; results?: Array<{ score?: number; recordings?: Array<{ title?: string }> }> };
  const results = Array.isArray(json.results) ? json.results : [];
  let bestScore = 0;
  let bestTitle = '';
  for (const row of results) {
    const score = Number(row.score || 0);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = String(row.recordings?.[0]?.title || '');
    }
  }
  return { bestScore, bestTitle, count: results.length };
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'originality-score', 12, 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 96_000);
    const title = textField(body.title, 220, 'Untitled Song');
    const lyrics = textField(body.lyrics, 24_000);
    const prompt = textField(body.prompt, 6_000);
    const audio = (body.audioAnalysis && typeof body.audioAnalysis === 'object' ? body.audioAnalysis : null) as AudioAnalysis | null;

    const evidence: Array<{ source: string; status: string; detail: string }> = [];
    const dimensions: Array<{ name: string; score: number; detail: string }> = [];

    const stats = tokenStats(lyrics);
    let lyricScore = lyrics.trim() ? 68 + stats.lexical * 26 - stats.clichéHits * 5 : 65;
    if (stats.words > 120) lyricScore += 3;
    lyricScore = clamp(lyricScore);
    dimensions.push({ name: 'Lyric Distinctiveness', score: lyricScore, detail: lyrics.trim() ? `${Math.round(stats.lexical * 100)}% unique-word ratio with ${stats.clichéHits} common cliché phrase${stats.clichéHits === 1 ? '' : 's'} detected.` : 'No lyrics were available, so Pie used a neutral provisional score.' });

    const promptStats = tokenStats(prompt);
    const conceptScore = clamp(prompt.trim() ? 62 + promptStats.lexical * 30 - Math.max(0, 18 - promptStats.words) * 0.5 : 60);
    dimensions.push({ name: 'Concept Specificity', score: conceptScore, detail: prompt.trim() ? 'Scores how specific and differentiated the described concept is.' : 'No song-direction text was available.' });

    let mbScore = 75;
    try {
      const mb = await musicBrainzTitleCheck(title);
      const collisionPenalty = Math.min(28, Math.log10(Math.max(1, mb.count)) * 8 + mb.similarity * 18);
      mbScore = clamp(94 - collisionPenalty);
      evidence.push({ source: 'MusicBrainz', status: 'Checked', detail: mb.closest ? `${mb.count} catalog results; closest title: “${mb.closest}”.` : `${mb.count} catalog results for the title search.` });
    } catch {
      evidence.push({ source: 'MusicBrainz', status: 'Unavailable', detail: 'The public catalog check did not respond during this scan.' });
    }
    dimensions.push({ name: 'Catalog Title Novelty', score: mbScore, detail: 'Compares the title against a large public music catalog. Title similarity alone does not mean the composition is similar.' });

    let laionScore = 76;
    try {
      const laion = await laionTitleCheck(title);
      const collisionPenalty = Math.min(30, laion.rows * 1.8 + laion.similarity * 20);
      laionScore = clamp(95 - collisionPenalty);
      evidence.push({ source: 'LAION-DISCO-12M', status: 'Checked', detail: laion.closest ? `${laion.rows} matching metadata rows sampled; closest title: “${laion.closest}”.` : `${laion.rows} matching metadata rows sampled.` });
    } catch {
      evidence.push({ source: 'LAION-DISCO-12M', status: 'Unavailable', detail: 'The public Hugging Face dataset service did not return a metadata sample during this scan.' });
    }
    dimensions.push({ name: 'LAION Metadata Novelty', score: laionScore, detail: 'Uses LAION-DISCO metadata as an index check; it does not treat metadata matches as audio matches.' });

    let fingerprintScore = 70;
    let fingerprintChecked = false;
    if (audio?.chromaprint && audio.analyzedSeconds) {
      try {
        const acoust = await acoustIdLookup(audio.chromaprint, audio.analyzedSeconds);
        if (acoust) {
          fingerprintChecked = true;
          fingerprintScore = clamp(100 - acoust.bestScore * 92);
          evidence.push({ source: 'AcoustID / Chromaprint', status: 'Checked', detail: acoust.bestScore > 0 ? `Best database fingerprint similarity ${Math.round(acoust.bestScore * 100)}%${acoust.bestTitle ? ` to “${acoust.bestTitle}”` : ''}.` : 'No strong AcoustID fingerprint match was returned.' });
        } else {
          evidence.push({ source: 'AcoustID / Chromaprint', status: 'Fingerprint generated', detail: 'Pie generated a Chromaprint fingerprint, but no AcoustID API key is configured for public fingerprint lookup.' });
        }
      } catch {
        evidence.push({ source: 'AcoustID / Chromaprint', status: 'Lookup unavailable', detail: 'Pie generated the fingerprint, but the public AcoustID lookup did not respond during this scan.' });
      }
    } else {
      evidence.push({ source: 'AcoustID / Chromaprint', status: 'No audio fingerprint', detail: 'No usable audio fingerprint was attached to this scan.' });
    }
    dimensions.push({ name: 'Audio Fingerprint Novelty', score: fingerprintScore, detail: fingerprintChecked ? 'Exact/near-exact recording fingerprint evidence from AcoustID.' : 'Provisional until both a Chromaprint fingerprint and AcoustID lookup are available.' });

    const melodyScore = clamp(Number(audio?.melody?.score ?? 68));
    const harmonyScore = clamp(Number(audio?.harmony?.score ?? 68));
    const localSimilarity = Math.max(0, Math.min(1, Number(audio?.localLibrary?.maxSimilarity ?? 0)));
    const localNovelty = clamp(100 - localSimilarity * 100);

    dimensions.push({ name: 'Melodic Distinctiveness', score: melodyScore, detail: audio?.melody?.detail || 'No decoded song audio was available for melody-contour analysis.' });
    dimensions.push({ name: 'Harmonic Distinctiveness', score: harmonyScore, detail: audio?.harmony?.detail || 'No decoded song audio was available for harmonic-profile analysis.' });
    dimensions.push({ name: 'Pie Library Audio Novelty', score: localNovelty, detail: audio?.localLibrary?.compared ? `Compared against ${audio.localLibrary.compared} previously scanned Pie song(s). Closest combined local similarity: ${Math.round(localSimilarity * 100)}%${audio.localLibrary.closestTitle ? ` (${audio.localLibrary.closestTitle})` : ''}.` : 'No previously scanned Pie songs were available for comparison.' });

    if (audio) {
      evidence.push({ source: 'Pie melodic contour', status: 'Checked', detail: `Melody score ${melodyScore}/100${audio.melody?.voicedFrames != null ? ` from ${audio.melody.voicedFrames} voiced frames` : ''}.` });
      evidence.push({ source: 'Pie harmonic profile', status: 'Checked', detail: `Harmony score ${harmonyScore}/100${audio.harmony?.key ? `; estimated key ${audio.harmony.key}` : ''}.` });
      if (audio.localLibrary?.compared) evidence.push({ source: 'Pie private library', status: 'Checked', detail: `Compared fingerprint, melodic contour, and harmonic sequence with ${audio.localLibrary.compared} previously scanned Pie song(s).` });
    }

    const hasDeepAudio = Boolean(audio);
    const weights = hasDeepAudio
      ? { lyric: 0.12, concept: 0.07, mb: 0.08, laion: 0.08, fingerprint: 0.25, melody: 0.16, harmony: 0.14, local: 0.10 }
      : { lyric: 0.30, concept: 0.15, mb: 0.25, laion: 0.30, fingerprint: 0, melody: 0, harmony: 0, local: 0 };

    const score = clamp(
      lyricScore * weights.lyric + conceptScore * weights.concept + mbScore * weights.mb + laionScore * weights.laion +
      fingerprintScore * weights.fingerprint + melodyScore * weights.melody + harmonyScore * weights.harmony + localNovelty * weights.local
    );

    const checkedPublic = evidence.filter((item) => item.status === 'Checked' && (item.source === 'MusicBrainz' || item.source === 'LAION-DISCO-12M')).length;
    let confidence = 42 + checkedPublic * 8 + (lyrics.trim() ? 5 : 0) + (prompt.trim() ? 3 : 0);
    if (audio) confidence += 18;
    if ((audio?.melody?.voicedFrames || 0) >= 8) confidence += 7;
    if (audio?.harmony?.key) confidence += 5;
    if ((audio?.localLibrary?.compared || 0) >= 1) confidence += 5;
    if (fingerprintChecked) confidence += 15;
    confidence = clamp(confidence);

    const label = score >= 90 ? 'Highly Distinctive' : score >= 80 ? 'Strong Originality Signals' : score >= 70 ? 'Good, with Familiar Elements' : score >= 55 ? 'Mixed Originality Signals' : 'Needs More Differentiation';
    const trustLabel = confidence >= 90 ? 'High trust' : confidence >= 75 ? 'Strong trust' : confidence >= 60 ? 'Moderate trust' : 'Preliminary';
    const scoreRef = textField(body.songId, 180, title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,120) || 'untitled');
    await awardPieScore('originality_scan',scoreRef,score,{confidence,title});

    return NextResponse.json({
      score,
      confidence,
      label,
      summary: `Pie found ${label.toLowerCase()}. Evidence trust is ${trustLabel.toLowerCase()} because the score now weights fingerprint, melodic-contour, harmonic-profile, local-library, lyric, and catalog evidence when available.`,
      dimensions,
      evidence,
      disclaimer: 'Originality Score is a similarity-risk estimate, not copyright clearance or a legal opinion. Fingerprint matches are strongest for same/near-same recordings; melodic and harmonic analysis are heuristic and can miss transformations, covers, interpolations, or similarities outside the catalogs Pie can lawfully query.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: safeClientError(error, 'Originality scan failed.') }, { status: 400 });
  }
}
