import React, { useState } from 'react';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/useAppStore';

export const TenantSwitcher: React.FC<{ onSwitching?: (value: boolean) => void }> = ({ onSwitching }) => {
  const queryClient = useQueryClient();
  const { user, activeTenantId, activeBranchId, setActiveTenant, setActiveBranch } =
    useAppStore();
  const [switching, setSwitching] = useState(false);
  const mutations = useIsMutating();
  const memberships = user?.memberships ?? [];
  const activeMembership = memberships.find(
    (membership) => membership.organizationId === activeTenantId,
  );

  if (memberships.length === 0) return null;

  const switchContext = async (change: () => Promise<boolean>, label: string) => {
    if (switching || mutations > 0) return;
    setSwitching(true);
    onSwitching?.(true);
    try {
      // Unmount old workspace content; cancel/clear old data before and after
      // the server-authoritative refresh. Late old requests cannot populate UI.
      await queryClient.cancelQueries();
      queryClient.clear();
      const changed = await change();
      await queryClient.cancelQueries();
      queryClient.clear();
      if (!changed) toast.error(`You no longer have access to that ${label}`);
      await queryClient.resetQueries();
    } finally {
      setSwitching(false);
      onSwitching?.(false);
    }
  };

  return (
    <div className="context-selectors" aria-busy={switching || undefined}>
        <label className="context-control">
          <span>Workspace</span>
          <select
            aria-label="Active workspace"
            value={activeTenantId ?? user?.tenantId}
            disabled={switching || mutations > 0 || memberships.length < 2}
            onChange={(event) => { const value = event.target.value; void switchContext(() => setActiveTenant(value), 'workspace'); }}
          >
            {memberships.map((membership) => (
              <option key={membership.id} value={membership.organizationId}>
                {membership.orgName ?? 'Workspace'}
              </option>
            ))}
          </select>
        </label>
        <label className="context-control">
          <span>Branch</span>
          <select
            aria-label="Active branch"
            value={activeBranchId ?? ''}
            disabled={switching || mutations > 0 || (activeMembership?.branches.length ?? 0) < 2}
            onChange={(event) => { const value = event.target.value; void switchContext(() => setActiveBranch(value), 'branch'); }}
          >
            {activeMembership?.branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
    </div>
  );
};

export default TenantSwitcher;
