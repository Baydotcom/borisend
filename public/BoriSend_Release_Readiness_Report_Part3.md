# BoriSend — Release Readiness Assessment (Part 3 of 3)

**Version:** 1.0 | **Date:** 2026-07-02 | **Status:** Read-Only Audit

> This is Part 3 of 3. Part 1 covers Sections 1–5. Part 2 covers Sections 6–11.

---

## SECTION 12 – Bugs

### Bug 1: Usage counter not incremented on send

| Field | Value |
| :--- | :--- |
| **Title** | Usage counter not incremented on send |
| **Description** | `markMessageSent` line 48 queries `UserSubscription.filter({ created_by_id: userId })` — webhook-created subscriptions have `created_by_id` = service role ID, not user ID. The subscription is never found, so `messages_used_this_month` is never incremented. |
| **Severity** | Critical |
| **Priority** | P0 |
| **Affected Screens** | CampaignDetail, MessageDetail, Home, Subscription, iOS Shortcut |
| **Root Cause** | `markMessageSent` uses `created_by_id` instead of `owner_user_id` for subscription lookup |
| **Suggested Fix** | Change `UserSubscription.filter({ created_by_id: userId })` to `UserSubscription.filter({ owner_user_id: userId })` |
| **Regression Risk** | Low — change is isolated to one query |

### Bug 2: No duplicate send prevention

| Field | Value |
| :--- | :--- |
| **Title** | No duplicate send prevention (no idempotency) |
| **Description** | `markMessageSent` has no idempotency check. No status verification before updating. Double-clicking "Send" or running Shortcut twice increments usage twice and updates the message twice. |
| **Severity** | Critical |
| **Priority** | P0 |
| **Affected Screens** | CampaignDetail, MessageDetail, Home (auto-send), iOS Shortcut |
| **Root Cause** | No status check before processing |
| **Suggested Fix** | Check `message.status` before updating. If already `sent`, return success without incrementing counters. Consider adding an idempotency key. |
| **Regression Risk** | Low — additive check |

### Bug 3: No ownership check in markMessageSent

| Field | Value |
| :--- | :--- |
| **Title** | No ownership verification in markMessageSent |
| **Description** | `markMessageSent` does not verify that `message.created_by_id === userId`. Any authenticated user with a message ID can mark any message as sent. |
| **Severity** | Critical |
| **Priority** | P0 |
| **Affected Screens** | All message-related |
| **Root Cause** | Missing ownership verification |
| **Suggested Fix** | Add check: `if (message.created_by_id !== userId) return 403` |
| **Regression Risk** | Low — additive check |

### Bug 4: getUsageStats self-healing cross-links subscriptions

| Field | Value |
| :--- | :--- |
| **Title** | getUsageStats self-healing cross-links subscriptions between users |
| **Description** | Lines 15–21 of `getUsageStats`: if no subscription found by `owner_user_id` or `created_by_id`, it links *any* active subscription to the current user. In multi-user environments, this could assign another user's subscription. |
| **Severity** | Critical |
| **Priority** | P0 |
| **Affected Screens** | Home, Subscription |
| **Root Cause** | Overly aggressive self-healing fallback |
| **Suggested Fix** | Remove self-healing. Return "free" status if no subscription found by `owner_user_id`. |
| **Regression Risk** | Medium — may affect users with orphaned subscriptions |

### Bug 5: No admin route guard

| Field | Value |
| :--- | :--- |
| **Title** | No admin route guard |
| **Description** | Admin routes are under `ProtectedRoute` (auth check only). No explicit `role === "admin"` check at route level. Admin pages redirect via JS in `useEffect`, but the page renders briefly before redirect. |
| **Severity** | High |
| **Priority** | P1 |
| **Affected Screens** | All admin pages |
| **Root Cause** | No `AdminRoute` component |
| **Suggested Fix** | Create `AdminRoute` component that checks `user.role === "admin"` and redirects non-admins |
| **Regression Risk** | Low — additive security layer |

### Bug 6: No quota enforcement in markMessageSent

| Field | Value |
| :--- | :--- |
| **Title** | No quota enforcement in markMessageSent |
| **Description** | `markMessageSent` does not check if user has remaining quota before accepting "sent" status. A user could send beyond their plan limit. |
| **Severity** | High |
| **Priority** | P1 |
| **Affected Screens** | All message-sending flows |
| **Root Cause** | Missing quota check |
| **Suggested Fix** | Check remaining quota before accepting "sent" status. Reject if quota exceeded. |
| **Regression Risk** | Medium — may reject sends that were previously accepted |

### Bug 7: manifest.json returns 404

| Field | Value |
| :--- | :--- |
| **Title** | PWA manifest.json returns 404 |
| **Description** | `index.html` references `/manifest.json` but the file does not exist at `public/manifest.json`. PWA installability is broken. |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | All (PWA-level) |
| **Root Cause** | Missing file |
| **Suggested Fix** | Create `public/manifest.json` with proper PWA configuration |
| **Regression Risk** | None |

### Bug 8: Frontend UserSubscription.filter({}) returns wrong results

