# BoriSend — Native Build & Real-Device QA Guide

**Canonical reference for iOS and Android native builds.**
This is the single source of truth for native setup. Do not scatter native
instructions across unrelated files.

---

## 1. Requirements

- Node.js 18+ and npm
- Capacitor CLI 6.x (already in devDependencies)
- Xcode 15+ (macOS only) for iOS
- Android Studio (Iguana+) with Android SDK 34+ for Android
- A physical iOS device (iPhone) for real-device QA
- A physical Android device for real-device QA
- Apple Developer account (for iOS signing, APNs, App Store)
- Google Play Console developer account (for Android, FCM)

## 2. Native Stack (as of RC19)

| Component | Version | Status |
|---|---|---|
| @capacitor/core | ^6.2.1 | Installed |
| @capacitor/cli | ^6.2.1 | Installed |
| @capacitor/ios | ^6.2.1 | Installed |
| @capacitor/android | ^6.2.1 | Installed |
| @capacitor/app | ^6.0.3 | Installed |
| @capacitor/device | ^6.0.3 | Installed |
| @capacitor/push-notifications | ^6.0.5 | Installed |
| @capacitor-community/contacts | ^6.1.1 | Installed |
| @capacitor/splash-screen | ^6.0.4 | Installed (configured via `registerPlugin`) |
| @capacitor/status-bar | ^6.0.3 | Installed (configured via `registerPlugin`) |
| @capacitor/screen-orientation | ^6.0.4 | Installed (configured via `registerPlugin`) |
| @capacitor/geolocation | ^6.1.1 | Installed (one-shot current location only) |
| @capacitor/local-notifications | ^6.1.3 | Installed |
| Custom "Geofence" plugin (`registerPlugin("Geofence")`) | — | **JS bridge complete; native source LOCAL ACTION REQUIRED (§12)** |
| Custom "Sms" plugin (`registerPlugin("Sms")`) | — | **Not used — user-assisted `sms:` composer only (§10)** |

