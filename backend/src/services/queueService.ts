import { Queue } from '../models/Queue.js';
import { organizationResourceScope, organizationScope, type OrganizationContext } from '../utils/tenantScope.js';

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

export const createQueueStatusUpdater = (repository: QueueStatusRepository) =>
  async (context: OrganizationContext, tokenId: string, status: string) =>
    repository.updateStatus(organizationResourceScope(context, tokenId), status);

export const createTokenService = async (context: OrganizationContext, data: QueueTokenInput) => {
  const { customerName, phone, serviceType, tokenNumber: customTokenNumber } = data;

  const count = await Queue.countDocuments(organizationScope(context));
  const tokenNumber = customTokenNumber || `#${count + 1}`;

  const queueEntry = new Queue({
    tenantId: context.organizationId,
    tokenNumber,
    customerName,
    phone,
    serviceType,
    status: 'waiting',
  });

  await queueEntry.save();
  return queueEntry;
};

export const getQueueService = async (context: OrganizationContext, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr ?? '') || 1;
  const limit = parseInt(limitStr ?? '') || 10;
  const skip = (page - 1) * limit;

  const query = {
    ...organizationScope(context),
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
});
