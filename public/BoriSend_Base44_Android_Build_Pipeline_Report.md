# BoriSend — Definitive Base44 Android Build Pipeline Report

**Date:** 2026-07-29  
**Scope:** Determine whether Base44's Android build pipeline injects any native SMS functionality not visible in the project workspace. Resolve the contradiction between earlier Sprint reports (which described native SMS capabilities) and the current workspace inspection (which found only user-assisted `sms:` URL scheme functionality).  
**Constraint:** Inspection and reporting only. No code, permissions, configuration, workflows, database records, publishing settings, or release settings were modified. No Android build was generated.

---

## 1. Executive Conclusion

**Base44 does not inject native automatic SMS functionality into the production Android AAB.**

The Base44-generated Android package is a **lightweight native WebView wrapper** that loads the published Base44 web app URL. It is **not** a Capacitor application. Base44's build pipeline:

- Does **not** use Capacitor or any native plugin framework
- Does **not** inject `SmsManager`, SMS bridges, SMS plugins, or `SEND_SMS` permission
- Does **not** provide background execution infrastructure (WorkManager, AlarmManager, foreground services, broadcast receivers)
- **Ignores** `capacitor.config.ts` and the installed `@capacitor/*` packages
- Auto-determines permissions via an AI code scan — and since the actual SMS implementation uses the `sms:` URL scheme (no `SmsManager`), no SMS permission will be added

The `registerPlugin("Sms")` call in `SMSService.js` will **not resolve** to a working native implementation in the Base44-generated AAB. `window.Capacitor` will **not exist** in the production app. The call will fail silently and fall back to `sendManual()`, which opens the device's default messaging app via the `sms:` URL scheme.

The earlier Sprint reports that described "native Android SMS capabilities" were describing **application-level JavaScript abstractions** — service files, interfaces, and callback registries — that were never connected to actual native functionality. No native SMS plugin was ever installed in `package.json`, and Base44's build pipeline does not support Capacitor plugins.

**Final conclusion: Base44 does not inject native automatic SMS functionality.**

---

## 2. Build Architecture

### What Base44 generates

Per Base44's official documentation:

> *"Your mobile app runs your published Base44 app inside a secure web view. This is a lightweight native wrapper around your web app that opens only your app's URL."*  
> — [Submitting your app to app stores](https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores)

