/**
 * PermissionService — Permission Abstraction Layer
 *
 * Centralizes all permission requests so the app never calls
 * native permission APIs directly.
 *
 * Supported permission types:
 *   'notifications' — Push/local notification permission
 *   'sms'           — SEND_SMS permission (Android only)
 *
 * Sprint 8: Full native implementation using Capacitor plugins.
 */

import PlatformService from "./PlatformService";

// ── Capacitor plugin lazy-loaders ──

let _PushPlugin = null;
let _AppPlugin = null;

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

async function _getAppPlugin() {
  if (_AppPlugin) return _AppPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const mod = await import("@capacitor/app");
    _AppPlugin = mod.App;
  } catch {
    _AppPlugin = null;
  }
  return _AppPlugin;
}

let _SmsPlugin = null;

async function _getSmsPlugin() {
  if (_SmsPlugin) return _SmsPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    _SmsPlugin = registerPlugin("Sms");
  } catch {
    _SmsPlugin = null;
  }
  return _SmsPlugin;
}

const PermissionService = {
  /**
   * Request a permission by type.
   * @param {'notifications' | 'sms'} type
   * @returns {Promise<'granted' | 'denied' | 'prompt' | 'not_applicable' | 'not_supported'>}
   */
  async request(type) {
    switch (type) {
      case "notifications":
        return this._requestNotifications();
      case "sms":
        // Store launch is user-assisted; BoriSend does not request SEND_SMS.
        return "not_applicable";
      case "contacts":
        return this._requestContacts();
      default:
        return "not_supported";
    }
  },

  /**
   * Check current permission status.
   * @param {'notifications' | 'sms'} type
   */
  async check(type) {
    switch (type) {
      case "notifications":
        return this._checkNotifications();
      case "sms":
        return "not_applicable";
      case "contacts":
        return this._checkContacts();
      default:
        return "not_supported";
    }
  },

  /**
   * Check if a permission has been permanently denied.
   * On Android, this means the user selected "Don't ask again".
   * On iOS, this means the user denied and must go to Settings.
   * @param {'notifications' | 'sms'} type
   */
  async isPermanentlyDenied(type) {
    const status = await this.check(type);
    if (status === "denied" && PlatformService.isNative()) {
      // On native, 'denied' after a request means permanently denied
      // (Capacitor won't show the prompt again)
      return true;
    }
    return false;
  },

  /**
   * Get a human-readable rationale for why a permission is needed.
   * @param {'notifications' | 'sms'} type
   */
  getRationale(type) {
    switch (type) {
      case "notifications":
        return "BoriSend needs notification permission to alert you when messages are ready for approval or have been sent.";
      case "sms":
        return "BoriSend opens your messaging app with the message prepared. You review it and tap Send yourself.";
      case "contacts":
        return "Choose contacts from your phone to add to BoriSend. You select who to import — BoriSend does not access your full address book.";
      default:
        return "";
    }
  },

  // ── Notifications ──

  async _requestNotifications() {
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
        console.error("[PermissionService] Notification request failed:", e);
        return "denied";
      }
    }

    if (typeof Notification !== "undefined") {
      return await Notification.requestPermission();
    }

    return "not_supported";
  },

  async _checkNotifications() {
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

  // ── Contacts (Native plugin + W3C Contact Picker API) ──
  // RC18.2.2 §18: ContactImportService is the platform router.
  // Native (iOS/Android): @capacitor-community/contacts — checkPermissions/requestPermissions.
  // W3C (Chrome Android web): No persistent permission — prompts on each select().

  async _requestContacts() {
    if (PlatformService.isNative()) {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        const Contacts = registerPlugin("Contacts");
        const status = await Contacts.requestPermissions();
        return status.contacts || "not_supported";
      } catch {
        return "not_supported";
      }
    }
    if (typeof navigator !== "undefined" && navigator.contacts && typeof navigator.contacts.select === "function") {
      return "prompt";
    }
    return "not_supported";
  },

  async _checkContacts() {
    if (PlatformService.isNative()) {
      try {
        const { registerPlugin } = await import("@capacitor/core");
        const Contacts = registerPlugin("Contacts");
        const status = await Contacts.checkPermissions();
        return status.contacts || "not_supported";
      } catch {
        return "not_supported";
      }
    }
    if (typeof navigator !== "undefined" && navigator.contacts && typeof navigator.contacts.select === "function") {
      return "prompt";
    }
    return "not_supported";
  },

  // ── SMS (Android only) ──

  async _requestSMS() {
    if (!PlatformService.isAndroid()) {
      return "not_applicable";
    }

    const Sms = await _getSmsPlugin();
    if (!Sms) {
      return "not_supported";
    }

    try {
      const result = await Sms.requestPermission();
      return result?.granted ? "granted" : "denied";
    } catch (e) {
      console.error("[PermissionService] SMS request failed:", e);
      return "denied";
    }
  },

  async _checkSMS() {
    if (!PlatformService.isAndroid()) {
      return "not_applicable";
    }

    const Sms = await _getSmsPlugin();
    if (!Sms) {
      return "not_supported";
    }

    try {
      const result = await Sms.checkPermission();
      return result?.granted ? "granted" : "denied";
    } catch (e) {
      console.error("[PermissionService] SMS check failed:", e);
      return "denied";
    }
  },

  /**
   * Open the device's native app settings page.
   * Useful when permission was permanently denied and the user needs to enable it manually.
   */
  async openSettings() {
    if (PlatformService.isNative()) {
      const App = await _getAppPlugin();
      if (App && App.openSettings) {
        try {
          await App.openSettings();
          return true;
        } catch (e) {
          console.error("[PermissionService] Open settings failed:", e);
          return false;
        }
      }
    }
    return false;
  },
};

export default PermissionService;