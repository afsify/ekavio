import React from "react";
import { Link } from "react-router-dom";
import { Check, CreditCard, PackageCheck, ShieldCheck } from "lucide-react";

export const PricingSection: React.FC = () => {
  const pilotFacts = [
    {
      title: "Operational modules",
      icon: PackageCheck,
      description: "Ledger, Inventory, Attendance, and Queue are available through the pilot catalogue.",
      features: [
        "Canonical server-managed access",
        "Plan and add-on assignments",
      ],
    },
    {
      title: "Manual pilot activation",
      icon: ShieldCheck,
      description: "An EkaVio platform operator assigns approved plans, modules, and validity dates.",
      features: [
        "Organization admins cannot self-enable modules",
        "Assigned access is visible after sign-in",
      ],
    },
    {
      title: "No required payment gateway",
      icon: CreditCard,
      description: "Pilot operation does not depend on automated checkout or fabricated billing records.",
      features: [
        "No automated purchase claim",
        "Final pricing remains unannounced",
      ],
    },
  ];

  return (
    <section id="pilot-access" className="py-24 relative">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Clear Pilot Access
          </h2>
          <p className="text-slate-400 text-lg">
            Plans and pricing are not presented as finalized. Commercial access is configured manually for approved pilot organizations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {pilotFacts.map((fact) => {
            const Icon = fact.icon;
            return (
              <div
                key={fact.title}
                className="relative rounded-3xl border border-slate-800 bg-slate-900 p-8 transition-all duration-300 hover:border-slate-700"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-white">{fact.title}</h3>
                <p className="min-h-16 text-sm text-slate-400">{fact.description}</p>
                <ul className="mt-6 space-y-4">
                  {fact.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/login"
            className="inline-flex rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition-colors hover:bg-indigo-500"
          >
            Sign in to view assigned access
          </Link>
        </div>
      </div>
    </section>
  );
};
