/**
 * LifecycleService — Centralized App Lifecycle Management
 *
 * One service handles ALL lifecycle events:
 *   launch              — App started
 *   resume              — App came to foreground
 *   background          — App went to background
 *   terminate           — App is being killed (native only)
 *   notificationOpened  — User tapped a push notification
 *   notificationDismissed — User dismissed a push notification
 *   deepLinkOpened      — App opened via deep link URL
 *   networkRestored     — Network connection came back online
 *
 * Sprint 8: Added notificationDismissed, relaunch from notification,
 * and restored-from-background events.
 *
 * Other services and components subscribe via .on(event, callback).
 * The service returns an unsubscribe function.
 */

import PlatformService from "./PlatformService";

let _appPlugin = null;

async function _getAppPlugin() {
  if (_appPlugin) return _appPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const mod = await import("@capacitor/app");
    _appPlugin = mod.App;
  } catch {
    _appPlugin = null;
  }
  return _appPlugin;
}

const _listeners = {
  launch: [],
  resume: [],
  background: [],
  terminate: [],
  notificationOpened: [],
  notificationDismissed: [],
  deepLinkOpened: [],
  networkRestored: [],
};

const LifecycleService = {
  _initialized: false,
  _lastState: null,

  /**
   * Initialize lifecycle listeners.
   * Called once at app startup (by DeepLinkHandler component).
   */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    // App launch
    this._emit("launch", { timestamp: Date.now() });

    // ── Visibility / Resume / Background ──
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        this._emit("resume", { source: "visibility" });
      } else {
        this._emit("background", { source: "visibility" });
      }
    });

    window.addEventListener("focus", () => {
      this._emit("resume", { source: "focus" });
    });

    window.addEventListener("blur", () => {
      this._emit("background", { source: "blur" });
    });

    // ── Network ──
    window.addEventListener("online", () => {
      this._emit("networkRestored", {});
    });

    // ── Page lifecycle (beforeunload ≈ terminate) ──
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) {
        this._emit("background", { source: "pagehide" });
      } else {
        this._emit("terminate", { source: "pagehide" });
      }
    });

    // ── Capacitor native lifecycle ──
    if (PlatformService.isNative()) {
      _getAppPlugin().then((App) => {
        if (!App) return;

        // App state change (foreground ↔ background)
        App.addListener("appStateChange", (state) => {
          if (state.isActive) {
            this._emit("resume", { source: "native" });
          } else {
            this._emit("background", { source: "native" });
          }
        });

        // Deep link: app opened via URL scheme
        App.addListener("appUrlOpen", (data) => {
          if (data.url) {
            this._emit("deepLinkOpened", { url: data.url, source: "native" });
          }
        });

        // Back button (Android) — navigate back in history, or exit if at root
        App.addListener("backButton", () => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            App.exitApp();
          }
        });

        // App relaunch — check if launched from notification
        App.getLaunchUrl().then((result) => {
          if (result && result.url) {
            this._emit("deepLinkOpened", { url: result.url, source: "launch" });
          }
        }).catch(() => {
          // getLaunchUrl not available on all platforms
        });
      });
    }
  },

  /**
   * Subscribe to a lifecycle event.
   * @param {string} event — one of the event names listed above
   * @param {Function} callback — called when the event fires
   * @returns {Function} — unsubscribe function
   */
  on(event, callback) {
    if (!_listeners[event]) {
      console.warn(`[Lifecycle] Unknown event: ${event}`);
      return () => {};
    }
    _listeners[event].push(callback);
    return () => {
      _listeners[event] = _listeners[event].filter((cb) => cb !== callback);
    };
  },

  /**
   * Emit a lifecycle event to all subscribers.
   * @param {string} event
   * @param {object} data
   */
  _emit(event, data) {
    (_listeners[event] || []).forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Lifecycle] Error in "${event}" handler:`, err);
      }
    });
  },

  /**
   * Manually emit a notification-opened event.
   * Called by NotificationService when a push notification is tapped.
   */
  emitNotificationOpened(payload) {
    this._emit("notificationOpened", payload);
  },

  /**
   * Manually emit a notification-dismissed event.
   * Called by NotificationService when a push notification is dismissed.
   */
  emitNotificationDismissed(payload) {
    this._emit("notificationDismissed", payload);
  },

  /**
   * Manually emit a deep-link-opened event.
   * Can be called from anywhere to trigger deep link navigation.
   */
  emitDeepLinkOpened(url) {
    this._emit("deepLinkOpened", { url });
  },
};

export default LifecycleService;