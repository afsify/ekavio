import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutDashboard, Settings, Users, Box, X, LogOut, MessageSquare, Building2, BookOpenCheck, PackageCheck, Clock, UserCog, CreditCard } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAppStore } from '../../store/useAppStore';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminSidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const location = useLocation();
  const user = useAppStore((state) => state.user);

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { name: 'Inventory', path: '/inventory', icon: <PackageCheck className="w-5 h-5" />, module: 'inventory' },
    { name: 'Queue', path: '/queue', icon: <Clock className="w-5 h-5" />, module: 'queue' },
    { name: 'Ledger', path: '/ledger', icon: <BookOpenCheck className="w-5 h-5" />, module: 'ledger' },
    { name: 'Attendance', path: '/attendance', icon: <Users className="w-5 h-5" />, module: 'attendance' },
    { name: 'Billing', path: '/billing', icon: <CreditCard className="w-5 h-5" />, adminOnly: true },
    { name: 'Messages', path: '/chat', icon: <MessageSquare className="w-5 h-5" />, module: 'chat' },
    { name: 'Corporate HQ', path: '/corporate', icon: <Building2 className="w-5 h-5" /> },
    { name: 'Staff', path: '/staff', icon: <UserCog className="w-5 h-5" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const filteredMenuItems = menuItems.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (item.module && !user?.activeModules?.includes(item.module)) return false;
    return true;
  });

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 md:relative md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-6 shrink-0">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Home className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Ekavio</span>
          </Link>
          <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1.5 overflow-y-auto">
          {filteredMenuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group font-medium",
                  isActive 
                    ? "bg-indigo-500/10 text-indigo-400" 
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                )}
                onClick={() => onClose()}
              >
                <div className={cn(
                  "transition-transform duration-200",
                  isActive ? "scale-110 text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                )}>
                  {item.icon}
                </div>
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800/80 shrink-0">
          <Link
            to="/login"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-rose-400 hover:bg-rose-500/10 transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </Link>
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
