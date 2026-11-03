import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { frontendConfig } from "../config/env";
import { useAppStore, type SessionPayload } from "../store/useAppStore";
import { sessionRevision, sessionSignal, sessionErrorStatus, SESSION_REQUEST_TIMEOUT_MS } from '../store/sessionLifecycle';
import { markStartup } from '../utils/startupDiagnostics';

const sessionClient = axios.create({
  baseURL: frontendConfig.apiUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  timeout: SESSION_REQUEST_TIMEOUT_MS,
});

export const client = axios.create({
  baseURL: frontendConfig.apiUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export const publicClient = axios.create({
  baseURL: frontendConfig.apiUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

for (const transport of [sessionClient, publicClient]) {
  transport.interceptors.request.use((config) => {
    markStartup('backend-first-request');
    return config;
  });
}

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  markStartup('backend-first-request');
  const request = config as RetryableRequestConfig;
  // A retry is valid only in the authority context that authorized it.
  if (request._sessionRevision !== undefined && request._sessionRevision !== sessionRevision()) {
    throw new axios.CanceledError('Workspace session changed');
  }
  if (request._sessionAuthority !== undefined && request._sessionAuthority !== authoritySnapshot()) {
    throw new axios.CanceledError('Workspace authority changed');
  }
  request._sessionRevision = sessionRevision();
  request._sessionAuthority = authoritySnapshot();
  const { token, activeTenantId, activeBranchId } = useAppStore.getState();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (activeTenantId) {
    config.headers["x-tenant-id"] = activeTenantId;
  }
  if (activeBranchId) {
    config.headers["x-branch-id"] = activeBranchId;
  }

  return config;
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _sessionRevision?: number;
  _sessionAuthority?: string;
};

/** In-memory comparison only; never persist/log this snapshot or include tokens. */
function authoritySnapshot(): string | undefined {
  const state = useAppStore.getState();
  if (!state.isAuthenticated || !state.user) return undefined;
  return JSON.stringify([
    state.user.id, state.activeTenantId, state.activeBranchId,
    state.user.membershipId, state.user.role, state.user.customRoleId,
    [...(state.user.permissions ?? [])].sort(), state.isPlatformOperator, state.entitlements,
  ]);
}

export interface MutationRecoveryError extends AxiosError {
  recovery: { kind: 'explicit-action-required'; outcome: 'unknown'; automaticReplay: false };
}

/** Callers should offer sign-in/verification, retain drafts, and require explicit submission. */
export function isMutationRecoveryError(error: unknown): error is MutationRecoveryError {
  if (!axios.isAxiosError(error) || !('recovery' in error)) return false;
  const recovery = error.recovery;
  return typeof recovery === 'object' && recovery !== null &&
    'kind' in recovery && recovery.kind === 'explicit-action-required' &&
    'outcome' in recovery && recovery.outcome === 'unknown' &&
    'automaticReplay' in recovery && recovery.automaticReplay === false;
}
let refreshRequest: { revision: number; promise: Promise<{ token: string; revision: number }> } | undefined;

export const restoreSession = async (
  selection: {
    organizationId?: string;
    branchId?: string;
  } = {},
  signal?: AbortSignal,
): Promise<SessionPayload> => {
  const response = await sessionClient.post<SessionPayload>(
    "/auth/refresh",
    undefined,
    {
      signal,
      headers: {
        ...(selection.organizationId
          ? { "x-tenant-id": selection.organizationId }
          : {}),
        ...(selection.branchId ? { "x-branch-id": selection.branchId } : {}),
      },
    },
  );
  return response.data;
};

export const requestLogout = async (): Promise<void> => {
  await sessionClient.post("/auth/logout");
};

client.interceptors.response.use(
  (response) => {
    const config = response.config as RetryableRequestConfig;
    if (config._sessionRevision !== undefined && config._sessionRevision !== sessionRevision()) {
      throw new axios.CanceledError('Workspace session changed');
    }
    if (config._sessionAuthority !== undefined && config._sessionAuthority !== authoritySnapshot()) {
      throw new axios.CanceledError('Workspace authority changed');
    }
    if (useAppStore.getState().isAuthenticated && !String(config.url).startsWith('/auth/')) {
      markStartup('workspace-first-data');
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = String(originalRequest?.url ?? "");
    if (originalRequest?._sessionRevision !== undefined && originalRequest._sessionRevision !== sessionRevision()) {
      return Promise.reject(new axios.CanceledError('Workspace session changed'));
    }

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest._retry
    ) {
      return Promise.reject(error);
    }

    if (
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/refresh") ||
      requestUrl.includes("/auth/logout")
    ) {
      return Promise.reject(error);
    }

    // Never replay business commands, even PUT/DELETE. A 401 alone is not proof
    // that an ambiguous write did not execute. Preserve the original Axios error.
    if (!['get', 'head'].includes(originalRequest.method?.toLowerCase() ?? '')) {
      const recovery: MutationRecoveryError['recovery'] = {
        kind: 'explicit-action-required', outcome: 'unknown', automaticReplay: false,
      };
      return Promise.reject(Object.assign(error, { recovery }));
    }
    // Only application read routes participate; do not retry arbitrary external
    // URLs or account-action endpoints on the strength of an HTTP method alone.
    if (originalRequest.baseURL !== frontendConfig.apiUrl ||
      !/^\/(?!\/)/.test(requestUrl) || requestUrl.includes('\\') || requestUrl.startsWith('/auth/')) {
      return Promise.reject(error);
    }
    if (originalRequest.signal?.aborted) throw new axios.CanceledError('Request canceled');
    const authority = originalRequest._sessionAuthority;
    if (!authority || authority !== authoritySnapshot()) throw new axios.CanceledError('Workspace authority changed');

    originalRequest._retry = true;
    const revision = sessionRevision();
    if (refreshRequest?.revision !== revision) {
      const { activeTenantId, activeBranchId } = useAppStore.getState();
      const promise = restoreSession({
        ...(activeTenantId ? { organizationId: activeTenantId } : {}),
        ...(activeBranchId ? { branchId: activeBranchId } : {}),
      }, sessionSignal()).then((payload) => {
        if (revision !== sessionRevision() || authority !== authoritySnapshot()) {
          throw new axios.CanceledError('Workspace authority changed');
        }
        useAppStore.getState().establishSession(payload);
        return { token: payload.accessToken, revision: sessionRevision() };
      }).catch((refreshError: unknown) => {
        // A timeout, network error, 403 context rejection or 5xx is not an expired session.
        if (revision === sessionRevision() && authority === authoritySnapshot() && sessionErrorStatus(refreshError) === 401) {
          useAppStore.getState().clearSession();
        }
        throw refreshError;
      }).finally(() => {
        if (refreshRequest?.revision === revision) refreshRequest = undefined;
      });
      refreshRequest = { revision, promise };
    }
    const renewed = await refreshRequest.promise;
    if (renewed.revision !== sessionRevision() || authority !== authoritySnapshot()) {
      throw new axios.CanceledError('Workspace authority changed');
    }
    if (originalRequest.signal?.aborted) throw new axios.CanceledError('Request canceled');
    originalRequest._sessionRevision = renewed.revision;
    originalRequest.headers.Authorization = `Bearer ${renewed.token}`;
    return client(originalRequest);
  },
);

export default client;
