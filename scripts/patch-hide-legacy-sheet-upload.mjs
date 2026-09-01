import fs from 'node:fs';

const path='app/SheetImportTools.tsx';
let source=fs.readFileSync(path,'utf8');

const marker='<p className="eyebrow">Sheet → Song</p><h2>Upload Music Sheets</h2>';
const markerIndex=source.indexOf(marker);
if(markerIndex===-1) throw new Error('Legacy sheet upload hide patch could not find Sheet → Song marker.');

const card='<div className="sheetSourceCard">';
const cardIndex=source.lastIndexOf(card,markerIndex);
if(cardIndex===-1) throw new Error('Legacy sheet upload hide patch could not find the sheet upload card.');

const replacement='<div className="sheetSourceCard" style={{display:\'none\'}} aria-hidden="true">';
source=source.slice(0,cardIndex)+replacement+source.slice(cardIndex+card.length);

fs.writeFileSync(path,source);
console.log('Removed legacy Sheet → Song upload card from the visible Sheets UI.');
