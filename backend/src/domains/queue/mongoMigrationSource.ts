import { Ledger } from '../../models/Ledger.js';
import { Queue } from '../../models/Queue.js';
import type {
  LegacyLedgerCustomerSourceRecord,
  LegacyQueueSourceRecord,
  OperationalLegacySnapshot,
  OperationalLegacySource,
} from './migrationTypes.js';

interface LeanQueueRecord {
  _id: { toString(): string };
  tenantId: { toString(): string };
  tokenNumber: string;
  customerName: string;
  phone: string;
  serviceType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LeanLedgerRecord {
  _id: { toString(): string };
  tenantId: { toString(): string };
  customerName: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoOperationalLegacySource implements OperationalLegacySource {
  public async load(): Promise<OperationalLegacySnapshot> {
    const [queueRows, ledgerRows] = await Promise.all([
      Queue.find({}).sort({ _id: 1 }).lean().exec() as unknown as Promise<LeanQueueRecord[]>,
      Ledger.find({}).sort({ _id: 1 }).lean().exec() as unknown as Promise<LeanLedgerRecord[]>,
    ]);
    const queue: LegacyQueueSourceRecord[] = queueRows.map((row) => ({
      id: row._id.toString(),
      legacyOrganizationId: row.tenantId.toString(),
      tokenLabel: row.tokenNumber,
      customerName: row.customerName,
      phone: row.phone,
      serviceType: row.serviceType,
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
    const ledgerCustomers: LegacyLedgerCustomerSourceRecord[] = ledgerRows.map((row) => ({
      id: row._id.toString(),
      legacyOrganizationId: row.tenantId.toString(),
      customerName: row.customerName,
      phone: row.phone,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
    return { queue, ledgerCustomers };
  }
}
