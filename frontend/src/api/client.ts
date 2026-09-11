/**
 * Ekavio API Client Configuration
 * Strictly functional Axios instance with Authorization header interceptor and 401 response handling
 */
import axios, { type InternalAxiosRequestConfig } from "axios";
import { useAppStore } from "../store/useAppStore";

export const client = axios.create({
  baseURL: "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Request Interceptor
 * Automatically injects JWT accessToken from Zustand store or localStorage into Authorization header
 */
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken =
      useAppStore.getState().token ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token");

    const activeTenantId = useAppStore.getState().activeTenantId;

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    if (activeTenantId && config.headers) {
      config.headers["x-tenant-id"] = activeTenantId;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/login")
      ) {
        useAppStore.getState().logout();
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/login"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return client(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken =
          useAppStore.getState().refreshToken ||
          localStorage.getItem("refreshToken");
        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        const { data } = await axios.post(
          `${client.defaults.baseURL}/auth/refresh`,
          { refreshToken },
        );

        useAppStore.getState().setTokens(data.accessToken, data.refreshToken);

        processQueue(null, data.accessToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return client(originalRequest);
      } catch (err) {
        processQueue(err, null);
        useAppStore.getState().logout();
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/login"
        ) {
          window.location.href = "/login";
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default client;