| Field | Value |
| :--- | :--- |
| **Title** | Frontend UserSubscription.filter({}) with no ownership filter |
| **Description** | `Subscription.jsx`, `CampaignDetail.jsx`, `CreateCampaign.jsx` call `UserSubscription.filter({}, "-created_date", 1)` with an empty query. SDK applies `created_by_id` scoping, but webhook-created records have service role `created_by_id`. May return no results or wrong subscription. |
| **Severity** | High |
| **Priority** | P1 |
| **Affected Screens** | Subscription, CampaignDetail, CreateCampaign |
| **Root Cause** | Frontend should use `getUsageStats` instead of direct entity queries |
| **Suggested Fix** | Replace all `UserSubscription.filter({})` calls with `getUsageStats` for usage data |
| **Regression Risk** | Low |

### Bug 9: Stale quota check in CampaignDetail.generateMessage

| Field | Value |
| :--- | :--- |
| **Title** | Stale quota check in CampaignDetail.generateMessage |
| **Description** | Reads `subscription.messages_used_this_month` from direct entity query instead of `getUsageStats`. May allow generation beyond quota. |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | CampaignDetail |
| **Root Cause** | Uses cached counter instead of authoritative count |
| **Suggested Fix** | Use `getUsageStats` for quota check |
| **Regression Risk** | Low |

### Bug 10: Campaign.messages_sent drift

| Field | Value |
| :--- | :--- |
| **Title** | Campaign.messages_sent counter drift |
| **Description** | Incremented by `markMessageSent` but never reconciled with actual `Message` count. Will drift over time, especially with the `created_by_id` bug preventing counter increments. |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | CampaignDetail, CampaignCard |
| **Root Cause** | Stored counter that should be derived |
| **Suggested Fix** | Remove `messages_sent` field; derive from `Message` count |
| **Regression Risk** | Low — display change only |

### Bug 11: Non-atomic writes in markMessageSent

| Field | Value |
| :--- | :--- |
| **Title** | Non-atomic multi-table writes in markMessageSent |
| **Description** | `markMessageSent` updates `Message`, `UserSubscription`, and `Campaign` in three separate calls. A failure mid-sequence leaves inconsistent state. |
| **Severity** | High |
| **Priority** | P1 |
| **Affected Screens** | All message-sending flows |
| **Root Cause** | No transaction-like pattern |
| **Suggested Fix** | Implement a transaction-like pattern or use a single update operation where possible |
| **Regression Risk** | Medium — changes core send logic |

### Bug 12: Auto-send navigates away from app

| Field | Value |
| :--- | :--- |
| **Title** | Auto-send uses window.location.href which navigates away |
| **Description** | `useDueMessages.sendNow()` sets `window.location.href = smsUrl` which navigates away from the app. This interrupts the auto-send loop and is jarring. |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | Home (auto-send) |
| **Root Cause** | Uses location.href instead of window.open |
| **Suggested Fix** | Use `window.open(smsUrl, "_self")` or a different approach that doesn't break the app |
| **Regression Risk** | Low |

### Bug 13: Announcements not displayed to users

| Field | Value |
| :--- | :--- |
| **Title** | Announcements created in admin but never shown to users |
| **Description** | Admin can create announcements, but no user-facing component reads the `Announcement` entity. Announcements are invisible to users. |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | AppLayout, Home |
| **Root Cause** | Missing user-facing announcement component |
| **Suggested Fix** | Add announcement banner in AppLayout that reads active announcements |
| **Regression Risk** | Low — additive |

### Bug 14: Default user preferences not used

| Field | Value |
| :--- | :--- |
| **Title** | Settings default preferences not used in campaign creation |
| **Description** | User can set default tone, length, nickname in Settings, but `CreateCampaign.jsx` has its own hardcoded defaults (`tone: "warm"`, `message_length: "medium"`). |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | CreateCampaign, Settings |
| **Root Cause** | Settings page and CreateCampaign not connected |
| **Suggested Fix** | Load user preferences in CreateCampaign and use them as defaults |
| **Regression Risk** | Low |

### Bug 15: safe-area-bottom CSS class not defined

| Field | Value |
| :--- | :--- |
| **Title** | safe-area-bottom class used but not defined |
| **Description** | `MobileNav.jsx` uses `safe-area-bottom` class but it's not defined in `index.css` or `tailwind.config.js`. Bottom navigation may overlap with device home indicator. |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | All pages with bottom nav |
| **Root Cause** | Missing CSS definition |
| **Suggested Fix** | Add `.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom); }` to index.css |
| **Regression Risk** | None |

### Bug 16: InvokeLLM response type handling fragile

| Field | Value |
| :--- | :--- |
| **Title** | InvokeLLM response type handling is fragile |
| **Description** | In `CampaignDetail.generateMessage`: `const content = typeof result === "string" ? result : (result?.response || result?.text || String(result))`. In `MessageDetail.handleRegenerate`: `await base44.entities.Message.update(id, { content: result })` — assumes result is string. |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | CampaignDetail, MessageDetail |
| **Root Cause** | Inconsistent response type handling |
| **Suggested Fix** | Standardize InvokeLLM response handling across all calls |
| **Regression Risk** | Low |

### Bug 17: stripe_price_id not in admin plan form

| Field | Value |
| :--- | :--- |
| **Title** | Admin plan form missing stripe_price_id field |
| **Description** | `ManagePlans.jsx` form doesn't include `stripe_price_id`. New plans created without it can't be used for checkout (`createCheckoutSession` returns "This plan is not configured for checkout"). |
| **Severity** | Medium |
| **Priority** | P2 |
| **Affected Screens** | ManagePlans |
| **Root Cause** | Missing form field |
| **Suggested Fix** | Add `stripe_price_id` input to the plan form |
| **Regression Risk** | None |

