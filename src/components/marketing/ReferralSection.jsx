import React from "react";
import { Gift } from "lucide-react";

export default function ReferralSection() {
  return (
    <section id="referrals" className="scroll-mt-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="bg-accent/50 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Gift className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center md:text-left flex-1">
            <h2 className="text-2xl md:text-3xl font-heading font-semibold leading-tight">
              Earn rewards for sharing BoriSend.
            </h2>
            <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl">
              When you introduce someone to BoriSend, you can earn rewards. Share your unique referral code from your account, and both you and the person you refer can benefit.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}