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

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function validUserId(value:string){return value.length>0&&value.length<=128&&/^[a-zA-Z0-9_-]+$/.test(value);}
function validUuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
async function verifyProject(req:Request){
  const token=req.headers.get("x-pie-vercel-oidc")||"";
  if(!token) throw new Error("Missing Pie project identity.");
  const {payload}=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:AUDIENCE});
  if(payload.owner_id!==TEAM_ID||payload.project_id!==PROJECT_ID||payload.project!==PROJECT_NAME) throw new Error("Untrusted Pie project identity.");
  if(payload.environment!=="production"&&payload.environment!=="preview") throw new Error("Untrusted Pie environment.");
  return payload.environment;
}
function entitlementRow(row:any){return {planId:row?.plan_id||"none",planLevel:Number(row?.plan_level||0),status:String(row?.status||"inactive"),allowed:Boolean(row?.allowed),usageCount:Number(row?.usage_count||0),usageLimit:row?.usage_limit==null?null:Number(row.usage_limit),outputQuality:String(row?.status||"")==="active"?"premium":"standard"};}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed."},405);
  let environment:string;
  try{environment=await verifyProject(req);}catch(error){return json({error:error instanceof Error?error.message:"Authentication failed."},401);}
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"");
    const userId=String(body?.userId||"").trim();
    if(!validUserId(userId))return json({error:"Invalid user identity."},400);

    // OIDC and caller identity have been checked above. Preview Clerk remains a customer test account.
    const owner = userId === "pie-primary" || (environment === "production" && userId === "user_3JFNRykFY9nfjkxHkVkUBvPA34P");
    if(owner && ["consume", "consumeJob", "summary", "reserveCost", "settleCost", "releaseCost"].includes(action)) {
      const {data,error}=await supabase.rpc("pie_owner_meter",{p_environment:environment,p_user_id:userId,p_action:action,p_body:body});
      if(error)throw error;
      return json(data);
    }

    if(action==="consume"||action==="consumeJob"){
      const usageKey=String(body?.usageKey||"").trim().slice(0,80);
      const freeLimit=Number(body?.freeLimit);
      const units=Number(body?.units||1);
      if(!usageKey||!Number.isInteger(freeLimit)||freeLimit<0||freeLimit>100000||!Number.isInteger(units)||units<1||units>100)return json({error:"Invalid usage request."},400);
      if(action==="consumeJob"){
        const jobId=String(body?.jobId||"").trim();
        if(!validUuid(jobId))return json({error:"Invalid job identity."},400);
        const {data,error}=await supabase.rpc("pie_entitlement_and_consume_job",{p_job_id:jobId,p_user_id:userId,p_usage_key:usageKey,p_free_limit:freeLimit,p_units:units});
        if(error)throw error;
        const row=Array.isArray(data)?data[0]:data;
        return json(entitlementRow(row));
      }
      // Separate, bounded Drob QA balance; never change the customer's subscription counters.
      const isDrobPreviewTest = environment === "preview"
        && userId === "user_3JCFRuy8lxa1w0d7a59MAznPXBZ"
        && Date.now() < Date.parse("2026-09-26T00:00:00Z")
        && ["elevenlabs_stem_separations", "kits_voice_conversions", "kits_vocal_separations"].includes(usageKey);
      const meteredUserId = isDrobPreviewTest ? "pie-preview-drob-test-20260912" : userId;
      const {data,error}=await supabase.rpc("pie_entitlement_and_consume",{p_user_id:meteredUserId,p_usage_key:usageKey,p_free_limit:freeLimit,p_units:units});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      return json(entitlementRow(row));
    }

    if(action==="reserveCost"){
      const usageKey=String(body?.usageKey||"").trim().slice(0,80);
      const provider=String(body?.provider||"").trim().slice(0,80);
      const model=String(body?.model||"").trim().slice(0,120);
      const reserveCents=Number(body?.reserveCents||0);
      const reservationId=String(body?.reservationId||"").trim();
      if(!usageKey||!provider||!model||!Number.isInteger(reserveCents)||reserveCents<1||reserveCents>100000||!validUuid(reservationId))return json({error:"Invalid external-cost reservation."},400);
      const {data,error}=await supabase.rpc("pie_reserve_external_cost",{p_user_id:userId,p_usage_key:usageKey,p_provider:provider,p_model:model,p_reserve_cents:reserveCents,p_reservation_id:reservationId});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      return json({allowed:Boolean(row?.allowed),reservationId:String(row?.reservation_id||reservationId),budgetCents:Number(row?.budget_cents||0),usedCents:Number(row?.used_cents||0),remainingCents:Number(row?.remaining_cents||0),billingStatus:String(row?.billing_status||"inactive"),reason:String(row?.reason||"")});
    }

    if(action==="settleCost"){
      const reservationId=String(body?.reservationId||"").trim();
      const actualCents=Number(body?.actualCents);
      if(!validUuid(reservationId)||!Number.isInteger(actualCents)||actualCents<0||actualCents>100000)return json({error:"Invalid external-cost settlement."},400);
      const {data,error}=await supabase.rpc("pie_settle_external_cost",{p_user_id:userId,p_reservation_id:reservationId,p_actual_cents:actualCents});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      return json({ok:Boolean(row?.ok),remainingCents:Number(row?.remaining_cents||0),reason:String(row?.reason||"")});
    }

    if(action==="releaseCost"){
      const reservationId=String(body?.reservationId||"").trim();
      if(!validUuid(reservationId))return json({error:"Invalid external-cost release."},400);
      const {data,error}=await supabase.rpc("pie_release_external_cost",{p_user_id:userId,p_reservation_id:reservationId});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      return json({ok:Boolean(row?.ok),remainingCents:Number(row?.remaining_cents||0),reason:String(row?.reason||"")});
    }

    if(action==="summary"){
      const {data,error}=await supabase.rpc("pie_usage_summary",{p_user_id:userId});
      if(error)throw error;
      return json(data||{});
    }

    if(action==="grantOverage"){
      const credits=Number(body?.credits||0);
      const stripeSessionId=String(body?.stripeSessionId||"").slice(0,200);
      if(!Number.isInteger(credits)||credits<1||credits>10000||!stripeSessionId)return json({error:"Invalid overage grant."},400);
      const {data,error}=await supabase.rpc("pie_grant_overage_credits",{p_user_id:userId,p_credits:credits,p_stripe_session_id:stripeSessionId});
      if(error)throw error;
      return json({ok:true,balance:Number(data||0)});
    }

    if(action==="syncBilling"){
      const planId=String(body?.planId||"none").slice(0,80);
      const planLevel=Math.max(0,Math.min(8,Number(body?.planLevel||0)));
      const status=String(body?.status||"inactive").slice(0,40);
      const stripeCustomerId=body?.stripeCustomerId?String(body.stripeCustomerId):null;
      const stripeSubscriptionId=body?.stripeSubscriptionId?String(body.stripeSubscriptionId):null;
      const stripePriceId=body?.stripePriceId?String(body.stripePriceId):null;
      const currentPeriodEnd=body?.currentPeriodEnd?new Date(Number(body.currentPeriodEnd)*1000).toISOString():null;
      const cancelAtPeriodEnd=Boolean(body?.cancelAtPeriodEnd);
      const {error}=await supabase.from("pie_billing_customers").upsert({user_id:userId,stripe_customer_id:stripeCustomerId,stripe_subscription_id:stripeSubscriptionId,stripe_price_id:stripePriceId,plan_id:planId,plan_level:planLevel,status,current_period_end:currentPeriodEnd,cancel_at_period_end:cancelAtPeriodEnd,updated_at:new Date().toISOString()},{onConflict:"user_id"});
      if(error)throw error;
      return json({ok:true});
    }

    return json({error:"Unknown action."},400);
  }catch(error){console.error("pie-entitlements",error);return json({error:error instanceof Error?error.message:"Entitlement service failed."},500);}
});