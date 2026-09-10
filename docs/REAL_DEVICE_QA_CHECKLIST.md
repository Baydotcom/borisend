# BoriSend — Real-Device QA Checklist

**Instructions:** Mark each item NOT TESTED, PASS, or FAIL.
Do NOT pre-mark anything PASS without evidence on a physical device.

---

## iOS PHYSICAL DEVICE

Device: ______________  iOS version: ______  App build: ______

### Launch & Splash
- [ ] NOT TESTED — App launches without crash
- [ ] NOT TESTED — Magenta background visible immediately on cold launch
- [ ] NOT TESTED — No white flash before Magenta paint
- [ ] NOT TESTED — White BoriSend logo visible during startup
- [ ] NOT TESTED — Rotating logo transitions smoothly to app content
- [ ] NOT TESTED — No duplicate loader after startup

### App Icon
- [ ] NOT TESTED — Square icon appears on home screen (not horizontal logo)
- [ ] NOT TESTED — Icon renders correctly in Settings app list

### Navigation & Layout
- [ ] NOT TESTED — Notch / Dynamic Island does not overlap content
- [ ] NOT TESTED — Bottom home indicator does not overlap MobileNav
- [ ] NOT TESTED — Safe-area top padding present on all screens
- [ ] NOT TESTED — MobileNav visible and not obstructed
- [ ] NOT TESTED — Bottom CTAs (Save bars) visible above MobileNav
- [ ] NOT TESTED — iOS swipe-back gesture works on nested screens

### Authentication
- [ ] NOT TESTED — Email/password login works
- [ ] NOT TESTED — Register → OTP → verify flow works
- [ ] NOT TESTED — Logout redirects to login
- [ ] NOT TESTED — Cold-start auth state preserved across app restart
- [ ] NOT TESTED — Deep link to protected route redirects to login (if logged out)

### Contact Import
- [ ] NOT TESTED — A. Import one contact
- [ ] NOT TESTED — B. Import multiple contacts (loop picker)
- [ ] NOT TESTED — C. Contact with multiple phone numbers (select which)
- [ ] NOT TESTED — D. Contact without phone number excluded
- [ ] NOT TESTED — E. Cancel picker — no error, returns to screen
- [ ] NOT TESTED — F. Permission denied — graceful message + settings option
- [ ] NOT TESTED — G. Permission re-enabled via Settings works
- [ ] NOT TESTED — H. Imported contacts immediately visible in People
- [ ] NOT TESTED — I. No Recipient Units consumed by import
- [ ] NOT TESTED — J. No stuck overlay after returning from native picker

### Push Notifications
- [ ] NOT TESTED — Notification permission prompt appears
- [ ] NOT TESTED — Permission granted → device token registered (check DeviceToken entity)
- [ ] NOT TESTED — Foreground notification displayed
- [ ] NOT TESTED — Background notification received
- [ ] NOT TESTED — App closed → push received → tap opens app
- [ ] NOT TESTED — Tapping notification routes to correct deep-link screen
- [ ] NOT TESTED — Add-on expiry 5-day reminder received and opens Membership Status
- [ ] NOT TESTED — Add-on expiry 1-day reminder received and opens Membership Status
- [ ] NOT TESTED — Already-renewed add-on does NOT show reminder

### Deep Links
- [ ] NOT TESTED — borisend://message/{id} opens message
- [ ] NOT TESTED — borisend://communication-plan/{id} opens campaign
- [ ] NOT TESTED — borisend://subscription opens subscription page
- [ ] NOT TESTED — borisend://addon-renewal/{id} opens Membership Status
- [ ] NOT TESTED — borisend://referrals opens referrals
- [ ] NOT TESTED — Deep link from cold start works

### SMS
- [ ] NOT TESTED — Tapping "Send" opens iOS Messages composer
- [ ] NOT TESTED — Phone number pre-filled correctly
- [ ] NOT TESTED — Message body pre-filled correctly
- [ ] NOT TESTED — After sending in Messages, return to BoriSend
- [ ] NOT TESTED — Message NOT marked "sent" until user confirms (manual mode)

