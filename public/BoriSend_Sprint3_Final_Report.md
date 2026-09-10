# BoriSend — Sprint 3 Final Report: Native Mobile Foundation

**Date:** 3 July 2026  
**Sprint:** 3 — Native Mobile Foundation  
**Status:** ✅ Complete — Architecture Prepared for Capacitor

---

## 1. Capacitor Readiness Score

### Score: 7/10

| Area | Score | Notes |
|---|---|---|
| Routing | ⚠️ 6/10 | BrowserRouter works but HashRouter recommended for Capacitor |
| Service Worker | ⚠️ 4/10 | manifest.json missing (404), sw.js exists but unregistered |
| Local Storage | ✅ 10/10 | Only device token — Capacitor-safe |
| Session Storage | ✅ 10/10 | Not used for critical data |
| Authentication | ✅ 9/10 | Token-based, works in WebView. Google OAuth redirect URI needs update. |
| Deep Linking | ✅ 9/10 | Full architecture: DeepLinkService + DeepLinkHandler + route map |
| Background Execution | ✅ 9/10 | Server-side scheduler + BackgroundTaskService abstraction |
| Push Notifications | ✅ 8/10 | Full service + entity + settings UI. FCM/APNs plugins pending. |
| Native Plugins | ⚠️ 5/10 | Service layer ready, plugins not yet installed |
| Build Config | ⚠️ 5/10 | capacitor.config.ts not created, icons/splash pending |

**Blocking items:** Install Capacitor, switch router, create capacitor.config.ts, add native platforms.

---

## 2. Native Readiness Score

### Score: 8/10

| Area | Score | Notes |
|---|---|---|
| Service Abstraction | ✅ 10/10 | 8 services created, zero direct native calls in app code |
| Platform Detection | ✅ 10/10 | Centralized PlatformService, no scattered detection |
| SMS Architecture | ✅ 10/10 | Provider interface, permission flow, queue, callbacks, auto/manual modes |
| Notification Foundation | ✅ 10/10 | Permission, registration, categories, settings, deep-link payload |
| Deep Link Foundation | ✅ 10/10 | borisend:// scheme, 4 route types, lifecycle integration |
| Lifecycle Management | ✅ 10/10 | 7 lifecycle events centralized in LifecycleService |
| iOS Delivery Prep | ✅ 9/10 | Notification-assisted, no Shortcut dependency, manual SMS via SMSService |
| Android SMS Prep | ✅ 9/10 | Interface designed, permission flow, auto/manual modes, callbacks |
| Offline Strategy | ✅ 8/10 | Strategy defined, not implemented (per sprint scope) |
| Store Readiness | ⚠️ 4/10 | Permissions architected, assets/metadata pending |

---

## 3. List of New Service Classes

| # | Service | File | Responsibility |
|---|---|---|---|
| 1 | **PlatformService** | `src/services/mobile/PlatformService.js` | Centralized platform detection: Web, PWA, Android, iOS, Desktop. Helper methods: `isAndroid()`, `isIOS()`, `isPWA()`, `isNative()`, `isWeb()`, `isDesktop()`, `isMobile()`, `getPlatform()`, `getLabel()` |
| 2 | **SMSService** | `src/services/mobile/SMSService.js` | SMS abstraction: `send()`, `sendAuto()`, `sendManual()`, `requestPermission()`, `hasPermission()`, `isAutoSendSupported()`, `getPreferredMode()`, `onDelivery()`, `onFailure()`, `onRetry()` |
| 3 | **NotificationService** | `src/services/mobile/NotificationService.js` | Push & local notifications: `requestPermission()`, `getPermissionStatus()`, `registerForPush()`, `sendLocalNotification()`, `getCategories()`, `getDefaultPreferences()`, `isCategoryEnabled()` |
| 4 | **PermissionService** | `src/services/mobile/PermissionService.js` | Permission abstraction: `request(type)`, `check(type)`, `openSettings()`. Types: 'notifications', 'sms' |
| 5 | **DeviceService** | `src/services/mobile/DeviceService.js` | Device info: `getDeviceInfo()`, `getAppInfo()`, `getBatteryLevel()`, `getLanguage()` |
| 6 | **DeepLinkService** | `src/services/mobile/DeepLinkService.js` | Deep link routing: `parse()`, `register()`, `handle()`, `build()`, `buildNotificationPayload()` |
| 7 | **BackgroundTaskService** | `src/services/mobile/BackgroundTaskService.js` | Background execution: `registerTask()`, `schedule()`, `unregister()`, `isSupported()`, `getRegisteredTasks()` |
| 8 | **LifecycleService** | `src/services/mobile/LifecycleService.js` | App lifecycle: 7 events (launch, resume, background, terminate, notificationOpened, deepLinkOpened, networkRestored). `init()`, `on()`, `emitNotificationOpened()`, `emitDeepLinkOpened()` |

