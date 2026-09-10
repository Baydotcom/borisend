import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const PLANS = [
  {
    name: "Free",
    price: 0,
    description: "Get started with automated messaging",
    messageLimit: "5 messages per month",
    campaignLimit: "1 Communication Plan",
    features: ["AI Message Generation", "Manual approval mode"],
    isPopular: false,
  },
  {
    name: "Starter",
    price: 4.99,
    description: "Basic scheduling for personal use",
    messageLimit: "30 messages per month",
    campaignLimit: "3 Communication Plans",
    features: ["Manual approval mode", "Basic scheduling"],
    isPopular: false,
  },
  {
    name: "Growth",
    price: 9.99,
    description: "More messages and scheduling options",
    messageLimit: "100 messages per month",
    campaignLimit: "10 Communication Plans",
    features: ["Manual & auto approval modes", "Advanced scheduling", "Contact groups"],
    isPopular: true,
  },
  {
    name: "Professional",
    price: 19.99,
    description: "For consistent, high-volume communication",
    messageLimit: "300 messages per month",
    campaignLimit: "25 Communication Plans",
    features: ["All scheduling options", "Priority message generation", "Message analytics"],
    isPopular: false,
  },
  {
    name: "Unlimited",
    price: 39.99,
    description: "Everything BoriSend has to offer",
    messageLimit: "Unlimited messages",
    campaignLimit: "Unlimited Communication Plans",
    features: ["All features included", "Priority support", "Early access to new features"],
    isPopular: false,
  },
];

function formatPrice(price) {
  if (price === 0) return "£0";
  return `£${price.toFixed(2)}`;
}

export default function PricingSection() {
  return (
    <section id="pricing" className="scroll-mt-16 bg-card border-y border-border/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            Simple, honest pricing.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start free and upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 flex flex-col ${
                plan.isPopular
                  ? "border-2 border-primary shadow-lg bg-background"
                  : "border border-border/50 bg-background"
              }`}
            >
              {plan.isPopular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground min-h-[40px]">{plan.description}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-heading font-semibold">{formatPrice(plan.price)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>

              <div className="mt-4 space-y-1.5">
                <p className="text-xs text-muted-foreground">{plan.messageLimit}</p>
                <p className="text-xs text-muted-foreground">{plan.campaignLimit}</p>
              </div>

              <ul className="mt-5 space-y-2.5 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link to="/register" className="mt-6">
                <Button className="w-full" variant={plan.isPopular ? "default" : "outline"}>
                  Get Started
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}