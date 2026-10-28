import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronDown, CircleHelp, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { AdvancedModal } from '../ui/AdvancedModal';
import { ThemeModeChoice } from '../ui/ThemeControl';
import { useAppStore } from '../../store/useAppStore';
import { SignOutButton } from './SignOutButton';

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { user, activeTenantId } = useAppStore();
  const membership = user?.memberships?.find(item => item.organizationId === activeTenantId);
  const initials = user?.name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  return <>
    <button ref={trigger} type="button" className="account-trigger icon-button" aria-label="Account menu" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><span className="account-avatar" aria-hidden="true">{initials}</span><ChevronDown size={14} aria-hidden="true" /></button>
    {createPortal(<AdvancedModal isOpen={open} onClose={close} title="Your account" size="sm" presentation="popover" anchorRef={trigger}>
      <div className="account-sheet"><div className="account-identity"><span className="account-avatar" aria-hidden="true">{initials}</span><div><p className="account-name">{user?.name ?? 'Team member'}</p><p className="muted">{user?.roleName ?? user?.role ?? 'Member'}</p><p className="muted">{membership?.orgName ?? 'Your workspace'}</p></div></div>
        <nav aria-label="Account actions"><Link to="/settings?section=profile" onClick={close}><UserRound size={18} aria-hidden="true" />My profile</Link><Link to="/settings?section=security" onClick={close}><ShieldCheck size={18} aria-hidden="true" />Security & password</Link><Link to="/settings" onClick={close}><Settings size={18} aria-hidden="true" />Settings</Link><Link to="/help" onClick={close}><CircleHelp size={18} aria-hidden="true" />Help & support</Link></nav>
        <ThemeModeChoice legend="Appearance" />
        <SignOutButton className="account-signout" onClose={close} />
      </div>
    </AdvancedModal>, document.body)}
  </>;
}
