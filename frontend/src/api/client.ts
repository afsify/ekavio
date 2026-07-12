/**
 * Ekavio API Client Configuration
 * Strictly functional Axios instance with Authorization header interceptor
 */
import axios, { type InternalAxiosRequestConfig } from 'axios';

export const client = axios.create({
  baseURL: 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request Interceptor
 * Automatically injects JWT accessToken from localStorage into Authorization header
 */
client.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken =
      localStorage.getItem('accessToken') || localStorage.getItem('token');

    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default client;
