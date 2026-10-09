import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { DashboardData } from '../components/analytics/contracts';

export function useOperationalScope() {
  const { user, activeTenantId, activeBranchId, entitlements } = useAppStore();
  return [user?.id, activeTenantId, activeBranchId, user?.permissions?.join(','), JSON.stringify(entitlements)] as const;
}
export function useOperationalContext() {
  const { user, activeTenantId, activeBranchId, entitlements } = useAppStore();
  const permissions = user?.permissions ?? [];
  const facts = useQuery({
    queryKey: ['dashboardStats', user?.id, activeTenantId, activeBranchId, permissions, entitlements],
    enabled: Boolean(user && activeTenantId && activeBranchId), staleTime: 30_000,
    queryFn: async ({ signal }) => (await client.get<{ data: DashboardData }>('/analytics/dashboard', { signal })).data.data,
  });
  const branchName = user?.memberships?.find(m => m.organizationId === activeTenantId)?.branches.find(b => b.id === activeBranchId)?.name ?? 'Selected branch';
  return { ...facts, branchName, timezone: facts.data?.timezone, businessDate: facts.data?.businessDate };
}
