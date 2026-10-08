import { z } from 'zod';
import { branchLocalDateTimeToInstant,nextBusinessDate } from '../appointments/timezone.js';
import { AppError } from '../../utils/AppError.js';
export const hrDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>v>='1900-01-01'&&v<='9998-12-31'&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Invalid calendar date');
const text=(n:number)=>z.string().trim().max(n);
const name=text(100).min(1),version=z.number().int().positive(),status=z.enum(['active','archived']).default('active');
export const commandKey=z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
export const rangeSchema=z.object({from:hrDate,to:hrDate,page:z.coerce.number().int().min(1).max(200).default(1),limit:z.coerce.number().int().min(1).max(100).default(25),search:text(200).default(''),status:z.enum(['pending','approved','rejected','cancelled','draft','published']).optional()}).strict().refine(v=>v.to>=v.from&&(Date.parse(v.to)-Date.parse(v.from))/86400000<366,'Range must be ordered and at most 366 days');
export const typeSchema=z.object({name,description:text(500).default(''),status,requiresReason:z.boolean().default(false),allowPast:z.boolean().default(false),minimumNoticeDays:z.number().int().min(0).max(365).default(0),countNonWorking:z.boolean().default(false),displayOrder:z.number().int().min(0).max(100).default(0),expectedVersion:version.optional()}).strict();
export const calendarSchema=z.object({name,workingDays:z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v=>new Set(v).size===v.length,'Duplicate weekday'),expectedVersion:version.optional()}).strict();
export const holidaySchema=z.object({day:hrDate,name,nonWorking:z.boolean().default(true),status,expectedVersion:version.optional()}).strict();
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const templateSchema=z.object({name,startTime:time,endTime:time,overnight:z.boolean().default(false),breakMinutes:z.number().int().min(0).max(720).default(0),status,expectedVersion:version.optional()}).strict().superRefine((v,c)=>{
 const minute=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
 const span=minute(v.endTime)-minute(v.startTime)+(v.overnight?1440:0);
 if((v.overnight?v.endTime>=v.startTime:v.endTime<=v.startTime)||span<=v.breakMinutes)c.addIssue({code:'custom',message:'Use an explicit valid overnight interval and shorter break'});
});
export const leaveSchema=z.object({leaveTypeId:z.uuid(),startDate:hrDate,endDate:hrDate,reason:text(2000).default(''),idempotencyKey:commandKey}).strict().refine(v=>v.endDate>=v.startDate&&(Date.parse(v.endDate)-Date.parse(v.startDate))/86400000<90,'Leave is at most 90 calendar days');
export const reviewSchema=z.object({status:z.enum(['approved','rejected','cancelled']),note:text(500).default(''),expectedVersion:version,idempotencyKey:commandKey}).strict().refine(v=>v.status==='approved'||v.note.length>0,'Rejection/cancellation requires a reason');
export const cancelSchema=z.object({expectedVersion:version,idempotencyKey:commandKey}).strict();
export const shiftSchema=z.object({membershipId:z.uuid(),templateId:z.uuid(),from:hrDate,to:hrDate,workingDaysOnly:z.boolean().default(true),idempotencyKey:commandKey}).strict().refine(v=>v.to>=v.from&&(Date.parse(v.to)-Date.parse(v.from))/86400000<31,'Generate at most 31 days');
export const shiftEditSchema=z.object({templateId:z.uuid(),day:hrDate,expectedVersion:version}).strict();
export const shiftStatusSchema=z.object({status:z.enum(['published','cancelled']),expectedVersion:version,idempotencyKey:commandKey}).strict();
export function calendarDates(from:string,to:string):string[]{const dates:string[]=[];for(let d=from;d<=to;d=nextBusinessDate(d)){dates.push(d);if(dates.length>366)throw new AppError('Calendar range exceeds limit',400);}return dates;}
export function isWorking(date:string,days:number[],overrides:{day:string;non_working:boolean;status:string}[]):boolean{const override=overrides.find(d=>d.day===date&&d.status==='active');return override?!override.non_working:days.includes(new Date(date+'T00:00:00Z').getUTCDay());}
export function shiftInstants(day:string,start:string,end:string,overnight:boolean,timezone:string){
 try{return {starts:branchLocalDateTimeToInstant(day+'T'+start.slice(0,5),timezone),ends:branchLocalDateTimeToInstant((overnight?nextBusinessDate(day):day)+'T'+end.slice(0,5),timezone)};}catch{throw new AppError('Shift time is invalid, ambiguous or nonexistent in the branch timezone',400);}
}
