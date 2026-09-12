import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE = "https://ai-songs-drobinhood1.vercel.app";
const TEAM_SLUG = "drobinhood1";
const TEAM_ID = "team_LxqzlcZa969N5n9I9VzwYlns";
const PROJECT_ID = "prj_UNamKUXBj3xsrjUtqhTt4Sew3OMk";
const PROJECT_NAME = "ai-songs";
const LEGACY_OWNER_ID = "pie-primary";
const ORIGINAL_OWNER_LIBRARY_ID = "user_3JCFRuy8lxa1w0d7a59MAznPXBZ";
const PRODUCTION_OWNER_ID = "user_3JFNRykFY9nfjkxHkVkUBvPA34P";
const STORAGE_PROJECT_REF = "ynkrlatwwwaachijacmb";
const TUS_ENDPOINT = `https://${STORAGE_PROJECT_REF}.storage.supabase.co/storage/v1/upload/resumable`;
const TUS_PREFIX = `${TUS_ENDPOINT}/`;
const MAX_AUDIO_CHUNK_BYTES = 2 * 1024 * 1024;
const ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const JWKS = createRemoteJWKSet(new URL("/.well-known/jwks", ISSUER));
const allowedOrigins = new Set([SITE, "https://ai-songs-bice.vercel.app", "https://ai-songs-git-main-drobinhood1.vercel.app"]);
const PLAYBACK_FIELDS = ["masterBlob", "generatedBlob", "backingBlob", "drobVocalBlob", "guideVocalBlob"] as const;
const PLAYBACK_URL_TTL_SECONDS = 15 * 60;

function cors(origin:string|null){const safe=origin&&allowedOrigins.has(origin)?origin:SITE;return{"Access-Control-Allow-Origin":safe,"Access-Control-Allow-Headers":"x-pie-vercel-oidc, x-pie-user-id, x-client-info, apikey, content-type, x-pie-audio-action, x-pie-upload-url, x-pie-upload-offset","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin","Cache-Control":"no-store"};}
function json(body:unknown,status=200,origin:string|null=null){return new Response(JSON.stringify(body),{status,headers:{...cors(origin),"Content-Type":"application/json"}});}
function safeFileName(name:string){return name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100)||"audio.bin";}
function base64(value:string){const bytes=new TextEncoder().encode(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
function validTusUploadUrl(value:string){try{const url=new URL(value);const expected=new URL(TUS_ENDPOINT);return url.protocol==="https:"&&url.host===expected.host&&url.href.startsWith(TUS_PREFIX);}catch{return false;}}
// Authorized legacy-library migration for the original Pie owner's Clerk account.
// Used only after selecting database rows belonging to the authenticated owner.
// Uploads remain restricted to the current owner's prefix.
function ownsStoredPath(path:string,userId:string){
  return path.startsWith(`${safeFileName(userId)}/`) ||
    (userId==="user_3JCFRuy8lxa1w0d7a59MAznPXBZ" && path.startsWith("pie-primary/"));
}
function validOwnerId(value:string){return value.length>0&&value.length<=128&&/^[a-zA-Z0-9_-]+$/.test(value);}

async function verifyPieProject(req:Request){
  const token=req.headers.get("x-pie-vercel-oidc")||"";
  if(!token) throw new Error("Missing Pie project identity.");
  const {payload}=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:AUDIENCE});
  if(payload.owner_id!==TEAM_ID||payload.project_id!==PROJECT_ID||payload.project!==PROJECT_NAME) throw new Error("Untrusted Pie project identity.");
  if(payload.environment!=="production"&&payload.environment!=="preview") throw new Error("Untrusted Pie environment.");
  const requested=(req.headers.get("x-pie-user-id")||"").trim();
  if(!validOwnerId(requested)) throw new Error("Invalid Pie user identity.");
  // The owner password and the original owner's Clerk account share one library.
  // Resolve only after verifying the server's Vercel identity and explicit user ID.
  // Other customer identities retain their own ownership scope.
  return requested === LEGACY_OWNER_ID || requested === PRODUCTION_OWNER_ID
    ? ORIGINAL_OWNER_LIBRARY_ID : requested;
}

