import type { PostgresDatabase } from '../postgres/database.js';
import type { AuthorizationContext } from './requestContextService.js';
import { permissionCatalogue, permissionsForRole, type Permission } from './authorizationPolicy.js';
import { adminEvent, assertGrant, assignmentPermissions, lockAdministration } from '../postgres/organizationAuthorization.js';
import { AppError } from '../utils/AppError.js';
import { disconnectOrganizationSockets } from '../config/socket.js';
import type { MembershipRole } from '../models/Membership.js';
import { PostgresCommercialRepository } from '../postgres/commercialRepository.js';
import { createEntitlementService } from './entitlementService.js';
import { normalizeEmail, requirePhone } from './identityPolicy.js';
import { notifyOrganizationChange } from '../domains/notifications/service.js';

export interface RoleInput { name: string; description: string; permissions: Permission[]; version?: number; status?: 'active'|'archived' }
export interface BranchInput { name: string; code: string; timezone: string; status: 'active'|'inactive'; version?: number }
export interface MemberInput { role: MembershipRole; customRoleId: string|null; status: 'active'|'inactive'|'revoked'; branchIds: string[]; version: number }
export interface ProfileInput { name: string; type: string; businessCategory: string; description: string; contactEmail: string; contactPhone: string; address: string; website: string }

