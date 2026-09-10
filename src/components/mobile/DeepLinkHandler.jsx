import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LifecycleService, DeepLinkService } from "@/services/mobile";

/**
 * DeepLinkHandler — Invisible component that initializes lifecycle management
 * and routes incoming deep links to the correct screen.
 *
 * Mounted once inside AppLayout (inside Router context).
 */
export default function DeepLinkHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize lifecycle listeners (app launch, resume, background, network, etc.)
    LifecycleService.init();

    // Register the deep link navigation handler
    DeepLinkService.register((parsed) => {
      console.info("[DeepLink] Navigating to:", parsed.route);
      navigate(parsed.route);
    });

    // Listen for deep link events from native appUrlOpen or lifecycle
    const unsubDeepLink = LifecycleService.on("deepLinkOpened", ({ url }) => {
      DeepLinkService.handle(url);
    });

    // Listen for notification opens (carry deep_link payloads)
    const unsubNotif = LifecycleService.on("notificationOpened", (payload) => {
      if (payload.deep_link) {
        DeepLinkService.handle(payload.deep_link);
      } else if (payload.route) {
        navigate(payload.route);
      }
    });

    // Listen for network restored events
    const unsubNetwork = LifecycleService.on("networkRestored", () => {
      console.info("[Lifecycle] Network restored");
    });

    return () => {
      unsubDeepLink();
      unsubNotif();
      unsubNetwork();
    };
  }, [navigate]);

  return null;
}