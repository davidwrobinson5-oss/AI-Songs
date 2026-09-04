import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from './usageEntitlements';

const FINANCE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-finance';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

export class PlaidApiError extends Error{
  code:string;
  type:string;
  requestId:string;
  constructor(message:string,code='',type='',requestId=''){
    super(message);
    this.name='PlaidApiError';
    this.code=code;
    this.type=type;
    this.requestId=requestId;
  }
}

function plaidBase(){
  const env=(process.env.PLAID_ENV||'sandbox').toLowerCase();
  if(env==='production')return 'https://production.plaid.com';
  return 'https://sandbox.plaid.com';
}
export function plaidConfigured(){return Boolean(process.env.PLAID_CLIENT_ID&&process.env.PLAID_SECRET&&process.env.PLAID_TOKEN_ENCRYPTION_KEY);}
export async function plaidRequest(path:string,body:Record<string,unknown>){
  if(!plaidConfigured())throw new Error('Plaid is not configured yet.');
  const r=await fetch(`${plaidBase()}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:process.env.PLAID_CLIENT_ID,secret:process.env.PLAID_SECRET,...body}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new PlaidApiError(String(d?.error_message||d?.display_message||'Plaid request failed.'),String(d?.error_code||''),String(d?.error_type||''),String(d?.request_id||''));
  return d;
}
async function finance(body:Record<string,unknown>){const userId=await resolvePieUserId();if(!userId)throw new Error('Authentication required.');const oidc=await getVercelOidcToken().catch(()=>'');if(!oidc)throw new Error('Pie finance identity is temporarily unavailable.');const r=await fetch(FINANCE_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({...body,userId}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(String(d?.error||'Finance storage request failed.'));return {userId,data:d};}
function keyBytes(){const raw=process.env.PLAID_TOKEN_ENCRYPTION_KEY||'';return crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));}
export async function encryptAccessToken(token:string){const key=await crypto.subtle.importKey('raw',await keyBytes(),{name:'AES-GCM'},false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(token)));return `${Buffer.from(iv).toString('base64url')}.${Buffer.from(encrypted).toString('base64url')}`;}
export async function decryptAccessToken(value:string){const [a,b]=value.split('.');if(!a||!b)throw new Error('Stored Plaid token is invalid.');const key=await crypto.subtle.importKey('raw',await keyBytes(),{name:'AES-GCM'},false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(Buffer.from(a,'base64url'))},key,new Uint8Array(Buffer.from(b,'base64url')));return new TextDecoder().decode(plain);}
export async function financeAction(action:string,extra:Record<string,unknown>={}){return finance({action,...extra});}
export async function connectionSecret(connectionId:string){const {data}=await finance({action:'secret',connectionId});return decryptAccessToken(String(data.encryptedAccessToken||''));}