`capacitor.config.ts`:
- appId: `com.base6a3f3ae0473f4e5dce013c32.app` (RC20.2 Part 2 canonical ID)
- webDir: `dist`
- `plugins` block: SplashScreen (Magenta #DA1B8A), StatusBar (LIGHT), ScreenOrientation (portrait)
- `ios.contentInset: 'always'`
- `server.iosScheme/androidScheme: 'https'`

## 3. Build & Sync

```bash
# 1. Build the web bundle
npm run build

# 2. Add native platforms (FIRST TIME ONLY — run once each)
npx cap add ios
npx cap add android

# 3. Sync web assets + native plugins (run after every web build)
npx cap sync ios
npx cap sync android

# 4. Open native IDEs
npx cap open ios     # opens Xcode
npx cap open android  # opens Android Studio
```

> The `ios/` and `android/` project directories do **not** exist in this
> workspace today. They are generated locally by `npx cap add` and live
> outside source control until committed. Base44 cannot generate them
> remotely — the Product Owner must run `npx cap add` locally.

## 4. iOS Setup

### 4.1 Xcode
1. Open `ios/App/App.xcworkspace` in Xcode.
2. Set the **Team** (Apple Developer account) under Signing & Capabilities.
3. Set **Bundle Identifier** to `com.base6a3f3ae0473f4e5dce013c32.app` (must match `appId`).
4. Deployment target: iOS 13.0+ (Capacitor 6 minimum).

### 4.2 Info.plist — required keys
Add the following usage-description strings (Apple rejects builds without them):

| Key | Value (example) |
|---|---|
| `NSContactsUsageDescription` | "Choose contacts from your phone to add to BoriSend. You select who to import." |
| `NSUserTrackingUsageDescription` | _(omit — not used)_ |
| `NSLocationWhenInUseUsageDescription` | _(add only if location triggers are enabled — see §10)_ |

> The system contact picker (`CNContactPickerViewController`) does **not**
> require `NSContactsUsageDescription` at build time for the picker itself,
> but the `@capacitor-community/contacts` plugin calls `checkPermissions`
> which references the Contacts entitlement — include the key to be safe.

### 4.3 Capabilities
- **Push Notifications** — required for APNs. Add under Signing & Capabilities.
- **Background Modes** — add **only** if background fetch/processing is
  implemented. Currently NOT required (scheduler is server-side).

### 4.4 APNs
1. In Apple Developer → Keys, create an **Authentication Key** (p8) with
   the APNs service enabled.
2. Download the `.p8` file, note the **Key ID** and **Team ID**.
3. Upload the key to Firebase (if using FCM) or configure directly in your
   push provider.
4. Do NOT use legacy APNs certificates — use the .p8 key.

### 4.5 URL Scheme (deep links)
In Xcode → App → Info → URL Types, add:
- **URL Scheme**: `borisend`

This registers `borisend://` links. Capacitor's `appUrlOpen` listener fires
when the app is opened via this scheme.

### 4.6 App Icon & Splash
- **App Icon**: provide a 1024×1024 master icon in the App Icon asset set.
  BoriSend's canonical logo is a **horizontal wordmark** — a dedicated
  **square/maskable** icon asset is still required. Do not use the
  horizontal logo in the square icon slot.
- **Splash**: `@capacitor/splash-screen` is NOT installed. Without it, iOS
  shows a blank launch screen (white or the storyboard default). To get the
  desired solid-Magenta + static White logo native splash, install
  `@capacitor/splash-screen` and configure it in `capacitor.config.ts`.
  See §11 for the desired architecture.

## 5. Android Setup

### 5.1 Android Studio
1. Open `android/` in Android Studio.
2. Confirm `compileSdk` / `targetSdk` ≥ 34 (Capacitor 6 default).
3. Confirm `minSdk` ≥ 23 (Capacitor 6 minimum).

### 5.2 AndroidManifest.xml — permissions
```xml
<!-- Contacts (system picker — see §9 for whether full READ_CONTACTS is needed) -->
<uses-permission android:name="android.permission.READ_CONTACTS" />

<!-- Push notifications (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- SMS (only if auto-send is enabled — see §12) -->
<uses-permission android:name="android.permission.SEND_SMS" />

<!-- Location (only if geofence triggers are enabled — see §10) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

### 5.3 FCM (Firebase Cloud Messaging)
1. Create a Firebase project at console.firebase.google.com.
2. Add an **Android app** with package name `com.base6a3f3ae0473f4e5dce013c32.app`.
3. Download `google-services.json` and place it in `android/app/`.
4. Add the Firebase Gradle plugin to `android/build.gradle` and
   `android/app/build.gradle` per Capacitor push-notifications docs.
5. Upload the APNs .p8 key to Firebase (Project Settings → Cloud Messaging)
   so iOS push is also routed through FCM (single push provider).

### 5.4 Notification channel
BoriSend notifications should use a named channel (e.g. `borisend_default`).
The `@capacitor/push-notifications` plugin creates a default channel
automatically. If you want a custom channel name/description, configure it
in `capacitor.config.ts` under `plugins.PushNotifications`.

### 5.5 URL Scheme (deep links)
In `AndroidManifest.xml`, add an intent filter to the main activity:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="borisend" />
</intent-filter>
```

### 5.6 App Icon & Splash
- **App Icon**: provide adaptive icons (foreground + background) at the
  required mipmap densities. A square/maskable icon is required — the
  horizontal BoriSend logo is not suitable for the round/squircle slots.
- **Splash**: `@capacitor/splash-screen` is NOT installed. Android shows a
  default white launch screen until the WebView loads. Install the plugin
  and configure a Magenta background + static White logo for visual
  continuity with the JS StartupScreen.

## 6. Contacts

- Plugin: `@capacitor-community/contacts@6.1.1`
- iOS: uses `CNContactPickerViewController` (system picker, single-select).
  No full address-book access. `NSContactsUsageDescription` recommended.
- Android: uses the Contact Picker Intent. The plugin may require
  `READ_CONTACTS` to read the picked contact's phone number details —
  verify the actual permission gate on a real device (Part 6 of RC19).
- W3C fallback (`navigator.contacts.select`) is used only on Chrome Android
  web/PWA, not in the native app.
- Import consumes **0 Recipient Units** (commercial definition).

## 7. Push Notifications

- Plugin: `@capacitor/push-notifications@6.0.5`
- iOS: APNs (configure .p8 key + Push Notifications capability).
- Android: FCM (configure `google-services.json` + Firebase Gradle plugin).
- Token storage: `DeviceToken` entity (backend), `localStorage` key
  `borisend_device_token` (client).
- Registration is triggered from **Notification Settings** page (manual
  toggle). It is NOT auto-triggered on app launch.
- Foreground notifications use the browser `Notification` API — on native
  this may not display correctly; consider a local-notification plugin for
  foreground display.

## 8. Deep Links

- Scheme: `borisend://`
- Routes: `message/{id}`, `communication-plan/{id}`, `notification/{id}`,
  `subscription`, `referrals`, `addon-renewal/{id}`.
- iOS: register URL Scheme `borisend` in Xcode URL Types.
- Android: add intent filter with `android:scheme="borisend"`.
- Deep links are handled by `DeepLinkHandler` component via
  `LifecycleService.on('deepLinkOpened')`.
- Auth returnTo: deep links are NOT preserved through the login flow
  currently — a cold-start deep link to a protected route redirects to
  login and loses the original target. This is a P1 gap.

## 9. Permissions Matrix

| Permission | Why | When requested | iOS | Android |
|---|---|---|---|---|
| Notifications | Reminders, quota, message-ready | Notification Settings (manual) | Info.plist + Capability | POST_NOTIFICATIONS (API 33+) |
| Contacts | Import device contacts | Contact picker trigger | NSContactsUsageDescription | READ_CONTACTS (verify) |
| Location (geofence) | Smart Message arrival/departure triggers | Smart Message activation (contextual) | NSLocationWhenInUse + NSLocationAlwaysAndWhenInUse | ACCESS_FINE_LOCATION (+ ACCESS_BACKGROUND_LOCATION on API 31+) |

**No `SEND_SMS` permission is requested on either platform.** BoriSend uses
the user-assisted `sms:` composer only — the user is always responsible for
the final Send action (§10). No permissions are requested on startup — all
are triggered by user action.

## 10. SMS — User-Assisted Composer (RC20.2 Part 5)

- Architecture: `SMSService` is the single abstraction layer.
- **Both iOS and Android use the user-assisted `sms:` composer.** BoriSend
  NEVER automatically sends SMS. The user is always responsible for the
  final Send action.
- iOS: opens `sms:` URL with pre-filled body. User must tap Send.
- Android: opens `sms:` intent with pre-filled body. User must tap Send.
- **No `SEND_SMS` permission is added.** No direct/background SMS sending
  is introduced. The custom `Sms` auto-send plugin is NOT used.
- Status semantics: opening the composer sets `composer_opened_at` only —
  it does NOT mark the message as `sent`. The message remains
  `pending`/`approved` (user-action-required) until the user explicitly
  confirms via `markMessageSent({status:'sent'})`. A geofence event likewise
  NEVER marks an SMS as sent.
- Smart Message **Trigger Now** is an explicit user action on already-authored
  fixed text. Its execution creates the resulting Message as `approved` and
  navigates immediately to the first prepared Message, so the user lands on
  the `Open in Messages` action rather than searching the inbox. If multiple
  recipients are triggered, the remaining approved messages stay ready in
  the inbox.
- `manageSmartMessage`/`executeSmartMessage` preserve `composer_opened_at`
  semantics. Do not rewrite working SMS functionality.

## 11. Splash / Startup

**Desired architecture:**
1. **Native splash** (OS-controlled, before JS loads): solid Magenta
   `#DA1B8A` + static White BoriSend logo.
2. **JS StartupScreen** (after JS loads): same Magenta background + rotating
   White logo (CSS animation, `prefers-reduced-motion` aware).

**Current state:**
- `@capacitor/splash-screen` is NOT installed.
- `index.html` sets `background-color: #DA1B8A` on `html, body, #root` —
  this gives a Magenta flash before JS loads, which is a partial substitute.
- The JS `StartupScreen` component renders the Magenta + rotating logo.
- **Risk**: without the native splash plugin, there may be a brief white
  flash on some devices before the Magenta `index.html` background paints.

**Required to complete:**
- Install `@capacitor/splash-screen`.
- Generate a static White-logo-on-Magenta PNG asset (1080×1080+ for iOS,
  appropriate bitmap drawable for Android).
- Configure `splashScreen` in `capacitor.config.ts` with Magenta background
  color + the static logo image.

## 12. Location / Geofencing — RC20.2 (PRIMARY NATIVE OBJECTIVE)

### 12.1 Status
- Smart Message trigger types `location_arrival` / `location_departure`
  exist in the schema, trigger calculator, and Create-Smart-Message UI and are
  selectable as first-class trigger options. Geoapify autocomplete + "Use my
  current location" are COMPLETE. Activation validates coordinates/radius,
  requests native location permission contextually, persists the canonical
  `borisend_sm_{smart_message_id}` geofence identifier, and requests an
  immediate registration reconciliation.
- `calculateNextTrigger` returns `null` for location triggers (non-
  deterministic — fires on OS geofence transition only).
- **JS bridge: COMPLETE.** `GeofenceService` (src/services/mobile) exposes
  `isSupported`, `checkPermission`, `requestPermission`, `openSettings`,
  `register`, `unregister`, `unregisterAll`, `reconcile`, `onTransition`,
  `getCurrentLocation`. It uses `registerPlugin("Geofence")` from
  `@capacitor/core` so native code never enters the web bundle.
- **Native plugin: LOCAL ACTION REQUIRED.** `registerPlugin("Geofence")`
  resolves to a custom Capacitor local plugin whose native source (iOS
  Swift + Android Kotlin) MUST be written in the generated `ios/` and
  `android/` projects. Until that native source exists, `isSupported()`
  returns `false` and all methods are safe no-ops on web/preview.

### 12.2 Privacy / battery rules (enforced)
- NO continuous GPS polling. NO setInterval location polling.
- NO continuous watchPosition loops. NO location-history storage.
- NO route tracking. NO periodic location upload.
- Uses OS geofence region-transition mechanisms ONLY (iOS
  `CLCircularRegion` / Android `GeofencingClient`).
- Stores only configured geofence definitions + transition events.

### 12.3 Deterministic geofence identifiers
Every BoriSend geofence is registered with id `borisend_sm_{smart_message_id}`.
This deterministic prefix enables stale cleanup (`removeAllGeofences` clears
all `borisend_sm_*`), sign-out/account-deletion cleanup, and event→Smart
Message association without exposing message content in the id.

### 12.4 Registration / reconciliation / cleanup
- **Register:** `register({ id, latitude, longitude, radiusMeters, transitionType })`.
  `transitionType` = `enter` (arrival) | `exit` (departure).
- **Reconcile:** `reconcile(activeSmartMessages)` calls `unregisterAll()`
  FIRST (removes stale/deleted/deactivated/changed geofences) then
  re-registers the current active location set (enforces iOS 20 / Android
  100 limit). `GeofenceController` runs reconciliation at authenticated app
  startup, app resume, and after Smart Message create/update/toggle/delete.
  Reconciliation also runs with an empty active set so the last stale native
  region is removed when no location Smart Messages remain.
- **Unregister:** `unregister(id)` removes one; `unregisterAll()` removes
  all BoriSend geofences (used by sign-out, account deletion, reconcile).
- **Sign-out / account deletion:** `LocalCleanupService.beforeLogout()`
  calls `GeofenceService.unregisterAll()` so a signed-out or deleted
  account cannot continue generating Smart Message actions.
- **Native event:** `onTransition` forwards OS ENTER/EXIT events to the
  `processGeofenceEvent` backend (secure ownership/capacity/idempotency/
  cooldown validation). A geofence event NEVER marks an SMS as sent — it
  creates a pending/user-action Smart Message; the user opens the SMS
  composer and manually sends. Existing cooldown/idempotency in
  `execution-core.ts` + `processGeofenceEvent` prevents duplicate pending
  messages from repeated OS callbacks.

### 12.5 Native plugin contract (LOCAL ACTION REQUIRED)
`registerPlugin("Geofence")` must expose:
```
checkPermission()          → { status: 'granted'|'denied'|'prompt' }
requestPermission()       → { status }
openSettings()            → void
addGeofence({ id, latitude, longitude, radius, transitionType, notifyOnEntry, notifyOnExit })
removeGeofence({ id })    → void
removeAllGeofences()      → void        // clear all borisend_sm_*
addListener('geofenceTransition', cb) → unsubscribe
  // cb receives: { id, smart_message_id, geofence_id, transition:'enter'|'exit', occurred_at }
```

### 12.6 iOS native source (LOCAL ACTION REQUIRED)
File: `ios/App/App/GeofencePlugin.swift` (add to Xcode target).
- Use `CLLocationManager` + `CLCircularRegion` (`startMonitoring(for:)`).
- Region identifier = `borisend_sm_{smart_message_id}`.
- `notifyOnEntry = (transitionType == 'enter')`; `notifyOnExit = (transitionType == 'exit')`.
- On `locationManager(_:didEnterRegion:)` / `didExitRegion:`, emit the
  `geofenceTransition` event to the Capacitor bridge.
- Region monitoring requires **Always** authorization. Request it
  contextually (on Smart Message activation), never at app startup.
- Limit: 20 simultaneously monitored regions (enforced in JS).
- Do NOT enable continuous background location updates — `CLCircularRegion`
  region monitoring wakes the app on transition without it.

Info.plist keys (add — §4.2):
```
NSLocationWhenInUseUsageDescription = "BoriSend uses your location for Smart Messages you choose to prepare when you arrive at or leave a place."
NSLocationAlwaysAndWhenInUseUsageDescription = "BoriSend uses your location for Smart Messages you choose to prepare when you arrive at or leave a place."
```

### 12.7 Android native source (LOCAL ACTION REQUIRED)
File: `android/app/src/main/java/.../GeofencePlugin.java` (Capacitor plugin).
- Use `LocationServices.getGeofencingClient()` + `GeofencingRequest`.
- Request `ENTER` (`transitionType == 'enter'`) or `EXIT`
  (`transitionType == 'exit'`) only — never both.
- PendingIntent + BroadcastReceiver → emit `geofenceTransition` event.
- `removeAllGeofences()` clears all pending intents with `borisend_sm_` prefix.
- Limit: 100 geofences (enforced in JS).

AndroidManifest.xml (add — §5.2):
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<!-- Android 12+ (API 31+) geofence transition requires: -->
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
```
Do NOT add `SEND_SMS`. Background location is requested contextually only
when the user activates a Location Smart Message, never at app startup.

### 12.8 Verification status
- App/JS/backend path: IMPLEMENTED and hardened (trigger UI, canonical config,
  contextual permission gate, GeofenceService capability probe,
  GeofenceController startup/resume/change reconciliation, event-ID
  normalisation, secure processGeofenceEvent execution).
- Native plugin source: NOT PRESENT in this workspace because generated `ios/`
  and `android/` projects are not present (local/store-build action —
  §12.5/12.6/12.7).
- Real-device geofence transition: UNVERIFIED until the native plugin is part
  of the actual store shell and tested on physical iOS/Android devices.
- Do not mark location triggering release-verified merely because the web
  bundle builds; native region monitoring is the remaining acceptance gate.

## 13. Background Execution

- `BackgroundTaskService` uses **`setInterval` polling** (foreground only).
  `isNativeBackgroundAvailable()` returns `false`.
- No WorkManager / BGTaskScheduler plugin is installed.
- All scheduled communication preparation runs on the **server** (backend
  scheduled functions / automations). The native app does NOT need to run
  in the background for messages to be prepared.
- Push notifications (APNs/FCM) are delivered by the OS even when the app
  is closed — this is the only background mechanism that works reliably.
- If the app is closed: scheduled messages are still prepared server-side;
  the user receives a push notification (if permission granted + device
  registered); tapping the push opens the app via deep link.

## 14. Authentication

- Email/password: fully functional (web + native WebView).
- Google Sign-In: **not present** on the Login page (no Google button).
  The `loginWithProvider("google")` SDK method is available but not wired
  into the UI.
- Apple Sign-In: **not present** on the Login page. If BoriSend offers
  third-party login on iOS, Apple requires Sign in with Apple. Currently
  not implemented — not a blocker if only email/password is offered.
- Cold-start auth: `window.location.href = "/"` after login is a hard
  redirect. In a native WebView this reloads the WebView, which works but
  is slower than SPA navigation.
- Deep-link preservation through login: NOT implemented (P1).

## 15. Account Deletion

- Reachable via Settings → Delete Account (`DeleteAccountDialog`).
- Two-step confirmation (type "DELETE").
- Calls `deleteAccount` backend function (anonymises data, preserves
  financial records).
- After deletion: `base44.auth.logout("/login")` redirects to login.
- No MobileNav overlap (dialog is a modal overlay).
- Real-device verification: NOT TESTED (need to verify no stale cached
  content remains after logout on native).

## 16. Stripe / Billing (CRITICAL — do NOT modify without product decision)

- Current architecture: Stripe Checkout (web-based redirect) for membership
  and add-on purchases.
- `isMobileBillingRestricted()` returns `true` on native iOS/Android — the
  app **suppresses** in-app Stripe checkout and directs users to the web
  app URL for subscription management.
- **Apple App Store policy**: digital goods/services consumed inside the app
  typically require StoreKit (in-app purchase). External Stripe checkout for
  digital subscriptions may violate Apple's guidelines unless the app
  qualifies for an exemption (e.g. reader apps, or external purchase
  link entitlement for apps in specific regions). **Legal/store-policy
  verification is required before claiming compliance.**
- **Google Play policy**: Google Play Billing is required for digital
  goods/services purchased inside the app distributed via Play Store.
  External Stripe checkout may be permitted only if the app meets Google's
  external billing eligibility (currently limited to specific regions and
  user-choice billing programs). **Legal/store-policy verification required.**
- This is a **P0 release-readiness finding**. Do NOT change billing
  architecture without explicit product + legal direction.

## 17. Safe Areas

- Shared CSS utilities: `safe-area-top`, `safe-area-bottom`,
  `safe-area-inset`, `nav-safe-bottom` (5rem + env inset).
- `MobileNav` uses `z-50` + `safe-area-bottom`.
- Bottom-fixed CTAs should use `z-40` to remain visible beneath MobileNav.
- `capacitor.config.ts` sets `ios.contentInset: 'always'`.
- Real-device verification needed for notch / Dynamic Island / gesture bar.

## 18. Status Bar

- `@capacitor/status-bar` is NOT installed.
- `index.html` sets `apple-mobile-web-app-status-bar-style: black-translucent`
  and `theme-color: #DA1B8A`.
- Without the status-bar plugin, the native status bar style cannot be
  controlled programmatically (e.g. light/dark icon switching). P2.

## 19. Back Button (Android)

- `LifecycleService` handles `backButton` from `@capacitor/app`:
  navigates `window.history.back()` or exits if at root.
- Dialogs/sheets use Radix UI which handles Escape but may not handle
  Android hardware back identically — real-device verification needed.

## 20. Orientation

- Not explicitly configured. Capacitor defaults to allowing rotation.
- If BoriSend is portrait-only, lock orientation via the `@capacitor/screen-
  orientation` plugin or in native project settings. Not currently set.

## 21. Build Commands Summary

```bash
npm install            # install deps
npm run build          # build web bundle → dist/
npx cap sync           # sync to native projects
npx cap open ios       # Xcode
npx cap open android   # Android Studio
# In Xcode: select device → Run
# In Android Studio: select device → Run
```

## 22. Real-Device QA Checklist

See `docs/REAL_DEVICE_QA_CHECKLIST.md` for the per-device test matrix.

## 23. Apple In-App Purchase (RC20.3)

### Overview

BoriSend uses Apple auto-renewable subscriptions for iOS in-app purchases.
The same BoriSend membership and entitlement model applies — no second
entitlement system. Apple and Stripe subscribers are unified through
`MembershipSubscription` with a `payment_provider` field.

### App Store Connect — DEVELOPER ACTION REQUIRED

1. **Paid Apps Agreement** — accepted in App Store Connect
2. **Banking** — completed (Agreements, Tax, and Banking)
3. **Tax information** — completed
4. **Auto-renewable subscription group** — created
5. **Monthly product** — created (£4.99/mo, product ID = `APPLE_IAP_MONTHLY_PRODUCT_ID`)
6. **Annual product** — created (£49.99/yr, product ID = `APPLE_IAP_ANNUAL_PRODUCT_ID`)
7. **Product IDs supplied** to BoriSend secrets:
   - `APPLE_IAP_MONTHLY_PRODUCT_ID`
   - `APPLE_IAP_ANNUAL_PRODUCT_ID`
8. **App Store Server API key** — created (.p8 file):
   - `APPLE_ISSUER_ID` — issuer ID
   - `APPLE_KEY_ID` — key ID
   - `APPLE_PRIVATE_KEY` — private key (PEM)
9. **App Store Server Notifications V2** — production URL configured:
   `https://borisend-smart-connect.base44.app/functions/appleServerNotifications`
10. **Sandbox URL** — configured (if using separate endpoint)
11. **First subscription group/product** — submitted with an app version
12. **Subscription metadata/localisations** — completed
13. **Review screenshot/information** — completed

### Server-Side Secrets (Settings → Secrets)

| Secret | Description |
|---|---|
| `APPLE_IAP_MONTHLY_PRODUCT_ID` | App Store Connect monthly product ID |
| `APPLE_IAP_ANNUAL_PRODUCT_ID` | App Store Connect annual product ID |
| `APPLE_ISSUER_ID` | App Store Server API issuer ID |
| `APPLE_KEY_ID` | App Store Server API key ID |
| `APPLE_PRIVATE_KEY` | App Store Server API private key (PEM) |
| `APPLE_ROOT_CA_G3_PEM` | Apple Root CA G3 certificate (PEM, **REQUIRED** — verification fails closed without it). Download from apple.com/certificateauthority/AppleRootCA-G3.cer |

### Native StoreKit 2 Plugin — LOCAL ACTION REQUIRED

The `AppleIAPService.js` client service calls a Capacitor plugin registered
as `"AppleIAP"`. The native Swift source MUST be written in the generated
`ios/` project after `npx cap add ios && npx cap sync ios`.

#### Plugin Contract

```typescript
// Capacitor plugin: registerPlugin("AppleIAP")

interface AppleProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  title: string;
  description: string;
}

interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  signedTransaction: string;  // JWS for server verification
  purchaseDate: number;
  expirationDate: number;
}

// Native methods:
getProducts(productIds: { productIds: string[] }) → { products: AppleProduct[] }
purchase(interval: { interval: 'monthly' | 'annual' }) → AppleTransaction
getCurrentEntitlements() → { transactions: AppleTransaction[] }
restorePurchases() → { transactions: AppleTransaction[] }
finishTransaction(transactionId: { transactionId: string }) → { success: boolean }
openManageSubscriptions() → { success: boolean }
addListener('transactionUpdated', callback) → PluginListenerHandle
```

#### Swift / StoreKit 2 Implementation Contract

After `npx cap add ios && npx cap sync ios`, implement in
`ios/App/Plugins/AppleIAPPlugin.swift`:

1. **Product loading** — `Product.products(for:)` with configured product IDs
2. **Purchase flow** — `product.purchase()` → `VerificationResult<Transaction>`
3. **Transaction updates listener** — `Transaction.updates` async sequence
4. **Current entitlements** — `Transaction.currentEntitlements` async sequence
5. **Restore/sync** — iterate `Transaction.currentEntitlements`, send each
   signed JWS to `verifyAppleTransaction`
6. **Finish transaction** — `transaction.finish()` ONLY after server
   verification succeeds
7. **Signed transaction handoff** — JWS from `Transaction.jsonRepresentation`
   is sent to `verifyAppleTransaction` for server-side verification
8. **Manage subscriptions** — `showManageSubscriptions(in:)` (iOS 15+)

### Verification Architecture

- `verifyAppleTransaction` validates signed JWS (ES256 signature + Apple Root CA
  certificate chain) before granting entitlement. Never trusts client success.
- **Trusted root required**: the x5c chain in the JWS CANNOT establish its own
  trust anchor. The root cert in x5c is cryptographically verified against the
  trusted Apple Root CA G3 public key from `APPLE_ROOT_CA_G3_PEM` (server-side).
  Subject-name matching is NOT used and NOT accepted.
- **Fail closed**: if `APPLE_ROOT_CA_G3_PEM` is not configured, all Apple JWS
  verification fails — no membership is granted, extended, restored, or created.
- **ES256 enforced**: only the ES256 algorithm is accepted for JWS verification.
- `appleServerNotifications` receives and processes V2 lifecycle events.
- Deprecated `verifyReceipt` is NOT used.
- Bundle ID validation: `com.base6a3f3ae0473f4e5dce013c32.app`
- `originalTransactionId` is the durable subscription-family identifier.
  One Apple subscription cannot be claimed by multiple BoriSend accounts.

### Cross-Provider Recognition

- Existing Stripe subscriber on iOS → paid access immediately, no Apple purchase prompt
- Apple subscriber on web → paid access immediately, no Stripe purchase prompt
- UI shows "Managed through Apple" or "Managed through your web subscription"