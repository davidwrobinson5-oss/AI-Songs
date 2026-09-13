const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const swc=require('next/dist/build/swc');
(async()=>{
 await swc.loadBindings();
 const code=swc.transformSync(fs.readFileSync('app/api/billing/webhook/route.ts','utf8'),{filename:'route.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code;
 const scenarios=[
 ['checkout follows current active status','checkout.session.completed','active','price_high',8],
 ['renewal refreshes cycle','invoice.paid','active','price_high',8],
 ['recovery restores access','invoice.payment_succeeded','active','price_high',8],
 ['late failed invoice preserves recovered access','invoice.payment_failed','active','price_high',8],
 ['failed subscription blocks access','invoice.payment_failed','past_due','price_high',0],
 ['downgrade follows price despite stale metadata','customer.subscription.updated','active','price_low',2],
 ['cancellation removes access','customer.subscription.deleted','canceled','price_high',0],
 ['trial remains entitled','customer.subscription.created','trialing','price_low',2],
 ['unknown active price retries without writes','customer.subscription.updated','active','price_unknown',null],
 ];
 for(const [name,type,status,price,level] of scenarios){
  const writes=[],updates=[];
  const subscription={id:'sub_test',customer:'cus_test',livemode:false,status,metadata:{pie_user_id:'user_test',pie_plan_level:'8'},items:{data:[{price:{id:price},current_period_end:2000000000}]},cancel_at_period_end:false};
  const client={users:{getUser:async()=>({publicMetadata:{pieStripeSubscriptionId:'sub_test'}}),updateUserMetadata:async(id,value)=>updates.push(value.publicMetadata)}};
  const exports={};const mocks={
   '@clerk/nextjs/server':{clerkClient:async()=>client},'@vercel/oidc':{getVercelOidcToken:async()=>'test'},
   'next/server':{NextResponse:Response},'../../../deploymentEnvironment':{pieDeploymentTarget:()=> 'preview'},
   '../../../billingStripeServer':{stripeObjectId:v=>typeof v==='string'?v:v?.id||'',billingStripe:async()=>subscription},
   '../../../stripePlans':{stripePlanIdForPrice:p=>p==='price_high'?'international':p==='price_low'?'release_planning':null,stripePlan:p=>({level:p==='international'?8:2})},
  };
  vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in mocks,n);return mocks[n]},process:{env:{STRIPE_WEBHOOK_SECRET:'test-secret'}},crypto:crypto.webcrypto,TextEncoder,Uint8Array,Date,console,fetch:async(url,init)=>{writes.push(JSON.parse(init.body));return Response.json({});}});
  const object={id:type.startsWith('customer.')?'sub_test':'evt_object',customer:'cus_test',subscription:'sub_test',mode:'subscription',metadata:{pie_user_id:'user_test',pie_plan_level:'8'},parent:{subscription_details:{subscription:'sub_test',metadata:{pie_user_id:'user_test'}}}};
  const raw=JSON.stringify({type,livemode:false,data:{object}}),t=Math.floor(Date.now()/1000),signature=crypto.createHmac('sha256','test-secret').update(`${t}.${raw}`).digest('hex');
  const response=await exports.POST(new Request('https://test/api/billing/webhook',{method:'POST',headers:{'stripe-signature':`t=${t},v1=${signature}`},body:raw}));
  assert.equal(response.status,level===null?503:200,name);
  if(level===null){assert.equal(updates.length,0);assert.equal(writes.length,0);}
  else {assert.equal(updates[0].piePlanLevel,level);assert.equal(updates[0].pieSubscriptionStatus,status);assert.equal(writes[0].currentPeriodEnd,2000000000);assert.equal(writes[0].planLevel,level);}
  console.log('PASS',name);
 }
})().catch(e=>{console.error(e);process.exit(1)});
