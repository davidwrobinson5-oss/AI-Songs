const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const swc=require('next/dist/build/swc');
(async()=>{
 await swc.loadBindings();
 const code=swc.transformSync(fs.readFileSync('app/api/billing/checkout/route.ts','utf8'),{filename:'route.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}}).code;
 let sent;
 const user={id:'user_test',primaryEmailAddress:{emailAddress:'test@example.com',verification:{status:'verified'}},phoneNumbers:[{verification:{status:'verified'}}]};
 const mocks={
  '@clerk/nextjs/server':{auth:async()=>({userId:user.id}),currentUser:async()=>user,clerkClient:async()=>({})},
  'next/server':{NextResponse:Response},
  '../../../deploymentEnvironment':{pieDeploymentTarget:()=> 'preview'},
  '../../../stripePlans':{stripeEnvironmentSafe:()=>true,stripePlan:()=>({priceId:'price_test',level:2})},
 };
 const exports={};
 const fetch=async(url,init)=>{sent={url,init,params:new URLSearchParams(init.body)};return Response.json({url:'https://checkout.stripe.test/session'});};
 vm.runInNewContext(code,{exports,require:n=>{assert.ok(n in mocks,n);return mocks[n]},process:{env:{STRIPE_SECRET_KEY:'rk_test_safe'}},URLSearchParams,URL,Request,Response,AbortController,Uint8Array,crypto:require('node:crypto').webcrypto,fetch,setTimeout,clearTimeout,console});
 const request=new Request('https://preview.test/api/billing/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({planId:'release_planning'})});
 Object.defineProperty(request,'nextUrl',{value:new URL(request.url)});
 const response=await exports.POST(request);
 assert.equal(response.status,200);
 assert.equal(sent.url,'https://api.stripe.com/v1/checkout/sessions');
 assert.equal(sent.init.headers['Stripe-Version'],'2026-07-29.dahlia');
 assert.match(sent.params.get('integration_identifier'),/^pie_signup_[a-z]{8}$/);
 assert.equal(sent.params.has('payment_method_types[0]'),false);
 assert.equal(sent.params.has('wallet_options[link][display]'),false);
 const body=await response.json();
 assert.equal(body.url,'https://checkout.stripe.test/session');
 console.log('PASS checkout uses dynamic payment methods and an integration identifier');
})().catch(e=>{console.error(e);process.exit(1)});
