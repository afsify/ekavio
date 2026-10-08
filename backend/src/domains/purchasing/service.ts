import { createHash,randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../../postgres/database.js';
import { lockAdministration,membershipAuthority } from '../../postgres/organizationAuthorization.js';
import type { AuthorizationContext } from '../../services/requestContextService.js';
import type { Permission } from '../../services/authorizationPolicy.js';
import { requirePhone,normalizeEmail } from '../../services/identityPolicy.js';
import { AppError } from '../../utils/AppError.js';
import { PostgresInventoryRepository } from '../inventory/repository.js';
import { parsePositiveQuantity } from '../inventory/quantity.js';
import { parseInrPriceToMinor } from '../inventory/money.js';
import { orderSchema,orderUpdateSchema,supplierSchema,supplierUpdateSchema,transitionSchema,receiptSchema,pageSchema,orderTotalMinor,lineAmountMinor,orderStatuses } from './policy.js';
import { z } from 'zod';
const scope=(c:AuthorizationContext)=>[c.organizationId,c.branchId];
const reference=(kind:'PO'|'GR')=>'EV-'+kind+'-'+randomUUID().replaceAll('-','').toUpperCase();
const fingerprint=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const orderSelect=`SELECT o.*,o.order_date::text,o.expected_delivery_date::text,s.name AS supplier_name,b.name AS branch_name,u.name AS actor_name,(SELECT sum(line_amount_minor)::text FROM purchase_order_lines WHERE purchase_order_id=o.id) AS total_minor FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id AND s.organization_id=o.organization_id JOIN branches b ON b.id=o.branch_id AND b.organization_id=o.organization_id JOIN users u ON u.id=o.created_by`;
const linesSelect=`SELECT l.*,l.unit_price_minor::text,l.line_amount_minor::text,COALESCE(r.received,0)::numeric(18,3)::text AS received_quantity,(l.ordered_quantity-COALESCE(r.received,0))::numeric(18,3)::text AS remaining_quantity FROM purchase_order_lines l LEFT JOIN LATERAL (SELECT sum(quantity) AS received FROM purchase_receipt_lines WHERE purchase_order_line_id=l.id) r ON true`;
export class PurchasingService {
 private readonly inventory:PostgresInventoryRepository;
 constructor(private readonly db:PostgresDatabase,private readonly enabled:(org:string)=>Promise<ReadonlySet<string>>){this.inventory=new PostgresInventoryRepository(db);}
 private async access(c:AuthorizationContext,p:Permission,client?:PoolClient,inventory?:'read'|'manage'){
  if(!c.branchId)throw new AppError('Select an authorized branch',400);
  const actor=client?await lockAdministration(client,c.userId,c.organizationId,p):await membershipAuthority(this.db,c.userId,c.organizationId);
  if(actor.id!==c.membershipId||!actor.effective.includes(p))throw new AppError('Purchasing permission denied',403);
  if(!(await this.db.query("SELECT 1 FROM membership_branch_assignments a JOIN branches b ON b.id=a.branch_id AND b.organization_id=a.organization_id WHERE a.membership_id=$1 AND a.organization_id=$2 AND a.branch_id=$3 AND b.status='active'",[c.membershipId,...scope(c)])).rowCount)throw new AppError('Access denied to this branch',403);
  const modules=await this.enabled(c.organizationId);
  if(!modules.has('purchasing'))throw new AppError('Purchasing entitlement required',403);
  if(inventory&&(!modules.has('inventory')||!actor.effective.includes(`inventory.${inventory}`)))throw new AppError(`Inventory ${inventory} access is independently required`,403);
 }
 private write<T>(c:AuthorizationContext,operation:(client:PoolClient)=>Promise<T>,inventory?:'read'|'manage'){
  return this.db.atomic(async client=>{await client.query("SET LOCAL statement_timeout='10s'");await this.access(c,'purchasing.manage',client,inventory);return operation(client);});
 }
 private async event(client:PoolClient,c:AuthorizationContext,supplier:string,action:string,order?:string,receipt?:string){await client.query('INSERT INTO purchasing_activity_events(organization_id,branch_id,supplier_id,purchase_order_id,purchase_receipt_id,actor_user_id,action) VALUES($1,$2,$3,$4,$5,$6,$7)',[c.organizationId,order?c.branchId:null,supplier,order??null,receipt??null,c.userId,action]);}
 private async order(client:PoolClient,c:AuthorizationContext,id:string,version?:number){
  const row=(await client.query('SELECT * FROM purchase_orders WHERE organization_id=$1 AND branch_id=$2 AND id=$3 FOR UPDATE',[...scope(c),id])).rows[0];
  if(!row)throw new AppError('Purchase order not found',404);
  if(version!==undefined&&row.version!==version)throw new AppError('Purchase order changed; reload before saving',409);
  return row;
 }
 private async supplier(client:PoolClient,c:AuthorizationContext,id:string){if(!(await client.query("SELECT 1 FROM suppliers WHERE id=$1 AND organization_id=$2 AND status='active' FOR SHARE",[id,c.organizationId])).rowCount)throw new AppError('Select an active supplier in this organization',400);}
 private filters(input:unknown,statuses:readonly string[]){const v=pageSchema.parse(input);if(v.status&&!statuses.includes(v.status))throw new AppError('Invalid status filter',400);if(v.from&&v.to&&(v.from>v.to||(Date.parse(v.to)-Date.parse(v.from))/86400000>=366))throw new AppError('Use an ordered range of at most 366 days',400);return v;}
 async suppliers(c:AuthorizationContext,input:unknown){
  await this.access(c,'purchasing.read');const v=this.filters(input,['active','archived']);
  const args=[c.organizationId,v.search,v.status??null],where="organization_id=$1 AND ($2='' OR concat_ws(' ',name,contact_name,phone,email) ILIKE '%'||$2||'%') AND ($3::text IS NULL OR status=$3)";
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ,READ ONLY');const total=Number((await client.query(`SELECT count(*) AS n FROM suppliers WHERE ${where}`,args)).rows[0]!.n);return {data:(await client.query(`SELECT * FROM suppliers WHERE ${where} ORDER BY lower(name),id LIMIT $4 OFFSET $5`,[...args,v.limit,(v.page-1)*v.limit])).rows,total,page:v.page,limit:v.limit};});
 }
 async saveSupplier(c:AuthorizationContext,input:unknown,id?:string){const v=id?supplierUpdateSchema.parse(input):supplierSchema.parse(input);
  const values=[v.name,v.contactName||null,v.phone?requirePhone(v.phone):null,v.email?normalizeEmail(v.email):null,v.gstin??null,v.addressLine1||null,v.addressLine2||null,v.city||null,v.state||null,v.country||null,v.postalCode||null,v.notes||null,v.status];
  return this.write(c,async client=>{
   const row=id?(await client.query('UPDATE suppliers SET name=$3,contact_name=$4,phone=$5,email=$6,gstin=$7,address_line_1=$8,address_line_2=$9,city=$10,state=$11,country=$12,postal_code=$13,notes=$14,status=$15,version=version+1,updated_at=now() WHERE organization_id=$1 AND id=$2 AND version=$16 RETURNING *',[c.organizationId,id,...values,'expectedVersion' in v?v.expectedVersion:0])).rows[0]:(await client.query('INSERT INTO suppliers(organization_id,name,contact_name,phone,email,gstin,address_line_1,address_line_2,city,state,country,postal_code,notes,status,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *',[c.organizationId,...values,c.userId])).rows[0];
   if(!row)throw new AppError('Supplier missing or changed; reload before saving',409);
   await this.event(client,c,row.id,id?(v.status==='archived'?'supplier.archived':'supplier.updated'):'supplier.created');return row;
  });
 }
 async supplierDetail(c:AuthorizationContext,id:string){
  await this.access(c,'purchasing.read');return this.db.transaction(async client=>{
   await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ,READ ONLY');
   const supplier=(await client.query('SELECT * FROM suppliers WHERE organization_id=$1 AND id=$2',[c.organizationId,id])).rows[0];if(!supplier)throw new AppError('Supplier not found',404);
   const orders=(await client.query(`${orderSelect} WHERE o.organization_id=$1 AND o.branch_id=$2 AND o.supplier_id=$3 ORDER BY o.created_at DESC,o.id DESC LIMIT 10`,[...scope(c),id])).rows;
   const summary=(await client.query('SELECT count(*)::text AS orders,max(ordered_at) AS last_ordered_at FROM purchase_orders WHERE organization_id=$1 AND branch_id=$2 AND supplier_id=$3',[...scope(c),id])).rows[0];
   const activity=(await client.query('SELECT e.*,u.name AS actor_name FROM purchasing_activity_events e JOIN users u ON u.id=e.actor_user_id WHERE e.organization_id=$1 AND e.supplier_id=$3 AND (e.branch_id=$2 OR e.branch_id IS NULL) ORDER BY e.occurred_at DESC,e.id DESC LIMIT 25',[...scope(c),id])).rows;return {...supplier,orders,summary,activity};
  });
 }
 async orders(c:AuthorizationContext,input:unknown){
  await this.access(c,'purchasing.read',undefined,'read');const v=this.filters(input,orderStatuses);
  if(v.supplierId&&!(await this.db.query('SELECT 1 FROM suppliers WHERE organization_id=$1 AND id=$2',[c.organizationId,v.supplierId])).rowCount)throw new AppError('Supplier filter unavailable',403);
  const args=[...scope(c),v.search,v.status??null,v.supplierId??null,v.from??null,v.to??null],where="o.organization_id=$1 AND o.branch_id=$2 AND ($3='' OR concat_ws(' ',o.human_reference,s.name) ILIKE '%'||$3||'%') AND ($4::text IS NULL OR o.status=$4) AND ($5::uuid IS NULL OR o.supplier_id=$5) AND ($6::date IS NULL OR o.order_date>=$6::date) AND ($7::date IS NULL OR o.order_date<=$7::date)";
  return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ,READ ONLY');const total=Number((await client.query(`SELECT count(*) AS n FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id WHERE ${where}`,args)).rows[0]!.n);return {data:(await client.query(`${orderSelect} WHERE ${where} ORDER BY ${v.sort==='oldest'?'o.created_at ASC':v.sort==='name'?'s.name ASC':'o.created_at DESC'},o.id LIMIT $8 OFFSET $9`,[...args,v.limit,(v.page-1)*v.limit])).rows,total,page:v.page,limit:v.limit};});
 }
 async saveOrder(c:AuthorizationContext,input:unknown,id?:string){
  const v=id?orderUpdateSchema.parse(input):orderSchema.parse(input);orderTotalMinor(v.lines);
  return this.write(c,async client=>{
   await this.supplier(client,c,v.supplierId);
   if(id){const old=await this.order(client,c,id,orderUpdateSchema.parse(input).expectedVersion);if(old.status!=='draft')throw new AppError('Only drafts can be edited',409);await client.query('DELETE FROM purchase_order_lines WHERE purchase_order_id=$1',[id]);}
   const row=id?(await client.query('UPDATE purchase_orders SET supplier_id=$4,order_date=$5,expected_delivery_date=$6,notes=$7,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *',[...scope(c),id,v.supplierId,v.orderDate,v.expectedDeliveryDate??null,v.notes??null])).rows[0]:(await client.query('INSERT INTO purchase_orders(organization_id,branch_id,supplier_id,human_reference,order_date,expected_delivery_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[...scope(c),v.supplierId,reference('PO'),v.orderDate,v.expectedDeliveryDate??null,v.notes??null,c.userId])).rows[0]!;
   for(const [position,line] of v.lines.entries()){
    const item=(await client.query("SELECT * FROM inventory_items WHERE id=$1 AND organization_id=$2 AND status='active'",[line.itemId,c.organizationId])).rows[0];if(!item)throw new AppError('Select an active canonical Inventory item',400);
    await client.query('INSERT INTO purchase_order_lines(purchase_order_id,organization_id,branch_id,inventory_item_id,item_name_snapshot,sku_snapshot,unit_code_snapshot,ordered_quantity,unit_price_minor,line_amount_minor,display_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[row.id,...scope(c),item.id,item.name,item.sku,item.unit_code,parsePositiveQuantity(line.quantity),parseInrPriceToMinor(line.unitPrice).toString(),lineAmountMinor(line.quantity,line.unitPrice).toString(),position]);
   }
   await this.event(client,c,v.supplierId,id?'purchase.updated':'purchase.created',row.id);return row;
  },'read');
 }
 async transition(c:AuthorizationContext,id:string,input:unknown){const v=transitionSchema.parse(input);return this.write(c,async client=>{
  const o=await this.order(client,c,id,v.expectedVersion);
  if(!['draft','ordered'].includes(o.status)||(v.status==='ordered'&&o.status!=='draft'))throw new AppError('Order cannot make this transition; received goods cannot be cancelled',409);
  if(v.status==='ordered'){
   await this.supplier(client,c,o.supplier_id);
   const items=await client.query('SELECT i.status,i.unit_code,l.unit_code_snapshot FROM purchase_order_lines l JOIN inventory_items i ON i.id=l.inventory_item_id AND i.organization_id=l.organization_id WHERE l.purchase_order_id=$1 FOR SHARE OF i',[id]);
   if(!items.rowCount||items.rows.some(i=>i.status!=='active'||i.unit_code!==i.unit_code_snapshot))throw new AppError('Order requires active canonical items with matching units',409);
  }
  const row=(await client.query("UPDATE purchase_orders SET status=$4,ordered_at=CASE WHEN $4='ordered' THEN now() ELSE ordered_at END,cancelled_at=CASE WHEN $4='cancelled' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3 RETURNING *",[...scope(c),id,v.status])).rows[0];await this.event(client,c,o.supplier_id,v.status==='ordered'?'purchase.ordered':'purchase.cancelled',id);return row;
 },'read');}
 async detail(c:AuthorizationContext,id:string){await this.access(c,'purchasing.read',undefined,'read');return this.db.transaction(async client=>{
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ,READ ONLY');const order=(await client.query(`${orderSelect} WHERE o.organization_id=$1 AND o.branch_id=$2 AND o.id=$3`,[...scope(c),id])).rows[0];if(!order)throw new AppError('Purchase order not found',404);
  const lines=(await client.query(`${linesSelect} WHERE l.purchase_order_id=$1 ORDER BY display_order`,[id])).rows;
  const receipts=(await client.query('SELECT r.*,u.name AS actor_name FROM purchase_receipts r JOIN users u ON u.id=r.created_by WHERE r.purchase_order_id=$1 ORDER BY r.received_at DESC,r.id DESC LIMIT 50',[id])).rows;
  const receiptLines=(await client.query('SELECT r.*,l.item_name_snapshot,l.unit_code_snapshot FROM purchase_receipt_lines r JOIN purchase_order_lines l ON l.id=r.purchase_order_line_id WHERE r.purchase_receipt_id=ANY($1::uuid[]) ORDER BY r.id',[receipts.map(r=>r.id)])).rows;
  const activity=(await client.query('SELECT e.*,u.name AS actor_name FROM purchasing_activity_events e JOIN users u ON u.id=e.actor_user_id WHERE e.purchase_order_id=$1 ORDER BY e.occurred_at DESC,e.id DESC LIMIT 50',[id])).rows;return {...order,lines,receipts:receipts.map(r=>({...r,lines:receiptLines.filter(l=>l.purchase_receipt_id===r.id)})),activity};
 });}
 async receive(c:AuthorizationContext,id:string,input:unknown){
  const v=receiptSchema.parse(input),normalized={organization:c.organizationId,branch:c.branchId,order:id,version:v.expectedVersion,notes:v.notes??null,lines:v.lines.map(l=>({orderLineId:l.orderLineId,quantity:parsePositiveQuantity(l.quantity)})).sort((a,b)=>a.orderLineId.localeCompare(b.orderLineId))},hash=fingerprint(normalized);
  return this.write(c,async client=>{
   const retry=(await client.query('SELECT * FROM purchase_receipts WHERE organization_id=$1 AND idempotency_key=$2',[c.organizationId,v.idempotencyKey])).rows[0];
   if(retry){if(retry.command_fingerprint.trim()!==hash)throw new AppError('Receipt idempotency key conflicts with a different command',409);return retry;}
   const o=await this.order(client,c,id,v.expectedVersion);if(!['ordered','partially_received'].includes(o.status))throw new AppError('Only open ordered purchases can receive goods',409);
   const receipt=(await client.query('INSERT INTO purchase_receipts(purchase_order_id,organization_id,branch_id,human_reference,idempotency_key,command_fingerprint,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[id,...scope(c),reference('GR'),v.idempotencyKey,hash,v.notes??null,c.userId])).rows[0]!;
   for(const line of normalized.lines){
    const original=(await client.query(`${linesSelect} WHERE l.purchase_order_id=$1 AND l.id=$2`,[id,line.orderLineId])).rows[0];if(!original)throw new AppError('Receipt line must belong to this order',400);
    if(!(await client.query('SELECT $1::numeric <= $2::numeric AS valid',[line.quantity,original.remaining_quantity])).rows[0]!.valid)throw new AppError('Receipt exceeds remaining ordered quantity',409);
    const lineId=randomUUID(),movement=await this.inventory.changeStock({organizationId:c.organizationId,branchId:c.branchId!,itemId:original.inventory_item_id,movementType:'receive',quantity:line.quantity,reason:null,reference:'Received from Purchase Order '+o.human_reference,actorMembershipId:c.membershipId,idempotencyKey:'purchase:'+lineId,commandFingerprint:hash,occurredAt:new Date(),purchaseReceiptLineId:lineId,expectedUnitCode:original.unit_code_snapshot});
    await client.query('INSERT INTO purchase_receipt_lines(id,purchase_receipt_id,purchase_order_id,purchase_order_line_id,organization_id,branch_id,inventory_item_id,location_id,quantity,movement_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[lineId,receipt.id,id,line.orderLineId,...scope(c),original.inventory_item_id,movement.locationId,line.quantity,movement.id]);
   }
   const complete=!(await client.query(`${linesSelect} WHERE l.purchase_order_id=$1 AND l.ordered_quantity>COALESCE(r.received,0) LIMIT 1`,[id])).rowCount,status=complete?'received':'partially_received';
   await client.query('UPDATE purchase_orders SET status=$4,version=version+1,updated_at=now() WHERE organization_id=$1 AND branch_id=$2 AND id=$3',[...scope(c),id,status]);
   await this.event(client,c,o.supplier_id,'receipt.created',id,receipt.id);await this.event(client,c,o.supplier_id,'purchase.'+status,id,receipt.id);return receipt;
  },'manage');
 }
 async receipts(c:AuthorizationContext,input:unknown){await this.access(c,'purchasing.read',undefined,'read');const v=this.filters(input,[]);return this.db.transaction(async client=>{await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ,READ ONLY');const args=[...scope(c),v.search],where="r.organization_id=$1 AND r.branch_id=$2 AND ($3='' OR concat_ws(' ',r.human_reference,o.human_reference,s.name) ILIKE '%'||$3||'%')",joins='FROM purchase_receipts r JOIN purchase_orders o ON o.id=r.purchase_order_id JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=r.created_by';return {data:(await client.query(`SELECT r.*,o.human_reference AS order_reference,s.name AS supplier_name,u.name AS actor_name ${joins} WHERE ${where} ORDER BY r.received_at DESC,r.id DESC LIMIT $4 OFFSET $5`,[...args,v.limit,(v.page-1)*v.limit])).rows,total:Number((await client.query(`SELECT count(*) AS n ${joins} WHERE ${where}`,args)).rows[0]!.n),page:v.page,limit:v.limit};});}
 async overview(c:AuthorizationContext){await this.access(c,'purchasing.read');return (await this.db.query("SELECT count(*) FILTER(WHERE status IN ('ordered','partially_received'))::text AS open,count(*) FILTER(WHERE status='partially_received')::text AS partial,count(*) FILTER(WHERE status IN ('ordered','partially_received') AND expected_delivery_date IS NOT NULL)::text AS awaiting,(SELECT count(*)::text FROM purchase_receipts WHERE organization_id=$1 AND branch_id=$2 AND received_at>=now()-interval '7 days') AS recent FROM purchase_orders WHERE organization_id=$1 AND branch_id=$2",scope(c))).rows[0];}
}
export const purchasingIdentifier=(v:unknown)=>z.uuid().parse(v);
