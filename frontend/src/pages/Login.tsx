/**
 * Mobile-Friendly Login Page (`Login.tsx`)
 * Strictly functional login screen leveraging controlled inputs, reusable UI components,
 * and database-driven theme injection upon login.
 */
import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  Phone,
  Lock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useLogin } from '../hooks/useAuth';
import { getErrorMessage } from '../api/errors';
import { BrandLockup } from '../components/brand/Brand';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Phone or email is required').max(254),
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
  const location = useLocation();
  const loginMutation = useLogin();

  useEffect(() => {
    if ((location.state as { accountReady?: boolean } | null)?.accountReady) {
      toast.success('Your EkaVio account is ready. Sign in with your phone number and password.');
      navigate('/login', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  const onSubmit: SubmitHandler<LoginFormInputs> = (formData) => {
    loginMutation.mutate(
      {
        identifier: formData.identifier.trim(),
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
          <Link to="/" aria-label="EkaVio home" className="inline-block mb-5"><BrandLockup /></Link>

          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Welcome Back
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to your business workspace
          </p>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-xl p-6 sm:p-8 shadow-2xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="identifier"
              label="Phone or email"
              type="text"
              autoComplete="username"
              {...register('identifier')}
              placeholder="Phone number or verified email"
              icon={<Phone className="h-4 w-4" />}
              error={errors.identifier?.message}
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
          <Link className="mt-4 block text-sm text-indigo-500" to="/forgot-password">Forgot password?</Link>

          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Secure, revocable session</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} EkaVio. <Link to="/privacy">Privacy overview</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
