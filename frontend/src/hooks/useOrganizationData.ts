import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
export function useOrganizationData<T>(path:string,enabled=true) {
  const tenant=useAppStore(s=>s.activeTenantId);
  return useQuery({queryKey:['organization-admin',tenant,path],enabled,queryFn:async()=>(await client.get<{data:T}>(path)).data.data});
}
