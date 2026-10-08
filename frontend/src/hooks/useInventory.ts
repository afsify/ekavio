import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../api/client';

export interface InventoryUnit {
  code: 'unit' | 'piece' | 'pack' | 'box' | 'kg' | 'g' | 'litre' | 'ml';
  label: string;
}

export interface InventoryItem {
  id: string;
  organizationId: string;
  branchId: string;
  locationId: string;
  locationName: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitCode: InventoryUnit['code'];
  unit: InventoryUnit;
  status: 'active' | 'inactive';
  priceMinor: string | null;
  price: string | null;
  currency: 'INR';
  quantity: string;
  reorderThreshold: string;
  isLowStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  organizationId: string;
  branchId: string;
  itemId: string;
  itemName: string;
  unitCode: InventoryUnit['code'];
  unit: InventoryUnit;
  locationId: string;
  locationName: string;
  movementType:
    | 'opening'
    | 'receive'
    | 'consume'
    | 'adjustment_increase'
    | 'adjustment_decrease'
    | 'reversal';
  quantityDelta: string;
  quantity: string;
  reason: string | null;
  reference: string | null;
  purchaseReceiptLineId?: string | null;
  reversesMovementId: string | null;
  reversedByMovementId: string | null;
  actorMembershipId: string | null;
  actorName: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CreateInventoryItemInput {
  customFields?:Record<string,import('../components/forms/DynamicForm').FieldValue>;
  name: string;
  unitCode: InventoryUnit['code'];
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  currency: 'INR';
  reorderThreshold: string;
  openingQuantity?: string;
  idempotencyKey: string;
}

export interface UpdateInventoryItemInput {
  customFields?:Record<string,import('../components/forms/DynamicForm').FieldValue>;
  itemId: string;
  name?: string;
  unitCode?: InventoryUnit['code'];
  sku?: string | null;
  barcode?: string | null;
  price?: string | null;
  status?: 'active' | 'inactive';
  reorderThreshold?: string;
}

export interface StockCommandInput {
  itemId: string;
  quantity: string;
  reason?: string | null;
  reference?: string | null;
  idempotencyKey: string;
}

export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (page: number, limit: number, search: string, status: string) =>
    [...inventoryKeys.all, 'list', page, limit, search, status] as const,
  lowStock: (page: number, limit: number) =>
    [...inventoryKeys.all, 'low-stock', page, limit] as const,
  units: () => [...inventoryKeys.all, 'units'] as const,
  movements: (itemId: string, page: number, limit: number) =>
    [...inventoryKeys.all, 'movements', itemId, page, limit] as const,
};

const invalidateInventory = async (queryClient: ReturnType<typeof useQueryClient>) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['form-values'] }),
    queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
    queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }),
  ]);
};

export const useInventory = (
  page = 1,
  limit = 20,
  search = '',
  status = '',
) => useQuery({
  queryKey: inventoryKeys.list(page, limit, search, status),
  queryFn: async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set('search', search);
    if (status) params.set('status', status);
    const response = await client.get<Paginated<InventoryItem>>(`/inventory?${params}`);
    return response.data;
  },
});

export const useLowStockAlerts = (page = 1, limit = 20) => useQuery({
  queryKey: inventoryKeys.lowStock(page, limit),
  queryFn: async () => {
    const response = await client.get<Paginated<InventoryItem>>(
      `/inventory/low-stock?page=${page}&limit=${limit}`,
    );
    return response.data;
  },
});

export const useInventoryUnits = () => useQuery({
  queryKey: inventoryKeys.units(),
  queryFn: async () => {
    const response = await client.get<{ data: InventoryUnit[] }>('/inventory/units');
    return response.data.data;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export const useInventoryMovements = (
  itemId: string | null,
  page = 1,
  limit = 20,
) => useQuery({
  queryKey: inventoryKeys.movements(itemId ?? 'none', page, limit),
  queryFn: async () => {
    const response = await client.get<Paginated<StockMovement>>(
      `/inventory/${itemId}/movements?page=${page}&limit=${limit}`,
    );
    return response.data;
  },
  enabled: itemId !== null,
});

export const useCreateInventoryItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInventoryItemInput) => {
      const response = await client.post<{ data: InventoryItem }>('/inventory', input);
      return response.data.data;
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
};

export const useUpdateInventoryItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, ...input }: UpdateInventoryItemInput) => {
      const response = await client.patch<{ data: InventoryItem }>(`/inventory/${itemId}`, input);
      return response.data.data;
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
};

const useStockCommand = (command: 'receive' | 'consume' | 'adjust') => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockCommandInput & { direction?: 'increase' | 'decrease' }) => {
      const { itemId, ...body } = input;
      const response = await client.post<{ data: StockMovement }>(
        `/inventory/${itemId}/${command}`,
        body,
      );
      return response.data.data;
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
};

export const useReceiveInventoryStock = () => useStockCommand('receive');
export const useConsumeInventoryStock = () => useStockCommand('consume');
export const useAdjustInventoryStock = () => useStockCommand('adjust');

export const useReverseInventoryMovement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      movementId: string;
      reason: string;
      idempotencyKey: string;
    }) => {
      const response = await client.post<{ data: StockMovement }>(
        `/inventory/movements/${input.movementId}/reversal`,
        { reason: input.reason, idempotencyKey: input.idempotencyKey },
      );
      return response.data.data;
    },
    onSuccess: () => invalidateInventory(queryClient),
  });
};
