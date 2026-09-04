import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from './usageEntitlements';
const KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
async function edge(url:string,body:Record<string,unknown>,userId:string,oidc:string){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',apikey:KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({...body,userId}),cache:'no-store'});if(!r.ok)return null;return r.json().catch(()=>null);}
export async function getPieContextSnapshot(){const userId=await resolvePieUserId();if(!userId)return null;const oidc=await getVercelOidcToken().catch(()=>'');if(!oidc)return null;const [score,data,finance,support]=await Promise.all([
edge('https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-operations',{action:'scoreProfile'},userId,oidc),
edge('https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-data',{action:'list'},userId,oidc),
edge('https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-finance',{action:'list'},userId,oidc),
edge('https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-support',{action:'list',isAdmin:false},userId,oidc),
]);
const requests=Array.isArray(data?.requests)?data.requests:[];const transactions=Array.isArray(finance?.transactions)?finance.transactions:[];const accounts=Array.isArray(finance?.accounts)?finance.accounts:[];const cases=Array.isArray(support?.cases)?support.cases:[];const openCases=cases.filter((c:any)=>c.status!=='closed');
const recentScoreEvents=Array.isArray(score?.events)?score.events.slice(0,12):[];
return {score:score?.profile?{current:score.profile.current_score||0,high:score.profile.all_time_high||0,completion:score.profile.completion_points||0,quality:score.profile.quality_points||0,determination:score.profile.determination_points||0,connections:score.profile.connections_points||0,execution:score.profile.execution_points||0}:null,recentScoreEvents:recentScoreEvents.map((e:any)=>({event:e.event_key,category:e.category,points:e.points,at:e.created_at})),data:{requests:requests.length,active:requests.filter((r:any)=>!['fulfilled','cancelled','failed'].includes(r.status)).length,delivered:requests.reduce((n:number,r:any)=>n+Number(r.delivered_count||0),0)},finance:{connectedAccounts:accounts.length,transactions:transactions.length,lastSync:finance?.connections?.[0]?.last_synced_at||null},support:{openCases:openCases.length,appointmentRequests:openCases.filter((c:any)=>c.appointment_requested).length,areas:openCases.slice(0,5).map((c:any)=>c.specialist_type||c.support_type)}};
}
