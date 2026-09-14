import type {
  ShadowEntityName,
  ShadowMigrationCounts,
  ShadowMigrationReport,
  ShadowSourceRepository,
} from './sharedCoreTypes.js';
import type { PostgresSharedCoreRepository } from './sharedCoreRepository.js';
import { validateShadowSnapshot } from './shadowValidation.js';

export class ShadowValidationError extends Error {
  public constructor(public readonly issues: string[]) {
    super(`Shadow migration validation failed with ${issues.length} issue(s)`);
    this.name = 'ShadowValidationError';
  }
}

export interface ShadowMigrationOptions {
  source: ShadowSourceRepository;
  target?: Pick<PostgresSharedCoreRepository, 'apply'>;
  apply?: boolean;
}

export const runShadowMigration = async ({
  source,
  target,
  apply = false,
}: ShadowMigrationOptions): Promise<ShadowMigrationReport> => {
  const snapshot = await source.load();
  const issues = validateShadowSnapshot(snapshot);
  if (issues.length > 0) throw new ShadowValidationError(issues);

  if (apply) {
    if (!target) throw new Error('An apply target is required for shadow migration apply');
    await target.apply(snapshot);
  }

  const entityCounts = Object.fromEntries(
    (Object.entries(snapshot) as Array<[ShadowEntityName, unknown[]]>).map(([name, rows]) => [name, rows.length]),
  ) as Record<ShadowEntityName, number>;
  const counts: ShadowMigrationCounts = {
    ...entityCounts,
    membershipBranchAssignments: snapshot.memberships.reduce(
      (count, membership) => count + membership.branchLegacyMongoIds.length, 0,
    ),
    planModules: snapshot.plans.reduce((count, plan) => count + plan.moduleKeys.length, 0),
    planLimits: snapshot.plans.reduce((count, plan) => count + plan.limits.length, 0),
    addOnModules: snapshot.addOns.reduce((count, addOn) => count + addOn.moduleKeys.length, 0),
    addOnLimitAdjustments: snapshot.addOns.reduce(
      (count, addOn) => count + addOn.limitAdjustments.length, 0,
    ),
    subscriptionAddOns: snapshot.subscriptions.reduce(
      (count, subscription) => count + subscription.addOns.length, 0,
    ),
    authSessions: 0,
    auditEvents: 0,
  };

  return {
    mode: apply ? 'apply' : 'dry-run',
    counts,
    sessionRowsCopied: 0,
    issues: [],
  };
};
