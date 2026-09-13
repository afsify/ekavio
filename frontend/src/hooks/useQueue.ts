import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../api/errors';

interface NewQueueToken {
  customerName: string;
  phone: string;
  serviceType: string;
  tokenNumber?: string;
}

export const queueKeys = {
  all: ['queue'] as const,
  list: (page: number, limit: number) => [...queueKeys.all, 'list', page, limit] as const,
};

export const useQueue = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: queueKeys.list(page, limit),
    queryFn: async () => {
      const response = await client.get(`/queue?page=${page}&limit=${limit}`);
      return response.data;
    },
  });
};

export const useCreateToken = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newToken: NewQueueToken) => {
      const response = await client.post('/queue', newToken);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Token created successfully');
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to create token'));
    },
  });
};

export const useUpdateTokenStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tokenId, status }: { tokenId: string; status: string }) => {
      const response = await client.put(`/queue/${tokenId}/status`, { status });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Token status updated');
      queryClient.invalidateQueries({ queryKey: queueKeys.all });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to update token status'));
    },
  });
};
