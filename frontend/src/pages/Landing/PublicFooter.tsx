import React from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";

export const PublicFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-12 mt-auto">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-indigo-500" />
            <span className="text-lg font-bold text-white">Eka Vio</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link to="#" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="#" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link to="#" className="hover:text-white transition-colors">Contact</Link>
          </div>
        </div>
        
        <div className="mt-8 text-center text-sm text-slate-500">
          &copy; {currentYear} Eka Vio. All rights reserved.
        </div>
      </div>
    </footer>
  );
};
