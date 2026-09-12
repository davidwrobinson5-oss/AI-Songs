import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from './usageEntitlements';
import { extractProviderReceipt, providerForUrl } from './providerReceipt';

const URL_BASE = (process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '');
const API_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const rawFetch = globalThis.fetch;

async function record(body: Record<string, unknown>, oidc: string) {
  const response = await rawFetch(`${URL_BASE}/functions/v1/pie-provider-usage`, {
    method:'POST', headers:{'Content-Type':'application/json',apikey:API_KEY,'X-Pie-Vercel-OIDC':oidc},
    body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Provider accounting is temporarily unavailable.');
}
async function accountingJson(response: Response) {
  if (!response.headers.get('content-type')?.includes('application/json')) return null;
  const reader = response.clone().body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[]=[]; let size=0;
  const timeout=setTimeout(()=>{void reader.cancel().catch(()=>{});},10000);
  try {
    while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>512*1024) { void reader.cancel().catch(()=>{});return null; } chunks.push(value); }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; } finally { clearTimeout(timeout); }
}

export function createProviderFetch(feature: string, identity?: {userId: string; jobId: string}): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const provider = providerForUrl(url);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    // Polls/downloads/account balance reads do not represent new paid work.
    if (!provider || method !== 'POST') return rawFetch(input, init);
    const userId = identity?.userId || await resolvePieUserId();
    if (!userId) throw new Error('Sign in before using provider services.');
    const oidc=await getVercelOidcToken().catch(()=>'');
    if (!oidc) throw new Error('Provider accounting identity is unavailable.');
    const requestId=crypto.randomUUID();
    const base={requestId,userId,feature,provider,jobId:identity?.jobId || null};
    await record({action:'begin',...base},oidc);
    let response: Response;
    try { response = await rawFetch(input,init); }
    catch (error) {
      // Network failure is an unknown billing outcome, not evidence of a free request.
      await record({action:'finish',...base,status:'unknown',receipt:{}},oidc).catch(()=>console.error('Provider receipt pending', {requestId,provider}));
      throw error;
    }
    const receipt=extractProviderReceipt(provider,response.headers,await accountingJson(response));
    const finish={action:'finish',...base,status:response.ok?'accepted':'rejected',httpStatus:response.status,receipt};
    // Never turn an already completed provider call into a client retry because accounting failed.
    try { await record(finish,oidc); }
    catch { await record(finish,oidc).catch(()=>console.error('Provider receipt pending',{requestId,provider})); }
    return response;
  };
}
