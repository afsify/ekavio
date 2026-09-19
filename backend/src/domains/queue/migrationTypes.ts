export interface LegacyQueueSourceRecord {
  id: string;
  legacyOrganizationId: string;
  tokenLabel: string;
  customerName: string;
  phone: string;
  serviceType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegacyLedgerCustomerSourceRecord {
  id: string;
  legacyOrganizationId: string;
  customerName: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationalLegacySnapshot {
  queue: LegacyQueueSourceRecord[];
  ledgerCustomers: LegacyLedgerCustomerSourceRecord[];
}

export interface OperationalLegacySource {
  load(): Promise<OperationalLegacySnapshot>;
}

export interface OrganizationMigrationMapping {
  legacyOrganizationId: string;
  organizationId: string;
  branchId: string;
  timezone: string;
  defaultCallingCode?: string;
  defaultServiceDurationMinutes: number;
  customerGroups: Record<string, string>;
  serviceResolutions: Record<string, string>;
  sessionPolicy: {
    mode: 'created-at-local-date';
    laneKey: string;
    status: 'open' | 'closed';
  };
  queueSessionOverrides: Record<string, { localBusinessDate: string; laneKey: string; status: 'open' | 'closed' }>;
}

export interface OperationalMigrationMapping {
  version: 1;
  organizations: OrganizationMigrationMapping[];
}
