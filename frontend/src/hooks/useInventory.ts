import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';
import toast from 'react-hot-toast';

export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (page: number, limit: number) => [...inventoryKeys.all, 'list', page, limit] as const,
  alerts: () => [...inventoryKeys.all, 'alerts'] as const,
};

export const useInventory = (page: number = 1, limit: number = 10) => {
  return useQuery({
    queryKey: inventoryKeys.list(page, limit),
    queryFn: async () => {
      const response = await client.get(`/inventory?page=${page}&limit=${limit}`);
      return response.data;
    },
  });
};

export const useLowStockAlerts = () => {
  return useQuery({
    queryKey: inventoryKeys.alerts(),
    queryFn: async () => {
      const response = await client.get('/inventory/alerts/low-stock');
      return response.data;
    },
  });
};

export const useAddInventoryItem = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newItem: any) => {
      const response = await client.post('/inventory', newItem);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Item added successfully');
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add item');
    },
  });
};
