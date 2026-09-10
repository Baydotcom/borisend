/**
 * GeofenceService — Native Geofence Abstraction Layer
 *
 * RC20 — isolates platform-specific geofence behaviour from React UI.
 *
 * The application must never call native geofence/location APIs directly.
 * All geofence operations go through this service.
 *
 * NATIVE PLUGIN: This service uses registerPlugin("Geofence") — a custom
 * Capacitor local plugin whose native source (iOS CLCircularRegion /
 * Android GeofencingClient) MUST be written in the generated ios/ and
 * android/ projects. Until that native source exists, all methods report
 * { supported: false }. See docs/NATIVE_BUILD_AND_DEVICE_QA.md §10-12.
 *
 * PRIVACY / BATTERY RULES (RC20 Part 11):
 *   - NO continuous GPS polling
 *   - NO continuous location-history storage
 *   - NO route tracking
 *   - NO periodic location upload
 *   - Uses OS geofence/region-transition mechanisms only
 *   - Stores only configured geofence definitions + transition events
 *
 * iOS:  CLLocationManager + CLCircularRegion (20 monitored regions max)
 * Android: LocationServices GeofencingClient (100 geofences max)
 */

import PlatformService from "./PlatformService";

const GEOFENCE_LIMIT_IOS = 20;
const GEOFENCE_LIMIT_ANDROID = 100;

// ── Capacitor Geofence plugin lazy-loader ──
let _GeofencePlugin = null;

async function _getGeofencePlugin() {
  if (_GeofencePlugin) return _GeofencePlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    _GeofencePlugin = registerPlugin("Geofence");
  } catch {
    _GeofencePlugin = null;
  }
  return _GeofencePlugin;
}

