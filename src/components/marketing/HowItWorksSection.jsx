import React from "react";
import { CalendarCheck, Clock, Send } from "lucide-react";

const STEPS = [
  {
    number: "1",
    icon: CalendarCheck,
    title: "Plan",
    text: "Create a Communication Plan for the people you want to stay in touch with.",
  },
  {
    number: "2",
    icon: Clock,
    title: "Schedule",
    text: "Choose when and how often your messages should be sent. BoriSend handles the timing.",
  },
  {
    number: "3",
    icon: Send,
    title: "Stay Connected",
    text: "Review your messages in Smart Inbox, approve them, and let BoriSend send them at the right moment.",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-card border-y border-border/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            How it works.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Three simple steps to more thoughtful communication.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step, idx) => (
            <div key={step.number} className="relative text-center">
              {idx < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[60%] w-full h-px bg-border" />
              )}
              <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <step.icon className="w-7 h-7 text-primary" />
                <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                  {step.number}
                </span>
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}