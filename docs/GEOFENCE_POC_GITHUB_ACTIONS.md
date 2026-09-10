# BoriSend Android Native Geofence POC

This branch is an **isolated proof of concept**. It does not modify the production Base44 workspace or production store build.

## What this POC tests

- Existing BoriSend Base44 frontend/backend integration remains intact.
- Android package ID remains `com.base6a3f3ae0473f4e5dce013c32.app`.
- Arrival/departure monitoring uses Android `GeofencingClient`, not continuous GPS.
- Geofence events are received by a native `BroadcastReceiver` even when the WebView is suspended.
- Each native transition is persisted to a small on-device pending-event queue.
- When BoriSend is alive, the transition is forwarded to the existing JavaScript `geofenceTransition` listener.
- When BoriSend is opened/resumed later, pending transitions are retried and acknowledged only after the existing Base44 `processGeofenceEvent` call succeeds.
- A local notification is shown for a captured transition when notification permission is available.

## Build in GitHub

The workflow `.github/workflows/android-geofence-poc.yml` builds a debug APK on pushes to `poc/native-geofence` and can also be run manually from **Actions → Android Geofence POC → Run workflow**.

The workflow:

1. installs the existing project dependencies with `npm ci`;
2. builds the Vite application;
3. generates a fresh Capacitor Android project;
4. installs the POC native Java plugin and required Android permissions;
5. builds `app-debug.apk`;
6. uploads the APK as the `borisend-geofence-poc-debug-apk` workflow artifact.

## Android permission test

For background geofencing, Android 10+ requires background location access. Depending on Android version, the OS may require the user to open the app's system settings and select **Allow all the time** after granting foreground location.

This POC deliberately does not continuously track or upload location.

## Physical-device acceptance checks

Use a real Android phone. Test one Arrival and one Departure Smart Message with a practical radius (for example 150–250 m).

Record the result for:

| State | Expected POC result |
| --- | --- |
| App foreground | Transition captured and forwarded to BoriSend |
| App background / screen locked | Native transition captured; notification may appear; backend forwarding occurs when JS is available or on next resume |
| App removed from recents / WebView not running | Native receiver queues transition; notification may appear; opening BoriSend drains and forwards the pending event |
| Location permission not set to Allow all the time | BoriSend must not claim geofencing is ready |

## Important scope limit

This POC intentionally uses **store-and-forward** for the terminated-WebView case. It does **not** place a reusable Base44 authentication token inside native code and does not make an unauthenticated native webhook call. That security decision is deferred until the POC proves OS-level geofence capture is reliable.

Do not merge this POC into the production BoriSend release until physical-device results have been reviewed and explicitly approved.
