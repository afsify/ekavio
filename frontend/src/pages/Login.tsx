/**
 * Mobile-Friendly Login Page (`Login.tsx`)
 * Strictly functional login screen leveraging controlled inputs, reusable UI components,
 * and database-driven theme injection upon login.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Phone,
  Lock,
  Building2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useLogin } from '../hooks/useAuth';
import { getErrorMessage } from '../api/errors';

const loginSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

export const Login: React.FC = () => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });

  const navigate = useNavigate();
  const loginMutation = useLogin();

  const onSubmit: SubmitHandler<LoginFormInputs> = (formData) => {
    loginMutation.mutate(
      {
        phone: formData.phone.trim(),
        password: formData.password,
      },
      {
        onSuccess: () => {
          toast.success('Signed in to Ekavio!');
          navigate('/dashboard', { replace: true });
        },
        onError: (error: unknown) => {
          toast.error(getErrorMessage(error, 'Authentication failed. Please verify credentials.'));
        },
      }
    );
  };

  const isLoading = loginMutation.isPending;

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      {/* Dynamic background glow */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 animate-pulse transition-colors duration-500"
        style={{ backgroundColor: 'var(--color-primary, #4F46E5)' }}
      />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />

      {/* Responsive Glassmorphic Form Card */}
      <div className="relative w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg mb-4 ring-1 ring-white/20 transition-colors duration-300"
            style={{ backgroundColor: 'var(--color-primary, #4F46E5)' }}
          >
            <Building2 className="w-7 h-7 text-white" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-slate-300 text-xs font-medium mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ekavio Enterprise Mobile Suite</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Log in to manage your tenant modules & operations
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-xl p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="phone"
              label="Phone Number"
              type="tel"
              {...register('phone')}
              placeholder="+1 (555) 000-0000"
              icon={<Phone className="h-4 w-4" />}
              error={errors.phone?.message}
              disabled={isLoading}
            />

            <Input
              id="password"
              label="Password"
              type="password"
              {...register('password')}
              placeholder="••••••••"
              icon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              className="w-full mt-3"
            >
              <span>Sign In to Ekavio</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>256-Bit Encrypted Mobile Session</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} Ekavio Technologies. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Login;
