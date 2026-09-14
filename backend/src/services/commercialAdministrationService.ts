import mongoose from 'mongoose';
import { isModuleKey, type ModuleKey } from '../commercial/catalogue.js';
import { AddOn } from '../models/AddOn.js';
import { Entitlement } from '../models/Entitlement.js';
import { ModuleDefinition } from '../models/ModuleDefinition.js';
import { Organization } from '../models/Organization.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';
import type {
  UpdateSubscriptionInput,
  UpsertEntitlementInput,
} from '../schemas/billingSchemas.js';
import { AppError } from '../utils/AppError.js';
import { entitlementService } from './entitlementService.js';

const assertObjectId = (value: string): void => {
  if (!mongoose.isValidObjectId(value)) throw new AppError('Organization not found', 404);
};

const parseDate = (value: string | null | undefined): Date | undefined =>
  value ? new Date(value) : undefined;

export const getOrganizationCommercialState = async (organizationId: string) => {
  assertObjectId(organizationId);
  if (!(await Organization.exists({ _id: organizationId }))) {
    throw new AppError('Organization not found', 404);
  }
  return entitlementService.getEffective(organizationId);
};

export const updateOrganizationSubscription = async (
  organizationId: string,
  actorUserId: string,
  input: UpdateSubscriptionInput,
) => {
  assertObjectId(organizationId);
  if (!(await Organization.exists({ _id: organizationId }))) {
    throw new AppError('Organization not found', 404);
  }

  const uniqueAddOnKeys = [...new Set(input.addOns.map((assignment) => assignment.key))];
  if (uniqueAddOnKeys.length !== input.addOns.length) {
    throw new AppError('Duplicate add-on assignment', 400);
  }

  const [existingSubscription, plan, addOns] = await Promise.all([
    Subscription.findOne({ organizationId }).select('startsAt').lean(),
    input.planKey
      ? Plan.findOne({ key: input.planKey, status: 'active', available: true }).lean()
      : Promise.resolve(null),
    AddOn.find({ key: { $in: uniqueAddOnKeys }, status: 'active', available: true }).lean(),
  ]);
  if (input.planKey && !plan) throw new AppError('Plan not found or inactive', 400);
  if (addOns.length !== uniqueAddOnKeys.length) {
    throw new AppError('One or more add-ons are missing or inactive', 400);
  }
  const addOnByKey = new Map(addOns.map((addOn) => [addOn.key, addOn]));
  const startsAt = parseDate(input.startsAt) ?? existingSubscription?.startsAt ?? new Date();
  const currentPeriodEndsAt = parseDate(input.currentPeriodEndsAt);
  if (currentPeriodEndsAt && currentPeriodEndsAt <= startsAt) {
    throw new AppError('Current period end must be after subscription start', 400);
  }
  const setValues: Record<string, unknown> = {
    organizationId,
    addOns: input.addOns.map((assignment) => ({
      addOnId: addOnByKey.get(assignment.key)!._id,
      ...(assignment.startsAt ? { startsAt: new Date(assignment.startsAt) } : {}),
      ...(assignment.endsAt ? { endsAt: new Date(assignment.endsAt) } : {}),
    })),
    status: input.status,
    source: input.source,
    startsAt,
    updatedBy: actorUserId,
    ...(plan ? { planId: plan._id } : {}),
    ...(currentPeriodEndsAt ? { currentPeriodEndsAt } : {}),
    ...(input.billingCycle ? { billingCycle: input.billingCycle } : {}),
    ...(input.status === 'suspended' ? { suspendedAt: new Date() } : {}),
    ...(input.status === 'cancelled' ? { cancelledAt: new Date() } : {}),
  };
  const unsetValues: Record<string, 1> = {};
  if (!plan) unsetValues.planId = 1;
  if (!currentPeriodEndsAt) unsetValues.currentPeriodEndsAt = 1;
  if (!input.billingCycle) unsetValues.billingCycle = 1;
  if (input.status !== 'suspended') unsetValues.suspendedAt = 1;
  if (input.status !== 'cancelled') unsetValues.cancelledAt = 1;

  await Subscription.findOneAndUpdate(
    { organizationId },
    {
      $set: setValues,
      $setOnInsert: { createdBy: actorUserId },
      ...(Object.keys(unsetValues).length > 0 ? { $unset: unsetValues } : {}),
    },
    { upsert: true, runValidators: true, new: true },
  );

  return entitlementService.getEffective(organizationId);
};

export const upsertOrganizationEntitlement = async (
  organizationId: string,
  actorUserId: string,
  moduleKeyValue: string,
  input: UpsertEntitlementInput,
) => {
  assertObjectId(organizationId);
  if (!(await Organization.exists({ _id: organizationId }))) {
    throw new AppError('Organization not found', 404);
  }
  if (!isModuleKey(moduleKeyValue)) throw new AppError('Unknown canonical module', 400);
  const moduleKey: ModuleKey = moduleKeyValue;
  if (!(await ModuleDefinition.exists({ key: moduleKey, status: 'active' }))) {
    throw new AppError('Module is not available', 400);
  }

  const setValues: Record<string, unknown> = {
    organizationId,
    moduleKey,
    effect: input.effect,
    status: input.status,
    source: input.source,
    reason: input.reason,
    actorUserId,
    ...(input.validFrom ? { validFrom: new Date(input.validFrom) } : {}),
    ...(input.validUntil ? { validUntil: new Date(input.validUntil) } : {}),
  };
  const unsetValues: Record<string, 1> = {};
  if (!input.validFrom) unsetValues.validFrom = 1;
  if (!input.validUntil) unsetValues.validUntil = 1;

  await Entitlement.findOneAndUpdate(
    { organizationId, moduleKey },
    {
      $set: setValues,
      ...(Object.keys(unsetValues).length > 0 ? { $unset: unsetValues } : {}),
    },
    { upsert: true, runValidators: true, new: true },
  );

  return entitlementService.getEffective(organizationId);
};
