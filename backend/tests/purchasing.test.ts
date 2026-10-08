import test from 'node:test';
import assert from 'node:assert/strict';
import { lineAmountMinor,orderTotalMinor,orderSchema,receiptSchema,supplierSchema } from '../src/domains/purchasing/policy.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';
import { readFileSync } from 'node:fs';
test('Purchasing line values use exact milli quantity and half-up paise rounding',()=>{
 for(const [q,p,n] of [['1','12.34',1234n],['0.500','0.01',1n],['1.250','10.01',1251n],['0.001','4.99',0n],['0.001','5.00',1n],['999999999999999.999','0',0n]] as const)assert.equal(lineAmountMinor(q,p),n);
 assert.equal(orderTotalMinor([{quantity:'0.500',unitPrice:'0.01'},{quantity:'1.250',unitPrice:'10.01'}]),1252n);
 assert.equal(lineAmountMinor('1','92233720368547758.07'),9223372036854775807n);
 assert.throws(()=>lineAmountMinor('2','92233720368547758.07'));
 assert.throws(()=>orderTotalMinor([{quantity:'1',unitPrice:'92233720368547758.07'},{quantity:'1',unitPrice:'0.01'}]));
 for(const q of ['-1','1.0001','1e3','NaN','1000000000000000'])assert.throws(()=>lineAmountMinor(q,'1'));
 for(const p of ['-1','1.001','1e3','Infinity'])assert.throws(()=>lineAmountMinor('1',p));
});
test('Purchasing closed schemas reject ambiguous or unsafe commands',()=>{
 assert.ok(supplierSchema.safeParse({name:'Name only local supplier'}).success);
 assert.ok(!supplierSchema.safeParse({name:'Supplier',gstin:'invalid'}).success);
 const id='ffffffff-ffff-4fff-8fff-ffffffffffff',line={itemId:id,quantity:'1.250',unitPrice:'1.01'};
 assert.ok(!orderSchema.safeParse({supplierId:id,orderDate:'2026-10-08',lines:[line,line]}).success);
 assert.ok(!orderSchema.safeParse({supplierId:id,orderDate:'2026-02-30',lines:[line]}).success);
 assert.ok(!orderSchema.safeParse({supplierId:id,orderDate:'2026-10-08',currency:'USD',lines:[line]}).success);
 assert.ok(!receiptSchema.safeParse({expectedVersion:1,idempotencyKey:'qa',lines:[{orderLineId:id,quantity:'0'}]}).success);
 assert.ok(!receiptSchema.safeParse({expectedVersion:1,idempotencyKey:'qa',lines:[{orderLineId:id,quantity:'1'},{orderLineId:id,quantity:'1'}]}).success);
});
test('Purchasing is not built-in staff/HR or operator authority',()=>{
 for(const r of ['owner','admin','manager'] as const)assert.ok(permissionsForRole(r).includes('purchasing.manage'));
 for(const r of ['staff','hr'] as const)assert.ok(!permissionsForRole(r).includes('purchasing.read'));
});
test('Purchasing reuses one canonical stock transaction and is native PostgreSQL-only',()=>{
 const service=readFileSync('src/domains/purchasing/service.ts','utf8'),db=readFileSync('src/postgres/database.ts','utf8'),sql=readFileSync('postgres/migrations/019_suppliers_purchasing.sql','utf8'),routes=readFileSync('src/routes/purchasingRoutes.ts','utf8');
 assert.match(service,/this\.db\.atomic/);assert.match(service,/this\.inventory\.changeStock/);assert.doesNotMatch(service,/INSERT INTO (stock_movements|stock_balances)|COMMIT|ROLLBACK|mongoose|legacy_mongo_id/);assert.match(db,/if \(scoped\) return operation\(scoped\)/);assert.match(db,/atomicClient\.run\(client/);
 assert.match(sql,/purchase_receipt_line_id/);assert.match(sql,/DEFERRABLE INITIALLY DEFERRED/);assert.match(sql,/stock_purchasing_reversal_guard/);assert.doesNotMatch(sql,/CREATE TABLE.*(?:purchase_stock_balances|supplier_stock_balances)|INSERT INTO (subscriptions|subscription_add_ons|plan_modules|entitlement_overrides|public_offer_pricing)/i);assert.match(routes,/requireEntitlement\('purchasing'\)/);assert.match(routes,/requirePermission\('purchasing.manage'\)/);
});