const GeofenceService = {
  /**
   * Whether native geofencing is supported on this platform build.
   * Returns false until the native Geofence plugin source is present.
   */
  async isSupported() {
    if (!PlatformService.isNative()) return false;
    const plugin = await _getGeofencePlugin();
    if (!plugin) return false;
    // registerPlugin() returns a JS proxy even when the native implementation
    // is missing. Probe a harmless method so unsupported store builds are not
    // falsely reported as geofence-capable.
    try {
      const result = await plugin.checkPermission();
      return !!result;
    } catch {
      return false;
    }
  },

  /**
   * Maximum number of simultaneously monitored geofences for this platform.
   * iOS = 20 (CLCircularRegion), Android = 100.
   */
  getGeofenceLimit() {
    if (PlatformService.isIOS()) return GEOFENCE_LIMIT_IOS;
    if (PlatformService.isAndroid()) return GEOFENCE_LIMIT_ANDROID;
    return 0;
  },

  /**
   * Check current location permission status.
   * Returns 'granted' | 'denied' | 'prompt' | 'not_supported'.
   */
  async checkPermission() {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return "not_supported";
    try {
      const result = await plugin.checkPermission();
      return result?.status || "not_supported";
    } catch {
      return "not_supported";
    }
  },

  /**
   * Request location permission (contextually — never at app startup).
   * On iOS this requests Always authorization (region monitoring requires it).
   * On Android this requests ACCESS_FINE_LOCATION (+ background if needed).
   */
  async requestPermission() {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return "not_supported";
    try {
      const result = await plugin.requestPermission();
      return result?.status || "denied";
    } catch (e) {
      console.error("[GeofenceService] Permission request failed:", e);
      return "denied";
    }
  },

  /**
   * Open the system settings screen (for permanently-denied permission recovery).
   */
  async openSettings() {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return false;
    try {
      await plugin.openSettings();
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Register a geofence for a Smart Message.
   * @param {object} geofence — { id, latitude, longitude, radiusMeters, transitionType }
   *   transitionType: 'enter' (arrival) | 'exit' (departure)
   * Returns { success, supported, error? }
   */
  async register(geofence) {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return { success: false, supported: false, error: "Native geofence plugin not available" };

    // Validate radius
    const radius = Number(geofence?.radiusMeters);
    if (!radius || radius < 50 || radius > 1000) {
      return { success: false, supported: true, error: "Radius must be between 50 and 1000 metres" };
    }
    if (typeof geofence?.latitude !== "number" || typeof geofence?.longitude !== "number") {
      return { success: false, supported: true, error: "Coordinates are required" };
    }

    try {
      await plugin.addGeofence({
        id: geofence.id,
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        radius: radius,
        transitionType: geofence.transitionType, // 'enter' | 'exit'
        notifyOnEntry: geofence.transitionType === "enter",
        notifyOnExit: geofence.transitionType === "exit",
      });
      return { success: true, supported: true };
    } catch (e) {
      console.error("[GeofenceService] Register failed:", e);
      return { success: false, supported: true, error: e.message || "Registration failed" };
    }
  },

  /**
   * Remove a registered geofence.
   */
  async unregister(geofenceId) {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return { success: false, supported: false };
    try {
      await plugin.removeGeofence({ id: geofenceId });
      return { success: true, supported: true };
    } catch (e) {
      console.error("[GeofenceService] Unregister failed:", e);
      return { success: false, supported: true, error: e.message };
    }
  },

  /**
   * Remove ALL BoriSend-registered geofences (deterministic prefix
   * `borisend_sm_`). Used on sign-out, account deletion, and as the first
   * step of reconcile (stale cleanup) — so a signed-out/deleted account or
   * a deleted/deactivated/edited Smart Message cannot leave an orphaned
   * native geofence generating actions. Safe no-op if the native plugin is
   * unavailable (web/preview). RC20.2 Part 11/12.
   */
  async unregisterAll() {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return { success: false, supported: false };
    try {
      await plugin.removeAllGeofences();
      return { success: true, supported: true };
    } catch (e) {
      console.error("[GeofenceService] unregisterAll failed:", e);
      return { success: false, supported: true, error: e.message };
    }
  },

  /**
   * Reconcile active geofence registrations with the user's active location
   * Smart Messages. Called on app launch / resume to restore registrations
   * the OS may have dropped.
   *
   * RC20.2: performs deterministic stale-cleanup FIRST (unregisterAll) then
   * re-registers the current active set. This handles deletion, deactivation,
   * config change, and trigger-type change in one pass without needing a
   * native getRegisteredIds() call — stale registrations are removed before
   * the current set is registered.
   * @param {Array} smartMessages — active location Smart Messages
   */
  async reconcile(smartMessages) {
    const supported = await this.isSupported();
    if (!supported) return { success: false, supported: false, registered: 0 };

    // Stale cleanup — remove every BoriSend geofence before re-registering
    // the current set. Deterministic; no orphaned geofences survive.
    await this.unregisterAll();

    const limit = this.getGeofenceLimit();
    const locationSms = smartMessages.filter(
      sm => sm.trigger_type === "location_arrival" || sm.trigger_type === "location_departure",
    );

    // Enforce native geofence limit — never silently exceed
    const toRegister = locationSms.slice(0, limit);
    const exceeded = locationSms.length - toRegister.length;

    let registered = 0;
    for (const sm of toRegister) {
      const cfg = sm.trigger_config || {};
      if (typeof cfg.location_latitude !== "number" || typeof cfg.location_longitude !== "number") continue;
      const transitionType = sm.trigger_type === "location_arrival" ? "enter" : "exit";
      const result = await this.register({
        id: `borisend_sm_${sm.id}`,
        latitude: cfg.location_latitude,
        longitude: cfg.location_longitude,
        radiusMeters: cfg.location_radius_meters || 200,
        transitionType,
      });
      if (result.success) registered++;
    }

    return { success: true, supported: true, registered, limit, exceeded };
  },

  /**
   * Register a callback for geofence transition events (enter/exit).
   * The native layer fires this when the OS detects a transition — even if
   * the app is in the background. The callback forwards the event to the
   * secure backend (processGeofenceEvent).
   */
  async onTransition(callback) {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return () => {};
    try {
      return await plugin.addListener("geofenceTransition", (event) => {
        try {
          callback(event);
        } catch (e) {
          console.error("[GeofenceService] Transition callback error:", e);
        }
      });
    } catch {
      return () => {};
    }
  },

  /**
   * POC-only: return native transitions captured while the WebView was not
   * available. Events remain queued until ackPendingTransition succeeds.
   */
  async getPendingTransitions() {
    const plugin = await _getGeofencePlugin();
    if (!plugin) return [];
    try {
      const result = await plugin.getPendingTransitions();
      return Array.isArray(result?.events) ? result.events : [];
    } catch {
      return [];
    }
  },

  /** POC-only: acknowledge one queued native transition after backend success. */
  async ackPendingTransition(eventId) {
    if (!eventId) return false;
    const plugin = await _getGeofencePlugin();
    if (!plugin) return false;
    try {
      await plugin.ackPendingTransition({ event_id: eventId });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Get the device's current location once (for the "Use my current location"
   * button in the location picker). This is a ONE-SHOT read — not continuous
   * tracking. No continuous polling, route tracking, or location-history
   * storage is ever performed.
   *
   * RC20.1.1: Uses @capacitor/geolocation (6.1.1, Capacitor 6 compatible).
   * Lazy-loaded via dynamic import so the plugin never enters the web bundle
   * until the user taps the button. On web/Browser the plugin falls back to
   * the browser geolocation API; on native it uses the OS location service.
   *
   * Permission is requested ONLY here (never at app startup). Returns a
   * concise customer-facing message on denied / unavailable / timeout.
   */
  async getCurrentLocation() {
    let Geolocation;
    try {
      // const declaration (not bare destructuring assignment — ESM strict mode
      // would throw ReferenceError on an undeclared target otherwise).
      const mod = await import("@capacitor/geolocation");
      Geolocation = mod.Geolocation;
    } catch {
      return {
        supported: false,
        error: "Location isn't available on this device. Search for a place instead.",
      };
    }

    try {
      // Request permission only because the user tapped the button.
      const perm = await Geolocation.requestPermissions();
      const granted = perm?.location === "granted" || perm?.coarseLocation === "granted";
      if (!granted) {
        return {
          supported: false,
          error: "Location permission was denied. Search for a place instead.",
        };
      }

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 60000,
      });
      const lat = pos?.coords?.latitude;
      const lon = pos?.coords?.longitude;
      if (typeof lat !== "number" || typeof lon !== "number") {
        return {
          supported: false,
          error: "Your current location isn't available right now. Try again or search for a place.",
        };
      }
      return { supported: true, latitude: lat, longitude: lon };
    } catch (e) {
      const msg = String((e && (e.message || e)) || "");
      if (/denied|permission/i.test(msg)) {
        return {
          supported: false,
          error: "Location permission was denied. Search for a place instead.",
        };
      }
      if (/timeout/i.test(msg)) {
        return {
          supported: false,
          error: "Finding your location took too long. Try again or search for a place.",
        };
      }
      if (/unavailable|position/i.test(msg)) {
        return {
          supported: false,
          error: "Your current location isn't available right now. Try again or search for a place.",
        };
      }
      return {
        supported: false,
        error: "Your current location isn't available right now. Try again or search for a place.",
      };
    }
  },
};

export default GeofenceService;