import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '../../store/useAppStore';

/** One presentation adapter for the existing secure logout, shared by both menus. */
export function SignOutButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
  const logout = useAppStore(state => state.logout);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate(), cache = useQueryClient();
  return <button type="button" className={`quiet-button ${className}`} aria-label={busy ? 'Signing out…' : 'Sign out'} disabled={busy} onClick={() => {
    setBusy(true);
    void logout().catch(() => toast.error('Signed out locally; server revocation unavailable')).finally(() => { cache.clear(); setBusy(false); onClose(); navigate('/login', { replace: true }); });
  }}><LogOut size={18} aria-hidden="true" /><span>{busy ? 'Signing out…' : 'Sign out'}</span></button>;
}
