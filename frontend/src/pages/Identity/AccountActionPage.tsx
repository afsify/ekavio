import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { publicClient, client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { Input } from '../../components/ui/Input';
import { useAppStore } from '../../store/useAppStore';
import { BrandLockup } from '../../components/brand/Brand';

type Action = 'forgot' | 'reset' | 'verify' | 'invite';
// StrictMode may call initializers twice. Cache only until the component effect;
// raw fragments never enter a query key, durable storage or the server URL.
let fragment: string | null | undefined;
const readFragment = () => {
  if (fragment === undefined) {
    fragment = new URLSearchParams(window.location.hash.slice(1)).get('token');
    window.history.replaceState(null, '', window.location.pathname);
  }
  return fragment;
};
export default function AccountActionPage({ action }: { action: Action }) {
  const [token, setToken] = useState(readFragment);
  const [revision, setRevision] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const signedIn=useAppStore(state=>state.isAuthenticated);
  const purpose = action === 'reset' ? 'password_reset' : action === 'invite' ? 'staff_invitation' : 'email_verification';
  const titles = { forgot: 'Forgot password', reset: 'Reset password', verify: 'Verify email', invite: 'Join your workspace' };
  useEffect(() => { fragment = undefined; }, []);
  const inspection = useQuery({ queryKey: ['account-action', action, revision], enabled: action !== 'forgot' && Boolean(token), retry: false, staleTime: 0, gcTime: 0,
    queryFn: async () => (await publicClient.post<{ data: { valid: boolean; organizationName?: string; name?: string; existingAccount?:boolean } }>('/auth/inspect-action', { token, purpose })).data.data });
  const submit = useMutation({ mutationFn: async () => {
    if(action==='invite'&&inspection.data?.existingAccount) return (await client.post<{data:{message:string}}>('/auth/accept-existing-invitation',{token})).data.data;
    const path = action === 'forgot' ? '/auth/forgot-password' : action === 'reset' ? '/auth/reset-password' : action === 'verify' ? '/auth/verify-email' : '/auth/accept-invitation';
    return (await publicClient.post<{ data: { message: string } }>(path, action === 'forgot' ? { identifier } : action === 'verify' ? { token } : { token, password })).data.data;
  }, onSuccess: () => { setToken(null); setPassword(''); setConfirm(''); if (action === 'reset') useAppStore.getState().clearSession(); } });
  const resetSubmission = submit.reset;
  useEffect(() => {
    const receive = () => {
      const next = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (!next) return;
      window.history.replaceState(null, '', window.location.pathname);
      setToken(next); setRevision((current) => current + 1); setPassword(''); setConfirm(''); resetSubmission();
    };
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, [resetSubmission]);
  const passwordInvalid = password.length < 12 || new TextEncoder().encode(password).length > 72 || password !== confirm;
  return <main className="min-h-screen flex items-center justify-center px-4 py-10"><section className="panel page-stack w-full max-w-md">
    <Link to="/" aria-label="EkaVio home"><BrandLockup /></Link><h1 className="text-2xl font-semibold">{titles[action]}</h1>
    {submit.isSuccess ? <p role="status">{submit.data.message}</p> : <>
      {action === 'forgot' ? <p className="muted">Enter your phone or verified email. Recovery is available only through your verified email; we do not disclose account information.</p> : <>
        {!token && <p role="alert">This link is missing. Request a new link.</p>}
        {inspection.isPending && token && <p role="status">Checking your secure link…</p>}
        {inspection.isError && <p role="alert">{getErrorMessage(inspection.error, 'This link cannot be used.')}</p>}
      </>}
      {(action === 'forgot' || inspection.data) && <form className="page-stack" onSubmit={(event) => { event.preventDefault(); submit.mutate(); }}>
        {inspection.data?.organizationName && <p>{inspection.data.name}, join {inspection.data.organizationName}. Your assigned role and branches are set by your administrator.</p>}
        {inspection.data?.existingAccount&&<p className="muted">Sign in to your invited existing account, then reopen this invitation to explicitly join. Your password and identity will not change. {signedIn?'Acceptance verifies the exact invited account.':<Link to="/login">Sign in</Link>}</p>}
        {action === 'forgot' ? <Input label="Phone or email" required maxLength={254} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /> : action !== 'verify' && !inspection.data?.existingAccount && <>
          <p className="muted">Choose your own password: at least 12 characters, at most 72 UTF-8 bytes.</p>
          <Input label="New password" required type="password" autoComplete="new-password" maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} />
          <Input label="Confirm password" required type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          {confirm && password !== confirm && <p role="alert">Passwords do not match</p>}
        </>}
        <button className="action-link" disabled={submit.isPending || (inspection.data?.existingAccount ? !signedIn : action === 'forgot' ? !identifier.trim() : action !== 'verify' && passwordInvalid)}>{submit.isPending ? 'Please wait…' : action === 'forgot' ? 'Send reset link' : action === 'verify' ? 'Verify email' : action === 'invite' ? 'Accept invitation' : 'Reset password'}</button>
      </form>}
      {submit.isError && <p role="alert">{getErrorMessage(submit.error, 'This action could not be completed.')}</p>}
    </>}
    <Link className="quiet-button" to="/login">Back to sign in</Link>{action === 'reset' && <Link to="/forgot-password">Request a new reset link</Link>}
  </section></main>;
}
