export interface ShadowUser {
  legacyMongoId: string;
  legacyTenantMongoId: string;
  name: string;
  phone: string;
  passwordHash: string | null;
  platformRole: 'operator' | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowParentOrganization {
  legacyMongoId: string;
  ownerUserLegacyMongoId: string;
  name: string;
  consolidatedBilling: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowOrganization {
  legacyMongoId: string;
  parentOrganizationLegacyMongoId: string | null;
  name: string;
  type: string;
  themeMode: 'light' | 'dark';
  themePrimaryColor: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowBranch {
  legacyMongoId: string;
  organizationLegacyMongoId: string;
  name: string;
  code: string;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowMembership {
  legacyMongoId: string;
  userLegacyMongoId: string;
  organizationLegacyMongoId: string;
  role: 'owner' | 'admin' | 'manager' | 'hr' | 'staff';
  status: 'active' | 'inactive' | 'revoked';
  branchLegacyMongoIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowModuleDefinition {
  legacyMongoId: string;
  key: string;
  displayName: string;
  description: string;
  category: string;
  commercialType: 'core' | 'purchasable';
  status: 'active' | 'inactive';
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowPlan {
  legacyMongoId: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  moduleKeys: string[];
  limits: Array<{ key: string; value: number }>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowAddOn {
  legacyMongoId: string;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  moduleKeys: string[];
  limitAdjustments: Array<{ key: string; mode: 'add' | 'override'; value: number }>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowSubscription {
  legacyMongoId: string;
  organizationLegacyMongoId: string;
  planLegacyMongoId: string | null;
  addOns: Array<{
    addOnLegacyMongoId: string;
    startsAt: Date | null;
    endsAt: Date | null;
  }>;
  status: 'active' | 'trialing' | 'inactive' | 'suspended' | 'cancelled';
  source: 'manual' | 'pilot' | 'import' | 'support';
  startsAt: Date;
  currentPeriodEndsAt: Date | null;
  billingCycle: 'monthly' | 'yearly' | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  createdByUserLegacyMongoId: string | null;
  updatedByUserLegacyMongoId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShadowEntitlement {
  legacyMongoId: string;
  organizationLegacyMongoId: string;
  moduleKey: string;
  effect: 'grant' | 'revoke';
  status: 'active' | 'inactive';
  source: 'manual' | 'pilot' | 'import' | 'support';
  reason: string;
  validFrom: Date | null;
  validUntil: Date | null;
  actorUserLegacyMongoId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharedCoreSnapshot {
  users: ShadowUser[];
  parentOrganizations: ShadowParentOrganization[];
  organizations: ShadowOrganization[];
  branches: ShadowBranch[];
  memberships: ShadowMembership[];
  moduleDefinitions: ShadowModuleDefinition[];
  plans: ShadowPlan[];
  addOns: ShadowAddOn[];
  subscriptions: ShadowSubscription[];
  entitlements: ShadowEntitlement[];
}

export type ShadowEntityName = keyof SharedCoreSnapshot;

export type ShadowMigrationCounts = Record<ShadowEntityName, number> & {
  membershipBranchAssignments: number;
  planModules: number;
  planLimits: number;
  addOnModules: number;
  addOnLimitAdjustments: number;
  subscriptionAddOns: number;
  authSessions: 0;
  auditEvents: 0;
};

export interface ShadowMigrationReport {
  mode: 'dry-run' | 'apply';
  counts: ShadowMigrationCounts;
  sessionRowsCopied: 0;
  issues: string[];
}

export interface ShadowSourceRepository {
  load(): Promise<SharedCoreSnapshot>;
}
