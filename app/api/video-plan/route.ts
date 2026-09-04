import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../billingConfig';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';
import { consumeUsage, usageDeniedMessage } from '../../usageEntitlements';
import { awardPieScore } from '../../scoreServer';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'video-plan', 10, 60_000);
  if (limited) return limited;
  try {
    const entitlement = await consumeUsage('video_plans', FREE_LIMITS.videoPlansPerMonth);
    if (!entitlement.allowed) return NextResponse.json({error: usageDeniedMessage('video plans', entitlement),code:'PIE_USAGE_LIMIT',usage:{count:entitlement.usageCount,limit:entitlement.usageLimit}}, { status: entitlement.userId ? 402 : 401, headers:{'Cache-Control':'no-store'} });
    const body = await readJsonObject(req, 40_000);
    const videoType=textField(body.videoType,80,'Hybrid'),ratio=textField(body.ratio,80,'16:9'),visualStyle=textField(body.visualStyle,120,'Cinematic Realism'),cameraStyle=textField(body.cameraStyle,120,'Mixed by section'),concept=textField(body.concept,2_000),story=textField(body.story,4_000),performance=textField(body.performance,3_000),location=textField(body.location,1_000),wardrobe=textField(body.wardrobe,1_000),colorNotes=textField(body.colorNotes,1_000),mustHave=textField(body.mustHave,1_000),avoid=textField(body.avoid,1_000),duration=textField(body.duration,40,'3:00');
    const referenceNames=Array.isArray(body.referenceNames)?body.referenceNames.filter((value):value is string=>typeof value==='string').slice(0,20).join(', '):'';
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'Video planning is temporarily unavailable.'},{status:503});
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({model:process.env.OPENAI_TEXT_MODEL||'gpt-5.6',input:[{role:'system',content:'You are a world-class music video director, treatment writer, storyboard artist, editor, and AI-video prompt designer. Build an original, visually memorable music-video plan without imitating a living director or artist. Make the plan shootable and AI-render friendly. Prioritize continuity, strong hero images, emotional progression, performance coverage, visual motifs, section contrast, and practical transitions. Return a concise but complete production plan with headings.'},{role:'user',content:`Create a music video treatment and storyboard plan.\n\nVideo type: ${videoType}\nAspect ratio: ${ratio}\nDuration: ${duration}\nVisual style: ${visualStyle}\nCamera language: ${cameraStyle}\nConcept: ${concept||'Develop the strongest concept from the available direction.'}\nStory/emotional journey: ${story||'Create a clear visual emotional arc.'}\nPerformance direction: ${performance||'Use performance strategically where it strengthens the song.'}\nLocations/sets: ${location||'Choose practical distinctive locations.'}\nWardrobe/character look: ${wardrobe||'Create a coherent artist look.'}\nColor/lighting: ${colorNotes||'Choose a strong visual palette.'}\nMust-have visual: ${mustHave||'Invent one unforgettable hero image.'}\nAvoid: ${avoid||'Avoid generic AI-video clichés and visual incoherence.'}\nReference filenames: ${referenceNames||'None supplied.'}\n\nReturn these sections:\n1. One-line concept\n2. Director treatment\n3. Visual rules + continuity bible\n4. Section-by-section storyboard with approximate timestamps, shot framing, camera movement, subject action, environment, emotion, transition, and why the shot matters\n5. Performance coverage plan\n6. B-roll / insert list\n7. Hero frames / thumbnail candidates\n8. AI-generation prompt template for each scene including subject continuity, wardrobe, environment, lens/framing, motion, lighting, mood, duration, and negative constraints\n9. Edit rhythm + transition plan\n10. Social cutdowns (15s, 30s, chorus vertical, teaser loop)\n11. Production checklist + assets still needed.`}],max_output_tokens:entitlement.outputQuality==='premium'?5000:2600});
    const planRef=textField(body.songId,160,textField(body.projectId,160,`${concept||'video'}-${duration}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,150)));
    await awardPieScore('video_plan',planRef,0,{videoType,ratio,outputQuality:entitlement.outputQuality}).catch(()=>null);
    return NextResponse.json({text:response.output_text.slice(0,40_000),usage:{count:entitlement.usageCount,limit:entitlement.usageLimit},outputQuality:entitlement.outputQuality},{headers:{'Cache-Control':'no-store'}});
  } catch (error) { console.error('Video plan generation failed'); return NextResponse.json({ error: safeClientError(error, 'Video plan generation failed.') }, { status: 400 }); }
}
