import React from "react";
import { Link } from "react-router-dom";
import {
  Plus, UserPlus, Target, CalendarCheck,
  Users, Home, Briefcase, Building2, Globe,
} from "lucide-react";
import BoriSendLogo from "@/components/BoriSendLogo";

/**
 * ZeroPlanDashboard — the informative starting form of the BoriSend Dashboard.
 *
 * Renders when the user has zero Communication Plans (or while the dashboard
 * summary is loading/failed). It is NOT a blank empty state: it shows genuine
 * deterministic values (relationships, active plans, messages this month,
 * monthly activity, capacity) alongside orientation content.
 *
 * Data flows entirely from getRelationshipDashboardSummary (authoritative) —
 * no duplicate backend calls, no LLM, no new materialised records.
 */
const CATEGORIES = [
  { label: "Family", icon: Home },
  { label: "Friends", icon: UserPlus },
  { label: "Marriage & Partners", icon: Users },
  { label: "Workplace", icon: Briefcase },
  { label: "Clients", icon: Building2 },
  { label: "Faith & Community", icon: Globe },
];

const STEPS = [
  { n: 1, title: "Choose someone", desc: "Start with a person you want to keep in touch with.", icon: UserPlus },
  { n: 2, title: "Choose your goal", desc: "Decide what you want to maintain, strengthen or rebuild.", icon: Target },
  { n: 3, title: "Keep in touch", desc: "Review each prepared message before you send it.", icon: CalendarCheck },
];

export default function ZeroPlanDashboard({ summary }) {
  // Genuine authoritative values — never invented.
  const relationships = summary?.summary?.relationships ?? 0;
  // zeroPlanState === campaigns.length === 0 → active plans is deterministically 0.
  const activePlans = 0;
  const messagesThisMonth = summary?.summary?.connectionsThisMonth ?? summary?.monthly?.completed ?? 0;
  const monthly = summary?.monthly;
  const consistency = monthly?.consistency;
  const noConsistency = consistency === null || consistency === undefined;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Compact top summary — real deterministic values */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryStat label="Relationships" value={relationships} />
        <SummaryStat label="Active Plans" value={activePlans} />
        <SummaryStat label="Messages This Month" value={messagesThisMonth} />
      </div>

      {/* Primary start card — canonical Magenta BoriSend logo on neutral surface */}
      <div className="bg-card border border-border/60 rounded-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <BoriSendLogo variant="primary" className="h-7 w-auto" decorative />
          <h2 className="text-base font-heading font-semibold">Start your first Communication Plan</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Choose someone you want to keep in touch with and tell BoriSend what you want the relationship to feel like. You can then set a simple rhythm, review each prepared message and send it when it feels right.
        </p>
        <Link
          to="/campaigns/new"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" /> Create Communication Plan
        </Link>
      </div>

      {/* How BoriSend helps — three concise steps */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">How BoriSend helps</h2>
          <p className="text-xs text-muted-foreground mt-1">Set the relationship once, then return when a message needs your attention.</p>
        </div>
        <div className="bg-card border border-border/60 rounded-2xl divide-y divide-border/40">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-start gap-3 p-3.5">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {s.n}. {s.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Relationships you can strengthen — representative selection */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-foreground">Relationships you can strengthen</h2>
          <p className="text-xs text-muted-foreground mt-1">Use BoriSend for personal, family, community and professional relationships.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CATEGORIES.map((c) => (
            <div
              key={c.label}
              className="flex items-center gap-2 bg-card border border-border/60 rounded-xl px-3 py-2.5"
            >
              <c.icon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-medium text-foreground truncate">{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Monthly activity — real zero values, no invented stats */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">This Month</h2>
        <div className="bg-card border border-border/60 rounded-2xl p-4">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MiniStat label="Sent" value={monthly?.completed ?? 0} />
            <MiniStat label="Skipped" value={monthly?.skipped ?? 0} />
            <MiniStat label="Awaiting" value={monthly?.awaiting ?? 0} />
          </div>
          <div className="pt-3 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Consistency</span>
              <span className="text-sm font-bold text-foreground">
                {noConsistency ? "—" : `${consistency}%`}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {noConsistency ? "No data yet" : "On track"}
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}

function SummaryStat({ label, value }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 text-center">
      <p className="text-xl font-heading font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-lg font-heading font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}