**Barrel export:** `src/services/mobile/index.js` — `import { SMSService, PlatformService, ... } from '@/services/mobile'`

**New entity:** `DeviceToken` (`base44/entities/DeviceToken.jsonc`) — stores FCM/APNs push tokens with platform, model, app version, and active status.

**New UI components:**
- `src/components/mobile/DeepLinkHandler.jsx` — invisible component initializing lifecycle + deep link routing
- `src/pages/NotificationSettings.jsx` — full notification settings screen with permission flow, category toggles

---

## 4. Platform Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      BORISEND APP                           │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  React UI   │  │  App Router  │  │  DeepLinkHandler │   │
│  │  (Pages &   │  │  (App.jsx)   │  │  (AppLayout)     │   │
│  │  Components)│  │              │  │                  │   │
│  └──────┬──────┘  └──────────────┘  └────────┬─────────┘   │
│         │                                     │             │
│         ▼                                     ▼             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              MOBILE SERVICE LAYER                       ││
│  │           (src/services/mobile/)                        ││
│  │                                                         ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││
│  │  │ PlatformSvc  │  │   SMSSvc     │  │ NotifSvc     │  ││
│  │  │ (detection)  │  │ (send/queue) │  │ (push/local) │  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ││
│  │  │ PermissionSvc│  │  DeviceSvc   │  │ DeepLinkSvc  │  ││
│  │  │ (perm flow)  │  │ (device info)│  │ (routing)    │  ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘  ││
│  │  ┌──────────────┐  ┌──────────────┐                     ││
│  │  │ BgTaskSvc    │  │ LifecycleSvc │                     ││
│  │  │ (bg exec)    │  │ (7 events)   │                     ││
│  │  └──────────────┘  └──────────────┘                     ││
│  └─────────────────────────────────────────────────────────┘│
│         │                                     │             │
│         ▼                                     ▼             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              BASE44 BACKEND LAYER                       ││
│  │  (SDK: entities, functions, integrations, auth)         ││
│  │                                                         ││
│  │  Entities: Campaign, Message, Notification,             ││
│  │            UserSubscription, SubscriptionPlan,          ││
│  │            DeviceToken, AppSettings, ...                ││
│  │  Functions: generateMessage, generateScheduledMessages, ││
│  │            getUsageStats, markMessageSent, ...          ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
         │
         ▼ (when Capacitor is installed)
┌─────────────────────────────────────────────────────────────┐
│              CAPACITOR NATIVE BRIDGE                        │
│  (window.Capacitor.Plugins)                                 │
│                                                             │
│  App · Device · PushNotifications · LocalNotifications      │
│  SplashScreen · Haptics · SMS (custom)                      │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   ANDROID       │  │     iOS         │                  │
│  │  (Java/Kotlin)  │  │  (Swift/ObjC)   │                  │
│  │                 │  │                 │                  │
│  │  WorkManager    │  │  BackgroundTasks│                  │
│  │  FCM            │  │  APNs           │                  │
│  │  SEND_SMS perm  │  │  (no SMS perm)  │                  │
│  │  Intent filters │  │  URL types      │                  │
│  └─────────────────┘  └─────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** The React UI never touches native APIs directly. All calls flow through the Mobile Service Layer, which abstracts platform differences and gracefully degrades to "Not Implemented" when Capacitor plugins are absent.

