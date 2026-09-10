import { useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  LifecycleService,
  NotificationService,
  PlatformService,
} from "@/services/mobile";

/**
 * Completes native push registration after the user has already granted OS
 * notification permission. It never causes a new permission prompt itself.
 *
 * Why this exists: an OS permission grant does not automatically create or
 * persist an FCM/APNs token. BoriSend needs an active DeviceToken before the
 * backend can deliver message-ready notifications.
 */
export default function NativePushController() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !PlatformService.isNative()) return;

    let cancelled = false;
    let registering = false;
    LifecycleService.init();

    const ensureRegistration = async () => {
      if (cancelled || registering) return;
      registering = true;
      try {
        const permission = await NotificationService.getPermissionStatus();
        if (permission === "granted") {
          await NotificationService.registerForPush();
        }
      } catch (error) {
        console.warn("[NativePushController] Registration check failed:", error?.message || error);
      } finally {
        registering = false;
      }
    };

    const offResume = LifecycleService.on("resume", ensureRegistration);
    ensureRegistration();

    return () => {
      cancelled = true;
      offResume();
    };
  }, [isAuthenticated]);

  return null;
}
