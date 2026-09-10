# BoriSend — iOS Bundle Identifier Verification Report

**Date:** 2026-07-28  
**Scope:** Inspect and report on the iOS Bundle Identifier that will be used for the production iOS build.  
**Constraint:** Inspection and reporting only. No code, configuration, or project files were modified.

---

## 1. Current Bundle Identifier

### Value in project configuration

The file `capacitor.config.ts` (line 4) contains:

```typescript
appId: 'com.borisend.app'
```

This is the Capacitor application identifier set during project initialisation. It is the value that would be embedded in the `Info.plist` (`CFBundleIdentifier`) if a local Xcode build were generated via `npx cap add ios` / `npx cap open ios`.

### What Base44 will use for the production build

According to Base44's official documentation:

> "Base44 automatically configures the Bundle ID for your iOS builds — you cannot set or change it manually. When you generate an IPA file from the Mobile app tab in your app editor, Base44 automatically assigns a Bundle ID and signing key to your app. These values are fixed and cannot be edited inside the generated IPA file."

This means the `appId` in `capacitor.config.ts` (`com.borisend.app`) is **not guaranteed** to be the Bundle Identifier in the Base44-generated production IPA. Base44 assigns its own Bundle ID at build-generation time.

**The exact production Bundle ID must be confirmed from the Base44 app editor → Mobile app tab at the time of IPA generation.** It is not visible in the project's source files.

---

## 2. Is the Bundle Identifier Configurable?

**No.** Per Base44 documentation:

- The Bundle ID is **automatically assigned** by Base44 when the IPA is generated.
- It **cannot be set or changed** by the developer inside the generated IPA file.
- The `appId` value in `capacitor.config.ts` is used for local Capacitor builds (`npx cap`), but Base44's cloud build pipeline assigns its own value for production builds.

| Source | Configurable? | Notes |
|--------|--------------|-------|
| `capacitor.config.ts` (local builds) | Yes — developer edits the file | Used only for local `npx cap` workflows |
| Base44 cloud IPA generation | **No — auto-assigned and fixed** | Assigned at generation time from the Mobile app tab |

---

## 3. Recommended Bundle Identifier

### If Base44 allows the value to flow through from `capacitor.config.ts`

The recommended Bundle Identifier is:

```
com.borisend.app
```

This is already set in `capacitor.config.ts` and is the value used for the Android build (where the same identifier applies). Using the same identifier across both platforms simplifies Apple Developer registration, Google Sign-In configuration, and associated domains.

### If Base44 auto-assigns a different value

Use whatever Base44 assigns. Per the documentation, this value is fixed and cannot be overridden. The assigned value will be visible in the Mobile app tab of the Base44 editor after IPA generation.

**Action required:** Before proceeding with App Store Connect, generate a production IPA from the Base44 Mobile app tab and confirm the exact Bundle ID embedded in it. Register that exact value in Apple Developer and App Store Connect.

---

## 4. Must the Same Bundle ID Be Registered in Apple Developer and App Store Connect?

**Yes — both.**

| Platform | Registration required | Where |
|----------|----------------------|-------|
| Apple Developer | ✅ Yes | Certificates, Identifiers & Profiles → Identifiers → App IDs |
| App Store Connect | ✅ Yes | My Apps → New App → Bundle ID (must match the App ID registered above) |

The Bundle ID in the IPA must exactly match the App ID registered in Apple Developer and the Bundle ID selected in App Store Connect. Any mismatch will cause the upload to be rejected by App Store Connect.

---

## 5. Is the Bundle ID Permanently Locked After the First Production Build?

### In the Base44-generated IPA

Per Base44 documentation, the Bundle ID is **fixed** and cannot be edited inside the generated IPA. Once Base44 assigns a Bundle ID, it remains the same for all subsequent builds generated through the platform.

### In App Store Connect

Once an app is uploaded to App Store Connect with a specific Bundle ID and an app record is created, the Bundle ID **cannot be changed** for that app record. If you need to use a different Bundle ID, you must create a new app entry in App Store Connect and submit it as a new app.

**Implication:** Confirm the Bundle ID is correct **before** the first upload to App Store Connect. After the first successful upload, the identifier is permanently tied to that app listing.

---

## 6. Dependencies Tied to the Bundle Identifier

Changing the Bundle ID (or using a different one than expected) would affect all of the following:

