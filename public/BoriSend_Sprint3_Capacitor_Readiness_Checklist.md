# BoriSend — Sprint 3 Capacitor Readiness Checklist

**Date:** 3 July 2026  
**Status:** Architecture Prepared — Awaiting Capacitor Installation

---

## Capacitor Readiness Score: 7/10

The app's mobile service layer, platform detection, lifecycle management, deep-link routing, and SMS abstraction are fully architected. What remains is installing Capacitor packages, adding native plugins, and switching the router.

---

## 1. Routing

| Item | Status | Notes |
|---|---|---|
| Router type | ⚠️ Switch required | Currently uses `BrowserRouter`. Capacitor requires `HashRouter` for native (no server-side routing). **OR** use Capacitor's built-in `cap.config.ts` server config with `androidScheme: 'https'` to support BrowserRouter. |
| Route definitions | ✅ Ready | All routes are in `src/App.jsx`, clean structure |
| Navigation | ✅ Ready | Uses `<Link to="...">` throughout — no hardcoded `window.location` for routing |
| ScrollToTop | ✅ Ready | `ScrollToTop` component already handles route change scrolling |

**Action Required:** Either switch to `HashRouter` or configure Capacitor's `server.androidScheme` + `server.iosScheme` to support history-based routing.

---

## 2. Service Worker

| Item | Status | Notes |
|---|---|---|
| SW registration | ⚠️ Missing | `index.html` references `/manifest.json` but the file does not exist (404). `public/sw.js` exists but is not registered anywhere in the app. |
| Manifest | ⚠️ Missing | `/manifest.json` referenced in `index.html` but file not found. Needs to be created or removed for Capacitor (Capacitor has its own manifest handling). |
| Offline caching | ⏳ Not implemented | Sprint 3 Part 9 defines the offline strategy but does not implement it. |

**Action Required:** Create `public/manifest.json` for PWA mode. For Capacitor native, the manifest is not needed (native shell handles app metadata). Remove the dead `<link rel="manifest">` reference if going pure-native, or create the file for PWA support.

---

## 3. Local Storage

| Item | Status | Notes |
|---|---|---|
| Usage | ✅ Safe | Used only for device token storage (`borisend_device_token` key in NotificationService). No critical business data in localStorage. |
| Capacitor compatibility | ✅ Ready | Capacitor preserves localStorage across app launches on both platforms. |
| Migration needed | ✅ None | No localStorage data that needs migration. |

---

## 4. Session Storage

| Item | Status | Notes |
|---|---|---|
| Usage | ✅ Minimal | App does not rely on sessionStorage for critical functionality. |
| Capacitor compatibility | ✅ Ready | SessionStorage works in Capacitor's WebView. |

---

## 5. Authentication

| Item | Status | Notes |
|---|---|---|
| Token storage | ✅ Ready | Base44 SDK handles token storage internally (localStorage-backed). Works in Capacitor WebView. |
| Auth flow | ✅ Ready | Login → OTP → verifyOtp → setToken → redirect. No changes needed. |
| Google OAuth | ⚠️ Verify redirect URI | Google OAuth redirect URIs must include the Capacitor scheme (e.g. `com.borisend.app://oauth`). Update Google OAuth console when package ID is finalized. |
| Token persistence | ✅ Ready | Tokens persist across app restarts in Capacitor. |
| Auth context | ✅ Ready | `AuthContext.jsx` initializes correctly on app launch. |

**Action Required:** Add Capacitor deep link URI to Google OAuth console for social login to work natively.

---

## 6. Deep Linking

| Item | Status | Notes |
|---|---|---|
| URL scheme | ✅ Designed | `borisend://` scheme with routes for message, communication-plan, notification, subscription. |
| DeepLinkService | ✅ Implemented | `src/services/mobile/DeepLinkService.js` — parse, register, handle, build, buildNotificationPayload. |
| DeepLinkHandler | ✅ Implemented | `src/components/mobile/DeepLinkHandler.jsx` — mounted in AppLayout, wires lifecycle events to navigation. |
| Capacitor config | ⏳ Pending | Need to add `server.androidScheme` and deep link intent filter in `AndroidManifest.xml` and `Info.plist`. |
| Universal Links | ⏳ Pending | iOS Universal Links require `apple-app-site-association` file on the web domain. |

**Action Required:** Configure `capacitor.config.ts` with `server.androidScheme: 'borisend'`. Add intent filters in `AndroidManifest.xml` and `Info.plist` URL types.

---

## 7. Background Execution

