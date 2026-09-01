import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const inputMarkers=[
  '<input ref={scoreInput}',
  'ref={scoreInput}',
  'scoreInput.current?.click()',
];

let markerIndex=-1;
for(const marker of inputMarkers){
  markerIndex=source.indexOf(marker);
  if(markerIndex!==-1)break;
}
if(markerIndex===-1){
  console.log('Legacy sheet upload card already removed or score upload anchor no longer present.');
  process.exit(0);
}

const cardMarkers=[
  '<div className="sheetSourceCard">',
  '<div className="sheetSourceCard" ',
];
let cardIndex=-1;
let matchedCard='';
for(const card of cardMarkers){
  const idx=source.lastIndexOf(card,markerIndex);
  if(idx>cardIndex){cardIndex=idx;matchedCard=card;}
}
if(cardIndex===-1) throw new Error('Could not locate the score-upload card surrounding scoreInput.');

if(source.slice(cardIndex,cardIndex+180).includes("display:'none'")){
  console.log('Legacy Sheet → Song upload card is already hidden.');
  process.exit(0);
}

if(matchedCard==='<div className="sheetSourceCard">'){
  const replacement='<div className="sheetSourceCard" style={{display:\'none\'}} aria-hidden="true">';
  source=source.slice(0,cardIndex)+replacement+source.slice(cardIndex+matchedCard.length);
}else{
  const openEnd=source.indexOf('>',cardIndex);
  if(openEnd===-1) throw new Error('Could not locate end of score-upload card opening tag.');
  const opening=source.slice(cardIndex,openEnd+1);
  const replacement=opening.replace('>',' style={{display:\'none\'}} aria-hidden="true">');
  source=source.slice(0,cardIndex)+replacement+source.slice(openEnd+1);
}

fs.writeFileSync(path,source);
console.log('Removed legacy Sheet → Song upload card from the visible Sheets UI.');
