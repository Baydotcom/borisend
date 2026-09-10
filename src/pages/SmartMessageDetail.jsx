import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Clock, Calendar, MapPin, Zap, Repeat, Users, Pause, Play,
  Trash2, Pencil, Send, AlertTriangle
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PageLoader from "@/components/loaders/PageLoader";
import PageHeader from "@/components/layout/PageHeader";
import { formatTriggerDisplay } from "@/lib/smartMessageUtils";
import { GeofenceService, PlatformService } from "@/services/mobile";

export default function SmartMessageDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [sm, setSm] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [toggling, setToggling] = useState(false);

  const load = useCallback(async () => {
    try {
      const smartMsg = await base44.entities.SmartMessage.get(id);
      setSm(smartMsg);

      const recipRes = await base44.functions.invoke("manageSmartMessage", {
        action: "getRecipients",
        smart_message_id: id,
      });
      setRecipients(recipRes.data?.recipients || recipRes.recipients || []);
    } catch (e) {
      toast({ title: "Could not load", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async () => {
    setToggling(true);
    try {
      const newStatus = sm.status === "active" ? "inactive" : "active";
      const isLocationTrigger = sm.trigger_type === "location_arrival" || sm.trigger_type === "location_departure";
      if (newStatus === "active" && isLocationTrigger && PlatformService.isNative()) {
        const supported = await GeofenceService.isSupported();
        if (!supported) {
          toast({
            title: "Location trigger unavailable in this build",
            description: "This installed app does not include the native geofence capability yet.",
            variant: "destructive",
          });
          return;
        }
        const permission = await GeofenceService.requestPermission();
        if (permission !== "granted") {
          toast({
            title: "Location permission required",
            description: "Allow background location access to activate automatic arrival or departure detection.",
            variant: "destructive",
          });
          return;
        }
      }
      const res = await base44.functions.invoke("manageSmartMessage", {
        action: "toggle",
        smart_message_id: id,
        status: newStatus,
      });
      if (res.data?.smart_message) setSm(res.data.smart_message);
      if (isLocationTrigger) {
        window.dispatchEvent(new CustomEvent("borisend:geofence-reconcile"));
      }
      toast({
        title: newStatus === "active" ? "Smart Message activated" : "Smart Message paused",
      });
    } catch (e) {
      toast({ title: "Could not toggle", description: e.message, variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const handleTriggerNow = async () => {
    // §33: Generate a unique trigger_occurrence per tap for idempotency.
    // Backend handles double-tap protection via execution_key deduplication.
    setTriggering(true);
    try {
      const occurrence = new Date().toISOString();
      const res = await base44.functions.invoke("executeSmartMessage", {
        smart_message_id: id,
        trigger_occurrence: occurrence,
      });
      const data = res.data || res;
      if (data.blocked) {
        toast({
          title: "Smart Message blocked",
          description: data.message || "Not enough Smart Messages for this period.",
          variant: "destructive",
        });
      } else if (data.idempotent) {
        toast({
          title: "Already triggered",
          description: "This occurrence was already executed.",
        });
      } else {
        const firstPrepared = Array.isArray(data.executed) ? data.executed[0] : null;
        toast({
          title: data.executed_count === 1 ? "Message ready to send" : `${data.executed_count} messages ready to send`,
          description: data.executed_count > 1
            ? "Opening the first message now. The remaining messages stay ready in your inbox."
            : "Opening the prepared message now.",
        });
        if (firstPrepared?.message_id) {
          navigate(`/messages/${firstPrepared.message_id}`);
          return;
        }
        load(); // Safe fallback if an older backend response omits message ids
      }
    } catch (e) {
      toast({ title: "Could not trigger", description: e.message, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = async () => {
    try {
      await base44.functions.invoke("manageSmartMessage", {
        action: "delete",
        smart_message_id: id,
      });
      toast({ title: "Smart Message deleted" });
      navigate("/smart-messages");
    } catch (e) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <PageLoader label="Smart Message" />;
  if (!sm) return null;

  const isActive = sm.status === "active";
  const isManual = sm.trigger_type === "manual_event";
  const isLocation = sm.trigger_type === "location_arrival" || sm.trigger_type === "location_departure";

  const triggerIcon = {
    time: Clock, date: Calendar, recurring_date: Repeat,
    manual_event: Zap, location_arrival: MapPin, location_departure: MapPin,
  };
  const Icon = triggerIcon[sm.trigger_type] || Zap;

  return (
    <div className="min-h-screen pb-24">
      <PageHeader
        title={sm.name}
        rightAction={
          <Link
            to={`/smart-messages/${id}/edit`}
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted active:scale-90 transition-all touch-manipulation"
          >
            <Pencil className="w-4 h-4" />
          </Link>
        }
      />

      <div className="px-4 pt-4 space-y-4">
        {/* Human-centred Smart Message summary */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm flex items-center gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}><Icon className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary">Thoughtful routine</p>
            <p className="text-sm font-semibold truncate">{sm.name}</p>
            <p className="text-xs text-muted-foreground truncate">For {recipients.length} {recipients.length === 1 ? "person" : "people"}</p>
          </div>
          <span className={`text-xs font-medium px-3 py-1 rounded-full ${isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{isActive ? "Active" : "Paused"}</span>
        </div>

        {/* Description */}
        {sm.description && (
          <p className="text-sm text-muted-foreground">{sm.description}</p>
        )}

        {/* Fixed content */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm">
          <p className="text-xs text-muted-foreground mb-2">Fixed Message</p>
          <p className="text-sm whitespace-pre-wrap break-words">{sm.content}</p>
        </div>

        {/* Trigger info */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive ? "bg-primary" : "bg-muted"}`}>
              <Icon className={`w-4 h-4 ${isActive ? "text-primary-foreground" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trigger</p>
              <p className="text-sm font-medium">{formatTriggerDisplay(sm.trigger_type, sm.trigger_config)}</p>
            </div>
          </div>
          {sm.next_trigger_at && (
            <p className="text-xs text-muted-foreground pl-12">
              Next: {new Date(sm.next_trigger_at).toLocaleString(undefined, {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
          {sm.last_triggered_at && (
            <p className="text-xs text-muted-foreground pl-12">
              Last: {new Date(sm.last_triggered_at).toLocaleString(undefined, {
                weekday: "short", day: "numeric", month: "short",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Location native warning */}
        {isLocation && (
          <div className="bg-warning/5 border border-warning/20 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium">Automatic detection</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatic arrival/departure detection will be available in the supported mobile app.
                Use "Trigger Now" as a manual fallback.
              </p>
            </div>
          </div>
        )}

        {/* Recipients */}
        <div className="bg-card/90 border border-border/60 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Recipients ({recipients.length})</p>
          </div>
          <div className="space-y-2">
            {recipients.map(r => (
              <div key={r.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.display_name}</p>
                  {r.phone_number && (
                    <p className="text-xs text-muted-foreground">{r.phone_number}</p>
                  )}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  r.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}>
                  {r.status === "active" ? "Active" : "Paused"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-2">
          {/* Trigger Now — only for manual_event and location triggers (manual fallback) */}
          {(isManual || isLocation) && (
            <button
              onClick={handleTriggerNow}
              disabled={triggering || !isActive}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition-transform touch-manipulation"
            >
              {triggering ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Triggering...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Trigger Now
                </>
              )}
            </button>
          )}

          {/* Pause/Activate */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-sm font-medium active:scale-[0.99] transition-transform touch-manipulation"
          >
            {isActive ? (
              <><Pause className="w-4 h-4" /> Pause</>
            ) : (
              <><Play className="w-4 h-4" /> Activate</>
            )}
          </button>

          {/* Delete */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-destructive text-sm font-medium active:scale-[0.99] transition-transform touch-manipulation">
                <Trash2 className="w-4 h-4" /> Delete Smart Message
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Smart Message?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will stop future occurrences. Previously used Smart Message units will not be refunded. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}