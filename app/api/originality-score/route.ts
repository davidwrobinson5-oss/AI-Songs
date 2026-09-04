import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

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

export async function POST(req: Request) {
  const limited = rateLimit(req, 'originality-score', 12, 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 48_000);
    const title = textField(body.title, 220, 'Untitled Song');
    const lyrics = textField(body.lyrics, 24_000);
    const prompt = textField(body.prompt, 6_000);

    const evidence: Array<{ source: string; status: string; detail: string }> = [];
    const dimensions: Array<{ name: string; score: number; detail: string }> = [];

    const stats = tokenStats(lyrics);
    let lyricScore = lyrics.trim() ? 68 + stats.lexical * 26 - stats.clichéHits * 5 : 65;
    if (stats.words > 120) lyricScore += 3;
    lyricScore = clamp(lyricScore);
    dimensions.push({
      name: 'Lyric Distinctiveness',
      score: lyricScore,
      detail: lyrics.trim() ? `${Math.round(stats.lexical * 100)}% unique-word ratio with ${stats.clichéHits} common cliché phrase${stats.clichéHits === 1 ? '' : 's'} detected.` : 'No lyrics were available, so Pie used a neutral provisional score.',
    });

    const promptStats = tokenStats(prompt);
    const conceptScore = clamp(prompt.trim() ? 62 + promptStats.lexical * 30 - Math.max(0, 18 - promptStats.words) * 0.5 : 60);
    dimensions.push({ name: 'Concept Specificity', score: conceptScore, detail: prompt.trim() ? 'Scores how specific and differentiated the described concept is, not whether the audio itself is unique.' : 'No song-direction text was available.' });

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
    dimensions.push({ name: 'LAION Metadata Novelty', score: laionScore, detail: 'Uses LAION-DISCO metadata as an index check. LAION-DISCO does not provide the underlying audio in the dataset itself.' });

    const audioFingerprintConfigured = Boolean(process.env.ACOUSTID_API_KEY);
    evidence.push({
      source: 'AcoustID / Chromaprint',
      status: audioFingerprintConfigured ? 'Ready for fingerprint step' : 'Not configured',
      detail: audioFingerprintConfigured ? 'Server credentials are available; Pie still needs a generated Chromaprint fingerprint from the song audio before exact fingerprint matching can run.' : 'No AcoustID API key is configured, so this scan does not claim fingerprint-level audio matching.',
    });

    const base = lyricScore * 0.30 + conceptScore * 0.15 + mbScore * 0.25 + laionScore * 0.30;
    const score = clamp(base);
    const checkedCount = evidence.filter((item) => item.status === 'Checked').length;
    const confidence = clamp(45 + checkedCount * 18 + (lyrics.trim() ? 10 : 0) + (prompt.trim() ? 6 : 0));
    const label = score >= 90 ? 'Highly Distinctive' : score >= 80 ? 'Strong Originality Signals' : score >= 70 ? 'Good, with Familiar Elements' : score >= 55 ? 'Mixed Originality Signals' : 'Needs More Differentiation';

    return NextResponse.json({
      score,
      confidence,
      label,
      summary: `Pie found ${label.toLowerCase()} based on the evidence available in this scan. The score is designed as a creative-risk indicator, not a copyright or legal determination.`,
      dimensions,
      evidence,
      disclaimer: 'Originality Score is an estimate, not legal clearance. Metadata/title matches do not prove musical similarity. A stronger future score should add audio fingerprinting and licensed audio-embedding comparisons against catalogs that permit that use.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: safeClientError(error, 'Originality scan failed.') }, { status: 400 });
  }
}
