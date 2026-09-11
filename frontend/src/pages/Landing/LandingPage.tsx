import React from "react";
import { HeroSection } from "./HeroSection";
import { FeaturesSection } from "./FeaturesSection";
import { PricingSection } from "./PricingSection";
import { PublicFooter } from "./PublicFooter";

export const LandingPage: React.FC = () => {
  return (
    <div className="w-full flex flex-col">
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      <PublicFooter />
    </div>
  );
};

export default LandingPage;
