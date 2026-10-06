import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { ProfileSettingsModal } from '../../components/ui/ProfileSettingsModal';
import { Input } from '../../components/ui/Input';
import { TechnicalDetails } from '../../components/ui/TechnicalDetails';
import { EmailSettings } from '../Identity/EmailSettings';

const accents = [{ name: 'Indigo', color: '#4F46E5' }, { name: 'Forest', color: '#087443' }, { name: 'Violet', color: '#7040BC' }, { name: 'Rose', color: '#B42358' }];
export default function SettingsPage() {
  const { user, theme, setTheme, activeTenantId, activeBranchId } = useAppStore();
  const [params, setParams] = useSearchParams();
  const sections = ['profile', 'appearance', 'organization', 'security'] as const;
  const section = sections.find((value) => value === params.get('section')) ?? 'profile';
  const [name, setName] = useState(user?.name ?? '');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const membership = user?.memberships?.find((item) => item.organizationId === activeTenantId);
  const branch = membership?.branches.find((item) => item.id === activeBranchId);
  const organizationAdmin = user?.permissions?.includes('organization.manage');
  const profile = useMutation({
    mutationFn: (submittedName: string) => client.put('/profile', { name: submittedName }),
    onSuccess: (_response, submittedName) => { useAppStore.setState((state) => ({ user: state.user ? { ...state.user, name: submittedName } : null })); toast.success('Profile saved'); },
  });
  return <div className="page-stack"><header className="page-heading"><div><h1>Settings</h1><p>Manage your profile, appearance and workspace information.</p></div></header>
    <nav className="settings-tabs" aria-label="Settings sections">{sections.map((value) => <button key={value} className="quiet-button capitalize" aria-current={section === value ? 'page' : undefined} onClick={() => setParams({ section: value })}>{value === 'profile' ? 'My Profile' : value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {section === 'profile' && <section className="panel page-stack"><h2 className="font-semibold">My Profile</h2><form className="page-stack" onSubmit={(event) => { event.preventDefault(); profile.mutate(name.trim()); }}><Input label="Your name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /><div><p className="muted">Phone</p><p>{user?.phone ?? 'Not supplied'}</p></div><div><p className="muted">Role</p><p className="capitalize">{user?.role ?? 'Member'}</p></div>{profile.isError && <p className="error-text" role="alert">{getErrorMessage(profile.error, 'Profile could not be saved.')}</p>}<button type="submit" className="action-link" disabled={!name.trim() || profile.isPending}>{profile.isPending ? 'Saving…' : 'Save profile'}</button></form><EmailSettings /><TechnicalDetails values={{ 'User identifier': user?.id, 'Organization identifier': activeTenantId, 'Branch identifier': activeBranchId }} /></section>}
    {section === 'appearance' && <section className="panel page-stack"><h2 className="font-semibold">Appearance</h2><fieldset><legend className="mb-3">Theme</legend><div className="record-actions">{(['light','dark','system'] as const).map((mode) => <label key={mode} className="quiet-button gap-2 capitalize"><input type="radio" name="theme" value={mode} checked={theme.mode === mode} readOnly onClick={() => setTheme(mode)} />{mode[0].toUpperCase() + mode.slice(1)}</label>)}</div></fieldset><p className="muted">System follows your device appearance, including changes while this page is open. Signed-in preferences sync to your account across devices; this device keeps a local fallback.</p><fieldset><legend>Accent</legend><div className="record-actions">{accents.map((accent) => <button key={accent.color} className="quiet-button gap-2" aria-pressed={theme.primaryColor.toLowerCase() === accent.color.toLowerCase()} onClick={() => setTheme(theme.mode, accent.color)}><span aria-hidden="true" className="h-4 w-4 rounded-full" style={{ background: accent.color }} />{accent.name}</button>)}</div></fieldset></section>}
    {section === 'organization' && <section className="panel page-stack"><h2 className="font-semibold">Organization settings</h2><div><p className="muted">Workspace</p><p>{membership?.orgName ?? 'Your workspace'}</p></div><div><p className="muted">Selected branch</p><p>{branch?.name ?? 'No branch selected'}</p></div>{organizationAdmin && <Link className="action-link" to="/admin">Open organization administration</Link>}<p className="muted">Business profile, branches, staff, roles, modules, billing and audit are separate from your personal profile and preferences.</p></section>}
    {section === 'security' && <section className="panel page-stack"><h2 className="font-semibold">Security</h2><p className="muted">Change your password using your current password. Successful changes revoke your sessions and require a new sign-in.</p><button className="action-link" onClick={() => setPasswordOpen(true)}>Change password</button></section>}
    <ProfileSettingsModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} />
  </div>;
}
