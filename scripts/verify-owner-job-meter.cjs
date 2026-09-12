const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=process.cwd();
const swc=require(root+'/node_modules/next/dist/build/swc');
(async()=>{
 await swc.loadBindings();
 const source=fs.readFileSync(root+'/supabase/functions/pie-jobs/index.ts','utf8');
 const code=swc.transformSync(source,{filename:'index.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code;
 for(const c of [
  {name:'Production Clerk owner',environment:'production',userId:'user_3JFNRykFY9nfjkxHkVkUBvPA34P',rpc:'pie_owner_meter'},
  {name:'Preview password owner',environment:'preview',userId:'pie-primary',rpc:'pie_owner_meter'},
  {name:'Preview customer test account',environment:'preview',userId:'user_3JCFRuy8lxa1w0d7a59MAznPXBZ',rpc:'pie_consume_job_usage'},
  {name:'Other customer',environment:'production',userId:'user_customer',rpc:'pie_consume_job_usage'},
  {name:'Missing OIDC',environment:'production',userId:'pie-primary',noToken:true},
  {name:'Invalid project',environment:'production',userId:'pie-primary',badProject:true}
 ]){
  let handler,called='';
  const mocks={
   'jsr:@supabase/functions-js/edge-runtime.d.ts':{},
   'npm:@supabase/supabase-js@2.57.4':{createClient:()=>({from:()=>({select:()=>({eq:()=>({single:async()=>({data:{user_id:c.userId}})})})}),rpc:async(name)=>{called=name;return {data:{planId:'internal'}}}})},
   'npm:jose@6.1.0':{createRemoteJWKSet:()=>{},jwtVerify:async()=>({payload:{owner_id:'team_LxqzlcZa969N5n9I9VzwYlns',project_id:c.badProject?'other':'prj_UNamKUXBj3xsrjUtqhTt4Sew3OMk',project:'ai-songs',environment:c.environment}})}
  };
  vm.runInNewContext(code,{exports:{},require:n=>{assert.ok(n in mocks);return mocks[n]},Deno:{env:{get:()=>''},serve:h=>handler=h},URL,Response,console,Date});
  const result=await handler(new Request('https://test/',{method:'POST',headers:c.noToken?{}:{'x-pie-vercel-oidc':'verified-by-mock'},body:JSON.stringify({action:'consumeUsage',userId:c.userId,jobId:'10000000-0000-4000-8000-000000000001',usageKey:'music_generations'})}));
  assert.equal(result.status,c.rpc?200:401);
  assert.equal(called,c.rpc||'');
  console.log('PASS',c.name);
 }
})().catch(e=>{console.error(e);process.exit(1)});
