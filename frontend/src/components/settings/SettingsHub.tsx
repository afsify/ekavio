import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Bell, Building2, CreditCard, GitBranch, KeyRound, LayoutTemplate, Palette, ScrollText, ShieldCheck, SlidersHorizontal, UserRound, UsersRound, type LucideIcon } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { visibleDestinations } from '../layout/navigation';
import { Input } from '../ui/Input';
import './settingsHub.css';

type Category = 'Account' | 'Organization' | 'Configuration' | 'Administration';
interface Setting { label: string; path: string; description: string; category: Category; icon: LucideIcon; manage?: string; managementOnly?: boolean }
const settings: Setting[] = [
  { label: 'My Profile', path: '/settings?section=profile', description: 'Your name, contact identity and verified email.', category: 'Account', icon: UserRound },
  { label: 'Appearance', path: '/settings?section=appearance', description: 'Light, Dark or System and your account accent.', category: 'Account', icon: Palette },
  { label: 'Security', path: '/settings?section=security', description: 'Change your password using the existing secure account workflow.', category: 'Account', icon: ShieldCheck },
  { label: 'Notifications', path: '/settings?section=notifications', description: 'Your in-app notification preferences for the current organization.', category: 'Account', icon: Bell },
  { label: 'Organization information', path: '/admin', description: 'Business profile and operating information, separate from your personal identity.', category: 'Organization', icon: Building2, manage: 'organization.manage' },
  { label: 'Branches', path: '/branches', description: 'Organization locations, branch codes and timezones.', category: 'Organization', icon: GitBranch, manage: 'branches.manage' },
  { label: 'Staff', path: '/staff', description: 'Memberships, invitations and branch assignments.', category: 'Organization', icon: UsersRound, manage: 'staff.manage' },
  { label: 'Roles & permissions', path: '/roles', description: 'Inspect system roles and authorized custom replacement roles.', category: 'Organization', icon: KeyRound, manage: 'roles.manage' },
  { label: 'Data & Forms', path: '/custom-fields', description: 'Six existing record types, custom field definitions and shared form layouts.', category: 'Configuration', icon: LayoutTemplate, manage: 'fields.manage' },
  { label: 'Services configuration', path: '/services', description: 'Manage existing service records and branch availability in the Services workspace.', category: 'Configuration', icon: SlidersHorizontal, manage: 'services.manage', managementOnly: true },
  { label: 'CRM configuration', path: '/crm', description: 'Open CRM, then Pipeline settings for authorized stage configuration.', category: 'Configuration', icon: SlidersHorizontal, manage: 'crm.manage', managementOnly: true },
  { label: 'HR configuration', path: '/hr', description: 'Open HR Plus for existing leave, calendar and shift configuration.', category: 'Configuration', icon: SlidersHorizontal, manage: 'hr_plus.manage', managementOnly: true },
  { label: 'Billing', path: '/billing', description: 'Inspect your organization subscription and commercial agreement.', category: 'Administration', icon: CreditCard },
  { label: 'Audit history', path: '/audit', description: 'Review authorized organization security and administration events.', category: 'Administration', icon: ScrollText },
];
const categories: Category[] = ['Account', 'Organization', 'Configuration', 'Administration'];

export function SettingsHub() {
  const scope = useOperationalScope();
  return <Hub key={JSON.stringify(scope)} />;
}
function Hub() {
  const { user, activeTenantId, entitlements, isPlatformOperator } = useAppStore();
  const [search, setSearch] = useState('');
  const grants = user?.permissions ?? [];
  const allowed = new Set(visibleDestinations(grants, entitlements, isPlatformOperator).map(item => item.path));
  const available = settings.filter(item => allowed.has(item.path.split('?')[0]) && (!item.managementOnly || Boolean(item.manage && grants.includes(item.manage))));
  const query = search.trim().toLowerCase();
  const matches = available.filter(item => [item.label, item.description, item.category].some(value => value.toLowerCase().includes(query)));
  const organization = user?.memberships?.find(item => item.organizationId === activeTenantId)?.orgName ?? 'Your workspace';
  return <section className="page-stack settings-hub" aria-label="Settings hub">
    <div className="panel settings-hub-intro"><div><p className="settings-eyebrow">Your workspace, clearly configured</p><h2>Find the right setting</h2><p>Personal preferences belong to your account. Organization settings follow your current workspace access.</p></div><div className="settings-context"><Building2 size={18} aria-hidden="true" /><span>{organization}</span></div></div>
    <Input type="search" label="Search settings" maxLength={200} value={search} onChange={event => setSearch(event.target.value)} helper="Search available destinations only. No business records or hidden settings are searched." />
    <div className="record-actions"><p className="muted" role="status">{matches.length} available destinations{query ? ' matching your search' : ''}</p>{search && <button className="quiet-button" onClick={() => setSearch('')}>Clear settings search</button>}</div>
    {!matches.length && <section className="panel page-stack"><h3>No matching settings</h3><p>Try a different name or category. Only destinations authorized for your current workspace are shown.</p></section>}
    {categories.map(category => { const items = matches.filter(item => item.category === category); return items.length > 0 && <section className="page-stack" key={category} aria-label={`${category} settings`}><div className="section-heading"><h3>{category}</h3><span className="muted">{category === 'Account' ? 'Personal preferences; notifications are workspace-scoped' : 'Current organization access'}</span></div><div className="settings-destination-grid">{items.map(({ icon: Icon, ...item }) => <Link className="panel settings-destination" key={item.label} to={item.path}><span className="settings-card-icon"><Icon size={21} aria-hidden="true" /></span><div><h4>{item.label}</h4><p>{item.description}</p>{item.manage && <span className="settings-access">{grants.includes(item.manage) ? 'Management access' : 'View only'}</span>}</div><ArrowUpRight className="settings-card-arrow" size={18} aria-hidden="true" /></Link>)}</div></section>; })}
    {!available.some(item => item.category !== 'Account') && <p className="panel muted">No organization configuration destinations are available with your current access. Your personal settings remain available. Ask an authorized administrator if you need different access.</p>}
  </section>;
}
