import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { uncertainWrite } from '../utils/mutationOutcome';
import { useLayoutNavigationGuard } from './useLayoutNavigationGuard';
import { cloneSections, layoutErrors, layoutSections, sameLayout, startLayoutDraft, type LayoutDraft } from '../components/forms/layoutDraft';
import { type FormSchema, type Section } from '../components/forms/formSchema';

export function currentLayoutAuthority() {
  const { user, activeTenantId, activeBranchId, entitlements, isPlatformOperator } = useAppStore.getState();
  return JSON.stringify([user?.id, activeTenantId, activeBranchId, user?.permissions?.slice().sort().join(','), JSON.stringify(entitlements), isPlatformOperator]);
}
interface Command { draft: LayoutDraft; reset: boolean }
export function useLayoutStudio(schema: FormSchema | undefined, authority: string, manage: boolean, refresh: () => Promise<void>) {
  const [draft, setDraft] = useState<LayoutDraft | null>(null), [review, setReview] = useState<Command | null>(null);
  const [leave, setLeave] = useState<{ action: () => void } | null>(null), [preview, setPreview] = useState<'desktop' | 'mobile' | null>(null), [notice, setNotice] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false), [reloading, setReloading] = useState(false);
  const submitted = useRef(false), alive = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  const active = () => alive.current && currentLayoutAuthority() === authority;
  const save = useMutation({ mutationFn: async (command: Command) => {
    if (!active() || !manage || command.draft.authority !== authority) throw new Error('Workspace authority changed; this draft cannot be submitted.');
    controller.current = new AbortController();
    const requestController = controller.current;
    // Abort synchronously on store replacement, before axios can select
    // headers from another authority or React commits the keyed remount.
    const unsubscribe = useAppStore.subscribe(() => { if (!active()) requestController.abort(); });
    // Transport only: the server ignores reset sections and computes defaults.
    const sections = command.reset ? [{ id: crypto.randomUUID(), title: 'Reset request', fields: [] }] : cloneSections(command.draft.sections);
    try {
      await client[command.reset ? 'post' : 'put'](`/forms/${command.draft.schema.entity}/layout${command.reset ? '/reset' : ''}`, { version: command.draft.schema.version, sections }, { signal: requestController.signal });
      if (!active()) return;
      await refresh();
      if (!active()) return;
      setVerificationRequired(false); setDraft(null); setReview(null); setPreview(null); setNotice(command.reset ? 'Default layout restored by the server.' : 'Layout saved and authoritative schema refreshed.');
    } finally { unsubscribe(); }
  }, onError: error => { if (active() && uncertainWrite(error)) setVerificationRequired(true); }, onSettled: () => { submitted.current = false; } });
  const busy = save.isPending || reloading, blocked = verificationRequired || uncertainWrite(save.error), source = draft?.schema ?? schema;
  const sections = draft?.sections ?? (schema ? layoutSections(schema) : []);
  const dirty = Boolean(draft && !sameLayout(draft.original, draft.sections)), errors = source ? layoutErrors(source, sections) : [];
  const protect = dirty || blocked, requestLeave = useCallback((action: () => void) => { setReview(null); setPreview(null); setLeave({ action }); }, []);
  useLayoutNavigationGuard(protect, busy, requestLeave);
  const guard = (action: () => void) => { if (!busy) { if (protect) requestLeave(action); else action(); } };
  const discard = () => { setDraft(draft ? { ...draft, sections: cloneSections(draft.original) } : null); setReview(null); save.reset(); setNotice('Draft restored to its original snapshot.'); };
  return {
    draft, source, sections, dirty, busy, blocked, errors, review, leave, preview, notice, save,
    stale: Boolean(draft && schema && draft.schema.version !== schema.version),
    edit: (operation: (sections: Section[], unplacedId?: string) => Section[]) => {
      if (!schema || !manage || busy || blocked || !active()) return;
      setNotice(''); save.reset();
      setDraft(previous => {
        const base = previous ?? startLayoutDraft(schema, authority);
        const unplacedId = base.original.find(section => !base.schema.sections.some(saved => saved.id === section.id))?.id;
        const next = operation(cloneSections(base.sections), unplacedId);
        // A display-only unplaced section must not strand an existing 20-section
        // layout after all new fields are moved into its persisted sections.
        const sections = next.length > 20 ? next.filter(section => section.id !== unplacedId || section.fields.length > 0) : next;
        return { ...base, sections };
      });
    },
    guard, setPreview, discard, cancelLeave: () => setLeave(null),
    acceptLeave: () => { if (!leave || busy) return; const action = leave.action; setLeave(null); setDraft(null); setReview(null); setPreview(null); save.reset(); action(); },
    reviewSave: () => { if (draft && dirty && !busy && !blocked && !errors.length) setReview({ draft: structuredClone(draft), reset: false }); },
    reviewReset: () => { if (schema && manage && !busy && !blocked) setReview({ draft: structuredClone(draft ?? startLayoutDraft(schema, authority)), reset: true }); },
    closeReview: () => { if (!busy && !submitted.current) setReview(null); },
    confirm: () => { if (!review || busy || blocked || submitted.current || !manage || !active()) return; submitted.current = true; save.mutate(review); },
    reload: () => guard(() => {
      setReloading(true);
      void (async () => {
        try { await refresh(); if (!active()) return; setVerificationRequired(false); setDraft(null); setReview(null); save.reset(); setNotice('Authoritative layout reloaded. The previous draft was discarded explicitly.'); }
        catch { if (active()) setNotice('Reload failed. Current server configuration could not be verified; no write was retried.'); }
        finally { if (active()) setReloading(false); }
      })();
    }),
  };
}
export type LayoutStudioController = ReturnType<typeof useLayoutStudio>;
