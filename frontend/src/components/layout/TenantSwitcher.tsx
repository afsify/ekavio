import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "../../store/useAppStore";

export const TenantSwitcher: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, activeTenantId, setActiveTenant } = useAppStore();

  // If the user doesn't have multiple assignments, don't show the switcher
  if (!user?.assignments || user.assignments.length === 0) {
    return null;
  }

  // Combine default tenant and assignments to create the list of options
  const allTenants = [
    { tenantId: user.tenantId, orgName: "Default Organization (Primary)" },
    ...user.assignments,
  ];

  const handleTenantChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTenantId = e.target.value;
    setActiveTenant(newTenantId);

    // Invalidate all queries to refetch data for the new tenant instantly
    queryClient.invalidateQueries();
  };

  return (
    <div className="flex flex-col space-y-1">
      <label
        htmlFor="tenant-switcher"
        className="text-xs font-semibold uppercase tracking-wider text-slate-300"
      >
        Active Workspace
      </label>
      <select
        id="tenant-switcher"
        value={activeTenantId || user.tenantId}
        onChange={handleTenantChange}
        className="block w-full rounded-xl border border-slate-700/80 bg-slate-900/70 py-2 px-3 text-sm text-white focus:border-indigo-500 focus:ring-indigo-500/20 focus:outline-none shadow-inner transition duration-200"
      >
        {allTenants.map((t, idx) => (
          <option key={`${t.tenantId}-${idx}`} value={t.tenantId}>
            {t.orgName || `Workspace ${idx + 1}`}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TenantSwitcher;
