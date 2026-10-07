import { runtimePersistence,runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { DashboardAnalyticsService } from '../domains/analytics/dashboardService.js';
import { ReportService } from '../domains/analytics/reportService.js';
const enabled=async(org:string)=>new Set((await runtimePersistence.commercial.getEffective(org)).modules.filter(m=>m.enabled).map(m=>m.key));
export const dashboardAnalytics=new DashboardAnalyticsService(runtimePostgresDatabase,enabled);
export const reportService=new ReportService(runtimePostgresDatabase,enabled);
