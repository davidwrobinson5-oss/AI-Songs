import fs from 'node:fs';

const path='app/OperationsWorkspaces.tsx';
let source=fs.readFileSync(path,'utf8');
if(!source.includes("import FinancialConnections from './FinancialConnections';")){
  source=source.replace("import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';\nimport FinancialConnections from './FinancialConnections';");
}
if(!source.includes("import StablecoinPaymentsPanel from './StablecoinPaymentsPanel';")){
  source=source.replace("import FinancialConnections from './FinancialConnections';", "import FinancialConnections from './FinancialConnections';\nimport StablecoinPaymentsPanel from './StablecoinPaymentsPanel';");
}
if(!source.includes('<FinancialConnections />')){
  const anchor="      {accountingSummary && (\n        <section className=\"panel\">\n          <p className=\"eyebrow\">Financials</p>";
  const idx=source.indexOf(anchor);
  if(idx<0) throw new Error('Accounting Financials anchor not found.');
  source=source.slice(0,idx)+"      {workspace === 'accounting' && <FinancialConnections />}\n\n"+source.slice(idx);
}
if(!source.includes('<StablecoinPaymentsPanel />')){
  const plaidAnchor="      {workspace === 'accounting' && <FinancialConnections />}";
  const directAnchor="      {workspace === 'accounting' && <PlaidConnectPanel />}";
  if(source.includes(plaidAnchor)) source=source.replace(plaidAnchor,`${plaidAnchor}\n      {workspace === 'accounting' && <StablecoinPaymentsPanel />}`);
  else if(source.includes(directAnchor)) source=source.replace(directAnchor,`${directAnchor}\n      {workspace === 'accounting' && <StablecoinPaymentsPanel />}`);
  else throw new Error('Accounting connection anchor not found for stablecoin panel.');
}
fs.writeFileSync(path,source);
console.log('Added Plaid financial connections and stablecoin payment planning to Accounting.');
