export const MODULES = {
  LEDGER: 'ledger',
  INVENTORY: 'inventory',
  ATTENDANCE: 'attendance',
  QUEUE: 'queue',
} as const;

export type ModuleKey = (typeof MODULES)[keyof typeof MODULES];
export const moduleKeys = Object.values(MODULES) as ModuleKey[];

export const isModuleKey = (value: string): value is ModuleKey =>
  moduleKeys.includes(value as ModuleKey);

export const LIMITS = {
  STAFF: 'staff',
  BRANCHES: 'branches',
  STORAGE_MB: 'storageMb',
  DOCUMENTS: 'documents',
  AUTOMATION_RUNS: 'automationRuns',
} as const;

export type LimitKey = (typeof LIMITS)[keyof typeof LIMITS];
export const limitKeys = Object.values(LIMITS) as LimitKey[];
export type EffectiveLimitMap = Record<LimitKey, number | null>;

export const emptyEffectiveLimits = (): EffectiveLimitMap => ({
  staff: null,
  branches: null,
  storageMb: null,
  documents: null,
  automationRuns: null,
});

export const subscriptionStatuses = [
  'active',
  'trialing',
  'inactive',
  'suspended',
  'cancelled',
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const commercialSources = ['manual', 'pilot', 'import', 'support'] as const;
export type CommercialSource = (typeof commercialSources)[number];

export const PLAN_KEYS = {
  PILOT_CORE: 'pilot-core',
  LEGACY_IMPORT: 'legacy-import',
} as const;

export const ADD_ON_KEYS = {
  LEDGER: 'module-ledger',
  INVENTORY: 'module-inventory',
  ATTENDANCE: 'module-attendance',
  QUEUE: 'module-queue',
} as const;

export const addOnKeyByModule: Readonly<Record<ModuleKey, string>> = {
  ledger: ADD_ON_KEYS.LEDGER,
  inventory: ADD_ON_KEYS.INVENTORY,
  attendance: ADD_ON_KEYS.ATTENDANCE,
  queue: ADD_ON_KEYS.QUEUE,
};

export interface CatalogueModuleSeed {
  key: ModuleKey;
  displayName: string;
  description: string;
  category: string;
  commercialType: 'core' | 'purchasable';
  status: 'active';
  version: number;
}

export const initialModuleCatalogue: readonly CatalogueModuleSeed[] = [
  {
    key: MODULES.LEDGER,
    displayName: 'Ledger',
    description: 'Track customer credit, payments, and balances.',
    category: 'accounting',
    commercialType: 'purchasable',
    status: 'active',
    version: 1,
  },
  {
    key: MODULES.INVENTORY,
    displayName: 'Inventory',
    description: 'Track stock and low-stock alerts.',
    category: 'operations',
    commercialType: 'purchasable',
    status: 'active',
    version: 1,
  },
  {
    key: MODULES.ATTENDANCE,
    displayName: 'Attendance',
    description: 'Record and review staff attendance.',
    category: 'workforce',
    commercialType: 'purchasable',
    status: 'active',
    version: 1,
  },
  {
    key: MODULES.QUEUE,
    displayName: 'Queue',
    description: 'Manage customer tokens and service queues.',
    category: 'customer-experience',
    commercialType: 'core',
    status: 'active',
    version: 1,
  },
] as const;

export const initialPlans = [
  {
    key: PLAN_KEYS.PILOT_CORE,
    name: 'Pilot Core',
    description: 'Base package for manually managed EkaVio pilots.',
    status: 'active' as const,
    available: true,
    moduleKeys: [MODULES.QUEUE],
    limits: [
      { key: LIMITS.STAFF, value: 5 },
      { key: LIMITS.BRANCHES, value: 1 },
      { key: LIMITS.STORAGE_MB, value: 250 },
      { key: LIMITS.DOCUMENTS, value: 100 },
      { key: LIMITS.AUTOMATION_RUNS, value: 0 },
    ],
    version: 1,
  },
  {
    key: PLAN_KEYS.LEGACY_IMPORT,
    name: 'Legacy Import',
    description: 'Non-sellable compatibility package for activeModules migration.',
    status: 'active' as const,
    available: false,
    moduleKeys: [],
    limits: [],
    version: 1,
  },
] as const;

export const initialAddOns = initialModuleCatalogue.map((module) => ({
  key: addOnKeyByModule[module.key],
  name: `${module.displayName} Module`,
  description: `Manual or pilot access to the ${module.displayName} module.`,
  status: 'active' as const,
  available: true,
  moduleKeys: [module.key],
  limitAdjustments: [],
  version: 1,
}));
