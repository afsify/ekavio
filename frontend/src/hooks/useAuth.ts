import { useMutation } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore, type SessionPayload } from '../store/useAppStore';

interface LoginCredentials {
  phone: string;
  password: string;
}

export const useLogin = () => {
  const establishSession = useAppStore((state) => state.establishSession);

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const response = await client.post<SessionPayload>('/auth/login', credentials);
      return response.data;
    },
    onSuccess: (payload) => {
      establishSession(payload);
    },
  });
};
