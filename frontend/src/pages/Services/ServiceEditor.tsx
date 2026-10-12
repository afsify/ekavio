import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { currentLayoutAuthority } from '../../hooks/useLayoutStudio';
import { uncertainWrite } from '../../utils/mutationOutcome';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { OperationForm } from '../../components/ui/OperationForm';
import { Input } from '../../components/ui/Input';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { useLayoutNavigationGuard } from '../../hooks/useLayoutNavigationGuard';

export interface Service { id: string; name: string; description: string | null; durationMinutes: number; active: boolean }
interface Props { service: Service | null; onSaved: () => Promise<void>; onClose: () => void; onUncertain: () => void }
/** Service commands have no server idempotency key or optimistic version API.
 * Capture identity, do not replay uncertain writes, and verify authoritative reads. */
export function ServiceEditor({ service, onSaved, onClose, onUncertain }: Props) {
  const [original] = useState(() => ({ name: service?.name ?? '', description: service?.description ?? '', durationMinutes: String(service?.durationMinutes ?? 30), active: service?.active ?? true }));
  const [form, setForm] = useState(original), [revision, setRevision] = useState(0), [blocked, setBlocked] = useState(false);
  const [authority] = useState(currentLayoutAuthority), [serviceId] = useState(service?.id);
  const fields = useDynamicForm('service', serviceId);
  const submitted = useRef(false), alive = useRef(true), controller = useRef<AbortController | null>(null);
  const [leave, setLeave] = useState<{ action: () => void } | null>(null);
  const requestLeave = useCallback((action: () => void) => { if (!submitted.current) setLeave({ action }); }, []);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const active = () => alive.current && currentLayoutAuthority() === authority && Boolean(useAppStore.getState().user?.permissions?.includes('services.manage'));
  const save = useMutation({ retry: false, mutationFn: async (body: Record<string, unknown>) => {
    if (!active()) throw new Error('Workspace authority changed. This draft cannot be saved.');
    controller.current = new AbortController(); const requestController = controller.current;
    const unsubscribe = useAppStore.subscribe(() => { if (!active()) requestController.abort(); });
    try {
      if (serviceId) await client.patch(`/services/${serviceId}`, body, { signal: requestController.signal });
      else await client.post('/services', body, { signal: requestController.signal });
      if (!active()) return;
      // A committed write followed by a failed read remains uncertain, not a success.
      try { await onSaved(); }
      catch { throw new Error('Service write completed but authoritative refresh failed. Outcome must be verified before another command.'); }
      if (active()) onClose();
    } finally { unsubscribe(); }
  }, onError: error => {
    if (uncertainWrite(error)) {
      // Abort after an authority switch cannot prove that the old server write
      // did not commit. Retain the old scope's latch without restoring its UI.
      onUncertain(); if (active()) setBlocked(true);
    }
  }, onSettled: () => { submitted.current = false; } });
  const valid = Boolean(form.name.trim() && form.name.trim().length <= 200 && /^\d+$/.test(form.durationMinutes) && Number(form.durationMinutes) >= 1 && Number(form.durationMinutes) <= 1440 && form.description.length <= 2000 && fields.ready && fields.valid && !fields.error && !blocked);
  const dirty = JSON.stringify(form) !== JSON.stringify(original) || Object.keys(fields.patch).length > 0;
  useLayoutNavigationGuard(dirty || blocked, save.isPending, requestLeave);
  const title = serviceId ? 'Edit service' : 'Create service';
  const returnToEdit = () => { save.reset(); setRevision(value => value + 1); };
  const confirm = () => {
    if (!valid || submitted.current || save.isPending || !active()) return;
    submitted.current = true;
    save.mutate(structuredClone({ customFields: fields.patch, name: form.name.trim(), description: form.description.trim() || null, durationMinutes: Number(form.durationMinutes), ...(serviceId ? { active: form.active } : {}) }));
  };
  const retryAdvice = blocked ? 'Outcome uncertain. Do not retry. Check authoritative catalogue records and reload the workspace before starting a new command.' : 'No automatic retry. Return to the editor to correct this draft, then review it again.';
  if (leave) return <AdvancedModal isOpen title="Discard unsaved Service changes?" onClose={() => setLeave(null)} actions={<><button className="quiet-button" onClick={() => setLeave(null)}>Keep service draft</button><button className="danger-button" onClick={() => { const action = leave.action; onClose(); action(); }}>Discard and continue</button></>}><p>Leaving discards this draft. An uncertain write must still be checked against authoritative records before a new command.</p></AdvancedModal>;
  return <OperationForm key={revision} open title={title} reviewLabel="Review service" confirmLabel="Save service" valid={valid} busy={save.isPending} dirty={dirty || blocked} error={save.error} retryAdvice={retryAdvice} onConfirm={confirm} onClose={onClose} review={<>
    <dl className="review-facts"><dt>Service name</dt><dd>{form.name.trim()}</dd><dt>Duration</dt><dd>{form.durationMinutes} minutes</dd><dt>Description</dt><dd>{form.description.trim() || 'Not provided'}</dd><dt>Activity</dt><dd>{form.active ? 'Active' : 'Inactive'}</dd></dl>
    {fields.schema && <DynamicForm schema={fields.schema} values={fields.values} readOnly />}
    {save.isError && !blocked && <button className="quiet-button" onClick={returnToEdit}>Return to service editor</button>}
  </>}>
    {!fields.ready && !fields.error && <p role="status">Loading service fields…</p>}
    {fields.error && <p role="alert">Fields unavailable. <button type="button" onClick={fields.retry}>Retry fields</button></p>}
    {fields.schema && !fields.error && <DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
      name: <Input label="Service name" required maxLength={200} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />,
      durationMinutes: <Input label="Duration (minutes)" type="number" min={1} max={1440} step={1} required value={form.durationMinutes} onChange={event => setForm({ ...form, durationMinutes: event.target.value })} />,
      description: <div className="field"><label htmlFor="service-description">Description (optional)</label><textarea id="service-description" rows={3} maxLength={2000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>,
      active: serviceId && <label className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={event => setForm({ ...form, active: event.target.checked })} />Active service</label>,
    }} />}
    <p className="muted">Availability follows the existing branch assignment. Turning a service inactive hides it from new bookings. Provider assignments are managed separately.</p>
  </OperationForm>;
}
