import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { type RoleData, type Branch } from '../Settings/OrganizationPage';
import { useOrganizationData } from '../../hooks/useOrganizationData';
import { useAppStore } from '../../store/useAppStore';
import { client, restoreSession } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { Input } from '../../components/ui/Input';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { EntityFields } from '../../components/forms/EntityFields';
import { OperationForm } from '../../components/ui/OperationForm';
import { BoundedDirectory } from '../../components/ui/BoundedDirectory';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { uncertainWrite } from '../../utils/mutationOutcome';
interface Member {id:string;name:string;phone:string;email:string|null;role:string;roleName:string|null;customRoleId:string|null;membershipId:string;status:string;branchIds:string[];branchNames:string[];version:number;updated_at:string}
export default function StaffAccessCards() { const scope=useOperationalScope();return <StaffDirectory key={JSON.stringify(scope)}/>; }
function StaffDirectory() {
  const user=useAppStore(s=>s.user); const grants=user?.permissions??[]; const manage=grants.includes('staff.manage');
  const [search,setSearch]=useState('');const [editing,setEditing]=useState<Member|null>(null);
  const [detail,setDetail]=useState<Member|null>(null);
  const fields=useDynamicForm('membership',editing?.membershipId,Boolean(editing));
  const members=useOrganizationData<Member[]>('/members?search='+encodeURIComponent(search));
  const branches=useOrganizationData<Branch[]>('/branches',manage&&grants.includes('branches.read'));
  const roles=useOrganizationData<RoleData>('/roles',manage&&grants.includes('roles.read'));
  const cache=useQueryClient(); const save=useMutation({mutationFn:async()=>{
    if(editing) await client.patch('/members/'+editing.membershipId,{customFields:fields.patch,role:editing.role,customRoleId:editing.customRoleId,status:editing.status,branchIds:editing.branchIds,version:editing.version});
  },onSuccess:async()=>{if(editing?.id===user?.id){const tenant=useAppStore.getState().activeTenantId;if(tenant)useAppStore.getState().establishSession(await restoreSession({organizationId:tenant}));}setEditing(null);void cache.invalidateQueries({queryKey:['form-values']});void cache.invalidateQueries({queryKey:['organization-admin']});toast.success('Staff access saved');}});
  const availableBranches=branches.data??(editing?.branchIds.map((id,index)=>({id,name:editing.branchNames[index]??'Assigned branch',status:'active' as const}))??[]);
  const begin=(m:Member)=>{fields.reset();save.reset();setDetail(null);setEditing({...m,branchIds:[...m.branchIds]});};
  const accessLoading=save.isPending||uncertainWrite(save.error)||(grants.includes('branches.read')&&(branches.isPending||branches.isError))||(grants.includes('roles.read')&&(roles.isPending||roles.isError));
  const actions=(m:Member)=><div className="record-actions">{manage&&<button className="quiet-button" disabled={accessLoading} onClick={()=>begin(m)}>{m.id===user?.id?'My branch assignments':`Edit ${m.name}`}</button>}<button className="quiet-button" onClick={()=>setDetail(m)}>Details</button></div>;
  const original=members.data?.find(m=>m.membershipId===editing?.membershipId);
  const review=<section className="panel page-stack"><h3>Review organization-local access</h3><p>{editing?.name} · {editing?.status} · {editing?.customRoleId?(roles.data?.custom.find(r=>r.id===editing.customRoleId)?.name??editing?.roleName??'Current server-assigned replacement role'):editing?.role}</p><p>Assigned branches: {editing?.branchIds.map(id=>availableBranches.find(b=>b.id===id)?.name??'Unavailable branch — reload before saving').join(', ')}</p><p>{editing?.customRoleId?'This custom role replaces all built-in permissions.':'The system role retains its server-defined policy.'} Identity, credentials and other organization memberships are unchanged. Suspension/revocation removes this organization access; owners and self-authority remain server-protected.</p><p>Custom fields are validated by the canonical Staff layout.</p></section>;
  return <div className="page-stack"><Input label="Search staff" value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/>{!manage&&<p>Read-only organization membership directory.</p>}
    <BoundedDirectory title="Organization staff" description="Server name/phone search, in server name order. At most 200 matching memberships; not a complete-count or globally sortable directory. Branch assignments are organization-local."
      rows={members.data??[]} loading={members.isPending} error={members.isError?getErrorMessage(members.error,'Memberships unavailable.'):undefined} retry={()=>void members.refetch()} empty="No matching staff."
      columns={[{header:'Member',accessor:'name',cell:({row:m})=><div><h2>{m.name}</h2><p>{m.phone}</p><p>{m.email??'No verified email'}</p></div>},{header:'Role / membership',accessor:'role',cell:({row:m})=><p>{m.roleName??m.role} · {m.status}</p>},{header:'Assigned branches',accessor:'branchNames',cell:({row:m})=>m.branchNames.join(', ')||'No assigned branches'},{header:'Actions',accessor:'id',cell:({row:m})=>actions(m)}]}
      card={m=><article className="panel record-card"><h2>{m.name}</h2><p>{m.phone} · {m.email??'No verified email'}</p><p>{m.roleName??m.role} · {m.status}</p><p>{m.branchNames.join(', ')||'No assigned branches'}</p>{actions(m)}</article>}/>
    {uncertainWrite(save.error)&&<p role="alert">Access outcome uncertain. Check server authority before another command. <button className="quiet-button" onClick={()=>window.location.reload()}>Reload authoritative workspace</button></p>}
    <OperationForm open={Boolean(editing)} onClose={()=>setEditing(null)} title="Staff access" dirty={Boolean(editing&&(JSON.stringify(editing)!==JSON.stringify(original)||Object.keys(fields.patch).length))} valid={Boolean(fields.ready&&fields.valid&&!fields.error&&editing?.branchIds.length&&!uncertainWrite(save.error))} busy={save.isPending} error={save.error} retryAdvice="Reload current authority after a conflict or uncertain outcome; do not guess whether access changed." review={review} confirmLabel="Save staff access" onConfirm={()=>save.mutate()}>
      {editing&&<div className="page-stack"><h3>{editing.name}</h3>{fields.schema&&<DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
        role:<label className="field">Role<select aria-label="Staff role" disabled={!roles.data||editing.role==='owner'||editing.id===user?.id} value={editing.customRoleId?'custom:'+editing.customRoleId:editing.role} onChange={e=>setEditing({...editing,role:e.target.value.startsWith('custom:')?'staff':e.target.value,customRoleId:e.target.value.startsWith('custom:')?e.target.value.slice(7):null})}>{!roles.data&&<option value={editing.customRoleId?'custom:'+editing.customRoleId:editing.role}>{editing.roleName??editing.role} (current server assignment)</option>}{(roles.data?.system??[]).filter(r=>(r.name!=='owner'||editing.role==='owner')&&r.permissions.every(p=>grants.includes(p))).map(r=><option key={r.name} value={r.name}>{r.name}</option>)}{roles.data?.custom.filter(r=>r.status==='active'&&r.permissions.every(p=>grants.includes(p))).map(r=><option key={r.id} value={'custom:'+r.id}>{r.name}</option>)}</select></label>,
        status:<label className="field">Status<select aria-label="Membership status" disabled={editing.role==='owner'||editing.id===user?.id} value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value})}><option value="active">Active</option><option value="inactive">Suspended</option><option value="revoked">Revoked</option></select></label>,
        branchIds:<fieldset className="page-stack"><legend>Assigned branches</legend>{availableBranches.filter(b=>b.status==='active').map(b=><label className="flex gap-2" key={b.id}><input type="checkbox" disabled={!branches.data} checked={editing.branchIds.includes(b.id)} onChange={e=>setEditing({...editing,branchIds:e.target.checked?[...editing.branchIds,b.id]:editing.branchIds.filter(id=>id!==b.id)})}/>{b.name}</label>)}</fieldset>
      }}/>}<p>Roles and paid modules are separate. Branches not currently active must be resolved before saving.</p>{fields.error&&<p role="alert">Fields unavailable. <button onClick={fields.retry}>Retry fields</button></p>}</div>}
    </OperationForm>
    <AdvancedModal isOpen={Boolean(detail)} onClose={()=>setDetail(null)} title="Staff details" presentation="drawer"><div className="page-stack">{detail&&<><h2>{detail.name}</h2><dl className="detail-facts"><div><dt>Protected identity</dt><dd>{detail.phone} · {detail.email??'No verified email'}</dd></div><div><dt>Organization membership</dt><dd>{detail.status} · version {detail.version}</dd></div><div><dt>Effective role assignment</dt><dd>{detail.roleName??detail.role}{detail.customRoleId?' (replacement role)':''}</dd></div><div><dt>Assigned branches</dt><dd>{detail.branchNames.join(', ')||'None'}</dd></div></dl><EntityFields entity="membership" id={detail.membershipId}/>{manage&&<button className="quiet-button" disabled={accessLoading} onClick={()=>begin(detail)}>Edit {detail.name}</button>}</>}</div></AdvancedModal>
  </div>;
}
