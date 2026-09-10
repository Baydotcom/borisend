# BoriSend 2.0 — Source of Truth Registry

## Monthly Entitlement Boundaries (RC18.3.4.1)

**Rule:**
Monthly entitlement periods preserve the original anchor day. When that day
does not exist in a target month, the boundary is clamped to the target
month's final valid day without changing the original anchor day for
subsequent months.

**Examples:**
- Anchor 15: 15 Jan → 15 Feb → 15 Mar → 15 Apr (no clamping needed)
- Anchor 30: 30 Jan → 28 Feb 2026 → 30 Mar → 30 Apr (Feb clamps to 28, March restores 30)
- Anchor 31: 31 Jan → 28 Feb 2026 → 31 Mar → 30 Apr → 31 May
- Leap year: 31 Jan 2028 → 29 Feb 2028 → 31 Mar 2028

**Canonical function:**
`getMonthlyEntitlementWindow(periodStart, now)` in
`base44/shared/entitlements/entitlement-service.ts` returns
`{ windowStart, windowEnd }`. Both boundaries are computed from the ORIGINAL
membership anchor via `addMonthsAnchorPreserving(anchor, months)`. No inline
`new Date(year, month + 1, day)` arithmetic is permitted for entitlement
boundaries.

**Consumers (all use the canonical function):**
- Generated Message capacity / consumption
- Message Pass capacity / consumption
- Smart Message capacity / consumption
- One-time add-on expiry (current_period_end)
- Next-period add-on renewal (effective_from, period_end)
- renewal_intent_key target period
- Expiry reminders (5-day, 1-day)
- Annual-member monthly allowance windows

**Boundary convention:**
Half-open interval `[windowStart, windowEnd)`. At the exact boundary
timestamp, the old entitlement is excluded and the new entitlement is
included simultaneously — no gap, no overlap, no double-count.

---

## Add-On Renewal Infrastructure (RC18.3.4)

**Renewal intent identity:**
`addon_renewal:{owner_user_id}:{add_on_product_id}:{target_period_start}`
Computed server-side from the canonical monthly boundary. Carried through
Stripe Checkout Session metadata to the webhook.

**Payment idempotency (3 layers):**
1. Stripe idempotency key (= renewal_intent_key) — concurrent requests return
   the same Checkout Session.
2. Webhook: `stripe_checkout_session_id` dedup — same-session redelivery is
   idempotent (update, not create).
3. Webhook: `renewal_intent_key` dedup — different-session same-target
   payments are detected as duplicates; entitlement NOT granted, payment
   audited for refund.

**Buy More Now vs Renew for Next Period:**
- Buy More Now (`current`): no deterministic key, stackable, effective
  immediately, expires at current monthly boundary.
- Renew for Next Period (`next_period`): deterministic key, one per
  product+period, effective at next monthly boundary, expires at the
  boundary after.

**Reminder suppression:**
If the add-on's product already has a scheduled next-period renewal,
expiry reminders are suppressed.

**Scheduled renewal lifecycle:**
- `scheduled` → lazily promoted to effective by `isAddonCurrentlyEffective`
  once `now >= effective_from`. No cron required.
- Boundary is half-open: old add-on excluded at `now >= current_period_end`,
  scheduled add-on included at `now >= effective_from`.

---

## Existing-User Migration Risk (RC18.3.4.1 §5)

Changing the month-boundary calculation does NOT shorten any period that was
previously promised. The old algorithm drifted anchors forward (e.g., Jan 31
→ Feb 28 → Mar 28 → Apr 28 …), which gave users LONGER windows than entitled
in some months and SHORTER in others. The corrected algorithm restores the
original anchor day, which is the commercially correct behavior. No
destructive migration is required — the function is read-time and
stateless; existing stored `current_period_end` values on AddOnSubscription
records remain authoritative until they naturally expire.

---

## Consumption Authority & Security

- All capacity checks are server-side. Frontend never performs capacity math.
- RLS on all entities: `owner_user_id == user.id OR role == admin`.
- Consumption ledgers (GenerationUsageLedger, MessagePassUsageLedger,
  SmartMessageUsageLedger) are immutable and deletion-resistant.

---

## RC20 — Native Location, SMS, Deep-Link & Push Architecture