export class OrganizationAdministrationService {
  constructor(private readonly database: PostgresDatabase) {}
  async overview(c: AuthorizationContext) {
    const profile=(await this.database.query(`SELECT o.id,o.name,o.type,o.updated_at,p.business_category,p.description,p.contact_email,p.contact_phone,p.address,p.website,
      (SELECT legal_name FROM organization_billing_profiles WHERE organization_id=o.id) AS legal_name,
      (SELECT count(*)::int FROM memberships WHERE organization_id=o.id AND status='active') AS active_staff,
      (SELECT count(*)::int FROM branches WHERE organization_id=o.id AND status='active') AS active_branches,
      (SELECT count(*)::int FROM organization_roles WHERE organization_id=o.id AND status='active') AS custom_roles,
      (SELECT count(*)::int FROM staff_invitations WHERE organization_id=o.id AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now()) AS pending_invitations
      FROM organizations o LEFT JOIN organization_profiles p ON p.organization_id=o.id WHERE o.id=$1`,[c.organizationId])).rows[0];
    if(profile){
      for(const [key,permission] of [['active_staff','staff.read'],['active_branches','branches.read'],['custom_roles','roles.read'],['pending_invitations','staff.manage'],['legal_name','billing.read']] as const)if(!c.permissions.includes(permission))delete profile[key];
    }
    return profile;
  }
  async saveProfile(c: AuthorizationContext,input: ProfileInput) {
    const contactEmail=input.contactEmail.trim()?normalizeEmail(input.contactEmail):'';
    const contactPhone=input.contactPhone.trim()?requirePhone(input.contactPhone):'';
    await this.database.transaction(async(client)=>{
      await lockAdministration(client,c.userId,c.organizationId,'organization.manage');
      await client.query('UPDATE organizations SET name=$2,type=$3,updated_at=now() WHERE id=$1',[c.organizationId,input.name,input.type]);
      await client.query(`INSERT INTO organization_profiles(organization_id,business_category,description,contact_email,contact_phone,address,website)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id) DO UPDATE SET business_category=excluded.business_category,description=excluded.description,
        contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,address=excluded.address,website=excluded.website,updated_at=now()`,
        [c.organizationId,input.businessCategory,input.description,contactEmail,contactPhone,input.address,input.website]);
      await adminEvent(client,c.organizationId,c.userId,'organization.updated',c.organizationId);
    });
    return this.overview(c);
  }
  async branches(c: AuthorizationContext,search='') {
    return (await this.database.query(`SELECT id,name,code,status,timezone,version,updated_at FROM branches WHERE organization_id=$1 AND (name ILIKE $2 OR code ILIKE $2) ORDER BY code LIMIT 200`,[c.organizationId,`%${search}%`])).rows;
  }
  async saveBranch(c: AuthorizationContext,input: BranchInput,id?: string) {
    const result=await this.database.transaction(async(client)=>{
      await lockAdministration(client,c.userId,c.organizationId,'branches.manage');
      if(!(await client.query('SELECT 1 FROM pg_timezone_names WHERE name=$1',[input.timezone])).rowCount) throw new AppError('Choose a valid IANA timezone',400);
      if(id) {
        const old=(await client.query('SELECT * FROM branches WHERE id=$1 AND organization_id=$2',[id,c.organizationId])).rows[0];
        if(!old) throw new AppError('Branch not found',404);
        if(old.version!==input.version) throw new AppError('Branch changed; reload before saving',409);
        if(old.status==='active' && input.status==='inactive') {
          const usable=await client.query('SELECT 1 FROM branches WHERE organization_id=$1 AND status=\'active\' AND id<>$2 LIMIT 1',[c.organizationId,id]);
          if(!usable.rowCount) throw new AppError('The last active branch cannot be deactivated',409);
          const stranded=await client.query(`SELECT 1 FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id
            WHERE m.organization_id=$1 AND m.status='active' AND a.branch_id=$2 AND NOT EXISTS(
              SELECT 1 FROM membership_branch_assignments other JOIN branches b ON b.id=other.branch_id
              WHERE other.membership_id=m.id AND b.status='active' AND b.id<>$2) LIMIT 1`,[c.organizationId,id]);
          if(stranded.rowCount) throw new AppError('Reassign staff before deactivating their last usable branch',409);
        }
      }
      let row;
      try {
        row=id ? (await client.query(`UPDATE branches SET name=$3,code=$4,timezone=$5,status=$6,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *`,[id,c.organizationId,input.name,input.code,input.timezone,input.status])).rows[0]
          : (await client.query(`INSERT INTO branches(organization_id,name,code,timezone,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,now(),now()) RETURNING *`,[c.organizationId,input.name,input.code,input.timezone,input.status])).rows[0];
      } catch(error) { if((error as {code?:string}).code==='23505') throw new AppError('Branch code already exists in this organization',409); throw error; }
      await adminEvent(client,c.organizationId,c.userId,id?'branch.updated':'branch.created',String(row.id));
      return row;
    });
    disconnectOrganizationSockets(c.organizationId); return result;
  }
  async roles(c: AuthorizationContext) {
    const custom=(await this.database.query(`SELECT r.id,r.name,r.description,r.status,r.version,
      ARRAY(SELECT permission FROM organization_role_permissions WHERE role_id=r.id ORDER BY permission) AS permissions
      FROM organization_roles r WHERE organization_id=$1 ORDER BY name`,[c.organizationId])).rows;
    return {catalogue:permissionCatalogue,system:(['owner','admin','manager','hr','staff'] as const).map(name=>({name,permissions:permissionsForRole(name)})),custom};
  }
  async saveRole(c: AuthorizationContext,input: RoleInput,id?: string) {
    const row=await this.database.transaction(async(client)=>{
      const actor=await lockAdministration(client,c.userId,c.organizationId,'roles.manage');
      assertGrant(actor,input.permissions);
      if(id) {
        const old=(await client.query('SELECT version FROM organization_roles WHERE id=$1 AND organization_id=$2',[id,c.organizationId])).rows[0];
        if(!old) throw new AppError('Role not found',404);
        if(old.version!==input.version) throw new AppError('Role changed; reload before saving',409);
        if(input.status==='archived' && (await client.query(`SELECT 1 FROM memberships WHERE custom_role_id=$1 UNION ALL SELECT 1 FROM staff_invitations WHERE custom_role_id=$1 AND revoked_at IS NULL AND consumed_at IS NULL AND expires_at>now() LIMIT 1`,[id])).rowCount) throw new AppError('Reassign memberships and revoke pending invitations before archiving',409);
        if(actor.custom_role_id===id) throw new AppError('You cannot edit your own effective role',409);
      }
      let result;
      try {
        result=id ? (await client.query('UPDATE organization_roles SET name=$3,description=$4,status=$5,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 RETURNING *',[id,c.organizationId,input.name,input.description,input.status??'active'])).rows[0]
          : (await client.query('INSERT INTO organization_roles(organization_id,name,description) VALUES($1,$2,$3) RETURNING *',[c.organizationId,input.name,input.description])).rows[0];
      } catch(error) { if((error as {code?:string}).code==='23505') throw new AppError('Role name already exists',409); throw error; }
      await client.query('DELETE FROM organization_role_permissions WHERE role_id=$1',[result.id]);
      for(const permission of input.permissions) await client.query('INSERT INTO organization_role_permissions(role_id,permission) VALUES($1,$2)',[result.id,permission]);
      await adminEvent(client,c.organizationId,c.userId,!id?'role.created':input.status==='archived'?'role.archived':'role.updated',String(result.id));
      if(id&&input.status!=='archived')await notifyOrganizationChange(client,c.organizationId,null,id,'role.updated',Number(result.version));
      return result;
    });
    disconnectOrganizationSockets(c.organizationId); return row;
  }
  async staff(c: AuthorizationContext,search='') {
    return (await this.database.query(`SELECT u.id,u.name,u.phone,m.id AS "membershipId",m.role,m.status,m.version,m.updated_at,m.custom_role_id AS "customRoleId",r.name AS "roleName",e.display_email AS email,
      ARRAY(SELECT branch_id FROM membership_branch_assignments WHERE membership_id=m.id ORDER BY branch_id) AS "branchIds",
      ARRAY(SELECT b.name FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id WHERE a.membership_id=m.id ORDER BY b.code) AS "branchNames"
      FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN organization_roles r ON r.id=m.custom_role_id
      LEFT JOIN user_email_identities e ON e.user_id=u.id AND e.state='verified'
      WHERE m.organization_id=$1 AND (u.name ILIKE $2 OR u.phone ILIKE $2) ORDER BY u.name LIMIT 200`,[c.organizationId,`%${search}%`])).rows;
  }
  async saveMember(c: AuthorizationContext,id: string,input: MemberInput,notifyRealtime=true) {
    await this.database.transaction(async(client)=>{
      const actor=await lockAdministration(client,c.userId,c.organizationId,'staff.manage');
      const old=(await client.query('SELECT * FROM memberships WHERE id=$1 AND organization_id=$2',[id,c.organizationId])).rows[0];
      if(!old) throw new AppError('Membership not found',404);
      if((old.role==='owner' || old.user_id===c.userId) && (input.role!==old.role || input.customRoleId!==old.custom_role_id || input.status!==old.status)) throw new AppError('Owner and self authority changes require a separate controlled workflow',409);
      if(old.role!=='owner' && input.role==='owner') throw new AppError('Owner transfer requires a separate controlled workflow',409);
      if(old.version!==input.version) throw new AppError('Membership changed; reload before saving',409);
      // An actor cannot demote/revoke someone whose authority exceeds their own.
      assertGrant(actor,await assignmentPermissions(client,c.organizationId,old.role,old.custom_role_id));
      assertGrant(actor,await assignmentPermissions(client,c.organizationId,input.role,input.customRoleId));
      if(!input.branchIds.length) throw new AppError('Assign at least one usable branch',400);
      const branches=await client.query("SELECT id FROM branches WHERE organization_id=$1 AND id=ANY($2::uuid[]) AND status='active'",[c.organizationId,input.branchIds]);
      if(branches.rowCount!==input.branchIds.length) throw new AppError('Select active branches from this organization',400);
      await client.query('UPDATE memberships SET role=$3,custom_role_id=$4,status=$5,version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2',[id,c.organizationId,input.role,input.customRoleId,input.status]);
      // Preserve unchanged assignments referenced by immutable operational history.
      try {await client.query('DELETE FROM membership_branch_assignments WHERE membership_id=$1 AND NOT(branch_id=ANY($2::uuid[]))',[id,input.branchIds]);}
      catch(error){if((error as {code?:string}).code==='23503')throw new AppError('This assignment is referenced by operational history and cannot be removed',409);throw error;}
      for(const branch of input.branchIds) await client.query('INSERT INTO membership_branch_assignments(membership_id,branch_id,organization_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,branch,c.organizationId]);
      await adminEvent(client,c.organizationId,c.userId,'membership.updated',id);
      if(input.status==='active')await notifyOrganizationChange(client,c.organizationId,id,null,'membership.updated',input.version+1);
    });
    // Do not revoke global sessions: other organizations remain valid.
    if(notifyRealtime)disconnectOrganizationSockets(c.organizationId);
  }
  async audit(c: AuthorizationContext,filter: {from?:string|undefined;to?:string|undefined;actor?:string|undefined;action?:string|undefined;category?:string|undefined;page:number}) {
    return (await this.database.query(`WITH events AS (
      SELECT id,actor_user_id,action,occurred_at FROM organization_admin_events WHERE organization_id=$1
      UNION ALL SELECT id,actor_user_id,action,occurred_at FROM crm_admin_events WHERE organization_id=$1
      UNION ALL SELECT id,actor_user_id,action,occurred_at FROM field_admin_events WHERE organization_id=$1
      UNION ALL SELECT id,actor_user_id,action,occurred_at FROM report_export_events WHERE organization_id=$1
      UNION ALL SELECT id,actor_user_id,action,occurred_at FROM audit_events WHERE organization_id=$1)
      SELECT e.id,e.action,e.occurred_at,COALESCE(u.name,'Actor unavailable') AS actor
      FROM events e LEFT JOIN users u ON u.id=e.actor_user_id
      WHERE ($2::timestamptz IS NULL OR occurred_at>=$2) AND ($3::timestamptz IS NULL OR occurred_at<=$3)
        AND ($4::uuid IS NULL OR actor_user_id=$4) AND ($5::text IS NULL OR action=$5)
        AND ($6::text IS NULL OR split_part(action,'.',1)=$6)
      ORDER BY occurred_at DESC,e.id LIMIT 50 OFFSET $7`,[c.organizationId,filter.from??null,filter.to??null,filter.actor??null,filter.action??null,filter.category??null,(filter.page-1)*50])).rows;
  }
  async auditActors(c: AuthorizationContext) {
    return (await this.database.query(`SELECT DISTINCT u.id,u.name FROM users u JOIN (
      SELECT actor_user_id FROM organization_admin_events WHERE organization_id=$1
      UNION SELECT actor_user_id FROM crm_admin_events WHERE organization_id=$1
      UNION SELECT actor_user_id FROM field_admin_events WHERE organization_id=$1
      UNION SELECT actor_user_id FROM report_export_events WHERE organization_id=$1
      UNION SELECT actor_user_id FROM audit_events WHERE organization_id=$1
    ) a ON a.actor_user_id=u.id ORDER BY u.name,u.id LIMIT 200`,[c.organizationId])).rows;
  }
  async directory(search:string,page:number) {
    const rows=(await this.database.query(`SELECT o.id,o.name,o.type,s.status AS subscription_status,s.current_period_ends_at,p.name AS plan,
      (SELECT count(*)::int FROM memberships WHERE organization_id=o.id AND status='active') AS active_staff,
      (SELECT count(*)::int FROM branches WHERE organization_id=o.id AND status='active') AS active_branches
      FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id LEFT JOIN plans p ON p.id=s.plan_id
      WHERE o.name ILIKE $1 ORDER BY o.name,o.id LIMIT 50 OFFSET $2`,[`%${search}%`,(page-1)*50])).rows;
    const commercial=createEntitlementService(new PostgresCommercialRepository(this.database));
    return Promise.all(rows.map(async row=>({...row,modules:(await commercial.getEffective(String(row.id))).modules.filter(m=>m.enabled).map(m=>m.key)})));
  }
  async platformOverview(){
    return (await this.database.query(`SELECT
      (SELECT count(*)::text FROM organizations) AS organizations,
      (SELECT count(*)::text FROM subscriptions WHERE status IN ('active','trialing') AND starts_at<=now() AND (current_period_ends_at IS NULL OR current_period_ends_at>now())) AS active_subscriptions,
      (SELECT count(*)::text FROM commercial_access_requests WHERE status='pending') AS pending_requests,
      (SELECT count(*)::text FROM subscriptions WHERE status IN ('active','trialing') AND current_period_ends_at<=now()+interval '30 days') AS renewals_attention,
      (SELECT count(*)::text FROM public_offer_pricing p LEFT JOIN plans plan ON plan.id=p.plan_id LEFT JOIN add_ons addon ON addon.id=p.add_on_id WHERE p.published AND (plan.status='active' AND plan.available OR addon.status='active' AND addon.available)) AS published_offers`)).rows[0];
  }
}
