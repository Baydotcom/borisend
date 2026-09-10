import React, { useEffect } from "react";
import MarketingHeader from "@/components/marketing/MarketingHeader";
import HeroSection from "@/components/marketing/HeroSection";
import WhyBoriSendSection from "@/components/marketing/WhyBoriSendSection";
import FeaturesSection from "@/components/marketing/FeaturesSection";
import HowItWorksSection from "@/components/marketing/HowItWorksSection";
import ProductShowcaseSection from "@/components/marketing/ProductShowcaseSection";
import PricingSection from "@/components/marketing/PricingSection";
import ReferralSection from "@/components/marketing/ReferralSection";
import FAQSection from "@/components/marketing/FAQSection";
import FinalCTASection from "@/components/marketing/FinalCTASection";
import MarketingFooter from "@/components/marketing/MarketingFooter";
import BoriSendCarousel from "@/components/media/BoriSendCarousel";

export default function MarketingPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "BoriSend — Stay connected with the people who matter";

    const meta = document.createElement("meta");
    meta.name = "description";
    meta.content =
      "BoriSend helps you plan your communication, remember important moments, create thoughtful and personalised messages, and send with confidence.";
    document.head.appendChild(meta);

    document.documentElement.style.scrollBehavior = "smooth";

    return () => {
      document.title = previousTitle;
      meta.remove();
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <MarketingHeader />
      <main>
        <HeroSection />
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <BoriSendCarousel placement="web" />
        </section>
        <WhyBoriSendSection />
        <FeaturesSection />
        <HowItWorksSection />
        <ProductShowcaseSection />
        <PricingSection />
        <ReferralSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <MarketingFooter />
    </div>
  );
}