# BoriSend — Android SMS Sending Verification Report

**Date:** 2026-07-29  
**Scope:** Inspect and report on the Android SMS sending implementation. Determine whether the app sends SMS automatically or opens the device messaging application for the user to complete the send.  
**Constraint:** Inspection and reporting only. No code, permissions, configuration, workflows, database records, or release settings were modified. No Android build was generated.

---

## Executive Conclusion

**BoriSend's current Android implementation is user-assisted, not fully automatic.**

The codebase contains an architectural scaffold for automatic SMS sending (an `SMSService` with a `sendAuto()` method that attempts to load a Capacitor "Sms" plugin), but the actual native SMS plugin is **not installed** in the project dependencies, and Base44's cloud build system **does not use Capacitor** — it wraps the published web app in a secure WebView. This means:

1. The `registerPlugin("Sms")` call in `SMSService.sendAuto()` will always fail at runtime in a Base44-generated build, causing it to fall back to `sendManual()`.
2. `sendManual()` opens the device's default messaging app with a pre-filled body via the `sms:` URL scheme — the user must tap "Send" manually.
3. All UI send buttons in `CampaignDetail.jsx` and `SmartInbox.jsx` explicitly pass `{ mode: "manual" }`, bypassing the auto-send path entirely.
4. The `useDueMessages` hook contains auto-send logic, but it would also fall back to manual because the plugin is unavailable.
5. The server-side scheduler (`generateScheduledMessages`) only creates `Message` database records — it does not trigger any SMS sending.
6. No `SEND_SMS` permission is declared anywhere in the project, and Base44 does not allow manual editing of `AndroidManifest.xml` permissions.

**Classification: User-assisted**

**Recommendation: Proceed with user-assisted SMS**

---

## 1. Current SMS Implementation

### Method identified

The app uses the **`sms:` URL scheme** (an Android SMS intent) to open the device's default messaging application with a pre-filled recipient and body. The user must tap "Send" manually.

There is no native Android `SmsManager` call, no `SEND_SMS` permission usage, and no installed Capacitor/Cordova SMS plugin.

### Relevant files

| File | Role |
|------|------|
| `src/services/mobile/SMSService.js` | SMS abstraction layer; contains `sendAuto()`, `sendManual()`, `send()`, permission methods |
| `src/services/mobile/PermissionService.js` | Permission abstraction; contains `_requestSMS()` and `_checkSMS()` for Android `SEND_SMS` |
| `src/services/mobile/PlatformService.js` | Platform detection (web / Android / iOS via `window.Capacitor`) |
| `src/services/mobile/BackgroundTaskService.js` | Background task abstraction; uses `setInterval` (foreground only) |
| `src/hooks/useDueMessages.jsx` | Hook that polls for due messages and contains auto-send trigger logic |
| `src/pages/CampaignDetail.jsx` | Campaign detail page; `MessageItem.handleSend()` calls `SMSService.send()` with `mode: "manual"` |
| `src/pages/SmartInbox.jsx` | Inbox page; `handleSend()` and `handleBulkSend()` both call `SMSService.send()` with `mode: "manual"` |
| `base44/functions/generateScheduledMessages/entry.ts` | Server-side scheduler; creates `Message` records only — does not send SMS |
| `base44/functions/getPendingMessages/entry.ts` | Returns due messages to the app; does not send SMS |
| `base44/functions/markMessageSent/entry.ts` | Updates message status to "sent" after the user manually sends; does not send SMS |
| `capacitor.config.ts` | Capacitor config with `appId: 'com.borisend.app'` — used only for local manual builds, not Base44 cloud builds |
| `package.json` | Dependency manifest — **no SMS plugin installed** |

### The `sendManual()` method (actual sending path)

From `src/services/mobile/SMSService.js` (lines 170–181):

```javascript
async sendManual(phone, message) {
  const encodedBody = encodeURIComponent(message);
  if (PlatformService.isIOS()) {
    window.location.href = `sms:${phone}&body=${encodedBody}`;
  } else {
    window.location.href = `sms:${phone}?body=${encodedBody}`;
  }
  return { success: true, method: "manual" };
}
```

