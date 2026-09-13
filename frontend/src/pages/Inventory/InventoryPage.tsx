import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { PackageSearch, Download } from 'lucide-react';

import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { client } from '../../api/client';
import { exportToCSV } from '../../utils/exportUtils';
import { getErrorMessage } from '../../api/errors';

const inventorySchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  currentStock: z.number({ error: 'Must be a number' }).min(0, 'Cannot be negative'),
  lowStockThreshold: z.number({ error: 'Must be a number' }).min(0, 'Cannot be negative'),
  price: z.number({ error: 'Must be a number' }).min(0, 'Cannot be negative'),
});

type InventoryFormInputs = z.infer<typeof inventorySchema>;

interface InventoryItem {
  _id: string;
  itemName: string;
  currentStock: number;
  lowStockThreshold: number;
  price: number;
}

export const InventoryPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const response = await client.get('/inventory');
      return response.data.data as InventoryItem[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InventoryFormInputs>({
    resolver: zodResolver(inventorySchema),
  });

  const createMutation = useMutation({
    mutationFn: async (data: InventoryFormInputs) => {
      const response = await client.post('/inventory', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Inventory item added successfully!');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      setIsModalOpen(false);
      reset();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to add item'));
    },
  });

  const onSubmit: SubmitHandler<InventoryFormInputs> = (data) => {
    createMutation.mutate(data);
  };

  const columns = [
    { header: 'Item Name', accessor: 'itemName', sortable: true },
    { 
      header: 'Current Stock', 
      accessor: 'currentStock', 
      sortable: true,
      cell: ({ value, row }: { value: unknown; row: InventoryItem }) => {
        const currentStock = Number(value);
        const isLowStock = currentStock <= row.lowStockThreshold;
        return (
          <span className={`font-bold ${isLowStock ? 'text-rose-400' : 'text-slate-300'}`}>
            {currentStock}
          </span>
        );
      }
    },
    { header: 'Threshold', accessor: 'lowStockThreshold', sortable: true },
    { 
      header: 'Price', 
      accessor: 'price', 
      sortable: true,
      cell: ({ value }: { value: unknown }) => `₹${Number(value).toFixed(2)}`
    },
  ];

  const header = (
    <div className="flex items-center justify-between bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
          <PackageSearch className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
          <p className="text-slate-400 text-sm">Track stock levels and manage items</p>
        </div>
      </div>
      <Button 
        variant="secondary" 
        onClick={() => {
          if (inventoryData) exportToCSV(inventoryData, 'inventory_export');
        }}
        disabled={!inventoryData || inventoryData.length === 0}
        className="hidden md:flex gap-2"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </Button>
    </div>
  );

  const mainContent = (
    <>
      <AdvancedTable
        columns={columns}
        data={inventoryData || []}
        loading={isLoading}
        title="Inventory Items"
        description="List of all items in stock. Items in red indicate low stock levels."
        onAdd={() => setIsModalOpen(true)}
        searchPlaceholder="Search inventory..."
      />

      <AdvancedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Item"
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} isLoading={isSubmitting}>
              Save Item
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            id="itemName"
            label="Item Name"
            {...register('itemName')}
            error={errors.itemName?.message}
          />
          <Input
            id="currentStock"
            label="Current Stock"
            type="number"
            {...register('currentStock', { valueAsNumber: true })}
            error={errors.currentStock?.message}
          />
          <Input
            id="lowStockThreshold"
            label="Low Stock Threshold"
            type="number"
            {...register('lowStockThreshold', { valueAsNumber: true })}
            error={errors.lowStockThreshold?.message}
          />
          <Input
            id="price"
            label="Price (₹)"
            type="number"
            step="0.01"
            {...register('price', { valueAsNumber: true })}
            error={errors.price?.message}
          />
        </form>
      </AdvancedModal>
    </>
  );

  return (
    <DetailViewLayout header={header} mainContent={mainContent} />
  );
};

export default InventoryPage;
