export interface Widget {key:string;label:string;value:string;description:string;path:string;format?:'money'}
export interface DashboardData {widgets:Widget[];layout:{order:string[];hidden:string[];version:number};timezone:string;businessDate:string}
export interface ReportDescriptor {key:string;label:string;scope:string;dateRange:boolean;filters:string[];statuses:string[]}
export interface ReportData {report:string;scope:string;timezone:string;generatedAt:string;filters:Record<string,unknown>;columns:{key:string;label:string;format?:'money';selected:boolean}[];choices?:Record<string,{id:string;label:string}[]>;rows:Record<string,string|null>[];summary:Record<string,string>;page:number;limit:number;total:number}
export interface Notification {id:string;title:string;message:string;category:string;action:'settings'|'crm'|'hr';createdAt:string;readAt:string|null}
export interface NotificationData {rows:Notification[];unread:number;total:number;page:number;limit:number}
export const notificationPath=(action:string)=>action==='settings'?'/settings':action==='crm'?'/crm':action==='hr'?'/hr':null;
export function exactRupees(minor:string){const v=BigInt(minor),a=v<0n?-v:v;return `${v<0n?'-':''}₹${a/100n}.${String(a%100n).padStart(2,'0')}`;}
export function arrangeWidgets(widgets:Widget[],order:string[],hidden:string[]){return [...widgets].filter(w=>!hidden.includes(w.key)).sort((a,b)=>{const ai=order.indexOf(a.key),bi=order.indexOf(b.key);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});}
export function saveCsv(blob:Blob,report:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`ekavio-${report}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
