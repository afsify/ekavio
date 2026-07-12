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
import { useAppStore } from '../store/useAppStore';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

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

  const modulesList: ModuleCardItem[] = [
    {
      id: 'digital-khata',
      title: 'Digital Khata',
      description:
        'Manage ledgers, credit notes, and supplier settlements seamlessly on mobile.',
      category: 'Accounting & Ledger',
      price: '$15/mo',
      icon: BookOpenCheck,
      defaultSubscribed: true,
    },
    {
      id: 'inventory',
      title: 'Inventory',
      description:
        'Real-time stock tracking, SKU alerts, barcode scanning, and multi-location warehouses.',
      category: 'Supply Chain',
      price: '$25/mo',
      icon: PackageCheck,
      defaultSubscribed: true,
    },
    {
      id: 'attendance',
      title: 'Attendance',
      description:
        'Biometric & geofenced employee check-ins, payroll integration, and shift rosters.',
      category: 'HR & Staff',
      price: '$12/mo',
      icon: Users,
      defaultSubscribed: false,
    },
    {
      id: 'queue',
      title: 'Queue Management',
      description:
        'Smart customer tokens, real-time waiting screens, and counter dispatching.',
      category: 'Customer Experience',
      price: '$20/mo',
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
      <div className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-6 sm:p-8 shadow-xl">
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-15 pointer-events-none"
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
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-md"
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

                  <p className="text-sm text-slate-400 leading-relaxed mb-6">
                    {mod.description}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    {isSubscribed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-400">
                          Active Subscription
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-500">
                        Not Subscribed
                      </span>
                    )}
                  </div>

                  <Button
                    variant={isSubscribed ? 'outline' : 'primary'}
                    onClick={() => handleToggleSubscribe(mod.id, mod.title)}
                  >
                    {isSubscribed ? 'Manage / Settings' : 'Subscribe'}
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
