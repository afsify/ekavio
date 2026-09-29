import { Ledger } from '../../models/Ledger.js';
import type {
  CustomerDuesLegacySource,
  LegacyCustomerDueSourceRecord,
} from './migrationTypes.js';

interface LeanLedgerRecord {
  _id: { toString(): string };
  tenantId: { toString(): string };
  customerName: string;
  phone: string;
  amount: number;
  type: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoCustomerDuesLegacySource implements CustomerDuesLegacySource {
  public async load(): Promise<LegacyCustomerDueSourceRecord[]> {
    const rows = await Ledger.find({}).sort({ _id: 1 }).lean().exec() as unknown as LeanLedgerRecord[];
    return rows.map((row) => ({
      id: row._id.toString(),
      legacyOrganizationId: row.tenantId.toString(),
      customerName: row.customerName,
      phone: row.phone,
      amount: row.amount,
      type: row.type,
      description: row.description ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }
}
