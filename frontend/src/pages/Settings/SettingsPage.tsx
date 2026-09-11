import React from 'react';
import { Settings, Building, Palette } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const SettingsPage: React.FC = () => {
  const user = useAppStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);

  const themeColors = [
    { name: 'Indigo', hex: '#4F46E5' },
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Violet', hex: '#8B5CF6' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Amber', hex: '#F59E0B' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
          <Settings className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm">Manage your organization and preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Organization Profile */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <Building className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">Organization Profile</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Organization ID (Tenant)</label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 font-mono">
                {user?.tenantId || 'Loading...'}
              </div>
              <p className="mt-2 text-xs text-slate-500">This ID uniquely identifies your workspace.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Your Role</label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 uppercase tracking-wider font-bold">
                {user?.role || 'Loading...'}
              </div>
            </div>
          </div>
        </div>

        {/* App Preferences */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <Palette className="w-5 h-5 text-slate-400" />
            <h2 className="text-lg font-bold text-white">App Preferences</h2>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-3">Theme Color</label>
              <div className="flex items-center gap-4 flex-wrap">
                {themeColors.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setTheme(theme.mode, c.hex)}
                    aria-label={`Select ${c.name} primary color`}
                    className={`w-10 h-10 rounded-full transition-transform flex items-center justify-center ${
                      theme.primaryColor === c.hex
                        ? 'ring-4 ring-slate-800 scale-110 shadow-md'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  >
                    {theme.primaryColor === c.hex && (
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">Select a primary accent color for your UI.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
