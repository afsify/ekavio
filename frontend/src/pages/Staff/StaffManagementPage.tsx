import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { normalizePhone } from '../../utils/phone';
import { type RoleData, type Branch } from '../Settings/OrganizationPage';
import { useOrganizationData } from '../../hooks/useOrganizationData';
import StaffAccessCards from './StaffAccessCards';
import { AdvancedModal } from '../../components/ui/AdvancedModal';

interface Member { id: string; name: string; phone: string; role: string }
interface Invitation { id: string; name: string; phone:string;email:string|null;custom_role_id:string|null;branch_ids:string[]; role: string; expires_at: string; revoked_at: string | null; consumed_at: string | null }
export default function StaffManagementPage() {
  const { user, activeTenantId, activeBranchId } = useAppStore();
  const canManage = user?.permissions?.includes('staff.manage') ?? false;
  const allBranches=useOrganizationData<Branch[]>('/branches',canManage&&Boolean(user?.permissions?.includes('branches.read')));
  const branches=allBranches.data?.filter(b=>b.status==='active') ?? user?.memberships?.find((item)=>item.organizationId===activeTenantId)?.branches ?? [];
  const roles=useOrganizationData<RoleData>('/roles',canManage&&Boolean(user?.permissions?.includes('roles.read')));
  const [customRoleId,setCustomRoleId]=useState<string|null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [branchIds, setBranchIds] = useState<string[]>(activeBranchId ? [activeBranchId] : []);
  const [handoff, setHandoff] = useState<string | null>(null);
  const queries = useQueryClient();
  const staff = useQuery({ queryKey: ['staff', activeTenantId], queryFn: async () => (await client.get<{ data: Member[] }>('/staff')).data.data });
  const invites = useQuery({ queryKey: ['staff-invitations', activeTenantId], enabled: canManage, queryFn: async () => (await client.get<{ data: Invitation[] }>('/staff/invitations')).data.data });
  const create = useMutation({ mutationFn: async () => {
    const response = await client.post<{ data: { handoffUrl?: string } }>('/staff/invitations', { name, phone, ...(email.trim() ? { email: email.trim() } : {}), role, customRoleId, branchIds });
    // Never return the raw handoff to React Query's mutation cache. Only this
    // modal state holds it, and closing/unmounting removes that state.
    setHandoff(response.data.data.handoffUrl ?? null);
  }, onSuccess: () => { setOpen(false); setName(''); setPhone(''); setEmail(''); void queries.invalidateQueries({ queryKey: ['staff-invitations'] }); } });
  const revoke = useMutation({ mutationFn: (id: string) => client.delete('/staff/invitations/' + id), onSuccess: () => void queries.invalidateQueries({ queryKey: ['staff-invitations'] }) });

  return <div className="page-stack"><header className="page-heading"><div><h1>Staff</h1><p>Invite people securely. Every person chooses their own password.</p></div>{canManage && <button className="action-link" onClick={() => { create.reset(); setOpen(true); }}>Invite staff</button>}</header>
    {staff.isPending && <p>Loading staff…</p>}{staff.isError && <p role="alert">Staff could not be loaded. <button onClick={() => void staff.refetch()}>Retry</button></p>}
    <StaffAccessCards />
    {canManage && <section className="panel page-stack"><h2 className="font-semibold">Invitations</h2><p className="muted">Invitations expire in 48 hours. Re-invite the same phone after one minute to replace a lost link. Access begins only after acceptance.</p>{invites.isError && <p role="alert">Invitations unavailable. <button onClick={() => void invites.refetch()}>Retry</button></p>}{invites.data?.map((invite) => {
      const status = invite.consumed_at ? 'Accepted' : invite.revoked_at ? 'Revoked' : new Date(invite.expires_at) <= new Date() ? 'Expired' : 'Pending';
      return <div className="record-actions justify-between" key={invite.id}><div><strong>{invite.name}</strong><p className="muted">{invite.role} · {status}</p></div>{status === 'Pending' && <button className="quiet-button" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.id)}>Revoke invitation</button>}{!invite.consumed_at && <button className="quiet-button" onClick={()=>{create.reset();setName(invite.name);setPhone(invite.phone);setEmail(invite.email??'');setRole(invite.role);setCustomRoleId(invite.custom_role_id);setBranchIds(invite.branch_ids);setOpen(true);}}>Replace invitation</button>}</div>;
    })}{invites.data?.length === 0 && <p className="muted">No invitations yet.</p>}</section>}
    {revoke.isError && <p role="alert">{getErrorMessage(revoke.error, 'Action could not be completed.')}</p>}
    <AdvancedModal isOpen={open && canManage} onClose={() => setOpen(false)} title="Invite staff" actions={<button className="action-link" disabled={create.isPending || !name.trim() || !normalizePhone(phone) || !branchIds.length} onClick={() => create.mutate()}>Send invitation</button>}>
      <div className="page-stack"><Input label="Full name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /><PhoneInput label="Phone number" required value={phone} onChange={setPhone} /><Input label="Email (optional)" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        <p className="muted">Email invitations verify mailbox control on acceptance. Without email, share the single-use handoff link privately. Existing accounts sign in and explicitly accept. Their identity and credentials are never overwritten.</p>
        <label>Role<select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-lg border p-3">{['staff','hr','manager','admin'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Custom role (replaces built-in permissions)<select aria-label="Custom role" className="w-full rounded-lg border p-3" value={customRoleId??''} onChange={e=>setCustomRoleId(e.target.value||null)}><option value="">Use system role</option>{roles.data?.custom.filter(r=>r.status==='active'&&r.permissions.every(p=>user?.permissions?.includes(p))).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <fieldset className="page-stack"><legend>Assigned branches</legend>{branches.map((branch) => <label key={branch.id} className="flex gap-2"><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds((current) => event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id))} />{branch.name}</label>)}</fieldset>
        {create.isError && <p role="alert">{getErrorMessage(create.error, 'Invitation could not be created.')}</p>}
      </div>
    </AdvancedModal>
    <AdvancedModal isOpen={Boolean(handoff)} onClose={() => setHandoff(null)} title="One-time invitation handoff" actions={<button className="quiet-button" onClick={() => setHandoff(null)}>I have handed off the link</button>}><p className="muted">Share privately with the intended person. This link cannot be retrieved after closing; replace it if lost. Never put it in logs or screenshots.</p><input aria-label="One-time handoff link" readOnly value={handoff ?? ''} className="w-full rounded-lg border p-3 mt-4" onFocus={(event) => event.target.select()} /></AdvancedModal>
  </div>;
}
