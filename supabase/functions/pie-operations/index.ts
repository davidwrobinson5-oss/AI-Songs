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


// These three authenticated identities belong to the same Pie owner.
const PIE_OWNER_IDS = ["pie-primary", "user_3JCFRuy8lxa1w0d7a59MAznPXBZ", "user_3JFNRykFY9nfjkxHkVkUBvPA34P"];
function ownerScope(userId: string) { return PIE_OWNER_IDS.includes(userId) ? PIE_OWNER_IDS : [userId]; }
function sharedOwnerId(userId: string) { return PIE_OWNER_IDS.includes(userId) ? PIE_OWNER_IDS[1] : userId; }

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});}
function text(v:unknown,max=4000){return typeof v==='string'?v.trim().slice(0,max):'';}
function validUserId(v:string){return v.length>0&&v.length<=128&&/^[a-zA-Z0-9_-]+$/.test(v);}
async function verifyProject(req:Request){const token=req.headers.get("x-pie-vercel-oidc")||"";if(!token)throw new Error("Missing Pie project identity.");const {payload}=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:AUDIENCE});if(payload.owner_id!==TEAM_ID||payload.project_id!==PROJECT_ID||payload.project!==PROJECT_NAME)throw new Error("Untrusted Pie project identity.");if(payload.environment!=="production"&&payload.environment!=="preview")throw new Error("Untrusted Pie environment.");}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed."},405);
  try{await verifyProject(req);}catch(error){return json({error:error instanceof Error?error.message:"Authentication failed."},401);}
  try{
    const body=await req.json().catch(()=>({}));
    const action=text(body?.action,80);
    const authenticatedUserId=text(body?.userId,128);
    const shareOwnerData = ["supportCreate", "supportList", "supportMessages", "supportReply", "contractSave", "contractList", "scoreProfile", "scoreIdentity", "scoreEvent"].includes(action);
    const userId = shareOwnerData ? sharedOwnerId(authenticatedUserId) : authenticatedUserId;
    if(action!=="scoreTop100"&&!validUserId(userId))return json({error:"Invalid user identity."},400);

    if(action==="supportCreate"){
      const supportType=text(body.supportType,120), subject=text(body.subject,160), message=text(body.message,6000);
      if(!supportType||!subject||!message)return json({error:"Support type, subject, and message are required."},400);
      const id=crypto.randomUUID(); const caseNumber=`PIE-${new Date().getUTCFullYear()}-${id.slice(0,8).toUpperCase()}`;
      const {data,error}=await supabase.from("pie_support_requests").insert({id,user_id:userId,case_number:caseNumber,support_type:supportType,business_stage:text(body.businessStage,80)||null,preferred_contact:text(body.preferredContact,40)||null,subject,message,status:"open",priority:text(body.priority,20)||"normal",metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{}}).select("id,case_number,support_type,business_stage,preferred_contact,subject,message,status,priority,created_at,updated_at").single();
      if(error)throw error; await supabase.from("pie_support_messages").insert({case_id:id,user_id:userId,sender_role:"user",body:message}); return json({case:data},201);
    }
    if(action==="supportList"){const {data,error}=await supabase.from("pie_support_requests").select("id,case_number,support_type,business_stage,preferred_contact,subject,message,status,priority,assigned_to,created_at,updated_at,closed_at").eq("user_id",userId).order("updated_at",{ascending:false}).limit(50);if(error)throw error;return json({cases:data||[]});}
    if(action==="supportMessages"){const caseId=text(body.caseId,64);if(!caseId)return json({error:"Missing case id."},400);const {data:owned,error:ownedError}=await supabase.from("pie_support_requests").select("id").eq("id",caseId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Case not found."},404);const {data,error}=await supabase.from("pie_support_messages").select("id,sender_role,body,created_at").eq("case_id",caseId).order("created_at",{ascending:true}).limit(200);if(error)throw error;return json({messages:data||[]});}
    if(action==="supportReply"){const caseId=text(body.caseId,64), message=text(body.message,6000);if(!caseId||!message)return json({error:"Case id and message are required."},400);const {data:owned,error:ownedError}=await supabase.from("pie_support_requests").select("id").eq("id",caseId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Case not found."},404);const {error}=await supabase.from("pie_support_messages").insert({case_id:caseId,user_id:userId,sender_role:"user",body:message});if(error)throw error;await supabase.from("pie_support_requests").update({updated_at:new Date().toISOString(),status:"open"}).eq("id",caseId).eq("user_id",userId);return json({ok:true});}

    if(action==="scoreProfile"){const {data,error}=await supabase.from("pie_score_profiles").select("*").eq("user_id",userId).maybeSingle();if(error)throw error;const {data:events,error:eventError}=await supabase.from("pie_score_events").select("event_key,source_ref,category,points,metadata,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(100);if(eventError)throw eventError;return json({profile:data||null,events:events||[]});}
    if(action==="scoreIdentity"){const displayName=text(body.displayName,80)||"Pie Artist";const entityType=['artist','band'].includes(text(body.entityType,20))?text(body.entityType,20):'artist';const isPublic=Boolean(body.isPublic);const currentStage=Math.max(1,Math.min(8,Number(body.currentStage||1)));const {error}=await supabase.from("pie_score_profiles").upsert({user_id:userId,display_name:displayName,entity_type:entityType,is_public:isPublic,current_stage:currentStage,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(error)throw error;const {data:profile,error:recalcError}=await supabase.rpc("pie_recalculate_score",{p_user_id:userId});if(recalcError)throw recalcError;return json({profile});}
    if(action==="scoreEvent"){const eventKey=text(body.eventKey,100), sourceRef=text(body.sourceRef,140)||"default", category=text(body.category,30), points=Math.max(0,Math.min(250,Math.round(Number(body.points||0))));if(!eventKey||!['completion','quality','determination','connections','execution'].includes(category))return json({error:"Invalid score event."},400);const {error}=await supabase.from("pie_score_events").upsert({user_id:userId,event_key:eventKey,source_ref:sourceRef,category,points,metadata:body.metadata&&typeof body.metadata==='object'?body.metadata:{}},{onConflict:"user_id,event_key,source_ref"});if(error)throw error;const {data:profile,error:recalcError}=await supabase.rpc("pie_recalculate_score",{p_user_id:userId});if(recalcError)throw recalcError;return json({profile});}
    if(action==="scoreTop100"){const {data,error}=await supabase.from("pie_score_profiles").select("display_name,entity_type,current_stage,current_score,all_time_high,completion_points,quality_points,determination_points,connections_points,execution_points,badges,updated_at").eq("is_public",true).order("all_time_high",{ascending:false}).order("updated_at",{ascending:true}).limit(100);if(error)throw error;return json({leaders:data||[]});}

    if(action==="contractSave"){const title=text(body.title,180), contractType=text(body.contractType,100), draftText=text(body.draftText,60000);if(!title||!contractType||!draftText)return json({error:"Contract type, title, and draft are required."},400);const {data,error}=await supabase.from("pie_contract_drafts").insert({user_id:userId,contract_type:contractType,title,jurisdiction:text(body.jurisdiction,120)||null,parties:Array.isArray(body.parties)?body.parties:[],deal_terms:body.dealTerms&&typeof body.dealTerms==='object'?body.dealTerms:{},draft_text:draftText,status:"draft"}).select("id,title,contract_type,jurisdiction,status,created_at,updated_at").single();if(error)throw error;return json({contract:data},201);}
    if(action==="contractList"){const {data,error}=await supabase.from("pie_contract_drafts").select("id,title,contract_type,jurisdiction,status,created_at,updated_at").eq("user_id",userId).order("updated_at",{ascending:false}).limit(50);if(error)throw error;return json({contracts:data||[]});}

    if(action==="financeConnectionUpsert"){
      const itemId=text(body.itemId,160), encrypted=text(body.encryptedAccessToken,4000); if(!itemId||!encrypted)return json({error:"Missing Plaid item or encrypted token."},400);
      const institutionId=text(body.institutionId,120)||null, institutionName=text(body.institutionName,180)||null;
      const {data:existing,error:existingError}=await supabase.from("pie_financial_connections").select("id").eq("user_id",userId).eq("provider_item_id",itemId).maybeSingle(); if(existingError)throw existingError;
      let connectionId=existing?.id as string|undefined;
      if(connectionId){const {error}=await supabase.from("pie_financial_connections").update({institution_id:institutionId,institution_name:institutionName,status:"active",error_code:null,error_message:null,updated_at:new Date().toISOString()}).eq("id",connectionId).eq("user_id",userId);if(error)throw error;}
      else {const {data,error}=await supabase.from("pie_financial_connections").insert({user_id:userId,provider:"plaid",provider_item_id:itemId,institution_id:institutionId,institution_name:institutionName,status:"active"}).select("id").single();if(error)throw error;connectionId=data.id;}
      const {error:secretError}=await supabase.from("pie_financial_secrets").upsert({connection_id:connectionId,user_id:userId,encrypted_access_token:encrypted,updated_at:new Date().toISOString()},{onConflict:"connection_id"});if(secretError)throw secretError;
      return json({connectionId});
    }
    if(action==="financeConnections"){
      const {data:connections,error}=await supabase.from("pie_financial_connections").select("id,provider_item_id,institution_id,institution_name,status,error_code,error_message,sync_cursor,last_synced_at,created_at,updated_at").eq("user_id",userId).order("updated_at",{ascending:false});if(error)throw error;
      const {data:accounts,error:accountError}=await supabase.from("pie_bank_accounts").select("id,connection_id,provider_account_id,name,official_name,mask,account_type,account_subtype,currency,current_balance,available_balance,updated_at").eq("user_id",userId).order("name",{ascending:true});if(accountError)throw accountError;
      const {data:transactions,error:txError}=await supabase.from("pie_bank_transactions").select("id,account_id,provider_transaction_id,transaction_date,authorized_date,name,merchant_name,amount,currency,category,pending,metadata,updated_at").eq("user_id",userId).order("transaction_date",{ascending:false}).limit(250);if(txError)throw txError;
      return json({connections:connections||[],accounts:accounts||[],transactions:transactions||[]});
    }
    if(action==="financeAccessToken"){
      const connectionId=text(body.connectionId,64);if(!connectionId)return json({error:"Missing connection id."},400);
      const {data:owned,error:ownedError}=await supabase.from("pie_financial_connections").select("id,sync_cursor,provider_item_id").eq("id",connectionId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Connection not found."},404);
      const {data:secret,error}=await supabase.from("pie_financial_secrets").select("encrypted_access_token").eq("connection_id",connectionId).eq("user_id",userId).maybeSingle();if(error)throw error;if(!secret)return json({error:"Connection secret not found."},404);
      return json({connectionId,encryptedAccessToken:secret.encrypted_access_token,syncCursor:owned.sync_cursor||null,itemId:owned.provider_item_id||null});
    }
    if(action==="financeStoreAccounts"){
      const connectionId=text(body.connectionId,64); const rows=Array.isArray(body.accounts)?body.accounts.slice(0,100):[]; if(!connectionId)return json({error:"Missing connection id."},400);
      const {data:owned,error:ownedError}=await supabase.from("pie_financial_connections").select("id").eq("id",connectionId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Connection not found."},404);
      for(const row of rows){const providerAccountId=text(row?.providerAccountId,180);if(!providerAccountId)continue;const {error}=await supabase.from("pie_bank_accounts").upsert({connection_id:connectionId,user_id:userId,provider_account_id:providerAccountId,name:text(row?.name,180)||null,official_name:text(row?.officialName,240)||null,mask:text(row?.mask,8)||null,account_type:text(row?.type,60)||null,account_subtype:text(row?.subtype,80)||null,currency:text(row?.currency,12)||"USD",current_balance:Number.isFinite(Number(row?.currentBalance))?Number(row.currentBalance):null,available_balance:Number.isFinite(Number(row?.availableBalance))?Number(row.availableBalance):null,updated_at:new Date().toISOString()},{onConflict:"user_id,provider_account_id"});if(error)throw error;}
      return json({ok:true,count:rows.length});
    }
    if(action==="financeStoreTransactions"){
      const connectionId=text(body.connectionId,64); const added=Array.isArray(body.added)?body.added.slice(0,1000):[]; const modified=Array.isArray(body.modified)?body.modified.slice(0,1000):[]; const removed=Array.isArray(body.removed)?body.removed.slice(0,1000):[]; const cursor=text(body.cursor,500)||null;
      const {data:owned,error:ownedError}=await supabase.from("pie_financial_connections").select("id").eq("id",connectionId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Connection not found."},404);
      const {data:accountRows,error:accountError}=await supabase.from("pie_bank_accounts").select("id,provider_account_id").eq("connection_id",connectionId).eq("user_id",userId);if(accountError)throw accountError; const accountMap=new Map((accountRows||[]).map((r:any)=>[r.provider_account_id,r.id]));
      for(const row of [...added,...modified]){const txId=text(row?.providerTransactionId,200);if(!txId)continue;const {error}=await supabase.from("pie_bank_transactions").upsert({user_id:userId,account_id:accountMap.get(text(row?.providerAccountId,180))||null,provider_transaction_id:txId,transaction_date:text(row?.date,20)||null,authorized_date:text(row?.authorizedDate,20)||null,name:text(row?.name,300)||null,merchant_name:text(row?.merchantName,300)||null,amount:Number.isFinite(Number(row?.amount))?Number(row.amount):null,currency:text(row?.currency,12)||"USD",category:text(row?.category,160)||null,pending:Boolean(row?.pending),metadata:row?.metadata&&typeof row.metadata==='object'?row.metadata:{},updated_at:new Date().toISOString()},{onConflict:"user_id,provider_transaction_id"});if(error)throw error;}
      for(const row of removed){const txId=text(row?.providerTransactionId,200);if(txId){const {error}=await supabase.from("pie_bank_transactions").delete().eq("user_id",userId).eq("provider_transaction_id",txId);if(error)throw error;}}
      const {error:updateError}=await supabase.from("pie_financial_connections").update({sync_cursor:cursor,last_synced_at:new Date().toISOString(),status:"active",error_code:null,error_message:null,updated_at:new Date().toISOString()}).eq("id",connectionId).eq("user_id",userId);if(updateError)throw updateError;
      return json({ok:true,added:added.length,modified:modified.length,removed:removed.length,cursor});
    }
    if(action==="financeConnectionError"){const connectionId=text(body.connectionId,64);const {error}=await supabase.from("pie_financial_connections").update({status:"error",error_code:text(body.errorCode,120)||null,error_message:text(body.errorMessage,500)||null,updated_at:new Date().toISOString()}).eq("id",connectionId).eq("user_id",userId);if(error)throw error;return json({ok:true});}
    if(action==="financeDeleteConnection"){const connectionId=text(body.connectionId,64);const {data:owned,error:ownedError}=await supabase.from("pie_financial_connections").select("id").eq("id",connectionId).eq("user_id",userId).maybeSingle();if(ownedError)throw ownedError;if(!owned)return json({error:"Connection not found."},404);const {data:accountRows,error:accountError}=await supabase.from("pie_bank_accounts").select("id").eq("connection_id",connectionId).eq("user_id",userId);if(accountError)throw accountError;const accountIds=(accountRows||[]).map((r:any)=>r.id);if(accountIds.length){const {error:txError}=await supabase.from("pie_bank_transactions").delete().eq("user_id",userId).in("account_id",accountIds);if(txError)throw txError;}const {error}=await supabase.from("pie_financial_connections").delete().eq("id",connectionId).eq("user_id",userId);if(error)throw error;return json({ok:true});}

    return json({error:"Unknown action."},400);
  }catch(error){console.error("pie-operations",error);return json({error:error instanceof Error?error.message:"Pie operations request failed."},500);}
});