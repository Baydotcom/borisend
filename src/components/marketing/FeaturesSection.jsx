import React from "react";
import { CalendarDays, PenLine, Clock, Inbox, Bell, Smartphone } from "lucide-react";

const FEATURES = [
  {
    icon: CalendarDays,
    title: "Plan Ahead",
    text: "Create Communication Plans for the people and moments that matter to you.",
  },
  {
    icon: PenLine,
    title: "Write with Confidence",
    text: "Get writing assistance that helps you find the right words for every occasion.",
  },
  {
    icon: Clock,
    title: "Schedule Important Moments",
    text: "Set up message schedules so you never miss a birthday, anniversary or follow-up.",
  },
  {
    icon: Inbox,
    title: "Keep Everything Organised",
    text: "Use Smart Inbox to review, approve and manage your messages in one place.",
  },
  {
    icon: Bell,
    title: "Stay Connected",
    text: "Receive gentle notifications so you always know what is ready and what needs your attention.",
  },
  {
    icon: Smartphone,
    title: "Access Anywhere",
    text: "Use BoriSend on your phone, tablet or computer. Your plans stay with you wherever you go.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            Everything you need to stay in touch.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Simple tools that help you communicate with care and consistency.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="bg-card border border-border/50 rounded-2xl p-6 transition-shadow hover:shadow-md"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}