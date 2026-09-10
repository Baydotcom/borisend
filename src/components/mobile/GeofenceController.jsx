import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { GeofenceService, LifecycleService } from "@/services/mobile";

/**
 * GeofenceController — native geofence forwarding controller.
 *
 * POC addition: native Android transitions are persisted when the WebView is
 * unavailable. They are acknowledged only after processGeofenceEvent succeeds.
 * This proves terminated-WebView capture without embedding a reusable Base44
 * auth token in native code.
 */
export default function GeofenceController() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    let unsub = () => {};
    let cancelled = false;

    const forwardTransition = async (event) => {
      const geofenceId = event?.geofence_id || event?.id || "";
      const smartMessageId = event?.smart_message_id || String(geofenceId).replace(/^borisend_sm_/, "");
      const transition = String(event?.transition || "").toLowerCase();
      if (!smartMessageId || !geofenceId || !["enter", "exit"].includes(transition)) return false;

      try {
        await base44.functions.invoke("processGeofenceEvent", {
          smart_message_id: smartMessageId,
          transition,
          geofence_id: geofenceId,
          occurred_at: event?.occurred_at || new Date().toISOString(),
        });
        if (event?.event_id) await GeofenceService.ackPendingTransition(event.event_id);
        return true;
      } catch (e) {
        console.error("[GeofenceController] Failed to forward transition:", e);
        return false;
      }
    };

    const drainPending = async () => {
      const pending = await GeofenceService.getPendingTransitions();
      for (const event of pending) {
        if (cancelled) return;
        await forwardTransition(event);
      }
    };

    (async () => {
      const supported = await GeofenceService.isSupported();
      if (!supported || cancelled) return;
      unsub = await GeofenceService.onTransition(forwardTransition);
      await drainPending();
    })();

    LifecycleService.init();
    const offResume = LifecycleService.on("resume", drainPending);

    return () => {
      cancelled = true;
      unsub();
      offResume();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    let timer = null;

    LifecycleService.init();

    const reconcileNow = async () => {
      const supported = await GeofenceService.isSupported();
      if (!supported || cancelled) return;
      try {
        const smartMessages = await base44.entities.SmartMessage.filter({ status: "active" });
        const locationSms = (smartMessages || []).filter(
          sm => sm.trigger_type === "location_arrival" || sm.trigger_type === "location_departure",
        );
        await GeofenceService.reconcile(locationSms);
      } catch (e) {
        console.error("[GeofenceController] Reconcile failed:", e);
      }
    };

    const scheduleReconcile = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reconcileNow, 250);
    };

    const offResume = LifecycleService.on("resume", scheduleReconcile);
    const unsubEntity = base44.entities.SmartMessage.subscribe(scheduleReconcile);
    window.addEventListener("borisend:geofence-reconcile", scheduleReconcile);
    scheduleReconcile();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      offResume();
      unsubEntity();
      window.removeEventListener("borisend:geofence-reconcile", scheduleReconcile);
    };
  }, [isAuthenticated]);

  return null;
}
