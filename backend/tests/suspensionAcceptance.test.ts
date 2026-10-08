import assert from 'node:assert/strict';
import test from 'node:test';
import { initialModuleCatalogue, moduleKeys } from '../src/commercial/catalogue.js';
import { calculateEffectiveEntitlements } from '../src/services/entitlementService.js';

test('suspended commercial subscription denies all optional modules even with independent pilot grants', () => {
  const result = calculateEffectiveEntitlements('disposable-organization', {
    modules: initialModuleCatalogue.map(module => ({ ...module })),
    subscription: { id:'synthetic-subscription', status:'suspended', source:'manual',
      startsAt:new Date('2026-01-01T00:00:00Z'), addOns:[] },
    overrides:moduleKeys.map(moduleKey => ({moduleKey,effect:'grant',status:'active',source:'pilot'})),
  }, new Date('2026-10-08T00:00:00Z'));
  assert.ok(result.modules.every(module => !module.enabled));
});
