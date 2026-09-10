# BoriSend — Sprint 3 Store Readiness Checklist

**Date:** 3 July 2026  
**Status:** Architecture Prepared — Store Assets Pending

---

## Store Readiness Score: 4/10

The app's code architecture is store-ready (no platform violations, proper permission abstraction, clean lifecycle). What's missing: native project configuration, app icons, splash screens, privacy descriptions, and store metadata.

---

## 1. Android Permissions

| Permission | Required For | Status | Manifest Entry Needed |
|---|---|---|---|
| `SEND_SMS` | Automatic SMS sending (Part 6) | ⏳ Architecture ready, plugin pending | `<uses-permission android:name="android.permission.SEND_SMS" />` |
| `POST_NOTIFICATIONS` | Push notifications (Android 13+) | ⏳ Architecture ready, plugin pending | `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` |
| `RECEIVE_BOOT_COMPLETED` | Background task on device restart (optional) | ⏳ Future | `<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />` |
| `INTERNET` | API calls | ✅ Default in Capacitor | Auto-added by Capacitor |
| `VIBRATE` | Notification vibration | ⏳ Optional | `<uses-permission android:name="android.permission.VIBRATE" />` |

**Action Required:** Add the above permissions to `AndroidManifest.xml` when native project is created. The SMSService and PermissionService already handle the runtime permission flow.

---

## 2. iOS Permissions

| Permission | Required For | Status | Info.plist Key Needed |
|---|---|---|---|
| Push Notifications | Remote notifications | ⏳ Architecture ready | `UIBackgroundModes` → `remote-notification` |
| Notification permission | Alert display | ⏳ Architecture ready | No Info.plist key needed (runtime request) |

**Note:** iOS does NOT need SMS permission — iOS cannot send SMS programmatically. The app uses notification-assisted sending (user taps to open Messages app with pre-filled content).

**Action Required:** Add `UIBackgroundModes` with `remote-notification` to `Info.plist`.

---

## 3. Privacy Usage Descriptions

| Platform | Permission | Description Text Needed | Status |
|---|---|---|---|
| iOS | Push Notifications | "BoriSend uses notifications to alert you when messages are ready to send or need approval." | ⏳ Pending |
| Android | SMS (SEND_SMS) | "BoriSend needs SMS permission to automatically send your approved messages to recipients." | ⏳ Pending |
| Android | Notifications | "BoriSend sends notifications when messages are ready, awaiting approval, or have been sent." | ⏳ Pending |

**Action Required:** Write and add these descriptions to `Info.plist` (iOS `NSUserNotificationUsageDescription`) and `AndroidManifest.xml` strings.

---

## 4. Notification Permissions

| Item | Status | Notes |
|---|---|---|
| Permission request flow | ✅ Implemented | `NotificationSettings.jsx` with "Enable Notifications" button |
| Permission status display | ✅ Implemented | Shows granted/denied/prompt status |
| Category preferences | ✅ Implemented | 6 categories with individual toggles |
| Push master toggle | ✅ Implemented | Global push on/off switch |
| Deep-link on notification tap | ✅ Architected | Payload carries `deep_link` field, LifecycleService routes to screen |

---

## 5. SMS Permissions

| Item | Status | Notes |
|---|---|---|
| Permission request flow | ✅ Architected | `PermissionService.request('sms')` — returns "not_applicable" on iOS, "not_implemented" until native plugin |
| Permission check | ✅ Architected | `PermissionService.check('sms')` |
| Auto-send mode | ✅ Architected | `SMSService.sendAuto()` — Android only, falls back to manual |
| Manual mode | ✅ Implemented | `SMSService.sendManual()` — opens native SMS app, works on all platforms |
| Mode selection | ✅ Implemented | `SMSService.getPreferredMode()` — 'auto' for Android, 'manual' for iOS/Web |

---

## 6. App Icons

| Asset | Size | Status |
|---|---|---|
| Android adaptive icon | 1024x1024px (foreground + background) | ⏳ Pending |
| Android legacy icon | 512x512px | ⏳ Pending |
| iOS app icon (1024) | 1024x1024px | ⏳ Pending |
| iOS app icon set | Multiple sizes (29pt–1024pt) | ⏳ Pending |
| Favicon (web) | 32x32px / SVG | ✅ Current: emoji SVG placeholder |
| PWA icon | 192x192px, 512x512px | ⏳ Pending (manifest.json missing) |

