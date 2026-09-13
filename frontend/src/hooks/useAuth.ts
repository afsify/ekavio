import { useMutation } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore, type UserProfile, type ThemeConfig } from '../store/useAppStore';

interface LoginCredentials {
  phone: string;
  password: string;
}

export const useLogin = () => {
  const loginAction = useAppStore((state) => state.login);

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await client.post('/auth/login', credentials);
      return response.data;
    },
    onSuccess: (data, variables) => {
      const accessToken: string = data.accessToken;
      const refreshToken: string = data.refreshToken;
      const userPayload: UserProfile = {
        id: data.user?.id || data.userId || 'unknown-id',
        name: data.user?.name || 'Authorized Admin',
        role: data.user?.role || data.role || 'Admin',
        tenantId: data.user?.tenantId || data.tenantId || 'default-tenant',
        phone: data.user?.phone || variables.phone,
      };

      const themeConfig: ThemeConfig = data.theme || {
        mode: 'dark',
        primaryColor: '#4F46E5',
      };

      loginAction(userPayload, accessToken, refreshToken, themeConfig);
    },
  });
};
