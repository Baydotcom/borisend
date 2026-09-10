/**
 * LocalCleanupService — User-scoped local state cleanup
 *
 * RC20 Part 25 — ensures account deletion and logout do not leave stale
 * user-specific state on the device/browser.
 *
 * Clears ONLY BoriSend-owned user-specific storage. It does NOT wipe
 * unrelated browser/platform storage (e.g. app-params bootstrap, which is
 * platform infrastructure, not user data).
 *
 * Server-side deletion/anonymisation remains the responsibility of the
 * deleteAccount backend function (RC18.3.1 §14). This service only clears
 * the LOCAL client cache.
 */

const USER_SCOPED_LOCAL_KEYS = [
  "borisend_device_token",        // cached push token (user-scoped)
  "borisend_pending_deep_link",   // pending deep-link destination
  "borisend_just_registered",      // registration marker
];

const USER_SCOPED_SESSION_KEYS = [
  "borisend_pending_deep_link",
  "borisend_just_registered",
];

const LocalCleanupService = {
  /**
   * Run before logout / account deletion.
   * Clears user-scoped local + session state and unregisters push.
   * Safe to call on web and native.
   */
  async beforeLogout() {
    // Clear user-scoped local storage
    try {
      USER_SCOPED_LOCAL_KEYS.forEach(k => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }

    // Clear user-scoped session storage
    try {
      USER_SCOPED_SESSION_KEYS.forEach(k => sessionStorage.removeItem(k));
    } catch { /* storage unavailable */ }

    // Unregister account-specific native geofences so a signed-out (or
    // deleted) account cannot continue generating Smart Message actions.
    // RC20.2 Part 11/12. Best-effort, non-blocking.
    try {
      const { default: GeofenceService } = await import("./GeofenceService");
      await GeofenceService.unregisterAll().catch(() => {});
    } catch { /* GeofenceService unavailable */ }

    // Unregister push + deactivate server-side token (best-effort, non-blocking)
    try {
      const { default: NotificationService } = await import("./NotificationService");
      await NotificationService.unregisterFromPush().catch(() => {});
    } catch { /* NotificationService unavailable */ }
  },

  /**
   * Clear only the pending deep-link destination.
   * Called after a successful deep-link resume, or on logout/deletion.
   */
  clearPendingDeepLink() {
    try {
      localStorage.removeItem("borisend_pending_deep_link");
      sessionStorage.removeItem("borisend_pending_deep_link");
    } catch { /* storage unavailable */ }
  },

  /**
   * Read a pending deep-link destination (session-scoped).
   */
  getPendingDeepLink() {
    try {
      return sessionStorage.getItem("borisend_pending_deep_link")
        || localStorage.getItem("borisend_pending_deep_link")
        || null;
    } catch {
      return null;
    }
  },
};

export default LocalCleanupService;