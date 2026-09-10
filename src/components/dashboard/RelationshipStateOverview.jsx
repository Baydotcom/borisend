import React from "react";
import { Link } from "react-router-dom";

/**
 * Relationship State Overview — counts of active PlanRecipients grouped by
 * relationship state. Neutral chips; no rainbow palette, no health score.
 * Clicking a state routes to the Plans list (filtered client-side there).
 */
export default function RelationshipStateOverview({ states }) {
  if (!states || states.length === 0) return null;
  const total = states.reduce((s, x) => s + x.count, 0);
  if (total === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="text-sm font-semibold text-foreground mb-3">Relationship States</h2>
      <div className="bg-card border border-border/60 rounded-2xl p-4">
        <div className="space-y-2.5">
          {states.map((s) => (
            <Link
              key={s.systemKey}
              to="/campaigns"
              className="flex items-center justify-between py-1.5 active:opacity-70 transition-opacity"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-foreground/70" />
                <span className="text-sm text-foreground">{s.displayName}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{s.count}</span>
            </Link>
          ))}
        </div>
        <div className="pt-3 mt-2 border-t border-border/40 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Total active relationships</span>
          <span className="text-xs font-bold text-primary">{total}</span>
        </div>
      </div>
    </section>
  );
}