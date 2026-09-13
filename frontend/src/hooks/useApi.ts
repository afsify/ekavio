/**
 * @deprecated
 * This custom hook is deprecated in favor of TanStack Query (React Query).
 * Please use `useQuery` for GET requests and `useMutation` for POST, PUT, DELETE requests.
 * TanStack Query handles caching, background refetching, and loading states automatically,
 * which is crucial for React Native portability and overall application performance.
 *
 * Generic CRUD Custom Hook (`useApi`)
 * Strictly functional React hook designed for reusable RESTful API operations.
 * Fully typed with generics and commented for seamless React Native portability.
 */
import { useState, useCallback } from 'react';
import { client } from '../api/client';
import { getErrorMessage } from '../api/errors';

export interface UseApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetchData: () => Promise<T | null>;
  postData: <P = unknown, R = T>(payload: P) => Promise<R | null>;
  putData: <P = unknown, R = T>(id: string, payload: P) => Promise<R | null>;
  deleteData: <R = unknown>(id: string) => Promise<R | null>;
}

export function useApi<T = unknown>(endpoint: string): UseApiResponse<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Helper function to extract friendly error message
   */
  /**
   * GET request to fetch resource data
   */
  const fetchData = useCallback(async (): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.get<T>(endpoint);
      setData(response.data);
      return response.data;
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'An unexpected API error occurred');
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  /**
   * POST request to create a new resource
   */
  const postData = useCallback(
    async <P = unknown, R = T>(payload: P): Promise<R | null> => {
      setLoading(true);
      setError(null);
      try {
        const response = await client.post<R>(endpoint, payload);
        return response.data;
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'An unexpected API error occurred');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  /**
   * PUT request to update an existing resource by ID
   */
  const putData = useCallback(
    async <P = unknown, R = T>(id: string, payload: P): Promise<R | null> => {
      setLoading(true);
      setError(null);
      try {
        const url = `${endpoint.replace(/\/$/, '')}/${id}`;
        const response = await client.put<R>(url, payload);
        return response.data;
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'An unexpected API error occurred');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  /**
   * DELETE request to remove a resource by ID
   */
  const deleteData = useCallback(
    async <R = unknown>(id: string): Promise<R | null> => {
      setLoading(true);
      setError(null);
      try {
        const url = `${endpoint.replace(/\/$/, '')}/${id}`;
        const response = await client.delete<R>(url);
        return response.data;
      } catch (err: unknown) {
        const msg = getErrorMessage(err, 'An unexpected API error occurred');
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [endpoint]
  );

  return {
    data,
    loading,
    error,
    fetchData,
    postData,
    putData,
    deleteData,
  };
}

export default useApi;
