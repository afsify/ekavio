/**
 * Generic CRUD Custom Hook (`useApi`)
 * Strictly functional React hook designed for reusable RESTful API operations.
 * Fully typed with generics and commented for seamless React Native portability.
 */
import { useState, useCallback } from 'react';
import { client } from '../api/client';

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
  const extractErrorMessage = (err: any): string => {
    return (
      err.response?.data?.message ||
      err.message ||
      'An unexpected API error occurred'
    );
  };

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
    } catch (err: any) {
      const msg = extractErrorMessage(err);
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
      } catch (err: any) {
        const msg = extractErrorMessage(err);
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
      } catch (err: any) {
        const msg = extractErrorMessage(err);
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
      } catch (err: any) {
        const msg = extractErrorMessage(err);
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