---

## 5. Notification Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION ARCHITECTURE                      │
│                                                                  │
│  ┌─────────────┐         ┌──────────────────┐                   │
│  │  Scheduler  │────────▶│  generateMessage │                   │
│  │  (server)   │         │  (backend fn)    │                   │
│  └─────────────┘         └────────┬─────────┘                   │
│                                   │                              │
│                                   ▼                              │
│                          ┌────────────────┐                      │
│                          │ Notification   │                      │
│                          │ entity (DB)    │                      │
│                          └────────┬───────┘                      │
│                                   │                              │
│                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              PUSH DELIVERY (future)                     │    │
│  │                                                         │    │
│  │  Server reads Notification entity →                     │    │
│  │  Sends push via FCM (Android) / APNs (iOS) →            │    │
│  │  Payload: { deep_link, type, id, ...extra }             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                   │                              │
│                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              DEVICE RECEIVES PUSH                       │    │
│  │                                                         │    │
│  │  Capacitor PushNotifications plugin →                   │    │
│  │  NotificationService listens for events →               │    │
│  │  LifecycleService.emitNotificationOpened(payload)       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                   │                              │
│                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              APP NAVIGATES                              │    │
│  │                                                         │    │
│  │  DeepLinkHandler receives 'notificationOpened' event →  │    │
│  │  DeepLinkService.handle(payload.deep_link) →            │    │
│  │  navigate(parsed.route)                                 │    │
│  │                                                         │    │
│  │  Example:                                               │    │
│  │    deep_link: "borisend://message/abc123"               │    │
│  │    → navigate to /messages/abc123                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              NOTIFICATION CATEGORIES                    │    │
│  │                                                         │    │
│  │  message_ready       → deep_link: borisend://message/X  │    │
│  │  awaiting_approval   → deep_link: borisend://message/X  │    │
│  │  message_sent        → deep_link: borisend://message/X  │    │
│  │  failed_message      → deep_link: borisend://message/X  │    │
│  │  subscription        → deep_link: borisend://subscription│   │
│  │  system              → (no deep link)                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              USER PREFERENCES                           │    │
│  │                                                         │    │
│  │  Stored on User entity via base44.auth.updateMe():      │    │
│  │    push_enabled: boolean (master switch)                │    │
│  │    notif_message_ready: boolean                         │    │
│  │    notif_awaiting_approval: boolean                     │    │
│  │    notif_message_sent: boolean                          │    │
│  │    notif_failed_message: boolean                        │    │
│  │    notif_subscription: boolean                          │    │
│  │    notif_system: boolean                                │    │
│  │                                                         │    │
│  │  Settings screen: /notification-settings                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              DEVICE TOKEN STORAGE                       │    │
│  │                                                         │    │
│  │  Entity: DeviceToken                                    │    │
│  │    token: string (FCM/APNs token)                      │    │
│  │    platform: 'android' | 'ios' | 'web'                 │    │
│  │    device_model: string                                 │    │
│  │    app_version: string                                  │    │
│  │    is_active: boolean                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Android SMS Preparation Summary

### Architecture Designed (Not Yet Implemented)

