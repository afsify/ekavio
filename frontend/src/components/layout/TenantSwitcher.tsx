import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/useAppStore';

export const TenantSwitcher: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, activeTenantId, activeBranchId, setActiveTenant, setActiveBranch } =
    useAppStore();
  const [switching, setSwitching] = useState(false);
  const memberships = user?.memberships ?? [];
  const activeMembership = memberships.find(
    (membership) => membership.organizationId === activeTenantId,
  );

  if (memberships.length === 0) return null;

  const switchTenant = async (organizationId: string) => {
    setSwitching(true);
    const changed = await setActiveTenant(organizationId);
    setSwitching(false);
    if (!changed) {
      toast.error('You no longer have access to that workspace');
      return;
    }
    await queryClient.invalidateQueries();
  };

  const switchBranch = async (branchId: string) => {
    setSwitching(true);
    const changed = await setActiveBranch(branchId);
    setSwitching(false);
    if (!changed) {
      toast.error('You no longer have access to that branch');
      return;
    }
    await queryClient.invalidateQueries();
  };

  return (
    <div className="flex flex-col space-y-2">
      {memberships.length > 1 && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Active Workspace
          <select
            aria-label="Active workspace"
            value={activeTenantId ?? user?.tenantId}
            disabled={switching}
            onChange={(event) => void switchTenant(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-white"
          >
            {memberships.map((membership) => (
              <option key={membership.id} value={membership.organizationId}>
                {membership.orgName ?? 'Workspace'}
              </option>
            ))}
          </select>
        </label>
      )}
      {(activeMembership?.branches.length ?? 0) > 1 && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Active Branch
          <select
            aria-label="Active branch"
            value={activeBranchId ?? ''}
            disabled={switching}
            onChange={(event) => void switchBranch(event.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-sm text-white"
          >
            {activeMembership?.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export default TenantSwitcher;