| Item | Status | Notes |
|---|---|---|
| Scheduler | ✅ Server-side | `generateScheduledMessages` runs as a Base44 scheduled automation — no client-side background execution needed for message generation. |
| BackgroundTaskService | ✅ Architected | `src/services/mobile/BackgroundTaskService.js` — registerTask, schedule, unregister. Returns "not implemented" until Capacitor plugin is added. |
| iOS limitations | ✅ Acknowledged | iOS does not support unattended background SMS. Architecture uses notification-assisted sending for iOS. |
| Android WorkManager | ⏳ Pending | When Capacitor is added, register a periodic WorkManager task (15-min minimum) as a backup to the server-side scheduler. |

**Action Required:** No immediate action. Server-side scheduler handles all message generation. BackgroundTaskService is prepared for future client-side optimizations.

---

## 8. Push Notifications

| Item | Status | Notes |
|---|---|---|
| NotificationService | ✅ Implemented | `src/services/mobile/NotificationService.js` — requestPermission, registerForPush, sendLocalNotification, getCategories, getDefaultPreferences. |
| PermissionService | ✅ Implemented | `src/services/mobile/PermissionService.js` — request, check for 'notifications' and 'sms'. |
| DeviceToken entity | ✅ Created | `base44/entities/DeviceToken.jsonc` — stores FCM/APNs tokens with platform, model, version, is_active. |
| Notification settings | ✅ Implemented | `src/pages/NotificationSettings.jsx` — permission flow, category toggles, push master switch. |
| FCM integration | ⏳ Pending | Requires `@capacitor/push-notifications` + Firebase config for Android. |
| APNs integration | ⏳ Pending | Requires `@capacitor/push-notifications` + Apple Developer certificates for iOS. |
| Deep-link payload | ✅ Designed | Every notification carries `{ deep_link, type, id, ...extra }` — DeepLinkService handles navigation on tap. |

**Action Required:** Install `@capacitor/push-notifications`, configure Firebase project for Android, create APNs key in Apple Developer console.

---

## 9. Native Plugins

| Plugin | Purpose | Status |
|---|---|---|
| `@capacitor/app` | Lifecycle events, deep links | ⏳ Not installed — LifecycleService has conditional checks for `window.Capacitor.Plugins.App` |
| `@capacitor/device` | Device info | ⏳ Not installed — DeviceService returns stubs |
| `@capacitor/push-notifications` | Push notifications | ⏳ Not installed — NotificationService returns "not_implemented" |
| `@capacitor/local-notifications` | Local notifications | ⏳ Not installed — NotificationService returns "not_implemented" |
| `@capacitor/preferences` | Secure storage (optional) | ⏳ Not needed — localStorage works in Capacitor |
| `@capacitor/haptics` | Haptic feedback (optional) | ⏳ Not installed |
| SMS plugin (custom or community) | Automatic SMS sending | ⏳ Not installed — SMSService falls back to manual mode |

**Action Required:** Install the above plugins when ready. The service layer is designed to gracefully handle their absence — all return "not_implemented" or fall back to web APIs until plugins are present.

---

## 10. Build Configuration

| Item | Status | Notes |
|---|---|---|
| Vite config | ✅ Ready | Standard Vite + React setup. Capacitor builds from `dist/` directory. |
| `capacitor.config.ts` | ⏳ Not created | Needs to be created with: `appId`, `appName`, `webDir: 'dist'`, `server.androidScheme`. |
| Package identifier | ⏳ Pending | Need to decide: `com.borisend.app` (suggested). |
| Native projects | ⏳ Not created | `npx cap add android` and `npx cap add ios` after Capacitor is installed. |
| App icons | ⚠️ Placeholder | Currently uses emoji SVG favicon. Need proper app icons (1024x1024 PNG) for stores. |
| Splash screen | ⚠️ Not configured | Need splash screen image and Capacitor splash screen plugin. |

---

## Summary: Required Actions Before Native Build

1. **Install Capacitor:** `npm install @capacitor/core @capacitor/cli` + `npx cap init`
2. **Switch router:** Use `HashRouter` OR configure Capacitor `server.androidScheme`
3. **Create manifest.json** (for PWA) or remove dead reference (for native-only)
4. **Configure deep links:** `capacitor.config.ts` server scheme + native intent filters
5. **Install native plugins:** `@capacitor/app`, `@capacitor/device`, `@capacitor/push-notifications`
6. **Configure Firebase** (Android FCM) and **APNs** (iOS push)
7. **Generate app icons** and splash screen assets
8. **Add native platforms:** `npx cap add android && npx cap add ios`
9. **Update Google OAuth** redirect URIs to include Capacitor scheme
10. **Test** platform detection, deep links, and lifecycle on native builds
