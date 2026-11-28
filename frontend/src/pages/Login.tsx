/**
 * Mobile-Friendly Login Page (`Login.tsx`)
 * Strictly functional login screen leveraging controlled inputs, reusable UI components,
 * and database-driven theme injection upon login.
 */
import React, { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  UserRound,
  Lock,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useLogin } from '../hooks/useAuth';
import { getErrorMessage } from '../api/errors';
import { BrandLockup } from '../components/brand/Brand';
import { useAppStore } from '../store/useAppStore';

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
  const logoutStatus = useAppStore(state => state.logoutStatus);
  const logoutIntentUnavailable = useAppStore(state => state.logoutIntentUnavailable);
  const logout = useAppStore(state => state.logout);
  const retryLogoutCleanup = useAppStore(state => state.retryLogoutCleanup);
  const logoutBlocked = logoutStatus !== 'idle';
  const reauthenticationRequired = (location.state as { reauthenticationRequired?: boolean } | null)?.reauthenticationRequired === true;
  const recoveryNotice = useRef<HTMLDivElement>(null);
  const identifierInput = useRef<HTMLInputElement>(null);
  const wasLogoutBlocked = useRef(logoutBlocked);
  const identifierField = register('identifier');

  useEffect(() => {
    if (logoutBlocked || reauthenticationRequired) recoveryNotice.current?.focus();
    else if (wasLogoutBlocked.current) identifierInput.current?.focus();
    wasLogoutBlocked.current = logoutBlocked;
  }, [logoutBlocked, logoutStatus, reauthenticationRequired]);

  useEffect(() => {
    if ((location.state as { accountReady?: boolean } | null)?.accountReady) {
      toast.success('Your EkaVio account is ready. Sign in with your phone number and password.');
      navigate('/login', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  const onSubmit: SubmitHandler<LoginFormInputs> = (formData) => {
    if (logoutBlocked) return;
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
      }
    );
  };

  const isLoading = loginMutation.isPending;

  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      {/* Dynamic background glow */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 motion-safe:animate-pulse motion-safe:transition-colors duration-500"
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
          {(logoutBlocked || reauthenticationRequired) && <div className="mb-5">
            <div ref={recoveryNotice} role="status" aria-atomic="true" tabIndex={-1} className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]">
              {logoutStatus === 'pending' ? <>
                <p className="font-semibold">Signing out…</p>
                <p className="mt-1">You’re signed out here. Wait for the server to confirm before signing in again.</p>
              </> : logoutStatus === 'unconfirmed' ? <>
                <p className="font-semibold">Server sign-out couldn’t be confirmed.</p>
                <p className="mt-1">This page remains signed out. Retry sign-out before signing in again.</p>
              </> : logoutStatus === 'cleanup-required' ? <>
                <p className="font-semibold">Server sign-out confirmed.</p>
                <p className="mt-1">This tab couldn’t clear its sign-out marker. Retry clearing it before signing in.</p>
                <p className="mt-1">If retry fails, allow site storage in your browser settings and try again. If it still fails, close this tab and open EkaVio in a new tab.</p>
              </> : <>
                <p className="font-semibold">Sign in again to continue.</p>
                <p className="mt-1">We couldn’t verify your session. If you were saving a change, check the record before trying again.</p>
              </>}
              {logoutBlocked && logoutIntentUnavailable && <p className="mt-1">This browser couldn’t save the sign-out state for a reload. Keep this page open until sign-out is confirmed.</p>}
            </div>
            {logoutStatus === 'unconfirmed' && <Button type="button" variant="secondary" className="mt-3 motion-reduce:transition-none" onClick={() => void logout()}>Retry sign-out</Button>}
            {logoutStatus === 'cleanup-required' && <Button type="button" variant="secondary" className="mt-3 motion-reduce:transition-none" onClick={retryLogoutCleanup}>Retry clearing sign-out marker</Button>}
          </div>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              id="identifier"
              label="Phone or email"
              type="text"
              autoComplete="username"
              {...identifierField}
              ref={input => {
                identifierField.ref(input);
                identifierInput.current = input;
              }}
              helper="Use your phone number or verified email address to sign in."
              icon={<UserRound aria-hidden="true" className="h-4 w-4" />}
              error={errors.identifier?.message}
              disabled={isLoading || logoutBlocked}
            />

            <Input
              id="password"
              label="Password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              placeholder="••••••••"
              icon={<Lock className="h-4 w-4" />}
              error={errors.password?.message}
              disabled={isLoading || logoutBlocked}
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={isLoading}
              disabled={logoutBlocked}
              className="w-full mt-3"
            >
              <span>Sign In to Ekavio</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
            {loginMutation.isError && <p role="alert" className="error-text">{getErrorMessage(loginMutation.error, 'Authentication failed. Please verify credentials.')}</p>}
          </form>
          <Link className="mt-4 block text-sm text-indigo-300" to="/forgot-password">Forgot password?</Link>

          <div className="mt-6 pt-5 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Secure, revocable session</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} EkaVio. <Link to="/privacy">Privacy overview</Link>
        </p>
      </div>
    </main>
  );
};

export default Login;
