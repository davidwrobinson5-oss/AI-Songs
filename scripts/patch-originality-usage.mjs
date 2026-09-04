import fs from 'node:fs';

const path='app/api/originality-score/route.ts';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("from '../../billingConfig'")){
  source=source.replace("import { NextResponse } from 'next/server';", "import { NextResponse } from 'next/server';\nimport { FREE_LIMITS } from '../../billingConfig';\nimport { consumeUsage, usageDeniedMessage } from '../../usageEntitlements';");
}

const tryAnchor='  try {\n    const body = await readJsonObject(req, 96_000);';
if(!source.includes("consumeUsage('originality_scores'")){
  if(!source.includes(tryAnchor)) throw new Error('Originality route try anchor not found.');
  source=source.replace(tryAnchor, `  try {\n    const entitlement = await consumeUsage('originality_scores', FREE_LIMITS.originalityScoresPerMonth);\n    if (!entitlement.allowed) {\n      return NextResponse.json({\n        error: usageDeniedMessage('originality scans', entitlement),\n        code: 'PIE_USAGE_LIMIT',\n        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },\n      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });\n    }\n\n    const body = await readJsonObject(req, 96_000);`);
}

const returnAnchor="      disclaimer: 'Originality Score is a similarity-risk estimate, not copyright clearance or a legal opinion. Fingerprint matches are strongest for same/near-same recordings; melodic and harmonic analysis are heuristic and can miss transformations, covers, interpolations, or similarities outside the catalogs Pie can lawfully query.',";
if(!source.includes('pieUsage: { count: entitlement.usageCount')){
  if(!source.includes(returnAnchor)) throw new Error('Originality response anchor not found.');
  source=source.replace(returnAnchor, `${returnAnchor}\n      pieUsage: { count: entitlement.usageCount, limit: entitlement.usageLimit },\n      pieOutputQuality: entitlement.outputQuality,`);
}

fs.writeFileSync(path,source);
console.log('Added server-side Originality Score usage enforcement.');
