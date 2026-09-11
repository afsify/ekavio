import React from "react";
import { Package, FileText, Users, Clock } from "lucide-react";

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      title: "Inventory Management",
      description:
        "Keep track of your stock in real-time. Get alerts when items run low and manage suppliers effortlessly.",
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      title: "Digital Khata",
      description:
        "Replace your paper ledgers with our secure digital khata. Track customer dues, payments, and history.",
      icon: FileText,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      title: "Queue Management",
      description:
        "Organize patient or customer flow efficiently. Reduce wait times and improve satisfaction.",
      icon: Clock,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      title: "Staff Attendance",
      description:
        "Monitor employee shifts, attendance, and performance with our built-in HR tools.",
      icon: Users,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      border: "border-rose-500/20",
    },
  ];

  return (
    <section className="py-24 bg-slate-900/50 relative border-y border-slate-800">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-slate-400 text-lg">
            Powerful tools designed specifically for local businesses to streamline daily operations and grow faster.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="group p-6 rounded-2xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-1 relative overflow-hidden"
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-6 ${feature.bg} ${feature.border} border`}>
                  <Icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">
                  {feature.title}
                </h3>
                <p className="text-slate-400 leading-relaxed">
                  {feature.description}
                </p>

                {/* Subtle gradient effect on hover */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl" />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
