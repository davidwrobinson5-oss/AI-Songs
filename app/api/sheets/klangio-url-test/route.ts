import { NextResponse } from 'next/server';

export const runtime='nodejs';
export const maxDuration=30;

export async function GET(){
  const key=process.env.KLANGIO_API_KEY?.trim();
  if(!key)return NextResponse.json({ok:false,error:'KLANGIO_NOT_CONFIGURED'},{status:503});

  const testUrl='https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const endpoint=new URL('https://api.klang.io/transcription');
  endpoint.searchParams.set('model','universal');
  endpoint.searchParams.append('outputs','pdf');

  const form=new FormData();
  form.append('url',testUrl);

  const response=await fetch(endpoint,{method:'POST',headers:{'kl-api-key':key},body:form,cache:'no-store'});
  const raw=await response.text();
  let body:unknown=raw.slice(0,1200);
  try{body=JSON.parse(raw)}catch{}
  return NextResponse.json({ok:response.ok,status:response.status,body,testUrl},{status:200,headers:{'Cache-Control':'no-store'}});
}
