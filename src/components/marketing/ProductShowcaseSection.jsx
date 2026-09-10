import React from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Calendar } from "lucide-react";

function MockupCard({ label, children }) {
  return (
    <div className="space-y-3">
      <div className="bg-card border border-border/50 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        </div>
        <div className="p-5">{children}</div>
      </div>
      <p className="text-sm text-muted-foreground text-center">{label}</p>
    </div>
  );
}

function DashboardMockup() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">Good morning, Sarah</p>
        <p className="text-xs text-muted-foreground">You have 2 messages ready for review.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-semibold text-primary">12</p>
          <p className="text-[10px] text-muted-foreground">Sent</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-semibold text-primary">3</p>
          <p className="text-[10px] text-muted-foreground">Active Plans</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-2.5 text-center">
          <p className="text-lg font-semibold text-primary">2</p>
          <p className="text-[10px] text-muted-foreground">Pending</p>
        </div>
      </div>
      <div className="bg-muted/30 rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-medium">Emma's Birthday</p>
          <Badge variant="secondary" className="text-[10px]">Pending</Badge>
        </div>
        <p className="text-xs text-muted-foreground">"Happy birthday, Emma! Hope you have a wonderful day..."</p>
        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
          <Clock className="w-3 h-3" /> Scheduled for Friday, 9:00 AM
        </p>
      </div>
    </div>
  );
}

function PlansMockup() {
  const plans = [
    { name: "Family Check-ins", category: "family_checkins", status: "Active" },
    { name: "Client Follow-up", category: "client_management", status: "Active" },
    { name: "Friday Appreciation", category: "friday_appreciation", status: "Paused" },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold mb-1">Communication Plans</p>
      {plans.map((plan) => (
        <div key={plan.name} className="flex items-center justify-between bg-muted/30 rounded-xl p-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium">{plan.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{plan.category.replace(/_/g, " ")}</p>
            </div>
          </div>
          <Badge variant={plan.status === "Active" ? "default" : "secondary"} className="text-[10px]">
            {plan.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function InboxMockup() {
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold mb-1">Smart Inbox</p>
      {[
        { name: "James", preview: "Thanks for the meeting notes, really helpful...", status: "Approved" },
        { name: "Mum", preview: "Just calling to say I love you, hope you're...", status: "Pending" },
      ].map((msg) => (
        <div key={msg.name} className="bg-muted/30 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-medium">{msg.name}</p>
            <Badge variant={msg.status === "Approved" ? "default" : "secondary"} className="text-[10px]">
              {msg.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{msg.preview}</p>
          {msg.status === "Pending" && (
            <div className="flex gap-2">
              <button className="text-[10px] font-medium text-primary flex items-center gap-1">
                <Check className="w-3 h-3" /> Approve
              </button>
              <button className="text-[10px] font-medium text-muted-foreground">Skip</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ProductShowcaseSection() {
  return (
    <section id="showcase" className="scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            Designed to be simple.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need is right where you expect it to be.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <MockupCard label="Home Dashboard">
            <DashboardMockup />
          </MockupCard>
          <MockupCard label="Communication Plans">
            <PlansMockup />
          </MockupCard>
          <MockupCard label="Smart Inbox">
            <InboxMockup />
          </MockupCard>
        </div>
      </div>
    </section>
  );
}