import { auth, currentUser } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

const SECURITY_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-security';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const REPO='davidwrobinson5-oss/AI-Songs';
const SECURITY_WORKFLOWS=['Pie Runtime Security Alarm','Pie Code Health Agent','Pie CodeQL Security','CodeQL'];

type WorkflowRun={id:string;name:string;status:string;conclusion:string;event:string;headSha:string;branch:string;createdAt:string;updatedAt:string;htmlUrl:string};

async function isPieSecurityAdmin(){
  try{
    const session=await auth();
    if(session.userId){
      const user=await currentUser().catch(()=>null);
      const pub=(user?.publicMetadata||{}) as Record<string,unknown>;
      const allowedIds=(process.env.PIE_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
      return Boolean(pub.pieAdmin===true||pub.pieSecurityAdmin===true||allowedIds.includes(session.userId));
    }
  }catch{}
  const jar=await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value||'',process.env.AI_SONGS_SESSION_SECRET);
}

async function pieSecurity(action:string,extra:Record<string,unknown>={}){
  const oidc=await getVercelOidcToken().catch(()=>'');
  if(!oidc)throw new Error('Pie security identity is temporarily unavailable.');
  const r=await fetch(SECURITY_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({action,...extra}),cache:'no-store'});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(String(d?.error||'Security service failed.'));
  return d;
}

async function githubWorkflowRuns():Promise<WorkflowRun[]>{
  const r=await fetch(`https://api.github.com/repos/${REPO}/actions/runs?per_page=50`,{headers:{Accept:'application/vnd.github+json','User-Agent':'Pie-Cyber-Security'},cache:'no-store'}).catch(()=>null);
  if(!r?.ok)return [];
  const d=await r.json().catch(()=>({}));
  return (Array.isArray(d.workflow_runs)?d.workflow_runs:[]).filter((run:any)=>SECURITY_WORKFLOWS.includes(String(run?.name||''))).slice(0,30).map((run:any)=>({id:String(run.id||''),name:String(run.name||''),status:String(run.status||''),conclusion:String(run.conclusion||''),event:String(run.event||''),headSha:String(run.head_sha||''),branch:String(run.head_branch||''),createdAt:String(run.created_at||''),updatedAt:String(run.updated_at||''),htmlUrl:String(run.html_url||'')}));
}

function severityForRun(run:WorkflowRun){
  if(run.conclusion==='failure')return run.name.includes('Runtime')?'high':'medium';
  if(run.conclusion==='cancelled'||run.conclusion==='timed_out')return 'medium';
  return 'info';
}

async function persistWorkflowRuns(runs:WorkflowRun[]){
  await Promise.all(runs.filter(run=>run.id&&run.status==='completed').map(run=>pieSecurity('record',{
    source:'github-actions',
    eventType:'security_workflow_run',
    severity:severityForRun(run),
    title:`${run.name}: ${run.conclusion||run.status}`,
    summary:`${run.event} on ${run.branch||'unknown branch'} · commit ${run.headSha.slice(0,8)||'unknown'}`,
    externalRunId:run.id,
    commitSha:run.headSha,
    branch:run.branch,
    workflow:run.name,
    observedAt:run.updatedAt||run.createdAt,
    metadata:{conclusion:run.conclusion,status:run.status,event:run.event,htmlUrl:run.htmlUrl},
  }).catch(()=>null)));
}

export async function GET(){
  if(!(await isPieSecurityAdmin()))return NextResponse.json({error:'Cyber Security is restricted to Pie administration.'},{status:403});
  try{
    const workflowRuns=await githubWorkflowRuns();
    await persistWorkflowRuns(workflowRuns);
    const internal=await pieSecurity('list');
    return NextResponse.json({...internal,workflowRuns},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load Cyber Security.'},{status:500});}
}

export async function POST(req:Request){
  if(!(await isPieSecurityAdmin()))return NextResponse.json({error:'Cyber Security is restricted to Pie administration.'},{status:403});
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(action==='resolve')return NextResponse.json(await pieSecurity('resolve',{id:String(body?.id||'')}),{headers:{'Cache-Control':'no-store'}});
    return NextResponse.json({error:'Unsupported security action.'},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Security action failed.'},{status:500});}
}
