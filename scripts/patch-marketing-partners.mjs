import fs from 'node:fs';

const file = 'app/GrowthWorkspaces.tsx';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes("import MarketingPartners from './MarketingPartners';")) {
  source = source.replace(
    "import { useEffect, useMemo, useState } from 'react';",
    "import { useEffect, useMemo, useState } from 'react';\nimport MarketingPartners from './MarketingPartners';",
  );
}

const anchor = `      {workspace === 'marketing' && (\n        <section className=\"panel\" style={{ display: 'grid', gap: 12 }}>\n          <div>\n            <p className=\"eyebrow\">Partnership Revenue</p>`;

if (!source.includes('<MarketingPartners />')) {
  if (!source.includes(anchor)) throw new Error('Marketing insertion anchor not found');
  source = source.replace(
    anchor,
    `      {workspace === 'marketing' && <MarketingPartners />}\n\n${anchor}`,
  );
}

fs.writeFileSync(file, source);
console.log('Marketing partner workspace wired into GrowthWorkspaces');
