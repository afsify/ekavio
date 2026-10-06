import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { Input } from '../../components/ui/Input';
import { useAppStore } from '../../store/useAppStore';
export function EmailSettings() {
  const userId = useAppStore((state) => state.user?.id);
  const [email, setEmail] = useState('');
  const state = useQuery({ queryKey: ['self-email', userId], queryFn: async () => (await client.get<{ data: { verified: string | null; pending: string | null; available: boolean } }>('/auth/email')).data.data });
  const save = useMutation({ mutationFn: async (resend: boolean) => resend ? client.post('/auth/email/resend', {}) : client.put('/auth/email', { email }), onSuccess: () => { setEmail(''); void state.refetch(); } });
  return <section className="page-stack"><h3 className="font-semibold">Email & account recovery</h3>
    {state.isPending && <p>Loading email status…</p>}{state.isError && <p role="alert">Email status unavailable. <button onClick={() => void state.refetch()}>Retry</button></p>}
    {state.data && <><p>{state.data.verified ? `Verified: ${state.data.verified}` : 'No verified email. Phone login still works; email recovery is not yet available.'}</p>
      {state.data.pending && <p>Pending verification: {state.data.pending}. Your current verified email remains usable until this address is verified.</p>}
      {!state.data.available && <p className="muted">Email delivery is currently disabled. Your existing login is unaffected.</p>}
      <form className="page-stack" onSubmit={(event) => { event.preventDefault(); save.mutate(false); }}><Input label="New email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /><button className="action-link" disabled={!state.data.available || save.isPending}>Send verification</button></form>
      {state.data.pending && <button className="quiet-button" disabled={!state.data.available || save.isPending} onClick={() => save.mutate(true)}>Resend verification</button>}
    </>}
    {save.isSuccess && <p role="status">Check your email to verify. Links expire after 24 hours; wait a minute before resending.</p>}
    {save.isError && <p role="alert">{getErrorMessage(save.error, 'Verification could not be sent.')}</p>}
  </section>;
}
