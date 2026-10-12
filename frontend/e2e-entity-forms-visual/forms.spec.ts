import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { visualFixture, fits } from '../e2e-operations-visual/fixtures';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';
import { administrationFixture } from '../e2e-administration-visual/fixtures';
import { blankDefinition } from '../src/components/forms/fieldDefinitionUtils';
import type { FieldEntity, FormSchema } from '../src/components/forms/formSchema';

// Presentation-only DTOs. Never hosted credentials or private QA fixtures.
// Actual PostgreSQL and authorization proof lives in e2e-fields/e2e-crm.
async function fixture(page: Page, readonly = false) {
  const permissions = ['customers.manage','services.read','services.manage','crm.read','crm.manage','queue.read','queue.manage','inventory.read','inventory.manage'];
  const operations = await visualFixture(page), relationships = await relationshipFixture(page), administration = await administrationFixture(page, readonly, permissions.filter(permission => !readonly || permission.endsWith('.read')));
  const session = administration.member;
  // The newest workspace owns bootstrap. Reuse its DTO but grant the exact
  // independent permissions needed to present these existing six workflows.
  const item = { id: randomUUID(), name: 'QA inventory metadata', unitCode: 'kg', unit: { code: 'kg', label: 'Kilogram' }, status: 'active', sku: 'QA-STOCK', barcode: null, price: '123.45', priceMinor: '12345', currency: 'INR', quantity: '10.125', locationId: randomUUID(), locationName: 'Default stock', reorderThreshold: '0.000', isLowStock: false };
  const appointment = { id: randomUUID(), customer: operations.customer, service: operations.service, customerId: operations.customer.id, serviceId: operations.service.id, provider: null, status: 'scheduled', startsAt: '2026-10-07T05:00:00.000Z', endsAt: '2026-10-07T05:30:00.000Z', notes: 'QA metadata', version: 1 };
  const rows = (data: unknown[]) => ({ data, pagination: { page: 1, limit: 20, total: data.length, totalPages: 1 } });
  await page.route('http://127.0.0.1:5009/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api','');
    if (path === '/customers') return route.fulfill({ json: rows([operations.customer]) });
    if (path.startsWith('/customers/')) return route.fulfill({ json: { data: { ...operations.customer, notes: 'QA canonical notes', status: 'active' } } });
    if (path === '/services') return route.fulfill({ json: rows([operations.service]) });
    if (path === '/appointments') return route.fulfill({ json: rows([appointment]) });
    if (path.startsWith('/appointments/')) return route.fulfill({ json: { data: appointment } });
    if (path === '/inventory/units') return route.fulfill({ json: { data: [item.unit] } });
    if (path === '/inventory' || path === '/inventory/low-stock') return route.fulfill({ json: rows([item]) });
    if (path.endsWith('/movements')) return route.fulfill({ json: rows([]) });
    if (path.startsWith('/inventory/')) return route.fulfill({ json: { data: item } });
    if (path === '/crm/stages') return route.fulfill({ json: { data: [relationships.stage] } });
    if (path === '/crm/assignees') return route.fulfill({ json: { data: [] } });
    if (path === '/crm/overview') return route.fulfill({ json: { data: { active: 1, unassigned: 1, today: 0, overdue: 0, businessDate: '2026-10-07', timezone: 'Asia/Kolkata', stages: [{ ...relationships.stage, leads: 1 }] } } });
    if (path === '/crm/leads' || path === '/crm/followups') return route.fulfill({ json: { data: { data: path.endsWith('leads') ? [relationships.lead] : [], total: 1, page: 1, limit: 20, timezone: 'Asia/Kolkata' } } });
    if (path.endsWith('/activity')) return route.fulfill({ json: { data: [] } });
    if (path.startsWith('/crm/leads/')) return route.fulfill({ json: { data: relationships.lead } });
    return route.fallback();
  });
  const keys: Record<FieldEntity, string[]> = { customer: ['name', 'phone', 'notes', 'status'], lead: ['name', 'pipelineStageId', 'company', 'phone', 'email', 'source', 'assignedMembershipId', 'notes'], service: ['name', 'durationMinutes', 'description', 'active'], appointment: ['customerId', 'serviceId', 'localStart', 'providerMembershipId', 'notes'], inventory_item: ['name', 'unitCode', 'sku', 'barcode', 'price'], membership: ['role', 'status', 'branchIds'] };
  const option = randomUUID();
  const definitions = [
    { ...blankDefinition(), id: randomUUID(), key: 'note', label: 'QA long field label ' + 'L'.repeat(75), help: 'Readable plain guidance ' + 'H'.repeat(85) },
    { ...blankDefinition(), id: randomUUID(), key: 'day', label: 'QA date only', field_type: 'date' as const, default_value: '2028-01-01' },
    { ...blankDefinition(), id: randomUUID(), key: 'instant', label: 'QA UTC instant', field_type: 'datetime' as const, default_value: '2028-01-01T10:30:00.123Z' },
    { ...blankDefinition(), id: randomUUID(), key: 'choices', label: 'QA multiple choices', field_type: 'multiselect' as const, options: [{ id: option, key: 'one', label: 'QA long option ' + 'O'.repeat(90), status: 'active' as const }] },
    { ...blankDefinition(), id: randomUUID(), key: 'amount', label: 'QA exact amount', field_type: 'currency' as const, default_value: '123456789012345678' },
    { ...blankDefinition(), id: randomUUID(), key: 'history', label: 'QA historical note', status: 'archived' as const },
  ];
  await page.route('http://127.0.0.1:5009/api/forms/**', async route => {
    const path = new URL(route.request().url()).pathname, entity = path.split('/')[3] as FieldEntity;
    if (route.request().method() !== 'GET') throw new Error('Presentation checks must not submit field writes');
    if (path.includes('/values/')) return route.fulfill({ json: { data: { note: 'QA retained value', day: '2028-01-01', instant: '2028-01-01T10:30:00.123Z', choices: [option], amount: '123456789012345678', history: 'QA retained archived-section fact' } } });
    const schema: FormSchema = { entity, version: 2, builtins: keys[entity].map(key => ({ key, label: key, required: ['name', 'durationMinutes', 'customerId', 'serviceId', 'localStart', 'unitCode', 'role', 'branchIds', 'pipelineStageId'].includes(key) })), definitions, sections: [{ id: 'general', title: 'Record information', fields: [...keys[entity].map(key => ({ key, visible: true })), ...definitions.filter(field => field.key !== 'history').map(field => ({ key: field.key, visible: true }))] }, { id: 'old', title: 'Archived layout', status: 'archived', fields: [{ key: 'history', visible: false }] }] };
    return route.fulfill({ json: { data: schema } });
  });
  return { operations, relationships, session };
}
async function controlsFit(page: Page) {
  await fits(page);
  const failures = await page.getByRole('dialog').locator('[data-dynamic-form] input:not([type=checkbox]):not([type=radio]),[data-dynamic-form] select,[data-dynamic-form] textarea').evaluateAll(elements => elements.flatMap(element => {
    const box = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect();
    // PhoneInput is an intentionally compact country/code/number row; native
    // date/datetime controls still require the full readable nested field width.
    return box.width >= (element.closest('.phone-field') ? 44 : 180) && box.left >= parent.left - 1 && box.right <= parent.right + 1 ? [] : [{ tag: element.tagName, type: element.getAttribute('type'), width: box.width, parentWidth: parent.width, left: box.left - parent.left, right: box.right - parent.right }];
  }));
  expect(failures).toEqual([]);
}
for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) test(`six entity forms ${width}px ${theme}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.name)); page.on('dialog', dialog => dialog.accept());
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const state = await fixture(page);
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), theme);
  const shot = async (name: string) => { await page.screenshot({ path: `test-results/entity-forms-visual-batch3/${width}-${theme}-${name}.png` }); await controlsFit(page); };
  const close = async () => { await page.getByRole('dialog').getByRole('button', { name: 'Close modal', exact: true }).click(); if (await page.getByRole('button', { name: 'Discard changes', exact: true }).count()) await page.getByRole('button', { name: 'Discard changes', exact: true }).click(); };
  const native = async (name: string) => { await page.getByRole('dialog').getByLabel('QA UTC instant (UTC)', { exact: true }).scrollIntoViewIfNeeded(); await shot(name); };
  await page.goto('/customers'); await page.getByRole('button', { name: 'Create customer', exact: true }).click(); await page.getByLabel('Customer name', { exact: true }).fill('QA form customer'); await shot('customer-editor'); await native('customer-native'); await page.getByRole('group', { name: 'QA multiple choices', exact: true }).scrollIntoViewIfNeeded(); await shot('customer-choices'); await close();
  await page.getByRole('button', { name: 'View ' + state.operations.customer.name, exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('customer-history'); await page.getByRole('button', { name: 'Edit customer', exact: true }).click(); await shot('customer-edit'); await close();
  await page.goto('/services'); await page.getByRole('button', { name: 'Create service', exact: true }).click(); await page.getByLabel('Service name', { exact: true }).fill('QA reviewed service'); await shot('service-editor'); await native('service-native'); await page.getByRole('button', { name: 'Review service', exact: true }).click(); await shot('service-review'); await page.keyboard.press('Escape'); await shot('service-discard'); await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Providers for ' + state.operations.service.name, exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('service-history'); await close();
  await page.goto('/crm'); await page.getByRole('button', { name: 'Create lead', exact: true }).click(); await page.getByLabel('Lead name', { exact: true }).fill('QA form lead'); await shot('lead-editor'); await native('lead-native'); await close();
  await page.getByRole('button', { name: 'leads', exact: true }).click(); await page.getByRole('button', { name: 'View ' + state.relationships.lead.name, exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('lead-history'); await page.getByRole('button', { name: 'Convert to Customer', exact: true }).click(); await shot('lead-conversion'); await close();
  await page.goto('/appointments'); await page.getByRole('button', { name: 'Details', exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('appointment-history'); await page.getByRole('button', { name: 'Edit appointment fields', exact: true }).click(); await shot('appointment-editor'); await native('appointment-native'); await close();
  await page.goto('/inventory'); await page.getByRole('button', { name: 'Details & history', exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('inventory-history'); await page.getByRole('button', { name: 'Edit item', exact: true }).click(); await shot('inventory-editor'); await native('inventory-native'); await close();
  await page.goto('/staff'); await page.getByRole('button', { name: 'Details', exact: true }).click(); await expect(page.getByText('QA retained archived-section fact', { exact: true })).toBeVisible(); await shot('membership-history'); await page.getByRole('button', { name: 'Edit ' + state.session.name, exact: true }).last().click(); await shot('membership-editor'); await native('membership-native');
  if (theme === 'system') { await page.emulateMedia({ colorScheme: 'light' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); await page.emulateMedia({ colorScheme: 'dark' }); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); }
  expect(errors).toEqual([]);
});
test('Service read-only history and protected Membership details remain readable without editor authority', async ({page}) => {
 await page.setViewportSize({width:320,height:900});const state=await fixture(page,true);await page.goto('/services');await expect(page.getByRole('button',{name:'Create service',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit '+state.operations.service.name,exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Providers for '+state.operations.service.name,exact:true}).click();await expect(page.getByText('QA retained archived-section fact',{exact:true})).toBeVisible();await fits(page);await page.screenshot({path:'test-results/entity-forms-visual-batch3/320-light-read-only-service.png'});
 await page.goto('/staff');await page.getByRole('button',{name:'Details',exact:true}).click();await expect(page.getByText('QA retained archived-section fact',{exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByRole('button',{name:'Edit '+state.session.name,exact:true})).toHaveCount(0);await fits(page);await page.screenshot({path:'test-results/entity-forms-visual-batch3/320-light-read-only-membership.png'});
});
test('Service denied fields never expose a stale editor or enabled review', async ({page}) => {
 await page.setViewportSize({width:320,height:900});await fixture(page);await page.route('http://127.0.0.1:5009/api/forms/**',route=>route.fulfill({status:403,json:{message:'QA field access denied'}}));await page.goto('/services');await page.getByRole('button',{name:'Create service',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Fields unavailable');await expect(page.getByRole('dialog').getByLabel('Service name',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review service',exact:true})).toBeDisabled();await fits(page);await page.screenshot({path:'test-results/entity-forms-visual-batch3/320-light-denied-service.png'});
});
test('Service loading has no canonical draft until authoritative schema arrives', async ({page}) => {
 await page.setViewportSize({width:320,height:900});await fixture(page);let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});await page.route('http://127.0.0.1:5009/api/forms/**',async route=>{await pending;await route.fallback();});await page.goto('/services');await page.getByRole('button',{name:'Create service',exact:true}).click();
 try {await expect(page.getByRole('status').filter({hasText:'Loading service fields…'})).toBeVisible();await expect(page.getByLabel('Service name',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Review service',exact:true})).toBeDisabled();await fits(page);await page.screenshot({path:'test-results/entity-forms-visual-batch3/320-light-loading-service.png'});} finally {release();}
 await expect(page.getByLabel('Service name',{exact:true})).toBeVisible();
});
for(const width of [320,360,390,430,768,1024,1440,1920])for(const theme of ['light','dark','system'])test(`long canonical Service facts remain readable ${width}px ${theme}`, async ({page}) => {
 await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:'dark'});await fixture(page);await page.addInitScript(mode=>localStorage.setItem('ekavio-ui-preferences',JSON.stringify({mode,primaryColor:'#4F46E5'})),theme);await page.goto('/services');await page.getByRole('button',{name:'Create service',exact:true}).click();await page.getByLabel('Service name',{exact:true}).fill('QA '+ 'S'.repeat(180));await page.getByLabel('Description (optional)',{exact:true}).fill('QA '+ 'D'.repeat(300));await page.getByRole('button',{name:'Review service',exact:true}).click();await fits(page);
 await page.screenshot({path:`test-results/entity-forms-visual-batch3/${width}-${theme}-long-service-review.png`});
 const facts=page.getByRole('dialog').locator('.review-facts dd');expect(await facts.evaluateAll(elements=>elements.every(element=>{const box=element.getBoundingClientRect(),body=element.closest('.dialog-body')!.getBoundingClientRect();return element.scrollWidth<=element.clientWidth+1&&box.left>=body.left&&box.right<=body.right;}))).toBe(true);
 expect(await page.getByRole('dialog').locator('.dialog-body').evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
});
