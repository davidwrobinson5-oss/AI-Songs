import { NextResponse } from 'next/server';
import { financeAction, plaidConfigured } from '../../../plaidServer';

export async function GET(){
  try{
    const {data}=await financeAction('list');
    return NextResponse.json({configured:plaidConfigured(),...data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load financial connections.'},{status:400});}
}
