import { NextRequest, NextResponse } from 'next/server';
import { connectionSecret, financeAction, plaidRequest } from '../../../plaidServer';

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const connectionId=String(body?.connectionId||'');
    if(!connectionId)return NextResponse.json({error:'Missing financial connection.'},{status:400});
    const token=await connectionSecret(connectionId);
    try{await plaidRequest('/item/remove',{access_token:token});}catch(error){console.warn('Plaid item remove failed; removing local connection anyway.',error);}
    await financeAction('deleteConnection',{connectionId});
    return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not disconnect financial account.'},{status:400});}
}
