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

if(!source.includes('<StablecoinPaymentsPanel />')){
  const directAnchor="      {workspace === 'accounting' && <PlaidConnectPanel />}";
  if(source.includes(directAnchor)){
    source=source.replace(directAnchor,`${directAnchor}\n      {workspace === 'accounting' && <StablecoinPaymentsPanel />}`);
  } else {
    const heroEnd='      </section>\n\n';
    const idx=source.indexOf(heroEnd,source.indexOf('<section className="hero">'));
    if(idx<0) throw new Error('Accounting workspace anchor not found for stablecoin panel.');
    const insertAt=idx+heroEnd.length;
    source=source.slice(0,insertAt)+"      {workspace === 'accounting' && <StablecoinPaymentsPanel />}\n\n"+source.slice(insertAt);
  }
}

fs.writeFileSync(path,source);
console.log('Added stablecoin payment planning to Accounting.');