This is the `sms:` URI scheme. On Android, this resolves to `ACTION_SENDTO` / `smsto:` and opens the user's chosen default SMS app with the phone number and body pre-filled. The user must tap the send button.

### The `sendAuto()` method (architectural scaffold — not functional)

From `src/services/mobile/SMSService.js` (lines 93–164):

```javascript
async sendAuto(phone, message) {
  if (!PlatformService.isAndroid()) {
    return this.sendManual(phone, message);
  }
  const Sms = await _getSmsPlugin();
  if (!Sms) {
    console.info("[SMSService] SMS plugin not available — falling back to manual");
    return this.sendManual(phone, message);
  }
  // ... permission check and Sms.send() call ...
}
```

The `_getSmsPlugin()` function (lines 38–48) attempts to load a custom Capacitor plugin via `registerPlugin("Sms")`:

```javascript
async function _getSmsPlugin() {
  if (_SmsPlugin) return _SmsPlugin;
  if (!PlatformService.isNative()) return null;
  try {
    const { registerPlugin } = await import("@capacitor/core");
    _SmsPlugin = registerPlugin("Sms");
  } catch {
    _SmsPlugin = null;
  }
  return _SmsPlugin;
}
```

**Why this is not functional:**

1. **No SMS plugin in `package.json`:** The installed Capacitor packages are `@capacitor/core`, `@capacitor/app`, `@capacitor/device`, `@capacitor/push-notifications`, `@capacitor/android`, `@capacitor/ios`, and `@capacitor/cli`. There is no `@capacitor-community/sms`, `cordova-plugin-sms`, or any other SMS package. `registerPlugin("Sms")` would return a proxy that throws on any method call because no native implementation is registered.

2. **Base44 cloud builds do not use Capacitor:** Per Base44's official documentation (see Section 8), the Base44-generated Android package is a WebView wrapper around the published web app — not a Capacitor build. Even though `capacitor.config.ts` exists and `@capacitor/core` is in `package.json`, the Base44 build pipeline ignores Capacitor. `window.Capacitor` will not be present, `PlatformService.isNative()` will return `false`, and `_getSmsPlugin()` will return `null`, causing `sendAuto()` to fall back to `sendManual()`.

3. **No `SEND_SMS` permission:** Even if the plugin were installed, no `SEND_SMS` permission is declared anywhere in the project. Base44's AI permission scan would not detect SMS usage because the actual sending uses the `sms:` URL scheme (which requires no permission), not the native `SmsManager`.

---

## 2. Automatic Sending Behaviour

| Capability | Supported? | Explanation |
|-----------|-----------|-------------|
| Send an SMS without opening another app | ❌ No | The `sms:` URL scheme always opens the default messaging app. The `sendAuto()` path that would use `SmsManager` is not functional (no plugin, no Capacitor in Base44 builds). |
| Send an SMS without the user tapping Send | ❌ No | `sendManual()` pre-fills the body but the user must tap "Send" in the messaging app. |
| Send scheduled SMS while the app is in the background | ❌ No | `BackgroundTaskService` uses `setInterval` which only runs while the app's JavaScript is executing (foreground). `isNativeBackgroundAvailable()` returns `false`. No WorkManager or JobScheduler is configured. |
| Send scheduled SMS when the app is closed | ❌ No | No background service, broadcast receiver, or alarm manager exists. When the app is closed, all JavaScript execution stops. |
| Send multiple scheduled messages automatically | ❌ No | Bulk send in `SmartInbox.jsx` (`handleBulkSend`) iterates through selected messages but calls `SMSService.send()` with `mode: "manual"` for each — each one opens the messaging app individually. |
| Retry failed automatic sends | ❌ No | The `onRetry` callback in `SMSService` exists but is never triggered because `sendAuto()` never succeeds. The server-side scheduler re-queues failed messages (sets status back to "approved") but does not send them. |
| Record delivery, failure and retry status | ⚠️ Partial | `markMessageSent` records "sent" status after the user confirms manual sending. The `onDelivery`, `onFailure`, and `onRetry` callbacks exist in `SMSService` but are never invoked because no native plugin is active. Delivery receipts (broadcast intents) are not implemented. |

