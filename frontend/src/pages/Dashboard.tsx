import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  PackageCheck,
  Palette,
  Sparkles,
  Users,
} from 'lucide-react';
import { client } from '../api/client';
import { MODULES, type ModuleKey } from '../commercial/catalogue';
import { Card } from '../components/ui/Card';
import { useAppStore } from '../store/useAppStore';

const moduleIcons: Record<ModuleKey, React.ElementType> = {
  [MODULES.LEDGER]: BookOpenCheck,
  [MODULES.INVENTORY]: PackageCheck,
  [MODULES.ATTENDANCE]: Users,
  [MODULES.QUEUE]: Clock,
};

const moduleRoutes: Record<ModuleKey, string> = {
  [MODULES.LEDGER]: '/ledger',
  [MODULES.INVENTORY]: '/inventory',
  [MODULES.ATTENDANCE]: '/attendance',
  [MODULES.QUEUE]: '/queue',
};

const statIconClasses = {
  blue: 'bg-blue-500/20 text-blue-400',
  rose: 'bg-rose-500/20 text-rose-400',
  emerald: 'bg-emerald-500/20 text-emerald-400',
} as const;

const revenueSeries = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

const queueSeries = [
  { name: 'Mon', customers: 40 },
  { name: 'Tue', customers: 30 },
  { name: 'Wed', customers: 45 },
  { name: 'Thu', customers: 50 },
  { name: 'Fri', customers: 65 },
  { name: 'Sat', customers: 85 },
  { name: 'Sun', customers: 90 },
];

export const Dashboard: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const entitlements = useAppStore((state) => state.entitlements);
  const setTheme = useAppStore((state) => state.setTheme);

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboardStats', entitlements?.organizationId],
    queryFn: async () => {
      const response = await client.get('/analytics/dashboard');
      return response.data.data;
    },
    refetchInterval: 30000,
  });

  const themeColors = [
    { name: 'Indigo', hex: '#4F46E5' },
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Violet', hex: '#8B5CF6' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Amber', hex: '#F59E0B' },
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-6 shadow-xl sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-15 blur-3xl"
          style={{ backgroundColor: theme.primaryColor }}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              <span>Workspace: {user?.tenantId ?? 'Unavailable'}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              EkaVio Operations Dashboard
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-slate-400">
              Module access reflects your organization's server-managed commercial entitlements.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-800 bg-slate-950/60 p-2.5 sm:self-auto">
            <Palette className="ml-1 h-4 w-4 text-slate-400" />
            <span className="mr-1 text-xs font-medium text-slate-300">Theme:</span>
            {themeColors.map((color) => (
              <button
                key={color.hex}
                type="button"
                onClick={() => setTheme(theme.mode, color.hex)}
                aria-label={`Select ${color.name} primary color`}
                className={`h-6 w-6 rounded-full transition-transform ${
                  theme.primaryColor === color.hex
                    ? 'scale-110 ring-2 ring-white'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {[
          { label: 'Active Queue', value: stats?.totalQueue, icon: Clock, color: 'blue' },
          { label: 'Low Stock Alerts', value: stats?.lowStockItems, icon: PackageCheck, color: 'rose' },
          { label: 'Staff Present', value: stats?.presentStaff, icon: Users, color: 'emerald' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} interactive className="flex flex-col">
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${statIconClasses[item.color as keyof typeof statIconClasses]}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-400">{item.label}</p>
                  <h3 className="text-2xl font-bold text-white">
                    {isStatsLoading ? '...' : (item.value ?? 0)}
                  </h3>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex h-96 flex-col">
          <h3 className="mb-4 text-sm font-medium text-slate-400">Revenue (Last 7 Days)</h3>
          <div className="min-h-0 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }} />
                <Bar dataKey="revenue" fill={theme.primaryColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="flex h-96 flex-col">
          <h3 className="mb-4 text-sm font-medium text-slate-400">Daily Queue Customers</h3>
          <div className="min-h-0 w-full flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={queueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }} />
                <Line type="monotone" dataKey="customers" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold text-white">Organization Modules</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {(entitlements?.modules ?? []).map((module) => {
            const Icon = moduleIcons[module.key];
            return (
              <Card key={module.key} interactive className="flex flex-col justify-between">
                <div>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: `${theme.primaryColor}25`, color: theme.primaryColor }}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                          {module.category.replace('-', ' ')}
                        </span>
                        <h3 className="text-lg font-bold text-white">{module.displayName}</h3>
                      </div>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {module.commercialType === 'core' ? 'Core' : 'Optional'}
                    </span>
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-slate-400">{module.description}</p>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
                  <div className="flex items-center gap-1.5">
                    {module.enabled ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Active</span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">Not in current access</span>
                    )}
                  </div>
                  <Link
                    to={module.enabled ? moduleRoutes[module.key] : '/billing'}
                    className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20"
                  >
                    {module.enabled ? 'Open module' : 'View access details'}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
