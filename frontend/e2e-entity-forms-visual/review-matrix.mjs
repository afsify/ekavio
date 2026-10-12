// All images are sanitized presentation DTOs, never private browser fixtures.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'test-results/entity-forms-visual-batch3');
const states = ['customer-editor','customer-native','customer-choices','customer-history','customer-edit','service-editor','service-native','service-review','service-discard','service-history','lead-editor','lead-native','lead-history','lead-conversion','appointment-history','appointment-editor','appointment-native','inventory-history','inventory-editor','inventory-native','membership-history','membership-editor','membership-native'];
const browser = await chromium.launch();
try {
 const page = await browser.newPage({viewport:{width:1460,height:1000}});
 for(const width of [320,360,390,430,768,1024,1440,1920])for(const theme of ['light','dark','system']) {
  const cards=await Promise.all(states.map(async state=>{const name=`${width}-${theme}-${state}.png`;return `<section><h2>${name}</h2><img alt="${name}" src="data:image/png;base64,${(await readFile(resolve(directory,name))).toString('base64')}"></section>`;}));
  await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(3,470px);gap:10px}h2{font-size:13px}img{width:470px;height:600px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
  await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await page.screenshot({path:resolve(directory,`matrix-${width}-${theme}.png`),fullPage:true});
 }
 console.log('Rendered 24 loaded six-entity matrices; 23 original states per width/theme retained.');
} finally {await browser.close();}