### Classification: **User-assisted**

The app generates messages via AI, stores them in the database, and presents them to the user. The user must review, approve, and then tap "Send via SMS" which opens the device's messaging app with a pre-filled body. The user must then tap "Send" in the messaging app to complete the send.

---

## 3. Permissions Audit

| Permission | Present? | Required? | Requested at runtime? | Google Play impact |
|-----------|----------|-----------|----------------------|-------------------|
| `android.permission.SEND_SMS` | ❌ Not present | Would be required for automatic sending via `SmsManager`. Not required for `sms:` URL scheme. | N/A — no plugin to request it | If declared, would trigger Google Play's SMS & Call Log permission policy review. Not declared, so no policy impact. |
| `android.permission.READ_SMS` | ❌ Not present | Not required for BoriSend's use case | N/A | N/A |
| `android.permission.RECEIVE_SMS` | ❌ Not present | Not required — app does not receive SMS | N/A | N/A |
| `android.permission.READ_PHONE_STATE` | ❌ Not present | Not required | N/A | N/A |
| `android.permission.POST_NOTIFICATIONS` | ⚠️ Possibly auto-detected | Required for push notifications (Android 13+) | Yes, via `@capacitor/push-notifications` if Capacitor were used; via browser `Notification.requestPermission()` in WebView | Standard notification permission — low Play Store risk |
| Background execution / alarm / foreground-service | ❌ Not present | Would be required for background SMS sending | N/A | N/A |
| `RECEIVE_BOOT_COMPLETED` | ❌ Not present | Would be needed to restart scheduled tasks after device reboot | N/A | N/A |
| `WAKE_LOCK` | ❌ Not present | Would be needed for background task execution | N/A | N/A |
| `FOREGROUND_SERVICE` | ❌ Not present | Would be needed for a foreground SMS delivery service | N/A | N/A |

**Key finding:** Base44's documentation states that AndroidManifest permissions are auto-determined by an AI scan and are **not editable** by the developer. Because the actual SMS implementation uses the `sms:` URL scheme (no permission needed) rather than `SmsManager` (permission needed), the AI scan would not detect a need for `SEND_SMS`. No SMS permission will be present in the generated build.

---

## 4. Default SMS App Requirement

### Does automatic sending require BoriSend to be the default SMS app?

**Yes, under Google Play policy.** Google Play's SMS and Call Log permission policy restricts apps that request `SEND_SMS` to specific permitted use cases (SMS handlers, voice communicators, call management). Even with `SEND_SMS`, an app that is not the default SMS handler may face rejection unless it qualifies under an exception.

### Can `SEND_SMS` work without being the default SMS app?

**Technically yes, but not under Google Play policy.** The `SmsManager.sendTextMessage()` API can send an SMS without the app being the default SMS handler. However, Google Play's policy effectively restricts `SEND_SMS` to apps that are registered as the default SMS handler or that qualify for a specific exception.

### Would becoming the default SMS app improve automatic sending?

**Yes, it would enable true unattended sending.** If BoriSend were the default SMS app, it could use `SmsManager` directly, handle incoming SMS, and manage the full messaging experience. However, this would require:

1. A full SMS user interface (conversation list, thread view, compose screen, search, media handling)
2. An `SmsManager`-based sending implementation
3. Broadcast receivers for incoming SMS (`SMS_RECEIVED` / `SMS_DELIVER`)
4. A content provider for MMS
5. Registration as the default SMS handler via `Telephony.Sms.getDefaultSmsPackage()`
6. A complete UI for the user to set BoriSend as their default SMS app

### Does BoriSend currently meet those requirements?

**No.** BoriSend has none of the above. It is a messaging **scheduling and AI generation** app, not a full SMS client. It does not display conversation threads, handle incoming SMS, or provide any SMS management UI.

