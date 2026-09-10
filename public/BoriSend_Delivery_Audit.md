# BoriSend Delivery Architecture Audit

**Date:** 2026-07-02  
**Sprint:** 2 — Smart Delivery Experience

---

## 1. Executive Summary

BoriSend is a web application (React + Vite) deployed as a PWA. The platform does **not** have a native Android or iOS application. All delivery mechanisms operate within the constraints of a web/PWA architecture, supplemented by iOS Shortcuts for semi-automated delivery on iPhone.

**Key Finding:** True unattended SMS sending is **not possible** on either Android or iOS within the current architecture. This is a platform-level OS restriction, not a BoriSend limitation.

---

## 2. Platform-by-Platform Audit

### 2.1 Android Implementation

**Current State:** PWA / Web Application

| Capability | Status | Notes |
|------------|--------|-------|
| PWA installable | ✅ Yes | manifest.json, theme-color, standalone display |
| Push notifications | ❌ No | No service worker push registration |
| Automatic SMS sending | ❌ No | Web APIs cannot send SMS without user interaction |
| SMS via `sms:` URI | ✅ Yes | Opens default SMS app with pre-filled content |
| Background execution | ❌ No | PWA cannot run in background |
| Foreground polling | ✅ Yes | `useDueMessages` hook polls every 60 seconds |

**Current Flow:**
1. Scheduler generates AI message at scheduled time
2. App polls `getPendingMessages` every 60 seconds
3. Due messages appear on Home dashboard
4. User taps "Send" → `sms:` URI opens default SMS app
5. User confirms send in SMS app
6. `markMessageSent` records the send

**Limitations:**
- No push notifications — user must have app open
- No background processing — app must be in foreground
- SMS requires manual confirmation — `sms:` URI cannot auto-send
- No SMS permission handling — web apps cannot request SMS permissions

**True Automatic SMS — Required Architecture:**

To achieve true automatic SMS sending on Android, BoriSend would need:

1. **Native Android App** (Kotlin/Java)
   - `SEND_SMS` permission in AndroidManifest.xml
   - Runtime permission request via `ActivityCompat.requestPermissions`
   - `SmsManager.getDefault().sendTextMessage()` for direct sending
   - `WorkManager` or `AlarmManager` for scheduled background execution
   - `Firebase Cloud Messaging (FCM)` for push notifications

2. **OR Hybrid Wrapper** (e.g., Capacitor, Cordova)
   - `@capacitor/sms` or custom plugin for SMS sending
   - `@capacitor/local-notifications` for scheduled alerts
   - `@capacitor/push-notifications` for FCM
   - Background task plugin for scheduled execution

3. **Backend Changes**
   - Push notification service (FCM for Android)
   - Device token registration entity
   - Notification dispatch function

**Recommendation:** If automatic SMS is a priority, implement a Capacitor wrapper around the existing PWA. This preserves 100% of the current business logic while adding native SMS and background execution capabilities. Estimated effort: 2-3 sprints.

---

### 2.2 iOS (iPhone) Implementation

**Current State:** PWA + iOS Shortcuts integration

| Capability | Status | Notes |
|------------|--------|-------|
| PWA installable | ✅ Yes | apple-mobile-web-app-capable, standalone |
| Push notifications | ❌ No | No APNs integration |
| Automatic SMS sending | ❌ No | iOS does not allow any app to auto-send SMS |
| SMS via `sms:` URI | ✅ Yes | Opens Messages app with pre-filled content |
| iOS Shortcuts automation | ✅ Yes | `getPendingMessages` + `markMessageSent` API |
| Background execution | ❌ No | iOS aggressively suspends PWAs |

**Current Flow (Constitution-Compliant):**
1. Scheduler generates AI message at scheduled time
2. iOS Shortcut runs on schedule (Time of Day automation)
3. Shortcut calls `getPendingMessages` API
4. If messages are due, Shortcut shows a notification
5. User taps notification → Shortcut opens BoriSend PWA
6. Prepared message appears with "Send" button
7. User taps "Send" → `sms:` URI opens Messages app
8. User taps send in Messages app
9. Shortcut calls `markMessageSent` API

**iOS Hard Limitations (Apple-enforced, cannot be bypassed):**
- **No app can send SMS without user interaction** — this is an iOS security policy
- **No PWA can run scheduled background tasks** — iOS kills suspended PWAs
- **Shortcuts cannot auto-send SMS** — `send-message` action requires user confirmation
- **Push notifications require APNs** — no current integration

