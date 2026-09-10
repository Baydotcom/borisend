# BoriSend — Capacitor Readiness Audit

**Date:** 2026-07-02  
**Sprint:** 3A — Mobile Strategy and Communication Plan Cleanup

---

## 1. Executive Summary

BoriSend is currently a Base44 web application deployed as a PWA (Progressive Web App). The long-term mobile strategy is to wrap the existing web app with **Capacitor** to produce native Android and iOS applications.

This audit evaluates the current codebase for Capacitor compatibility, identifies required native features, and recommends next steps for Play Store and App Store readiness.

**Key Finding:** The current Base44 web app is **structurally ready** for Capacitor wrapping. No fundamental architecture changes are required. The main work involves adding native plugins for SMS, push notifications, and background tasks, plus minor PWA cleanup.

---

## 2. What Changes Are Needed to Wrap This App with Capacitor

### 2.1 Project Structure

| Item | Current State | Required Change |
|------|---------------|-----------------|
| Build output | Vite outputs to `dist/` | Capacitor `webDir` must point to `dist/` |
| Framework | React 18 + Vite | ✅ Fully compatible — Capacitor wraps any web build |
| Routing | React Router (BrowserRouter) | Switch to HashRouter or configure deep link handling |
| API calls | Base44 SDK via `@/api/base44Client` | ✅ Works as-is — HTTP calls work in WebView |
| Auth | Base44 Auth (token-based) | ✅ Works as-is — tokens persist in WebView storage |
| PWA manifest | `public/manifest.json` | Keep for web; Capacitor uses its own config |
| Service worker | `public/sw.js` | May conflict — see Section 4 |

### 2.2 Setup Steps

1. **Install Capacitor CLI and core:**
   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init BoriSend com.borisend.app --web-dir=dist
   ```

2. **Add native platforms:**
   ```bash
   npm install @capacitor/android @capacitor/ios
   npx cap add android
   npx cap add ios
   ```

3. **Build and sync:**
   ```bash
   npm run build
   npx cap sync
   ```

4. **Configure Capacitor** (`capacitor.config.ts`):
   ```typescript
   import { CapacitorConfig } from '@capacitor/cli';
   const config: CapacitorConfig = {
     appId: 'com.borisend.app',
     appName: 'BoriSend',
     webDir: 'dist',
     server: {
       androidScheme: 'https',
       iosScheme: 'https',
     },
     plugins: {
       // Native plugins configured here
     },
   };
   export default config;
   ```

### 2.3 Code Changes Required

| Area | Change | Priority |
|------|--------|----------|
| Router | Replace `BrowserRouter` with `HashRouter` OR add deep link config | High |
| `window.open` calls | Replace with Capacitor Browser plugin or InAppBrowser | Medium |
| `sms:` URI scheme | Replace with native SMS plugin for direct sending (Android) | High (for auto-send) |
| `navigator.clipboard` | Replace with `@capacitor/clipboard` | Low |
| `window.location.href` | Works in WebView but may need adjustment for external links | Low |
| PWA service worker | Disable or remove to avoid caching conflicts in WebView | Medium |

---

## 3. Native Android Features Required Later

### 3.1 SMS Permission & Automatic SMS Sending

| Feature | Requirement |
|---------|-------------|
| Permission | `SEND_SMS` in `AndroidManifest.xml` + runtime permission request |
| Plugin | `@capacitor-community/sms` or custom Capacitor plugin wrapping `SmsManager` |
| Direct send | `SmsManager.getDefault().sendTextMessage(phone, null, message, null, null)` |
| User confirmation | Not required if `SEND_SMS` permission is granted (unlike iOS) |
| Code integration | Replace `window.open(smsUrl)` in `useDueMessages` hook with native SMS plugin call |

**Current code to replace:**
```javascript
// Current (PWA) — opens SMS app, requires user confirmation
const smsUrl = `sms:${msg.recipient_phone}?body=${encodeURIComponent(msg.content)}`;
window.open(smsUrl, "_self");

