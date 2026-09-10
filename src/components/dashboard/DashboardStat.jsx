import React from "react";

/**
 * Single compact summary stat for the Relationship Dashboard.
 * Supports two visual variants:
 *   - "magenta": solid BoriSend Magenta background, white text/icon
 *   - "neutral" (default): white/neutral card, dark text, Magenta icon accent
 *
 * Semantic tone (warning/success/destructive) overrides the value colour
 * for genuine state indication only.
 */
export default function DashboardStat({ label, value, sublabel, icon: Icon, tone, variant = "neutral" }) {
  const isMagenta = variant === "magenta";

  const valueColor = tone === "warning"
    ? "text-warning"
    : tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "";

  if (isMagenta) {
    return (
      <div className="bg-primary text-primary-foreground rounded-2xl p-3.5 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium leading-tight text-primary-foreground/90">{label}</span>
          {Icon && <Icon className="w-3.5 h-3.5 text-primary-foreground/90" />}
        </div>
        <div className="text-2xl font-bold font-heading leading-none">
          {value}
        </div>
        {sublabel && <span className="text-[10px] text-primary-foreground/70 mt-1.5">{sublabel}</span>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-3.5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</span>
        {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
      </div>
      <div className={`text-2xl font-bold font-heading leading-none ${valueColor || "text-foreground"}`}>
        {value}
      </div>
      {sublabel && <span className="text-[10px] text-muted-foreground mt-1.5">{sublabel}</span>}
    </div>
  );
}