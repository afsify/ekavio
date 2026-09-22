import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';

export interface CustomerSummary { id: string; name: string; phone: string | null }
export interface ServiceSummary { id: string; name: string; durationMinutes?: number }
export interface ProviderSummary { membershipId?: string; name: string | null }
export interface QueueToken {
  id: string;
  tokenNumber: string;
  status: 'waiting' | 'serving' | 'completed' | 'cancelled';
  customer: CustomerSummary;
  service: ServiceSummary;
  provider: ProviderSummary | null;
  appointmentId: string | null;
  createdAt: string;
  version: number;
}
export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
export interface QueueResponse extends Paginated<QueueToken> {
  summary: { active: number; waiting: number; serving: number };
}

const useContextKey = () => {
  const organizationId = useAppStore((state) => state.activeTenantId);
  const branchId = useAppStore((state) => state.activeBranchId);
  return { organizationId, branchId };
};

export const queueKeys = {
  root: ['operational-queue'] as const,
  list: (organizationId: string | null, branchId: string | null, page: number) =>
    [...queueKeys.root, organizationId, branchId, page] as const,
};

export const useQueue = (page = 1) => {
  const context = useContextKey();
  return useQuery({
    queryKey: queueKeys.list(context.organizationId, context.branchId, page),
    queryFn: async () => (await client.get<QueueResponse>(`/queue?page=${page}&limit=20`)).data,
    enabled: Boolean(context.organizationId && context.branchId),
  });
};

export const useCreateToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string; serviceId: string; providerMembershipId?: string }) =>
      (await client.post<{ data: QueueToken }>('/queue', {
        ...input,
        idempotencyKey: crypto.randomUUID(),
      })).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKeys.root }),
  });
};

export const useUpdateTokenStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tokenId: string; status: QueueToken['status']; expectedVersion: number }) =>
      (await client.patch<{ data: QueueToken }>(`/queue/${input.tokenId}/status`, {
        status: input.status,
        expectedVersion: input.expectedVersion,
      })).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queueKeys.root }),
  });
};

export const useCustomers = (search = '') => {
  const context = useContextKey();
  return useQuery({
    queryKey: ['operational-customers', context.organizationId, search],
    queryFn: async () => (await client.get<Paginated<CustomerSummary>>('/customers', {
      params: { search: search || undefined, limit: 100 },
    })).data,
    enabled: Boolean(context.organizationId),
  });
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string }) =>
      (await client.post<{ data: CustomerSummary }>('/customers', input)).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operational-customers'] }),
  });
};

export const useBranchServices = () => {
  const context = useContextKey();
  return useQuery({
    queryKey: ['operational-services', context.organizationId, context.branchId],
    queryFn: async () => (await client.get<Paginated<ServiceSummary>>('/services', {
      params: { scope: 'branch', limit: 100 },
    })).data,
    enabled: Boolean(context.organizationId && context.branchId),
  });
};