**Action Required:** Generate app icon set from a 1024x1024px source image. Use `@capacitor/assets` to auto-generate all platform sizes: `npx capacitor-assets generate`.

---

## 7. Splash Screen

| Asset | Status | Notes |
|---|---|---|
| Splash screen image | ⏳ Pending | Need 2732x2732px source image |
| Capacitor splash plugin | ⏳ Not installed | `@capacitor/splash-screen` |
| Splash configuration | ⏳ Pending | `capacitor.config.ts` splash screen options |

**Action Required:** Design splash screen, install `@capacitor/splash-screen`, configure in `capacitor.config.ts`.

---

## 8. Package Identifiers

| Platform | Identifier | Status |
|---|---|---|
| Android | `com.borisend.app` (suggested) | ⏳ Pending confirmation |
| iOS | `com.borisend.app` (suggested) | ⏳ Pending confirmation |
| Web | `borisend.com` (or Base44 domain) | ✅ Using Base44 hosting |

**Action Required:** Confirm package identifier. Must match across Android `build.gradle`, iOS bundle identifier, and Google OAuth redirect URIs.

---

## 9. Versioning

| Item | Status | Notes |
|---|---|---|
| Version number | ⏳ Pending | Suggested: `1.0.0` for initial store release |
| Build number | ⏳ Pending | Increment per upload |
| Version source | ⏳ Pending | `package.json` version + `capacitor.config.ts` |
| In-app version display | ✅ Ready | `DeviceService.getAppInfo()` — returns version (stub until native) |

**Action Required:** Set version in `package.json` and `capacitor.config.ts`. Implement version display in Settings page.

---

## 10. Store Metadata

| Item | Platform | Status | Notes |
|---|---|---|---|
| App name | Both | ✅ "BoriSend" | |
| Short description | Both | ⏳ Pending | Google Play: 80 char max. App Store: 30 char subtitle. |
| Full description | Both | ⏳ Pending | Google Play: 4000 char. App Store: 4000 char. |
| App category | Both | ⏳ Pending | Suggested: "Communication" or "Lifestyle" |
| Keywords | iOS | ⏳ Pending | 100 char comma-separated |
| Screenshots | Both | ⏳ Pending | Need 5+ screenshots per device size |
| App preview video | Both | ⏳ Optional | 15-30 second video |
| Privacy policy URL | Both | ⏳ Pending | Required for both stores |
| Terms of service URL | Both | ⏳ Pending | Required for both stores |
| Support URL | Both | ⏳ Pending | Required for App Store |
| Content rating | Both | ⏳ Pending | Google Play: questionnaire. App Store: age rating. |
| Data safety | Google Play | ⏳ Pending | Declare data collection (messages, contacts, etc.) |
| App Review Information | App Store | ⏳ Pending | Demo account, review notes |

---

## 11. Privacy & Data Collection

| Data Type | Collected | Purpose | Declaration Needed |
|---|---|---|---|
| Email | ✅ Yes | Authentication | Both stores |
| Full name | ✅ Yes | Personalization | Both stores |
| Phone numbers (recipients) | ✅ Yes | SMS sending | Both stores — sensitive |
| Message content | ✅ Yes | AI generation & SMS | Both stores |
| Device token | ✅ Yes | Push notifications | Both stores |
| AI provider config | ✅ Yes (admin) | AI generation routing | Internal only |

**Action Required:** Write a privacy policy covering all collected data. Fill out Google Play Data Safety form and App Store App Privacy details.

---

## Summary: Required Actions Before Store Submission

1. **Finalize package identifier** (`com.borisend.app`)
2. **Generate app icons** from 1024x1024px source image
3. **Design splash screen** (2732x2732px source)
4. **Write privacy descriptions** for iOS Info.plist and Android manifest
5. **Add permissions** to native manifest files
6. **Configure Firebase** (Android) and **APNs** (iOS) for push notifications
7. **Write privacy policy** and terms of service
8. **Capture store screenshots** (minimum 5 per device size)
9. **Write store descriptions** (short + full)
10. **Complete content rating** questionnaires on both stores
11. **Fill data safety declarations** on Google Play
12. **Set version** to 1.0.0 and build number
