import type { AuthorizationContext } from './requestContextService.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  branchLocalDateTimeToInstant,
  instantToBranchBusinessDate,
  nextBusinessDate,
} from '../domains/appointments/timezone.js';
import type { AppointmentStatus } from '../domains/appointments/repository.js';
import type { QueueStatus, QueueTokenDetails, QueueTokenRecord } from '../domains/queue/repository.js';
import { AppError } from '../utils/AppError.js';

const branchIdFor = (context: AuthorizationContext): string => {
  if (!context.branchId) throw new AppError('An active branch context is required', 400);
  return context.branchId;
};

const positivePage = (value: unknown, fallback: number, maximum?: number): number => {
  const parsed = typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return maximum ? Math.min(parsed, maximum) : parsed;
};

export const pageInput = (page: unknown, limit: unknown) => ({
  page: positivePage(page, 1),
  limit: positivePage(limit, 20, 100),
});

export const mapOperationalError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : 'Operational request failed';
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (['23505', '23P01'].includes(code)
    || /version conflict|already used|overlap|conflicting key value|duplicate key/i.test(message)) {
    return new AppError(message, 409);
  }
  if (['23503', '23514', '22P02'].includes(code)) {
    return new AppError('Operational relationship is invalid for the active tenant and branch', 400);
  }
  if (/not found/i.test(message)) return new AppError(message, 404);
  if (/invalid|requires|must|cannot|closed|unavailable|active context|active branch|assignment/i.test(message)) {
    return new AppError(message, 400);
  }
  return new AppError('Operational request failed safely', 500);
};

const tokenDetails = async (
  context: AuthorizationContext,
  token: QueueTokenRecord,
): Promise<QueueTokenDetails> => {
  const detail = await runtimePersistence.queue.findById({
    organizationId: context.organizationId,
    branchId: branchIdFor(context),
    tokenId: token.id,
  });
  if (!detail) throw new Error('Queue token not found after committed mutation');
  return detail;
};

const currentSession = async (context: AuthorizationContext) => {
  const branchId = branchIdFor(context);
  const timezone = await runtimePersistence.branchTimezones.resolve(context.organizationId, branchId);
  const localBusinessDate = instantToBranchBusinessDate(new Date(), timezone);
  const session = await runtimePersistence.queue.openSession({
    organizationId: context.organizationId,
    branchId,
    localBusinessDate,
  });
  return { ...session, branchId, timezone, localBusinessDate };
};

