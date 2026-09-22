import axios, { type InternalAxiosRequestConfig } from "axios";
import { frontendConfig } from "../config/env";
import { useAppStore, type SessionPayload } from "../store/useAppStore";

const sessionClient = axios.create({
  baseURL: frontendConfig.apiUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

export const client = axios.create({
  baseURL: frontendConfig.apiUrl,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
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

interface FailedRequest {
  resolve: (token: string) => void;
  reject: (reason?: unknown) => void;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token?: string) => {
  for (const pendingRequest of failedQueue) {
    if (error || !token) {
      pendingRequest.reject(error ?? new Error("Session refresh failed"));
    } else {
      pendingRequest.resolve(token);
    }
  }
  failedQueue = [];
};

export const restoreSession = async (
  selection: {
    organizationId?: string;
    branchId?: string;
  } = {},
): Promise<SessionPayload> => {
  const response = await sessionClient.post<SessionPayload>(
    "/auth/refresh",
    undefined,
    {
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
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = String(originalRequest?.url ?? "");

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
      useAppStore.getState().clearSession();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      originalRequest._retry = true;
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((accessToken) => {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return client(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { activeTenantId, activeBranchId } = useAppStore.getState();
      const payload = await restoreSession({
        ...(activeTenantId ? { organizationId: activeTenantId } : {}),
        ...(activeBranchId ? { branchId: activeBranchId } : {}),
      });
      useAppStore.getState().establishSession(payload);
      processQueue(undefined, payload.accessToken);
      originalRequest.headers.Authorization = `Bearer ${payload.accessToken}`;
      return client(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError);
      useAppStore.getState().clearSession();
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        window.location.href = "/login";
      }
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default client;
