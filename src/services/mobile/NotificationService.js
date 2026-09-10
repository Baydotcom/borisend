/**
 * NotificationService — Push & Local Notification Abstraction
 *
 * Sprint 8: Full native implementation using @capacitor/push-notifications.
 * Browser notifications remain for Web/PWA.
 *
 * NOTIFICATION CATEGORIES:
 *   message_ready       — A new message has been generated
 *   awaiting_approval   — A message needs user approval before sending
 *   message_sent        — A message was successfully sent
 *   failed_message      — A message failed to send
 *   subscription        — Subscription updates and quota warnings
 *   system              — Important system announcements
 *
 * DEEP-LINK PAYLOAD STRUCTURE (carried in every push notification):
 *   {
 *     deep_link: "borisend://message/abc123",
 *     type: "message_ready",
 *     message_id: "abc123",
 *     campaign_id: "xyz789",
 *     recipient_name: "Sarah"
 *   }
 */

import PlatformService from "./PlatformService";
import LifecycleService from "./LifecycleService";
import DeviceService from "./DeviceService";

const TOKEN_STORAGE_KEY = "borisend_device_token";

const CATEGORIES = {
  message_ready: { label: "Message Ready", desc: "When a new message is generated", defaultEnabled: true },
  awaiting_approval: { label: "Awaiting Approval", desc: "When a message needs your approval", defaultEnabled: true },
  message_sent: { label: "Message Sent", desc: "When a message has been sent", defaultEnabled: true },
  failed_message: { label: "Failed Message", desc: "When a message fails to send", defaultEnabled: true },
  subscription: { label: "Subscription", desc: "Subscription updates and quota warnings", defaultEnabled: true },
  system: { label: "System", desc: "Important system announcements", defaultEnabled: true },
};

// ── Capacitor plugin lazy-loader ──

let _PushPlugin = null;

async function _getPushPlugin() {
  if (_PushPlugin) return _PushPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const mod = await import("@capacitor/push-notifications");
    _PushPlugin = mod.PushNotifications;
  } catch {
    _PushPlugin = null;
  }
  return _PushPlugin;
}

