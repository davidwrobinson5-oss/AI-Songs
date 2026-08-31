import { getVercelOidcToken } from '@vercel/oidc';

const STAGING_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-staging';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

async function request(action:string,path:string){
  const oidc=await getVercelOidcToken().catch(()=> '');
  if(!oidc) throw new Error('Cloud identity is temporarily unavailable.');
  const r=await fetch(STAGING_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({action,path}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||'Staging request failed.');
  return d as {url?:string;path?:string;ok?:boolean};
}

export async function signedStagingUrl(path:string){
  const d=await request('sign',path);
  if(!d.url) throw new Error('Could not read staged file.');
  return d.url;
}

export async function removeStagedFile(path:string){
  await request('remove',path).catch(()=>undefined);
}
