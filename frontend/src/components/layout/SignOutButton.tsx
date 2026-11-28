import { LogOut } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

/** One presentation adapter for the existing secure logout, shared by both menus. */
export function SignOutButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  const logout = useAppStore(state => state.logout);
  const busy = useAppStore(state => state.logoutStatus === 'pending');
  return <button type="button" className={`quiet-button ${className}`} aria-label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onClick={() => {
    void logout();
    onClose();
  }}><LogOut size={18} aria-hidden="true" /><span>{busy ? 'Signing out…' : 'Sign out'}</span></button>;
}
