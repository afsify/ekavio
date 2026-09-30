export interface LegacyParentOrganizationRecord {
  id: string;
  ownerLegacyUserId: string;
  name: string;
  consolidatedBilling: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LegacyCorporateChildLink {
  legacyOrganizationId: string;
  legacyParentOrganizationId: string;
}

export interface CorporateLegacySource {
  loadParents(): Promise<LegacyParentOrganizationRecord[]>;
  loadChildLinks(): Promise<LegacyCorporateChildLink[]>;
}

export interface LegacyActivityLogRecord {
  id: string;
  legacyOrganizationId: string;
  legacyActorUserId: string;
  action: string;
  details: unknown;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AuditLegacySource {
  loadActivityLogs(): Promise<LegacyActivityLogRecord[]>;
}