### Smart Messages
- [ ] NOT TESTED — Time-based trigger fires at scheduled time (app open)
- [ ] NOT TESTED — Date trigger fires on correct date (app open)
- [ ] NOT TESTED — Recurring trigger fires on correct weekday (app open)
- [ ] NOT TESTED — Manual-event trigger ("Trigger Now") works
- [ ] NOT TESTED — Smart Message appears in SmartInbox after execution
- [ ] NOT TESTED — Capacity exhaustion blocks execution with clear message
- [ ] NOT TESTED — Location Arrival/Departure trigger choices are not offered in this store release

### Scheduled Communications
- [ ] NOT TESTED — Message prepared by backend scheduler appears when app opens
- [ ] NOT TESTED — Push notification received for prepared message (if push enabled)
- [ ] NOT TESTED — App closed + offline → no false "zero capacity" on reconnect
- [ ] NOT TESTED — Dashboard refreshes on resume (app foregrounded)

### Account Deletion
- [ ] NOT TESTED — Delete Account reachable in Settings
- [ ] NOT TESTED — Two-step confirmation works
- [ ] NOT TESTED — After deletion, redirects to login
- [ ] NOT TESTED — No stale personal content visible after re-login on same device

### Offline / Network Loss
- [ ] NOT TESTED — Home loads (cached) with no network
- [ ] NOT TESTED — No stuck overlay on failed API call
- [ ] NOT TESTED — Network restored → data refreshes without manual reload
- [ ] NOT TESTED — No duplicate submission on retry

### Accessibility
- [ ] NOT TESTED — Text Size setting (Small/Standard/Large) applies
- [ ] NOT TESTED — OS Dynamic Type scaling does not clip text
- [ ] NOT TESTED — VoiceOver reads buttons and navigation labels
- [ ] NOT TESTED — Dark Mode renders correctly (status bar, content)

### Keyboard
- [ ] NOT TESTED — Keyboard does not cover final CTA on Smart Message form
- [ ] NOT TESTED — Keyboard does not cover Save button on Campaign form
- [ ] NOT TESTED — Keyboard dismisses on tap-outside / scroll

---

## ANDROID PHYSICAL DEVICE

Device: ______________  Android version: ______  App build: ______

### Launch & Splash
- [ ] NOT TESTED — App launches without crash
- [ ] NOT TESTED — Magenta background visible immediately on cold launch
- [ ] NOT TESTED — No white flash before Magenta paint
- [ ] NOT TESTED — White BoriSend logo visible during startup
- [ ] NOT TESTED — Rotating logo transitions smoothly to app content
- [ ] NOT TESTED — No duplicate loader after startup

### App Icon
- [ ] NOT TESTED — Adaptive icon appears on home screen (square/maskable)
- [ ] NOT TESTED — Icon renders correctly in app drawer

### Navigation & Layout
- [ ] NOT TESTED — Gesture navigation bar does not overlap MobileNav
- [ ] NOT TESTED — 3-button navigation does not overlap MobileNav
- [ ] NOT TESTED — Safe-area top padding present (status bar)
- [ ] NOT TESTED — MobileNav visible and not obstructed
- [ ] NOT TESTED — Bottom CTAs (Save bars) visible above MobileNav

### Android Back Button
- [ ] NOT TESTED — Back navigates history (not exit) on nested screens
- [ ] NOT TESTED — Back exits app only at root screen
- [ ] NOT TESTED — Back dismisses dialogs/sheets (not exit app)
- [ ] NOT TESTED — Back does not lose unsaved form data unexpectedly
- [ ] NOT TESTED — Back from contact picker returns to screen

### Authentication
- [ ] NOT TESTED — Email/password login works
- [ ] NOT TESTED — Register → OTP → verify flow works
- [ ] NOT TESTED — Logout redirects to login
- [ ] NOT TESTED — Cold-start auth state preserved across app restart
- [ ] NOT TESTED — Deep link to protected route redirects to login (if logged out)

