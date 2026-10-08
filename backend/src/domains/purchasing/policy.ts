import { z } from 'zod';
import { parsePositiveQuantity,parseQuantityToMilli } from '../inventory/quantity.js';
import { parseInrPriceToMinor } from '../inventory/money.js';
import { POSTGRES_BIGINT_MAX } from '../customerDues/money.js';
import { AppError } from '../../utils/AppError.js';
const optionalText=(max:number)=>z.string().trim().max(max).nullable().optional();
export const purchasingDate=z.iso.date().refine(v=>Number(v.slice(0,4))>=1900&&Number(v.slice(0,4))<9999,'Unsupported date');
export const supplierSchema=z.object({name:z.string().trim().min(1).max(200),contactName:optionalText(200),phone:optionalText(40),email:z.email().max(254).nullable().optional(),gstin:z.string().trim().toUpperCase().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).nullable().optional(),addressLine1:optionalText(300),addressLine2:optionalText(300),city:optionalText(100),state:optionalText(100),country:optionalText(100),postalCode:optionalText(20),notes:optionalText(2000),status:z.enum(['active','archived']).default('active')}).strict();
export const supplierUpdateSchema=supplierSchema.extend({expectedVersion:z.number().int().positive()});
const decimal=(parse:(s:string)=>unknown)=>z.string().trim().min(1).max(32).superRefine((v,c)=>{try{parse(v);}catch{c.addIssue({code:'custom',message:'Invalid exact decimal or supported range'});}});
export const orderLineSchema=z.object({itemId:z.uuid(),quantity:decimal(parsePositiveQuantity),unitPrice:decimal(parseInrPriceToMinor)}).strict();
export const orderStatuses=['draft','ordered','partially_received','received','cancelled'] as const;
export const orderSchema=z.object({supplierId:z.uuid(),orderDate:purchasingDate,expectedDeliveryDate:purchasingDate.nullable().optional(),notes:optionalText(2000),currency:z.literal('INR').default('INR'),lines:z.array(orderLineSchema).min(1).max(50)}).strict().refine(v=>new Set(v.lines.map(l=>l.itemId)).size===v.lines.length,'One line per item').refine(v=>!v.expectedDeliveryDate||v.expectedDeliveryDate>=v.orderDate,'Delivery cannot precede order date');
export const orderUpdateSchema=orderSchema.safeExtend({expectedVersion:z.number().int().positive()});
export const transitionSchema=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['ordered','cancelled'])}).strict();
export const receiptSchema=z.object({expectedVersion:z.number().int().positive(),idempotencyKey:z.string().trim().min(1).max(128),notes:optionalText(2000),lines:z.array(z.object({orderLineId:z.uuid(),quantity:decimal(parsePositiveQuantity)}).strict()).min(1).max(50)}).strict().refine(v=>new Set(v.lines.map(l=>l.orderLineId)).size===v.lines.length,'Duplicate receipt line');
export const pageSchema=z.object({search:z.string().trim().max(200).default(''),page:z.coerce.number().int().min(1).max(200).default(1),limit:z.coerce.number().int().min(1).max(100).default(20),status:z.string().max(32).optional(),supplierId:z.uuid().optional(),from:purchasingDate.optional(),to:purchasingDate.optional(),sort:z.enum(['newest','oldest','name']).default('newest')}).strict();
// Positive half-paise ties round upward ONCE per exact line; totals sum rounded lines.
export function lineAmountMinor(quantity:string,unitPrice:string):bigint {
 const result=(parseQuantityToMilli(quantity)*parseInrPriceToMinor(unitPrice)+500n)/1000n;
 if(result>POSTGRES_BIGINT_MAX)throw new AppError('Ordered line value exceeds supported INR range',400);
 return result;
}
export function orderTotalMinor(lines:readonly {quantity:string;unitPrice:string}[]):bigint {
 const sum=lines.reduce((n,l)=>n+lineAmountMinor(l.quantity,l.unitPrice),0n);
 if(sum>POSTGRES_BIGINT_MAX)throw new AppError('Ordered value exceeds supported INR range',400);
 return sum;
}
