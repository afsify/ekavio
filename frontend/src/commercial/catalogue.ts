export const MODULES = {
  LEDGER: 'ledger',
  INVENTORY: 'inventory',
  ATTENDANCE: 'attendance',
  QUEUE: 'queue',
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];

export const LIMITS = {
  STAFF: 'staff',
  BRANCHES: 'branches',
  STORAGE_MB: 'storageMb',
  DOCUMENTS: 'documents',
  AUTOMATION_RUNS: 'automationRuns',
} as const;

export type LimitKey = (typeof LIMITS)[keyof typeof LIMITS];
export type EffectiveLimitMap = Record<LimitKey, number | null>;

export interface EffectiveModule {
  key: ModuleKey;
  displayName: string;
  description: string;
  category: string;
  commercialType: 'core' | 'purchasable';
  enabled: boolean;
  sources: string[];
}

export interface EffectiveEntitlements {
  organizationId: string;
  subscription: null | {
    status: 'active' | 'trialing' | 'inactive' | 'suspended' | 'cancelled' | 'expired' | 'pending';
    source: 'manual' | 'pilot' | 'import' | 'support';
    plan: null | { key: string; name: string };
    addOns: Array<{ key: string; name: string; startsAt?: string; endsAt?: string }>;
    startsAt: string;
    currentPeriodEndsAt?: string;
  };
  modules: EffectiveModule[];
  limits: EffectiveLimitMap;
}

export interface CommercialCatalogue {
  modules: Array<{
    key: ModuleKey;
    displayName: string;
    description: string;
    category: string;
    commercialType: 'core' | 'purchasable';
    status: 'active';
  }>;
  plans: Array<{
    key: string;
    name: string;
    description: string;
    moduleKeys: ModuleKey[];
    limits: Array<{ key: LimitKey; value: number }>;
  }>;
  addOns: Array<{
    key: string;
    name: string;
    description: string;
    moduleKeys: ModuleKey[];
    limitAdjustments: Array<{ key: LimitKey; mode: 'add' | 'override'; value: number }>;
  }>;
}

export const hasEntitlement = (
  entitlements: EffectiveEntitlements | null,
  moduleKey: ModuleKey,
): boolean => entitlements?.modules.some(
  (module) => module.key === moduleKey && module.enabled,
) === true;
