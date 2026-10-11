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
import { OperationForm } from '../../components/ui/OperationForm';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { uncertainWrite, optionalEmailValid } from '../../utils/mutationOutcome';

interface Member { id: string; name: string; phone: string; role: string }
interface Invitation { id: string; name: string; phone:string;email:string|null;custom_role_id:string|null;branch_ids:string[]; role: string; expires_at: string; revoked_at: string | null; consumed_at: string | null }
export default function StaffManagementPage() { const scope=useOperationalScope();return <StaffWorkspace key={JSON.stringify(scope)}/>; }
function StaffWorkspace() {
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
  const scope=useOperationalScope();
  const [revoking,setRevoking]=useState<Invitation|null>(null);
  const staff = useQuery({ queryKey: ['staff', ...scope], queryFn: async ({signal}) => (await client.get<{ data: Member[] }>('/staff',{signal})).data.data });
  const invites = useQuery({ queryKey: ['staff-invitations', ...scope], enabled: canManage, queryFn: async ({signal}) => (await client.get<{ data: Invitation[] }>('/staff/invitations',{signal})).data.data });
  const create = useMutation({ mutationFn: async () => {
    const response = await client.post<{ data: { handoffUrl?: string } }>('/staff/invitations', { name, phone, ...(email.trim() ? { email: email.trim() } : {}), role, customRoleId, branchIds });
    // Never return the raw handoff to React Query's mutation cache. Only this
    // modal state holds it, and closing/unmounting removes that state.
    setHandoff(response.data.data.handoffUrl ?? null);
  }, onSuccess: () => { setOpen(false); setName(''); setPhone(''); setEmail(''); void queries.invalidateQueries({ queryKey: ['staff-invitations'] }); } });
  const revoke = useMutation({ mutationFn: (id: string) => client.delete('/staff/invitations/' + id), onSuccess: () => void queries.invalidateQueries({ queryKey: ['staff-invitations'] }) });

  return <div className="page-stack administration-workspace"><header className="page-heading"><div><h1>Staff</h1><p>Invite people securely. Every person chooses their own password.</p></div>{canManage && <button className="action-link" disabled={create.isPending||uncertainWrite(create.error)} onClick={() => { create.reset(); setName('');setPhone('');setEmail('');setRole('staff');setCustomRoleId(null);setBranchIds(activeBranchId?[activeBranchId]:[]);setOpen(true); }}>Invite staff</button>}</header>
    {staff.isPending && <p>Loading staff…</p>}{staff.isError && <p role="alert">Staff could not be loaded. <button onClick={() => void staff.refetch()}>Retry</button></p>}
    <StaffAccessCards />
    {canManage && <section className="panel page-stack"><h2 className="font-semibold">Invitations</h2><p className="muted">Invitations expire in 48 hours. Re-invite the same phone after one minute to replace a lost link. Access begins only after acceptance.</p>{invites.isError && <p role="alert">Invitations unavailable. <button onClick={() => void invites.refetch()}>Retry</button></p>}{invites.data?.map((invite) => {
      const status = invite.consumed_at ? 'Accepted' : invite.revoked_at ? 'Revoked' : new Date(invite.expires_at) <= new Date() ? 'Expired' : 'Pending';
      return <div className="record-actions justify-between" key={invite.id}><div><strong>{invite.name}</strong><p className="muted">{invite.role} · {status}</p></div>{status === 'Pending' && <button className="quiet-button" disabled={revoke.isPending||uncertainWrite(revoke.error)} onClick={() => {revoke.reset();setRevoking(invite);}}>Revoke invitation</button>}{!invite.consumed_at && <button className="quiet-button" disabled={create.isPending||uncertainWrite(create.error)} onClick={()=>{create.reset();setName(invite.name);setPhone(invite.phone);setEmail(invite.email??'');setRole(invite.role);setCustomRoleId(invite.custom_role_id);setBranchIds(invite.branch_ids);setOpen(true);}}>Replace invitation</button>}</div>;
    })}{invites.data?.length === 0 && <p className="muted">No invitations yet.</p>}</section>}
    {revoke.isError && <p role="alert">{getErrorMessage(revoke.error, 'Action could not be completed.')}</p>}
    {(uncertainWrite(create.error)||uncertainWrite(revoke.error))&&!open&&!revoking&&<p role="alert">Outcome uncertain. Review persisted invitation status before another command. <button className="quiet-button" onClick={()=>window.location.reload()}>Reload authoritative invitations</button></p>}
    <OperationForm open={open&&canManage} onClose={()=>setOpen(false)} title="Invite staff" dirty={Boolean(name||phone||email)} valid={Boolean(name.trim()&&normalizePhone(phone)&&optionalEmailValid(email)&&branchIds.length&&!uncertainWrite(create.error))} busy={create.isPending} error={create.error} retryAdvice="An uncertain invitation must not be sent again. Check the authoritative invitation list before an explicit replacement." confirmLabel="Send invitation" onConfirm={()=>create.mutate()} review={<section className="panel page-stack"><h3>Review recipient and organization access</h3><p>{name} · {normalizePhone(phone)} · {email.trim()||'Private handoff, no email'}</p><p>Role: {customRoleId?roles.data?.custom.find(r=>r.id===customRoleId)?.name:role}{customRoleId?' (replaces system permissions)':''}</p><p>Branches: {branchIds.map(id=>branches.find(b=>b.id===id)?.name??'Unavailable — reload before sending').join(', ')}</p><p>Single-use invitation, not an active membership. Existing accounts explicitly accept without identity changes; new people choose their own credentials. No operator privilege or paid module is granted.</p></section>}>
      <div className="page-stack"><Input label="Full name" required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /><PhoneInput label="Phone number" required value={phone} onChange={setPhone} /><Input label="Email (optional)" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        <p className="muted">Email invitations verify mailbox control on acceptance. Without email, share the single-use handoff link privately. Existing accounts sign in and explicitly accept. Their identity and credentials are never overwritten.</p>
        <label>Role<select aria-label="Role" value={role} onChange={(event) => setRole(event.target.value)} className="w-full rounded-lg border p-3">{['staff','hr','manager','admin'].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Custom role (replaces built-in permissions)<select aria-label="Custom role" className="w-full rounded-lg border p-3" value={customRoleId??''} onChange={e=>setCustomRoleId(e.target.value||null)}><option value="">Use system role</option>{roles.data?.custom.filter(r=>r.status==='active'&&r.permissions.every(p=>user?.permissions?.includes(p))).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <fieldset className="page-stack"><legend>Assigned branches</legend>{branches.map((branch) => <label key={branch.id} className="flex gap-2"><input type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds((current) => event.target.checked ? [...current, branch.id] : current.filter((id) => id !== branch.id))} />{branch.name}</label>)}</fieldset>
        {create.isError && <p role="alert">{getErrorMessage(create.error, 'Invitation could not be created.')}</p>}
      </div>
    </OperationForm>
    <OperationForm open={Boolean(revoking)} title="Revoke staff invitation" dirty={false} valid={!uncertainWrite(revoke.error)} busy={revoke.isPending} error={revoke.error} retryAdvice="Check the authoritative invitation status if the outcome is uncertain." review={<p>Revoke the pending invitation for {revoking?.name}. It cannot be accepted afterwards. Existing identities and memberships remain unchanged.</p>} confirmLabel="Revoke invitation" onClose={()=>setRevoking(null)} onConfirm={()=>{if(revoking)revoke.mutate(revoking.id,{onSuccess:()=>setRevoking(null)});}}><p>{revoking?.name} · Pending invitation · Access has not been accepted.</p></OperationForm>
    <AdvancedModal isOpen={Boolean(handoff)} onClose={() => setHandoff(null)} title="One-time invitation handoff" actions={<button className="quiet-button" onClick={() => setHandoff(null)}>I have handed off the link</button>}><p className="muted">Share privately with the intended person. This link cannot be retrieved after closing; replace it if lost. Never put it in logs or screenshots.</p><input aria-label="One-time handoff link" readOnly value={handoff ?? ''} className="w-full rounded-lg border p-3 mt-4" onFocus={(event) => event.target.select()} /></AdvancedModal>
  </div>;
}
