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
const marker = '/* PIE BRAND LAYER */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.pieStudioBrand{display:inline-flex!important;align-items:center!important;gap:7px!important;padding:6px 10px 6px 7px!important;font-weight:950!important;letter-spacing:.02em!important}.pieStudioBrand img{width:25px;height:25px;display:block;filter:drop-shadow(0 5px 10px rgba(0,0,0,.25))}.pieStudioBrand span{font-size:13px}.hero .pieStudioBrand+ .eyebrow{margin-top:12px}\n`;
  fs.writeFileSync(cssPath, css);
}
console.log('Applied Pie brand layer.');
