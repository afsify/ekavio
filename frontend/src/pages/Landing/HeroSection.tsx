import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-24 pb-32 lg:pt-36 lg:pb-40 overflow-hidden flex items-center justify-center min-h-[80vh]">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] opacity-60 animate-pulse"></div>
        <div className="absolute bottom-0 right-[10%] w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[100px] opacity-50"></div>
        <div className="absolute top-10 left-[10%] w-[300px] h-[300px] bg-sky-500/10 rounded-full blur-[100px] opacity-40"></div>
      </div>

      <div className="container mx-auto px-4 max-w-5xl text-center relative z-10 animate-float">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8">
          <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
          Eka Vio Platform is now live
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight mb-8 text-white leading-[1.1]">
          Simplify Your <br className="hidden md:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 animate-gradient-x">
            Business Operations
          </span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          The all-in-one platform for local shops, clinics, and offices to manage inventory, queues, and staff seamlessly.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/login"
            className="w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 px-8 rounded-xl transition-all shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:-translate-y-0.5 active:scale-95"
          >
            Sign In to Your Workspace
            <ArrowRight className="w-5 h-5" />
          </Link>
          <a
            href="#pilot-access"
            className="w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-slate-800/50 hover:bg-slate-800 text-white border border-slate-700 hover:border-slate-600 font-medium py-4 px-8 rounded-xl transition-all backdrop-blur-sm active:scale-95"
          >
            View Plans & Modules
          </a>
        </div>
      </div>
    </section>
  );
};
