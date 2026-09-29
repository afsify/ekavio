import { createHash } from 'node:crypto';
import type { PostgresCustomerRepository } from '../domains/customers/repository.js';
import { formatInrMinor, parseInrDecimalToMinor } from '../domains/customerDues/money.js';
import type {
  CustomerDueEntry,
  PostgresCustomerDuesRepository,
} from '../domains/customerDues/repository.js';
import type {
  CreateCustomerDueEntryInput,
  CustomerDueListQuery,
  ReverseCustomerDueEntryInput,
} from '../schemas/customerDuesSchemas.js';
import { AppError } from '../utils/AppError.js';
import type { AuthorizationContext } from './requestContextService.js';

const branchIdFor = (context: AuthorizationContext): string => {
  if (!context.branchId) throw new AppError('An active branch context is required', 400);
  return context.branchId;
};

const fingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

const parseOccurredAt = (value: string | undefined, now: () => Date): Date => {
  if (!value) return now();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new AppError('Occurrence time is invalid', 400);
  return parsed;
};

const serializeEntry = (entry: CustomerDueEntry) => ({
  id: entry.id,
  organizationId: entry.organizationId,
  branchId: entry.branchId,
  customerId: entry.customerId,
  customerName: entry.customerName,
  entryType: entry.entryType,
  amountMinor: entry.amountMinor,
  signedEffectMinor: entry.signedEffectMinor,
  amount: formatInrMinor(BigInt(entry.amountMinor)),
  signedAmount: formatInrMinor(BigInt(entry.signedEffectMinor)),
  currency: entry.currency,
  dueDate: entry.dueDate,
  description: entry.description,
  reversesEntryId: entry.reversesEntryId,
  reversedByEntryId: entry.reversedByEntryId,
  reversedEntryType: entry.reversedEntryType,
  occurredAt: entry.occurredAt.toISOString(),
  createdAt: entry.createdAt.toISOString(),
});

const mapCustomerDuesError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : 'Customer Dues request failed';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === '23505' || /already reversed|idempotency|exceed/i.test(message)) {
    return new AppError(message, 409);
  }
  if (['23503', '23514', '22P02'].includes(code)
    || /requires|must|invalid|outside|assigned|canonical customer/i.test(message)) {
    return new AppError(message, 400);
  }
  return new AppError('Customer Dues request failed safely', 500);
};

export const createCustomerDuesService = (
  repository: PostgresCustomerDuesRepository,
  customers: PostgresCustomerRepository,
  now: () => Date = () => new Date(),
) => ({
  async create(context: AuthorizationContext, input: CreateCustomerDueEntryInput) {
    try {
      const branchId = branchIdFor(context);
      const amountMinor = parseInrDecimalToMinor(input.amount);
      const normalized = {
        customerId: input.customerId,
        entryType: input.entryType,
        amountMinor: amountMinor.toString(),
        currency: input.currency,
        dueDate: input.dueDate ?? null,
        description: input.description?.trim() || null,
        occurredAt: input.occurredAt ?? null,
      };
      const entry = await repository.create({
        organizationId: context.organizationId,
        branchId,
        customerId: input.customerId,
        entryType: input.entryType,
        amountMinor,
        currency: input.currency,
        dueDate: input.dueDate ?? null,
        description: normalized.description,
        sourceType: null,
        sourceId: null,
        actorMembershipId: context.membershipId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: fingerprint(normalized),
        occurredAt: parseOccurredAt(input.occurredAt, now),
      });
      return serializeEntry(entry);
    } catch (error) {
      throw mapCustomerDuesError(error);
    }
  },

  async reverse(
    context: AuthorizationContext,
    targetEntryId: string,
    input: ReverseCustomerDueEntryInput,
  ) {
    try {
      const branchId = branchIdFor(context);
      const normalized = {
        targetEntryId,
        description: input.description.trim(),
        occurredAt: input.occurredAt ?? null,
      };
      const entry = await repository.reverse({
        organizationId: context.organizationId,
        branchId,
        targetEntryId,
        description: normalized.description,
        actorMembershipId: context.membershipId,
        idempotencyKey: input.idempotencyKey,
        commandFingerprint: fingerprint(normalized),
        occurredAt: parseOccurredAt(input.occurredAt, now),
      });
      return serializeEntry(entry);
    } catch (error) {
      throw mapCustomerDuesError(error);
    }
  },

  async list(context: AuthorizationContext, query: CustomerDueListQuery) {
    try {
      const page = query.page;
      const limit = query.limit;
      const result = await repository.list({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.entryType ? { entryType: query.entryType } : {}),
        ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
        ...(query.dateTo ? { dateTo: query.dateTo } : {}),
        page,
        limit,
      });
      return {
        data: result.data.map(serializeEntry),
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      };
    } catch (error) {
      throw mapCustomerDuesError(error);
    }
  },

  async balances(context: AuthorizationContext, customerId: string) {
    try {
      const result = await repository.balances({
        organizationId: context.organizationId,
        branchId: branchIdFor(context),
        customerId,
      });
      if (!result) throw new AppError('Customer not found', 404);
      return {
        customerId,
        currency: 'INR' as const,
        ...result,
        organizationBalance: formatInrMinor(BigInt(result.organizationBalanceMinor)),
        branchBalance: formatInrMinor(BigInt(result.branchBalanceMinor)),
      };
    } catch (error) {
      throw mapCustomerDuesError(error);
    }
  },

  async history(context: AuthorizationContext, customerId: string, query: CustomerDueListQuery) {
    return this.list(context, { ...query, customerId });
  },

  async searchCustomers(
    context: AuthorizationContext,
    search: string | undefined,
    page: number,
    limit: number,
  ) {
    try {
      branchIdFor(context);
      const result = await customers.list({
        organizationId: context.organizationId,
        ...(search ? { search } : {}),
        page,
        limit,
      });
      return {
        data: result.data.map((customer) => ({
          id: customer.id,
          name: customer.name,
          status: customer.status,
        })),
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      };
    } catch (error) {
      throw mapCustomerDuesError(error);
    }
  },
});

export type CustomerDuesService = ReturnType<typeof createCustomerDuesService>;
