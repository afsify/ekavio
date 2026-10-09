import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { useOperationalScope } from './useOperationalContext';
import { saveCustomer, blankCustomer } from '../utils/customerDraft';

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
  const scope = useOperationalScope();
  const permissions = useAppStore(s => s.user?.permissions ?? []);
  return { organizationId, branchId, scope, permissions };
};

export const queueKeys = {
  root: ['operational-queue'] as const,
  list: (organizationId: string | null, branchId: string | null, page: number) =>
    [...queueKeys.root, organizationId, branchId, page] as const,
};

export const useQueue = (page = 1) => {
  const context = useContextKey();
  return useQuery({
    queryKey: [...queueKeys.list(context.organizationId, context.branchId, page), ...context.scope],
    queryFn: async ({ signal }) => (await client.get<QueueResponse>(`/queue?page=${page}&limit=20`, { signal })).data,
    enabled: Boolean(context.organizationId && context.branchId),
  });
};

export const useCreateToken = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string; serviceId: string; providerMembershipId?: string; idempotencyKey: string }) =>
      (await client.post<{ data: QueueToken }>('/queue', {
        ...input,
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
    queryKey: ['operational-customers', ...context.scope, search],
    queryFn: async ({ signal }) => (await client.get<Paginated<CustomerSummary>>('/customers', {
      signal,
      params: { search: search || undefined, limit: 100 },
    })).data,
    enabled: Boolean(context.organizationId && context.permissions.includes('customers.read')),
  });
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; phone?: string }) =>
      (await saveCustomer({ ...blankCustomer, ...input }, {})).data as CustomerSummary,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operational-customers'] }),
  });
};

export const useBranchServices = (search = '') => {
  const context = useContextKey();
  return useQuery({
    queryKey: ['operational-services', ...context.scope, search],
    queryFn: async ({ signal }) => (await client.get<Paginated<ServiceSummary>>('/services', {
      signal, params: { scope: 'branch', limit: 100, search: search || undefined },
    })).data,
    enabled: Boolean(context.organizationId && context.branchId && context.permissions.includes('services.read')),
  });
};
