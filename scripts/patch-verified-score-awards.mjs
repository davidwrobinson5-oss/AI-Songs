import fs from 'node:fs';

function patchSongScore(){
  const path='app/api/song-score/route.ts';
  let s=fs.readFileSync(path,'utf8');
  if(!s.includes("from '../../scoreServer'")) s=s.replace("import { consumeUsage, usageDeniedMessage } from '../../usageEntitlements';", "import { consumeUsage, usageDeniedMessage } from '../../usageEntitlements';\nimport { awardPieScore } from '../../scoreServer';");
  if(!s.includes('const scoreSourceRef = textField(body.songId')) s=s.replace("    const vocalRange = textField(body.vocalRange, 60, 'unspecified');", "    const vocalRange = textField(body.vocalRange, 60, 'unspecified');\n    const scoreSourceRef = textField(body.songId, 180);");
  if(!s.includes("awardPieScore('song_score', scoreSourceRef")){
    s=s.replace("    if (!process.env.OPENAI_API_KEY) {\n      return NextResponse.json({\n        ...fallbackScore(prompt, lyrics),", "    if (!process.env.OPENAI_API_KEY) {\n      const result = fallbackScore(prompt, lyrics);\n      if (scoreSourceRef) await awardPieScore('song_score', scoreSourceRef, result.score, { title });\n      return NextResponse.json({\n        ...result,");
    s=s.replace("      const parsed = JSON.parse(raw);\n      return NextResponse.json({ ...parsed,", "      const parsed = JSON.parse(raw);\n      if (scoreSourceRef && Number.isFinite(Number(parsed?.score))) await awardPieScore('song_score', scoreSourceRef, Number(parsed.score), { title });\n      return NextResponse.json({ ...parsed,");
    s=s.replace("    } catch {\n      return NextResponse.json({ ...fallbackScore(prompt, lyrics), usage:", "    } catch {\n      const result = fallbackScore(prompt, lyrics);\n      if (scoreSourceRef) await awardPieScore('song_score', scoreSourceRef, result.score, { title });\n      return NextResponse.json({ ...result, usage:");
  }
  fs.writeFileSync(path,s);
}

function patchOriginality(){
  const path='app/api/originality-score/route.ts';
  let s=fs.readFileSync(path,'utf8');
  if(!s.includes("from '../../scoreServer'")) s=s.replace("import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';", "import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';\nimport { awardPieScore } from '../../scoreServer';");
  if(!s.includes('const scoreSourceRef = textField(body.songId')) s=s.replace("    const prompt = textField(body.prompt, 6_000);", "    const prompt = textField(body.prompt, 6_000);\n    const scoreSourceRef = textField(body.songId, 180);");
  if(!s.includes("awardPieScore('originality_scan', scoreSourceRef")) s=s.replace("    const label = score >= 90 ? 'Highly Distinctive'", "    if (scoreSourceRef) await awardPieScore('originality_scan', scoreSourceRef, score, { title, confidence });\n\n    const label = score >= 90 ? 'Highly Distinctive'");
  fs.writeFileSync(path,s);
}

patchSongScore();
patchOriginality();
console.log('Added verified score awards to Song Score and Originality Score.');
