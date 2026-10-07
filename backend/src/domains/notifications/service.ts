import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import { AppError } from '../../utils/AppError.js';
import { z } from 'zod';
import { membershipAuthority } from '../../postgres/organizationAuthorization.js';
export const notificationActions={settings:'/settings',crm:'/crm'} as const;
export const preferenceSchema=z.object({organizationChanges:z.boolean(),crmAssignments:z.boolean().optional()}).strict();
export const notificationFilter=z.object({page:z.coerce.number().int().min(1).max(200).default(1),unread:z.enum(['true','false']).default('false'),category:z.enum(['organization','crm']).optional()}).strict();
// Assignment attention, not a due scheduler. No contact/note/link IDs in payloads.
export async function notifyCrmAssignment(client:PoolClient,org:string,branch:string,membership:string,event:'lead.assigned'|'followup.assigned',target:string,version:number){
 const recipient=(await client.query(`SELECT m.user_id FROM memberships m JOIN membership_branch_assignments a ON a.membership_id=m.id AND a.organization_id=m.organization_id JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id LEFT JOIN notification_preferences p ON p.organization_id=m.organization_id AND p.user_id=m.user_id WHERE m.id=$1 AND m.organization_id=$2 AND a.branch_id=$3 AND m.status='active' AND b.status='active' AND COALESCE(p.crm_assignments,true)`,[membership,org,branch])).rows[0];
 if(!recipient)return;
 if(!(await membershipAuthority(client,recipient.user_id,org)).effective.includes('crm.read'))return;
 await client.query(`INSERT INTO user_notifications(organization_id,membership_id,user_id,branch_id,category,event_key,title,message,action_key,dedupe_key)
 VALUES($1,$2,$3,$4,'crm',$5,'CRM assignment','Review your assigned work in CRM & Follow-ups.','crm',$6) ON CONFLICT(organization_id,user_id,dedupe_key) DO NOTHING`,[org,membership,recipient.user_id,branch,event,event+':'+target+':'+version]);
}
// Server-only closed generic templates. No business/user input becomes a message/link.
export async function notifyOrganizationChange(client:PoolClient,org:string,membership:string|null,role:string|null,event:'membership.updated'|'role.updated',version:number){
 const title=event==='role.updated'?'Your role permissions changed':'Your workspace access changed';
 await client.query(`INSERT INTO user_notifications(organization_id,membership_id,user_id,category,event_key,title,message,action_key,dedupe_key)
  SELECT m.organization_id,m.id,m.user_id,'organization',$4,$5,'Review your current workspace access in Settings.','settings',$4||':'||COALESCE($2::text,$3::text)||':'||$6::text
  FROM memberships m LEFT JOIN notification_preferences p ON p.organization_id=m.organization_id AND p.user_id=m.user_id
  WHERE m.organization_id=$1 AND m.status='active' AND ($2::uuid IS NULL OR m.id=$2::uuid) AND ($3::uuid IS NULL OR m.custom_role_id=$3::uuid)
   AND COALESCE(p.organization_changes,true) AND EXISTS(SELECT 1 FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id WHERE a.membership_id=m.id AND b.status='active')
  ON CONFLICT(organization_id,user_id,dedupe_key) DO NOTHING`,[org,membership,role,event,title,version]);
}
export class NotificationService {
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>=async()=>new Set()){}
 async list(c:AuthorizationContext,input:unknown){
  const parsed=notificationFilter.safeParse(input);if(!parsed.success)throw new AppError('Invalid notification filters',400);const f=parsed.data;
  const crm=c.permissions.includes('crm.read')&&(await this.enabled(c.organizationId)).has('crm');
  const scope=[c.organizationId,c.userId,c.membershipId,crm,f.category??null];
  return this.db.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   const count=(await client.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE read_at IS NULL)::int AS unread FROM user_notifications WHERE organization_id=$1 AND user_id=$2 AND membership_id=$3 AND ($4::boolean OR category<>\'crm\') AND ($5::text IS NULL OR category=$5)',scope)).rows[0]!;
   const rows=(await client.query(`SELECT id,category,event_key AS event,title,message,action_key AS action,created_at AS "createdAt",read_at AS "readAt" FROM user_notifications WHERE organization_id=$1 AND user_id=$2 AND membership_id=$3 AND ($4::boolean OR category<>'crm') AND ($5::text IS NULL OR category=$5) AND ($6::boolean=false OR read_at IS NULL) ORDER BY created_at DESC,id LIMIT 25 OFFSET $7`,[...scope,f.unread==='true',(f.page-1)*25])).rows;
   return {rows,unread:count.unread,total:count.total,page:f.page,limit:25};
  });
 }
 async read(c:AuthorizationContext,id:string,read:boolean){
  if(!z.uuid().safeParse(id).success)throw new AppError('Invalid notification',400);
  const changed=await this.db.query(`UPDATE user_notifications SET read_at=CASE WHEN $5 THEN COALESCE(read_at,now()) ELSE NULL END WHERE id=$1 AND organization_id=$2 AND user_id=$3 AND membership_id=$4 RETURNING id`,[id,c.organizationId,c.userId,c.membershipId,read]);
  if(!changed.rowCount)throw new AppError('Notification not found',404);
 }
 async readAll(c:AuthorizationContext){await this.db.query('UPDATE user_notifications SET read_at=now() WHERE organization_id=$1 AND user_id=$2 AND membership_id=$3 AND read_at IS NULL',[c.organizationId,c.userId,c.membershipId]);}
 async preferences(c:AuthorizationContext){const row=(await this.db.query('SELECT organization_changes,crm_assignments FROM notification_preferences WHERE organization_id=$1 AND user_id=$2',[c.organizationId,c.userId])).rows[0];return {organizationChanges:row?.organization_changes??true,crmAssignments:row?.crm_assignments??true};}
 async savePreferences(c:AuthorizationContext,input:unknown){const v=preferenceSchema.safeParse(input);if(!v.success)throw new AppError('Invalid notification preferences',400);await this.db.query('INSERT INTO notification_preferences(organization_id,user_id,organization_changes,crm_assignments) VALUES($1,$2,$3,COALESCE($4,true)) ON CONFLICT(organization_id,user_id) DO UPDATE SET organization_changes=excluded.organization_changes,crm_assignments=COALESCE($4,notification_preferences.crm_assignments),updated_at=now()',[c.organizationId,c.userId,v.data.organizationChanges,v.data.crmAssignments??null]);return v.data;}
 // Explicit maintenance only; unread is retained, audit is never touched. Bounded batches.
 async pruneRead(){return (await this.db.query("DELETE FROM user_notifications WHERE id IN (SELECT id FROM user_notifications WHERE read_at IS NOT NULL AND read_at<now()-interval '90 days' ORDER BY read_at LIMIT 1000) RETURNING id")).rowCount;}
}
