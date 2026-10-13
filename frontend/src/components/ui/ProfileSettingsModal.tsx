import React, { useEffect, useRef } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { AdvancedModal } from './AdvancedModal';
import { Input } from './Input';
import { Button } from './Button';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';

const passwordSchema = z.object({
  oldPassword: z.string().min(1, 'Old password is required'),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(72).refine((value) => new TextEncoder().encode(value).length <= 72, 'Use at most 72 UTF-8 bytes'),
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
  const navigate = useNavigate();
  const clearSession = useAppStore((state) => state.clearSession);
  const submittingUserId = useAppStore((state) => state.user?.id);
  const alive = useRef(true), passwordController = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; passwordController.current?.abort(); }; }, []);
  const ownsCompletion = () => alive.current && Boolean(submittingUserId) && useAppStore.getState().user?.id === submittingUserId;
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
      if (!ownsCompletion()) throw new Error('Account changed. Reopen security settings before saving.');
      const controller = new AbortController(); passwordController.current = controller;
      const unsubscribe = useAppStore.subscribe(state => { if (state.user?.id !== submittingUserId) controller.abort(); });
      try {
        const response = await client.put('/profile/password', {
          oldPassword: data.oldPassword,
          newPassword: data.newPassword,
        }, { signal: controller.signal });
        return response.data;
      } finally { unsubscribe(); }
    },
    onSuccess: () => {
      // Server revocation still applies to the submitting account. A delayed
      // completion must not clear a different account's established session.
      if (!ownsCompletion()) return;
      clearSession();
      toast.success('Password changed. Sign in again to continue.');
      reset();
      onClose();
      navigate('/login', { replace: true });
    },
    onError: (error: unknown) => {
      if (!ownsCompletion()) return;
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
