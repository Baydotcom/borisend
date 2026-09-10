# RC18.2.2 — Native Contact Import Setup Guide

## Plugin Installed

`@capacitor-community/contacts@^6.1.1` — maintained, Capacitor 6 compatible.

## What's Done (Web Workspace)

- **ContactImportService** is now the platform router: `native` → `w3c` → `unsupported`
- **DeviceContactPicker** has a "reviewing" stage for native multi-pick (pick one at a time → review → import)
- **PermissionService** checks native contact permissions via the plugin
- All existing web/PWA fallback preserved

## What You Must Do Locally (One-Time)

### 1. Run Capacitor Sync

```bash
npx cap sync
```

This installs the plugin's iOS pod and Android module automatically.

### 2. iOS — Add Privacy Description

Add to `ios/App/App/Info.plist`:

```xml
<key>NSContactsUsageDescription</key>
<string>BoriSend uses contacts you choose to help you add recipients without typing their details manually.</string>
```

This is required by Apple even though the system picker (`CNContactPickerViewController`) doesn't need full contact access — the plugin checks permission status.

### 3. Android — Add Contact Permission

Add to `android/app/src/main/AndroidManifest.xml` (before the `<application>` tag):

```xml
<uses-permission android:name="android.permission.READ_CONTACTS" />
```

**Verified against plugin source (RC18.2.3 §K):** `@capacitor-community/contacts` 6.1.1's `ContactsPlugin.java` explicitly checks `isContactsPermissionGranted()` before opening the picker, then reads contact details via `ContactsContract` which requires `READ_CONTACTS`. This is an Android platform limitation — the system Contact Picker returns a contact URI, but reading name/phone from that URI requires the permission.

**Narrowest architecture:** The plugin also declares `WRITE_CONTACTS` under the same permission alias. BoriSend only needs `READ_CONTACTS` (never writes contacts). To suppress the unnecessary `WRITE_CONTACTS` permission, add this to the app's `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.WRITE_CONTACTS" tools:node="remove" />
```

This ensures Android's permission dialog only asks for `READ_CONTACTS`, not write access. The `xmlns:tools="http://schemas.android.com/tools"` namespace must be present on the `<manifest>` tag.

**iOS:** No permission required — `CNContactPickerViewController` handles access in a separate OS process. Only `NSContactsUsageDescription` in Info.plist is needed.

### 4. Build Natively

```bash
# iOS
npx cap open ios
# Then build in Xcode

# Android
npx cap open android
# Then build in Android Studio
```

## How It Works

| Platform | Provider | Picker | Multi-Select |
|---|---|---|---|
| iOS Native | `native` | `CNContactPickerViewController` (system) | Loop: pick one → review → pick more |
| Android Native | `native` | Android Contact Picker Intent (system) | Loop: pick one → review → pick more |
| Chrome Android Web/PWA | `w3c` | `navigator.contacts.select()` | Multi-select in one call |
| Desktop / Other | `unsupported` | — | Manual fallback |

## Privacy

- BoriSend never reads the full address book
- User selects specific contacts via the system picker
- Only name + phone number extracted (data minimization)
- No contact photos, emails, addresses, or notes stored
- Native contact IDs are not persisted
