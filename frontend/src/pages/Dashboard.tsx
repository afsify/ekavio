/**
 * Mobile-First Dashboard Page (`Dashboard.tsx`)
 * Functional module selection & billing hub displaying interactive cards for
 * Digital Khata, Inventory, Attendance, and Queue Management modules.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpenCheck,
  PackageCheck,
  Users,
  Clock,
  CheckCircle2,
  Sparkles,
  Palette,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { client } from '../api/client';

interface ModuleCardItem {
  id: string;
  title: string;
  description: string;
  category: string;
  price: string;
  icon: React.ElementType;
  defaultSubscribed: boolean;
}

export const Dashboard: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  const [subscribedModules, setSubscribedModules] = useState<
    Record<string, boolean>
  >({
    'digital-khata': true,
    inventory: true,
    attendance: false,
    queue: true,
  });

  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await client.get('/analytics/dashboard');
      return res.data.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const modulesList: ModuleCardItem[] = [
    {
      id: 'digital-khata',
      title: 'Digital Khata',
      description:
        'Manage ledgers, credit notes, and supplier settlements seamlessly on mobile.',
      category: 'Accounting & Ledger',
      price: '₹199/mo',
      icon: BookOpenCheck,
      defaultSubscribed: true,
    },
    {
      id: 'inventory',
      title: 'Inventory',
      description:
        'Real-time stock tracking, SKU alerts, barcode scanning, and multi-location warehouses.',
      category: 'Supply Chain',
      price: '₹199/mo',
      icon: PackageCheck,
      defaultSubscribed: true,
    },
    {
      id: 'attendance',
      title: 'Attendance',
      description:
        'Biometric & geofenced employee check-ins, payroll integration, and shift rosters.',
      category: 'HR & Staff',
      price: '₹199/mo',
      icon: Users,
      defaultSubscribed: false,
    },
    {
      id: 'queue',
      title: 'Queue Management',
      description:
        'Smart customer tokens, real-time waiting screens, and counter dispatching.',
      category: 'Customer Experience',
      price: '₹199/mo',
      icon: Clock,
      defaultSubscribed: true,
    },
  ];

  const handleToggleSubscribe = (moduleId: string, title: string) => {
    const isSubscribed = Boolean(subscribedModules[moduleId]);
    setSubscribedModules((prev) => ({
      ...prev,
      [moduleId]: !isSubscribed,
    }));

    if (!isSubscribed) {
      toast.success(`Subscribed to ${title}! Module activated.`);
    } else {
      toast('Module set to inactive', { icon: 'ℹ️' });
    }
  };

  const themeColors = [
    { name: 'Indigo', hex: '#4F46E5' },
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Violet', hex: '#8B5CF6' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Amber', hex: '#F59E0B' },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Hero Section */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-6 sm:p-8 shadow-xl transition-colors duration-300">
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none transition-colors duration-500"
          style={{ backgroundColor: theme.primaryColor }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-slate-300 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Tenant Hub: {user?.tenantId || 'Enterprise'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Ekavio Module & Billing Hub
            </h1>
            <p className="mt-1.5 text-sm text-slate-400 max-w-xl">
              Activate, subscribe, or manage mobile operations modules for your organization.
            </p>
          </div>

          {/* Dynamic Theme Color Selector Demonstration */}
          <div className="flex items-center gap-2 bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800 self-start sm:self-auto">
            <Palette className="w-4 h-4 text-slate-400 ml-1" />
            <span className="text-xs font-medium text-slate-300 mr-1">
              Theme:
            </span>
            {themeColors.map((c) => (
              <button
                key={c.hex}
                onClick={() => setTheme(theme.mode, c.hex)}
                aria-label={`Select ${c.name} primary color`}
                className={`w-6 h-6 rounded-full transition-transform ${
                  theme.primaryColor === c.hex
                    ? 'ring-2 ring-white scale-110 shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Live Analytics StatCards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card interactive className="flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/20 text-blue-400">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Active Queue</p>
              <h3 className="text-2xl font-bold text-white">
                {isStatsLoading ? '...' : (stats?.totalQueue || 0)}
              </h3>
            </div>
          </div>
        </Card>

        <Card interactive className="flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-rose-500/20 text-rose-400">
              <PackageCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Low Stock Alerts</p>
              <h3 className="text-2xl font-bold text-white">
                {isStatsLoading ? '...' : (stats?.lowStockItems || 0)}
              </h3>
            </div>
          </div>
        </Card>

        <Card interactive className="flex flex-col">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-emerald-500/20 text-emerald-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Staff Present</p>
              <h3 className="text-2xl font-bold text-white">
                {isStatsLoading ? '...' : (stats?.presentStaff || 0)}
              </h3>
            </div>
          </div>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="flex flex-col h-96">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Revenue (Last 7 Days)</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Mon', revenue: 4000 },
                { name: 'Tue', revenue: 3000 },
                { name: 'Wed', revenue: 2000 },
                { name: 'Thu', revenue: 2780 },
                { name: 'Fri', revenue: 1890 },
                { name: 'Sat', revenue: 2390 },
                { name: 'Sun', revenue: 3490 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="revenue" fill={theme.primaryColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="flex flex-col h-96">
          <h3 className="text-sm font-medium text-slate-400 mb-4">Daily Queue Customers</h3>
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[
                { name: 'Mon', customers: 40 },
                { name: 'Tue', customers: 30 },
                { name: 'Wed', customers: 45 },
                { name: 'Thu', customers: 50 },
                { name: 'Fri', customers: 65 },
                { name: 'Sat', customers: 85 },
                { name: 'Sun', customers: 90 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '0.75rem' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Line type="monotone" dataKey="customers" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Modules Grid */}
      <div>
        <h2 className="text-lg font-bold text-white mb-4">
          Available Modules & Subscriptions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {modulesList.map((mod) => {
            const Icon = mod.icon;
            const isSubscribed = Boolean(subscribedModules[mod.id]);

            return (
              <Card key={mod.id} interactive className="flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md transition-colors"
                        style={{
                          backgroundColor: `${theme.primaryColor}25`,
                          color: theme.primaryColor,
                        }}
                      >
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {mod.category}
                        </span>
                        <h3 className="text-lg font-bold text-white">
                          {mod.title}
                        </h3>
                      </div>
                    </div>

                    <span className="text-sm font-bold text-slate-200 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">
                      {mod.price}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed mb-4">
                    {mod.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {isSubscribed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                          Active
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        Not Subscribed
                      </span>
                    )}
                  </div>

                  <Button
                    variant={isSubscribed ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => handleToggleSubscribe(mod.id, mod.title)}
                  >
                    {isSubscribed ? 'Active' : 'Subscribe Now (₹199/mo)'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