| Dependency | Affected? | Details |
|------------|-----------|---------|
| **Google Sign-In** | ✅ Yes | The iOS client ID and reversed client ID in Google Cloud Console are registered against a specific Bundle ID. A mismatch will cause Google Sign-In to fail with a redirect error. |
| **Sign in with Apple** | ✅ Yes | The Apple Services ID and Bundle ID must match what is registered in Apple Developer. Sign in with Apple will fail if the Bundle ID doesn't match the configured Services ID. |
| **Push Notifications (APNs)** | ✅ Yes | The APNs key or certificate is tied to the App ID (Bundle ID) in Apple Developer. A different Bundle ID requires a new APNs configuration. |
| **Deep links / Universal Links** | ✅ Yes | Universal Links require an `apple-app-site-association` file on the domain that references the exact Bundle ID (and App ID prefix). A mismatch means deep links will not open the app. |
| **Associated Domains** | ✅ Yes | The `applinks:` entitlement in the app's entitlements file references the domain, but the `apple-app-site-association` file on the server must reference the exact Bundle ID. Both must match. |
| **App updates** | ✅ Yes | App Store Connect only allows updates to an app with the same Bundle ID. A different Bundle ID requires a new app listing — existing users will not receive the update. |
| **Existing users** | ✅ Yes | If the Bundle ID changes after release, the new build appears as a different app. Existing users will not auto-update and will need to install the new app manually. All local data (UserDefaults, keychain items) tied to the old Bundle ID will be inaccessible. |
| **Stripe integration** | ✅ Yes (indirect) | Stripe does not directly use the Bundle ID, but if the app uses Apple Pay or Stripe's native mobile SDK with app-level authentication, the payment configuration may reference the Bundle ID. For BoriSend's current Stripe Checkout (web-based) flow, the Bundle ID is not directly referenced in Stripe configuration — but the deep link back to the app after payment depends on the Bundle ID / Universal Links configuration. |
| **Backend configuration** | ⚠️ Potentially | If any backend function or webhook references the app's Bundle ID for validation (e.g., deep link verification, push notification token registration), those references would need to be updated. No such references were found in the project's backend functions, but the Base44 platform's internal push notification configuration may tie the device token to the Bundle ID. |

---

## 7. Does Base44 Have a Recommended Bundle Identifier for This Project?

Base44 does not publish a project-specific recommended Bundle ID. Instead, it **auto-assignes** one at build time.

For reference, the Base44 documentation states that for Android, the package name follows the format:

```
com.base[app-id].app
```

where `[app-id]` is the Base44 app ID found in the editor URL. The iOS Bundle ID format is not explicitly documented but is similarly auto-assigned.

The value set in the project's `capacitor.config.ts` is:

```
com.borisend.app
```

This is the developer-intended identifier and should be used if Base44 honours it. If Base44 overrides it with an auto-assigned value, that value must be used instead.

---

## 8. Summary

| Question | Answer |
|----------|--------|
| **Current Bundle ID (from project config)** | `com.borisend.app` |
| **Bundle ID Base44 will use for production IPA** | Auto-assigned by Base44 — must be confirmed from the Mobile app tab at build time |
| **Is it configurable?** | No — Base44 auto-assigns and fixes the Bundle ID for cloud-generated IPAs |
| **Recommended value** | `com.borisend.app` (if honoured by Base44); otherwise use the auto-assigned value |
| **Must Apple register the exact identifier?** | Yes — in both Apple Developer (App IDs) and App Store Connect (new app) |
| **Locked after first production build?** | Yes — App Store Connect permanently ties the Bundle ID to the app listing after the first upload |
| **Dependencies affected by a change** | Google Sign-In, Sign in with Apple, APNs push notifications, Universal Links, associated domains, app updates, existing users, Stripe deep links |
| **Was any code or configuration modified?** | **No** — this was an inspection-only task |

---

## 9. Recommended Next Steps

1. **Generate a production IPA** from the Base44 app editor → Mobile app tab.
2. **Inspect the Bundle ID** embedded in the generated IPA (visible in the Mobile app tab or by opening the IPA and reading `Info.plist` → `CFBundleIdentifier`).
3. **Register that exact Bundle ID** in Apple Developer → Certificates, Identifiers & Profiles → Identifiers → App IDs. Enable capabilities: Push Notifications, Sign in with Apple, Associated Domains.
4. **Create the app in App Store Connect** using the same Bundle ID.
5. **Update Google Cloud Console** — add the iOS Bundle ID to the existing OAuth 2.0 Client ID for Google Sign-In.
6. **Configure `apple-app-site-association`** on the BoriSend domain with the exact Bundle ID and Apple App ID prefix for Universal Links / deep links.
7. **Confirm** before the first upload that the Bundle ID is correct — it cannot be changed after the first App Store Connect submission.

---

## 10. Confirmation

No application code was modified.  
No iOS configuration was changed.  
No build was generated.  
This was an inspection and reporting task only.
