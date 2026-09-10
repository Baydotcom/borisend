import React from "react";

/**
 * This Month — deterministic monthly communication summary.
 * Planned / Completed / Skipped / Awaiting Attention + Consistency.
 * Neutral structure; Magenta for the consistency progress.
 */
export default function MonthlySummary({ monthly }) {
  if (!monthly) return null;
  const { planned, completed, skipped, awaiting, scheduledThisMonth, consistency } = monthly;
  // RC16.4 Part V/W: Scheduled communication from Campaign.next_scheduled counts
  // even when no Message entity has been generated yet.
  const hasData = planned > 0 || completed > 0 || skipped > 0 || awaiting > 0 || (scheduledThisMonth ?? 0) > 0;

  if (!hasData && consistency === null) {
    return (
      <section className="mb-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">This Month</h2>
        <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
          <p className="text-xs text-muted-foreground">No communication scheduled this month yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">This Month</h2>
      <div className="bg-card border border-border/60 rounded-2xl p-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
          <Metric label="Scheduled" value={scheduledThisMonth ?? planned} />
          <Metric label="Completed" value={completed} tone="success" />
          <Metric label="Skipped" value={skipped} />
          <Metric label="Awaiting attention" value={awaiting} tone={awaiting > 0 ? "warning" : null} />
        </div>
        <div className="pt-3 border-t border-border/40">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Communication consistency</span>
            <span className="text-xs font-bold text-foreground">
              {consistency === null ? "—" : `${consistency}%`}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${consistency ?? 0}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {consistency === null
              ? "Not enough data yet."
              : "Completed communications out of those due this month."}
          </p>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div>
      <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-lg font-bold font-heading ${color}`}>{value}</p>
    </div>
  );
}