### Bug 18: Visibility/focus listeners duplicated

| Field | Value |
| :--- | :--- |
| **Title** | Visibility/focus listeners duplicated on some pages |
| **Description** | `CampaignDetail.jsx`, `History.jsx`, and `Subscription.jsx` implement inline visibility/focus listeners instead of using `useRefreshOnFocus`. Some pages may have both. |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | CampaignDetail, History, Subscription |
| **Root Cause** | Duplicated logic |
| **Suggested Fix** | Use `useRefreshOnFocus` hook consistently |
| **Regression Risk** | Low |

### Bug 19: schedule_type "specific_dates" not in UI

| Field | Value |
| :--- | :--- |
| **Title** | schedule_type "specific_dates" missing from CreateCampaign UI |
| **Description** | The `scheduleTypes` array in `CreateCampaign.jsx` doesn't include `specific_dates`, but the Campaign schema allows it. |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | CreateCampaign |
| **Root Cause** | Missing option in dropdown |
| **Suggested Fix** | Add `specific_dates` to scheduleTypes with a date picker UI |
| **Regression Risk** | Low |

### Bug 20: twice_daily has no second time input

| Field | Value |
| :--- | :--- |
| **Title** | twice_daily schedule type has no second time input |
| **Description** | `CreateCampaign.jsx` offers `twice_daily` but only has one time input. There's no way to specify the second time. |
| **Severity** | Low |
| **Priority** | P3 |
| **Affected Screens** | CreateCampaign |
| **Root Cause** | Missing conditional UI |
| **Suggested Fix** | Add second time input when `schedule_type === "twice_daily"` |
| **Regression Risk** | Low |

---

## SECTION 13 – Missing Features

### Critical

| # | Feature | Reason |
| :--- | :--- | :--- |
| 1 | **Server-side scheduling engine** | Campaigns store schedules but no automation generates messages on schedule. Users must manually generate every message. |
| 2 | **Idempotency in markMessageSent** | No duplicate send prevention — billing fraud risk. |
| 3 | **Ownership verification in markMessageSent** | Any user can mark any message as sent. |
| 4 | **Admin route guard** | Any authenticated user can access admin URLs. |
| 5 | **Quota enforcement in markMessageSent** | Users can send beyond plan limit. |

### High

| # | Feature | Reason |
| :--- | :--- | :--- |
| 6 | **Push notifications** | Users have no way to know when messages need approval or sends fail. |
| 7 | **Pagination on History** | Users with >100 messages can't see older ones. |
| 8 | **Stripe Customer Portal** | Users can't manage their own subscriptions (cancel, update payment, view invoices). |
| 9 | **customer.subscription.updated webhook handling** | No mid-cycle upgrade/downgrade support. |
| 10 | **Cancel/downgrade subscription from UI** | No way for users to cancel or downgrade from the app. |
| 11 | **Billing history** | No way for users to view past payments. |
| 12 | **User-facing announcements** | Admin creates announcements but users never see them. |
| 13 | **Rate limiting** | No rate limiting on any endpoint, especially token-authenticated ones. |
| 14 | **Database indexes** | No indexes declared — queries will slow at scale. |
| 15 | **Retry logic for failed messages** | Failed messages are never retried. |

### Medium

| # | Feature | Reason |
| :--- | :--- | :--- |
| 16 | **PWA manifest** | `manifest.json` returns 404 — PWA install broken. |
| 17 | **Offline mode** | No offline support. |
| 18 | **Skeleton loading** | Only spinners, no skeleton screens. |
| 19 | **Charts/analytics dashboard** | No visual analytics for users or admins. |
| 20 | **Admin revenue/MRR tracking** | No revenue tracking. |
| 21 | **User disable/enable (admin)** | `is_disabled` field exists but no UI. |
| 22 | **Invite users (admin)** | No invite flow. |
| 23 | **Bulk message approval** | No way to approve multiple messages at once. |
| 24 | **Message search and filtering** | No search in History or within campaigns. |
| 25 | **Contact groups** | Entity exists but no UI. |
| 26 | **Content safety checks for AI** | No filtering of generated content. |
| 27 | **Crypto-secure automation token** | Token uses `Math.random()`. |
| 28 | **Token expiry** | No expiry mechanism. |
| 29 | **Error boundaries** | No React error boundaries. |
| 30 | **Network error handling** | No explicit network error handling. |

### Low

| # | Feature | Reason |
| :--- | :--- | :--- |
| 31 | **Dark mode** | No dark mode toggle. |
| 32 | **Swipe gestures** | No swipe-to-approve, swipe-to-delete. |
| 33 | **Pull to refresh** | No pull-to-refresh gesture. |
| 34 | **Page transitions** | No page transition animations. |
| 35 | **Timezone selector** | Auto-detected only, no manual selection. |
| 36 | **Password strength meter** | No strength indicator on registration. |
| 37 | **ToS acceptance** | No terms of service checkbox. |
| 38 | **App Settings integration** | Settings stored but never read by app. |

### Future

