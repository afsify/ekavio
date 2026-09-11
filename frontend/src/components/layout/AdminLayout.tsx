import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { TenantSwitcher } from './TenantSwitcher';
import { NotificationBell } from './NotificationBell';
import { ProfileSettingsModal } from '../ui/ProfileSettingsModal';

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col md:flex-row overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="font-bold text-xl text-white tracking-tight">Ekavio</div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button 
            onClick={() => setIsSidebarOpen(true)} 
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between px-8 py-5 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800/80 shrink-0">
          <div>
             <h1 className="text-xl font-bold text-white tracking-tight">Dashboard</h1>
          </div>
          <div className="flex items-center gap-6">
             <NotificationBell />
             <TenantSwitcher />
             <div 
                onClick={() => setIsProfileModalOpen(true)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-slate-800 cursor-pointer hover:scale-105 transition-transform"
                title="Profile Settings"
              >
               U
             </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>

      <ProfileSettingsModal 
        isOpen={isProfileModalOpen} 
        onClose={() => setIsProfileModalOpen(false)} 
      />
    </div>
  );
};

export default AdminLayout;
