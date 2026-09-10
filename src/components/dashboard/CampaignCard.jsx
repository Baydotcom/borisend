import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Pause, Play, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const categoryLabels = {
  love_messages: "Love",
  marriage_appreciation: "Marriage",
  daily_encouragement: "Encouragement",
  birthday_reminders: "Birthday",
  employee_appreciation: "Employee",
  friday_appreciation: "Friday",
  church_followup: "Church",
  client_management: "Client",
  customer_retention: "Retention",
  family_checkins: "Family",
  prayer_reminders: "Prayer",
  motivation: "Motivation",
  custom: "Custom",
};

const statusStyles = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  completed: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
};

export default function CampaignCard({ campaign }) {
  return (
    <Link
      to={`/campaigns/${campaign.id}`}
      className="block bg-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-all active:scale-[0.98]"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{campaign.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {categoryLabels[campaign.category] || campaign.category}
          </p>
        </div>
        <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${statusStyles[campaign.status] || ""}`}>
          {campaign.status === "active" && <Play className="w-2.5 h-2.5 mr-1 fill-current" />}
          {campaign.status === "paused" && <Pause className="w-2.5 h-2.5 mr-1" />}
          {campaign.status}
        </Badge>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {campaign.recipients?.length || 0}
          </span>
          <span>{campaign.messages_sent || 0} sent</span>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
      </div>
    </Link>
  );
}