| # | Feature | Reason |
| :--- | :--- | :--- |
| 39 | **Android automation** | No Android equivalent of iOS Shortcuts. |
| 40 | **SMS gateway integration** | Currently relies on OS SMS URI scheme. |
| 41 | **A/B testing for AI prompts** | No way to test different prompt strategies. |
| 42 | **Multi-language support** | No i18n. |
| 43 | **Webhook for message delivery status** | No actual delivery confirmation. |
| 44 | **Admin audit log** | No logging of admin actions. |
| 45 | **Data export** | No way to export messages, campaigns, or contacts. |

---

## SECTION 14 – Release Checklist

### Database

- [ ] Add index on `Message(created_by_id, status, sent_at)`
- [ ] Add index on `Campaign(created_by_id, status)`
- [ ] Add index on `UserSubscription(owner_user_id)`
- [ ] Add index on `Message(campaign_id, status)`
- [ ] Add index on `User(automation_token)`
- [ ] Remove unused `ContactGroup` entity or build UI for it
- [ ] Remove unused fields: `Message.edited_content`, `Campaign.next_scheduled`, `Campaign.schedule_dates`
- [ ] Consider removing `Campaign.messages_sent` (derive instead)

### Backend

- [ ] Fix `markMessageSent` to use `owner_user_id` instead of `created_by_id`
- [ ] Add idempotency check in `markMessageSent` (check status before updating)
- [ ] Add ownership verification in `markMessageSent` (`message.created_by_id === userId`)
- [ ] Add quota enforcement in `markMessageSent`
- [ ] Remove `getUsageStats` self-healing fallback
- [ ] Replace `getUsageStats` in-memory filtering with database count query
- [ ] Handle `customer.subscription.updated` webhook event
- [ ] Create scheduled automation for message generation
- [ ] Add retry logic for failed messages
- [ ] Add rate limiting on all endpoints
- [ ] Make `markMessageSent` writes atomic
- [ ] Add logging/monitoring to all functions

### Frontend

- [ ] Replace all `UserSubscription.filter({})` calls with `getUsageStats`
- [ ] Add pagination to History page
- [ ] Add pagination to Campaigns page
- [ ] Add skeleton loading states
- [ ] Add error boundaries
- [ ] Add network error handling
- [ ] Use `useRefreshOnFocus` consistently (remove inline duplicates)
- [ ] Use user default preferences in CreateCampaign
- [ ] Add `specific_dates` schedule type to UI
- [ ] Add second time input for `twice_daily`
- [ ] Add message search and filtering
- [ ] Add bulk message approval
- [ ] Adopt `@tanstack/react-query` for data fetching
- [ ] Add incremental realtime updates (not full reload)

### Subscriptions

- [ ] Add `stripe_price_id` to admin plan form
- [ ] Add Stripe Customer Portal integration
- [ ] Add cancel subscription flow in UI
- [ ] Add downgrade subscription flow in UI
- [ ] Add billing history view
- [ ] Require authentication for checkout (ensure `user_id` is set)
- [ ] Remove hardcoded free plan limit (make configurable)
- [ ] Test full subscription lifecycle in Test Mode

### AI

- [ ] Add content safety checks on generated text
- [ ] Add rate limiting on generation calls
- [ ] Standardize InvokeLLM response type handling
- [ ] Add model selection option
- [ ] Add preview before message creation

### SMS