// Future (Capacitor) — direct send, no user interaction
import { Sms } from '@capacitor-community/sms';
await Sms.send({ numbers: [msg.recipient_phone], text: msg.content });
```

### 3.2 Background Work

| Feature | Requirement |
|---------|-------------|
| Scheduler | `WorkManager` (Android Jetpack) for periodic background execution |
| Plugin | `@capacitor-community/background-mode` or custom plugin |
| Use case | Poll `getPendingMessages` API on a schedule, even when app is closed |
| Alternative | Keep server-side scheduler (current approach) + use push notifications instead of background polling |
| Battery | WorkManager respects battery optimization; minimum interval 15 minutes |

**Recommendation:** Keep the server-side scheduler (`generateScheduledMessages` automation). Use push notifications (FCM) to alert the app when messages are ready. Background polling is not necessary if push notifications are implemented.

### 3.3 Push Notifications (Android — FCM)

| Feature | Requirement |
|---------|-------------|
| Service | Firebase Cloud Messaging (FCM) |
| Plugin | `@capacitor/push-notifications` |
| Setup | Firebase project + `google-services.json` in `android/app/` |
| Token registration | Store device token in a `DeviceToken` entity |
| Backend | Create `sendPushNotification` backend function that calls FCM API |
| Trigger | Call push when `Notification` entity is created (entity automation or inline in scheduler) |

### 3.4 Deep Links

| Feature | Requirement |
|---------|-------------|
| Plugin | `@capacitor/app` (handles deep links) + `@capacitor/preferences` |
| Config | `autoHref` and `deepLinkHandler` in `capacitor.config.ts` |
| Android | `<intent-filter>` in `AndroidManifest.xml` for `borisend://` scheme |
| Use case | Notification tap → open specific campaign/message detail page |
| Router | Must switch to HashRouter or configure path-based deep links |

---

## 4. PWA Code That May Conflict with Capacitor

| Component | File | Conflict | Resolution |
|-----------|------|----------|------------|
| Service worker | `public/sw.js` | Caches assets in WebView; may serve stale content after updates | Remove service worker registration in native builds, or conditionally register only on web |
| PWA manifest | `public/manifest.json` | Not used by Capacitor; harmless but unnecessary | Leave as-is (no conflict, just ignored) |
| `apple-mobile-web-app-capable` | `index.html` | iOS PWA meta tag; may interfere with Capacitor's WebView | Remove in native builds or leave (Capacitor ignores it) |
| `theme-color` meta | `index.html` | No conflict | Keep |
| `window.open(sms:)` | `useDueMessages.jsx`, `CampaignDetail.jsx`, `SmartInbox.jsx`, `MessageDetail.jsx` | Opens external SMS app; in WebView, behavior varies by platform | Replace with Capacitor SMS plugin for direct sending |
| `navigator.clipboard` | `ShortcutsSetup.jsx` | Works in WebView but may need `@capacitor/clipboard` on some devices | Low priority; test on device first |
| BrowserRouter | `src/App.jsx` | Deep links don't work natively with BrowserRouter in WebView | Use HashRouter, or configure server + intent filters |

---

## 5. Native iOS Features Required Later

### 5.1 Push Notifications (iOS — APNs)

| Feature | Requirement |
|---------|-------------|
| Service | Apple Push Notification service (APNs) |
| Plugin | `@capacitor/push-notifications` |
| Setup | Apple Developer account + push notification capability + APNs key |
| Token registration | Store device token in `DeviceToken` entity |
| Backend | `sendPushNotification` function calls APNs (or use FCM as unified gateway) |
| Silent pushes | Can use content-available pushes to wake the app briefly (limited) |

### 5.2 Deep Links (iOS — Universal Links)

| Feature | Requirement |
|---------|-------------|
| Plugin | `@capacitor/app` |
| Config | Associated Domains capability in Xcode + `apple-app-site-association` file on server |
| Scheme | `borisend://` custom scheme or Universal Links (`https://borisend.com/...`) |
| Use case | Notification tap → open specific page in app |