**Assessment:** The current iOS Shortcuts flow is the **maximum achievable automation** on iOS without a native app. Even with a native app, Apple would still require user confirmation for each SMS. The flow is constitution-compliant: Scheduler → Generate → Queue → Notification → User taps → Prepared message → User taps Send.

**Recommendation:** No architectural changes needed for iOS. The Shortcuts flow is the correct approach. Consider adding APNs push notifications in a future sprint to alert users when messages are ready (replacing the Time of Day trigger with event-based push).

---

### 2.3 Web Implementation

**Current State:** Full-featured web application

| Capability | Status | Notes |
|------------|--------|-------|
| All core features | ✅ Yes | Campaigns, messages, scheduling, billing, admin |
| SMS sending | ✅ Yes | Via `sms:` URI (opens default SMS handler) |
| Real-time updates | ✅ Yes | Entity subscriptions + polling |
| PWA install | ✅ Yes | manifest.json, service worker |
| Push notifications | ❌ No | No web push integration |

**Assessment:** The web implementation is the most complete platform. All Sprint 2 features (Notification Center, Smart Inbox, Dashboard) are fully functional on web.

---

### 2.4 PWA Implementation

**Current State:** Installable PWA with basic configuration

| Capability | Status | Notes |
|------------|--------|-------|
| Installable | ✅ Yes | manifest.json present |
| Standalone display | ✅ Yes | `display: standalone` |
| Theme color | ✅ Yes | `#7C3AED` |
| Apple touch icon | ✅ Yes | SVG emoji fallback |
| Service worker | ✅ Yes | `public/sw.js` |
| Offline support | ❌ Partial | Service worker exists but no offline data caching |
| Push notifications | ❌ No | No push subscription |
| Background sync | ❌ No | No background sync registration |

**Assessment:** PWA is installable but lacks offline capabilities and push notifications. These are enhancements for a future sprint, not blockers for the current delivery flow.

---

## 3. Delivery Flow Summary

| Platform | Generation | Queue | Notification | User Action | Send |
|----------|-----------|-------|-------------|-------------|------|
| Web/PWA | ✅ Automatic | ✅ Database | ✅ In-app | ✅ Tap "Send" | ✅ `sms:` URI |
| iOS | ✅ Automatic | ✅ Database | ✅ Shortcut alert | ✅ Tap notification → tap "Send" | ✅ `sms:` URI |
| Android | ✅ Automatic | ✅ Database | ❌ No push | ✅ Open app → tap "Send" | ✅ `sms:` URI |

**All platforms share the same business logic.** Only the delivery layer differs:
- Web/PWA: In-app notification → user sends
- iOS: Shortcut notification → user sends
- Android: App must be open → user sends

---

## 4. Missing Components

1. **Push Notification Service** — No APNs (iOS) or FCM (Android) integration
2. **Device Token Registration** — No entity to store device push tokens
3. **Native Android App** — No Capacitor/native wrapper for background SMS
4. **Offline Data Caching** — PWA service worker doesn't cache entity data
5. **Background Sync** — No background sync API registration

---

## 5. Required Future Work

### Phase 1: Push Notifications (Sprint 3+)
- Add `DeviceToken` entity (token, platform, user_id)
- Integrate Web Push API for PWA
- Integrate APNs for iOS (via native app or wrapper)
- Integrate FCM for Android (via native app or wrapper)
- Create `sendPushNotification` backend function

### Phase 2: Native Android (Sprint 4+)
- Wrap PWA with Capacitor
- Add `@capacitor/sms` plugin for direct SMS sending
- Add `@capacitor/local-notifications` for scheduled alerts
- Add background task plugin for scheduled execution
- Request `SEND_SMS` runtime permission

### Phase 3: Offline Support (Sprint 5+)
- Cache entity data in IndexedDB
- Queue offline actions for sync
- Cache campaign/message data for offline viewing

---

## 6. Conclusion

BoriSend's current architecture is a well-built PWA that correctly handles the fundamental constraint: **no web application can automatically send SMS without user interaction on any platform.** The iOS Shortcuts integration is the correct approach for maximizing automation within Apple's constraints. The Android experience would benefit from push notifications and, eventually, a native wrapper for true background execution.

The platform does not fake automation. All delivery requires user confirmation, and the user is always informed when messages are ready. This is honest, transparent, and compliant with the Product Constitution.
