import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { hasEntitlement } from '../../commercial/catalogue';
import { useOperationalScope } from '../../hooks/useOperationalContext';
export interface Page<T> {data:T[];total:number;page:number;limit:number}
export interface Activity {id:string;action:string;actor_name:string;occurred_at:string}
export interface Supplier {id:string;name:string;contact_name:string|null;phone:string|null;email:string|null;gstin:string|null;address_line_1:string|null;address_line_2:string|null;city:string|null;state:string|null;country:string|null;postal_code:string|null;notes:string|null;status:'active'|'archived';version:number;orders?:Order[];summary?:{orders:string;last_ordered_at:string|null};activity?:Activity[]}
export type Status='draft'|'ordered'|'partially_received'|'received'|'cancelled';
export interface OrderLine {id:string;inventory_item_id:string;item_name_snapshot:string;sku_snapshot:string|null;unit_code_snapshot:string;ordered_quantity:string;received_quantity:string;remaining_quantity:string;unit_price_minor:string;line_amount_minor:string}
export interface ReceiptLine {id:string;movement_id:string;inventory_item_id:string;item_name_snapshot:string;unit_code_snapshot:string;quantity:string}
export interface Receipt {id:string;purchase_order_id:string;human_reference:string;order_reference?:string;supplier_name?:string;actor_name:string;received_at:string;notes:string|null;lines?:ReceiptLine[]}
export interface Order {id:string;supplier_id:string;supplier_name:string;human_reference:string;branch_name:string;actor_name:string;status:Status;order_date:string;expected_delivery_date:string|null;notes:string|null;version:number;total_minor:string;lines?:OrderLine[];receipts?:Receipt[];activity?:Activity[]}
export const get=async<T,>(path:string,params?:Record<string,unknown>,signal?:AbortSignal)=>(await client.get<{data:T}>(path,{params,signal})).data.data;
export const statuses:Status[]=['draft','ordered','partially_received','received','cancelled'];
export const label=(value:string)=>value.replaceAll('_',' ').replaceAll('.',' · ');
export const businessDate=(value:string|null|undefined)=>value?.slice(0,10)??'Not set';
export const time=(value:string)=>new Date(value).toLocaleString();
export function usePurchasingAccess(){const {user,entitlements}=useAppStore();const scope=useOperationalScope(),permissions=user?.permissions??[];return {scope,manage:permissions.includes('purchasing.manage'),inventoryRead:hasEntitlement(entitlements,'inventory')&&permissions.includes('inventory.read'),receive:hasEntitlement(entitlements,'inventory')&&permissions.includes('inventory.manage')&&permissions.includes('purchasing.manage'),reports:permissions.includes('reports.read')};}
// Exact display preview only; the server independently validates the supported range.
export function previewLine(quantity:string,price:string):bigint|null {if(!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(quantity)||!/^(0|[1-9]\d{0,16})(\.\d{1,2})?$/.test(price))return null;const [q,qf='']=quantity.split('.'),[p,pf='']=price.split('.');const milli=BigInt(q)*1000n+BigInt(qf.padEnd(3,'0'));if(milli===0n)return null;const result=(milli*(BigInt(p)*100n+BigInt(pf.padEnd(2,'0')))+500n)/1000n;return result<=9223372036854775807n?result:null;}
export function validReceiptQuantity(quantity:string,remaining:string){if(!/^(0|[1-9]\d{0,14})(\.\d{1,3})?$/.test(quantity))return false;const milli=(s:string)=>{const [n,f='']=s.split('.');return BigInt(n)*1000n+BigInt(f.padEnd(3,'0'));};return milli(quantity)>0n&&milli(quantity)<=milli(remaining);}