### Contact Import
- [ ] NOT TESTED — A. Import one contact
- [ ] NOT TESTED — B. Import multiple contacts (loop picker)
- [ ] NOT TESTED — C. Contact with multiple phone numbers (select which)
- [ ] NOT TESTED — D. Contact without phone number excluded
- [ ] NOT TESTED — E. Cancel picker — no error, returns to screen
- [ ] NOT TESTED — F. Permission denied — graceful message + settings option
- [ ] NOT TESTED — G. Permission re-enabled via Settings works
- [ ] NOT TESTED — H. Imported contacts immediately visible in People
- [ ] NOT TESTED — I. No Recipient Units consumed by import
- [ ] NOT TESTED — J. No stuck overlay after returning from native picker
- [ ] NOT TESTED — K. Verify whether READ_CONTACTS is actually required (narrower access?)

### Push Notifications
- [ ] NOT TESTED — Notification permission prompt (Android 13+) appears
- [ ] NOT TESTED — Permission granted → FCM token registered (check DeviceToken entity)
- [ ] NOT TESTED — Foreground notification displayed
- [ ] NOT TESTED — Background notification received
- [ ] NOT TESTED — App closed → push received → tap opens app
- [ ] NOT TESTED — Tapping notification routes to correct deep-link screen
- [ ] NOT TESTED — Add-on expiry 5-day reminder received and opens Membership Status
- [ ] NOT TESTED — Add-on expiry 1-day reminder received and opens Membership Status
- [ ] NOT TESTED — Already-renewed add-on does NOT show reminder

### Deep Links
- [ ] NOT TESTED — borisend://message/{id} opens message
- [ ] NOT TESTED — borisend://communication-plan/{id} opens campaign
- [ ] NOT TESTED — borisend://subscription opens subscription page
- [ ] NOT TESTED — borisend://addon-renewal/{id} opens Membership Status
- [ ] NOT TESTED — borisend://referrals opens referrals
- [ ] NOT TESTED — Deep link from cold start works

### SMS
- [ ] NOT TESTED — Tapping "Send" opens the Android Messages composer
- [ ] NOT TESTED — Phone number pre-filled correctly
- [ ] NOT TESTED — Message body pre-filled correctly
- [ ] NOT TESTED — No SMS permission prompt appears
- [ ] NOT TESTED — Message NOT marked "sent" until user confirms
- [ ] NOT TESTED — No SEND_SMS permission present in the final manifest (user-assisted only)

### Smart Messages
- [ ] NOT TESTED — Time-based trigger fires at scheduled time (app open)
- [ ] NOT TESTED — Date trigger fires on correct date (app open)
- [ ] NOT TESTED — Recurring trigger fires on correct weekday (app open)
- [ ] NOT TESTED — Manual-event trigger ("Trigger Now") works
- [ ] NOT TESTED — Smart Message appears in SmartInbox after execution
- [ ] NOT TESTED — Capacity exhaustion blocks execution with clear message
- [ ] NOT TESTED — Location Arrival/Departure trigger choices are not offered in this store release

### Scheduled Communications
- [ ] NOT TESTED — Message prepared by backend scheduler appears when app opens
- [ ] NOT TESTED — Push notification received for prepared message (if push enabled)
- [ ] NOT TESTED — App closed + offline → no false "zero capacity" on reconnect
- [ ] NOT TESTED — Dashboard refreshes on resume (app foregrounded)

### Account Deletion
- [ ] NOT TESTED — Delete Account reachable in Settings
- [ ] NOT TESTED — Two-step confirmation works
- [ ] NOT TESTED — After deletion, redirects to login
- [ ] NOT TESTED — No stale personal content visible after re-login on same device

### Offline / Network Loss
- [ ] NOT TESTED — Home loads (cached) with no network
- [ ] NOT TESTED — No stuck overlay on failed API call
- [ ] NOT TESTED — Network restored → data refreshes without manual reload
- [ ] NOT TESTED — No duplicate submission on retry

### Accessibility
- [ ] NOT TESTED — Text Size setting (Small/Standard/Large) applies
- [ ] NOT TESTED — OS font scaling does not clip text
- [ ] NOT TESTED — TalkBack reads buttons and navigation labels
- [ ] NOT TESTED — Dark Mode renders correctly (status bar, content)

### Keyboard
- [ ] NOT TESTED — Keyboard does not cover final CTA on Smart Message form
- [ ] NOT TESTED — Keyboard does not cover Save button on Campaign form
- [ ] NOT TESTED — Keyboard dismisses on tap-outside / scroll