export const operationalRuntimeService = Object.freeze({
  listCustomers: (context: AuthorizationContext, search: string | undefined, page: number, limit: number) =>
    runtimePersistence.customers.list({
      organizationId: context.organizationId,
      ...(search !== undefined ? { search } : {}),
      page,
      limit,
    }),
  createCustomer: (context: AuthorizationContext, input: { name: string; phone?: string | null; notes?: string | null }) =>
    runtimePersistence.customers.create({
      organizationId: context.organizationId,
      name: input.name,
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      homeBranchId: context.branchId ?? null,
    }),
  getCustomer: (context: AuthorizationContext, customerId: string) =>
    runtimePersistence.customers.findById(context.organizationId, customerId),
  updateCustomer: (context: AuthorizationContext, customerId: string, input: {
    name?: string; phone?: string | null; notes?: string | null; status?: 'active' | 'inactive';
  }) => runtimePersistence.customers.update({
    organizationId: context.organizationId, customerId, ...input,
  }),

  listServices: (context: AuthorizationContext, scope: 'branch' | 'organization', page: number, limit: number) =>
    runtimePersistence.services.list({
      organizationId: context.organizationId,
      ...(scope === 'branch' ? { branchId: branchIdFor(context), activeOnly: true } : {}),
      page,
      limit,
    }),
  createService: (context: AuthorizationContext, input: {
    name: string; description?: string | null; durationMinutes: number;
    priceMinor?: string | null; currency?: string | null;
  }) => runtimePersistence.services.createForBranch({
    organizationId: context.organizationId,
    branchId: branchIdFor(context),
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    durationMinutes: input.durationMinutes,
    priceMinor: input.priceMinor == null ? null : BigInt(input.priceMinor),
    ...(input.currency !== undefined ? { currency: input.currency } : {}),
  }),
  updateService: (context: AuthorizationContext, serviceId: string, input: {
    name?: string; description?: string | null; durationMinutes?: number;
    priceMinor?: string | null; currency?: string | null; active?: boolean;
  }) => {
    const { priceMinor, ...mutable } = input;
    return runtimePersistence.services.update({
      organizationId: context.organizationId,
      serviceId,
      ...mutable,
      ...(priceMinor !== undefined
        ? { priceMinor: priceMinor === null ? null : BigInt(priceMinor) }
        : {}),
    });
  },
  listProviders: (context: AuthorizationContext, serviceId: string) =>
    runtimePersistence.services.listProviders({
      organizationId: context.organizationId,
      branchId: branchIdFor(context),
      serviceId,
    }),
  assignProvider: (context: AuthorizationContext, serviceId: string, membershipId: string, active: boolean) =>
    runtimePersistence.services.assignProvider({
      organizationId: context.organizationId,
      branchId: branchIdFor(context),
      serviceId,
      membershipId,
      active,
    }),

  async createAppointment(context: AuthorizationContext, input: {
    customerId: string; serviceId: string; providerMembershipId?: string | null;
    localStart: string; notes?: string | null; idempotencyKey?: string | null;
  }) {
    const branchId = branchIdFor(context);
    const [timezone, service] = await Promise.all([
      runtimePersistence.branchTimezones.resolve(context.organizationId, branchId),
      runtimePersistence.services.findById(context.organizationId, input.serviceId),
    ]);
    if (!service?.active) throw new Error('Service is unavailable');
    const startsAt = branchLocalDateTimeToInstant(input.localStart, timezone);
    const endsAt = new Date(startsAt.getTime() + service.duration_minutes * 60_000);
    return runtimePersistence.appointments.create({
      organizationId: context.organizationId,
      branchId,
      customerId: input.customerId,
      serviceId: input.serviceId,
      ...(input.providerMembershipId !== undefined ? { providerMembershipId: input.providerMembershipId } : {}),
      startsAt,
      endsAt,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      actorMembershipId: context.membershipId,
    });
  },
  async listAppointments(context: AuthorizationContext, date: string, page: number, limit: number) {
    const branchId = branchIdFor(context);
    const timezone = await runtimePersistence.branchTimezones.resolve(context.organizationId, branchId);
    return runtimePersistence.appointments.list({
      organizationId: context.organizationId,
      branchId,
      startsAt: branchLocalDateTimeToInstant(`${date}T00:00:00`, timezone),
      endsAt: branchLocalDateTimeToInstant(`${nextBusinessDate(date)}T00:00:00`, timezone),
      page,
      limit,
    });
  },
  getAppointment: (context: AuthorizationContext, appointmentId: string) =>
    runtimePersistence.appointments.findById({
      organizationId: context.organizationId,
      branchId: branchIdFor(context),
      appointmentId,
    }),
  transitionAppointment: (context: AuthorizationContext, appointmentId: string, input: {
    status: AppointmentStatus; expectedVersion: number; reason?: string | null;
  }) => runtimePersistence.appointments.transition({
    organizationId: context.organizationId,
    branchId: branchIdFor(context),
    appointmentId,
    toStatus: input.status,
    expectedVersion: input.expectedVersion,
    actorMembershipId: context.membershipId,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
  }),

  async createQueueToken(context: AuthorizationContext, input: {
    customerId: string; serviceId: string; providerMembershipId?: string | null;
    idempotencyKey?: string | null;
  }) {
    const session = await currentSession(context);
    const outcome = await runtimePersistence.queue.createTokenWithOutcome({
      organizationId: context.organizationId,
      branchId: session.branchId,
      sessionId: session.id,
      customerId: input.customerId,
      serviceId: input.serviceId,
      ...(input.providerMembershipId !== undefined ? { providerMembershipId: input.providerMembershipId } : {}),
      ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
      actorMembershipId: context.membershipId,
    });
    return { ...(await tokenDetails(context, outcome.token)), created: outcome.created };
  },
  listQueue: (context: AuthorizationContext, page: number, limit: number) =>
    runtimePersistence.queue.listActive({
      organizationId: context.organizationId,
      branchId: branchIdFor(context),
      page,
      limit,
    }),
  async transitionQueueToken(context: AuthorizationContext, tokenId: string, input: {
    status: QueueStatus; expectedVersion: number; reason?: string | null;
  }) {
    const token = await runtimePersistence.queue.transition({
      organizationId: context.organizationId,
      branchId: branchIdFor(context),
      tokenId,
      toStatus: input.status,
      expectedVersion: input.expectedVersion,
      actorMembershipId: context.membershipId,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    });
    return tokenDetails(context, token);
  },
  async checkInAppointment(context: AuthorizationContext, appointmentId: string, idempotencyKey: string) {
    const session = await currentSession(context);
    const outcome = await runtimePersistence.queue.checkInAppointmentWithOutcome({
      organizationId: context.organizationId,
      branchId: session.branchId,
      sessionId: session.id,
      appointmentId,
      idempotencyKey,
      actorMembershipId: context.membershipId,
    });
    return { ...(await tokenDetails(context, outcome.token)), created: outcome.created };
  },
});
