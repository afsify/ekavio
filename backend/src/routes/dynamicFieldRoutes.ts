import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { requireEntitlement } from '../middlewares/tenantMiddleware.js';
import { dynamicFieldsService as service } from '../services/dynamicFieldsService.js';
import { entityTypes, fieldTypes, customValuesSchema, type FieldEntity } from '../domains/dynamicFields/policy.js';
import { runtimePostgresDatabase as database } from '../persistence/runtimePersistence.js';
import { AppError } from '../utils/AppError.js';
import { mapOperationalError } from '../services/operationalRuntimeService.js';
import { validateRequest } from '../middlewares/validateRequest.js';

const router=Router(); router.use(authenticate);
const entity=(r:AuthenticatedRequest)=>{const v=z.enum(entityTypes).safeParse(r.params.entity);if(!v.success)throw new AppError('Unsupported entity',400);return v.data;};
const uuid=(value:unknown)=>{const v=z.uuid().safeParse(value);if(!v.success)throw new AppError('Invalid identifier',400);return v.data;};
const read:Record<FieldEntity,'customers.read'|'services.read'|'queue.read'|'inventory.read'|'staff.read'>={customer:'customers.read',service:'services.read',appointment:'queue.read',inventory_item:'inventory.read',membership:'staff.read'};
const table:Record<FieldEntity,string>={customer:'customers',service:'services',appointment:'appointments',inventory_item:'inventory_items',membership:'memberships'};
const permissionFor=(fixedEntity?:FieldEntity):RequestHandler=>(r,res,next)=>{try{
 const e=fixedEntity??entity(r as AuthenticatedRequest),c=(r as AuthenticatedRequest).auth!;
 const schema=r.path.endsWith('/schema');
 if(!(schema&&c.permissions.includes('fields.read'))&&!c.permissions.includes(read[e])) throw new AppError('Permission denied',403);
 if(!(schema&&c.permissions.includes('fields.read'))&&(e==='appointment'||e==='inventory_item')) return requireEntitlement(e==='appointment'?'queue':'inventory')(r,res,next);
 next();
}catch(error){next(error);}};
const permission=permissionFor();
const config:RequestHandler=(r,_res,next)=>{if(!(r as AuthenticatedRequest).auth!.permissions.includes('fields.manage')){next(new AppError('Permission denied',403));return;}next();};
const handle=(operation:(r:AuthenticatedRequest)=>Promise<unknown>):RequestHandler=>async(r,res,next)=>{try{res.setHeader('Cache-Control','no-store');res.json({data:await operation(r)});}catch(error){next(error instanceof z.ZodError?new AppError('Invalid field configuration',400):mapOperationalError(error));}};
const key=z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const option=z.object({id:z.uuid().optional(),key,label:z.string().trim().min(1).max(100),status:z.enum(['active','archived'])}).strict();
const definition=z.object({key,label:z.string().trim().min(1).max(100),help:z.string().max(500),fieldType:z.enum(fieldTypes),status:z.enum(['active','archived']),required:z.boolean(),searchable:z.boolean(),filterable:z.boolean(),reportable:z.boolean(),defaultValue:z.union([z.string().max(10000),z.boolean(),z.array(z.uuid()).max(50),z.null()]),version:z.number().int().positive().optional(),options:z.array(option).max(100).refine(v=>new Set(v.map(o=>o.key)).size===v.length)}).strict();
const layout=z.object({version:z.number().int().min(0),sections:z.array(z.object({id:z.uuid(),title:z.string().trim().min(1).max(100),status:z.enum(['active','archived']).default('active'),fields:z.array(z.object({key:z.string().max(64),visible:z.boolean()}).strict()).max(100)}).strict()).min(1).max(20)}).strict();
router.get('/:entity/schema',permission,handle(r=>service.schema(r.auth!.organizationId,entity(r))));
router.post('/:entity/definitions',config,validateRequest(definition),handle(r=>service.saveDefinition(r.auth!,entity(r),r.body)));
router.put('/:entity/definitions/:id',config,validateRequest(definition),handle(r=>service.saveDefinition(r.auth!,entity(r),r.body,uuid(r.params.id))));
router.put('/:entity/layout',config,validateRequest(layout),handle(r=>service.saveLayout(r.auth!,entity(r),r.body)));
router.post('/:entity/layout/reset',config,validateRequest(layout),handle(r=>service.saveLayout(r.auth!,entity(r),r.body,true)));
router.get('/:entity/values/:id',permission,handle(async r=>{
 const e=entity(r),id=uuid(r.params.id),c=r.auth!;
 const row=await database.query(`SELECT id FROM ${table[e]} WHERE id=$1 AND organization_id=$2${e==='appointment'?' AND branch_id=$3':''}`,[id,c.organizationId,...(e==='appointment'?[c.branchId??null]:[])]);
 if(!row.rows[0])throw new AppError('Record not found',404);
 return service.values(c.organizationId,e,id);
}));
// Metadata only: no scheduling/status extension. Uses the appointment's existing
// optimistic version and active branch boundary.
router.patch('/appointment/values/:id',permissionFor('appointment'),validateRequest(z.object({expectedVersion:z.number().int().positive(),customFields:customValuesSchema}).strict()),handle(r=>service.mutate(r.auth!,'appointment',r.body.customFields,false,async()=>{
 const result=await database.query(`UPDATE appointments SET version=version+1,updated_at=now() WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND version=$4 RETURNING id`,[uuid(r.params.id),r.auth!.organizationId,r.auth!.branchId??null,r.body.expectedVersion]);
 if(!result.rows[0])throw new AppError('Appointment missing or version changed',409);
 return {id:String(result.rows[0].id)};
})));
export default router;
