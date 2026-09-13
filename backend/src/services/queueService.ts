import { Queue } from '../models/Queue.js';

interface QueueTokenInput {
  customerName: string;
  phone: string;
  serviceType: string;
  tokenNumber?: string;
}

export const createTokenService = async (tenantId: string, data: QueueTokenInput) => {
  const { customerName, phone, serviceType, tokenNumber: customTokenNumber } = data;

  const count = await Queue.countDocuments({ tenantId });
  const tokenNumber = customTokenNumber || `#${count + 1}`;

  const queueEntry = new Queue({
    tenantId,
    tokenNumber,
    customerName,
    phone,
    serviceType,
    status: 'waiting',
  });

  await queueEntry.save();
  return queueEntry;
};

export const getQueueService = async (tenantId: string, pageStr?: string, limitStr?: string) => {
  const page = parseInt(pageStr ?? '') || 1;
  const limit = parseInt(limitStr ?? '') || 10;
  const skip = (page - 1) * limit;

  const query = {
    tenantId,
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

export const updateTokenStatusService = async (tenantId: string, tokenId: string, status: string) => {
  const updatedToken = await Queue.findOneAndUpdate(
    { _id: tokenId, tenantId },
    { status },
    { new: true, runValidators: true }
  );

  return updatedToken;
};