**SMS Provider Interface:**
```
SMSService.send(phone, message, options)     → Main entry point
SMSService.sendAuto(phone, message)          → Unattended send (Android + SEND_SMS)
SMSService.sendManual(phone, message)        → Opens Messages app (fallback)
SMSService.requestPermission()               → Runtime SEND_SMS request
SMSService.hasPermission()                   → Check permission status
SMSService.isAutoSendSupported()             → True on Android
SMSService.getPreferredMode()                → 'auto' on Android, 'manual' elsewhere
SMSService.onDelivery(callback)              → Delivery confirmation callback
SMSService.onFailure(callback)               → Failure callback
SMSService.onRetry(callback)                 → Retry callback
```

**Permission Flow:**
1. User enables "Automatic" mode in settings
2. SMSService.requestPermission() requests SEND_SMS at runtime
3. If granted → sendAuto() sends without user interaction
4. If denied → falls back to sendManual() (opens Messages app)

**Queue Integration:**
1. Scheduler generates message → status: 'pending' or 'approved'
2. User approves (manual mode) or auto-approves (auto mode)
3. SMSService.send() is called with the message
4. On success → markMessageSent updates status to 'sent'
5. On failure → status set to 'failed', retry scheduled

**Delivery/Failure/Retry Callbacks:**
- `onDelivery` → Updates Message status to 'sent', increments usage counter
- `onFailure` → Updates Message status to 'failed', creates Notification
- `onRetry` → System automatically retries failed sends (up to 3 attempts)

**Modes:**
- **Automatic mode:** Android with SEND_SMS permission — sends without user interaction
- **Approval mode:** User reviews each message before send button is tapped

**Business Logic Impact:** ZERO changes required when native SMS is added. The SMSService interface is identical — only the internal implementation changes from "fallback to manual" to "native plugin send."

---

## 7. iOS Delivery Preparation Summary

### Notification-Assisted Sending (No Shortcut Dependency)

**Flow:**
1. Scheduler generates message → status: 'pending' or 'approved'
2. Push notification sent to device: `{ deep_link: "borisend://message/X", type: "message_ready" }`
3. User taps notification → DeepLinkHandler navigates to `/messages/X`
4. MessageDetail page shows message with "Send via SMS" button
5. User taps "Send via SMS" → SMSService.sendManual() opens Messages app with pre-filled content
6. User confirms send in Messages app → returns to BoriSend
7. App marks message as sent via markMessageSent function

**Key Principles:**
- iOS NEVER claims unattended SMS sending
- iOS NEVER uses Apple Shortcuts for automation (no Shortcut dependency)
- All delivery is user-initiated via the native Messages app
- Push notifications alert the user when action is needed
- Deep links route the user directly to the relevant message

**Automatic vs. Approval Mode on iOS:**
- **Automatic mode:** Push notification → user taps → Messages app opens with pre-filled content → user taps send
- **Approval mode:** Push notification → user taps → reviews message → edits if needed → approves → taps send → Messages app opens

The difference is whether the user reviews the message content before the "Send via SMS" button appears. Neither mode sends without user interaction on iOS.

---

## 8. Store Readiness Checklist

*(See `public/BoriSend_Sprint3_Store_Readiness_Checklist.md` for full details)*

**Score: 4/10**

Key gaps:
- App icons and splash screen not created
- Privacy usage descriptions not written
- Native permissions not added to manifests
- Store metadata (descriptions, screenshots, privacy policy) not prepared
- Package identifier not finalized
- Firebase/APNs not configured

---

## 9. Remaining Blockers Before Native Implementation

