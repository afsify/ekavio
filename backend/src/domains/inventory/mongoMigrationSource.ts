import { Inventory } from '../../models/Inventory.js';
import type { InventoryLegacySource, LegacyInventorySourceRecord } from './migrationTypes.js';

interface LeanInventoryRecord {
  _id: { toString(): string };
  tenantId: { toString(): string };
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  price: number;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoInventoryLegacySource implements InventoryLegacySource {
  public async load(): Promise<LegacyInventorySourceRecord[]> {
    const rows = await Inventory.find({}).sort({ _id: 1 }).lean().exec() as unknown as LeanInventoryRecord[];
    return rows.map((row) => ({
      id: row._id.toString(),
      legacyOrganizationId: row.tenantId.toString(),
      itemName: row.itemName,
      currentStock: row.currentStock,
      lowStockThreshold: row.lowStockThreshold,
      price: row.price,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }
}
