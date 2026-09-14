import { AddOn } from '../models/AddOn.js';
import { Branch } from '../models/Branch.js';
import { Entitlement } from '../models/Entitlement.js';
import { Membership } from '../models/Membership.js';
import { ModuleDefinition } from '../models/ModuleDefinition.js';
import { Organization } from '../models/Organization.js';
import { ParentOrganization } from '../models/ParentOrganization.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import { User } from '../models/User.js';
import type { SharedCoreSnapshot, ShadowSourceRepository } from './sharedCoreTypes.js';

interface MongoId { toString(): string }
interface Timestamps { createdAt: Date; updatedAt: Date }
const id = (value: MongoId): string => value.toString();
const optionalId = (value: MongoId | null | undefined): string | null => value ? id(value) : null;
const optionalDate = (value: Date | null | undefined): Date | null => value ?? null;

export class MongoSharedCoreSource implements ShadowSourceRepository {
  public async load(): Promise<SharedCoreSnapshot> {
    const [users, parents, organizations, branches, memberships, modules, plans, addOns,
      subscriptions, entitlements] = await Promise.all([
      User.find().select('+platformRole').lean().exec(),
      ParentOrganization.find().lean().exec(),
      Organization.find().lean().exec(),
      Branch.find().lean().exec(),
      Membership.find().lean().exec(),
      ModuleDefinition.find().lean().exec(),
      Plan.find().lean().exec(),
      AddOn.find().lean().exec(),
      Subscription.find().lean().exec(),
      Entitlement.find().lean().exec(),
    ]);

    return {
      users: users.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; tenantId: MongoId; name: string; phone: string;
          password?: string; platformRole?: 'operator' | null;
        };
        return {
          legacyMongoId: id(row._id), legacyTenantMongoId: id(row.tenantId),
          name: row.name, phone: row.phone, passwordHash: row.password ?? null,
          platformRole: row.platformRole ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      parentOrganizations: parents.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; ownerId: MongoId; name: string; consolidatedBilling: boolean;
        };
        return {
          legacyMongoId: id(row._id), ownerUserLegacyMongoId: id(row.ownerId), name: row.name,
          consolidatedBilling: row.consolidatedBilling ?? true,
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      organizations: organizations.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; parentId?: MongoId; name: string; type: string;
          theme?: { mode?: 'light' | 'dark'; primaryColor?: string };
        };
        return {
          legacyMongoId: id(row._id), parentOrganizationLegacyMongoId: optionalId(row.parentId),
          name: row.name, type: row.type, themeMode: row.theme?.mode ?? 'light',
          themePrimaryColor: row.theme?.primaryColor ?? '#4F46E5',
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      branches: branches.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; organizationId: MongoId; name: string; code: string;
          status: 'active' | 'inactive';
        };
        return {
          legacyMongoId: id(row._id), organizationLegacyMongoId: id(row.organizationId),
          name: row.name, code: row.code, status: row.status,
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      memberships: memberships.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; userId: MongoId; organizationId: MongoId;
          role: 'owner' | 'admin' | 'manager' | 'hr' | 'staff';
          status: 'active' | 'inactive' | 'revoked'; branchIds: MongoId[];
        };
        return {
          legacyMongoId: id(row._id), userLegacyMongoId: id(row.userId),
          organizationLegacyMongoId: id(row.organizationId), role: row.role, status: row.status,
          branchLegacyMongoIds: row.branchIds.map(id), createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      moduleDefinitions: modules.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; key: string; displayName: string; description: string; category: string;
          commercialType: 'core' | 'purchasable'; status: 'active' | 'inactive'; version: number;
        };
        return {
          legacyMongoId: id(row._id), key: row.key, displayName: row.displayName,
          description: row.description, category: row.category, commercialType: row.commercialType,
          status: row.status, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      plans: plans.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; key: string; name: string; description: string; status: 'active' | 'inactive';
          available: boolean; moduleKeys: string[]; limits: Array<{ key: string; value: number }>;
          version: number;
        };
        return {
          legacyMongoId: id(row._id), key: row.key, name: row.name, description: row.description,
          status: row.status, available: row.available, moduleKeys: [...row.moduleKeys],
          limits: row.limits.map((limit) => ({ ...limit })), version: row.version,
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      addOns: addOns.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; key: string; name: string; description: string; status: 'active' | 'inactive';
          available: boolean; moduleKeys: string[];
          limitAdjustments: Array<{ key: string; mode: 'add' | 'override'; value: number }>;
          version: number;
        };
        return {
          legacyMongoId: id(row._id), key: row.key, name: row.name, description: row.description,
          status: row.status, available: row.available, moduleKeys: [...row.moduleKeys],
          limitAdjustments: row.limitAdjustments.map((adjustment) => ({ ...adjustment })),
          version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      subscriptions: subscriptions.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; organizationId: MongoId; planId?: MongoId;
          addOns: Array<{ addOnId: MongoId; startsAt?: Date; endsAt?: Date }>;
          status: 'active' | 'trialing' | 'inactive' | 'suspended' | 'cancelled';
          source: 'manual' | 'pilot' | 'import' | 'support'; startsAt: Date;
          currentPeriodEndsAt?: Date; billingCycle?: 'monthly' | 'yearly'; suspendedAt?: Date;
          cancelledAt?: Date; createdBy?: MongoId; updatedBy?: MongoId;
        };
        return {
          legacyMongoId: id(row._id), organizationLegacyMongoId: id(row.organizationId),
          planLegacyMongoId: optionalId(row.planId),
          addOns: row.addOns.map((addOn) => ({
            addOnLegacyMongoId: id(addOn.addOnId), startsAt: optionalDate(addOn.startsAt),
            endsAt: optionalDate(addOn.endsAt),
          })),
          status: row.status, source: row.source, startsAt: row.startsAt,
          currentPeriodEndsAt: optionalDate(row.currentPeriodEndsAt),
          billingCycle: row.billingCycle ?? null, suspendedAt: optionalDate(row.suspendedAt),
          cancelledAt: optionalDate(row.cancelledAt),
          createdByUserLegacyMongoId: optionalId(row.createdBy),
          updatedByUserLegacyMongoId: optionalId(row.updatedBy),
          createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
      entitlements: entitlements.map((document) => {
        const row = document as unknown as Timestamps & {
          _id: MongoId; organizationId: MongoId; moduleKey: string; effect: 'grant' | 'revoke';
          status: 'active' | 'inactive'; source: 'manual' | 'pilot' | 'import' | 'support';
          reason: string; validFrom?: Date; validUntil?: Date; actorUserId: MongoId;
        };
        return {
          legacyMongoId: id(row._id), organizationLegacyMongoId: id(row.organizationId),
          moduleKey: row.moduleKey, effect: row.effect, status: row.status, source: row.source,
          reason: row.reason, validFrom: optionalDate(row.validFrom), validUntil: optionalDate(row.validUntil),
          actorUserLegacyMongoId: id(row.actorUserId), createdAt: row.createdAt, updatedAt: row.updatedAt,
        };
      }),
    };
  }
}
