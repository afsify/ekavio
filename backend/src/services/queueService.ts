import { Queue } from '../models/Queue.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';
import {
  legacyOrganizationResourceScope,
  legacyOrganizationScope,
  type OperationalIdentityBridge,
} from '../persistence/operationalIdentity.js';
import type { AuthorizationContext } from './requestContextService.js';

interface QueueTokenInput {
  customerName: string;
  phone: string;
  serviceType: string;
  tokenNumber?: string;
}

export interface QueueStatusRepository {
  updateStatus(
    filter: { _id: string; tenantId: string },
    status: string,
  ): Promise<unknown | null>;
}

export const createQueueStatusUpdater = (
  repository: QueueStatusRepository,
  bridge: OperationalIdentityBridge,
) => async (context: AuthorizationContext, tokenId: string, status: string) => {
  const operational = await bridge.resolve(context);
  return repository.updateStatus(legacyOrganizationResourceScope(operational, tokenId), status);
};

export const createTokenService = async (context: AuthorizationContext, data: QueueTokenInput) => {
  const { customerName, phone, serviceType, tokenNumber: customTokenNumber } = data;
  const operational = await runtimePersistence.operationalIdentity.resolve(context);

  const count = await Queue.countDocuments(legacyOrganizationScope(operational));
  const tokenNumber = customTokenNumber || `#${count + 1}`;

  const queueEntry = new Queue({
    tenantId: operational.legacyMongoOrganizationId,
    tokenNumber,
    customerName,
    phone,
    serviceType,
    status: 'waiting',
  });

  await queueEntry.save();
  return queueEntry;
};

export const getQueueService = async (context: AuthorizationContext, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr ?? '') || 1;
  const limit = parseInt(limitStr ?? '') || 10;
  const skip = (page - 1) * limit;

  const operational = await runtimePersistence.operationalIdentity.resolve(context);
  const query = {
    ...legacyOrganizationScope(operational),
    status: { $in: ['waiting', 'serving'] as const },
  };

  const totalDocs = await Queue.countDocuments(query);
  const totalPages = Math.ceil(totalDocs / limit);

  const queue = await Queue.find(query)
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);

  return { data: queue, totalDocs, totalPages };
};

export const updateTokenStatusService = createQueueStatusUpdater({
  updateStatus: (filter, status) =>
    Queue.findOneAndUpdate(
      filter,
      { status },
      { new: true, runValidators: true },
    ),
}, runtimePersistence.operationalIdentity);
