import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Clock, Users, Play, CheckCircle2 } from 'lucide-react';

import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { client } from '../../api/client';
import { useSocketStore } from '../../store/useSocketStore';

const queueSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(1, 'Phone number is required'),
  serviceType: z.string().min(1, 'Service type is required'),
});

type QueueFormInputs = z.infer<typeof queueSchema>;

interface QueueToken {
  _id: string;
  tokenNumber: string;
  customerName: string;
  phone: string;
  serviceType: string;
  status: 'waiting' | 'serving' | 'completed' | 'cancelled';
  createdAt: string;
}

export const QueuePage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const socket = useSocketStore((state) => state.socket);

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: async () => {
      const response = await client.get('/queue');
      return response.data.data as QueueToken[];
    },
  });

  useEffect(() => {
    if (socket) {
      socket.on('queue_updated', () => {
        queryClient.invalidateQueries({ queryKey: ['queue'] });
      });
      return () => {
        socket.off('queue_updated');
      };
    }
  }, [socket, queryClient]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QueueFormInputs>({
    resolver: zodResolver(queueSchema),
  });

  const createMutation = useMutation({
    mutationFn: async (data: QueueFormInputs) => {
      const response = await client.post('/queue', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Token created successfully!');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to create token');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await client.patch(`/queue/${id}/status`, { status });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Status updated');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to update status');
    },
  });

  const onSubmit: SubmitHandler<QueueFormInputs> = (data) => {
    createMutation.mutate(data);
  };

  const activeCount = queueData?.filter((t) => t.status === 'waiting' || t.status === 'serving').length || 0;
  const waitingCount = queueData?.filter((t) => t.status === 'waiting').length || 0;

  const header = (
    <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
        <Clock className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Queue Management</h1>
        <p className="text-slate-400 text-sm">Manage customer tokens and active waitlist</p>
      </div>
    </div>
  );

  const sidebarCards = (
    <>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
        <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Active Queue</p>
          <p className="text-xl font-bold text-white">{activeCount}</p>
        </div>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
        <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Waiting</p>
          <p className="text-xl font-bold text-white">{waitingCount}</p>
        </div>
      </div>
    </>
  );

  const columns = [
    { header: 'Token', accessor: 'tokenNumber', sortable: true },
    { header: 'Customer Name', accessor: 'customerName', sortable: true },
    { header: 'Phone', accessor: 'phone' },
    { header: 'Service', accessor: 'serviceType', sortable: true },
    {
      header: 'Status',
      accessor: 'status',
      sortable: true,
      cell: ({ value }: { value: string }) => {
        let colors = 'bg-slate-500/20 text-slate-400';
        if (value === 'waiting') colors = 'bg-amber-500/20 text-amber-400';
        if (value === 'serving') colors = 'bg-blue-500/20 text-blue-400';
        if (value === 'completed') colors = 'bg-emerald-500/20 text-emerald-400';

        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${colors}`}>
            {value}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cell: ({ row }: { row: QueueToken }) => (
        <div className="flex items-center gap-2">
          {row.status === 'waiting' && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                updateStatusMutation.mutate({ id: row._id, status: 'serving' });
              }}
              title="Serve Customer"
              className="bg-blue-600 hover:bg-blue-700 text-white border-transparent"
            >
              <Play className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'serving' && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                updateStatusMutation.mutate({ id: row._id, status: 'completed' });
              }}
              title="Complete Service"
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-transparent"
            >
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const mainContent = (
    <>
      <AdvancedTable
        columns={columns}
        data={queueData || []}
        loading={isLoading}
        title="Active Tokens"
        description="List of customers currently waiting or being served."
        onAdd={() => setIsModalOpen(true)}
        searchPlaceholder="Search customer..."
      />

      <AdvancedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create New Token"
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} isLoading={isSubmitting}>
              Generate Token
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            id="customerName"
            label="Customer Name"
            {...register('customerName')}
            error={errors.customerName?.message}
          />
          <Input
            id="phone"
            label="Phone Number"
            type="tel"
            {...register('phone')}
            error={errors.phone?.message}
          />
          <Input
            id="serviceType"
            label="Service Type"
            {...register('serviceType')}
            error={errors.serviceType?.message}
          />
        </form>
      </AdvancedModal>
    </>
  );

  return (
    <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />
  );
};

export default QueuePage;
