import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from './usageEntitlements';

const SCORE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-score';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

export async function awardPieScore(eventKey:string,sourceRef:string,metric=0,metadata:Record<string,unknown>={}){
  const userId=await resolvePieUserId();
  if(!userId)return null;
  const oidc=await getVercelOidcToken().catch(()=>'');
  if(!oidc)return null;
  const response=await fetch(SCORE_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({userId,eventKey,sourceRef,metric,metadata}),cache:'no-store'}).catch(()=>null);
  if(!response?.ok)return null;
  return response.json().catch(()=>null);
}
