import { limitKeys, moduleKeys } from '../commercial/catalogue.js';
import type { SharedCoreSnapshot } from './sharedCoreTypes.js';

const mongoIdPattern = /^[0-9a-f]{24}$/;

const duplicates = (values: string[]): string[] =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))].sort();

export const validateShadowSnapshot = (snapshot: SharedCoreSnapshot): string[] => {
  const issues: string[] = [];
  const collections = Object.entries(snapshot) as Array<[keyof SharedCoreSnapshot, Array<{ legacyMongoId: string }>]>;
  for (const [name, rows] of collections) {
    for (const row of rows) {
      if (!mongoIdPattern.test(row.legacyMongoId)) issues.push(`${name} has invalid legacy id`);
    }
    for (const duplicate of duplicates(rows.map((row) => row.legacyMongoId))) {
      issues.push(`${name} has duplicate legacy id ${duplicate}`);
    }
  }

  const users = new Set(snapshot.users.map((row) => row.legacyMongoId));
  const parents = new Set(snapshot.parentOrganizations.map((row) => row.legacyMongoId));
  const organizations = new Set(snapshot.organizations.map((row) => row.legacyMongoId));
  const branches = new Map(snapshot.branches.map((row) => [row.legacyMongoId, row]));
  const modules = new Set(snapshot.moduleDefinitions.map((row) => row.key));
  const plans = new Set(snapshot.plans.map((row) => row.legacyMongoId));
  const addOns = new Set(snapshot.addOns.map((row) => row.legacyMongoId));
  const allowedModules = new Set<string>(moduleKeys);
  const allowedLimits = new Set<string>(limitKeys);
  const branchStatuses = new Set(['active', 'inactive']);
  const membershipRoles = new Set(['owner', 'admin', 'manager', 'hr', 'staff']);
  const membershipStatuses = new Set(['active', 'inactive', 'revoked']);
  const catalogueStatuses = new Set(['active', 'inactive']);
  const subscriptionStatuses = new Set(['active', 'trialing', 'inactive', 'suspended', 'cancelled']);
  const commercialSources = new Set(['manual', 'pilot', 'import', 'support']);

  for (const duplicate of duplicates(snapshot.moduleDefinitions.map((row) => row.key))) {
    issues.push(`moduleDefinitions has duplicate key ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.plans.map((row) => row.key))) {
    issues.push(`plans has duplicate key ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.addOns.map((row) => row.key))) {
    issues.push(`addOns has duplicate key ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.branches.map((row) => `${row.organizationLegacyMongoId}:${row.code}`))) {
    issues.push(`branches has duplicate organization/code ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.memberships.map((row) => `${row.userLegacyMongoId}:${row.organizationLegacyMongoId}`))) {
    issues.push(`memberships has duplicate user/organization ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.subscriptions.map((row) => row.organizationLegacyMongoId))) {
    issues.push(`subscriptions has duplicate organization ${duplicate}`);
  }
  for (const duplicate of duplicates(snapshot.entitlements.map((row) => `${row.organizationLegacyMongoId}:${row.moduleKey}`))) {
    issues.push(`entitlements has duplicate organization/module ${duplicate}`);
  }

  for (const user of snapshot.users) {
    if (!organizations.has(user.legacyTenantMongoId)) {
      issues.push(`user ${user.legacyMongoId} references missing legacy tenant`);
    }
    if (user.platformRole !== null && user.platformRole !== 'operator') {
      issues.push(`user ${user.legacyMongoId} has invalid platform role`);
    }
  }
  for (const parent of snapshot.parentOrganizations) {
    if (!users.has(parent.ownerUserLegacyMongoId)) {
      issues.push(`parent organization ${parent.legacyMongoId} references missing owner`);
    }
  }
  for (const organization of snapshot.organizations) {
    if (organization.parentOrganizationLegacyMongoId &&
      !parents.has(organization.parentOrganizationLegacyMongoId)) {
      issues.push(`organization ${organization.legacyMongoId} references missing parent`);
    }
  }
  for (const branch of snapshot.branches) {
    if (!organizations.has(branch.organizationLegacyMongoId)) {
      issues.push(`branch ${branch.legacyMongoId} references missing organization`);
    }
    if (!branchStatuses.has(branch.status)) issues.push(`branch ${branch.legacyMongoId} has invalid status`);
  }
  for (const membership of snapshot.memberships) {
    if (!users.has(membership.userLegacyMongoId)) {
      issues.push(`membership ${membership.legacyMongoId} references missing user`);
    }
    if (!organizations.has(membership.organizationLegacyMongoId)) {
      issues.push(`membership ${membership.legacyMongoId} references missing organization`);
    }
    if (!membershipRoles.has(membership.role)) issues.push(`membership ${membership.legacyMongoId} has invalid role`);
    if (!membershipStatuses.has(membership.status)) issues.push(`membership ${membership.legacyMongoId} has invalid status`);
    for (const duplicate of duplicates(membership.branchLegacyMongoIds)) {
      issues.push(`membership ${membership.legacyMongoId} repeats branch ${duplicate}`);
    }
    for (const branchId of membership.branchLegacyMongoIds) {
      const branch = branches.get(branchId);
      if (!branch) issues.push(`membership ${membership.legacyMongoId} references missing branch ${branchId}`);
      else if (branch.organizationLegacyMongoId !== membership.organizationLegacyMongoId) {
        issues.push(`membership ${membership.legacyMongoId} has cross-organization branch ${branchId}`);
      }
    }
  }
  for (const module of snapshot.moduleDefinitions) {
    if (!allowedModules.has(module.key)) issues.push(`unknown module capability ${module.key}`);
    if (!catalogueStatuses.has(module.status)) issues.push(`module ${module.legacyMongoId} has invalid status`);
    if (!['core', 'purchasable'].includes(module.commercialType)) issues.push(`module ${module.legacyMongoId} has invalid commercial type`);
    if (!Number.isInteger(module.version) || module.version < 1) issues.push(`module ${module.legacyMongoId} has invalid version`);
  }
  for (const plan of snapshot.plans) {
    if (!catalogueStatuses.has(plan.status)) issues.push(`plan ${plan.legacyMongoId} has invalid status`);
    if (!Number.isInteger(plan.version) || plan.version < 1) issues.push(`plan ${plan.legacyMongoId} has invalid version`);
    for (const duplicate of duplicates(plan.moduleKeys)) issues.push(`plan ${plan.legacyMongoId} repeats module ${duplicate}`);
    for (const key of plan.moduleKeys) {
      if (!allowedModules.has(key) || !modules.has(key)) issues.push(`plan ${plan.legacyMongoId} references unknown module ${key}`);
    }
    for (const duplicate of duplicates(plan.limits.map(({ key }) => key))) issues.push(`plan ${plan.legacyMongoId} repeats limit ${duplicate}`);
    for (const limit of plan.limits) {
      if (!allowedLimits.has(limit.key)) issues.push(`plan ${plan.legacyMongoId} has unknown limit ${limit.key}`);
      if (!Number.isInteger(limit.value) || limit.value < 0) issues.push(`plan ${plan.legacyMongoId} has invalid limit value`);
    }
  }
  for (const addOn of snapshot.addOns) {
    if (!catalogueStatuses.has(addOn.status)) issues.push(`add-on ${addOn.legacyMongoId} has invalid status`);
    if (!Number.isInteger(addOn.version) || addOn.version < 1) issues.push(`add-on ${addOn.legacyMongoId} has invalid version`);
    for (const duplicate of duplicates(addOn.moduleKeys)) issues.push(`add-on ${addOn.legacyMongoId} repeats module ${duplicate}`);
    for (const key of addOn.moduleKeys) {
      if (!allowedModules.has(key) || !modules.has(key)) issues.push(`add-on ${addOn.legacyMongoId} references unknown module ${key}`);
    }
    for (const duplicate of duplicates(addOn.limitAdjustments.map(({ key }) => key))) issues.push(`add-on ${addOn.legacyMongoId} repeats limit ${duplicate}`);
    for (const limit of addOn.limitAdjustments) {
      if (!allowedLimits.has(limit.key)) issues.push(`add-on ${addOn.legacyMongoId} has unknown limit ${limit.key}`);
      if (!['add', 'override'].includes(limit.mode) || !Number.isInteger(limit.value) || limit.value < 0) {
        issues.push(`add-on ${addOn.legacyMongoId} has invalid limit adjustment`);
      }
    }
  }
  for (const subscription of snapshot.subscriptions) {
    if (!organizations.has(subscription.organizationLegacyMongoId)) issues.push(`subscription ${subscription.legacyMongoId} references missing organization`);
    if (subscription.planLegacyMongoId && !plans.has(subscription.planLegacyMongoId)) issues.push(`subscription ${subscription.legacyMongoId} references missing plan`);
    for (const actor of [subscription.createdByUserLegacyMongoId, subscription.updatedByUserLegacyMongoId]) {
      if (actor && !users.has(actor)) issues.push(`subscription ${subscription.legacyMongoId} references missing actor`);
    }
    for (const duplicate of duplicates(subscription.addOns.map(({ addOnLegacyMongoId }) => addOnLegacyMongoId))) issues.push(`subscription ${subscription.legacyMongoId} repeats add-on ${duplicate}`);
    for (const addOn of subscription.addOns) if (!addOns.has(addOn.addOnLegacyMongoId)) issues.push(`subscription ${subscription.legacyMongoId} references missing add-on`);
    if (!subscriptionStatuses.has(subscription.status)) issues.push(`subscription ${subscription.legacyMongoId} has invalid status`);
    if (!commercialSources.has(subscription.source)) issues.push(`subscription ${subscription.legacyMongoId} has invalid source`);
    if (subscription.billingCycle && !['monthly', 'yearly'].includes(subscription.billingCycle)) issues.push(`subscription ${subscription.legacyMongoId} has invalid billing cycle`);
    if (subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt < subscription.startsAt) issues.push(`subscription ${subscription.legacyMongoId} has invalid period`);
    for (const addOn of subscription.addOns) {
      if (addOn.startsAt && addOn.endsAt && addOn.endsAt < addOn.startsAt) issues.push(`subscription ${subscription.legacyMongoId} has invalid add-on period`);
    }
  }
  for (const entitlement of snapshot.entitlements) {
    if (!organizations.has(entitlement.organizationLegacyMongoId)) issues.push(`entitlement ${entitlement.legacyMongoId} references missing organization`);
    if (!allowedModules.has(entitlement.moduleKey) || !modules.has(entitlement.moduleKey)) issues.push(`entitlement ${entitlement.legacyMongoId} references unknown module ${entitlement.moduleKey}`);
    if (!users.has(entitlement.actorUserLegacyMongoId)) issues.push(`entitlement ${entitlement.legacyMongoId} references missing actor`);
    if (!['grant', 'revoke'].includes(entitlement.effect)) issues.push(`entitlement ${entitlement.legacyMongoId} has invalid effect`);
    if (!catalogueStatuses.has(entitlement.status)) issues.push(`entitlement ${entitlement.legacyMongoId} has invalid status`);
    if (!commercialSources.has(entitlement.source)) issues.push(`entitlement ${entitlement.legacyMongoId} has invalid source`);
    if (entitlement.validFrom && entitlement.validUntil && entitlement.validUntil < entitlement.validFrom) issues.push(`entitlement ${entitlement.legacyMongoId} has invalid period`);
  }

  return issues.sort();
};
