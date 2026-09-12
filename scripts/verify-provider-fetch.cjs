const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const swc=require('next/dist/build/swc');
(async()=>{
 await swc.loadBindings();
 function compile(path){return swc.transformSync(fs.readFileSync(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code;}
 const receipt={};vm.runInNewContext(compile('app/providerReceipt.ts'),{exports:receipt,URL,Headers});
 for(const scenario of ['success','begin-fails','finish-fails','network-fails','binary','read-only']){
  const calls=[];let providerCalls=0;
  const rawFetch=async(url,init)=>{
   if(String(url).includes('pie-provider-usage')){
    const body=JSON.parse(init.body);calls.push(body);
    if(scenario==='begin-fails'&&body.action==='begin'||scenario==='finish-fails'&&body.action==='finish')return new Response('{}',{status:503});
    return new Response('{}');
   }
   providerCalls++;
   if(scenario==='network-fails')throw new Error('Network failed');
   if(scenario==='binary')return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg','request-id':'req_audio'}});
   return Response.json({id:'resp_test',usage:{input_tokens:10,output_tokens:5},input:'SECRET_PROMPT'});
  };
  const exports={};const mocks={'@vercel/oidc':{getVercelOidcToken:async()=>'SECRET_OIDC'},'./usageEntitlements':{resolvePieUserId:async()=>'user_test'},'./providerReceipt':receipt};
  vm.runInNewContext(compile('app/providerFetch.ts'),{exports,require:n=>mocks[n],process:{env:{}},fetch:rawFetch,URL,Request,Response,AbortSignal,Uint8Array,TextDecoder,crypto:require('node:crypto').webcrypto,console:{error:()=>{}},setTimeout,clearTimeout});
  const run=()=>exports.createProviderFetch('test')('https://api.openai.com/v1/responses',{method:scenario==='read-only'?'GET':'POST'});
  if(['begin-fails','network-fails'].includes(scenario))await assert.rejects(run);
  else {const result=await run();if(scenario==='binary')assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[1,2,3]);else assert.equal((await result.json()).id,'resp_test');}
  assert.equal(providerCalls,scenario==='begin-fails'?0:1);
  if(scenario==='read-only')assert.equal(calls.length,0);
  if(scenario==='finish-fails')assert.equal(calls.filter(x=>x.action==='finish').length,2);
  if(scenario==='network-fails')assert.equal(calls[1].status,'unknown');
  assert.equal(JSON.stringify(calls).includes('SECRET'),false);
  console.log('PASS',scenario);
 }
})().catch(e=>{console.error(e);process.exit(1)});
