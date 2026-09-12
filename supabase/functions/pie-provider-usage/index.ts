import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const TEAM_SLUG = "drobinhood1";
const TEAM_ID = "team_LxqzlcZa969N5n9I9VzwYlns";
const PROJECT_ID = "prj_UNamKUXBj3xsrjUtqhTt4Sew3OMk";
const PROJECT_NAME = "ai-songs";
const ISSUER = `https://oidc.vercel.com/${TEAM_SLUG}`;
const AUDIENCE = `https://vercel.com/${TEAM_SLUG}`;
const JWKS = createRemoteJWKSet(new URL("/.well-known/jwks", ISSUER));
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function validUserId(value: string) { return value.length > 0 && value.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(value); }
function validUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function verifyProject(req: Request) {
  const token = req.headers.get("x-pie-vercel-oidc") || "";
  if (!token) throw new Error("Missing Pie project identity.");
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
  if (payload.owner_id !== TEAM_ID || payload.project_id !== PROJECT_ID || payload.project !== PROJECT_NAME) throw new Error("Untrusted Pie project identity.");
  if (payload.environment !== "production" && payload.environment !== "preview") throw new Error("Untrusted Pie environment.");
  return payload.environment;
}


Deno.serve(async(req: Request)=>{
 if(req.method!=="POST") return json({error:"Method not allowed."},405);
 let environment: string;
 try { environment=await verifyProject(req); } catch { return json({error:"Untrusted project."},401); }
 try {
  const raw=await req.text();
  if(raw.length>16000) return json({error:"Request too large."},413);
  const body=JSON.parse(raw);
  const userId=String(body.userId||"");
  if(!validUserId(userId)) return json({error:"Invalid user."},400);
  if(body.action==="summary"){
   if(!(userId==="pie-primary" || (environment==="production" && userId==="user_3JFNRykFY9nfjkxHkVkUBvPA34P"))) return json({error:"Owner access required."},403);
   const result=await supabase.rpc("pie_provider_summary",{p_environment:environment,p_user_id:userId});
   if(result.error) throw result.error;
   return json(result.data);
  }
  const id=String(body.requestId||"");
  const feature=String(body.feature||"");
  const provider=String(body.provider||"");
  if(!validUuid(id)|| !/^[a-zA-Z0-9_/-]{1,100}$/.test(feature)||!["openai","elevenlabs","mureka","kits","klangio"].includes(provider)) return json({error:"Invalid receipt."},400);
  if(body.action==="begin"){
   const jobId=body.jobId || null;
   if(jobId){
    if(!validUuid(jobId)) return json({error:"Invalid job."},400);
    const job=await supabase.from("pie_jobs").select("user_id").eq("id",jobId).single();
    if(job.error||job.data.user_id!==userId)return json({error:"Invalid job owner."},403);
   }
   const result=await supabase.from("pie_provider_requests").insert({id,environment,user_id:userId,job_id:jobId,feature,provider});
   if(result.error) throw result.error;
   return json({requestId:id});
  }
  if(body.action!=="finish")return json({error:"Invalid action."},400);
  if(!["accepted","rejected","unknown"].includes(body.status))return json({error:"Invalid status."},400);
  const receipt: Record<string,unknown>={};
  for(const key of ["providerRequestId","providerTaskId","model","serviceTier"]){
    const value=body.receipt?.[key];
    if(value!=null && (typeof value!=="string" || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(value)))return json({error:"Invalid identifier."},400);
    receipt[key]=value??null;
  }
  const units: Record<string,number>={};
  for(const key of ["input_tokens","cached_input_tokens","cache_write_tokens","output_tokens","character_cost"]){
   const value=body.receipt?.units?.[key];
   if(value!==undefined){
    if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>1e12)return json({error:"Invalid units."},400);
    units[key]=value;
   }
  }
  receipt.units=units;
  const httpStatus=body.httpStatus??null;
  if(httpStatus!==null&&(!Number.isInteger(httpStatus)||httpStatus<100||httpStatus>599))return json({error:"Invalid HTTP status."},400);
  const current=await supabase.from("pie_provider_requests").select("*").eq("id",id).eq("environment",environment).eq("user_id",userId).eq("provider",provider).eq("feature",feature).single();
  if(current.error)return json({error:"Receipt not found."},404);
  if(current.data.status!=="started"){
   // Canonical field comparison makes the receipt retry idempotent.
   const previous=current.data.receipt;
   const same=body.status===current.data.status && httpStatus===current.data.http_status
    && ["providerRequestId","providerTaskId","model","serviceTier"].every(k=>previous[k]===receipt[k])
    && Object.keys(units).length===Object.keys(previous.units||{}).length
    && Object.entries(units).every(([k,v])=>previous.units?.[k]===v);
   return json(same?{requestId:id}:{error:"Receipt already finalized."},same?200:409);
  }
  const updated=await supabase.from("pie_provider_requests").update({status:body.status,http_status:httpStatus,receipt,finished_at:new Date().toISOString()}).eq("id",id).eq("status","started").select("id");
  if(updated.error)throw updated.error;
  if(!updated.data?.length)return json({error:"Concurrent receipt update; retry."},409);
  return json({requestId:id});
 }catch{ return json({error:"Provider accounting unavailable."},500); }
});

