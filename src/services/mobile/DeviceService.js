/**
 * DeviceService — Device Information Abstraction
 *
 * Provides device and app metadata through a unified interface
 * regardless of platform.
 */

import PlatformService from "./PlatformService";

let _DevicePlugin = null;
let _AppPlugin = null;

async function _getDevicePlugin() {
  if (_DevicePlugin) return _DevicePlugin;
  try {
    const mod = await import("@capacitor/device");
    _DevicePlugin = mod.Device;
  } catch {
    _DevicePlugin = null;
  }
  return _DevicePlugin;
}

async function _getAppPlugin() {
  if (_AppPlugin) return _AppPlugin;
  try {
    const mod = await import("@capacitor/app");
    _AppPlugin = mod.App;
  } catch {
    _AppPlugin = null;
  }
  return _AppPlugin;
}

const DeviceService = {
  /**
   * Get device hardware/OS information.
   * Returns { platform, model, osVersion, manufacturer }
   */
  async getDeviceInfo() {
    if (PlatformService.isNative()) {
      const Device = await _getDevicePlugin();
      if (Device) {
        try {
          const info = await Device.getInfo();
          return {
            platform: info.platform,
            model: info.model,
            osVersion: info.osVersion,
            manufacturer: info.manufacturer,
          };
        } catch (e) {
          console.error("[DeviceService] Native getDeviceInfo failed:", e);
        }
      }
    }

    // Web/PWA fallback
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (/Edg/.test(ua)) browser = "Edge";
    else if (/Chrome/.test(ua)) browser = "Chrome";
    else if (/Safari/.test(ua)) browser = "Safari";
    else if (/Firefox/.test(ua)) browser = "Firefox";

    return {
      platform: "web",
      model: browser,
      osVersion: ua,
      manufacturer: "Web",
    };
  },

  /**
   * Get app version and build number.
   * Returns { version, build }
   */
  async getAppInfo() {
    if (PlatformService.isNative()) {
      const App = await _getAppPlugin();
      if (App) {
        try {
          const info = await App.getInfo();
          return { version: info.version, build: info.build };
        } catch (e) {
          console.error("[DeviceService] Native getAppInfo failed:", e);
        }
      }
    }

    return { version: "web", build: "web" };
  },

  /**
   * Get battery level (0.0 – 1.0), or null if unavailable.
   */
  async getBatteryLevel() {
    if (PlatformService.isNative()) {
      // TODO: Capacitor Battery plugin
      return null;
    }

    if (navigator.getBattery) {
      try {
        const battery = await navigator.getBattery();
        return battery.level;
      } catch {
        return null;
      }
    }

    return null;
  },

  /**
   * Get the current device language code (e.g. 'en', 'es').
   */
  getLanguage() {
    return (navigator.language || "en").split("-")[0];
  },
};

export default DeviceService;