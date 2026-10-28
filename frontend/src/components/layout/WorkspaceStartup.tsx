import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLockup } from '../brand/Brand';
import { Button } from '../ui/Button';
import { useAppStore } from '../../store/useAppStore';
import './WorkspaceStartup.css';

/** No account names, cached records or workspace chrome before server verification. */
export function WorkspaceStartup() {
  const pending = useAppStore((state) => state.isBootstrapping);
  const error = useAppStore((state) => state.startupError);
  const retry = useAppStore((state) => state.bootstrapSession);
  const [connecting, setConnecting] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setConnecting(true), 1500);
    return () => window.clearTimeout(timer);
  }, [pending]);
  const title = pending
    ? connecting ? 'Connecting to your workspace' : 'Checking your session'
    : error === 'unavailable' ? 'We couldn’t reach your workspace' : 'We couldn’t verify this session';
  const description = pending
    ? connecting ? 'The service is taking longer to respond. Your workspace will open only after verification.' : 'Verifying secure access before opening your workspace.'
    : error === 'unavailable' ? 'The service may be unavailable or your connection may be interrupted. This does not mean your session has expired.' : 'The service could not complete verification. Try again, or return to sign in.';
  return <main className="workspace-startup">
    <section className="workspace-startup-card" aria-labelledby="startup-heading">
      <Link className="workspace-startup-brand" to="/" aria-label="EkaVio home"><BrandLockup /></Link>
      <p className="workspace-startup-eyebrow">Your workspace, securely</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h1 id="startup-heading">{title}</h1><p className="workspace-startup-description">{description}</p>
      </div>
      {pending && <div className="workspace-startup-placeholder" aria-hidden="true"><span /><span /><span /></div>}
      <div className="workspace-startup-actions">
        {!pending && <Button onClick={() => void retry()}>Try again</Button>}
        <Link className="quiet-button" to="/">Return to home</Link>
        {!pending && <Link className="quiet-button" to="/login">Sign in</Link>}
      </div>
      <p className="workspace-startup-footnote">No workspace information is shown until access is verified.</p>
    </section>
  </main>;
}
