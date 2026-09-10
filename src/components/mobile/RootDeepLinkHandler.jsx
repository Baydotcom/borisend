import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LifecycleService, DeepLinkService, LocalCleanupService } from "@/services/mobile";
import { useAuth } from "@/lib/AuthContext";
import { validateInternalRoute } from "@/lib/authReturnTo";

/**
 * RootDeepLinkHandler — RC20 Part 17/18
 *
 * Mounted at the APP ROOT (inside Router, OUTSIDE the auth gate) so that
 * deep links are captured even when the user is logged out.
 *
 * Previously DeepLinkHandler lived inside AppLayout (authenticated area),
 * so a cold-start deep link while logged out was lost — LifecycleService
 * never initialised and App.getLaunchUrl() was never read.
 *
 * Behaviour:
 *   - Initialises LifecycleService once (capturing native appUrlOpen +
 *     getLaunchUrl cold-start events).
 *   - On deep-link / notification-open: if authenticated → navigate to the
 *     validated internal route. If not authenticated → store the route in
 *     session-scoped storage; after login the resume effect picks it up.
 *   - Resume effect: when isAuthenticated flips to true, checks storage for
 *     a pending destination, validates it via validateInternalRoute(), and
 *     navigates + clears.
 *
 * Security (Part 18): all routes pass through validateInternalRoute(), which
 * rejects external URLs, protocol-relative URLs, backslash tricks, and
 * bootstrap/auth-token injection. Storage is session-scoped (expires on
 * tab/app close). Cleared on resume / logout / account deletion.
 */
export default function RootDeepLinkHandler() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Capture + route deep links (and resume after login)
  useEffect(() => {
    LifecycleService.init();

    const handleParsed = (parsed) => {
      const route = validateInternalRoute(parsed.route);
      if (!route || route === "/") {
        // Don't redirect to home just because a malformed link arrived
        return;
      }
      if (isAuthenticated) {
        LocalCleanupService.clearPendingDeepLink();
        navigate(route);
      } else {
        // Store for post-login resume (session-scoped)
        try { sessionStorage.setItem("borisend_pending_deep_link", route); } catch {}
      }
    };

    DeepLinkService.register(handleParsed);

    const unsubDeepLink = LifecycleService.on("deepLinkOpened", ({ url }) => {
      DeepLinkService.handle(url);
    });

    const unsubNotif = LifecycleService.on("notificationOpened", (payload) => {
      if (payload.deep_link) {
        DeepLinkService.handle(payload.deep_link);
      } else if (payload.route) {
        handleParsed({ route: payload.route });
      }
    });

    return () => {
      unsubDeepLink();
      unsubNotif();
    };
  }, [navigate, isAuthenticated]);

  // Resume pending deep link once authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    const pending = LocalCleanupService.getPendingDeepLink();
    if (pending) {
      const route = validateInternalRoute(pending);
      if (route && route !== "/") {
        LocalCleanupService.clearPendingDeepLink();
        navigate(route, { replace: true });
      } else {
        LocalCleanupService.clearPendingDeepLink();
      }
    }
  }, [isAuthenticated, navigate]);

  return null;
}