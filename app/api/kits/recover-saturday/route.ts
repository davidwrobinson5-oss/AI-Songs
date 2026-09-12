import { NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from '../../../usageEntitlements';
import { safeHttpsUrl, rateLimit } from '../../../security';

export const maxDuration = 60;
const OWNER = 'user_3JCFRuy8lxa1w0d7a59MAznPXBZ';
const SONG = 'song_1789236268194_napswkg1';
const VERSION = 'version_1789239377628_15qrx437';
const BASE = 'https://arpeggi.io/api/kits/v1';
// One-time, owner-only recovery of the confirmed missing Saturday vocal.
export async function POST(req: Request) {
  const userId = await resolvePieUserId();
  if (userId !== OWNER || process.env.VERCEL_ENV !== 'preview') return NextResponse.json({error:'Unavailable.'},{status:403});
  const limited=rateLimit(req,'recover-saturday',2,60_000);if(limited)return limited;
  try {
    const key=process.env.KITS_API_KEY;
    if(!key)throw new Error('Kits is not configured.');
    const oidc=await getVercelOidcToken();
    const endpoint=`${process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co'}/functions/v1/pie-library`;
    const headers:Record<string,string>={'X-Pie-Vercel-OIDC':oidc,'X-Pie-User-Id':userId,apikey:process.env.SUPABASE_PUBLISHABLE_KEY || ''};
    async function library(body:unknown,extra:Record<string,string>={}) {
      const r=await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/json',...extra},body:JSON.stringify(body),cache:'no-store'});
      const d=await r.json();if(!r.ok)throw new Error(d.error || 'Recovery storage request failed.');return d;
    }
    const saved=await library({action:'list'});
    const song=saved.songs.find((s:{id:string})=>s.id===SONG);
    const version=saved.versions.find((v:{id:string})=>v.id===VERSION);
    if(!song||!version||version.songId!==SONG)throw new Error('Saturday Version 2 was not found for this account.');
    if(version.files?.drobVocalBlob)return NextResponse.json({ok:true,recovered:true});
    async function kits(path:string) {
      const r=await fetch(`${BASE}/${path}`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store'});
      if(!r.ok)throw new Error(`Kits recovery lookup failed (${r.status}).`);return r.json();
    }
    const models=await kits('voice-models?myModels=true&perPage=100');
    const drob=models.data?.find((m:{title?:string})=>m.title?.trim().toLowerCase()==='drob');
    if(!drob)throw new Error('Drob model not found.');
    const history=await kits('voice-conversions?order=desc&perPage=100');
    const matches=(history.data || []).filter((j:{status:string;voiceModelId?:string;model?:{id:string};createdAt:string})=>{
      const time=Date.parse(j.createdAt);
      return j.status==='success' && String(j.voiceModelId ?? j.model?.id)===String(drob.id)
        && time>=Date.parse('2026-09-12T18:50:00Z') && time<=Date.parse('2026-09-12T18:57:00Z');
    });
    if(matches.length!==1)throw new Error(`Recovery needs a unique matching conversion; found ${matches.length}.`);
    const job=await kits(`voice-conversions/${encodeURIComponent(String(matches[0].id))}`);
    if(job.status!=='success' || String(job.voiceModelId ?? job.model?.id)!==String(drob.id)) throw new Error('Conversion details did not match Drob.');
    const url=safeHttpsUrl(job.outputFileUrl || job.lossyOutputFileUrl || '');
    const audio=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    if(!audio.ok)throw new Error('Kits recovery audio is unavailable.');
    const blob=await audio.blob();
    if(!blob.size||blob.size>40*1024*1024)throw new Error('Invalid recovery audio size.');
    const type=blob.type || 'audio/wav';
    if(!type.startsWith('audio/') && type!=='application/octet-stream') throw new Error('Kits returned a non-audio file.');
    const fileName=`drob-recovered-${String(job.id).replace(/[^a-zA-Z0-9_-]/g,'')}.${type.includes('mpeg')?'mp3':'wav'}`;
    const prepared=await library({action:'prepareUpload',songId:SONG,versionId:VERSION,fileName});
    const started=await library({path:prepared.path,type,size:blob.size},{'X-Pie-Audio-Action':'start'});
    let offset=Number(started.offset || 0);
    while(offset<blob.size) {
      const chunk=blob.slice(offset,Math.min(offset+2*1024*1024,blob.size));
      const r=await fetch(endpoint,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','X-Pie-Audio-Action':'chunk','X-Pie-Upload-Url':started.uploadUrl,'X-Pie-Upload-Offset':String(offset)},body:chunk});
      const d=await r.json();if(!r.ok||Number(d.offset)<=offset)throw new Error('Recovery upload did not complete.');offset=Number(d.offset);
    }
    await library({action:'upsertVersion',song,version,files:{drobVocalBlob:{path:prepared.path,type}}});
    console.info('Saturday vocal recovery saved',{conversionId:job.id,bytes:blob.size});
    return NextResponse.json({ok:true,recovered:true});
  }catch(error){const message=error instanceof Error?error.message:'Recovery failed.';console.error('Saturday recovery',message);return NextResponse.json({error:message},{status:502});}
}
