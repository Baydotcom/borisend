import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import MobileNav from "./MobileNav";
import DesktopSidebar from "./DesktopSidebar";
import ReferralAttributionProcessor from "@/components/referral/ReferralAttributionProcessor";
import PageTransition from "@/components/common/PageTransition";
import TrialManager from "@/components/trial/TrialManager";
import ProfileCompletion from "@/components/onboarding/ProfileCompletion";

export default function AppLayout() {
  const location = useLocation();
  return (
    <ProfileCompletion>
      <div className="min-h-screen bg-background safe-area-top relative overflow-x-hidden">
        <ReferralAttributionProcessor />
        <TrialManager />
        <DesktopSidebar />
        <main className="pb-32 md:pb-8 md:ml-64 relative">
          <div className="max-w-6xl mx-auto">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
        <MobileNav />
      </div>
    </ProfileCompletion>
  );
}