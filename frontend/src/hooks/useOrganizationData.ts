import { useQuery } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { useOperationalScope } from './useOperationalContext';
export function useOrganizationData<T>(path:string,enabled=true) {
  const tenant=useAppStore(s=>s.activeTenantId);
  const scope=useOperationalScope();
  return useQuery({queryKey:['organization-admin',...scope,path],enabled:enabled&&Boolean(tenant),queryFn:async({signal})=>(await client.get<{data:T}>(path,{signal})).data.data});
}
