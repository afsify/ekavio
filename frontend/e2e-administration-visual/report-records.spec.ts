import {test,expect} from '@playwright/test';
import {administrationFixture} from './fixtures';
import {fits} from '../e2e-operations-visual/fixtures';

// Inspect the actual result values, not only the heading above a long page.
for(const width of [320,360,390,430,768,1024,1440,1920]) for(const theme of ['light','dark','system']) test(`loaded report values ${width}px ${theme}`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await administrationFixture(page);await page.addInitScript(mode=>localStorage.setItem('ekavio-ui-preferences',JSON.stringify({mode,primaryColor:'#4F46E5'})),theme);
  await page.goto('/reports');await expect(page.locator('html')).toHaveAttribute('data-theme',theme==='system'?'dark':theme);
  const value=page.getByText('QA report customer with an extended descriptive name',{exact:true}).filter({visible:true});
  await expect(value).toBeVisible();await value.scrollIntoViewIfNeeded();await expect(value).toBeInViewport();await fits(page);
  await page.screenshot({path:`test-results/administration-visual/${width}-${theme}-report-records.png`});
});
