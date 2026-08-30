import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

page = page.replaceAll(
  '<div className="brand">AI SONGS</div>',
  '<div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>'
);
page = page.replaceAll('Your cloud music studio', 'Your music kitchen');
page = page.replaceAll('AI Songs', 'Pie');
fs.writeFileSync(pagePath, page);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const oldMarker = '/* PIE BRAND LAYER */';
const approvedMarker = '/* PIE BRAND APPROVED HORIZONTAL */';
if (!css.includes(approvedMarker)) {
  const oldIndex = css.indexOf(oldMarker);
  if (oldIndex >= 0) css = css.slice(0, oldIndex).trimEnd() + '\n';
  css += `\n${approvedMarker}\n.pieStudioBrand{display:block!important;position:relative!important;width:min(100%,650px)!important;height:auto!important;aspect-ratio:700/175!important;margin:0 0 18px!important;padding:0!important;border:0!important;border-radius:0!important;background:url('/pieinears-horizontal.svg') left center/contain no-repeat!important;box-shadow:none!important;font-size:0!important;letter-spacing:0!important;color:transparent!important}.pieStudioBrand img,.pieStudioBrand span{display:none!important}.hero .pieStudioBrand+ .eyebrow{margin-top:16px!important}.heroAlbum{background:#05070A url('/pieinears-logo.svg') center/92% auto no-repeat!important;border:1px solid rgba(243,154,31,.58)!important;transform:none!important}.heroAlbum:before,.heroAlbum:after,.heroAlbum span,.heroAlbum b{display:none!important}@media(max-width:430px){.pieStudioBrand{width:calc(100% - 8px)!important;max-width:620px!important;margin-bottom:16px!important}}\n`;
  fs.writeFileSync(cssPath, css);
}
console.log('Applied approved horizontal Pieinears brand layer.');
