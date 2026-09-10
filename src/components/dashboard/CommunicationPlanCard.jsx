import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Pause, Play, Users, MoreVertical, Pencil, Copy, Trash2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/use-toast";
import { useI18n } from "@/lib/I18nContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

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
  active: "bg-success/15 text-success",
  paused: "bg-warning/15 text-warning",
  draft: "bg-muted text-muted-foreground",
  completed: "bg-info/15 text-info",
};

export default function CommunicationPlanCard({ campaign, onUpdate }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [showDelete, setShowDelete] = useState(false);

  const toggleStatus = async () => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await base44.entities.Campaign.update(campaign.id, { status: newStatus });
    toast({ title: newStatus === "active" ? "Routine resumed" : "Routine paused" });
    onUpdate();
  };

  const duplicate = async () => {
    const { id: _, created_date, updated_date, created_by_id, ...rest } = campaign;
    await base44.entities.Campaign.create({ ...rest, name: `${rest.name} (copy)`, status: "draft", messages_sent: 0 });
    toast({ title: "Routine duplicated" });
    onUpdate();
  };

  const deletePlan = async () => {
    await base44.entities.Campaign.delete(campaign.id);
    toast({ title: "Routine deleted" });
    onUpdate();
  };

  const statusLabel = t(`status${campaign.status.charAt(0).toUpperCase()}${campaign.status.slice(1)}`);

  return (
    <>
      <div className="bg-card/90 rounded-3xl border border-border/60 p-4 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-start justify-between mb-3">
          <Link to={`/campaigns/${campaign.id}`} className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Users className="w-4 h-4" /></div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{campaign.name || "Communication Plan"}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {categoryLabels[campaign.category] || campaign.category || "Relationship"}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant="secondary" className={`text-[10px] px-2 py-0.5 ${statusStyles[campaign.status] || ""}`}>
              {campaign.status === "active" && <Play className="w-2.5 h-2.5 mr-1 fill-current" />}
              {campaign.status === "paused" && <Pause className="w-2.5 h-2.5 mr-1" />}
              {statusLabel}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-muted">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/campaigns/${campaign.id}`)}>
                  <Eye className="w-4 h-4 mr-2" /> {t("view")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate(`/campaigns/${campaign.id}/edit`)}>
                  <Pencil className="w-4 h-4 mr-2" /> {t("edit")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleStatus}>
                  {campaign.status === "active" ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  {campaign.status === "active" ? t("pause") : t("resume")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={duplicate}>
                  <Copy className="w-4 h-4 mr-2" /> {t("duplicate")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowDelete(true)} className="text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> {t("delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Link to={`/campaigns/${campaign.id}`} className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5" />
              {campaign.recipients?.length || 0}
            </span>
            <span>{campaign.messages_sent || 0} {t("sentCount")}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </Link>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this routine?</AlertDialogTitle>
            <AlertDialogDescription>This removes the Communication Plan and stops future messages from it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={deletePlan} className="bg-destructive text-destructive-foreground">{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}