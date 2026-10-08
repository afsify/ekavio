import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
import type { NotificationData } from '../components/analytics/contracts';
export function useNotifications(page=1,unread=false,category=''){
 const {user,activeTenantId,entitlements}=useAppStore();
 return useQuery({queryKey:['notifications',user?.id,activeTenantId,user?.permissions?.join(','),entitlements?.modules.filter(m=>m.enabled).map(m=>m.key).join(','),page,unread,category],enabled:Boolean(user&&activeTenantId),staleTime:30_000,refetchInterval:60_000,refetchIntervalInBackground:false,queryFn:async()=>(await client.get<{data:NotificationData}>('/notifications',{params:{page,unread:String(unread),...(category?{category}:{})}})).data.data});
}
