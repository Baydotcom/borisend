# BoriSend Project — Technical Discovery Report

**Document Version:** 1.0
**Revision Date:** 2026-07-01
**Status:** Audit Only — No Changes Made
**Prepared For:** BoriSend Production Architecture Baseline

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Application Overview](#2-application-overview)
3. [Functional Features Inventory](#3-functional-features-inventory)
4. [Screen Inventory](#4-screen-inventory)
5. [Database Audit](#5-database-audit)
6. [Backend Function Audit](#6-backend-function-audit)
7. [Integrations](#7-integrations)
8. [Subscription System](#8-subscription-system)
9. [Messaging Architecture](#9-messaging-architecture)
10. [State Management](#10-state-management)
11. [Security](#11-security)
12. [Performance](#12-performance)
13. [Technical Debt](#13-technical-debt)
14. [Project Structure](#14-project-structure)
15. [Known Bugs](#15-known-bugs)
16. [Production Readiness Assessment](#16-production-readiness-assessment)
17. [Recommendations](#17-recommendations)
18. [Missing Information](#18-missing-information)
19. [Appendix A — Entity Relationship Diagrams](#appendix-a--entity-relationship-diagrams)
20. [Appendix B — Message Lifecycle Diagram](#appendix-b--message-lifecycle-diagram)
21. [Appendix C — Subscription Lifecycle Diagram](#appendix-c--subscription-lifecycle-diagram)
22. [Appendix D — iOS Shortcut Flow Diagram](#appendix-d--ios-shortcut-flow-diagram)
23. [Appendix E — Dashboard Data Flow Diagram](#appendix-e--dashboard-data-flow-diagram)

---

## 1. Executive Summary

### Project Purpose
BoriSend is a mobile-first SMS campaign platform that enables users to generate, schedule, approve, and send personalised text messages to contacts via AI-generated content. The app targets personal and small-business use cases (love messages, church follow-ups, employee appreciation, client management, etc.).

### Current Development Status
The application is in a **late prototype / early beta** stage. Core user flows (campaign creation, AI message generation, Stripe subscription, iOS Shortcut integration) are functionally implemented. However, several backend functions contain ownership bugs, and data consistency mechanisms (atomic writes, duplicate prevention, idempotency) are absent or fragile.

### Overall Architecture Summary
- **Frontend:** React + Vite + Tailwind CSS, deployed as a PWA.
- **Backend:** Base44 serverless functions (Deno Deploy), using the Base44 SDK for entity CRUD and `asServiceRole` for elevated operations.
- **External Services:** Stripe (subscriptions), Base44 Core InvokeLLM (AI message generation), native OS SMS URI schemes (message dispatch), iOS Shortcuts (automation).
- **Database:** Base44 managed entities (MongoDB-backed).

### Current Maturity Level
**Level 3 of 5 — Functional Prototype.** The app works end-to-end for a single user in a controlled environment. It is not yet hardened for production at scale.

### Major Strengths
- Clean, mobile-first UI with a polished design system.
- Functional Stripe checkout and webhook integration.
- Innovative iOS Shortcut integration approach for SMS dispatch without a dedicated SMS gateway.
- AI message generation with context-aware prompting (avoids repetition).
- Realtime entity subscriptions for live UI updates.

### Major Weaknesses
- **Ownership inconsistency:** `markMessageSent` queries `UserSubscription` by `created_by_id` instead of `owner_user_id`, causing usage counters to silently fail for webhook-created subscriptions.
- **No duplicate send prevention:** No idempotency key, no status check before marking sent. A retried Shortcut or a double-clicked "Send" button increments usage twice.
- **No server-side scheduling engine:** Message scheduling relies entirely on client-side polling (`useDueMessages` with a 60-second interval). There is no cron job or scheduled automation that generates or dispatches messages on a recurring schedule.
- **Non-atomic multi-table writes:** `markMessageSent` updates `Message`, `UserSubscription`, and `Campaign` in three separate calls. A failure mid-sequence leaves inconsistent state.
- **No pagination on History or dashboard.** Lists are loaded with hardcoded limits (100–50 items).

### Critical Risks
1. **Duplicate billing:** Users can be charged twice for a single message if `markMessageSent` is called multiple times.
2. **Quota bypass:** The `markMessageSent` function does not verify the user's remaining quota before accepting a "sent" status. A user could exceed their plan limit.
3. **Orphaned subscriptions:** The `getUsageStats` self-healing fallback links *any* active subscription to the current user, which could cross-link subscriptions in a multi-user environment.
4. **No automated message generation:** Campaigns are configured with schedules, but no backend automation actually generates messages on schedule. Users must manually click "Generate new message" in `CampaignDetail`.

---

## 2. Application Overview

### Platforms Supported

| Platform | Support Level | Notes |
| :--- | :--- | :--- |
| **Web App** | Full | React SPA, deployed on Base44 hosting. Responsive, mobile-first layout. |
| **PWA** | Full | `index.html` includes PWA meta tags (`apple-mobile-web-app-capable`, `theme-color`, manifest link). `public/manifest.json` is referenced but **returns 404** — the file does not exist at the referenced path or could not be read. |
| **Android** | Partial | No native app. SMS sending uses `sms:` URI scheme via browser. No dedicated Android automation flow documented. |
| **iOS** | Partial | No native app. SMS sending uses `sms:` URI scheme. iOS Shortcuts integration is documented and functional via `getPendingMessages` and `markMessageSent` backend functions. |
| **Admin Portal** | Full | Separate admin routes (`/admin`, `/admin/users`, `/admin/plans`, `/admin/announcements`, `/admin/settings`) accessible to users with `role: "admin"`. |

### Current Application Flow

```
User registers/logs in
  → Lands on Home (dashboard)
    → Views stats (active campaigns, sent this month, pending, remaining)
    → Views "Due now" messages (if any)
    → Views "Awaiting approval" messages
    → Views campaign list

User creates a campaign
  → CreateCampaign page (4-step wizard: Category → Details → Style → Schedule)
  → Campaign saved with status "active" or "draft"

User manages a campaign
  → CampaignDetail page
  → Clicks "Generate new message" → AI generates content via InvokeLLM
  → Message created with status "pending" (manual mode) or "approved" (automatic mode)
  → User approves pending messages
  → User sends approved messages via sms: URI scheme
  → markMessageSent updates status to "sent"

User sets up automation
  → ShortcutsSetup page
  → Generates automation token (stored on User entity)
  → Configures iOS Shortcut to poll getPendingMessages endpoint
  → Shortcut sends messages and calls markMessageSent

User manages subscription
  → Subscription page
  → Views current usage (from getUsageStats)
  → Selects a plan → createCheckoutSession → Stripe Checkout → redirect back
  → Stripe webhook updates UserSubscription

Admin manages the platform
  → AdminDashboard, ManageUsers, ManagePlans, ManageAnnouncements, AdminSettings
```

---

## 3. Functional Features Inventory

| # | Feature | Description | Status | Related Screens | Backend Functions | Database Tables | Known Issues |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Campaign Creation | 4-step wizard: category, details, style, schedule | **Complete** | CreateCampaign | — | Campaign | Campaign limit check queries `UserSubscription` without `owner_user_id`, may show incorrect limit. |
| 2 | AI Message Generation | LLM generates SMS content based on campaign parameters | **Complete** | CampaignDetail | `Core.InvokeLLM` | Message | Quota check in `generateMessage` reads `subscription.messages_used_this_month` directly (cached, may be stale). |
| 3 | Message Approval | User approves pending messages before sending | **Complete** | CampaignDetail | — | Message | — |
| 4 | Message Scheduling | Campaign stores schedule type/time/days | **Partially Complete** | CreateCampaign, CampaignDetail | — | Campaign | **No backend automation** actually generates messages on schedule. Only manual generation exists. |
| 5 | Message Sending (Manual) | User clicks "Send via SMS" → opens `sms:` URI → marks sent | **Complete** | CampaignDetail | `markMessageSent` | Message, UserSubscription, Campaign | No duplicate prevention; `markMessageSent` uses `created_by_id` for subscription lookup. |
| 6 | Message Sending (Auto) | Auto-send via `useDueMessages` hook with 60s polling | **Partially Complete** | Home | `getPendingMessages`, `markMessageSent` | Message, Campaign | Only works while the app is open in the browser. No background processing. |
| 7 | Android Sending | Uses `sms:` URI scheme | **Partially Complete** | CampaignDetail, Home | — | — | No dedicated Android automation flow. Same URI scheme as iOS. |
| 8 | iOS Shortcut Sending | Shortcut polls `getPendingMessages`, sends via Messages app, calls `markMessageSent` | **Complete** | ShortcutsSetup | `getPendingMessages`, `markMessageSent` | User, Message, Campaign, UserSubscription | Token is a plain 32-char random string with no expiry. |
| 9 | Contact Groups | Entity exists for storing contact groups | **Not Implemented** | — | — | ContactGroup | Entity schema exists but **no UI** creates, manages, or uses ContactGroup records. Campaign uses inline `recipients` array instead. |
| 10 | Subscriptions | Stripe checkout, webhook, usage tracking | **Partially Complete** | Subscription | `createCheckoutSession`, `stripeWebhook`, `getUsageStats` | SubscriptionPlan, UserSubscription | No upgrade/downgrade flow (only "Upgrade" button). Cancelled plan reverts to Free via webhook. |
| 11 | Admin Dashboard | Admin overview page | **Complete** | AdminDashboard | — | User, Campaign, Message, UserSubscription | Needs verification of access control. |
| 12 | Analytics | Usage stats displayed on dashboard | **Partially Complete** | Home | `getUsageStats` | Message, UserSubscription | Stats are basic counts. No charts, trends, or historical data. |
| 13 | Notifications/Announcements | In-app announcement system | **Complete** | ManageAnnouncements | — | Announcement | Needs verification of where announcements are displayed to users. |
| 14 | Settings | User preferences (tone, length, nickname, signature, timezone) | **Complete** | Settings | — | User | Preferences stored on User entity via `updateMe`. |
| 15 | PWA / Home Screen | PWA meta tags in `index.html` | **Partially Complete** | — | — | — | `manifest.json` returns 404. No service worker file readable. PWA install may not work correctly. |
| 16 | Message History | Paginated list of all messages with status tabs | **Partially Complete** | History | — | Message, Campaign | No pagination — hardcoded limit of 100 messages. |
| 17 | Campaign Limit Enforcement | Prevents creating campaigns beyond plan limit | **Partially Complete** | CreateCampaign | — | UserSubscription, Campaign | Limit check uses `UserSubscription.filter({})` without ownership filter — could read another user's subscription. |

---

## 4. Screen Inventory

| # | Screen Name | Route | Purpose | Components Used | Data Read | Data Written | Backend Functions Called | Current Issues |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Home | `/` | Dashboard with stats, due messages, pending approvals, campaign list | StatsCard, CampaignCard, useDueMessages, useRefreshOnFocus | User, Campaign, Message, UserSubscription | — | `getUsageStats`, `getPendingMessages` (via hook) | `Promise.all` fetches campaigns and messages; usage fetched separately (good). Due messages poll every 60s. |
| 2 | Campaigns | `/campaigns` | List all campaigns | CampaignCard | Campaign | — | — | Not fully audited in this pass. |
| 3 | CreateCampaign | `/campaigns/new`, `/campaigns/:id/edit` | 4-step campaign creation wizard | Input, Textarea, Select, Switch, Label | Campaign (edit mode), UserSubscription, Campaign | Campaign (create/update) | — | Campaign limit check queries `UserSubscription.filter({})` with **no ownership filter** — potential cross-user data read. |
| 4 | CampaignDetail | `/campaigns/:id` | View/manage single campaign, generate messages, approve/send | MessageItem, DropdownMenu, AlertDialog, Badge | Campaign, Message, UserSubscription | Campaign (status toggle, duplicate, delete), Message (create, approve, skip, send) | `markMessageSent`, `Core.InvokeLLM` | Quota check reads `subscription.messages_used_this_month` from a `UserSubscription.filter({})` call with no ownership filter. Duplicate subscription reads. |
| 5 | History | `/history` | Message history with status filter tabs | Tabs, statusConfig | Message (100 items), Campaign (50 items) | — | — | No pagination. Hardcoded limit of 100 messages. Will miss older messages at scale. |
| 6 | MessageDetail | `/messages/:id` | View single message details | — | Message, Campaign | — | — | Not fully audited in this pass. |
| 7 | Settings | `/settings` | User preferences and profile | Input, Select, Label | User | User (via `updateMe`) | — | — |
| 8 | Subscription | `/subscription` | View usage, browse plans, checkout | Button, PageHeader | SubscriptionPlan, UserSubscription | — | `getUsageStats`, `createCheckoutSession` | `UserSubscription.filter({})` with no ownership filter. Iframe checkout is correctly blocked. |
| 9 | ShortcutsSetup | `/automation` | iOS Shortcut setup, token generation, delivery mode | Switch, ShortcutStoryboard | User | User (via `updateMe`: `automation_token`, `delivery_mode`) | — | Token generated client-side with `Math.random()` (not cryptographically secure). |
| 10 | Login | `/login` | Email/password login + Google OAuth | AuthLayout, GoogleIcon | — | — | Auth SDK | — |
| 11 | Register | `/register` | Email/password registration + OTP + Google | AuthLayout, GoogleIcon | — | — | Auth SDK | — |
| 12 | ForgotPassword | `/forgot-password` | Password reset request | AuthLayout | — | — | Auth SDK | — |
| 13 | ResetPassword | `/reset-password` | Password reset with token | AuthLayout | — | — | Auth SDK | — |
| 14 | AdminDashboard | `/admin` | Admin overview | — | Various | — | — | Access control via `user.role === "admin"` check in Settings link. Route-level protection needs verification. |
| 15 | ManageUsers | `/admin/users` | Manage users | — | User | User | — | — |
| 16 | ManagePlans | `/admin/plans` | Manage subscription plans | — | SubscriptionPlan | SubscriptionPlan | — | — |
| 17 | ManageAnnouncements | `/admin/announcements` | Manage announcements | — | Announcement | Announcement | — | — |
| 18 | AdminSettings | `/admin/settings` | Manage app settings | — | AppSettings | AppSettings | — | — |
| 19 | AppLayout | (layout) | Main app shell with bottom navigation | MobileNav | — | — | — | — |
| 20 | PageNotFound | `*` | 404 page | — | — | — | — | — |

---

## 5. Database Audit

### 5.1 Entity: User

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `role` | string (enum: `admin`, `user`) | No | Default: `user` |
| `default_tone` | string | No | User preference |
| `default_length` | string | No | User preference |
| `default_nickname` | string | No | User preference |
| `signature` | string | No | User preference |
| `timezone` | string | No | User preference |
| `is_disabled` | boolean | No | Default: `false` |
| `delivery_mode` | string (enum: `auto`, `manual`) | No | Default: `manual` |
| `automation_token` | string | No | 32-char token for iOS Shortcut auth |

**Built-in fields (not declared, always present):** `id`, `created_date`, `updated_date`, `full_name`, `email`

- **Ownership Field:** N/A (this IS the user entity)
- **Source of Truth:** Yes
- **Derived Fields:** None
- **Relationships:** `UserSubscription.owner_user_id` → `User.id`; `Campaign.created_by_id` → `User.id`; `Message.created_by_id` → `User.id`
- **Known Risks:** `automation_token` is generated client-side using `Math.random()` (not cryptographically secure). No token expiry or rotation policy.

---

### 5.2 Entity: UserSubscription

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `plan_id` | string | No | References `SubscriptionPlan.id` |
| `plan_name` | string | No | Cached plan name |
| `owner_user_id` | string | No | The actual app user ID (explicit, since `asServiceRole` overrides `created_by_id`) |
| `status` | string (enum: `active`, `expired`, `cancelled`, `free`) | No | Default: `free` |
| `monthly_limit` | number | No | Default: `2` |
| `max_campaigns` | number | No | Default: `1` |
| `messages_used_this_month` | number | No | Default: `0` |
| `current_period_start` | string (date-time) | No | Billing period start |
| `current_period_end` | string (date-time) | No | Billing period end |
| `last_reset_date` | string (date) | No | Last usage reset date |
| `stripe_customer_id` | string | No | Stripe customer reference |
| `stripe_subscription_id` | string | No | Stripe subscription reference |

**Built-in fields:** `id`, `created_date`, `updated_date`, `created_by_id` (unreliable — set to service role ID when created via webhook)

- **Ownership Field:** `owner_user_id` (**trusted**); `created_by_id` (**unreliable** — overwritten by `asServiceRole`)
- **Source of Truth:** Partial. `status`, `plan_name`, `monthly_limit` are source of truth for billing. `messages_used_this_month` is a **derived counter** that is also recomputed by `getUsageStats`.
- **Derived Fields:** `messages_used_this_month` (derived from `Message` count), `plan_name` and `monthly_limit` (cached from `SubscriptionPlan` at webhook time)
- **Relationships:** `plan_id` → `SubscriptionPlan.id`; `owner_user_id` → `User.id`; `stripe_customer_id` → Stripe Customer; `stripe_subscription_id` → Stripe Subscription
- **Known Risks:**
  - `markMessageSent` queries by `created_by_id` (line 48) instead of `owner_user_id` — **will not find webhook-created subscriptions**, so usage counter is never incremented by the send flow.
  - `getUsageStats` self-healing fallback (lines 15–21) links *any* active subscription to the current user — **dangerous in multi-user environments**.
  - `plan_name` and `monthly_limit` are cached at webhook time. If admin changes a `SubscriptionPlan`, existing subscriptions do not update.
  - Frontend pages (`Subscription.jsx`, `CampaignDetail.jsx`, `CreateCampaign.jsx`) query `UserSubscription.filter({})` with **no ownership filter**, relying on the SDK's automatic `created_by_id` scoping — which may not work for service-role-created records.

---

### 5.3 Entity: SubscriptionPlan

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Plan name |
| `price` | number | Yes | Price amount |
| `currency` | string | No | Default: `GBP` |
| `billing_period` | string (enum: `monthly`, `yearly`) | No | Default: `monthly` |
| `monthly_message_limit` | number | Yes | Messages allowed per month |
| `max_campaigns` | number | No | Default: `1` |
| `features` | array of strings | No | Feature list for display |
| `is_active` | boolean | No | Default: `true` |
| `sort_order` | number | No | Default: `0` |
| `is_popular` | boolean | No | Default: `false` |
| `promotional_price` | number | No | Optional promo price |
| `promotional_label` | string | No | Optional promo label |
| `stripe_price_id` | string | No | Stripe price reference |

- **Ownership Field:** N/A (admin-defined, global)
- **Source of Truth:** Yes — for plan configuration
- **Derived Fields:** None
- **Relationships:** Referenced by `UserSubscription.plan_id`
- **Known Risks:** `stripe_price_id` must be kept in sync with Stripe manually. No validation that it matches an actual Stripe price.

---

### 5.4 Entity: Campaign

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Campaign name |
| `category` | string (enum: 13 values) | Yes | Campaign type |
| `purpose` | string | No | Free-text description |
| `tone` | string (enum: 13 values) | Yes | Message tone |
| `message_length` | string (enum: `short`, `medium`, `long`) | No | Default: `medium` |
| `writing_style` | string (enum: 6 values) | No | Default: `conversational` |
| `pet_name` | string | No | Optional pet name for messages |
| `additional_instructions` | string | No | Free-text instructions for AI |
| `recipients` | array of objects `{name, phone}` | No | Inline recipient list |
| `schedule_type` | string (enum: 9 values) | No | Default: `specific_daily` |
| `schedule_time` | string | No | Time of day (HH:MM) |
| `schedule_days` | array of numbers | No | Weekday indices (0=Sun) |
| `schedule_dates` | array of strings | No | Specific dates |
| `approval_mode` | string (enum: `manual`, `automatic`) | No | Default: `manual` |
| `status` | string (enum: `active`, `paused`, `completed`, `draft`) | No | Default: `draft` |
| `messages_sent` | number | No | Default: `0` — **derived counter** |
| `next_scheduled` | string (date-time) | No | Next scheduled message time |
| `contact_group` | string | No | References ContactGroup (unused in UI) |

- **Ownership Field:** `created_by_id` (set automatically by SDK for user-scoped calls)
- **Source of Truth:** Yes — for campaign configuration
- **Derived Fields:** `messages_sent` (incremented by `markMessageSent`, also computable from `Message` count) — **high drift risk**
- **Relationships:** `contact_group` → `ContactGroup.name` (not used in UI); `recipients` inline (not linked to ContactGroup)
- **Known Risks:** `messages_sent` can drift from actual `Message` count. `contact_group` field is declared but never used in any UI. `recipients` array can grow unbounded.

---

### 5.5 Entity: Message

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `campaign_id` | string | Yes | References `Campaign.id` |
| `content` | string | Yes | Message text |
| `recipient_name` | string | Yes | Recipient name |
| `recipient_phone` | string | No | Recipient phone number |
| `status` | string (enum: `pending`, `approved`, `sent`, `skipped`, `failed`, `draft`) | No | Default: `pending` |
| `scheduled_for` | string (date-time) | No | Scheduled send time |
| `sent_at` | string (date-time) | No | Actual send timestamp |
| `edited_content` | string | No | Edited message content (unused in UI) |

- **Ownership Field:** `created_by_id` (set automatically by SDK)
- **Source of Truth:** Yes — primary log of all message activity
- **Derived Fields:** `sent_at` (set when status transitions to `sent`)
- **Relationships:** `campaign_id` → `Campaign.id`
- **Known Risks:** No idempotency key. `edited_content` is declared but never read or written by any UI or function. No index on `(created_by_id, status, sent_at)` — queries will slow at scale.

---

### 5.6 Entity: ContactGroup

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | Yes | Group name |
| `contacts` | array of objects `{name, phone}` | No | Contact list |

- **Ownership Field:** `created_by_id` (inherited)
- **Source of Truth:** Yes (but unused)
- **Derived Fields:** None
- **Relationships:** Referenced by `Campaign.contact_group` (but this field is never populated)
- **Known Risks:** **Entirely unused.** No UI creates, reads, or manages ContactGroups. Campaigns use inline `recipients` arrays instead. This entity may be a leftover from an earlier design.

---

### 5.7 Entity: AppSettings

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `setting_key` | string | Yes | Setting identifier |
| `setting_value` | string | Yes | Setting value (all values stored as strings) |
| `description` | string | No | Setting description |

- **Ownership Field:** N/A (global)
- **Source of Truth:** Yes
- **Derived Fields:** None
- **Relationships:** None
- **Known Risks:** All values are strings, requiring type parsing on read. No schema for value types.

---

### 5.8 Entity: Announcement

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `title` | string | Yes | Announcement title |
| `body` | string | Yes | Announcement body |
| `type` | string (enum: `info`, `warning`, `promo`, `update`) | No | Default: `info` |
| `is_active` | boolean | No | Default: `true` |
| `expires_at` | string (date-time) | No | Expiry timestamp |

- **Ownership Field:** N/A (global)
- **Source of Truth:** Yes
- **Derived Fields:** None
- **Relationships:** None
- **Known Risks:** Needs verification of where active announcements are displayed to end users (not visible in Home.jsx or AppLayout.jsx).

---

## 6. Backend Function Audit

### 6.1 Function: `createCheckoutSession`

| Property | Value |
| :--- | :--- |
| **Purpose** | Creates a Stripe Checkout session for subscription purchase |
| **Inputs** | `{ plan_id: string }` (from request body) |
| **Outputs** | `{ url: string }` — Stripe Checkout URL |
| **Tables Read** | `SubscriptionPlan` |
| **Tables Written** | None (Stripe session is created externally) |
| **Uses Service Role** | Yes — reads `SubscriptionPlan` via `asServiceRole` |
| **Authentication Required** | No (gracefully handles unauthenticated users; passes `userId` in metadata if available) |
| **Authorization Rules** | None — any caller can create a checkout session for any plan |
| **Side Effects** | Creates Stripe Checkout session with `base44_app_id`, `plan_id`, `user_id` in metadata; sets `client_reference_id` to userId |
| **Failure Risks** | Stripe API failure; missing `STRIPE_SECRET_KEY`; plan without `stripe_price_id` |
| **Safe For** | Frontend (with iframe check in `Subscription.jsx`) |

---

### 6.2 Function: `getPendingMessages`

| Property | Value |
| :--- | :--- |
| **Purpose** | Retrieves approved messages that are due for sending |
| **Inputs** | `token` (query param, optional) — automation token for Shortcut/Android auth |
| **Outputs** | `{ messages: [{id, content, recipient_name, recipient_phone}], delivery_mode: string }` |
| **Tables Read** | `User` (token lookup), `Campaign`, `Message` |
| **Tables Written** | None |
| **Uses Service Role** | Yes — all reads via `asServiceRole` |
| **Authentication Required** | Yes — either automation token or session auth |
| **Authorization Rules** | Token-based: looks up `User` by `automation_token`. Session-based: uses `auth.me()`. Filters campaigns by `created_by_id: userId` |
| **Side Effects** | None |
| **Failure Risks** | If user has many campaigns, the `$in` query on `campaign_id` could be large. No pagination — returns all due messages. |
| **Safe For** | Frontend, iOS Shortcut, Android automation |

**Bug:** Filters campaigns by `created_by_id: userId`. For service-role reads, `created_by_id` is the actual user ID (since campaigns are created by users, not service role) — this is **correct** for this function.

---

### 6.3 Function: `getUsageStats`

| Property | Value |
| :--- | :--- |
| **Purpose** | Calculates user's message usage, quota, and plan info for the current billing period |
| **Inputs** | None (uses authenticated user context) |
| **Outputs** | `{ used, limit, remaining, planName, status, periodStart, periodEnd }` |
| **Tables Read** | `UserSubscription`, `Message` |
| **Tables Written** | `UserSubscription` (self-healing `owner_user_id`, usage reset, usage sync) |
| **Uses Service Role** | Yes — all reads and writes via `asServiceRole` |
| **Authentication Required** | Yes — `auth.me()` |
| **Authorization Rules** | User must be authenticated |
| **Side Effects** | (1) Self-heals orphaned subscriptions by linking to current user. (2) Resets usage if billing period has elapsed. (3) Syncs `messages_used_this_month` counter. |
| **Failure Risks** | Self-healing logic (lines 15–21) links *any* active subscription to the current user — **critical risk in multi-user environments**. If two users call simultaneously, both could claim the same subscription. |
| **Safe For** | Frontend |

---

### 6.4 Function: `markMessageSent`

| Property | Value |
| :--- | :--- |
| **Purpose** | Updates message status and increments usage/campaign counters |
| **Inputs** | `{ message_id: string, token?: string, status?: string }` |
| **Outputs** | `{ success: true }` |
| **Tables Read** | `User` (token lookup), `Message`, `UserSubscription`, `Campaign` |
| **Tables Written** | `Message` (status, sent_at), `UserSubscription` (messages_used_this_month++), `Campaign` (messages_sent++) |
| **Uses Service Role** | Yes — all operations via `asServiceRole` |
| **Authentication Required** | Yes — either automation token or session auth |
| **Authorization Rules** | Token-based or session-based. **Does NOT verify** that the message belongs to the authenticated user. |
| **Side Effects** | (1) Updates `Message.status` and `Message.sent_at`. (2) Increments `UserSubscription.messages_used_this_month`. (3) Increments `Campaign.messages_sent`. |
| **Failure Risks** | **CRITICAL:** Queries `UserSubscription` by `created_by_id: userId` (line 48) — **will not find webhook-created subscriptions** (whose `created_by_id` is the service role ID). Usage counter increment silently fails. **No idempotency** — calling twice increments twice. **No ownership check** — any user with a message ID can mark any message as sent. **Non-atomic** — three separate writes can leave inconsistent state if one fails. |
| **Safe For** | Frontend, iOS Shortcut, Android automation (but with above risks) |

---

### 6.5 Function: `stripeWebhook`

| Property | Value |
| :--- | :--- |
| **Purpose** | Processes Stripe webhook events to sync subscription state |
| **Inputs** | Stripe event payload (raw body + signature header) |
| **Outputs** | `{ received: true }` |
| **Tables Read** | `SubscriptionPlan`, `UserSubscription` |
| **Tables Written** | `UserSubscription` (create/update on checkout, reset on renewal, cancel on deletion) |
| **Uses Service Role** | Yes — all operations via `asServiceRole` |
| **Authentication Required** | No — authenticated via Stripe signature verification |
| **Authorization Rules** | Stripe signature validation using `STRIPE_WEBHOOK_SECRET` |
| **Side Effects** | (1) On `checkout.session.completed`: creates/updates `UserSubscription` with `owner_user_id`, plan details, billing period. (2) On `invoice.paid` (subscription_cycle): resets usage to 0, extends billing period. (3) On `customer.subscription.deleted`: sets status to `cancelled`, reverts to Free limits. |
| **Failure Risks** | If webhook secret is missing, returns 500. If `user_id` or `plan_id` missing in metadata, returns 400. No handling for `customer.subscription.updated` (upgrade/downgrade) events. |
| **Safe For** | Webhook only (Stripe) |

---

## 7. Integrations

### 7.1 Stripe

| Property | Value |
| :--- | :--- |
| **Purpose** | Subscription billing and checkout |
| **Current Status** | **Operational** (Test Mode / Sandbox) |
| **Products** | Starter ($4.99/mo), Growth ($9.99/mo), Professional ($19.99/mo), Unlimited ($39.99/mo) |
| **Secrets** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` — all set |
| **Security** | Webhook signature verification using `constructEventAsync` (async, SubtleCrypto). Checkout session metadata includes `base44_app_id`. |
| **Risks** | No handling for `customer.subscription.updated` events (plan upgrades/downgrades). No Stripe customer portal integration. Checkout blocked in iframe (correct). |
| **Limitations** | Test mode only. Going live requires providing real Stripe API keys in Dashboard > Integrations. |

### 7.2 SMS (Native OS)

| Property | Value |
| :--- | :--- |
| **Purpose** | Message dispatch via `sms:` URI scheme |
| **Current Status** | **Operational** |
| **Security** | None — relies on OS handling of URI scheme |
| **Risks** | No delivery confirmation. No error handling if SMS app fails to open. `markMessageSent` is called immediately after URI navigation, assuming the SMS was sent. |
| **Limitations** | Cannot send messages silently. User must confirm in their messaging app. Cannot verify actual delivery. |

### 7.3 Android SMS

| Property | Value |
| :--- | :--- |
| **Purpose** | Same `sms:` URI scheme as iOS |
| **Current Status** | **Partially Complete** |
| **Security** | None |
| **Risks** | No dedicated Android automation flow documented. The `useDueMessages` hook works on any browser, but Android lacks an equivalent to iOS Shortcuts for background polling. |
| **Limitations** | No background automation. Only works while app is open. |

### 7.4 Apple Messages / iOS Shortcuts

| Property | Value |
| :--- | :--- |
| **Purpose** | Background automation for message polling and dispatch |
| **Current Status** | **Operational** |
| **Security** | 32-char automation token (generated client-side with `Math.random()`) |
| **Risks** | Token is not cryptographically secure. No token expiry. No rate limiting on `getPendingMessages` endpoint. |
| **Limitations** | Apple does not allow silent SMS sending — Shortcut must use the Messages app with optional "Show When Run" toggle. Shortcut must be manually configured by the user. |

### 7.5 AI Message Generation

| Property | Value |
| :--- | :--- |
| **Purpose** | Generate human-sounding SMS content based on campaign parameters |
| **Current Status** | **Operational** |
| **Integration** | `base44.integrations.Core.InvokeLLM` |
| **Security** | User must be authenticated (called from CampaignDetail) |
| **Risks** | No content filtering or safety checks on generated text. No rate limiting on generation calls. Quota check before generation reads cached `subscription.messages_used_this_month` which may be stale. |
| **Limitations** | Uses default model (automatic / gpt-4o-mini). No model selection. |

### 7.6 Service Worker / PWA

| Property | Value |
| :--- | :--- |
| **Purpose** | Offline caching and PWA support |
| **Current Status** | **Needs Verification** |
| **Security** | Unknown — `public/sw.js` exists but could not be read (unsupported file type for read tool) |
| **Risks** | `public/manifest.json` returns 404. PWA installability may be broken. Cache invalidation strategy unknown. |
| **Limitations** | Cannot verify service worker behavior without reading `sw.js` content. |

### 7.7 Push Notifications

| Property | Value |
| :--- | :--- |
| **Purpose** | N/A |
| **Current Status** | **Not Implemented** |
| **Security** | N/A |
| **Risks** | N/A |
| **Limitations** | No push notification system exists in the codebase. |

---

## 8. Subscription System

### Free Plan
- **Default state** when no `UserSubscription` record exists or when `status` is not `active`.
- **Limit:** 2 messages/month (hardcoded in `getUsageStats` line 68 and `Subscription.jsx` line 12).
- **Max campaigns:** 1 (default in schema).

### Paid Plans
- Defined in `SubscriptionPlan` entity. Four tiers: Starter ($4.99), Growth ($9.99), Professional ($19.99), Unlimited ($39.99).
- Each plan has `monthly_message_limit`, `max_campaigns`, `features`, `stripe_price_id`.

### Stripe Flow
```
User clicks "Upgrade" on Subscription page
  → createCheckoutSession function
  → Stripe Checkout (subscription mode)
  → User completes payment
  → Stripe sends checkout.session.completed webhook
  → stripeWebhook function
  → Creates/updates UserSubscription with owner_user_id, plan details, billing period
  → User redirected back to /subscription?status=success
```

### Webhooks
Three event types are handled:
1. **`checkout.session.completed`** — Creates or updates `UserSubscription` with `owner_user_id`, plan info, limits, billing period, Stripe IDs.
2. **`invoice.paid`** (with `billing_reason: "subscription_cycle"`) — Resets `messages_used_this_month` to 0, extends billing period by 1 month, sets status to `active`.
3. **`customer.subscription.deleted`** — Sets status to `cancelled`, reverts `plan_name` to "Free", `monthly_limit` to 2.

**Not handled:** `customer.subscription.updated` (upgrade/downgrade mid-cycle).

### owner_user_id Mapping
- Set explicitly in `stripeWebhook` (line 41) when creating/updating `UserSubscription`.
- Read by `getUsageStats` (line 11) as the primary lookup field.
- **Bug:** `markMessageSent` (line 48) queries by `created_by_id` instead of `owner_user_id` — this is the root cause of usage counter failures.

### Usage Counting
- `getUsageStats` counts `Message` records with `status: "sent"` and `created_by_id: user.id`, filtered by `sent_at` within the billing period.
- This is the **authoritative** usage count.
- `messages_used_this_month` on `UserSubscription` is a **cached/synced** copy, updated by `getUsageStats` when it differs.

### Monthly Reset
- **Primary:** `stripeWebhook` resets on `invoice.paid` with `subscription_cycle` billing reason.
- **Fallback:** `getUsageStats` checks if `current_period_end` has passed and resets if needed (lines 36–47). This is a safety net if the webhook fails.

### Billing Logic
- Billing period is 1 month from the checkout date.
- `current_period_start` and `current_period_end` are stored as ISO strings.
- Reset extends the period by 1 month from the previous end date.

### Quota Logic
- `getUsageStats` returns `{ used, limit, remaining }`.
- `limit` comes from `UserSubscription.monthly_limit` if active, else 2.
- **Quota is NOT enforced** in `markMessageSent` — a user can send beyond their limit.
- Quota IS checked in `CampaignDetail.generateMessage` (line 92) before AI generation, but reads from cached `subscription.messages_used_this_month` which may be stale.

### Upgrade Flow
- User selects a new plan on Subscription page → `createCheckoutSession` → Stripe Checkout.
- On completion, webhook creates a new `UserSubscription` or updates the existing one.
- **No proration logic** — Stripe handles this natively, but the app does not explicitly manage mid-cycle upgrades.

### Downgrade Flow
- **Not implemented.** No UI for downgrading. The "Upgrade" button is shown for all non-current plans, but there is no "Downgrade" or "Switch plan" flow.

### Cancelled Subscription Flow
- Handled by `customer.subscription.deleted` webhook event.
- Sets `status` to `cancelled`, `plan_name` to "Free", `monthly_limit` to 2.
- User retains access until the end of the current billing period (Stripe behavior), but the app immediately applies Free limits.

### Current Risks
1. `markMessageSent` does not increment usage for webhook-created subscriptions (uses `created_by_id`).
2. `getUsageStats` self-healing can cross-link subscriptions between users.
3. No quota enforcement in `markMessageSent`.
4. No mid-cycle upgrade/downgrade handling.
5. Free plan limit (2) is hardcoded in multiple places.

---

## 9. Messaging Architecture

### Campaign Creation
- 4-step wizard: Category → Details (name, purpose, recipients) → Style (tone, length, writing style, pet name, instructions) → Schedule (frequency, time, days, approval mode).
- Campaign is created with `status: "active"` by default.
- **No automatic message generation** — the schedule is stored but no backend automation uses it.

### Message Generation
- Triggered manually by user clicking "Generate new message" in `CampaignDetail`.
- Calls `base44.integrations.Core.InvokeLLM` with a detailed prompt including campaign parameters and recent sent messages (to avoid repetition).
- Creates `Message` records with `status: "pending"` (manual mode) or `status: "approved"` (automatic mode).
- `scheduled_for` is set to the current time (not the campaign's scheduled time).

### Approval
- In manual mode, messages are created as `pending`.
- User clicks "Approve" → `Message.update(id, { status: "approved" })`.
- In automatic mode, messages are created directly as `approved`.

### Scheduling
- `Campaign` stores `schedule_type`, `schedule_time`, `schedule_days`, `schedule_dates`.
- **No backend automation** reads these fields to generate messages on schedule.
- `Message.scheduled_for` is set to `now` at generation time, not the campaign's scheduled time.
- `getPendingMessages` filters by `status: "approved"` and `scheduled_for <= now`.

### Android Sending
- Uses `sms:` URI scheme: `sms:${phone}?body=${encodedContent}`.
- Triggered by `useDueMessages.sendNow()` (auto mode) or `MessageItem.handleSend()` (manual).
- No dedicated Android automation app or background service.

### iOS Shortcut Sending
```
iOS Shortcut runs hourly (Time of Day automation)
  → GET getPendingMessages?token=<automation_token>
  → Receives { messages: [...], delivery_mode: "auto"|"manual" }
  → Repeat with each message:
    → Send Message via Messages app (recipient_phone, content)
  → POST markMessageSent { message_id, token, status: "sent" }
```

### Status Updates
- `pending` → `approved` (user approval)
- `approved` → `sent` (via `markMessageSent`)
- `pending` → `skipped` (user skip)
- `approved` → `sent` / `failed` (via `markMessageSent`)

### Mark as Sent
- `markMessageSent` updates `Message.status` and `Message.sent_at`.
- Increments `UserSubscription.messages_used_this_month` (broken — uses `created_by_id`).
- Increments `Campaign.messages_sent` (works, but counter is redundant).

### Failed Messages
- `Message.status` can be set to `failed` via `markMessageSent` with `status: "failed"`.
- **No retry logic** exists. Failed messages are not retried automatically.

### Duplicate Send Prevention
- **None.** No idempotency key. No status check before marking sent.
- If a user double-clicks "Send via SMS", `markMessageSent` is called twice, incrementing usage twice.
- If an iOS Shortcut runs twice (e.g., manual + automated), the same message could be sent and counted twice.
- `useDueMessages` uses an `autoSendTriggered` ref to prevent double-sending within a single browser session, but this does not protect against cross-session or Shortcut duplicates.

### Current Risks
1. No duplicate send prevention (idempotency).
2. No server-side scheduling engine.
3. No retry logic for failed messages.
4. No actual delivery confirmation (assumes SMS app send = success).
5. `markMessageSent` does not verify message ownership.

---

## 10. State Management

### Data Loading
- All pages use `useEffect` + `useCallback` to load data on mount.
- `Home.jsx` uses `Promise.all` for campaigns and pending messages, with usage stats fetched separately (resilient pattern).
- `CampaignDetail.jsx` and `History.jsx` use `Promise.all` for all data (less resilient — one failure breaks the page).
- `Subscription.jsx` uses `Promise.all` for plans and subscription, with usage fetched separately.

### Realtime Updates
- `base44.entities.Message.subscribe()` is used in `Home.jsx`, `CampaignDetail.jsx`, `History.jsx`, and `Subscription.jsx` to listen for message changes.
- On any message event (create/update/delete), the full data load function is re-triggered.

### Refresh Logic
- `useRefreshOnFocus` hook listens for `visibilitychange`, `focus`, and `pageshow` events.
- When the app becomes visible, it re-fetches all data.
- This handles iOS Safari and PWA Home Screen return-to-app scenarios.
- `Subscription.jsx` and `CampaignDetail.jsx` implement the same pattern inline (duplicated logic).

### Cache
- No explicit client-side caching layer.
- `@tanstack/react-query` is installed and `QueryClientProvider` is wrapped in `App.jsx`, but **no queries use `useQuery`** — all data fetching is manual `useEffect` + state.

### Service Worker
- `public/sw.js` exists but content could not be read.
- Cache strategy and invalidation behavior are unknown.

### PWA Refresh
- PWA meta tags are present in `index.html`.
- `manifest.json` returns 404 — PWA installability may be broken.
- `useRefreshOnFocus` handles PWA return-to-app via `pageshow` event.

### Local Storage / Session Storage
- No explicit usage of `localStorage` or `sessionStorage` in audited files.
- Auth token is managed by the Base44 SDK (likely stored in localStorage or cookies).

### Stale Data Risks
- `CampaignDetail.generateMessage` reads `subscription.messages_used_this_month` from a `UserSubscription.filter({})` call — this may be stale if `getUsageStats` hasn't synced recently.
- Realtime subscriptions trigger full data reloads, which could cause unnecessary network traffic.
- No debouncing on visibility/focus events — rapid tab switching triggers multiple reloads.

---

## 11. Security

### Authentication
- Handled by Base44 SDK (`AuthProvider` in `AuthContext.jsx`).
- Email/password with OTP verification.
- Google OAuth supported.
- `ProtectedRoute` gates authenticated routes.
- Auth token managed by SDK.

### Authorization
- **User role:** `role: "user"` — standard access.
- **Admin role:** `role: "admin"` — access to `/admin/*` routes.
- Admin link shown in Settings only if `user.role === "admin"`.
- **Route-level admin protection needs verification** — admin routes are under `ProtectedRoute` but there is no explicit admin role check at the route level (only in the Settings UI link).

### User Ownership
- **`created_by_id`:** Used for `Campaign`, `Message`, `ContactGroup`. Set automatically by SDK for user-scoped calls. **Unreliable for service-role-created records** (overwritten to service role ID).
- **`owner_user_id`:** Used for `UserSubscription`. Set explicitly in webhook. **The trusted field for subscription ownership.**
- **`automation_token`:** Used for Shortcut/Android auth. Stored on `User` entity.

### Admin Access Rules
- Admins can list/update/delete other users (platform default).
- Admin routes are not wrapped in a separate admin guard component.

### Token Security
- `automation_token` is a 32-character alphanumeric string.
- Generated client-side using `Math.random()` — **not cryptographically secure**.
- No token expiry.
- No rate limiting on token-authenticated endpoints.
- Token is included in URL query params for `getPendingMessages` — **visible in server logs and browser history**.

### Service Role Usage
| Function | Uses `asServiceRole` | Purpose |
| :--- | :--- | :--- |
| `createCheckoutSession` | Yes | Read SubscriptionPlan (no user scoping needed) |
| `getPendingMessages` | Yes | Read Campaigns and Messages (user-scoped via `created_by_id` filter) |
| `getUsageStats` | Yes | Read/write UserSubscription and Message |
| `markMessageSent` | Yes | Read/write Message, UserSubscription, Campaign |
| `stripeWebhook` | Yes | Read/write UserSubscription, SubscriptionPlan |

### Potential Security Concerns
1. **No ownership verification in `markMessageSent`:** Any authenticated user with a message ID can mark any message as sent. No check that `message.created_by_id === userId`.
2. **No ownership filter in frontend `UserSubscription.filter({})` calls:** `Subscription.jsx`, `CampaignDetail.jsx`, and `CreateCampaign.jsx` call `UserSubscription.filter({})` with an empty query. The SDK applies `created_by_id` scoping for user-scoped calls, but since these subscriptions were created via service role, the `created_by_id` is the service role ID — **the filter may return no results or the wrong subscription**.
3. **Token in URL:** `getPendingMessages` accepts token as a query parameter, exposing it in logs.
4. **No rate limiting:** No rate limiting on any backend function.
5. **No admin route guard:** Admin routes rely on `ProtectedRoute` (auth check) but have no explicit role check.

---

## 12. Performance

### Database Queries

| Function | Query | Risk |
| :--- | :--- | :--- |
| `getUsageStats` | `Message.filter({ created_by_id, status: "sent" })` — returns ALL sent messages, then filters in JavaScript by date | **High risk at scale.** Loads entire sent message history into memory. |
| `getPendingMessages` | `Campaign.filter({ created_by_id })` then `Message.filter({ campaign_id: { $in: campaignIds }, status: "approved" })` | Medium risk — `$in` with many campaign IDs. |
| `markMessageSent` | `UserSubscription.filter({ created_by_id })` | Low risk (should return 1 record), but **returns 0 for webhook-created subs**. |
| `History.jsx` | `Message.list("-created_date", 100)` | No pagination beyond 100 items. |
| `Home.jsx` | `Campaign.list("-created_date", 50)` + `Message.filter({ status: "pending" }, "-created_date", 5)` | Low risk for small datasets. |

### Missing Indexes
- No explicit indexes are declared in entity schemas.
- Critical missing indexes: `Message(created_by_id, status, sent_at)`, `Campaign(created_by_id, status)`, `UserSubscription(owner_user_id)`.

### Scaling Projections

| Scale | Risk Level | Bottlenecks |
| :--- | :--- | :--- |
| **1,000 users** | Low | All queries should perform adequately. `getUsageStats` loads all sent messages per user — manageable if each user has <1,000 sent messages. |
| **10,000 users** | Medium | `getUsageStats` becomes expensive for power users with thousands of sent messages. No pagination on History (100 item cap). Realtime subscriptions trigger full reloads. |
| **100,000 users** | High | `getUsageStats` will timeout for users with >10,000 sent messages. `getPendingMessages` `$in` query with many campaigns. No pagination anywhere. Database scan queries without indexes. |
| **1,000,000 messages** | Critical | `getUsageStats` loads all sent messages into memory — will crash. History page shows only the latest 100. No archiving strategy. Realtime subscriptions cause cascading reloads. |

### Recommendations
- Replace `getUsageStats` in-memory filtering with a database aggregation or count query with date range filters.
- Add pagination to History and Home.
- Add database indexes on `Message(created_by_id, status, sent_at)`.
- Replace realtime subscription full-reload with incremental state updates.

---

## 13. Technical Debt

### Duplicate Logic
1. **Visibility/focus refresh:** `useRefreshOnFocus` hook exists, but `Subscription.jsx` and `CampaignDetail.jsx` implement the same logic inline instead of using the hook.
2. **Usage counter:** `UserSubscription.messages_used_this_month` (cached) duplicates the count derivable from `Message` records. Both `markMessageSent` (increment) and `getUsageStats` (recompute) write to this field, potentially conflicting.
3. **Campaign counter:** `Campaign.messages_sent` duplicates the count of `Message` records with `status: "sent"` for that campaign.

### Dead Code / Unused Fields
1. `ContactGroup` entity — entirely unused. No UI creates or reads ContactGroups.
2. `Campaign.contact_group` field — declared but never populated.
3. `Message.edited_content` field — declared but never read or written.
4. `Campaign.schedule_dates` — declared but no UI populates it.
5. `Campaign.next_scheduled` — declared but never updated by any code.
6. `@tanstack/react-query` — installed and provider wrapped, but no `useQuery` calls exist.

### Inconsistent Naming
1. `created_by_id` vs `owner_user_id` — two different ownership fields for the same concept.
2. `stripe_customer_id` vs `stripe_subscription_id` — both on `UserSubscription`, correctly named but both used as lookup keys in different webhook handlers.

### Deprecated Fields
1. `Campaign.messages_sent` — should be derived, not stored.
2. `UserSubscription.messages_used_this_month` — should be derived by `getUsageStats`, not stored and incremented.

### Refactoring Opportunities
1. Unify visibility/focus refresh logic to use `useRefreshOnFocus` everywhere.
2. Remove `ContactGroup` entity or build UI for it.
3. Remove `edited_content`, `next_scheduled`, `schedule_dates` if unused.
4. Consolidate ownership fields — use `owner_user_id` consistently for service-role-created records.
5. Adopt `@tanstack/react-query` for data fetching, caching, and invalidation.

---

## 14. Project Structure

### Folder Structure
```
/
├── index.html                    # PWA meta tags, entry point
├── public/
│   ├── sw.js                     # Service worker (content not verified)
│   └── manifest.json             # PWA manifest (returns 404)
├── src/
│   ├── main.jsx                  # React entry point
│   ├── App.jsx                   # Router, providers, auth gating
│   ├── index.css                 # Design tokens, Tailwind config
│   ├── api/
│   │   └── base44Client.js       # Pre-initialized Base44 SDK
│   ├── lib/
│   │   ├── AuthContext.jsx       # Auth provider and context
│   │   ├── app-params.js         # App parameters
│   │   ├── query-client.js       # React Query client
│   │   ├── PageNotFound.jsx      # 404 page
│   │   └── utils.js              # Utility functions (cn, etc.)
│   ├── hooks/
│   │   ├── useDueMessages.jsx    # Due message polling and sending
│   │   ├── useRefreshOnFocus.jsx # Visibility/focus refresh
│   │   └── use-mobile.jsx        # Mobile detection
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx     # Main app shell
│   │   │   ├── MobileNav.jsx     # Bottom navigation
│   │   │   └── PageHeader.jsx    # Sticky header with back button
│   │   ├── dashboard/
│   │   │   ├── StatsCard.jsx     # Dashboard stat card
│   │   │   └── CampaignCard.jsx  # Campaign list item
│   │   ├── ui/                   # shadcn/ui components (40+ files)
│   │   ├── AuthLayout.jsx        # Auth page wrapper
│   │   ├── BoriSendLogo.jsx      # Logo component
│   │   ├── GoogleIcon.jsx        # Google OAuth icon
│   │   ├── ProtectedRoute.jsx    # Route guard
│   │   ├── ScrollToTop.jsx       # Scroll restoration
│   │   ├── ShortcutStoryboard.jsx # Visual shortcut guide
│   │   └── UserNotRegisteredError.jsx
│   ├── pages/
│   │   ├── Home.jsx              # Dashboard
│   │   ├── Campaigns.jsx         # Campaign list
│   │   ├── CreateCampaign.jsx    # Campaign wizard
│   │   ├── CampaignDetail.jsx    # Campaign management
│   │   ├── History.jsx           # Message history
│   │   ├── MessageDetail.jsx     # Single message view
│   │   ├── Settings.jsx          # User settings
│   │   ├── Subscription.jsx      # Subscription management
│   │   ├── ShortcutsSetup.jsx    # iOS Shortcut setup
│   │   ├── Login.jsx             # Login page
│   │   ├── Register.jsx          # Registration page
│   │   ├── ForgotPassword.jsx    # Password reset request
│   │   ├── ResetPassword.jsx     # Password reset
│   │   └── admin/
│   │       ├── AdminDashboard.jsx
│   │       ├── ManageUsers.jsx
│   │       ├── ManagePlans.jsx
│   │       ├── ManageAnnouncements.jsx
│   │       └── AdminSettings.jsx
│   └── utils/
│       └── index.ts              # Shared utilities
├── base44/
│   ├── entities/
│   │   ├── User.jsonc
│   │   ├── UserSubscription.jsonc
│   │   ├── SubscriptionPlan.jsonc
│   │   ├── Campaign.jsonc
│   │   ├── Message.jsonc
│   │   ├── ContactGroup.jsonc
│   │   ├── AppSettings.jsonc
│   │   └── Announcement.jsonc
│   └── functions/
│       ├── createCheckoutSession/entry.ts
│       ├── getPendingMessages/entry.ts
│       ├── getUsageStats/entry.ts
│       ├── markMessageSent/entry.ts
│       └── stripeWebhook/entry.ts
├── package.json
├── tailwind.config.js
├── vite.config.js
├── eslint.config.js
├── postcss.config.js
├── jsconfig.json
├── components.json
├── CLAUDE.md
├── AGENTS.md
├── README.md
└── .gitignore
```

### Repeated or Duplicate Components
- Visibility/focus refresh logic is duplicated in `useRefreshOnFocus.jsx`, `Subscription.jsx`, and `CampaignDetail.jsx`.
- Status badge styling is defined inline in `CampaignDetail.jsx` and `History.jsx` (separate `statusStyles`/`statusConfig` objects).

---

## 15. Known Bugs

### Confirmed Bugs

| # | Bug | Root Cause | Severity | Recommended Fix Priority |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Usage counter not incremented on send** | `markMessageSent` line 48 queries `UserSubscription.filter({ created_by_id: userId })` — webhook-created subscriptions have `created_by_id` = service role ID, not user ID. Should use `owner_user_id`. | **Critical** | **P0 — Fix immediately** |
| 2 | **No duplicate send prevention** | `markMessageSent` has no idempotency check. No status verification before updating. Double-clicking "Send" or running Shortcut twice increments usage twice. | **Critical** | **P0 — Fix immediately** |
| 3 | **No ownership check in `markMessageSent`** | Function does not verify `message.created_by_id === userId`. Any user with a message ID can mark any message as sent. | **High** | **P1** |
| 4 | **`getUsageStats` self-healing cross-links subscriptions** | Lines 15–21: if no subscription found by `owner_user_id` or `created_by_id`, it links *any* active subscription to the current user. In multi-user environments, this could assign another user's subscription. | **High** | **P1** |
| 5 | **`manifest.json` returns 404** | File referenced in `index.html` but not found at `public/manifest.json`. PWA installability may be broken. | **Medium** | **P2** |
| 6 | **No quota enforcement in `markMessageSent`** | Function does not check if user has remaining quota before accepting "sent" status. | **High** | **P1** |

### Suspected Bugs

| # | Bug | Root Cause | Severity | Recommended Fix Priority |
| :--- | :--- | :--- | :--- | :--- |
| 7 | **Frontend `UserSubscription.filter({})` returns wrong/empty results** | `Subscription.jsx`, `CampaignDetail.jsx`, `CreateCampaign.jsx` query with empty filter. SDK applies `created_by_id` scoping, but webhook-created records have service role `created_by_id`. May return no results. | **High** | **P1** |
| 8 | **No admin route guard** | Admin routes are under `ProtectedRoute` (auth check only). No explicit `role === "admin"` check at route level. Any authenticated user can navigate to `/admin`. | **High** | **P1** |
| 9 | **Stale quota check in `CampaignDetail.generateMessage`** | Reads `subscription.messages_used_this_month` from direct entity query instead of `getUsageStats`. May allow generation beyond quota. | **Medium** | **P2** |
| 10 | **`Campaign.messages_sent` drift** | Incremented by `markMessageSent` but never reconciled with actual `Message` count. Will drift over time. | **Low** | **P3** |

---

## 16. Production Readiness Assessment

| Dimension | Score (1-10) | Justification |
| :--- | :--- | :--- |
| **Code Quality** | 6 | Clean, readable React code. Good componentization. But backend functions have ownership bugs and non-atomic writes. |
| **Maintainability** | 6 | Clear file structure. Some duplicated logic (refresh hooks). Unused entities and fields add confusion. |
| **Scalability** | 3 | No pagination. `getUsageStats` loads all messages into memory. No indexes. Will fail at 100K+ messages. |
| **Security** | 4 | Auth is solid (SDK-managed). But no ownership verification in `markMessageSent`, no admin route guard, token in URL, no rate limiting. |
| **Reliability** | 4 | Non-atomic writes. No retry logic. No duplicate prevention. Webhook dependency for billing with fragile fallback. |
| **Deployment Readiness** | 5 | App deploys and runs. PWA manifest is broken. Core flows work for single user. Not ready for production traffic. |

### Overall Readiness Score: **4.5 / 10**

The app is a functional prototype with critical bugs in the billing/usage path. It is not ready for production without addressing the P0 and P1 issues.

---

## 17. Recommendations

### Critical (Fix Immediately)

1. **Fix `markMessageSent` ownership query:** Change `UserSubscription.filter({ created_by_id: userId })` to `UserSubscription.filter({ owner_user_id: userId })` on line 48.
2. **Add idempotency to `markMessageSent`:** Check `message.status` before updating. If already `sent`, return success without incrementing counters. Consider adding an idempotency key field.
3. **Add ownership verification in `markMessageSent`:** Verify `message.created_by_id === userId` before processing.

### High Priority

4. **Remove `getUsageStats` self-healing fallback:** The logic that links any active subscription to the current user is dangerous. Instead, return "free" status if no subscription is found by `owner_user_id`.
5. **Fix frontend `UserSubscription.filter({})` calls:** All frontend pages should use `getUsageStats` for usage data, not direct `UserSubscription` queries with empty filters.
6. **Add admin route guard:** Create an `AdminRoute` component that checks `user.role === "admin"` and redirects non-admins.
7. **Add quota enforcement in `markMessageSent`:** Check remaining quota before accepting "sent" status. Reject if quota exceeded.
8. **Make `markMessageSent` writes atomic:** Use a single update operation or implement a transaction-like pattern to prevent partial state.

### Medium Priority

9. **Fix `manifest.json` 404:** Create or fix the PWA manifest file.
10. **Replace `getUsageStats` in-memory filtering:** Use a database count query with date range filters instead of loading all sent messages.
11. **Add pagination to History:** Implement cursor-based or offset-based pagination.
12. **Unify refresh logic:** Use `useRefreshOnFocus` in all pages instead of inline duplication.
13. **Handle `customer.subscription.updated` webhook:** Support mid-cycle plan changes.
14. **Add database indexes:** `Message(created_by_id, status, sent_at)`, `Campaign(created_by_id, status)`, `UserSubscription(owner_user_id)`.

### Low Priority

15. **Remove `Campaign.messages_sent`:** Derive from `Message` count instead.
16. **Remove unused `ContactGroup` entity** or build UI for it.
17. **Remove unused fields:** `Message.edited_content`, `Campaign.next_scheduled`, `Campaign.schedule_dates`.
18. **Adopt `@tanstack/react-query`:** Replace manual `useEffect` data fetching for better caching and invalidation.
19. **Move automation token to POST body:** Avoid exposing token in URL query params.
20. **Add rate limiting:** On all backend functions, especially token-authenticated ones.

### Nice to Have

21. **Server-side scheduling engine:** Create a scheduled automation that generates messages based on campaign schedules.
22. **Retry logic for failed messages:** Automatically retry failed sends with exponential backoff.
23. **Stripe Customer Portal:** Let users manage their own subscriptions.
24. **Push notifications:** Notify users of pending approvals or failed sends.
25. **Analytics dashboard:** Charts for message trends, campaign performance over time.

### What Should Not Be Changed
- The overall mobile-first UI/UX design.
- The Base44 SDK and entity model approach.
- The Stripe checkout flow (it works correctly).
- The iOS Shortcut integration concept.
- The `owner_user_id` field introduction (it is the correct solution).

### What Should Be Refactored Carefully
- `markMessageSent` — critical function called by multiple clients (frontend, Shortcut, Android). Changes must be backwards-compatible.
- `getUsageStats` — the self-healing fallback should be removed, but the usage reset logic should be preserved.
- `stripeWebhook` — event handling should be extended, not rewritten.

### What Should Be Removed or Deprecated
- `ContactGroup` entity (if no UI is planned).
- `Campaign.messages_sent` field.
- `Message.edited_content` field.
- `Campaign.next_scheduled` field (if no scheduling engine is planned).
- `Campaign.schedule_dates` field (if no UI is planned).
- Inline visibility/focus refresh logic in `Subscription.jsx` and `CampaignDetail.jsx`.

---

## 18. Missing Information

The following could not be determined from the current project files and would need to be confirmed before creating the production architecture:

1. **Service Worker behavior:** `public/sw.js` exists but its content could not be read. Cache strategy, offline behavior, and background sync capabilities are unknown.
2. **PWA manifest content:** `public/manifest.json` returns 404. The intended PWA configuration (icons, start_url, display mode) is unknown.
3. **Admin page implementations:** `AdminDashboard.jsx`, `ManageUsers.jsx`, `ManagePlans.jsx`, `ManageAnnouncements.jsx`, `AdminSettings.jsx` were not fully audited. Their exact data reads/writes and access control patterns need verification.
4. **Campaigns.jsx:** The campaign list page was not fully audited. Its data fetching and filtering patterns are unknown.
5. **MessageDetail.jsx:** The message detail page was not fully audited.
6. **Announcement display:** `Announcement` entity exists with admin management, but no user-facing UI was found that displays active announcements. It is unclear where users see announcements.
7. **Scheduled automation:** No scheduled automation (cron job) was found in the codebase or in the automations list. It is unclear whether message generation on schedule is intended to be implemented or if the current manual-only approach is by design.
8. **Rate limiting:** No rate limiting configuration was found. It is unclear whether the Base44 platform applies automatic rate limits.
9. **Database indexes:** No explicit indexes are declared in entity schemas. It is unknown whether the Base44 platform automatically creates indexes on queried fields.
10. **Android automation:** No dedicated Android automation flow exists. It is unclear whether an Android equivalent to iOS Shortcuts is planned.

### Assumptions to Confirm
- The app is intended to be a public app (no login required for basic access), based on the Stripe integration context stating "Public App - No Login Required." However, `ProtectedRoute` gates all main routes, requiring authentication. This contradiction needs clarification.
- The `useDueMessages` 60-second polling interval is the intended scheduling mechanism, not a placeholder for a future backend scheduler.
- The `sms:` URI scheme is the intended message delivery mechanism, not a placeholder for a future SMS gateway integration.

---

## Appendix A — Entity Relationship Diagrams

```
┌─────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│    User     │         │  UserSubscription    │         │ SubscriptionPlan │
├─────────────┤         ├──────────────────────┤         ├──────────────────┤
│ id (PK)     │◄────────│ owner_user_id (FK)   │────────►│ id (PK)          │
│ full_name   │         │ plan_id (FK)         │         │ name             │
│ email       │         │ plan_name (cached)   │         │ price            │
│ role        │         │ status               │         │ monthly_msg_limit│
│ delivery_mode│        │ monthly_limit (cached)│        │ stripe_price_id  │
│ automation_ │         │ messages_used_this_m │         └──────────────────┘
│   token     │         │ current_period_start │
│ default_*   │         │ current_period_end   │
│ signature   │         │ stripe_customer_id   │
│ timezone    │         │ stripe_subscription_ │
└─────────────┘         │   id                 │
                        └──────────────────────┘
        │
        │ created_by_id
        ▼
┌─────────────┐         ┌──────────────────────┐
│  Campaign   │         │      Message         │
├─────────────┤         ├──────────────────────┤
│ id (PK)     │◄────────│ campaign_id (FK)     │
│ name        │         │ content              │
│ category    │         │ recipient_name       │
│ tone        │         │ recipient_phone      │
│ recipients[]│         │ status               │
│ schedule_*  │         │ scheduled_for        │
│ approval_mode│        │ sent_at              │
│ status      │         │ edited_content (unused)│
│ messages_sent│        │ created_by_id (FK)   │──► User
│ contact_group│        └──────────────────────┘
│   (unused)  │
└─────────────┘
        │
        │ contact_group (unused)
        ▼
┌─────────────┐         ┌──────────────────────┐         ┌──────────────────┐
│ ContactGroup│         │    AppSettings       │         │  Announcement    │
├─────────────┤         ├──────────────────────┤         ├──────────────────┤
│ id (PK)     │         │ id (PK)              │         │ id (PK)          │
│ name        │         │ setting_key          │         │ title            │
│ contacts[]  │         │ setting_value        │         │ body             │
│ created_by_id│        │ description          │         │ type             │
└─────────────┘         └──────────────────────┘         │ is_active        │
   (UNUSED)                                                │ expires_at       │
                                                          └──────────────────┘
```

---

## Appendix B — Message Lifecycle Diagram

```
                    ┌──────────────────┐
                    │  User clicks     │
                    │  "Generate new   │
                    │  message"        │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Quota check     │
                    │  (subscription   │
                    │  .messages_used  │
                    │  _this_month)    │
                    └────────┬─────────┘
                             │
                      Used < Limit?
                       /         \
                     Yes          No
                      │            │
                      ▼            ▼
            ┌──────────────┐  ┌──────────────┐
            │ InvokeLLM    │  │ Toast:       │
            │ (AI generate)│  │ "Limit       │
            └──────┬───────┘  │  reached"    │
                   │          └──────────────┘
                   ▼
            ┌──────────────────┐
            │ Create Message   │
            │ status: pending  │──── (manual mode)
            │   or approved    │──── (auto mode)
            └────────┬─────────┘
                     │
              ┌──────┴──────┐
              │             │
         Manual mode    Auto mode
              │             │
              ▼             │
      ┌──────────────┐     │
      │ User clicks  │     │
      │ "Approve"    │     │
      └──────┬───────┘     │
             │             │
             ▼             ▼
      ┌──────────────────────────┐
      │  status: "approved"      │
      │  scheduled_for: now      │
      └────────────┬─────────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
   Manual send          Auto/Shortcut
        │                     │
        ▼                     ▼
  ┌───────────┐     ┌─────────────────────┐
  │ User      │     │ useDueMessages      │
  │ clicks    │     │ polls every 60s     │
  │ "Send via │     │ OR iOS Shortcut     │
  │  SMS"     │     │ polls hourly        │
  └─────┬─────┘     └──────────┬──────────┘
        │                      │
        └──────────┬───────────┘
                   │
                   ▼
          ┌────────────────┐
          │ Open sms: URI  │
          │ (OS messaging  │
          │  app)          │
          └───────┬────────┘
                  │
                  ▼
          ┌────────────────┐
          │ markMessageSent│
          │ status: "sent" │
          │ sent_at: now   │
          │                │
          │ BUG: uses      │
          │ created_by_id  │
          │ for sub lookup │
          │ → counter NOT  │
          │   incremented  │
          └───────┬────────┘
                  │
                  ▼
          ┌────────────────┐
          │ Message: sent  │
          │ (no retry on   │
          │  failure)      │
          └────────────────┘
```

---

## Appendix C — Subscription Lifecycle Diagram

```
┌────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ User views     │────►│ User clicks      │────►│ createCheckout  │
│ Subscription   │     │ "Upgrade"        │     │ Session         │
│ page           │     │                  │     │ (backend)       │
└────────────────┘     └──────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Stripe Checkout │
                                               │ (subscription   │
                                               │  mode)          │
                                               └────────┬────────┘
                                                         │
                                                  User pays
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │ Stripe sends    │
                                               │ checkout.session│
                                               │ .completed      │
                                               │ webhook         │
                                               └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     stripeWebhook function                       │
│                                                                 │
│  1. Verify Stripe signature                                     │
│  2. Extract userId from metadata.user_id or client_reference_id │
│  3. Extract planId from metadata.plan_id                        │
│  4. Fetch SubscriptionPlan by planId                            │
│  5. Check if UserSubscription exists by owner_user_id           │
│     ├── EXISTS → Update with new plan, limits, period           │
│     └── NOT FOUND → Create new UserSubscription                 │
│         with owner_user_id, plan details, billing period,       │
│         stripe_customer_id, stripe_subscription_id              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ UserSubscription │
                    │ status: active   │
                    │ owner_user_id ✓  │
                    │ monthly_limit ✓  │
                    │ period_start ✓   │
                    │ period_end ✓     │
                    └──────────────────┘
                             │
                     ┌───────┴────────┐
                     │                │
                Monthly renewal   Cancellation
                     │                │
                     ▼                ▼
          ┌──────────────────┐  ┌──────────────────┐
          │ invoice.paid     │  │ customer.sub     │
          │ (subscription_   │  │ .deleted webhook │
          │  cycle)          │  └────────┬─────────┘
          └────────┬─────────┘           │
                   │                     ▼
                   ▼             ┌──────────────────┐
          ┌──────────────────┐  │ UserSubscription │
          │ Reset:           │  │ status: cancelled│
          │ messages_used: 0 │  │ plan_name: Free  │
          │ period + 1 month │  │ monthly_limit: 2 │
          │ status: active   │  └──────────────────┘
          └──────────────────┘
                   │
                   │  FALLBACK (if webhook missed):
                   │
                   ▼
          ┌──────────────────┐
          │ getUsageStats    │
          │ checks if        │
          │ period_end < now │
          │ → resets usage   │
          │ → extends period │
          │ (does NOT touch  │
          │  plan_name or    │
          │  status)         │
          └──────────────────┘
```

---

## Appendix D — iOS Shortcut Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    USER'S iPHONE                        │
│                                                         │
│  ┌─────────────────┐    ┌─────────────────────────┐    │
│  │ Shortcuts App   │    │ Automation: Every hour  │    │
│  │ (user-created   │◄───┤ (Time of Day trigger)   │    │
│  │  shortcut)      │    └───────────┬─────────────┘    │
│  └────────┬────────┘                │                  │
│           │                         │                  │
└───────────┼─────────────────────────┼──────────────────┘
            │                         │
            ▼                         │
┌───────────────────────┐             │
│ Step 1: GET Contents  │             │
│ of URL                │             │
│                       │             │
│ URL: /functions/      │             │
│ getPendingMessages    │             │
│ ?token=<automation_   │             │
│  token>               │             │
│ Method: GET           │             │
└───────────┬───────────┘             │
            │                         │
            ▼                         │
┌───────────────────────────────────────────────────────┐
│                  BORISEND BACKEND                     │
│                                                       │
│  getPendingMessages function:                         │
│  1. Extract token from query param                    │
│  2. Look up User by automation_token                  │
│  3. Fetch User's Campaigns by created_by_id           │
│  4. Fetch Messages: campaign_id $in [ids],            │
│     status: "approved", scheduled_for <= now          │
│  5. Return { messages: [...], delivery_mode }         │
└───────────────────────┬───────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────┐
│                  USER'S iPHONE                        │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Step 2: Repeat with Each (messages array)       │  │
│  │                                                  │  │
│  │  For each message:                               │  │
│  │  ┌──────────────────────────────────────────┐   │  │
│  │  │ Step 3: Send Message                      │   │  │
│  │  │  Phone: message.recipient_phone           │   │  │
│  │  │  Message: message.content                 │   │  │
│  │  │  Show When Run: ON (manual) / OFF (auto)  │   │  │
│  │  └──────────────────────────────────────────┘   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Step 4: POST to markMessageSent                 │  │
│  │  URL: /functions/markMessageSent                │  │
│  │  Body: {                                         │  │
│  │    message_id: <id>,                             │  │
│  │    token: <automation_token>,                    │  │
│  │    status: "sent"                                │  │
│  │  }                                               │  │
│  └──────────────────────┬──────────────────────────┘  │
└─────────────────────────┼─────────────────────────────┘
                          │
                          ▼
┌───────────────────────────────────────────────────────┐
│                  BORISEND BACKEND                     │
│                                                       │
│  markMessageSent function:                            │
│  1. Extract message_id, token, status from body       │
│  2. Look up User by automation_token                  │
│  3. Fetch Message by message_id                       │
│  4. Update Message: status=sent, sent_at=now          │
│  5. Increment UserSubscription.messages_used          │
│     ⚠️ BUG: queries by created_by_id, not              │
│        owner_user_id → counter NOT incremented        │
│  6. Increment Campaign.messages_sent                  │
│  ⚠️ NO idempotency check                               │
│  ⚠️ NO ownership verification                          │
└───────────────────────────────────────────────────────┘
```

---

## Appendix E — Dashboard Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Home.jsx (Dashboard)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  useEffect → load()                                     │    │
│  │                                                         │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ Promise.all([                                     │   │    │
│  │  │   auth.me(),                    ──► User          │   │    │
│  │  │   Campaign.list(-created_date, 50), ──► Campaign  │   │    │
│  │  │   Message.filter({status:"pending"}, -created, 5) │   │    │
│  │  │                              ──► Message          │   │    │
│  │  │ ])                                                │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  │                          │                              │    │
│  │  ┌───────────────────────▼──────────────────────────┐   │    │
│  │  │ try {                                             │   │    │
│  │  │   functions.invoke("getUsageStats", {})           │   │    │
│  │  │   ──► { used, limit, remaining, planName,         │   │    │
│  │  │         status, periodStart, periodEnd }          │   │    │
│  │  │ } catch { /* silent fail, defaults to Free */ }   │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  useDueMessages hook                                   │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ checkDue() → functions.invoke("getPendingMessages")│   │    │
│  │  │   ──► { messages: [...], delivery_mode }          │   │    │
│  │  │                                                   │   │    │
│  │  │ Polls every 60 seconds (setInterval)              │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Realtime subscription                                 │    │
│  │  Message.subscribe(() => load())                       │    │
│  │  → Any message create/update/delete triggers full     │    │
│  │    reload of all dashboard data                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  useRefreshOnFocus hook                                │    │
│  │  Listens: visibilitychange, focus, pageshow            │    │
│  │  → Triggers load() when app becomes visible            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌───────────────────┬───────────────────┬─────────────────┐   │
│  │   Stats Grid      │  Due Now          │  Awaiting       │   │
│  │                   │  (from hook)      │  Approval       │   │
│  │  Active campaigns │                   │  (from pending  │   │
│  │  Sent this month  │  Auto-send (if    │   messages)     │   │
│  │  Pending approval │  delivery_mode    │                 │   │
│  │  Remaining        │  = "auto")        │  Links to       │   │
│  │                   │                   │  /messages/:id  │   │
│  └───────────────────┴───────────────────┴─────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Campaign List (up to 5)                              │    │
│  │  Each item links to /campaigns/:id                    │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

Data Sources:
  User ───────────► auth.me() (SDK)
  Campaign ───────► entities.Campaign.list() (SDK, user-scoped)
  Message ────────► entities.Message.filter() (SDK, user-scoped)
  UserSubscription ► functions.invoke("getUsageStats") (backend, asServiceRole)
  Due Messages ────► functions.invoke("getPendingMessages") (backend, asServiceRole)

Refresh Triggers:
  1. Page mount (useEffect)
  2. Realtime Message subscription (any message event)
  3. Visibility/focus change (useRefreshOnFocus)
  4. 60-second interval (useDueMessages polling)
```

---

*End of Report*

**Document Version:** 1.0
**Revision Date:** 2026-07-01
**Prepared By:** Base44 AI Development Agent
**Classification:** Internal — Architecture Baseline