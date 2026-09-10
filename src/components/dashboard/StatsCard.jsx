import React from "react";

export default function StatsCard({ icon: Icon, label, value, accent }) {
  const accents = {
    purple: "text-primary",
    blue: "text-info",
    green: "text-success",
    orange: "text-warning",
  };

  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4">
      <Icon className={`w-5 h-5 mb-2 ${accents[accent] || accents.purple}`} />
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-muted-foreground font-medium mt-0.5">{label}</p>
    </div>
  );
}