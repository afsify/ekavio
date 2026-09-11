import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Users, Trash2 } from 'lucide-react';

import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

const staffSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Phone must be at least 10 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['admin', 'staff']),
});

type StaffFormInputs = z.infer<typeof staffSchema>;

interface StaffMember {
  _id: string;
  name: string;
  phone: string;
  role: string;
  createdAt: string;
}

export const StaffManagementPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const currentUser = useAppStore((state) => state.user);

  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const response = await client.get('/staff');
      return response.data.data as StaffMember[];
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffFormInputs>({
    resolver: zodResolver(staffSchema),
    defaultValues: { role: 'staff' },
  });

  const createMutation = useMutation({
    mutationFn: async (data: StaffFormInputs) => {
      const response = await client.post('/staff', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Staff member added successfully!');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setIsModalOpen(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to add staff');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await client.delete(`/staff/${id}`);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Staff member deleted successfully!');
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to delete staff');
    },
  });

  const onSubmit: SubmitHandler<StaffFormInputs> = (data) => {
    createMutation.mutate(data);
  };

  const columns = [
    { header: 'Name', accessor: 'name', sortable: true },
    { header: 'Phone', accessor: 'phone' },
    { 
      header: 'Role', 
      accessor: 'role', 
      sortable: true,
      cell: ({ value }: { value: string }) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
          value === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
        }`}>
          {value}
        </span>
      )
    },
    { 
      header: 'Joined', 
      accessor: 'createdAt',
      cell: ({ value }: { value: string }) => new Date(value).toLocaleDateString()
    },
    {
      header: 'Actions',
      accessor: 'actions',
      cell: ({ row }: { row: StaffMember }) => {
        if (row._id === currentUser?.id) return <span className="text-xs text-slate-500">You</span>;
        
        return (
          <Button 
            size="sm" 
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm('Are you sure you want to delete this staff member?')) {
                deleteMutation.mutate(row._id);
              }
            }}
            title="Delete Staff"
            className="hover:bg-rose-500/20 text-rose-400 border-transparent"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        );
      }
    }
  ];

  const header = (
    <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
        <Users className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Staff Management</h1>
        <p className="text-slate-400 text-sm">Manage organization access and roles</p>
      </div>
    </div>
  );

  const mainContent = (
    <>
      <AdvancedTable
        columns={columns}
        data={staffData || []}
        loading={isLoading}
        title="Organization Staff"
        description="List of all users with access to your tenant workspace."
        onAdd={currentUser?.role === 'admin' ? () => setIsModalOpen(true) : undefined}
        searchPlaceholder="Search staff..."
      />

      <AdvancedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Staff"
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit(onSubmit)} isLoading={isSubmitting}>
              Create Account
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            id="name"
            label="Full Name"
            {...register('name')}
            error={errors.name?.message}
          />
          <Input
            id="phone"
            label="Phone Number"
            type="tel"
            {...register('phone')}
            error={errors.phone?.message}
          />
          <Input
            id="password"
            label="Temporary Password"
            type="password"
            {...register('password')}
            error={errors.password?.message}
          />
          <div className="space-y-1">
            <label htmlFor="role" className="block text-sm font-medium text-slate-300">
              Role
            </label>
            <select
              id="role"
              {...register('role')}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <option value="staff">Staff (Limited Access)</option>
              <option value="admin">Admin (Full Access)</option>
            </select>
            {errors.role && (
              <p className="text-xs text-rose-500">{errors.role.message}</p>
            )}
          </div>
        </form>
      </AdvancedModal>
    </>
  );

  return (
    <DetailViewLayout header={header} mainContent={mainContent} />
  );
};

export default StaffManagementPage;
