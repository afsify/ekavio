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
const logout = async (page: Page) => {
  const completion = page.waitForResponse(response =>
    response.url() === api + '/api/auth/logout' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const response = await completion;
  expect(response.status()).toBe(200);
  expect(await response.finished()).toBeNull();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Sign In to Ekavio', exact: true })).toBeEnabled();
};
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
for (const theme of ['Light', 'Dark', 'System']) test(`committed refresh response loss requires explicit sign-in in ${theme}`, async ({ page, request }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await login(page);
  await page.goto('/settings?section=appearance');
  await page.getByRole('radio', { name: theme, exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Light' ? 'light' : 'dark');
  const endpoint = `${api}/api/auth/refresh`;
  const previous = (await page.context().cookies(endpoint)).find(cookie => cookie.name === 'ekavio_refresh');
  expect(Boolean(previous?.httpOnly)).toBe(true);

  let interrupted = false;
  await page.route(endpoint, async route => {
    if (interrupted || route.request().method() !== 'POST') return route.continue();
    interrupted = true;
    // Commit a real rotation in a separate request context. The browser never
    // receives its replacement cookie or access token.
    const completed = await request.post(endpoint, {
      headers: { cookie: `${previous!.name}=${previous!.value}` },
    }).catch(() => { throw new Error('Disposable refresh could not complete'); });
    expect(completed.status()).toBe(200);
    expect(completed.headersArray().some(header => header.name.toLowerCase() === 'set-cookie')).toBe(true);
    await completed.dispose();
    await route.abort('connectionfailed');
  });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'We couldn’t reach your workspace' })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(page.getByRole('status')).toContainText('does not mean your session has expired');
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
  const retained = (await page.context().cookies(endpoint)).find(cookie => cookie.name === 'ekavio_refresh');
  expect(retained?.value === previous?.value).toBe(true);

  const rejected = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'POST');
  await retry.focus();
  await page.keyboard.press('Enter');
  expect((await rejected).status()).toBe(401);
  await expect(page).toHaveURL(/\/login$/);
  const notice = page.getByRole('main').getByRole('status');
  await expect(notice).toContainText('Sign in again to continue.');
  await expect(notice).toContainText('check the record before trying again.');
  await expect(notice).toBeFocused();
  await expect(notice).toHaveCSS('outline-width', '2px');
  await expect(notice).toHaveCSS('animation-name', 'none');
  for (const width of [320, 390, 768, 1440]) {
    await test.step(`${width}px recovery notice`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Light' ? 'light' : 'dark');
      await expect(notice).toBeVisible();
      expect(await notice.evaluate(node => document.documentElement.scrollWidth <= innerWidth &&
        node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true);
      const ratio = await notice.evaluate(node => {
        const { color, backgroundColor } = getComputedStyle(node);
        const luminance = (rgb: string) => {
          const [r, g, b] = (rgb.match(/\d+/g) ?? []).slice(0, 3).map(channel => {
            const value = Number(channel) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const foreground = luminance(color), background = luminance(backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Phone or email')).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  expect((await page.context().cookies(endpoint)).some(cookie => cookie.name === 'ekavio_refresh')).toBe(false);

  await page.getByLabel('Phone or email').fill(fixture.phone);
  await page.getByLabel('Password', { exact: true }).fill(fixture.password);
  await page.getByRole('button', { name: 'Sign In to Ekavio' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
test('refresh interrupted before reaching PostgreSQL recovers through one explicit retry', async ({ page }) => {
  await login(page);
  const endpoint = `${api}/api/auth/refresh`;
  let attempts = 0;
  await page.route(endpoint, route => {
    if (route.request().method() !== 'POST') return route.continue();
    return ++attempts === 1 ? route.abort('connectionfailed') : route.continue();
  });
  await page.reload();
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await expect(page.getByRole('status')).toContainText('does not mean your session has expired');
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toHaveCount(0);
  const completed = page.waitForResponse(response => response.url() === endpoint && response.request().method() === 'POST');
  await retry.click();
  expect((await completed).status()).toBe(200);
  await expect(page.getByRole('complementary', { name: 'Workspace sidebar' })).toBeVisible();
  expect(attempts).toBe(2);
});
test('pending email with the correct password gets the generic sign-in error', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await page.getByLabel('New email').fill(fixture.email);
  await page.getByRole('button', { name: 'Send verification', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await logout(page);

  const identifier = page.getByRole('textbox', { name: 'Phone or email' });
  await identifier.fill(fixture.email);
  await expect(identifier).toHaveAccessibleDescription('Use your phone number or verified email address to sign in.');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill(fixture.password);
  await password.press('Enter');
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('Invalid credentials');
  await expect(page).toHaveURL(/\/login$/);
});

test('unknown and wrong credentials show generic failures',async({page}) => {
  await page.goto('/login'); await page.getByLabel('Phone or email').fill('unknown@example.invalid'); await page.getByLabel('Password',{exact:true}).fill(randomUUID()); await page.getByRole('button',{name:'Sign In to Ekavio'}).click(); await expect(page.getByRole('main').getByText('Invalid credentials',{exact:true})).toBeVisible();
  await page.getByLabel('Phone or email').fill(fixture.phone); await page.getByRole('button',{name:'Sign In to Ekavio'}).click(); await expect(page.getByRole('main').getByText('Invalid credentials',{exact:true})).toBeVisible();
});
test('committed Profile A response cannot rename Account B after sign out and sign in',async({page,request}) => {
  const other=await (await request.post(`${api}/__test/fixture`)).json() as Fixture;
  await login(page); await page.goto('/settings');
  let release!:()=>void; const held=new Promise<void>(resolve=>{release=resolve;});
  let committedStatus=0,finished=false;
  await page.route('**/api/profile',async route=>{
    if(route.request().method()!=='PUT'){await route.continue();return;}
    const response=await route.fetch(); committedStatus=response.status(); await held;
    try { await route.fulfill({response}); } catch { /* Account departure aborts the old browser request. */ }
    finally { finished=true; }
  });
  try {
    await page.getByLabel('Your name').fill('QA original profile committed');
    await page.getByRole('button',{name:'Save profile'}).click();
    await expect.poll(()=>committedStatus).toBe(200);
    await logout(page); await login(page,other.phone,other.password);
    await page.goto('/settings'); release(); await expect.poll(()=>finished).toBe(true);
    await expect(page.getByLabel('Your name')).toHaveValue('QA owner');
    await expect(page.getByRole('link',{name:'Open my profile'})).toHaveText('QA owner');
    const original=await request.post(`${api}/api/auth/login`,{data:{phone:fixture.phone,password:fixture.password}});
    expect(original.status()).toBe(200); expect((await original.json()).user.name).toBe('QA original profile committed');
  } finally { release(); }
});
test('authorized password change revokes sessions and requires the new password',async({page}) => {
  await login(page); await page.goto('/settings?section=security');
  await page.getByRole('button',{name:'Change password',exact:true}).click();
  const password=randomUUID();
  await page.getByLabel('Current Password').fill(fixture.password);
  await page.getByLabel('New Password',{exact:true}).fill(password);
  await page.getByLabel('Confirm New Password').fill(password);
  await page.getByRole('button',{name:'Update Password'}).click();
  await expect(page).toHaveURL(/login$/);
  const old=await page.request.post(`${api}/api/auth/login`,{data:{phone:fixture.phone,password:fixture.password}});
  expect(old.status()).toBe(401);
  await login(page,fixture.phone,password); await page.reload();
  await expect(page.getByRole('link',{name:'Open my profile'})).toHaveText('QA owner');
});
test('committed Account A password response cannot clear Account B session or refresh cookie',async({page,request}) => {
  const response=await request.post(`${api}/__test/fixture`); expect(response.status()).toBe(200);
  const other=await response.json() as Fixture;
  await login(page); await page.goto('/settings?section=security');
  let release!:()=>void; const held=new Promise<void>(resolve=>{release=resolve;});
  let committedStatus=0,finished=false;
  await page.route('**/api/profile/password',async route=>{
    const result=await route.fetch(); committedStatus=result.status(); await held;
    try { await route.fulfill({response:result}); } catch { /* Old account departure aborts its request. */ }
    finally { finished=true; }
  });
  try {
    await page.getByRole('button',{name:'Change password',exact:true}).click();
    await page.getByLabel('Current Password').fill(fixture.password);
    await page.getByLabel('New Password',{exact:true}).fill(randomUUID());
    const password=await page.getByLabel('New Password',{exact:true}).inputValue();
    await page.getByLabel('Confirm New Password').fill(password);
    await page.getByRole('button',{name:'Update Password'}).click();
    await expect.poll(()=>committedStatus).toBe(200);
    // Use the existing dialog departure; its overlay correctly blocks the
    // shell sign-out action while open. Keep the committed response held.
    await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await logout(page); await login(page,other.phone,other.password);
    await page.goto('/settings'); release(); await expect.poll(()=>finished).toBe(true);
    await expect(page.getByLabel('Your name')).toHaveValue('QA owner');
    await page.reload(); await expect(page.getByLabel('Your name')).toHaveValue('QA owner');
  } finally { release(); }
});
test('password recovery confirmation stays generic for known and unknown accounts', async ({ page, browser }) => {
  await login(page);
  await verify(page);
  const context = await browser.newContext();
  try {
    const recovery = await context.newPage();
    const generic = 'If this account has a verified email, a password reset message may be sent. Check your inbox.';
    for (const identifier of [fixture.phone, `${randomUUID()}@example.invalid`]) {
      await recovery.goto('/forgot-password');
      const field = recovery.getByRole('textbox', { name: 'Phone or email', exact: true });
      await expect(field).toHaveAccessibleDescription('Use the phone number or verified email on your account.');
      await field.fill(identifier);
      await field.press('Enter');
      await expect(recovery.getByRole('status')).toHaveText(generic);
      await expect(recovery.getByText(/spam folder.*one minute.*workspace administrator/)).toBeVisible();
    }
  } finally {
    await context.close();
  }
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
  const email=`${randomUUID()}@example.invalid`; await page.getByLabel('Email (optional)').fill(email); await page.getByRole('button',{name:'Review',exact:true}).click(); await expect(page.getByRole('dialog')).toContainText(email); await page.getByRole('button',{name:'Send invitation',exact:true}).click(); await expect(page.getByText('Disposable QA staff',{exact:true})).toBeVisible();
  const messages=await (await page.request.get(`${api}/__test/mail`)).json() as Array<{purpose:string;url:string}>; const link=messages.findLast((message) => message.purpose==='staff_invitation')!.url;
  const context=await browser.newContext(); const staff=await context.newPage(); await staff.goto(link); const password=randomUUID(); await staff.getByLabel('New password',{exact:true}).fill(password); await staff.getByLabel('Confirm password').fill(password); await staff.getByRole('button',{name:'Accept invitation'}).click(); await expect(staff.getByRole('status')).toContainText('Account ready');
  await login(staff,email,password); await staff.goto('/staff'); await expect(staff.getByRole('button',{name:'Invite staff',exact:true})).toHaveCount(0); await expect(staff.getByRole('link',{name:'Commercial Intake',exact:true})).toHaveCount(0);
  await staff.goto(link); await expect(staff.getByRole('alert')).toContainText('already used'); await context.close();
});
test('manual staff invitation is shown once, cleared on close and accepted without email authority',async({page,browser}) => {
  await login(page); await page.goto('/staff'); await page.getByRole('button',{name:'Invite staff',exact:true}).click();
  await page.getByLabel('Full name').fill('Disposable manual staff'); await page.getByLabel('Phone number',{exact:true}).fill('9876543299');
  await page.getByRole('button',{name:'Review',exact:true}).click(); await page.getByRole('button',{name:'Send invitation',exact:true}).click();
  const handoff=page.getByLabel('One-time handoff link'); await expect(handoff).toBeVisible(); const link=await handoff.inputValue();
  await page.getByRole('button',{name:'I have handed off the link'}).click(); await expect(handoff).toHaveCount(0);
  await page.reload(); await expect(handoff).toHaveCount(0);
  const context=await browser.newContext(); const staff=await context.newPage(); await staff.goto(link); const password=randomUUID();
  await staff.getByLabel('New password',{exact:true}).fill(password); await staff.getByLabel('Confirm password').fill(password); await staff.getByRole('button',{name:'Accept invitation'}).click(); await expect(staff.getByRole('status')).toContainText('Account ready');
  await login(staff,'+919876543299',password); await staff.goto('/settings'); await expect(staff.getByText('No verified email.',{exact:false})).toBeVisible(); await context.close();
});
test('existing-account invitation requires the invited session and explicit acceptance', async ({ page, browser, request }) => {
  const response = await request.post(`${api}/__test/fixture`);
  expect(response.ok()).toBeTruthy();
  const invitee = await response.json() as Fixture;
  await login(page);
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Invite staff', exact: true }).click();
  await page.getByLabel('Full name').fill('Disposable existing invitee');
  await page.getByLabel('Phone number', { exact: true }).fill(invitee.phone);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
  const handoff = page.getByLabel('One-time handoff link');
  await expect(handoff).toBeVisible();
  const link = await handoff.inputValue();
  await page.getByRole('button', { name: 'I have handed off the link' }).click();

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Join with your existing account' })).toBeVisible();
  await expect(page.getByText('Disposable existing invitee', { exact: true })).toBeVisible();
  await expect(page.getByText('Disposable browser workspace', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => location.hash === '')).toBe(true);
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invitation belongs to a different account');
  await expect(page.getByRole('alert')).toContainText('reopen this link');
  await expect(page.getByRole('status')).toHaveCount(0);

  const context = await browser.newContext();
  try {
    const staff = await context.newPage();
    await staff.goto(link);
    await expect(staff.getByRole('heading', { name: 'Join with your existing account' })).toBeVisible();
    await expect(staff.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
    await expect(staff.getByLabel('New password')).toHaveCount(0);
    const accept = staff.getByRole('button', { name: 'Accept invitation', exact: true });
    await expect(accept).toBeDisabled();
    await login(staff, invitee.phone, invitee.password);
    await staff.goto(link);
    await expect(accept).toBeEnabled();
    await expect(staff.getByRole('status')).toHaveCount(0);
    await accept.click();
    await expect(staff.getByRole('status')).toContainText('Organization joined');
    await staff.goto(link);
    await expect(staff.getByRole('alert')).toContainText('already used');
    await expect(accept).toHaveCount(0);
  } finally {
    await context.close();
  }
});

for(const width of [390,768,1440]) test(`authentication and recovery fit ${width}px without overflow`,async({page}) => {
  await page.setViewportSize({width,height:900});
  for(const route of ['/login','/forgot-password','/reset-password','/verify-email','/accept-invitation']) {
    await page.goto(route); await expect(page.getByRole('heading',{level:1})).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.screenshot({path:`test-results/identity/safe-${route.slice(1)}-${width}.png`});
  }
});
