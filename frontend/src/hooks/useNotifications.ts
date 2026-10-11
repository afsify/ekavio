import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { useOperationalScope } from './useOperationalContext';
import { client } from '../api/client';
import type { NotificationData } from '../components/analytics/contracts';
export function useNotifications(page=1,unread=false,category=''){
 const {user,activeTenantId}=useAppStore(),scope=useOperationalScope();
 return useQuery({queryKey:['notifications',...scope,page,unread,category],enabled:Boolean(user&&activeTenantId),staleTime:30_000,refetchInterval:60_000,refetchIntervalInBackground:false,queryFn:async({signal})=>(await client.get<{data:NotificationData}>('/notifications',{signal,params:{page,unread:String(unread),...(category?{category}:{})}})).data.data});
}
