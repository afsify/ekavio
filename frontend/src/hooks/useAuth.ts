import { useMutation } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore, type SessionPayload } from '../store/useAppStore';
import { sessionRevision, sessionSignal, SESSION_REQUEST_TIMEOUT_MS } from '../store/sessionLifecycle';

interface LoginCredentials {
  identifier: string;
  password: string;
}

export const useLogin = () => {
  const establishSession = useAppStore((state) => state.establishSession);

  return useMutation({
    mutationFn: async (credentials: LoginCredentials) => {
      const revision = useAppStore.getState().beginLogin();
      const response = await client.post<SessionPayload>('/auth/login', credentials, {
        signal: sessionSignal(), timeout: SESSION_REQUEST_TIMEOUT_MS,
      });
      if (revision !== sessionRevision()) throw new Error('Session changed. Please try signing in again.');
      establishSession(response.data);
      return response.data;
    },
  });
};