| # | Blocker | Priority | Dependency |
|---|---|---|---|
| 1 | Install Capacitor core + CLI | Critical | All native features |
| 2 | Switch to HashRouter OR configure server scheme | Critical | Deep links + routing |
| 3 | Create `capacitor.config.ts` with appId, webDir, scheme | Critical | Native build |
| 4 | Add native platforms (`npx cap add android/ios`) | Critical | Native build |
| 5 | Install `@capacitor/app` plugin | High | Lifecycle events, deep links |
| 6 | Install `@capacitor/push-notifications` plugin | High | Push notifications |
| 7 | Configure Firebase project (Android FCM) | High | Android push |
| 8 | Configure APNs key (iOS push) | High | iOS push |
| 9 | Generate app icons (1024x1024px source) | High | Store submission |
| 10 | Design splash screen | Medium | Store submission |
| 11 | Write privacy descriptions | Medium | Store submission |
| 12 | Create `manifest.json` for PWA support | Medium | PWA mode |
| 13 | Update Google OAuth redirect URIs | Medium | Social login on native |
| 14 | Write privacy policy + terms of service | Medium | Store submission |
| 15 | Implement SMS native plugin (Android) | Low (Sprint 4) | Auto-send feature |
| 16 | Capture store screenshots | Low (Pre-launch) | Store submission |

---

## 10. Recommendations for Sprint 4

### Sprint 4: Native Implementation & Push Integration

1. **Install Capacitor and native plugins** — Execute the blockers #1-6 above. All service layer code is ready and will activate automatically when plugins are present.

2. **Implement FCM push notifications (Android)** — Wire NotificationService.registerForPush() to Capacitor PushNotifications plugin. Create a backend function to send push notifications via Firebase Admin SDK when Notification entities are created.

3. **Implement APNs push notifications (iOS)** — Same as above but with APNs. Use Firebase Admin SDK (handles both platforms) or direct APNs API.

4. **Implement Android auto-send SMS** — Install or create a Capacitor SMS plugin. Implement SMSService.sendAuto() with the native plugin. Wire delivery/failure/retry callbacks. The business logic requires zero changes.

5. **Deep link configuration** — Configure `borisend://` URL scheme in AndroidManifest.xml intent filters and iOS Info.plist URL types. Test deep link navigation from push notifications.

6. **Background task registration** — Register a periodic WorkManager task (Android, 15-min minimum) as a client-side backup to the server-side scheduler. Register iOS BGAppRefreshTask for lightweight checks.

7. **Offline mode implementation** — Implement the offline strategy defined in Sprint 3 Part 9. Use Capacitor Preferences for caching entity data. Show stale data with sync indicators. Queue actions for when network is restored.

8. **Store assets** — Generate app icons, design splash screen, write privacy policy, capture screenshots, prepare store metadata.

9. **App version display** — Wire DeviceService.getAppInfo() to the Settings page to show the current app version and build number.

10. **Notification deep-link testing** — End-to-end test: server creates Notification → push sent → device receives → user taps → app opens → navigates to correct screen via deep link.

---

## Constitution Compliance Verification

| Rule | Status | Evidence |
|---|---|---|
| 1. BoriSend is an AI-powered Communication Automation Platform | ✅ | Core functionality unchanged |
| 2. Business logic must remain platform-independent | ✅ | All business logic in backend functions, no platform-specific code in business rules |
| 3. Native code should only handle platform-specific capabilities | ✅ | SMSService, NotificationService etc. isolate platform logic; business logic untouched |
| 4. Android should eventually support automatic SMS sending | ✅ | SMSService.sendAuto() designed, isAutoSendSupported() returns true on Android |
| 5. iOS should always provide notification-assisted sending | ✅ | SMSService.getPreferredMode() returns 'manual' on iOS, never claims unattended sending |
| 6. Every external service must be accessed through an internal service layer | ✅ | 8 services created, zero direct native calls in app code (all `window.open(sms:...)` calls replaced) |
| 7. No business rules may exist only in code if they can be configured through Admin | ✅ | AI provider config in AppSettings, subscription limits in SubscriptionPlan, notification categories configurable |

---

**Conclusion:** Sprint 3 is complete. The entire mobile service layer is architected with 8 services, platform detection is centralized, notification and deep-link foundations are implemented, app lifecycle is managed by a single service, and all direct native calls have been replaced with service-layer abstractions. The app is architecturally ready for Capacitor — the remaining work is installing packages, configuring native projects, and creating store assets.