### Conclusion on default SMS app

Becoming the default SMS app is not practical for BoriSend's use case. It would require building a complete SMS client application, which is a fundamentally different product. The current `sms:` URL scheme approach is the appropriate implementation for a scheduling app that relies on the user's existing SMS client.

---

## 5. Google Play Policy Assessment

### Google Play SMS and Call Log Permission Policy

Google Play restricts the use of SMS and Call Log permissions to apps whose **core function** requires them. Permitted use cases include:

- Default SMS handlers
- Default dialer / phone apps
- Call management and caller ID apps
- VoIP and voice communicators
- Companion device apps
- Enterprise device management

### Does BoriSend's use of SMS qualify?

**BoriSend does not request `SEND_SMS` or any SMS permission.** The app uses the `sms:` URL scheme, which is a standard Android intent that opens the user's default messaging app. This requires **no special permission** and is **not subject** to the SMS and Call Log permission policy.

### Would scheduled personal or business messages qualify as a permitted core function?

**No.** Scheduled message sending (even for personal or business relationship management) does not qualify as a permitted core function under Google Play's SMS policy. If BoriSend requested `SEND_SMS`, it would likely be rejected unless it became a full default SMS handler.

### Would Google Play reject the app for requesting `SEND_SMS`?

**Yes, almost certainly.** If `SEND_SMS` were declared, Google Play would require:
1. A Permissions Declaration form explaining the use case
2. Justification that the app's core function requires SMS access
3. A video demonstration of the feature
4. Evidence that the app meets one of the permitted use cases

BoriSend's "automated relationship messaging" use case does not fit any permitted exception. The declaration would likely be rejected.

### Does publishing through a closed test change the policy requirement?

**No.** Closed testing does not exempt the app from the SMS and Call Log permission policy. Google Play applies the same permission review to closed test tracks as it does to production. Apps requesting `SEND_SMS` in a closed test track must still submit a valid declaration form.

### Is the SMS intent the safer Play Store implementation?

**Yes.** The `sms:` URL scheme (intent-based) is the safest implementation for Google Play:
- Requires no permissions
- Is not subject to the SMS and Call Log permission policy
- Opens the user's preferred messaging app
- Gives the user full control over the send action
- No declaration form or review required

**The current implementation is the correct approach for Google Play compliance.**

---

## 6. Platform Comparison

| Platform | Expected sending method | User action required | Automatic sending possible |
|----------|------------------------|---------------------|---------------------------|
| **Web/PWA** | `sms:` URL scheme (`window.location.href = "sms:..."`) | Yes — opens messaging app, user taps Send | ❌ No |
| **Android (Base44 build)** | `sms:` URL scheme (`window.location.href = "sms:..."`) | Yes — opens default messaging app, user taps Send | ❌ No (no Capacitor, no native plugin, no `SEND_SMS` permission) |
| **iOS (Base44 build)** | `sms:` URL scheme (`window.location.href = "sms:..."` with `&body=`) | Yes — opens Messages app, user taps Send | ❌ No (iOS does not allow unattended SMS sending by any app) |

All three platforms behave identically: the user must manually confirm each send.

---

## 7. Scheduling Engine Audit

### What the scheduler actually does

The `generateScheduledMessages` backend function (`base44/functions/generateScheduledMessages/entry.ts`) runs on Base44's server-side infrastructure (triggered by a scheduled automation). It:

1. Finds all active campaigns
2. Checks if the current time matches the campaign's schedule
3. Checks subscription access and message quota
4. Calls the AI (`generateMessage`) to generate message content
5. Creates `Message` database records with status `"pending"` (manual approval) or `"approved"` (automatic approval mode)
6. Creates `Notification` records to alert the user
7. Updates the campaign's `next_scheduled` timestamp

**The scheduler does NOT send SMS.** It only creates database records. The actual SMS sending is always triggered by the user opening the app and tapping "Send via SMS."

### What happens when a scheduled message becomes due

