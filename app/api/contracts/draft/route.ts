import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../../security';

const contractTypes=[
  'Band Partnership / Operating Agreement','Artist Management Agreement','Producer Agreement','Featured Artist Agreement','Songwriter Split Sheet','Work-for-Hire / Contractor Agreement','Master Ownership / Assignment Agreement','Publishing Administration Agreement','Co-Publishing Agreement','Synchronization / Master Use License','Booking / Live Performance Agreement','Brand Endorsement / Sponsorship Agreement','Merchandise License Agreement','Distribution Agreement Review Draft','NDA / Confidentiality Agreement','IP Assignment / License Agreement','Collaboration Agreement','Tax + Accounting Professional Engagement Letter',
];

export async function POST(req:Request){
  const limited=rateLimit(req,'contract-draft',8,60_000);if(limited)return limited;
  try{
    const body=await readJsonObject(req,80_000);
    const contractType=textField(body.contractType,160);
    const jurisdiction=textField(body.jurisdiction,160,'Washington, USA');
    const parties=textField(body.parties,4000);
    const dealTerms=textField(body.dealTerms,12000);
    const protections=textField(body.protections,8000);
    const taxNotes=textField(body.taxNotes,5000);
    const ipNotes=textField(body.ipNotes,5000);
    const negotiationPosition=textField(body.negotiationPosition,5000);
    if(!contractTypes.includes(contractType))return NextResponse.json({error:'Choose a supported contract type.'},{status:400});
    if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:'Advanced contract drafting is temporarily unavailable.'},{status:503});

    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await client.responses.create({
      model:process.env.OPENAI_TEXT_MODEL||'gpt-5.6',
      input:[
        {role:'system',content:`You are Pie Legal Drafting, an advanced entertainment-contract drafting assistant. Draft with the rigor, issue-spotting, structure, precision, defined terms, fallback positions, negotiation awareness, tax sensitivity, and IP protection expected from sophisticated U.S. entertainment counsel. You are not a lawyer and must not claim to provide legal advice. Never imply that a draft is safe to sign without qualified counsel review. Where governing law, labor rules, securities rules, tax treatment, union rules, royalty/accounting rules, copyright termination rights, trademark rights, privacy, consumer law, or other jurisdiction-specific rules matter, identify them clearly. Prefer balanced but artist-protective drafting unless the user explicitly requests another posture. Avoid inventing facts. Use bracketed placeholders for missing deal facts. Include clear representations/warranties, indemnities where appropriate, audit/accounting, payment timing, ownership, licenses, approvals, credits, termination, cure, remedies, confidentiality, dispute resolution, notices, assignment, force majeure where relevant, survival, counterparts/e-signatures, entire agreement, amendments, severability, and governing law. For tax-related engagement documents, never draft tax advice; define scope, recordkeeping, information responsibilities, fees, confidentiality, reliance limits, and coordination with licensed tax professionals. For IP, distinguish composition, master, name/likeness, trademarks, artwork, audiovisual works, metadata, neighboring rights, and pre-existing materials where relevant.`},
        {role:'user',content:`Draft a sophisticated ${contractType}.\n\nJurisdiction / governing-law preference: ${jurisdiction}\nParties and roles:\n${parties||'[INSERT PARTIES]'}\n\nBusiness/deal terms:\n${dealTerms||'[INSERT DEAL TERMS]'}\n\nRequested protections:\n${protections||'Use strong but commercially reasonable artist/band protections.'}\n\nTax/accounting issues to address:\n${taxNotes||'Identify accounting, withholding, reporting, audit, expense, and tax-coordination issues that should be reviewed by a qualified professional.'}\n\nIP issues to address:\n${ipNotes||'Protect compositions, masters, name/likeness, artwork, trademarks, approvals, credits, and pre-existing IP as applicable.'}\n\nNegotiation posture:\n${negotiationPosition||'Artist-protective, commercially credible, with obvious one-sided provisions avoided unless necessary.'}\n\nReturn:\n1. EXECUTIVE ISSUE SPOTTER: major risks, negotiation points, tax/IP issues, missing facts, and terms that require licensed-counsel review.\n2. FULL CONTRACT DRAFT with numbered sections, defined terms, schedules/exhibits placeholders, signature blocks, and bracketed variables.\n3. NEGOTIATION NOTES: clauses likely to be contested, preferred position, reasonable fallback, and walk-away concerns.\n4. COUNSEL REVIEW CHECKLIST: jurisdiction-specific, tax, employment/union, securities/fundraising, privacy, copyright, trademark, and other legal questions needing professional confirmation.\n\nDo not call the document final, legally sufficient, or ready to sign.`}
      ],
      max_output_tokens:9000,
    });
    return NextResponse.json({text:response.output_text.slice(0,70000),disclaimer:'Drafting assistance only. Have qualified entertainment counsel and tax professionals review the agreement before signing or relying on it.'},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:safeClientError(error,'Contract drafting failed.')},{status:400});}
}
