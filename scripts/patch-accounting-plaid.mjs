import fs from 'node:fs';

const path='app/OperationsWorkspaces.tsx';
let source=fs.readFileSync(path,'utf8');
if(!source.includes("import FinancialConnections from './FinancialConnections';")){
  source=source.replace("import { useEffect, useMemo, useState } from 'react';", "import { useEffect, useMemo, useState } from 'react';\nimport FinancialConnections from './FinancialConnections';");
}
if(!source.includes('<FinancialConnections />')){
  const anchor="      {accountingSummary && (\n        <section className=\"panel\">\n          <p className=\"eyebrow\">Financials</p>";
  const idx=source.indexOf(anchor);
  if(idx<0) throw new Error('Accounting Financials anchor not found.');
  source=source.slice(0,idx)+"      {workspace === 'accounting' && <FinancialConnections />}\n\n"+source.slice(idx);
}
fs.writeFileSync(path,source);
console.log('Added Plaid financial connections to Accounting.');
