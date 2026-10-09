import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AdvancedModal } from './AdvancedModal';
import { getErrorMessage } from '../../api/errors';

interface Props { open: boolean; title: string; children: ReactNode; review: ReactNode; valid: boolean; busy: boolean; dirty: boolean; error?: unknown; retryAdvice?: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }
/** One dialog, including discard/review states; no nested traps or mobile nav overlap. */
export function OperationForm(props: Props) { return props.open ? <OpenOperationForm {...props} /> : null; }
function OpenOperationForm({ title, children, review, valid, busy, dirty, error, retryAdvice = 'Retry keeps the original command key and values.', confirmLabel, onConfirm, onClose }: Props) {
  const [stage, setStage] = useState<'edit' | 'review' | 'discard'>('edit');
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => { if (stage !== 'edit') content.current?.focus(); }, [stage]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const close = () => { if (!busy) { if (dirty) setStage('discard'); else onClose(); } };
  return <AdvancedModal isOpen onClose={close} title={stage === 'discard' ? 'Discard unsaved changes?' : stage === 'review' ? `Review · ${title}` : title} size="xl" closeOnEscape={!busy} closeOnBackdropClick={!busy} actions={stage === 'discard' ? <><button className="quiet-button" onClick={() => setStage(error ? 'review' : 'edit')}>Keep editing</button><button className="danger-button" onClick={onClose}>Discard changes</button></> : <><button className="quiet-button" disabled={busy} onClick={close}>Cancel</button>{stage === 'review' && <button className="quiet-button" disabled={busy || Boolean(error)} onClick={() => setStage('edit')}>Back</button>}<button className="action-link" disabled={busy || !valid} onClick={() => { if (busy || !valid) return; if (stage === 'edit') setStage('review'); else onConfirm(); }}>{busy ? 'Saving…' : stage === 'edit' ? 'Review' : confirmLabel}</button></>}>
    <div ref={content} tabIndex={-1}>{stage === 'discard' ? <p>Changes are not saved. If an earlier request failed after submission, refresh authoritative records before starting a new command.</p> : <div className="page-stack">{stage === 'review' ? <><p className="muted">Check the facts before confirming. The server validates the current workspace and balance again.</p>{review}</> : children}{Boolean(error) && <p role="alert" className="error-text">{getErrorMessage(error, 'The command could not be completed. Check authoritative records if the outcome is uncertain.')} {retryAdvice}</p>}</div>}</div>
  </AdvancedModal>;
}
