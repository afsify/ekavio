import { useId, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { Input } from '../../components/ui/Input';
import { useAppStore } from '../../store/useAppStore';

export function EmailSettings() {
  const headingId = useId();
  const userId = useAppStore((state) => state.user?.id);
  const [email, setEmail] = useState('');
  const state = useQuery({ queryKey: ['self-email', userId], queryFn: async () => (await client.get<{ data: { verified: string | null; pending: string | null; available: boolean } }>('/auth/email')).data.data });
  const save = useMutation({ mutationFn: async (resend: boolean) => resend ? client.post('/auth/email/resend', {}) : client.put('/auth/email', { email }), onSuccess: () => { setEmail(''); void state.refetch(); } });
  const { verified, pending, available } = state.data ?? {};
  const actionsDisabled = !available || save.isPending;

  return <section className="page-stack min-w-0" aria-labelledby={headingId}>
    <h3 id={headingId} className="font-semibold">Email & account recovery</h3>
    {state.isPending && <p role="status">Loading email status…</p>}
    {state.isError && <p role="alert" className="error-text">Email status unavailable. <button type="button" className="quiet-button" onClick={() => void state.refetch()}>Retry</button></p>}
    {state.data && <>
      <div className="space-y-2 [overflow-wrap:anywhere]">
        <p>{verified ? `Verified: ${verified}` : 'No verified email.'}</p>
        {verified && !pending && <p>You can use this address to sign in.</p>}
        {pending && <>
          <p>Pending verification: {pending}</p>
          <p>{verified
            ? 'Your current verified email remains usable for sign-in until you verify the new address.'
            : 'You can sign in with this email after you verify it.'}</p>
        </>}
        <p className="muted">You can still sign in with your phone number. {available
          ? (verified ? 'Password reset emails go to your verified address.' : 'Email password resets require a verified address.')
          : 'Email delivery is currently disabled. Verification and password reset emails cannot be sent.'}</p>
      </div>
      <form className="page-stack" onSubmit={(event) => { event.preventDefault(); if (!actionsDisabled) save.mutate(false); }}>
        <Input
          label="New email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          helper="Follow the link we send to verify this address before using it to sign in."
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button type="submit" className="action-link" disabled={actionsDisabled}>Send verification</button>
      </form>
      {pending && <button type="button" className="quiet-button" disabled={actionsDisabled} onClick={() => save.mutate(true)}>Resend verification</button>}
    </>}
    {save.isSuccess && <p role="status">Check your email to verify your address. Each link expires after 24 hours. Wait one minute before resending.</p>}
    {save.isError && <p role="alert" className="error-text">{getErrorMessage(save.error, 'Verification could not be sent.')}</p>}
  </section>;
}
