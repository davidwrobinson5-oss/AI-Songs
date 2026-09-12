import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const TEAM_SLUG="drobinhood1";
const TEAM_ID="team_LxqzlcZa969N5n9I9VzwYlns";
const PROJECT_ID="prj_UNamKUXBj3xsrjUtqhTt4Sew3OMk";
const PROJECT_NAME="ai-songs";
const ISSUER=`https://oidc.vercel.com/${TEAM_SLUG}`;
const AUDIENCE=`https://vercel.com/${TEAM_SLUG}`;
const JWKS=createRemoteJWKSet(new URL("/.well-known/jwks",ISSUER));

type Category='completion'|'quality'|'determination'|'connections'|'execution';
function sharedOwnerId(userId: string) {
  return ["pie-primary", "user_3JFNRykFY9nfjkxHkVkUBvPA34P"].includes(userId)
    ? "user_3JCFRuy8lxa1w0d7a59MAznPXBZ" : userId;
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function text(v:unknown,max=180){return typeof v==='string'?v.trim().slice(0,max):'';}
function validUserId(v:string){return v.length>0&&v.length<=128&&/^[a-zA-Z0-9_-]+$/.test(v);}
async function verifyProject(req:Request){const token=req.headers.get("x-pie-vercel-oidc")||"";if(!token)throw new Error("Missing Pie project identity.");const {payload}=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:AUDIENCE});if(payload.owner_id!==TEAM_ID||payload.project_id!==PROJECT_ID||payload.project!==PROJECT_NAME)throw new Error("Untrusted Pie project identity.");if(payload.environment!=="production"&&payload.environment!=="preview")throw new Error("Untrusted Pie environment.");}
function awardFor(key:string,metric:number):{category:Category;points:number}|null{
  const score=Math.max(0,Math.min(100,Number.isFinite(metric)?metric:0));
  const fixed:Record<string,{category:Category;points:number}>={
    contract_saved:{category:'completion',points:6},data_request:{category:'connections',points:4},bank_connected:{category:'completion',points:10},bank_synced:{category:'determination',points:2},video_plan:{category:'completion',points:4},song_saved:{category:'completion',points:5},streak_day:{category:'determination',points:2},release_launched:{category:'execution',points:30},gig_completed:{category:'execution',points:25},campaign_completed:{category:'execution',points:20},qualified_connection:{category:'connections',points:5},merch_sale:{category:'execution',points:3}
  };
  if(key==='song_score')return {category:'quality',points:Math.max(1,Math.round(score*0.20))};
  if(key==='originality_scan')return {category:'quality',points:Math.max(2,Math.round(score*0.08))};
  return fixed[key]||null;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed."},405);
  try{await verifyProject(req);}catch(error){return json({error:error instanceof Error?error.message:"Authentication failed."},401);}
  try{
    const body=await req.json().catch(()=>({}));
    const userId=sharedOwnerId(text(body.userId,128)),eventKey=text(body.eventKey,100),sourceRef=text(body.sourceRef,160)||'default';
    if(!validUserId(userId))return json({error:"Invalid user identity."},400);
    const award=awardFor(eventKey,Number(body.metric||0));
    if(!award)return json({error:"Unknown score milestone."},400);
    const {data:existing,error:existingError}=await supabase.from('pie_score_events').select('points').eq('user_id',userId).eq('event_key',eventKey).eq('source_ref',sourceRef).maybeSingle();if(existingError)throw existingError;
    const points=Math.max(Number(existing?.points||0),award.points);
    const {error}=await supabase.from('pie_score_events').upsert({user_id:userId,event_key:eventKey,source_ref:sourceRef,category:award.category,points,metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{}},{onConflict:'user_id,event_key,source_ref'});if(error)throw error;
    const {data:profile,error:recalcError}=await supabase.rpc('pie_recalculate_score',{p_user_id:userId});if(recalcError)throw recalcError;
    return json({ok:true,awarded:points,category:award.category,profile});
  }catch(error){console.error('pie-score',error);return json({error:error instanceof Error?error.message:'Score update failed.'},500);}
});