import fs from 'node:fs';

const path='app/OperationsWorkspaces.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import StablecoinPaymentsPanel from './StablecoinPaymentsPanel';")){
  if(source.includes("import PlaidConnectPanel from './PlaidConnectPanel';")){
    source=source.replace("import PlaidConnectPanel from './PlaidConnectPanel';", "import PlaidConnectPanel from './PlaidConnectPanel';\nimport StablecoinPaymentsPanel from './StablecoinPaymentsPanel';");
  } else {
    source=source.replace("import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';\nimport StablecoinPaymentsPanel from './StablecoinPaymentsPanel';");
  }
}

if(!source.includes('<StablecoinPaymentsPanel')){
  const compactAnchor="{workspace==='accounting'&&<><PlaidConnectPanel/><FinancialIntelligencePanel/></>}";
  const spacedAnchor="{workspace === 'accounting' && <PlaidConnectPanel />}";
  if(source.includes(compactAnchor)){
    source=source.replace(compactAnchor,"{workspace==='accounting'&&<><PlaidConnectPanel/><FinancialIntelligencePanel/><StablecoinPaymentsPanel/></>}");
  } else if(source.includes(spacedAnchor)) {
    source=source.replace(spacedAnchor,`${spacedAnchor}\n      {workspace === 'accounting' && <StablecoinPaymentsPanel />}`);
  } else {
    throw new Error('Accounting Plaid anchor not found for stablecoin panel.');
  }
}

fs.writeFileSync(path,source);
console.log('Added stablecoin payment planning to Accounting.');
