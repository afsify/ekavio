import { ActivityLog } from '../../models/ActivityLog.js';
import { Organization } from '../../models/Organization.js';
import { ParentOrganization } from '../../models/ParentOrganization.js';
import type {
  AuditLegacySource,
  CorporateLegacySource,
  LegacyActivityLogRecord,
  LegacyCorporateChildLink,
  LegacyParentOrganizationRecord,
} from './migrationTypes.js';

interface MongoId { toString(): string }

export class MongoCorporateLegacySource implements CorporateLegacySource {
  public async loadParents(): Promise<LegacyParentOrganizationRecord[]> {
    const rows = await ParentOrganization.find({}).sort({ _id: 1 }).lean().exec();
    return rows.map((row) => ({
      id: (row._id as MongoId).toString(),
      ownerLegacyUserId: (row.ownerId as MongoId).toString(),
      name: row.name,
      consolidatedBilling: row.consolidatedBilling,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  public async loadChildLinks(): Promise<LegacyCorporateChildLink[]> {
    const rows = await Organization.find({ parentId: { $exists: true, $ne: null } })
      .sort({ _id: 1 }).select({ _id: 1, parentId: 1 }).lean().exec();
    return rows.map((row) => ({
      legacyOrganizationId: (row._id as MongoId).toString(),
      legacyParentOrganizationId: (row.parentId as MongoId).toString(),
    }));
  }
}

export class MongoAuditLegacySource implements AuditLegacySource {
  public async loadActivityLogs(): Promise<LegacyActivityLogRecord[]> {
    const rows = await ActivityLog.find({}).sort({ _id: 1 }).lean().exec();
    return rows.map((row) => ({
      id: (row._id as MongoId).toString(),
      legacyOrganizationId: (row.tenantId as MongoId).toString(),
      legacyActorUserId: (row.userId as MongoId).toString(),
      action: row.action,
      details: row.details ?? {},
      ipAddress: row.ipAddress ?? null,
      createdAt: new Date(row.createdAt),
    }));
  }
}
