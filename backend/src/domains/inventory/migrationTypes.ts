import type { InventoryUnitCode } from './units.js';

export interface LegacyInventorySourceRecord {
  id: string;
  legacyOrganizationId: string;
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryLegacySource {
  load(): Promise<LegacyInventorySourceRecord[]>;
}

export interface InventoryOrganizationMapping {
  legacyOrganizationId: string;
  organizationId: string;
  branchResolutions: Record<string, string>;
  unitResolutions: Record<string, InventoryUnitCode>;
}

export interface InventoryMigrationMapping {
  version: 1;
  organizations: InventoryOrganizationMapping[];
}