const NotificationService = {
  _pushInitialized: false,

  /**
   * Request notification permission from the user.
   * Returns 'granted' | 'denied' | 'prompt' | 'not_supported'
   */
  async requestPermission() {
    if (PlatformService.isNative()) {
      const Push = await _getPushPlugin();
      if (!Push) return "not_supported";

      try {
        let permStatus = await Push.checkPermissions();
        if (permStatus.receive === "prompt") {
          permStatus = await Push.requestPermissions();
        }
        return permStatus.receive === "granted" ? "granted" : "denied";
      } catch (e) {
        console.error("[NotificationService] Permission request failed:", e);
        return "denied";
      }
    }

    if (typeof Notification !== "undefined") {
      return await Notification.requestPermission();
    }

    return "not_supported";
  },

  /**
   * Get current permission status.
   */
  async getPermissionStatus() {
    if (PlatformService.isNative()) {
      const Push = await _getPushPlugin();
      if (!Push) return "not_supported";

      try {
        const permStatus = await Push.checkPermissions();
        return permStatus.receive;
      } catch {
        return "not_supported";
      }
    }

    if (typeof Notification !== "undefined") {
      return Notification.permission;
    }

    return "not_supported";
  },

  /**
   * Register for push notifications and obtain a device token.
   *
   * On Android: uses Firebase Cloud Messaging (FCM).
   * On iOS: uses Apple Push Notification service (APNs).
   *
   * Returns { success, token?, error? }
   */
  async registerForPush() {
    if (!PlatformService.isNative()) {
      return { success: false, error: "Push notifications not supported on web" };
    }

    const Push = await _getPushPlugin();
    if (!Push) {
      return { success: false, error: "Push notifications plugin not available" };
    }

    try {
      // Request permission first
      let permStatus = await Push.checkPermissions();
      if (permStatus.receive === "prompt") {
        permStatus = await Push.requestPermissions();
      }
      if (permStatus.receive !== "granted") {
        return { success: false, error: "Notification permission not granted" };
      }

      // Set up listeners (only once)
      if (!this._pushInitialized) {
        this._pushInitialized = true;

        // Token registration event
        Push.addListener("registration", (data) => {
          console.info("[NotificationService] Push token received");
          this._storeToken(data.value);
          this._persistTokenToServer(data.value);
        });

        // Token refresh — FCM/APNs may issue a new token
        Push.addListener("registrationError", (err) => {
          console.error("[NotificationService] Registration error:", err);
        });

        // Foreground notification received
        Push.addListener("pushNotificationReceived", (notification) => {
          console.info("[NotificationService] Foreground notification:", notification.title);
          this._handleForegroundNotification(notification);
        });

        // Notification opened by user tap
        Push.addListener("pushNotificationActionPerformed", (action) => {
          console.info("[NotificationService] Notification opened:", action.actionId);
          this._handleNotificationOpen(action);
        });
      }

      // Register with FCM/APNs
      await Push.register();

      return { success: true };
    } catch (e) {
      console.error("[NotificationService] Registration failed:", e);
      return { success: false, error: e.message || "Registration failed" };
    }
  },

  /**
   * Unregister from push notifications.
   */
  async unregisterFromPush() {
    if (!PlatformService.isNative()) return false;

    const Push = await _getPushPlugin();
    if (!Push) return false;

    try {
      await Push.unregister();
      const token = this.getDeviceToken();
      if (token) {
        await this._deactivateTokenOnServer(token);
      }
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return true;
    } catch (e) {
      console.error("[NotificationService] Unregister failed:", e);
      return false;
    }
  },

  /**
   * Get the locally stored device token.
   */
  getDeviceToken() {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  },

  /**
   * Store device token locally.
   */
  _storeToken(token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  },

  /**
   * Persist token to server via DeviceToken entity.
   * Handles: first registration, token refresh, device replacement, duplicate prevention.
   */
  async _persistTokenToServer(token) {
    try {
      const { base44 } = await import("@/api/base44Client");

      // Check for existing token (duplicate prevention)
      const existing = await base44.entities.DeviceToken.filter({ token });
      if (existing && existing.length > 0) {
        // Token already registered — update last_seen_at
        await base44.entities.DeviceToken.update(existing[0].id, {
          is_active: true,
          last_seen_at: new Date().toISOString()
        });
        return;
      }

      // New token — gather device info
      const platform = PlatformService.getPlatform();
      const deviceInfo = await DeviceService.getDeviceInfo();
      const appInfo = await DeviceService.getAppInfo();

      await base44.entities.DeviceToken.create({
        token,
        platform,
        device_model: deviceInfo.model || "Unknown",
        app_version: appInfo.version || "Unknown",
        operating_system: `${deviceInfo.platform} ${deviceInfo.osVersion}`.trim(),
        is_active: true,
        last_seen_at: new Date().toISOString()
      });
    } catch (e) {
      console.error("[NotificationService] Token persistence failed:", e);
    }
  },

  /**
   * Mark a token as inactive on the server (when user unregisters).
   */
  async _deactivateTokenOnServer(token) {
    try {
      const { base44 } = await import("@/api/base44Client");
      const existing = await base44.entities.DeviceToken.filter({ token });
      if (existing && existing.length > 0) {
        await base44.entities.DeviceToken.update(existing[0].id, {
          is_active: false
        });
      }
    } catch (e) {
      console.error("[NotificationService] Token deactivation failed:", e);
    }
  },

  /**
   * Handle a foreground push notification.
   * Displays a local notification so the user sees it while the app is open.
   */
  _handleForegroundNotification(notification) {
    const title = notification.title || "BoriSend";
    const body = notification.body || "";
    const data = notification.data || {};

    // Use browser Notification API for foreground display
    this.sendLocalNotification(title, body, data);
  },

  /**
   * Handle a notification open action (user tapped notification).
   * Emits a notificationOpened lifecycle event with the deep-link payload.
   */
  _handleNotificationOpen(action) {
    const notification = action.notification || {};
    const data = notification.data || {};

    // Emit lifecycle event — DeepLinkHandler will route via DeepLinkService
    LifecycleService.emitNotificationOpened({
      ...data,
      title: notification.title,
      body: notification.body,
      action_id: action.actionId,
    });
  },

  /**
   * Send a local (in-app) notification.
   * Used for foreground alerts when the app is open.
   *
   * RC20 Part 20: On Capacitor native, the browser Notification API is NOT
   * reliable inside the WebView. Use @capacitor/local-notifications to present
   * a native banner. This avoids duplicate notifications because the remote
   * push plugin only fires `pushNotificationReceived` in the foreground (the
   * OS does not auto-display a banner in foreground), so bridging to a local
   * notification is the single presentation path. On web, fall back to the
   * browser Notification API.
   */
  async sendLocalNotification(title, body, data = {}) {
    if (PlatformService.isNative()) {
      try {
        // RC20: use registerPlugin from @capacitor/core so the
        // @capacitor/local-notifications JS package is not pulled into the web
        // bundle. The native plugin (installed via `npx cap sync`) registers
        // itself under "LocalNotifications" on the bridge.
        const { registerPlugin } = await import("@capacitor/core");
        const LocalNotifications = registerPlugin("LocalNotifications");
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 1000000) + 1,
            title: title || "BoriSend",
            body: body || "",
            extra: data || {},
          }],
        });
        return { success: true };
      } catch (e) {
        console.error("[NotificationService] Native local notification failed:", e);
        return { success: false, error: e.message };
      }
    }

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const notif = new Notification(title, { body, data });
        notif.onclick = () => {
          LifecycleService.emitNotificationOpened(data);
          window.focus();
        };
        return { success: true };
      } catch (e) {
        console.error("[NotificationService] Local notification failed:", e);
        return { success: false, error: e.message };
      }
    }

    return { success: false, error: "Notification permission not granted" };
  },

  /**
   * Get all notification categories with labels and descriptions.
   */
  getCategories() {
    return Object.entries(CATEGORIES).map(([key, config]) => ({
      key,
      label: config.label,
      description: config.desc,
      defaultEnabled: config.defaultEnabled,
    }));
  },

  /**
   * Get default notification preferences (all enabled).
   * Stored on the User entity via base44.auth.updateMe().
   */
  getDefaultPreferences() {
    const prefs = { push_enabled: false };
    Object.entries(CATEGORIES).forEach(([key, config]) => {
      prefs[`notif_${key}`] = config.defaultEnabled;
    });
    return prefs;
  },

  /**
   * Check if a specific notification category is enabled for the user.
   */
  isCategoryEnabled(userPrefs, categoryKey) {
    if (!userPrefs) return true;
    const prefKey = `notif_${categoryKey}`;
    return userPrefs[prefKey] !== false;
  },
};

export default NotificationService;