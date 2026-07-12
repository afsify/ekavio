/**
 * Mobile-Friendly Login Page (`Login.tsx`)
 * Strictly functional login screen leveraging controlled inputs, reusable UI components,
 * and database-driven theme injection upon login.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Phone,
  Lock,
  Building2,
  Sparkles,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { client } from '../api/client';
import { useAppStore, type UserProfile, type ThemeConfig } from '../store/useAppStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export const Login: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const login = useAppStore((state) => state.login);

  const validateForm = (): boolean => {
    let isValid = true;
    setPhoneError(undefined);
    setPasswordError(undefined);

    if (!phone.trim()) {
      setPhoneError('Phone number is required');
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError('Password is required');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const response = await client.post('/auth/login', {
        phone: phone.trim(),
        password,
      });

      const data = response.data;
      const accessToken: string = data.accessToken;

      const userPayload: UserProfile = {
        id: data.user?.id || data.userId || 'unknown-id',
        name: data.user?.name || 'Authorized Admin',
        role: data.user?.role || data.role || 'Admin',
        tenantId: data.user?.tenantId || data.tenantId || 'default-tenant',
        phone: data.user?.phone || phone.trim(),
      };

      const themeConfig: ThemeConfig = data.theme || {
        mode: 'dark',
        primaryColor: '#4F46E5',
      };

      login(userPayload, accessToken, themeConfig);
      toast.success('Signed in to Ekavio!');
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        'Authentication failed. Please verify credentials.';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      {/* Dynamic background glow */}
      <div
        className="absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl pointer-events-none opacity-20 animate-pulse"
        style={{ backgroundColor: 'var(--primary-color, #4F46E5)' }}
      />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-violet-600/20 blur-3xl pointer-events-none" />

      {/* Responsive Glassmorphic Form Card */}
      <div className="relative w-full max-w-md z-10">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl shadow-lg mb-4 ring-1 ring-white/20"
            style={{ backgroundColor: 'var(--primary-color, #4F46E5)' }}
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
          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="phone"
              label="Phone Number"
              type="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) setPhoneError(undefined);
              }}
              placeholder="+1 (555) 000-0000"
              icon={<Phone className="h-4 w-4" />}
              error={phoneError}
              disabled={isLoading}
            />

            <Input
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passwordError) setPasswordError(undefined);
              }}
              placeholder="••••••••"
              icon={<Lock className="h-4 w-4" />}
              error={passwordError}
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              isLoading={isLoading}
              className="w-full mt-2"
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
