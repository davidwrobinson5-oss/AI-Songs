import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes('function pieLeadVoiceLock(')){
  const anchor='function productionPrompt(score:Score,parts:ScorePart[],full:boolean){';
  if(!source.includes(anchor)) throw new Error('Render selection lock could not find productionPrompt anchor.');
  const helper=`function pieLeadVoiceLock(vocalRange:string,parts:ScorePart[]){\n  const target=String(vocalRange||'Baritone').trim();\n  const hasLead=parts.some(part=>part.isVocal&&!part.choirRole);\n  if(!hasLead)return '';\n  const profiles:Record<string,{voice:string;exclude:string}>={\n    Bass:{voice:'adult male bass lead singer with a true low bass register',exclude:'female, alto, soprano, tenor, or high male lead'},\n    Baritone:{voice:'adult male baritone lead singer with a warm low-to-mid male register',exclude:'female, alto, soprano, tenor, falsetto, or high male lead'},\n    Tenor:{voice:'adult male tenor lead singer with a true tenor register',exclude:'female, alto, soprano, baritone, or bass lead'},\n    Alto:{voice:'adult female alto lead singer with a true low female alto register',exclude:'male, tenor, baritone, bass, or soprano lead'},\n    Soprano:{voice:'adult female soprano lead singer with a true soprano register',exclude:'male, tenor, baritone, bass, or alto lead'},\n  };\n  const profile=profiles[target]||profiles.Baritone;\n  return \\`LEAD VOCAL LOCK: The lead vocalist MUST be an \\${profile.voice}. Do not substitute a \\${profile.exclude}. Keep the lead melody inside the selected \\${target} range. If choir parts are included, choir singers may keep their written SATB roles, but they must not replace or change the lead vocalist.\\`;\n}\n\nfunction pieMandatorySettings(score:Score,parts:ScorePart[],analysisPlan:string,vocalRange:string){\n  const names=parts.map(partLabel).join(', ')||'Full Arrangement';\n  const plan=analysisPlan.trim();\n  return \\`MANDATORY PIE RENDER SETTINGS — DO NOT OVERRIDE OR SUBSTITUTE THEM. Selected lead vocal range: \\${vocalRange}. Selected/rendered parts: \\${names}. The selected Pie settings for key, transposition, BPM, time signature, render mode, parts, and vocal target take priority over conflicting defaults or creative choices. Preserve the written song identity, note contour, harmony, timing, and structure. \\${pieLeadVoiceLock(vocalRange,parts)}\\${plan?\\`\\nPIE ANALYSIS SETTINGS (MANDATORY):\\n\\${plan}\\`:''}\\`;\n}\n\n`;
  source=source.replace(anchor,helper+anchor);
}

source=source.replace(
  "async function productionRender(score:Score,parts:ScorePart[],full:boolean,analysisPlan=''){",
  "async function productionRender(score:Score,parts:ScorePart[],full:boolean,analysisPlan='',vocalRange='Baritone'){"
);

const oldPrompt="  const basePrompt=productionPrompt(score,parts,full);\n  const prompt=analysisPlan.trim()?`${basePrompt}\\n\\nPIE ANALYSIS SETTINGS\\n${analysisPlan}`:basePrompt;";
const newPrompt="  const basePrompt=productionPrompt(score,parts,full);\n  const requiredSettings=pieMandatorySettings(score,parts,analysisPlan,vocalRange);\n  const prompt=`${requiredSettings}\\n\\n${basePrompt}`;";
if(source.includes(oldPrompt)) source=source.replace(oldPrompt,newPrompt);
else if(!source.includes('const requiredSettings=pieMandatorySettings(')) throw new Error('Render selection lock could not find production render prompt anchor.');

source=source.replaceAll(
  'productionRender(score,[part],false,analysisPlan)',
  'productionRender(score,[part],false,analysisPlan,vocalRange)'
);
source=source.replaceAll(
  'productionRender(score,parts,true,analysisPlan)',
  'productionRender(score,parts,true,analysisPlan,vocalRange)'
);

fs.writeFileSync(path,source);
console.log('Locked Sheets rendering to selected Pie vocal and musical settings.');
