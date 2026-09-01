import { BotGuardClient } from 'bgutils-js/botguard';
import type { WebPoSignalOutput } from 'bgutils-js/shared-types';
import { buildURL, getHeaders, parseLooseJSON, USER_AGENT } from 'bgutils-js/utils';
import { WebPoMinter } from 'bgutils-js/webpo';
import { JSDOM } from 'jsdom';

const REQUEST_KEY='O43z0dpjhgX20SCx4KAo';

type BgChallenge={
  program:string;
  globalName:string;
  interpreterUrl:{privateDoNotAccessOrElseTrustedResourceUrlWrappedValue:string};
};

function extractObjectArgument(source:string,marker:string){
  const markerIndex=source.indexOf(marker);
  if(markerIndex<0)return '';
  const start=source.indexOf('{',markerIndex+marker.length);
  if(start<0)return '';
  let depth=0;
  let quote='';
  let escaped=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'){
      depth--;
      if(depth===0)return source.slice(start,i+1);
    }
  }
  return '';
}

export async function mintYoutubeVideoPoToken(videoId:string){
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error('PO_INVALID_VIDEO_ID');

  const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{
    url:'https://www.youtube.com/',
    referrer:'https://www.youtube.com/',
    userAgent:USER_AGENT,
  } as any);

  const page=await fetch('https://www.youtube.com/',{
    cache:'no-store',
    headers:{
      accept:'*/*',
      'accept-language':'en-US,en;q=0.8',
      'user-agent':USER_AGENT,
    },
  });
  if(!page.ok)throw new Error(`PO_HOMEPAGE_${page.status}`);
  const html=await page.text();

  const configText=extractObjectArgument(html,'ytcfg.set(');
  if(!configText)throw new Error('PO_YTCFG_MISSING');
  const config=JSON.parse(configText) as Record<string,unknown>;

  const win=dom.window as any;
  win.yt={config_:config};
  const globalObj=globalThis as any;
  Object.assign(globalObj,{
    yt:win.yt,
    window:win,
    document:win.document,
    location:win.location,
    origin:win.origin,
  });
  try{Object.defineProperty(globalObj,'navigator',{configurable:true,value:win.navigator});}catch{}

  const attestationText=extractObjectArgument(html,'window.ytAtN(');
  if(!attestationText)throw new Error('PO_CHALLENGE_MISSING');
  const attestation=parseLooseJSON(attestationText) as any;
  const challenge=attestation?.R?.bgChallenge as BgChallenge|undefined;
  if(!challenge?.program||!challenge?.globalName||!challenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue){
    throw new Error('PO_CHALLENGE_INVALID');
  }

  const interpreterPath=challenge.interpreterUrl.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  const interpreterUrl=interpreterPath.startsWith('//')?`https:${interpreterPath}`:new URL(interpreterPath,'https://www.youtube.com').toString();
  const scriptResponse=await fetch(interpreterUrl,{cache:'no-store',headers:{'user-agent':USER_AGENT}});
  if(!scriptResponse.ok)throw new Error(`PO_INTERPRETER_${scriptResponse.status}`);
  const interpreterJavascript=await scriptResponse.text();
  if(!interpreterJavascript)throw new Error('PO_INTERPRETER_EMPTY');
  new Function(interpreterJavascript)();

  const botGuard=await BotGuardClient.create({
    program:challenge.program,
    globalName:challenge.globalName,
    globalObject:globalObj,
  });
  const webPoSignalOutput:WebPoSignalOutput=[];
  const botguardResponse=await botGuard.snapshot({webPoSignalOutput});

  const integrityResponse=await fetch(buildURL('GenerateIT',true),{
    method:'POST',
    cache:'no-store',
    headers:getHeaders(),
    body:JSON.stringify([REQUEST_KEY,botguardResponse]),
  });
  if(!integrityResponse.ok)throw new Error(`PO_INTEGRITY_${integrityResponse.status}`);
  const values=await integrityResponse.json() as [string,number,number,string];
  const [integrityToken,estimatedTtlSecs,mintRefreshThreshold,websafeFallbackToken]=values;
  if(!integrityToken)throw new Error('PO_INTEGRITY_EMPTY');

  const minter=await WebPoMinter.create({
    integrityToken,
    estimatedTtlSecs,
    mintRefreshThreshold,
    websafeFallbackToken,
  },webPoSignalOutput);
  const token=await minter.mintAsWebsafeString(videoId);
  if(!token)throw new Error('PO_TOKEN_EMPTY');
  return token;
}