| Situation | What happens |
|-----------|-------------|
| **App open in foreground** | `useDueMessages` hook polls `getPendingMessages` every 60 seconds. If due messages exist and `deliveryMode === "auto"`, it calls `sendNow()` which calls `SMSService.send()`. Since no plugin is available, it falls back to `sendManual()` — opens messaging app. In practice, all UI buttons pass `mode: "manual"` explicitly. |
| **App in background** | `BackgroundTaskService` uses `setInterval` which does not execute when the app is backgrounded (JavaScript is suspended). No messages are sent. The user sees a push notification (if push is configured) and must open the app to send. |
| **App fully closed** | No JavaScript execution. No messages are sent. The server-side scheduler still creates Message records and Notifications, but the user must open the app to send. |
| **Device restarted** | No `RECEIVE_BOOT_COMPLETED` receiver. No tasks restart automatically. The user must open the app. |
| **No internet connection** | The server-side scheduler cannot run (it's a cloud function). The app cannot fetch due messages from the API. `sendManual()` might still work if the user has cached messages, as the `sms:` scheme doesn't require internet. |
| **SMS permission denied** | Not applicable — no SMS permission is requested. The `sms:` URL scheme works without any permission. If the user has no default messaging app set, Android prompts them to choose one. |
| **SIM unavailable** | The `sms:` intent still opens the messaging app, but the messaging app itself will fail to send. BoriSend has no way to detect this because it doesn't receive delivery confirmations. |
| **Dual-SIM device** | The `sms:` intent opens the messaging app, which handles SIM selection. BoriSend has no control over which SIM is used. |
| **Battery optimisation enabled** | No effect on the current implementation because there are no background tasks to optimise. The `setInterval` in `BackgroundTaskService` is already foreground-only. |

---

## 8. Base44 Packaging Limitations

Per Base44's official documentation:

> "Your Base44 mobile app is a secure web view wrapper around your published Base44 app — it is not a full native app."
>
> "Capacitor plugins are not supported. Base44 does not use Capacitor or any native plugin framework."
>
> "Native-only features are not supported, including push notifications, full offline mode, and custom native SDKs."
>
> "These permissions are not editable in the Base44 interface."

### Capability matrix

| Capability | Supported by Base44? | Status in BoriSend |
|-----------|---------------------|-------------------|
| Native `SEND_SMS` via `SmsManager` | ❌ No | Not functional — no Capacitor, no native plugin |
| Runtime SMS permission requests | ❌ No | `PermissionService._requestSMS()` would fail — no plugin, no permission to request |
| Background jobs (WorkManager/JobScheduler) | ❌ No | `BackgroundTaskService` uses `setInterval` (foreground only); `isNativeBackgroundAvailable()` returns `false` |
| Foreground services | ❌ No | Not implemented, not possible in Base44 WebView wrapper |
| WorkManager | ❌ No | Not available — no native code execution |
| AlarmManager | ❌ No | Not available — no native code execution |
| Broadcast receivers | ❌ No | Not available — no native code execution |
| Boot-completed receivers | ❌ No | Not available — no native code execution |
| Delivery and sent-result receivers | ❌ No | Not available — no native code execution |
| Custom native Capacitor plugins | ❌ No | Base44 does not use Capacitor in cloud builds |
| `sms:` URL scheme (intent) | ✅ Yes | ✅ Working — this is the actual implementation |
| Push notifications (FCM) | ⚠️ Limited | `@capacitor/push-notifications` is installed but Base44 cloud builds do not use Capacitor. Push may not function without a native build. |
| WebView / JavaScript execution | ✅ Yes | ✅ Working — all app logic runs in WebView |

### Key Base44 platform limitations preventing true automatic SMS sending

1. **No Capacitor support in cloud builds:** Base44 generates a WebView wrapper, not a Capacitor app. All `registerPlugin()` calls fail silently.
2. **No native code execution:** The app runs entirely in a WebView. No `SmsManager`, no `WorkManager`, no `AlarmManager`, no broadcast receivers.
3. **No editable AndroidManifest:** Permissions are auto-determined by an AI scan. Even if the code referenced `SEND_SMS`, the AI scan would not detect actual `SmsManager` usage (because there is none) and would not declare the permission.
4. **No background execution:** JavaScript in a WebView is suspended when the app is backgrounded. There is no mechanism to run code in the background.

### What would be required for true automatic SMS sending

To achieve fully automatic, unattended SMS sending, the following would be needed — none of which are possible within Base44's current packaging model:

1. Export the app code and build a custom Capacitor or native Android wrapper
2. Install a Capacitor SMS plugin (e.g., `@capacitor-community/sms`) or write a custom native plugin
3. Declare `SEND_SMS` in `AndroidManifest.xml`
4. Implement runtime permission request flow
5. Implement a `WorkManager` or `ForegroundService` for background execution
6. Implement broadcast receivers for sent/delivery confirmations
7. Implement `RECEIVE_BOOT_COMPLETED` for device restart resilience
8. Submit a Google Play Permissions Declaration form (which would likely be rejected for BoriSend's use case)
9. Alternatively, build a full default SMS handler app

---

## 9. Platform Comparison Table

| Aspect | Web/PWA | Android (Base44 build) | iOS (Base44 build) |
|--------|---------|----------------------|-------------------|
| Sending method | `sms:` URL scheme | `sms:` URL scheme | `sms:` URL scheme (`&body=`) |
| User action required | Tap "Send via SMS" → messaging app opens → tap Send | Tap "Send via SMS" → messaging app opens → tap Send | Tap "Send via SMS" → Messages app opens → tap Send |
| Automatic sending | ❌ Not possible | ❌ Not possible (no Capacitor, no plugin, no permission) | ❌ Not possible (iOS prohibits unattended SMS) |
| Background sending | ❌ Not possible | ❌ Not possible (no WorkManager) | ❌ Not possible |
| Permission required | None | None (sms: scheme needs no permission) | None |
| Google Play / App Store risk | N/A | Low — no SMS permission declared | Low — uses standard URL scheme |

---

## 10. Recommended Release Approach

### Current state is ready for release as user-assisted SMS

The current implementation is:
- ✅ **Functionally correct** — messages are generated, stored, and presented to the user
- ✅ **Google Play compliant** — no SMS permissions requested, no policy risk
- ✅ **Safe** — user reviews and approves every message before sending
- ✅ **Appropriate for the use case** — relationship messaging benefits from human review
- ✅ **Cross-platform consistent** — identical behaviour on Web, Android, and iOS

### What to communicate to users

The app's marketing and onboarding should clearly set the expectation that:
- BoriSend generates and schedules personalised messages
- The user receives a notification when a message is ready
- The user reviews, approves, and taps "Send via SMS"
- The device's messaging app opens with the message pre-filled
- The user taps "Send" to complete the send

This is a **feature, not a limitation** — it ensures the user maintains full control over what is sent in their name, which is especially important for personal and professional relationship messaging.

### What NOT to do

- ❌ Do not attempt to add `SEND_SMS` permission — it would trigger Google Play policy review and likely be rejected
- ❌ Do not attempt to install a Capacitor SMS plugin — Base44 cloud builds do not use Capacitor
- ❌ Do not attempt to become the default SMS app — it would require building a completely different product
- ❌ Do not market the app as "fully automatic SMS sending" — it is user-assisted by design

---

## 11. Final Recommendation

### **Proceed with user-assisted SMS**

The current implementation is the correct approach for BoriSend's use case, Google Play compliance, and the Base44 platform's capabilities. No changes to the SMS implementation are needed before generating the Android production build.

---

## 12. Inspection Confirmation

- ✅ No application code was modified
- ✅ No permissions were added, removed, or changed
- ✅ No configuration files were modified
- ✅ No database records were created, updated, or deleted
- ✅ No release settings were changed
- ✅ No Android build was generated
- ✅ This was an inspection and reporting task only

**Files inspected:**
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
- `package.json`
- Base44 official documentation (Android packaging, permissions, app store submission)
