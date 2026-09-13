import React from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { AdvancedModal } from './AdvancedModal';
import { Input } from './Input';
import { Button } from './Button';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';

const passwordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordFormInputs = z.infer<typeof passwordSchema>;

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({ isOpen, onClose }) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordFormInputs>({
    resolver: zodResolver(passwordSchema),
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormInputs) => {
      const response = await client.put('/profile/password', {
        oldPassword: data.oldPassword,
        newPassword: data.newPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
      reset();
      onClose();
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Failed to change password'));
    },
  });

  const onSubmit: SubmitHandler<PasswordFormInputs> = (data) => {
    changePasswordMutation.mutate(data);
  };

  return (
    <AdvancedModal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Password"
      actions={
        <>
          <Button variant="secondary" onClick={() => {
            reset();
            onClose();
          }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} isLoading={isSubmitting || changePasswordMutation.isPending}>
            Update Password
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Input
          id="oldPassword"
          label="Current Password"
          type="password"
          {...register('oldPassword')}
          error={errors.oldPassword?.message}
        />
        <Input
          id="newPassword"
          label="New Password"
          type="password"
          {...register('newPassword')}
          error={errors.newPassword?.message}
        />
        <Input
          id="confirmPassword"
          label="Confirm New Password"
          type="password"
          {...register('confirmPassword')}
          error={errors.confirmPassword?.message}
        />
      </form>
    </AdvancedModal>
  );
};
