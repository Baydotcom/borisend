/**
 * SMSService — SMS Abstraction Layer
 *
 * The application must never call native SMS functionality directly.
 * All SMS operations go through this service.
 *
 * PLATFORM BEHAVIOR:
 *   Android (with SEND_SMS permission):  Automatic, unattended sending
 *   iOS:                                  Always manual (opens Messages app)
 *   Web:                                  Always manual (opens sms: URL)
 *
 * Sprint 8: Android sendAuto() implemented via Capacitor SMS plugin.
 * The plugin is loaded dynamically — if not present (web, or native build
 * without the plugin), it gracefully falls back to manual sending.
 *
 * SMS PROVIDER INTERFACE:
 *   send(phone, message, options)         → Send SMS (auto or manual based on mode)
 *   sendAuto(phone, message)              → Unattended send (Android only)
 *   sendManual(phone, message)            → Opens native SMS app with pre-filled body
 *   requestPermission()                   → Request SEND_SMS (Android)
 *   hasPermission()                       → Check SEND_SMS status (Android)
 *   isAutoSendSupported()                 → True if platform supports unattended sending
 *   getPreferredMode()                    → 'auto' | 'manual' for current platform
 *   onDelivery(callback)                  → Register delivery confirmation callback
 *   onFailure(callback)                   → Register failure callback
 *   onRetry(callback)                     → Register retry callback
 */

import PlatformService from "./PlatformService";

const _deliveryCallbacks = [];
const _failureCallbacks = [];
const _retryCallbacks = [];

// ── Capacitor SMS plugin lazy-loader ──
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

function _notifyDelivery(payload) {
  _deliveryCallbacks.forEach((cb) => {
    try { cb(payload); } catch (e) { console.error("[SMSService] Delivery callback error:", e); }
  });
}

function _notifyFailure(payload) {
  _failureCallbacks.forEach((cb) => {
    try { cb(payload); } catch (e) { console.error("[SMSService] Failure callback error:", e); }
  });
}

function _notifyRetry(payload) {
  _retryCallbacks.forEach((cb) => {
    try { cb(payload); } catch (e) { console.error("[SMSService] Retry callback error:", e); }
  });
}

const SMSService = {
  /**
   * Send an SMS message.
   * Automatically selects the right method based on platform and mode.
   */
  async send(phone, message, options = {}) {
    const mode = options.mode || this.getPreferredMode();

    if (mode === "auto" && this.isAutoSendSupported()) {
      return this.sendAuto(phone, message);
    }

    return this.sendManual(phone, message);
  },

  /**
   * Send SMS automatically (unattended).
   * Only supported on Android with SEND_SMS permission.
   *
   * Sprint 8: Implemented with Capacitor SMS plugin (dynamic import).
   * Falls back to manual if:
   *   - Not Android
   *   - Plugin not available
   *   - Permission denied
   */
  async sendAuto(phone, message) {
    if (!PlatformService.isAndroid()) {
      // iOS and Web cannot send unattended — fall back to manual
      return this.sendManual(phone, message);
    }

    const Sms = await _getSmsPlugin();
    if (!Sms) {
      console.info("[SMSService] SMS plugin not available — falling back to manual");
      return this.sendManual(phone, message);
    }

    // Check permission
    let permStatus = await this.hasPermission();
    if (permStatus === "not_applicable" || permStatus === "not_implemented") {
      return this.sendManual(phone, message);
    }

    if (permStatus !== "granted") {
      // Try requesting permission
      permStatus = await this.requestPermission();
      if (permStatus !== "granted") {
        // Permission denied — fall back to manual with a note
        _notifyFailure({ phone, message, error: "SMS permission denied", code: "PERMISSION_DENIED" });
        return this.sendManual(phone, message);
      }
    }

    // Attempt to send
    try {
      const result = await Sms.send({
        phone,
        message,
        retry: true,
      });

      if (result && result.success) {
        _notifyDelivery({
          phone,
          message,
          status: "delivered",
          messageId: result.messageId || null,
        });
        return { success: true, method: "auto", messageId: result.messageId };
      } else {
        // Plugin reported failure — attempt retry
        _notifyFailure({
          phone,
          message,
          error: result?.error || "Send failed",
          code: result?.code || "SEND_FAILED",
        });
        return { success: false, method: "auto", error: result?.error || "Send failed" };
      }
    } catch (e) {
      // Determine if this is a retryable error
      const isRetryable = e.code === "RETRY" || e.code === "TIMEOUT" || e.code === "SERVICE_ERROR";

      if (isRetryable) {
        _notifyRetry({ phone, message, error: e.message, code: e.code });
      }

      _notifyFailure({
        phone,
        message,
        error: e.message || "SMS send exception",
        code: e.code || "EXCEPTION",
      });

      return { success: false, method: "auto", error: e.message || "SMS send failed" };
    }
  },

  /**
   * Open the native SMS app with pre-filled content.
   * Works on all platforms. User must tap "Send" manually.
   */
  async sendManual(phone, message) {
    const encodedBody = encodeURIComponent(message);

    // iOS uses & for body parameter, others use ?
    if (PlatformService.isIOS()) {
      window.location.href = `sms:${phone}&body=${encodedBody}`;
    } else {
      window.location.href = `sms:${phone}?body=${encodedBody}`;
    }

    return { success: true, method: "manual" };
  },

  /**
   * Request SMS permission (Android only).
   * Returns 'granted' | 'denied' | 'not_applicable' | 'not_supported'
   */
  async requestPermission() {
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
      console.error("[SMSService] Permission request failed:", e);
      return "denied";
    }
  },

  /**
   * Check SMS permission status (Android only).
   * Returns 'granted' | 'denied' | 'not_applicable' | 'not_supported'
   */
  async hasPermission() {
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
      console.error("[SMSService] Permission check failed:", e);
      return "denied";
    }
  },

  /**
   * Check if automatic (unattended) SMS sending is supported.
   * Only Android with SMS plugin and SEND_SMS permission can do this.
   */
  isAutoSendSupported() {
    // Launch policy: BoriSend is user-assisted on both Android and iOS.
    // Keep the dormant native implementation for future use, but never expose
    // unattended sending as supported in the current store release.
    return false;
  },

  /**
   * Get the preferred send mode for the current platform.
   * Android: 'auto' (if permission will be available)
   * iOS:     always 'manual' (notification-assisted, never unattended)
   * Web:     always 'manual'
   */
  getPreferredMode() {
    // RC20 Part 15: User-assisted SMS on BOTH iOS and Android is the launch
    // model. Auto-send is disabled at launch (no SEND_SMS permission, no
    // Google Play policy risk). The sendAuto() path is preserved for a future
    // product decision but is NOT selected here until explicitly re-enabled.
    return "manual";
  },

  // ── Callbacks ──

  /**
   * Register a delivery confirmation callback.
   * Called when the native SMS plugin confirms delivery.
   */
  onDelivery(callback) {
    _deliveryCallbacks.push(callback);
  },

  /**
   * Register a failure callback.
   * Called when the native SMS plugin reports a send failure.
   */
  onFailure(callback) {
    _failureCallbacks.push(callback);
  },

  /**
   * Register a retry callback.
   * Called when the system automatically retries a failed send.
   */
  onRetry(callback) {
    _retryCallbacks.push(callback);
  },
};

export default SMSService;