### 5.3 Notification-Assisted Sending

| Feature | Requirement |
|---------|-------------|
| Local notifications | `@capacitor/local-notifications` for scheduled alerts |
| Current iOS flow | iOS Shortcuts (Time of Day automation → check API → show notification) |
| Future iOS flow | Push notification from server → user taps → app opens → prepared message → user taps Send |
| Auto-send | **Not possible on iOS** — Apple requires user confirmation for all SMS sends, even in native apps |
| Best approach | Push notification → app opens to message detail → one-tap send via `sms:` URI (still requires user confirmation in Messages app) |

---

## 6. Recommended Next Steps

### Phase 1: Preparation (Current Sprint — No Capacitor Yet)
- ✅ Audit complete (this document)
- ✅ PWA remains functional
- Switch `BrowserRouter` to `HashRouter` (or prepare deep link config)
- Conditionally register service worker only on web platform
- Create `DeviceToken` entity for future push notification support

### Phase 2: Capacitor Setup (Next Sprint)
- Install Capacitor CLI and core packages
- Add Android and iOS platforms
- Configure `capacitor.config.ts`
- Build and test in native shell (no native plugins yet)
- Verify all existing features work in WebView

### Phase 3: Native Plugins (Sprint 4+)
- Install `@capacitor/push-notifications` (FCM + APNs)
- Install `@capacitor/local-notifications`
- Install `@capacitor/app` (deep links)
- Create `DeviceToken` entity and token registration flow
- Create `sendPushNotification` backend function
- Replace in-app notification polling with push notifications

### Phase 4: Android SMS (Sprint 5+)
- Install or create Capacitor SMS plugin (`@capacitor-community/sms` or custom)
- Add `SEND_SMS` permission to `AndroidManifest.xml`
- Implement runtime permission request flow
- Replace `window.open(sms:)` with native SMS plugin call
- Add background mode plugin for scheduled sending (if needed)

### Phase 5: App Store Readiness (Sprint 6+)

**Google Play Store:**
- Create Play Console developer account ($25 one-time)
- Generate signed APK/AAB
- Prepare store listing (screenshots, description, privacy policy)
- App content rating questionnaire
- Data safety form
- Target API level compliance (currently API 34+)
- Review: typically 1-3 days

**Apple App Store:**
- Create Apple Developer account ($99/year)
- Configure app in App Store Connect
- Generate provisioning profiles and certificates
- Add push notification capability
- Prepare App Privacy details
- App Review Guidelines compliance (especially SMS-related)
- Review: typically 1-7 days
- **Note:** Apple may require justification for SMS sending; ensure the app's purpose is clear

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Apple rejects SMS auto-send | High | High | iOS will NOT support auto-send; use notification-assisted flow |
| WebView performance issues | Low | Medium | Test on real devices; Capacitor WebView is performant |
| Service worker conflicts | Medium | Low | Conditionally disable in native builds |
| Push notification setup complexity | Medium | Medium | Use FCM as unified gateway for both platforms |
| Base44 SDK compatibility | Low | High | SDK uses standard HTTP — fully compatible with WebView |
| Deep link routing issues | Medium | Low | Use HashRouter or test thoroughly |

---

## 8. Conclusion

BoriSend is well-positioned for Capacitor wrapping. The current React + Vite + Base44 SDK architecture is fully compatible with Capacitor's WebView approach. The primary work involves:

1. **Router migration** (BrowserRouter → HashRouter)
2. **Service worker conditional registration**
3. **Native plugin installation** (push notifications, local notifications, deep links, SMS)
4. **Permission handling** (Android SMS, iOS push)
5. **Store submission preparation**

The iOS Shortcuts flow remains the correct approach for iOS, even after Capacitor wrapping — Apple does not allow any app to auto-send SMS. The Android experience will benefit most from Capacitor, gaining the ability to send SMS directly with `SEND_SMS` permission and receive push notifications via FCM.
