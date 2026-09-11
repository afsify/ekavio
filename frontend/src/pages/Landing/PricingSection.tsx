import React from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";

export const PricingSection: React.FC = () => {
  const plans = [
    {
      name: "Starter",
      price: "₹999",
      period: "/month",
      description: "Perfect for small shops just getting started with digitization.",
      features: [
        "Basic Inventory Management",
        "Digital Khata (Up to 100 entries)",
        "1 User Account",
        "Email Support",
      ],
      buttonText: "Get Started",
      highlighted: false,
    },
    {
      name: "Growth",
      price: "₹1,999",
      period: "/month",
      description: "Ideal for growing businesses needing more power and tracking.",
      features: [
        "Advanced Inventory Alerts",
        "Unlimited Digital Khata",
        "Queue Management",
        "Up to 5 User Accounts",
        "Priority Support",
      ],
      buttonText: "Start Free Trial",
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For large clinics and offices with complex operational needs.",
      features: [
        "Everything in Growth",
        "Staff Attendance & Payroll",
        "Unlimited Users",
        "Dedicated Account Manager",
        "Custom Integrations",
      ],
      buttonText: "Contact Sales",
      highlighted: false,
    },
  ];

  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Simple, Transparent Pricing
          </h2>
          <p className="text-slate-400 text-lg">
            Choose the plan that fits your business needs. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center max-w-5xl mx-auto">
          {plans.map((plan, index) => (
            <div
              key={index}
              className={`relative rounded-3xl p-8 transition-all duration-300 ${
                plan.highlighted
                  ? "bg-indigo-600/10 border-2 border-indigo-500 shadow-2xl shadow-indigo-500/20 transform md:-translate-y-4"
                  : "bg-slate-900 border border-slate-800 hover:border-slate-700"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider py-1 px-3 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <p className="text-sm text-slate-400 h-10">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-extrabold text-white">{plan.price}</span>
                <span className="text-slate-400">{plan.period}</span>
              </div>

              <ul className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 shrink-0 ${plan.highlighted ? "text-indigo-400" : "text-emerald-500"}`} />
                    <span className="text-slate-300 text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                to="/register"
                className={`block w-full py-3 px-6 text-center rounded-xl font-semibold transition-all duration-200 ${
                  plan.highlighted
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25"
                    : "bg-slate-800 hover:bg-slate-700 text-white"
                }`}
              >
                {plan.buttonText}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
