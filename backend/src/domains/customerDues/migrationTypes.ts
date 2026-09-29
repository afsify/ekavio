export interface LegacyCustomerDueSourceRecord {
  id: string;
  legacyOrganizationId: string;
  customerName: string;
  phone: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerDuesLegacySource {
  load(): Promise<LegacyCustomerDueSourceRecord[]>;
}

export interface CustomerDuesOrganizationMapping {
  legacyOrganizationId: string;
  organizationId: string;
  customerResolutions: Record<string, string>;
  branchResolutions: Record<string, string>;
}

export interface CustomerDuesMigrationMapping {
  version: 1;
  organizations: CustomerDuesOrganizationMapping[];
}