> *"Current limitations: Native-only features such as push notifications, full offline mode, and HealthKit are not supported yet."*  
> — [Creating and using your app on mobile](https://docs.base44.com/Building-your-app/Mobile-experience)

### Build architecture classification

| Option | Answer |
|--------|--------|
| A WebView wrapper only | ✅ **Yes — this is what Base44 generates** |
| A Capacitor application | ❌ No |
| Another native wrapper | ❌ No |
| A hybrid package with Base44-provided native bridges | ❌ No |

The production AAB is a **WebView wrapper only**. It contains:
- A native Android shell that hosts a WebView
- The WebView loads the published Base44 web app URL
- App icon and package name
- Auto-determined permissions
- No application JavaScript is bundled into the AAB — it all runs from the hosted URL

### What the AAB does NOT contain

- No Capacitor runtime
- No native Android `SmsManager` calls
- No native SMS bridge
- No `@capacitor/community/sms` or any SMS plugin
- No native background services
- No broadcast receivers
- No application JavaScript code (it's loaded from the URL at runtime)

---

## 3. Native Bridge and Plugin Audit

### Will the production AAB contain any native SMS implementation not present in the workspace?

**No.** Base44 does not inject any native SMS functionality. The AAB is a WebView wrapper — all JavaScript runs in the WebView context, with no native bridges beyond what Base44's standard WebView shell provides (which does not include SMS).

### Itemised audit

| Component | Injected by Base44? | Present in AAB? | Evidence |
|-----------|-------------------|-----------------|----------|
| Android `SmsManager` | ❌ No | ❌ No | Base44 docs: "lightweight native wrapper around your web app that opens only your app's URL" |
| Native SMS bridge | ❌ No | ❌ No | Base44 docs: "Native-only features... are not supported yet" |
| Capacitor SMS plugin | ❌ No | ❌ No | Base44 docs: "Capacitor native plugins are NOT supported" |
| Cordova SMS plugin | ❌ No | ❌ No | Base44 does not use Cordova |
| Proprietary Base44 SMS plugin | ❌ No | ❌ No | No such plugin is documented or referenced anywhere in Base44 docs |
| `android.permission.SEND_SMS` | ❌ No | ❌ No | See permission audit below |
| Runtime SMS permission handling | ❌ No | ❌ No | No native code to request permissions; no plugin to bridge permission requests |
| Sent-status broadcast receivers | ❌ No | ❌ No | No native code in the AAB |
| Delivery-status broadcast receivers | ❌ No | ❌ No | No native code in the AAB |
| Background SMS services | ❌ No | ❌ No | No native code in the AAB |
| WorkManager | ❌ No | ❌ No | No native code in the AAB |
| AlarmManager | ❌ No | ❌ No | No native code in the AAB |
| Foreground services | ❌ No | ❌ No | No native code in the AAB |
| Boot-completed receivers | ❌ No | ❌ No | No native code in the AAB |

### Will `registerPlugin("Sms")` resolve to a working native implementation?

**No.** The `registerPlugin("Sms")` call in `SMSService.js` (line 43) and `PermissionService.js` (line 52) relies on the Capacitor runtime being present. In a Base44-generated AAB:

1. `window.Capacitor` does not exist (Base44 does not inject Capacitor)
2. `PlatformService.isNative()` returns `false` (it checks `window.Capacitor.isNativePlatform()`)
3. `_getSmsPlugin()` returns `null` immediately (it checks `PlatformService.isNative()` first)
4. `sendAuto()` falls back to `sendManual()`

Even if `window.Capacitor` were somehow present, `registerPlugin("Sms")` would return a proxy object that throws on any method call, because no native "Sms" plugin is registered on the native side. No SMS plugin is listed in `package.json`, and Base44 does not inject one.

### Will `window.Capacitor` exist inside the production Base44 Android application?

**No.** Base44's WebView wrapper does not inject the Capacitor runtime. `window.Capacitor` will be `undefined`. This means:

- `PlatformService.isNative()` → `false`
- `PlatformService.isAndroid()` → `false` (checks `capacitor.getPlatform()`)
- `PlatformService.isIOS()` → `false`
- All Capacitor plugin imports (`@capacitor/push-notifications`, `@capacitor/app`, `@capacitor/device`) will fail to initialise
- The app will behave identically to the web/PWA version

### Are `capacitor.config.ts` and the installed Capacitor packages used by Base44's build?

**No.** Per Base44 documentation:

> *"Base44 handles mobile app generation (IPA for App Store, AAB for Google Play) entirely through its own internal pipeline, not through Capacitor."*

The `capacitor.config.ts` file and the `@capacitor/*` packages in `package.json` (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/app`, `@capacitor/device`, `@capacitor/push-notifications`, `@capacitor/cli`) are:

- **Used for:** Local development builds via `npx cap` (if the developer exports the code and builds their own Capacitor app outside Base44)
- **Ignored by:** Base44's cloud build pipeline (which generates its own WebView wrapper)

The presence of these packages in `package.json` does not mean they are active in the production AAB. They are JavaScript dependencies that would only function if a Capacitor native runtime were present — and Base44 does not provide one.

---

## 4. Android Permission Audit

### Does Base44 automatically add permissions based on code scanning?

**Yes.** Per Base44 documentation:

> *"Every mobile app package includes device-level permissions. Base44 uses AI to scan your app and set the permissions it needs. These permissions are not editable in the Base44 interface."*

### Will the generated AAB include these permissions?

| Permission | Will it be in the AAB? | Reasoning |
|-----------|----------------------|-----------|
| `android.permission.SEND_SMS` | ❌ **No** | The AI scan examines application code. The actual SMS implementation uses `window.location.href = "sms:..."` (the `sms:` URL scheme), which requires **no permission**. There is no `SmsManager` import, no `SEND_SMS` string constant, and no native SMS API call anywhere in the codebase. The AI scan will not detect a need for `SEND_SMS`. |
| `android.permission.POST_NOTIFICATIONS` | ⚠️ **Possibly** | The code references `Notification.requestPermission()` (browser API) and `@capacitor/push-notifications`. The AI scan may detect notification-related code and add `POST_NOTIFICATIONS`. However, since Base44 doesn't use Capacitor, push notifications won't actually function even if the permission is declared. |
| Background execution permissions | ❌ **No** | No background service, `WorkManager`, or `AlarmManager` code exists in the project. `BackgroundTaskService.js` uses `setInterval` (a JavaScript timer), which requires no Android permission. |
| Foreground-service permissions | ❌ **No** | No foreground service code exists. |
| Boot-completed permissions | ❌ **No** | No `RECEIVE_BOOT_COMPLETED` receiver code exists. |

### Key insight on the permission scan

Base44's AI permission scan examines the **visible application source code**. It does not inject permissions for functionality that doesn't exist in the code. Since:

- There is no `SmsManager.sendTextMessage()` call
- There is no `android.telephony.SmsManager` import
- There is no `SEND_SMS` string in any source file
- The actual sending uses `window.location.href = "sms:..."` (a URL scheme, not a permission-gated API)

...the AI scan will **not** add `SEND_SMS` to the AndroidManifest.

---

## 5. Background Execution Audit

### Can SMS be sent automatically in each state?

| State | Automatic SMS possible? | Explanation |
|-------|------------------------|-------------|
| App open in foreground | ❌ No | Even in the foreground, `sendAuto()` fails (no Capacitor, no plugin) and falls back to `sendManual()` which opens the messaging app. The user must tap "Send". |
| App in background | ❌ No | JavaScript in a WebView is suspended when the app is backgrounded. `setInterval` in `BackgroundTaskService` stops executing. No native background service exists. |
| App fully closed | ❌ No | No JavaScript execution. No native service to wake the app. No broadcast receivers. |
| Device restarted | ❌ No | No `RECEIVE_BOOT_COMPLETED` receiver. No native code to start on boot. |

### BackgroundTaskService analysis

`BackgroundTaskService.js` explicitly acknowledges these limitations in its own comments (lines 6–8):

> *"Sprint 8: Implemented foreground fallback using setInterval. Native background execution (WorkManager/BGTaskScheduler) requires platform-specific Capacitor plugins not yet installed."*

And in code (line 67):

```javascript
isNativeBackgroundAvailable() {
  return false; // Will be true when native plugin is installed
}
```

This is a JavaScript `setInterval` that only runs while the WebView's JavaScript engine is active (foreground). It is not a native background task.

---

## 6. Behaviour of `SMSService.send(phone, message, { mode: "auto" })`

### Exact runtime behaviour in the production Base44 Android AAB

When `SMSService.send(phone, message, { mode: "auto" })` is called in the Base44-generated Android app:

1. `send()` checks `mode === "auto"` → `true`
2. `send()` calls `this.isAutoSendSupported()`
3. `isAutoSendSupported()` calls `PlatformService.isAndroid()`
4. `PlatformService.isAndroid()` checks `window.Capacitor` — **`window.Capacitor` is `undefined`** in the Base44 WebView wrapper
5. `PlatformService._detect()` returns `{ platform: "web", isNative: false, ... }`
6. `isAndroid()` returns `false`
7. `isAutoSendSupported()` returns `false`
8. `send()` falls through to `this.sendManual(phone, message)`
9. `sendManual()` executes: `window.location.href = "sms:${phone}?body=${encodedBody}"`
10. Android's intent handler opens the default messaging app with the recipient and body pre-filled
11. The user must tap "Send" in the messaging app

### Classification of the outcome

| Option | Answer |
|--------|--------|
| Sends the SMS directly | ❌ No |
| Opens the default messaging app | ✅ **Yes — this is what happens** |
| Fails with an error | ❌ No (it doesn't fail — it falls back gracefully) |
| Falls back to the manual `sms:` URL scheme | ✅ **Yes — this is the mechanism** |

**The `mode: "auto"` parameter has no effect in the production Base44 Android build.** It always falls back to the manual `sms:` URL scheme, identical to `mode: "manual"`.

---

## 7. Explanation of the Sprint 3 Contradiction

### The contradiction

Earlier Sprint reports (referenced in the project's file history as Sprint 3, Sprint 8, and related reports) described "native Android SMS capabilities" including:
- Automatic/manual sending modes
- SMS permissions
- Delivery callbacks
- Retry handling

The current workspace inspection found that these capabilities are **not functionally present** — the SMS plugin is not installed, `window.Capacitor` won't exist in the Base44 build, and all sending falls back to the `sms:` URL scheme.

### Resolution

The Sprint reports were describing **application-level JavaScript abstractions**, not native functionality. Specifically:

| What the Sprint reports described | What actually exists | Classification |
|----------------------------------|---------------------|----------------|
| `SMSService.sendAuto()` — automatic SMS sending | A JavaScript method that calls `registerPlugin("Sms")` which fails silently and falls back to `sendManual()` | **Application-level abstraction** — no native backing |
| `SMSService.sendManual()` — manual SMS via `sms:` scheme | A JavaScript method that sets `window.location.href = "sms:..."` | **Functional** — works in all environments |
| `SMSService.requestPermission()` — requests `SEND_SMS` | A JavaScript method that calls `Sms.requestPermission()` on a non-existent plugin, returning `"not_supported"` | **Application-level abstraction** — no native backing |
| `SMSService.hasPermission()` — checks `SEND_SMS` status | Returns `"not_supported"` because the plugin doesn't exist | **Application-level abstraction** — no native backing |
| `SMSService.onDelivery()` — delivery confirmation callback | A callback registry that is never triggered because no native delivery events exist | **Placeholder architecture** — callback never fires |
| `SMSService.onFailure()` — failure callback | Same — never triggered by native code | **Placeholder architecture** |
| `SMSService.onRetry()` — retry callback | Same — never triggered | **Placeholder architecture** |
| `BackgroundTaskService` — background task execution | `setInterval`-based polling that only runs in foreground; `isNativeBackgroundAvailable()` returns `false` | **Application-level abstraction** — foreground fallback only |
| `PermissionService._requestSMS()` — runtime SMS permission request | Calls `Sms.requestPermission()` on a non-existent plugin | **Application-level abstraction** — no native backing |

### What happened during the Sprint implementation

The `SMSService.js` file header (lines 11–14) states:

> *"Sprint 8: Android sendAuto() implemented via Capacitor SMS plugin. The plugin is loaded dynamically — if not present (web, or native build without the plugin), it gracefully falls back to manual sending."*

This describes code that was **written to interface with a Capacitor SMS plugin** — but the plugin itself was **never installed**. The `registerPlugin("Sms")` call is a registration for a custom native plugin that does not exist in `package.json` and is not provided by Base44's build pipeline.

The code was architecturally prepared for a Capacitor-based native build that was never possible within Base44's build system. The "graceful fallback" was the actual production behaviour all along.

### Summary of the contradiction

| Claim | Reality |
|-------|---------|
| "Native Android SMS capabilities implemented" | JavaScript service interfaces were created, but no native plugin was installed and Base44 doesn't support Capacitor |
| "Automatic/manual modes" | Code paths exist for both, but "auto" always falls back to "manual" because the plugin is absent |
| "SMS permissions" | Permission request code exists, but always returns "not_supported" because the plugin is absent |
| "Delivery callbacks" | Callback registries exist, but are never triggered because no native delivery events occur |
| "Retry handling" | Retry callback exists, but is never triggered; server-side retry re-queues messages but doesn't send them |

**The Sprint reports described the architecture's intent, not its runtime behaviour.** The code was designed for a native Capacitor build, but Base44's build pipeline produces a WebView wrapper that does not support Capacitor.

---

## 8. Final Android SMS Capability Classification

| Capability | Status in production AAB |
|-----------|------------------------|
| Send SMS without opening another app | ❌ Not functional |
| Send SMS without user tapping Send | ❌ Not functional |
| Send scheduled SMS in background | ❌ Not functional |
| Send scheduled SMS when app is closed | ❌ Not functional |
| Send scheduled SMS after device restart | ❌ Not functional |
| Request `SEND_SMS` permission at runtime | ❌ Not functional |
| Receive delivery confirmations | ❌ Not functional |
| Receive sent-status broadcasts | ❌ Not functional |
| Retry failed sends automatically | ❌ Not functional |
| Open messaging app with pre-filled body | ✅ Functional (via `sms:` URL scheme) |
| Generate AI messages on schedule | ✅ Functional (server-side) |
| Store and manage messages | ✅ Functional (server-side) |
| Notify user of pending messages | ✅ Functional (in-app notifications) |

### Overall classification: **User-assisted**

The production Base44 Android AAB supports only user-assisted SMS sending via the `sms:` URL scheme. No native automatic SMS functionality exists or is injected by Base44.

---

## 9. Evidence and Source References

### Base44 official documentation

| Source | Key quote | URL |
|--------|-----------|-----|
| Submitting your app to app stores | "Your mobile app runs your published Base44 app inside a secure web view. This is a lightweight native wrapper around your web app that opens only your app's URL." | https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores |
| Submitting your app to app stores | "Every mobile app package includes device-level permissions. Base44 uses AI to scan your app and set the permissions it needs. These permissions are not editable in the Base44 interface." | https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores |
| Creating and using your app on mobile | "Current limitations: Native-only features such as push notifications, full offline mode, and HealthKit are not supported yet." | https://docs.base44.com/Building-your-app/Mobile-experience |
| Creating and using your app on mobile | "You can then use third-party tools such as Capacitor, PWABuilder, or Trusted Web Activities (TWA) to wrap your app's URL or exported code... These wrappers are managed outside of Base44." | https://docs.base44.com/Building-your-app/Mobile-experience |

### Project workspace evidence

| File | Evidence |
|------|----------|
| `package.json` | No SMS plugin installed. Capacitor packages present (`@capacitor/core`, `@capacitor/android`, etc.) but these are ignored by Base44's build pipeline. |
| `capacitor.config.ts` | Contains `appId: 'com.borisend.app'` — ignored by Base44's cloud build. |
| `src/services/mobile/SMSService.js` | `sendAuto()` calls `registerPlugin("Sms")` which requires Capacitor runtime. `_getSmsPlugin()` returns `null` when `PlatformService.isNative()` is `false`. `sendManual()` uses `window.location.href = "sms:..."`. |
| `src/services/mobile/PlatformService.js` | `isNative()` checks `window.Capacitor.isNativePlatform()`. In Base44 WebView wrapper, `window.Capacitor` is `undefined`, so `isNative()` returns `false`. |
| `src/services/mobile/BackgroundTaskService.js` | Uses `setInterval` (foreground only). `isNativeBackgroundAvailable()` returns `false`. Comments acknowledge: "Native background execution requires platform-specific Capacitor plugins not yet installed." |
| `src/services/mobile/PermissionService.js` | `_requestSMS()` and `_checkSMS()` call methods on a non-existent plugin. Returns `"not_supported"` when plugin is absent. |
| `src/hooks/useDueMessages.jsx` | Auto-send logic calls `SMSService.send()` which falls back to `sendManual()`. |
| `src/pages/CampaignDetail.jsx` | `handleSend` explicitly passes `{ mode: "manual" }`. |
| `src/pages/SmartInbox.jsx` | `handleSend` and `handleBulkSend` explicitly pass `{ mode: "manual" }`. |
| `base44/functions/generateScheduledMessages/entry.ts` | Server-side scheduler creates `Message` records only — does not send SMS. |
| `base44/functions/markMessageSent/entry.ts` | Updates message status after manual send — does not send SMS. |
| `BoriSend_Technical_Discovery_Report.md` (2026-07-01) | Original audit confirms: "SMS sending uses `sms:` URI scheme", "No native app", "No push notification system exists in the codebase". |

### Distinguishing the three layers

| Layer | What exists | What Base44 adds during packaging | What exists in the final AAB |
|-------|------------|----------------------------------|------------------------------|
| **Visible project source code** | JavaScript service abstractions (`SMSService`, `PermissionService`, `BackgroundTaskService`) with `sendAuto()`, `sendManual()`, permission methods, callback registries. `registerPlugin("Sms")` calls. `capacitor.config.ts`. `@capacitor/*` packages in `package.json`. | N/A (this is the source code layer) | N/A |
| **Base44 packaging layer** | N/A | A WebView wrapper shell. Auto-determined permissions via AI scan (no `SEND_SMS` detected). No Capacitor runtime. No native SMS plugin. No native bridges. `capacitor.config.ts` is ignored. | N/A |
| **Final production AAB** | N/A | N/A | A WebView wrapper that loads the published web app URL. No `window.Capacitor`. No SMS plugin. No `SEND_SMS` permission. No background services. All SMS sending falls back to `sms:` URL scheme. |

---

## 10. Inspection Confirmation

- ✅ No application code was modified
- ✅ No permissions were added, removed, or changed
- ✅ No configuration files were modified
- ✅ No workflows or database records were changed
- ✅ No publishing or release settings were changed
- ✅ No Android build was generated
- ✅ This was an inspection and reporting task only

**Files and sources inspected:**
- `src/services/mobile/SMSService.js`
- `src/services/mobile/PermissionService.js`
- `src/services/mobile/PlatformService.js`
- `src/services/mobile/BackgroundTaskService.js`
- `src/services/mobile/NotificationService.js`
- `src/services/mobile/DeviceService.js`
- `src/services/mobile/LifecycleService.js`
- `src/services/mobile/index.js`
- `src/hooks/useDueMessages.jsx`
- `src/pages/CampaignDetail.jsx`
- `src/pages/SmartInbox.jsx`
- `base44/functions/generateScheduledMessages/entry.ts`
- `base44/functions/markMessageSent/entry.ts`
- `base44/functions/getPendingMessages/entry.ts`
- `capacitor.config.ts`
- `base44/config.jsonc`
- `package.json`
- `index.html`
- `BoriSend_Technical_Discovery_Report.md`
- `CLAUDE.md`
- `AGENTS.md`
- Base44 official documentation (4 documentation queries covering: Android build pipeline, mobile packaging, Capacitor usage, permission generation)

---

## 11. Final Conclusion

### **Base44 does not inject native automatic SMS functionality.**

The Base44-generated Android AAB is a WebView wrapper that loads the published web app. It does not use Capacitor, does not inject native SMS plugins, does not declare `SEND_SMS`, and does not provide background execution infrastructure. The `registerPlugin("Sms")` call in the application code will not resolve to a working implementation. All SMS sending in the production Android app falls back to the user-assisted `sms:` URL scheme, regardless of the `mode` parameter passed to `SMSService.send()`.

The earlier Sprint reports described application-level JavaScript abstractions that were designed for a Capacitor native build — a build path that Base44's pipeline does not support. These abstractions were never connected to actual native functionality.