- [ ] Add delivery confirmation mechanism
- [ ] Add send failure handling
- [ ] Fix auto-send navigation issue (don't navigate away from app)
- [ ] Add batch sending support
- [ ] Consider SMS gateway integration for reliable delivery

### Notifications

- [ ] Implement push notifications
- [ ] Implement in-app notification center
- [ ] Add email notifications for critical events (failed sends, quota warnings)
- [ ] Add notification preferences in Settings

### Mobile

- [ ] Fix `safe-area-bottom` CSS class
- [ ] Add top safe area handling
- [ ] Add keyboard overlap handling
- [ ] Test on iPhone Safari
- [ ] Test on Android Chrome
- [ ] Add swipe gestures
- [ ] Add pull-to-refresh

### PWA

- [ ] Create `manifest.json`
- [ ] Verify `sw.js` behavior
- [ ] Add proper app icons (multiple sizes)
- [ ] Add splash screen
- [ ] Add install prompt
- [ ] Test PWA installation on iOS and Android
- [ ] Add offline mode support

### Admin

- [ ] Add `AdminRoute` component for route-level admin guard
- [ ] Add revenue/MRR tracking
- [ ] Add charts and trends
- [ ] Add user detail view
- [ ] Add user disable/enable
- [ ] Add user delete
- [ ] Add invite user flow
- [ ] Add pagination to all admin lists
- [ ] Add date range filtering
- [ ] Add data export
- [ ] Add audit log
- [ ] Add announcement display to users

### Security

- [ ] Add `AdminRoute` component
- [ ] Add ownership verification in `markMessageSent`
- [ ] Remove `getUsageStats` self-healing
- [ ] Use crypto-secure token generation
- [ ] Move automation token to POST body
- [ ] Add token expiry
- [ ] Add rate limiting
- [ ] Add brute-force protection on login
- [ ] Add input validation (phone numbers, content length)
- [ ] Add ARIA labels and roles
- [ ] Add custom focus indicators
- [ ] Add Content Security Policy headers

### Performance

- [ ] Replace `getUsageStats` in-memory filtering with database count
- [ ] Add database indexes
- [ ] Add pagination everywhere
- [ ] Use incremental realtime updates
- [ ] Adopt `@tanstack/react-query`
- [ ] Debounce visibility/focus events
- [ ] Add client-side caching
- [ ] Optimize admin dashboard queries (don't load 500 messages for count)

### Analytics

- [ ] Add user engagement tracking
- [ ] Add campaign performance metrics
- [ ] Add message volume trends
- [ ] Add admin revenue dashboard
- [ ] Add charts (recharts is installed)
- [ ] Add date range filtering
- [ ] Add custom event tracking (`base44.analytics.track`)

### Monitoring

- [ ] Add error monitoring (Sentry or similar)
- [ ] Add uptime monitoring
- [ ] Add webhook delivery monitoring
- [ ] Add function execution logging
- [ ] Add alerting for critical failures

### Testing

- [ ] Add unit tests for backend functions
- [ ] Add integration tests for Stripe webhooks
- [ ] Add end-to-end tests for user journeys
- [ ] Add load testing
- [ ] Add security testing
- [ ] Add cross-browser testing
- [ ] Add mobile device testing

### App Store Readiness

- [ ] Create app icons (all required sizes)
- [ ] Create splash screens
- [ ] Add privacy policy
- [ ] Add terms of service
- [ ] Configure PWA for iOS home screen
- [ ] Test iOS Shortcuts integration
- [ ] Add App Store metadata (if publishing native wrapper)

### Google Play Readiness

- [ ] Create app icons
- [ ] Create splash screens
- [ ] Add privacy policy
- [ ] Add terms of service
- [ ] Configure PWA for Android home screen
- [ ] Test Android Chrome behavior
- [ ] Add Play Store metadata (if publishing native wrapper)

### Privacy Policy

- [ ] Create privacy policy page
- [ ] Detail data collection (user info, contacts, message content)
- [ ] Detail data usage (AI generation, SMS sending)
- [ ] Detail data retention policy
- [ ] Detail third-party services (Stripe, AI provider)
- [ ] Add link in Settings and Registration

### Terms of Service

- [ ] Create terms of service page
- [ ] Define acceptable use
- [ ] Define subscription terms
- [ ] Define cancellation policy
- [ ] Define liability limitations
- [ ] Add link in Settings and Registration

### Support

- [ ] Add help/FAQ page
- [ ] Add contact support link
- [ ] Add feedback mechanism
- [ ] Add status page
- [ ] Add documentation

---

## SECTION 15 – Development Roadmap

### Sprint 1 – Platform Stability

**Goal:** Make the application trustworthy and prevent data corruption.

**Tasks:**
1. **Atomic `markMessageSent()`** — make the three-table write (Message, UserSubscription, Campaign) atomic or transactional; a failure mid-sequence must not leave inconsistent state
2. **Ownership validation** — verify `message.created_by_id === userId` before processing; reject with 403 if mismatched
3. **Duplicate send prevention** — check `message.status` before updating; if already `sent`, return success without incrementing counters (idempotency)
4. **Quota enforcement** — check remaining quota before accepting "sent" status; reject if quota exceeded
5. **Subscription lookup cleanup** — replace `created_by_id` with `owner_user_id` in `markMessageSent`; remove `getUsageStats` self-healing fallback
6. **Replace remaining direct `UserSubscription.filter()` calls** — replace all frontend `UserSubscription.filter({})` calls with `getUsageStats` (Subscription.jsx, CampaignDetail.jsx, CreateCampaign.jsx)
7. **Database consistency review** — audit all stored counters (`messages_sent`, `messages_used_this_month`) vs. derived values; remove or reconcile drift; verify `owner_user_id` is set correctly in all code paths

**Dependencies:** None — these are independent fixes.

**Estimated Complexity:** Medium — isolated changes to backend functions and frontend data-fetching patterns.

**Expected Outcome:** Billing works correctly, no duplicate sends, no cross-user data access, data integrity guaranteed, trust in the platform established.

---

### Sprint 2 – Core Automation Engine

**Goal:** Build the real engine that powers BoriSend.

**Tasks:**
1. **Scheduling engine** — create a scheduled backend automation that generates messages based on campaign schedule type, time, days, and dates; set `Message.scheduled_for` to the actual scheduled time (not `now`)
2. **Message generation engine** — server-side AI generation pipeline that creates messages on schedule, respects quota, avoids repetition, and handles approval_mode (manual → pending, automatic → approved)
3. **Delivery queue** — queue of approved messages ready for sending; `getPendingMessages` returns from this queue; supports both manual (SMS URI) and automated (iOS Shortcut) delivery
4. **Retry queue** — failed messages automatically retried with exponential backoff; configurable retry count limit; messages moved to "failed" after max retries
5. **Notification queue** — queue of notifications for pending approvals, failed sends, quota warnings, and billing events; consumed by push notification and email systems (built in Sprint 3)
6. **Timezone support** — store and respect user timezone (already auto-detected in Settings); schedule generation in the user's local timezone; handle DST transitions
7. **Random scheduling engine** — implement `random_daily` schedule type — generate a random time within a configurable window each day; ensure no two consecutive days produce the same time

**Dependencies:** Sprint 1 (data integrity and quota enforcement must be in place before the engine generates and delivers messages).

**Estimated Complexity:** High — the scheduling engine is the core of the product; requires careful timezone handling, retry logic, and queue management.

**Expected Outcome:** Campaigns automatically generate and deliver messages on schedule, with retry handling, timezone awareness, and a notification pipeline ready for Sprint 3.

---

### Sprint 3 – Mobile Experience

**Goal:** Deliver a premium experience on Android and iPhone.

**Tasks:**
1. **Push notifications** — implement push notifications for pending approvals, failed sends, quota warnings, and billing events; consumed from the notification queue built in Sprint 2
2. **iOS notification-assisted sending** — iOS push notification triggers a Shortcut that fetches and sends the next due message; replaces the 60-second polling model with real-time push-triggered delivery
3. **Android improvements** — investigate background delivery options for Android (no Shortcuts equivalent); consider a background service worker with periodic sync or a PWA-based approach
4. **PWA improvements** — create `manifest.json` (currently returns 404); add proper app icons (multiple sizes); add splash screen; add install prompt; verify `sw.js` behavior
5. **Manifest** — full PWA manifest with name, icons, start_url, display, theme_color, background_color, shortcuts, and screenshots for install prompt
6. **Safe areas** — define `safe-area-bottom` CSS class; add top safe area handling for notched devices; add keyboard overlap handling for input fields
7. **Refresh improvements** — debounce visibility/focus events; use `useRefreshOnFocus` consistently (remove inline duplicates); adopt `@tanstack/react-query` for client-side caching and incremental realtime updates

**Dependencies:** Sprint 2 (notification queue must exist before push notifications can be sent).

**Estimated Complexity:** Medium-High — push notifications require platform-specific configuration; PWA and safe area fixes are straightforward.

**Expected Outcome:** Premium mobile experience with real-time push notifications, installable PWA, proper safe area handling, and smooth refresh behavior.

---

### Sprint 4 – Subscription & Billing

**Goal:** Make subscriptions reliable and production-ready.

**Tasks:**
1. **Billing history** — display past payments and invoices to users; integrate Stripe invoice list API; show in Subscription page or dedicated billing page
2. **Customer Portal** — integrate Stripe Customer Portal so users can manage their own payment methods, view invoices, update billing details, and cancel subscriptions without leaving the app context
3. **Upgrade** — allow users to upgrade to a higher plan mid-cycle; handle proration via Stripe; update `UserSubscription` with new plan details, limits, and period
4. **Downgrade** — allow users to downgrade to a lower plan; schedule change for next billing period (Stripe handles); update `UserSubscription` when the change takes effect
5. **Cancel subscription** — add cancel button in the app UI; call Stripe API to cancel at period end; update `UserSubscription` status to `cancelled` when `customer.subscription.deleted` webhook fires
6. **Admin subscription management** — allow admins to view all subscriptions, search/filter, manually adjust limits, override billing period, and troubleshoot user billing issues
7. **Quota reporting** — admin dashboard showing quota usage across all users; identify users approaching limits; track revenue (MRR), active subscriptions, churn rate, and plan distribution

**Dependencies:** Sprints 1-2 (quota enforcement and data integrity must work before billing changes are layered on).

**Estimated Complexity:** Medium — Stripe handles most of the complexity; app needs to wire up the UI and webhook handlers.

**Expected Outcome:** Full subscription lifecycle (upgrade, downgrade, cancel, billing history, Customer Portal) with admin visibility and revenue reporting.

---

### Sprint 5 – Globalization & User Experience (Pre-launch)

**Goal:** Prepare BoriSend for a broader audience and polish the experience.

**Internationalization (i18n):**
1. **Build a proper localization framework** — set up i18n infrastructure (e.g., react-i18next or similar); create translation key system; provide `useTranslation` hook; support language switching in Settings with persistence
2. **Extract all UI text into language resource files** — move every hardcoded string (buttons, labels, headings, error messages, empty states, tooltips) into JSON resource files keyed by translation key
3. **Localize validation and error messages** — form validation, API error messages, toast notifications, and auth flow messages (login, register, OTP, password reset) all use translation keys
4. **Localize push notifications** — notification templates stored as resource files; rendered in the user's selected language at send time
5. **Localize AI prompt templates where appropriate** — campaign category labels, tone descriptions, and prompt instructions available in each supported language; AI generates messages in the user's language
6. **Respect user locale and formatting preferences** — dates, times, numbers, and currency formatted according to user locale using `Intl.DateTimeFormat`, `Intl.NumberFormat`, and `Intl.RelativeTimeFormat`
7. **Default to English, with the ability to add more languages without code changes** — resource files loaded dynamically; adding a new language is a new JSON file, not a code change

**Suggested launch languages:**
- English (default)
- French
- Spanish
- Portuguese

These cover a large international audience and can be expanded later.

**User Experience:**
1. **Contact Groups** — build CRUD UI for the existing `ContactGroup` entity; integrate with campaign creation (select a group instead of manual entry); import/export contacts
2. **Search** — add search to History (by recipient name, content, campaign name); add search within campaign messages; add search to admin user list (already exists)
3. **Pagination** — implement cursor-based pagination on History (currently capped at 100), Campaigns (capped at 50), and all admin lists; add "Load more" or infinite scroll
4. **Bulk approvals** — select multiple pending messages and approve all at once; add select-all checkbox per campaign; add bulk skip and bulk delete
5. **Announcements** — add announcement banner component in AppLayout that reads active, non-expired `Announcement` records; add `expires_at` to admin form; support dismissible banners
6. **Settings integration** — use user's default tone, length, nickname, and signature from Settings as defaults in CreateCampaign; make `free_monthly_limit` configurable via `AppSettings` instead of hardcoded
7. **Skeleton loading** — replace spinners with skeleton screens matching the content layout (card skeletons, list skeletons, stat card skeletons); reduce perceived load time
8. **Improved error handling** — add React error boundaries at page level; add network error detection with retry UI; add toast notifications for API failures; add fallback UI for failed realtime connections

**Dependencies:** Sprints 1-4 (stable platform, automation engine, mobile, and billing must all work before globalization and UX polish).

**Estimated Complexity:** High — i18n is a large cross-cutting effort touching every screen; UX improvements are many small focused tasks.

**Expected Outcome:** Internationalized app ready for English, French, Spanish, and Portuguese audiences, with polished UX including contact groups, search, pagination, bulk actions, announcements, skeleton loading, and robust error handling.

---

### Sprint 6 – Production Release

**Goal:** Prepare for launch.

**Tasks:**
1. **Security review** — final security audit covering ownership checks, admin route guards, token security (crypto-secure, expiry, POST body), rate limiting, brute-force protection, input validation, and data exposure risks; penetration testing
2. **Performance tuning** — add database indexes (Message, Campaign, UserSubscription, User); replace `getUsageStats` in-memory filtering with database count query; optimize admin dashboard queries; add client-side caching via `@tanstack/react-query`; verify performance at scale (10K+ messages, 1K+ users)
3. **End-to-end testing** — comprehensive E2E tests for all user journeys: registration, campaign creation, scheduling, AI generation, approval, sending (manual and automated), subscription lifecycle, admin operations; cross-browser and cross-device testing
4. **Privacy Policy** — create privacy policy page detailing data collection (user info, contacts, message content), data usage (AI generation, SMS sending), data retention, third-party services (Stripe, AI provider), and user rights; link in Settings and Registration
5. **Terms of Service** — create terms of service page defining acceptable use, subscription terms, cancellation policy, liability limitations, and dispute resolution; link in Settings and Registration
6. **App Store assets** — create app icons (all required sizes for iOS), splash screens, screenshots, app description, and metadata; configure PWA for iOS home screen; test iOS Shortcuts integration
7. **Google Play assets** — create app icons, splash screens, screenshots, app description, and metadata; configure PWA for Android home screen; test Android Chrome behavior
8. **Monitoring and analytics** — add error monitoring (Sentry or similar); add uptime monitoring; add webhook delivery monitoring; add function execution logging; add alerting for critical failures; add custom event tracking via `base44.analytics.track`
9. **Final regression testing** — full regression test of all features after all sprints are merged; verify no regressions in auth, campaign, messaging, subscription, admin, and i18n flows; verify Stripe webhook handling in live mode; final accessibility audit (WCAG 2.1 AA)

**Dependencies:** All previous sprints.

**Estimated Complexity:** Medium — mostly testing, auditing, and asset creation, but thoroughness is critical.

**Expected Outcome:** Production-ready app with full test coverage, monitoring, legal compliance, app store assets, and confidence in stability and security. Ready to go live with Stripe (switch from Test Mode to Live) and launch to the public.

---

## SECTION 16 – Release Readiness Score

### Backend

| Score | 4/10 |
| :--- | :--- |
| **Justification** | Critical billing bug (`markMessageSent` uses wrong field), no idempotency, no ownership checks, no quota enforcement, self-healing cross-links subscriptions, no server-side scheduling, no rate limiting. Stripe webhook handling is correct but incomplete (missing `subscription.updated`). |

### Frontend

| Score | 6/10 |
| :--- | :--- |
| **Justification** | Clean, well-designed UI with good componentization. But no pagination, no skeleton loading, no error boundaries, no incremental realtime updates, `UserSubscription.filter({})` ownership issues, duplicate logic, default preferences unused. |

### Database

| Score | 4/10 |
| :--- | :--- |
| **Justification** | No indexes declared, stored counters that drift (`messages_sent`, `messages_used_this_month`), unused entity (`ContactGroup`), unused fields (`edited_content`, `next_scheduled`, `schedule_dates`), no pagination strategy, no archiving strategy. |

### AI

| Score | 7/10 |
| :--- | :--- |
| **Justification** | Well-crafted prompts with repetition avoidance. Good regeneration feature. But no content safety checks, no rate limiting, fragile response type handling, no model selection, stale quota check before generation. |

### Messaging

| Score | 3/10 |
| :--- | :--- |
| **Justification** | No server-side scheduling engine (critical gap), no idempotency, no delivery confirmation, no retry logic, no duplicate prevention, usage counter broken, auto-send navigates away from app, `scheduled_for` set to `now` instead of scheduled time. The entire scheduling feature is non-functional. |

### Subscriptions

| Score | 5/10 |
| :--- | :--- |
| **Justification** | Stripe checkout works, webhook signature verification correct, checkout/renewal/cancellation handled. But usage tracking is broken, no quota enforcement, no downgrade/cancel from UI, no billing history, no Customer Portal, no `subscription.updated` handling, `stripe_price_id` not in admin form. |

### Security

| Score | 3/10 |
| :--- | :--- |
| **Justification** | No ownership verification in `markMessageSent`, no admin route guard, self-healing cross-links subscriptions, token not crypto-secure, token in URL, no rate limiting, no brute-force protection, frontend subscription queries with no ownership filter. Auth SDK is solid but app-level security is weak. |

### Performance

| Score | 3/10 |
| :--- | :--- |
| **Justification** | `getUsageStats` loads all messages into memory, no pagination (100/50 item caps), no database indexes, realtime triggers full reloads, duplicate API calls, admin loads 500 messages for a count, `@tanstack/react-query` installed but unused, no client-side caching. Will fail at 100K+ messages. |

### Mobile Experience

| Score | 5/10 |
| :--- | :--- |
| **Justification** | Good mobile-first design, clean bottom nav, good touch targets mostly. But PWA broken (manifest 404), no safe area handling, no keyboard overlap handling, no swipe gestures, no pull-to-refresh, no offline mode, auto-send navigates away. |

### Admin Portal

| Score | 5/10 |
| :--- | :--- |
| **Justification** | Functional admin dashboard with stats, user management, plan management, announcements, settings. But no route-level guard, no charts/revenue, no user detail/disable/delete/invite, announcements don't reach users, settings not integrated, `stripe_price_id` missing from plan form, no pagination. |

### Overall Product

| Score | 4.5/10 |
| :--- | :--- |
| **Justification** | The app has a polished, beautiful UI and functional core flows (auth, campaign creation, AI generation, Stripe checkout). However, it has critical billing bugs, no functional scheduling engine, significant security gaps, no pagination, broken PWA, and no notifications. It is a functional prototype that requires substantial work before production release. The estimated timeline is 12 weeks (6 sprints) to reach production readiness. |

---

## FINAL DELIVERABLE SUMMARY

This report serves as the official development backlog for bringing BoriSend to production release. All findings are based on a factual audit of the current codebase as of 2026-07-02. No code changes were made during this assessment.

### Key Metrics

| Metric | Value |
| :--- | :--- |
| Overall completion | 58% |
| Release readiness | 42% |
| Overall quality score | 4.5/10 |
| Total features audited | 33 |
| Complete features | 8 |
| Partially complete features | 12 |
| Broken features | 3 |
| Prototype features | 4 |
| Not started features | 6 |
| Total bugs identified | 20 |
| Critical bugs (P0) | 4 |
| High priority bugs (P1) | 4 |
| Medium priority bugs (P2) | 6 |
| Low priority bugs (P3) | 6 |
| Missing features identified | 45 |
| Critical missing features | 5 |
| High priority missing features | 10 |
| Medium priority missing features | 15 |
| Low priority missing features | 8 |
| Future features | 7 |
| Estimated time to production | 12 weeks (6 sprints — updated roadmap) |

### Priority Action Items (Updated Roadmap)

**Sprint 1 – Platform Stability:**
1. Atomic `markMessageSent()` — make three-table write transactional
2. Ownership validation in `markMessageSent`
3. Duplicate send prevention (idempotency check)
4. Quota enforcement in `markMessageSent`
5. Subscription lookup cleanup (use `owner_user_id`; remove self-healing)
6. Replace all remaining direct `UserSubscription.filter()` calls with `getUsageStats`
7. Database consistency review

**Sprint 2 – Core Automation Engine:**
8. Scheduling engine (server-side message generation on schedule)
9. Message generation engine
10. Delivery queue
11. Retry queue
12. Notification queue
13. Timezone support
14. Random scheduling engine

**Sprint 3 – Mobile Experience:**
15. Push notifications
16. iOS notification-assisted sending
17. Android improvements
18. PWA improvements + manifest
19. Safe areas
20. Refresh improvements

**Sprint 4 – Subscription & Billing:**
21. Billing history
22. Stripe Customer Portal
23. Upgrade / Downgrade / Cancel subscription
24. Admin subscription management
25. Quota reporting

**Sprint 5 – Globalization & UX:**
26. i18n framework + English, French, Spanish, Portuguese
27. Contact Groups, Search, Pagination, Bulk approvals
28. Announcements, Settings integration
29. Skeleton loading, Improved error handling

**Sprint 6 – Production Release:**
30. Security review, Performance tuning, E2E testing
31. Privacy Policy, Terms of Service
32. App Store & Google Play assets
33. Monitoring and analytics
34. Final regression testing

---

### Score Summary Table

| Dimension | Score (1-10) |
| :--- | :--- |
| Backend | 4 |
| Frontend | 6 |
| Database | 4 |
| AI | 7 |
| Messaging | 3 |
| Subscriptions | 5 |
| Security | 3 |
| Performance | 3 |
| Mobile Experience | 5 |
| Admin Portal | 5 |
| **Overall Product** | **4.5** |

---

*End of Report*

**Document Version:** 1.0
**Date:** 2026-07-02
**Prepared By:** Base44 AI Development Agent
**Classification:** Official Development Backlog
**Status:** Read-Only Audit — No Code Changes Made

---

### Download Links

- **Part 1 (Sections 1–5):** `/BoriSend_Release_Readiness_Report_Part1.md`
- **Part 2 (Sections 6–11):** `/BoriSend_Release_Readiness_Report_Part2.md`
- **Part 3 (Sections 12–16):** `/BoriSend_Release_Readiness_Report_Part3.md` (this file)
