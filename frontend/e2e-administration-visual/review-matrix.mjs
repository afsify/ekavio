// Generate contact sheets from sanitized presentation fixtures only.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory=resolve('test-results/administration-visual');
const source=await readFile('e2e-administration-visual/matrix.spec.ts','utf8');
const journeys=[...new Set([...source.matchAll(/(?:shot|review)\('([^']+)'\)/g)].map(m=>m[1]))];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1800,height:1000}});
 const sheet=async(names,target)=>{
  const cards=await Promise.all(names.map(async filename=>`<section><h2>${filename}</h2><img alt="${filename}" src="data:image/png;base64,${(await readFile(resolve(directory,filename))).toString('base64')}"></section>`));
  await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(6,288px);gap:10px}h2{font-size:12px;overflow-wrap:anywhere}img{width:288px;height:450px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode())));
  await page.screenshot({path:resolve(directory,target),fullPage:true});
 };
 for(const width of [320,360,390,430,768,1024,1440,1920])for(const theme of ['light','dark','system'])await sheet(journeys.map(name=>`${width}-${theme}-${name}.png`),`matrix-${width}-${theme}.png`);
 for(const width of [390,1440])await sheet(['branches','roles','staff','hr','reports','notifications','billing'].flatMap(path=>['readonly','empty','error'].map(state=>`${width}-${path}-${state}.png`)),`states-${width}.png`);
 console.log(`Rendered 24 matrices × ${journeys.length} loaded journeys, plus two state sheets. Original images remain available for text/control inspection.`);
}finally{await browser.close();}
