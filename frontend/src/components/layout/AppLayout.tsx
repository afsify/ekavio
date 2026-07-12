/**
 * Mobile-First App Layout (`AppLayout`)
 * Functional layout wrapper providing a Top App Bar, main scrollable area,
 * and native-style Bottom Navigation Bar for seamless mobile UX.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Moon,
  Sun,
  User,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import toast from 'react-hot-toast';

export interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const user = useAppStore((state) => state.user);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const logout = useAppStore((state) => state.logout);

  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    toast.success('Signed out successfully');
    navigate('/login', { replace: true });
  };

  const toggleThemeMode = () => {
    const nextMode = theme.mode === 'dark' ? 'light' : 'dark';
    setTheme(nextMode, theme.primaryColor);
  };

  const navItems = [
    { label: 'Modules', path: '/dashboard', icon: LayoutGrid },
    { label: 'Analytics', path: '/dashboard?tab=analytics', icon: BarChart3 },
    { label: 'Profile', path: '/dashboard?tab=profile', icon: User },
    { label: 'Settings', path: '/dashboard?tab=settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 dark:bg-slate-950 dark:text-slate-100">
      {/* Top App Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-xl px-4 h-16 flex items-center justify-between">
        <div
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--primary-color,#4F46E5)] flex items-center justify-center shadow-md shadow-indigo-500/25">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-base">
              Ekavio
            </span>
            <span className="ml-1.5 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-[var(--primary-color,#4F46E5)]/20 text-[var(--primary-color,#818cf8)] border border-[var(--primary-color,#4F46E5)]/30">
              Mobile
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
              <User className="w-3.5 h-3.5 text-[var(--primary-color,#818cf8)]" />
              <span className="font-medium">{user.name || user.phone}</span>
              <span className="text-slate-500">|</span>
              <span className="uppercase text-[10px] font-bold text-[var(--primary-color,#818cf8)]">
                {user.role}
              </span>
            </div>
          )}

          {/* Theme Mode Switcher */}
          <button
            onClick={toggleThemeMode}
            aria-label="Toggle theme mode"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 transition-colors"
          >
            {theme.mode === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400" />
            )}
          </button>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="p-2 sm:px-3 sm:py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-rose-400 transition-colors flex items-center gap-1.5 text-xs font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28">
        {children}
      </main>

      {/* Native-Style Bottom Navigation Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/80 bg-slate-900/95 backdrop-blur-xl px-4 py-2 sm:hidden">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                  isActive
                    ? 'text-[var(--primary-color,#818cf8)] font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] mt-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