async function assertOwnedOrMissing(table:"pie_songs"|"pie_song_versions",id:string,userId:string){const {data,error}=await supabase.from(table).select("owner_id").eq("id",id).maybeSingle();if(error)throw error;if(data&&data.owner_id!==userId)throw new Error("This library item belongs to another account.");}

Deno.serve(async(req:Request)=>{
  const origin=req.headers.get("origin");
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(origin)});
  if(req.method!=="POST")return json({error:"Method not allowed."},405,origin);
  let userId=""; try{userId=await verifyPieProject(req);}catch(error){return json({error:error instanceof Error?error.message:"Authentication failed."},401,origin);}
  try{
    const audioAction=req.headers.get("x-pie-audio-action")||"";
    if(audioAction==="start"){
      const body=await req.json();
      const path=String(body?.path||"");
      const type=String(body?.type||"application/octet-stream");
      const size=Number(body?.size||0);
      if(!path.startsWith(`${safeFileName(userId)}/`)||!Number.isFinite(size)||size<=0)return json({error:"Invalid audio upload request."},400,origin);
      const response=await fetch(TUS_ENDPOINT,{method:"POST",headers:{"Authorization":`Bearer ${SERVICE_KEY}`,"apikey":SERVICE_KEY,"Tus-Resumable":"1.0.0","Upload-Length":String(Math.floor(size)),"Upload-Metadata":[`bucketName ${base64("pie-song-audio")}`,`objectName ${base64(path)}`,`contentType ${base64(type)}`,`cacheControl ${base64("3600")}`].join(","),"x-upsert":"true"}});
      if(!response.ok){const detail=await response.text().catch(()=>"");console.error("Pie edge TUS start failed",response.status,detail.slice(0,300));return json({error:`Audio upload start failed (${response.status}).`},502,origin);}
      const location=response.headers.get("location")||"";
      const uploadUrl=location?new URL(location,TUS_ENDPOINT).toString():"";
      if(!validTusUploadUrl(uploadUrl))return json({error:"Audio upload location was invalid."},502,origin);
      return json({uploadUrl,offset:Number(response.headers.get("upload-offset")||0)},200,origin);
    }
    if(audioAction==="chunk"){
      const uploadUrl=req.headers.get("x-pie-upload-url")||"";
      const offset=Number(req.headers.get("x-pie-upload-offset")||"0");
      if(!validTusUploadUrl(uploadUrl)||!Number.isFinite(offset)||offset<0)return json({error:"Invalid audio chunk request."},400,origin);
      const bytes=await req.arrayBuffer();
      if(!bytes.byteLength||bytes.byteLength>MAX_AUDIO_CHUNK_BYTES)return json({error:"Audio chunk is too large."},413,origin);
      const response=await fetch(uploadUrl,{method:"PATCH",headers:{"Authorization":`Bearer ${SERVICE_KEY}`,"apikey":SERVICE_KEY,"Tus-Resumable":"1.0.0","Upload-Offset":String(Math.floor(offset)),"Content-Type":"application/offset+octet-stream","x-upsert":"true"},body:bytes});
      if(!response.ok){const detail=await response.text().catch(()=>"");console.error("Pie edge TUS chunk failed",response.status,detail.slice(0,300));return json({error:`Audio chunk upload failed (${response.status}).`},502,origin);}
      return json({offset:Number(response.headers.get("upload-offset")||offset+bytes.byteLength)},200,origin);
    }

    const body=await req.json(); const action=body?.action;
    if(action==="prepareUpload"){
      const songId=String(body.songId||""); const versionId=String(body.versionId||""); const fileName=safeFileName(String(body.fileName||"audio.bin"));
      if(!songId||!versionId)return json({error:"Missing song/version id."},400,origin);
      const path=`${safeFileName(userId)}/${safeFileName(songId)}/${safeFileName(versionId)}/${fileName}`;
      const {data,error}=await supabase.storage.from("pie-song-audio").createSignedUploadUrl(path,{upsert:true}); if(error||!data?.token)throw error||new Error("Could not create upload URL.");
      return json({path,token:data.token},200,origin);
    }
    if(action==="upsertVersion"){
      const song=body.song||{}; const version=body.version||{}; const songId=String(song.id||""); const versionId=String(version.id||""); const versionSongId=String(version.songId||"");
      if(!songId||!versionId||!versionSongId||versionSongId!==songId)return json({error:"Invalid song version."},400,origin);
      await assertOwnedOrMissing("pie_songs",songId,userId); await assertOwnedOrMissing("pie_song_versions",versionId,userId);
      const {error:songError}=await supabase.from("pie_songs").upsert({id:songId,owner_id:userId,title:String(song.title||"Untitled Song"),created_at:song.createdAt||new Date().toISOString(),updated_at:song.updatedAt||new Date().toISOString()},{onConflict:"id"}); if(songError)throw songError;
      const {data:existingVersion,error:existingVersionError}=await supabase.from("pie_song_versions").select("files").eq("owner_id",userId).eq("id",versionId).maybeSingle(); if(existingVersionError)throw existingVersionError;
      const incomingFiles=body.files&&typeof body.files==="object"?body.files:{};
      const mergedFiles={...(existingVersion?.files&&typeof existingVersion.files==="object"?existingVersion.files:{}),...incomingFiles};
      const {error:versionError}=await supabase.from("pie_song_versions").upsert({id:versionId,owner_id:userId,song_id:versionSongId,version_number:Number(version.versionNumber||1),created_at:version.createdAt||new Date().toISOString(),prompt:String(version.prompt||""),mode:String(version.mode||"music"),vocal_range:String(version.vocalRange||"Baritone"),duration_ms:Number(version.durationMs||0),instrumental:Boolean(version.instrumental),lyrics:typeof version.lyrics==="string"?version.lyrics:null,melody_analysis:version.melodyAnalysis||null,files:mergedFiles},{onConflict:"id"}); if(versionError)throw versionError;
      return json({ok:true},200,origin);
    }
    if(action==="renameSong"){
      const songId=String(body.songId||"");
      const title=String(body.title||"").trim().slice(0,120);
      if(!songId||!title)return json({error:"Song title cannot be empty."},400,origin);
      const {data:owned,error:ownedError}=await supabase.from("pie_songs").select("id").eq("owner_id",userId).eq("id",songId).maybeSingle(); if(ownedError)throw ownedError;
      if(!owned)return json({error:"Song not found."},404,origin);
      const updatedAt=new Date().toISOString();
      const {error:updateError}=await supabase.from("pie_songs").update({title,updated_at:updatedAt}).eq("owner_id",userId).eq("id",songId); if(updateError)throw updateError;
      return json({ok:true,title,updatedAt},200,origin);
    }
    if(action==="deleteSong"){
      const songId=String(body.songId||""); if(!songId)return json({error:"Missing song id."},400,origin);
      const {data:versions,error:vErr}=await supabase.from("pie_song_versions").select("files").eq("owner_id",userId).eq("song_id",songId); if(vErr)throw vErr;
      const paths:string[]=[]; for(const row of versions||[]){const files=row.files&&typeof row.files==="object"?row.files as Record<string,{path?:string}|string>:{};for(const value of Object.values(files)){const path=typeof value==="string"?value:value?.path;if(path&&ownsStoredPath(path,userId))paths.push(path);}}
      if(paths.length) await supabase.storage.from("pie-song-audio").remove(paths);
      const {error:dv}=await supabase.from("pie_song_versions").delete().eq("owner_id",userId).eq("song_id",songId); if(dv)throw dv;
      const {error:ds}=await supabase.from("pie_songs").delete().eq("owner_id",userId).eq("id",songId); if(ds)throw ds;
      return json({ok:true},200,origin);
    }
    if(action==="playbackUrl"){
      const songId=String(body.songId||"").trim().slice(0,160);
      if(!songId)return json({error:"Missing song id."},400,origin);
      const {data:versions,error:versionsError}=await supabase.from("pie_song_versions").select("version_number,files").eq("owner_id",userId).eq("song_id",songId).order("version_number",{ascending:false});
      if(versionsError)throw versionsError;
      let chosenPath="";
      let chosenType:string|undefined;
      let chosenBucket="pie-song-audio";
      for(const version of versions||[]){
        const files=version.files&&typeof version.files==="object"?version.files as Record<string,{path?:string;type?:string;bucket?:string}|string>:{};
        for(const field of PLAYBACK_FIELDS){
          const value=files[field];
          const path=typeof value==="string"?value:value?.path;
          const type=typeof value==="object"&&value?value.type:undefined;
          if(path&&ownsStoredPath(path,userId)){chosenPath=path;chosenType=type;chosenBucket=typeof value==="object"&&value?.bucket==="pie-job-output"?"pie-job-output":"pie-song-audio";break;}
        }
        if(chosenPath)break;
      }
      if(!chosenPath)return json({error:"No playable audio was found for this song."},404,origin);
      const {data,error}=await supabase.storage.from(chosenBucket).createSignedUrl(chosenPath,PLAYBACK_URL_TTL_SECONDS);
      if(error||!data?.signedUrl)throw error||new Error("Could not create playback URL.");
      return json({url:data.signedUrl,type:chosenType,expiresIn:PLAYBACK_URL_TTL_SECONDS},200,origin);
    }
    if(action==="list"){
      const {data:songs,error:songsError}=await supabase.from("pie_songs").select("id,title,created_at,updated_at").eq("owner_id",userId).order("updated_at",{ascending:false}); if(songsError)throw songsError;
      const {data:versions,error:versionsError}=await supabase.from("pie_song_versions").select("id,song_id,version_number,created_at,prompt,mode,vocal_range,duration_ms,instrumental,lyrics,melody_analysis,files").eq("owner_id",userId).order("version_number",{ascending:false}); if(versionsError)throw versionsError;
      const signedVersions=[]; for(const version of versions||[]){const files=version.files&&typeof version.files==="object"?version.files as Record<string,{path?:string;type?:string;bucket?:string}|string>:{}; const signedFiles:Record<string,{url:string;type?:string}>={}; for(const [key,value] of Object.entries(files)){const path=typeof value==="string"?value:value?.path;const type=typeof value==="object"&&value?value.type:undefined;if(!path||!ownsStoredPath(path,userId))continue;const {data}=await supabase.storage.from(typeof value==="object"&&value?.bucket==="pie-job-output"?"pie-job-output":"pie-song-audio").createSignedUrl(path,3600);if(data?.signedUrl)signedFiles[key]={url:data.signedUrl,type};} signedVersions.push({id:version.id,songId:version.song_id,versionNumber:version.version_number,createdAt:version.created_at,prompt:version.prompt,mode:version.mode,vocalRange:version.vocal_range,durationMs:version.duration_ms,instrumental:version.instrumental,lyrics:version.lyrics||undefined,melodyAnalysis:version.melody_analysis||undefined,files:signedFiles});}
      return json({songs:(songs||[]).map(s=>({id:s.id,title:s.title,createdAt:s.created_at,updatedAt:s.updated_at})),versions:signedVersions},200,origin);
    }
    return json({error:"Unknown action."},400,origin);
  }catch(error){console.error(error);return json({error:error instanceof Error?error.message:"Cloud library request failed."},500,origin);}
});