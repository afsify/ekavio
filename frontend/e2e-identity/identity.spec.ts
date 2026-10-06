import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const api='http://127.0.0.1:5011';
interface Fixture { phone:string; email:string; password:string }
let fixture:Fixture;
let pageErrors:string[];
test.beforeEach(async ({request,page}) => {
  const response=await request.post(`${api}/__test/fixture`); expect(response.ok()).toBeTruthy(); fixture=await response.json();
  pageErrors=[]; page.on('pageerror',(error) => pageErrors.push(error.name));
});
test.afterEach(() => expect(pageErrors).toEqual([]));
const login=async(page:Page,identifier=fixture.phone,password=fixture.password) => {
  await page.goto('/login'); await page.getByLabel('Phone or email').fill(identifier); await page.getByLabel('Password',{exact:true}).fill(password); await page.getByRole('button',{name:'Sign In to Ekavio'}).click(); await expect(page).toHaveURL(/dashboard/);
};
const logout=async(page:Page) => { await page.getByRole('button',{name:'Sign out',exact:true}).click(); await expect(page).toHaveURL(/login/); };
const verify=async(page:Page,email=fixture.email) => {
  await page.goto('/settings'); await page.getByLabel('New email').fill(email); await page.getByRole('button',{name:'Send verification',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Check your email');
  const messages=await (await page.request.get(`${api}/__test/mail`)).json() as Array<{purpose:string;url:string}>;
  await page.goto(messages.findLast((message) => message.purpose==='email_verification')!.url);
  await expect(page).toHaveURL(/verify-email$/); await page.getByRole('button',{name:'Verify email',exact:true}).click(); await expect(page.getByRole('status')).toContainText('Email verified');
};
test('phone and case-insensitive verified email login use actual PostgreSQL sessions',async({page}) => {
  await login(page); await verify(page); await page.goto('/settings'); await expect(page.getByText(`Verified: ${fixture.email}`,{exact:true})).toBeVisible();
  await logout(page); await login(page,fixture.email.toUpperCase());
});
test('unknown and wrong credentials show generic failures',async({page}) => {
  await page.goto('/login'); await page.getByLabel('Phone or email').fill('unknown@example.invalid'); await page.getByLabel('Password',{exact:true}).fill(randomUUID()); await page.getByRole('button',{name:'Sign In to Ekavio'}).click(); await expect(page.getByText('Invalid credentials',{exact:true})).toBeVisible();
  await page.getByLabel('Phone or email').fill(fixture.phone); await page.getByRole('button',{name:'Sign In to Ekavio'}).click(); await expect(page.getByText('Invalid credentials',{exact:true}).first()).toBeVisible();
});
test('captured recovery resets once, revokes prior browser session and permits new password',async({page,browser}) => {
  await page.setViewportSize({width:390,height:900});
  await login(page); await verify(page);
  const recovery=await browser.newContext({viewport:{width:390,height:900}}); const recoveryPage=await recovery.newPage();
  await recoveryPage.goto('http://127.0.0.1:4175/forgot-password'); await recoveryPage.getByLabel('Phone or email').fill(fixture.phone); await recoveryPage.getByRole('button',{name:'Send reset link'}).click(); await expect(recoveryPage.getByRole('status')).toContainText('If this account has a verified email');
  const messages=await (await page.request.get(`${api}/__test/mail`)).json() as Array<{purpose:string;url:string}>;
  const link=messages.findLast((message) => message.purpose==='password_reset')!.url;
  await recoveryPage.goto(link); await expect(recoveryPage).toHaveURL(/reset-password$/);
  const password=randomUUID(); await recoveryPage.getByLabel('New password',{exact:true}).fill(password); await recoveryPage.getByLabel('Confirm password').fill(password); await recoveryPage.getByRole('button',{name:'Reset password',exact:true}).click(); await expect(recoveryPage.getByRole('status')).toContainText('Password reset');
  await page.goto('/settings'); await expect(page).toHaveURL(/login/); await login(page,fixture.email,password);
  await recoveryPage.goto(link); await expect(recoveryPage.getByRole('alert')).toContainText('already used'); await recovery.close();
});
for(const mode of ['light','dark','system'] as const) test(`${mode} preference persists to a fresh device context`,async({page,browser}) => {
  await login(page); await page.goto('/settings?section=appearance');
  const saved=page.waitForResponse((response) => response.url().endsWith('/auth/preferences') && response.request().method()==='PUT');
  await page.getByRole('radio',{name:new RegExp(mode,'i')}).click(); await saved;
  const accent=page.waitForResponse((response) => response.url().endsWith('/auth/preferences') && response.request().method()==='PUT');
  await page.getByRole('button',{name:'Forest',exact:true}).click(); await accent; await logout(page);
  const context=await browser.newContext({colorScheme:'dark'}); const device=await context.newPage();
  await login(device); await device.goto('/settings?section=appearance'); await expect(device.getByRole('radio',{name:new RegExp(mode,'i')})).toBeChecked(); await expect(device.getByRole('button',{name:'Forest',exact:true})).toHaveAttribute('aria-pressed','true');
  if(mode==='system') { await expect(device.locator('html')).toHaveAttribute('data-theme','dark'); await device.emulateMedia({colorScheme:'light'}); await expect(device.locator('html')).toHaveAttribute('data-theme','light'); }
  await context.close();
});
test('staff email invitation accepts own password, limits navigation and rejects reuse',async({page,browser}) => {
  await login(page); await page.goto('/staff'); await page.getByRole('button',{name:'Invite staff',exact:true}).click();
  await expect(page.getByLabel(/password/i)).toHaveCount(0); await page.getByLabel('Full name').fill('Disposable QA staff'); await page.getByLabel('Phone number',{exact:true}).fill('9876543298');
  const email=`${randomUUID()}@example.invalid`; await page.getByLabel('Email (optional)').fill(email); await page.getByRole('button',{name:'Send invitation',exact:true}).click(); await expect(page.getByText('Disposable QA staff',{exact:true})).toBeVisible();
  const messages=await (await page.request.get(`${api}/__test/mail`)).json() as Array<{purpose:string;url:string}>; const link=messages.findLast((message) => message.purpose==='staff_invitation')!.url;
  const context=await browser.newContext(); const staff=await context.newPage(); await staff.goto(link); const password=randomUUID(); await staff.getByLabel('New password',{exact:true}).fill(password); await staff.getByLabel('Confirm password').fill(password); await staff.getByRole('button',{name:'Accept invitation'}).click(); await expect(staff.getByRole('status')).toContainText('Account ready');
  await login(staff,email,password); await staff.goto('/staff'); await expect(staff.getByRole('button',{name:'Invite staff',exact:true})).toHaveCount(0); await expect(staff.getByRole('link',{name:'Commercial Intake',exact:true})).toHaveCount(0);
  await staff.goto(link); await expect(staff.getByRole('alert')).toContainText('already used'); await context.close();
});
test('manual staff invitation is shown once, cleared on close and accepted without email authority',async({page,browser}) => {
  await login(page); await page.goto('/staff'); await page.getByRole('button',{name:'Invite staff',exact:true}).click();
  await page.getByLabel('Full name').fill('Disposable manual staff'); await page.getByLabel('Phone number',{exact:true}).fill('9876543299');
  await page.getByRole('button',{name:'Send invitation',exact:true}).click();
  const handoff=page.getByLabel('One-time handoff link'); await expect(handoff).toBeVisible(); const link=await handoff.inputValue();
  await page.getByRole('button',{name:'I have handed off the link'}).click(); await expect(handoff).toHaveCount(0);
  await page.reload(); await expect(handoff).toHaveCount(0);
  const context=await browser.newContext(); const staff=await context.newPage(); await staff.goto(link); const password=randomUUID();
  await staff.getByLabel('New password',{exact:true}).fill(password); await staff.getByLabel('Confirm password').fill(password); await staff.getByRole('button',{name:'Accept invitation'}).click(); await expect(staff.getByRole('status')).toContainText('Account ready');
  await login(staff,'+919876543299',password); await staff.goto('/settings'); await expect(staff.getByText('No verified email.',{exact:false})).toBeVisible(); await context.close();
});
for(const width of [390,768,1440]) test(`authentication and recovery fit ${width}px without overflow`,async({page}) => {
  await page.setViewportSize({width,height:900});
  for(const route of ['/login','/forgot-password','/reset-password','/verify-email','/accept-invitation']) {
    await page.goto(route); await expect(page.getByRole('heading',{level:1})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.screenshot({path:`test-results/identity/safe-${route.slice(1)}-${width}.png`});
  }
});
