const key=process.env.KLANGIO_API_KEY?.trim();
if(!key){console.log('KLANGIO_URL_TEST missing key');process.exit(0)}
const endpoint=new URL('https://api.klang.io/transcription');
endpoint.searchParams.set('model','universal');
endpoint.searchParams.append('outputs','pdf');
const form=new FormData();
form.append('url','https://www.youtube.com/watch?v=jNQXAC9IVRw');
try{
  const r=await fetch(endpoint,{method:'POST',headers:{'kl-api-key':key},body:form});
  const text=await r.text();
  console.log('KLANGIO_URL_TEST',JSON.stringify({status:r.status,ok:r.ok,body:text.slice(0,800)}));
}catch(error){
  console.log('KLANGIO_URL_TEST',JSON.stringify({error:error instanceof Error?error.message:String(error)}));
}
