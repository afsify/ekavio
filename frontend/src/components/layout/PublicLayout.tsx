import React from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

interface PublicLayoutProps {
  children: React.ReactNode;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
      {/* Minimal Header */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-7xl">
          <Link to="/" className="flex items-center gap-2 group transition-opacity hover:opacity-90">
            <div className="bg-indigo-600 p-2 rounded-xl group-hover:scale-105 transition-transform duration-300 shadow-lg shadow-indigo-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              Eka Vio
            </span>
          </Link>

          <nav className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Login
            </Link>
            <a
              href="#pilot-access"
              className="text-sm font-semibold bg-white text-slate-900 hover:bg-slate-200 px-4 py-2 rounded-lg transition-all shadow-md shadow-white/10 hover:shadow-white/20 active:scale-95 hidden sm:block"
            >
              Request Access
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative w-full overflow-hidden">
        {children}
      </main>
    </div>
  );
};
