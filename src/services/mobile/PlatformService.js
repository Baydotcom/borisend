/**
 * PlatformService — Centralized Platform Detection
 *
 * The single source of truth for "what platform am I running on?"
 * No other file should scatter platform detection logic.
 *
 * Detects: Web, PWA, Android (Capacitor), iOS (Capacitor), Desktop
 */

const PlatformService = {
  _cached: null,

  _detect() {
    if (this._cached) return this._cached;

    const win = typeof window !== "undefined" ? window : null;
    const capacitor = win?.Capacitor || null;
    const isCapacitorNative = !!(capacitor?.isNativePlatform && capacitor.isNativePlatform());

    // Base44's current store wrapper is React Native + WebView rather than a
    // Capacitor shell. The generated Android package injects these bridge
    // objects into the web content, so use them as the native-wrapper signal.
    // Ordinary mobile browsers do not expose these objects.
    const isBase44Native = !!(
      win?.wixMobileNativeBridge ||
      win?.__hybrid_bridge ||
      win?.ReactNativeWebView
    );
    const isNative = isCapacitorNative || isBase44Native;

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";

    let platform = "web";
    if (isCapacitorNative && capacitor.getPlatform) {
      platform = capacitor.getPlatform(); // 'android' | 'ios' | 'web'
    } else if (isBase44Native) {
      if (/Android/i.test(ua)) platform = "android";
      else if (/iPhone|iPad|iPod/i.test(ua)) platform = "ios";
    }

    const isStandalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ||
        window.navigator?.standalone === true);

    const isPWA = !isNative && !!isStandalone;

    const isMobileUA = /Android|iPhone|iPad|iPod/i.test(ua);
    const isDesktop = !isMobileUA && !isNative;

    this._cached = { platform, isNative, isPWA, isStandalone, isMobileUA, isDesktop };
    return this._cached;
  },

  /** Returns 'android' | 'ios' | 'web' */
  getPlatform() {
    return this._detect().platform;
  },

  /** True when running as a Capacitor native app on Android */
  isAndroid() {
    return this._detect().platform === "android";
  },

  /** True when running as a Capacitor native app on iOS */
  isIOS() {
    return this._detect().platform === "ios";
  },

  /** True when running inside any Capacitor native shell */
  isNative() {
    return this._detect().isNative;
  },

  /** True when running as an installed PWA (standalone display mode, not native) */
  isPWA() {
    return this._detect().isPWA;
  },

  /** True when running in a regular browser tab (not PWA, not native) */
  isWeb() {
    const d = this._detect();
    return d.platform === "web" && !d.isPWA;
  },

  /** True when running on a desktop browser */
  isDesktop() {
    return this._detect().isDesktop;
  },

  /** True when the device is mobile (native or mobile UA) */
  isMobile() {
    const d = this._detect();
    return d.isNative || d.isMobileUA;
  },

  /** Human-readable platform label for UI display */
  getLabel() {
    if (this.isAndroid()) return "Android";
    if (this.isIOS()) return "iOS";
    if (this.isPWA()) return "PWA";
    if (this.isDesktop()) return "Desktop";
    return "Web";
  },
};

export default PlatformService;