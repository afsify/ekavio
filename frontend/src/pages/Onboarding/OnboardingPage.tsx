import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Building2, CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { publicClient } from '../../api/client';
import type { OnboardingInspection } from '../../commercial/manualCommercial';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'This onboarding invitation cannot be used.';
  }
  return 'This onboarding invitation cannot be used.';
};

let initialFragmentToken: string | null | undefined;

const readAndRemoveFragmentToken = (): string | null => {
  if (initialFragmentToken !== undefined) return initialFragmentToken;
  if (typeof window === 'undefined') return null;
  initialFragmentToken = new URLSearchParams(window.location.hash.slice(1)).get('token');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return initialFragmentToken;
};

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState(readAndRemoveFragmentToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [email, setEmail] = useState('');
  useEffect(() => {
    initialFragmentToken = undefined;
  }, []);
  const inspection = useQuery({
    queryKey: ['public-onboarding-inspection'],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await publicClient.post<{ data: OnboardingInspection }>(
        '/public/onboarding/inspect',
        { token },
      );
      return response.data.data;
    },
  });
  const complete = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Onboarding token is missing');
      await publicClient.post('/public/onboarding/complete', { token, password, timezone, ...(email.trim() ? { email: email.trim() } : {}) });
    },
    onSuccess: () => {
      setPassword('');
      setConfirmPassword('');
      setToken(null);
      navigate('/login', { replace: true, state: { accountReady: true } });
    },
  });
  const passwordInvalid = password.length < 12 || new TextEncoder().encode(password).length > 72 || password !== confirmPassword;

  return (
    <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-indigo-500/20 p-3 text-indigo-300"><KeyRound className="h-7 w-7" /></div>
          <div><h1 className="text-2xl font-bold text-white">Complete EkaVio onboarding</h1><p className="text-sm text-slate-400">Choose your password and create the approved workspace.</p></div>
        </div>

        {!token && <p className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">The onboarding link is missing. Ask the EkaVio operator to generate a replacement.</p>}
        {inspection.isLoading && <p className="mt-8 text-sm text-slate-400">Validating the one-time invitation…</p>}
        {inspection.isError && <p className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{errorMessage(inspection.error)}</p>}

        {inspection.data && (
          <div className="mt-8 space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
              <div className="flex items-center gap-2 text-white"><Building2 className="h-5 w-5 text-indigo-300" /><span className="font-bold">{inspection.data.businessName}</span></div>
              <p className="mt-2 text-sm text-slate-400">Administrator: {inspection.data.adminDisplayName}</p>
              <p className="mt-1 text-sm capitalize text-slate-400">{inspection.data.subscription.billingCycle} subscription · {inspection.data.subscription.planName ?? 'Module package'}</p>
              {inspection.data.subscription.addOnNames.length > 0 && <p className="mt-1 text-sm text-slate-400">Add-ons: {inspection.data.subscription.addOnNames.join(', ')}</p>}
              <p className="mt-3 text-xs text-slate-500">Period: {new Date(inspection.data.subscription.startsAt).toLocaleDateString()} – {new Date(inspection.data.subscription.currentPeriodEndsAt).toLocaleDateString()}</p>
            </div>
            <div className="grid gap-4">
              <Input label="Recovery email (recommended)" type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              <p className="text-sm text-slate-400">Add a personal email for account recovery. If omitted, the access-request email is retained when available. After phone sign-in, verify it in Settings; it is not login or recovery authority until verified. Legacy phone-only onboarding remains supported.</p>
              <Input label="Password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} error={password.length > 0 && password.length < 12 ? 'Use at least 12 characters' : undefined} />
              <Input label="Confirm password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} error={confirmPassword.length > 0 && password !== confirmPassword ? 'Passwords do not match' : undefined} />
              <Input label="Main branch timezone" value={timezone} maxLength={100} onChange={(event) => setTimezone(event.target.value)} />
            </div>
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs text-emerald-100/80"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>Your password is sent only to the onboarding API over HTTPS. The one-time token was removed from the address bar and is never stored in browser storage.</p></div>
            <Button className="w-full" size="lg" disabled={passwordInvalid || !timezone.trim()} isLoading={complete.isPending} onClick={() => complete.mutate()}><CheckCircle2 className="h-5 w-5" /> Create my workspace</Button>
            {complete.isError && <p className="text-sm text-rose-300">{errorMessage(complete.error)}</p>}
          </div>
        )}
      </div>
    </section>
  );
};

export default OnboardingPage;
