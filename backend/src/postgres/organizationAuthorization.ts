import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { permissionsForRole, type Permission } from '../services/authorizationPolicy.js';
import type { MembershipRole } from '../models/Membership.js';
import { AppError } from '../utils/AppError.js';

type Query = {query<Row extends QueryResultRow = QueryResultRow>(text:string,values?:unknown[]):Promise<QueryResult<Row>>};
export async function membershipAuthority(query: Query, userId: string, organizationId: string) {
  const result = await query.query<{ id: string; role: MembershipRole; custom_role_id: string | null; role_name: string | null; role_status: string | null; permissions: Permission[] }>(`
    SELECT m.id,m.role,m.custom_role_id,r.name AS role_name,r.status AS role_status,
      ARRAY(SELECT permission FROM organization_role_permissions WHERE role_id=r.id ORDER BY permission) AS permissions
    FROM memberships m LEFT JOIN organization_roles r ON r.id=m.custom_role_id AND r.organization_id=m.organization_id
    WHERE m.user_id=$1 AND m.organization_id=$2 AND m.status='active'`, [userId,organizationId]);
  const row=result.rows[0];
  if(!row) throw new AppError('Access denied to this organization',403);
  const effective = row.role==='owner' || !row.custom_role_id ? permissionsForRole(row.role) : row.role_status==='active' ? row.permissions : [];
  return {...row,effective};
}
// All administration mutations and invitation acceptance serialize on this row.
// Re-read authority after acquiring it: a stale HTTP context is never grant authority.
export async function lockAdministration(query: PoolClient, userId: string, organizationId: string, permission: Permission) {
  await query.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[organizationId]);
  const actor=await membershipAuthority(query,userId,organizationId);
  if(!actor.effective.includes(permission)) throw new AppError('Permission denied',403);
  return actor;
}
export function assertGrant(actor: {effective: Permission[]}, requested: readonly Permission[]) {
  if(requested.some((permission)=>!actor.effective.includes(permission))) throw new AppError('Cannot grant permissions you do not hold',403);
}
export async function assignmentPermissions(query: Query, organizationId: string, role: MembershipRole, customRoleId?: string | null) {
  if(!customRoleId) return permissionsForRole(role);
  if(role==='owner') throw new AppError('Owner must retain the built-in role',400);
  const r=await query.query<{permissions: Permission[]}>(`SELECT ARRAY(SELECT permission FROM organization_role_permissions WHERE role_id=r.id ORDER BY permission) AS permissions
    FROM organization_roles r WHERE id=$1 AND organization_id=$2 AND status='active'`,[customRoleId,organizationId]);
  if(!r.rows[0]) throw new AppError('Active organization role not found',400);
  return r.rows[0].permissions;
}
export async function adminEvent(query: Query, organizationId: string, actor: string, action: string, target: string) {
  await query.query('INSERT INTO organization_admin_events(organization_id,actor_user_id,action,target_id) VALUES($1,$2,$3,$4)',[organizationId,actor,action,target]);
}