### Launch SMS Model (RC20 Part 15/16)
- **User-assisted SMS on BOTH iOS and Android.** `SMSService.getPreferredMode()`
  returns `'manual'` on all platforms. The `sendAuto()` path is preserved for a
  future product decision but is NOT selected at launch.
- No `SEND_SMS` permission at launch. No Google Play policy risk.
- **Composer-open ≠ sent.** `Message.composer_opened_at` records when the
  native SMS composer was opened. Message `status` remains `pending`/`approved`
  (user-action-required) until the user explicitly confirms via
  `markMessageSent({status:'sent'})`. The SmartInbox "Confirm Sent" gesture is
  the only path to `sent` in manual mode.

### Location / Geofence Architecture (RC20 Part 2–14)
- Location Arrival/Departure are **launch features** (NOT hidden).
- Canonical location fields live in `SmartMessage.trigger_config`:
  `location_latitude`, `location_longitude`, `location_radius_meters`,
  `location_place_name`, `location_address`, `location_postcode`,
  `geofence_id` (= `borisend_sm_{smart_message_id}`), `geofence_registered`,
  `trigger_cooldown_minutes` (default 30).
- `GeofenceService` (src/services/mobile/GeofenceService.js) is the single
  native abstraction. Uses `registerPlugin("Geofence")` — native source must be
  written in ios/android projects (CLCircularRegion / GeofencingClient).
- **One execution engine:** `executeOccurrence` in
  `base44/shared/smart-messages/execution-core.ts` is shared by
  `executeSmartMessage` (manual/time/date) and `processGeofenceEvent`
  (location). Geofencing does NOT run a competing pipeline.
- **Secure backend:** `processGeofenceEvent` validates user, ownership, active
  status, trigger_type↔transition match (arrival→enter, departure→exit),
  geofence_id, cooldown, then delegates to the shared core.
- **Idempotency / cooldown:** `trigger_cooldown_minutes` (default 30) enforced
  via `SmartMessage.last_triggered_at`. Repeated boundary oscillations within
  the cooldown window are idempotent skips (no capacity consumed).
  Deterministic `execution_key` = `owner|sm|contact|occurrence`.
- **Privacy / battery:** NO continuous GPS polling, NO location-history storage,
  NO route tracking, NO periodic upload. OS geofence transitions only.
- **Geofence limits:** iOS 20 (CLCircularRegion), Android 100. `reconcile()`
  enforces the limit — never silently exceeds.
- Location permission is requested contextually (when activating a location
  Smart Message), NEVER at app startup.

### Deep-Link Login Restoration (RC20 Part 17/18)
- `RootDeepLinkHandler` is mounted at the APP ROOT (inside Router, OUTSIDE the
  auth gate) so cold-start deep links are captured even when logged out.
- Logged-out capture stores the validated route in session-scoped storage
  (`borisend_pending_deep_link`); after login the resume effect navigates +
  clears.
- `validateInternalRoute()` (src/lib/authReturnTo.js) enforces same-origin,
  single-leading-slash, no `//`, no backslash, no bootstrap/auth-token params.

### Foreground Push Architecture (RC20 Part 20)
- On Capacitor native, `NotificationService.sendLocalNotification()` uses
  `@capacitor/local-notifications` (NOT the browser Notification API, which is
  unreliable in a native WebView). Web falls back to the browser API.
- Foreground `pushNotificationReceived` → local notification presentation — the
  single foreground display path (no duplicates).

### Native Shell Preparation (RC20 Part 22/23/24)
- `@capacitor/splash-screen` configured: Magenta `#DA1B8A` + static White logo.
  `NativeShellInit` hides the splash once React is ready (continuous transition).
- `@capacitor/status-bar`: light icons over Magenta; dark-mode adaptive.
- `@capacitor/screen-orientation`: portrait locked at launch.
- `@capacitor/local-notifications`: foreground push presentation.
- **NATIVE CONFIGURATION REQUIRED:** native projects (ios/android) do not exist
  yet. Plugin native sources, Info.plist keys, AndroidManifest permissions,
  splash/icon assets, and the custom `Geofence` plugin native source must be
  added after `npx cap add`. See docs/NATIVE_BUILD_AND_DEVICE_QA.md.
