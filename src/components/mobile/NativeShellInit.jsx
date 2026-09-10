import { useEffect } from "react";
import PlatformService from "@/services/mobile/PlatformService";

/**
 * NativeShellInit — RC20 Part 22/23/24
 *
 * Applies native shell configuration on app launch:
 *   - SplashScreen: hide once React is ready (continuous transition from the
 *     OS-controlled Magenta splash to the JS StartupScreen).
 *   - StatusBar: light icons over Magenta splash; adapt to dark mode.
 *   - ScreenOrientation: lock to portrait (native launch policy).
 *
 * No-ops on web/PWA. Uses registerPlugin from @capacitor/core (already a dep)
 * so the @capacitor/splash-screen, status-bar and screen-orientation JS
 * packages are NOT pulled into the web bundle — their native registration is
 * handled by `npx cap sync`. All calls are guarded so a missing native plugin
 * never breaks the web build.
 *
 * Mounted once at the app root (inside App, outside the auth gate).
 */
export default function NativeShellInit() {
  useEffect(() => {
    if (!PlatformService.isNative()) return;

    (async () => {
      let registerPlugin;
      try {
        const core = await import("@capacitor/core");
        registerPlugin = core.registerPlugin;
      } catch { return; /* @capacitor/core unavailable */ }
      if (!registerPlugin) return;

      // SplashScreen — hide once the app shell is ready
      try {
        const SplashScreen = registerPlugin("SplashScreen");
        await SplashScreen.hide().catch(() => {});
      } catch { /* plugin unavailable */ }

      // StatusBar — light style over Magenta; adapt to dark mode
      try {
        const StatusBar = registerPlugin("StatusBar");
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        await StatusBar.setStyle({ style: "LIGHT" }).catch(() => {});
        await StatusBar.setBackgroundColor({ color: "#DA1B8A" }).catch(() => {});
      } catch { /* plugin unavailable */ }

      // ScreenOrientation — portrait-first launch
      try {
        const ScreenOrientation = registerPlugin("ScreenOrientation");
        await ScreenOrientation.lock({ orientation: "portrait" }).catch(() => {});
      } catch { /* plugin unavailable */ }
    })();
  }, []);

  return null;
}