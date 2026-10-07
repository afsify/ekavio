import { z } from 'zod';
import { customValuesSchema } from '../dynamicFields/policy.js';
import { createCustomerSchema } from '../../schemas/operationalSchemas.js';
export const leadStatuses=['active','converted','lost','archived'] as const;
export const followupTypes=['call','meeting','task','note','other'] as const;
export const followupStatuses=['pending','completed','cancelled'] as const;
const text=(n:number)=>z.string().trim().max(n).nullable().optional();
export const stageSchema=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(500).default(''),position:z.number().int().min(0).max(49),status:z.enum(['active','archived']).default('active')}).strict();
export const stageUpdateSchema=stageSchema.extend({expectedVersion:z.number().int().positive()});
export const leadSchema=z.object({name:z.string().trim().min(1).max(200),company:text(200),phone:text(40),email:z.email().max(254).nullable().optional(),source:text(100),pipelineStageId:z.uuid(),assignedMembershipId:z.uuid().nullable().optional(),notes:text(2000),customFields:customValuesSchema.optional()}).strict();
export const leadUpdateSchema=leadSchema.partial().extend({expectedVersion:z.number().int().positive()}).strict();
export const leadStateSchema=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['lost','archived','active']),reason:z.string().trim().max(1000).optional()}).strict();
export const noteSchema=z.object({expectedVersion:z.number().int().positive(),note:z.string().trim().min(1).max(2000)}).strict();
export const conversionSchema=z.discriminatedUnion('mode',[
 z.object({mode:z.literal('new'),expectedVersion:z.number().int().positive(),customer:createCustomerSchema}).strict(),
 z.object({mode:z.literal('existing'),expectedVersion:z.number().int().positive(),customerId:z.uuid()}).strict(),
]);
export const followupSchema=z.object({leadId:z.uuid(),assignedMembershipId:z.uuid().nullable().optional(),type:z.enum(followupTypes),subject:z.string().trim().min(1).max(200),note:text(2000),localDue:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/)}).strict();
export const followupUpdateSchema=followupSchema.omit({leadId:true}).partial().extend({expectedVersion:z.number().int().positive()}).strict();
export const followupStateSchema=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['completed','cancelled'])}).strict();
export const leadFilterSchema=z.object({search:z.string().trim().max(200).default(''),status:z.enum(leadStatuses).optional(),stageId:z.uuid().optional(),assignee:z.union([z.uuid(),z.literal('unassigned')]).optional(),source:z.string().trim().max(100).optional(),attention:z.enum(['today','overdue','upcoming']).optional(),from:z.iso.date().optional(),to:z.iso.date().optional(),field:z.string().max(64).optional(),value:z.string().max(1000).optional(),operator:z.enum(['eq','gte','lte']).default('eq'),sort:z.enum(['newest','oldest','name']).default('newest'),page:z.coerce.number().int().min(1).max(200).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const followupFilterSchema=z.object({leadId:z.uuid().optional(),view:z.enum(['today','overdue','upcoming','completed','all']).default('all'),page:z.coerce.number().int().min(1).max(200).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)}).strict();
export const recommendedStages=['New','Contacted','Qualified','Discussion','Decision'] as const;
