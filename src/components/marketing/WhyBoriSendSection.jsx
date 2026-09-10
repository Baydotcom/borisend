import React from "react";
import { Heart, Users, Repeat, TrendingUp } from "lucide-react";

const POINTS = [
  { icon: Heart, title: "Remember important moments", text: "Birthdays, anniversaries and milestones; never miss the moments that matter." },
  { icon: Users, title: "Keep in touch", text: "Stay close to family, friends and colleagues, even when life gets busy." },
  { icon: Repeat, title: "Communicate consistently", text: "Build a steady rhythm of communication without thinking about it every day." },
  { icon: TrendingUp, title: "Build stronger relationships", text: "Thoughtful, timely messages help the people you care about feel valued." },
];

export default function WhyBoriSendSection() {
  return (
    <section className="bg-card border-y border-border/30">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-heading font-semibold leading-tight">
            Communication should never feel like another task.
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Between work, family and daily life, it is easy to lose touch. BoriSend helps you remember the moments that matter, keep in touch with the people you care about, and communicate consistently without adding another task to your to-do list.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {POINTS.map((point) => (
            <div key={point.title} className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <point.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">{point.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{point.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}