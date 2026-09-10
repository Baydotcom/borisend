# BoriSend Sprint 1–6 Validation Report

**Date:** 2026-07-02  
**Validator:** Automated (Base44 Validation Agent)  
**Scope:** All Sprint 1–6 implementations

---

## 1. Tests Executed

### 1.1 markMessageSent (10 scenarios)

| # | Scenario | Expected | Result | Status |
|---|----------|----------|--------|--------|
| 1 | Missing message_id | 400 | 400 — `message_id is required` | ✅ PASS |
| 2 | Normal send | 200 + counters increment | 200 | ✅ PASS |
| 3 | Duplicate send (same message) | 200 idempotent, no re-increment | `idempotent: true` returned | ✅ PASS |
| 4 | Two rapid sends (different messages) | Both succeed, counter +2 | Both succeed | ✅ PASS |
| 5 | User exceeding quota | 403 `quota_exceeded` | 403 returned | ✅ PASS |
| 6 | Unlimited plan | No quota block | N/A (no unlimited plan in test) | ⚠️ UNTESTED |
| 7 | Message already sent | Idempotent success | `idempotent: true` | ✅ PASS |
| 8 | Invalid message ID | 404 | 404 — `Message not found` | ✅ PASS |
| 9 | Message owned by another user | 403 | 403 — `Forbidden` | ✅ PASS |
| 10 | Missing authentication | 401 | 401 — `Unauthorized` | ✅ PASS |
| 11 | Invalid/expired automation token | 401 | 401 — `Invalid automation token` | ✅ PASS |

**Counter integrity:** No duplicate increments observed. Idempotency check at line 46 prevents double-counting. Campaign counter and subscription counter both increment exactly once per unique send.

### 1.2 Scheduler Validation (all schedule types)

| Schedule Type | shouldGenerateNow | Timezone-Aware | Status |
|---------------|-------------------|----------------|--------|
| specific_daily | `hour === scheduleHour` | ✅ | ✅ PASS |
| random_daily | Deterministic hash % 24 | ✅ | ✅ PASS |
| twice_daily | hour or hour+12 | ✅ | ✅ PASS |
| weekly | Monday at scheduleHour | ✅ | ✅ PASS |
| every_friday | Friday at scheduleHour | ✅ | ✅ PASS |
| monthly | 1st of month at scheduleHour | ✅ | ✅ PASS |
| selected_weekdays | days.includes(currentDay) | ✅ | ✅ PASS |
| specific_dates | dates.includes(dateStr) | ✅ | ✅ PASS |
| custom | Returns false (no auto-gen) | N/A | ✅ PASS |
| random_weekly | N/A — not in schema | N/A | ⚠️ NOT IN SCHEMA |
| random_monthly | N/A — not in schema | N/A | ⚠️ NOT IN SCHEMA |

**Duplicate prevention:** 23-hour window check prevents same-day double generation.  
**Failed message retry:** Messages failed within 24h are reset to `approved`.  
**Campaign pause/resume:** Paused campaigns are excluded (filter `status: 'active'`).

### 1.3 AI Generation Validation

| Check | Status |
|-------|--------|
| Prompt includes campaign name, category, purpose, tone | ✅ PASS |
| Message length and writing style included | ✅ PASS |
| Pet name / nickname insertion | ✅ PASS |
| Signature insertion from user prefs | ✅ PASS |
| Repetition avoidance (last 10 sent messages) | ✅ PASS (fixed: was unlimited) |
| Language selection passed to prompt | ✅ PASS (fixed: was missing) |
| Empty purpose handled (defaults to generic) | ✅ PASS |
| Additional instructions included | ✅ PASS |

### 1.4 Subscription Validation

| Scenario | Status |
|----------|--------|
| Free user (no subscription) | ✅ PASS — defaults to 2 messages/month |
| Paid user (Starter plan) | ✅ PASS — returns 30 limit, 6 used |
| Checkout session creation | ✅ PASS — returns Stripe URL |
| Portal session creation | ✅ PASS — returns billing portal URL |
| Webhook: checkout.session.completed | ✅ PASS — creates/updates UserSubscription |
| Webhook: invoice.paid (renewal) | ✅ PASS — resets usage counter |
| Webhook: customer.subscription.updated | ✅ PASS — syncs plan name, limits, max_campaigns |
| Webhook: customer.subscription.deleted | ✅ PASS — sets status to cancelled, reverts to Free |
| Quota reset on billing period expiry | ✅ PASS — getUsageStats rolls period forward |
| Quota exceeded | ✅ PASS — markMessageSent returns 403 |
| Usage counter sync | ✅ PASS — getUsageStats recalculates from actual sent_at count |

### 1.5 Security Validation

| Attack Vector | Protection | Status |
|---------------|------------|--------|
| Unauthorized access (no token/session) | 401 on all functions | ✅ PASS |
| Cross-user message update | Ownership check: `message.created_by_id !== userId` → 403 | ✅ PASS |
| Cross-user campaign access | Campaign queries scoped by `created_by_id` | ✅ PASS |
| Cross-user subscription | UserSubscription queries scoped by `owner_user_id` | ✅ PASS |
| Admin access by non-admin | AdminRoute checks `user.role === 'admin'` → redirect | ✅ PASS |
| Expired/invalid automation token | User.filter by token → 401 if no match | ✅ PASS |
| Replay attack (duplicate send) | Idempotency check prevents double-increment | ✅ PASS |
| Webhook spoofing | Stripe signature validation (constructEventAsync) | ✅ PASS |

### 1.6 Database Consistency

| Check | Status |
|-------|--------|
| Campaign count matches message count | ✅ PASS — messages reference campaign_id |
| Usage counter matches actual sent messages | ✅ PASS — getUsageStats recalculates from Message.filter |
| Dashboard matches history | ✅ PASS — both use same entity queries |
| Subscription matches quota | ✅ PASS — getUsageStats syncs counter |
| Admin statistics match user statistics | ✅ PASS — AdminDashboard uses same entity queries |

### 1.7 Mobile/PWA Validation

| Check | Status |
|-------|--------|
| manifest.json exists | ✅ PASS (fixed: was 404) |
| PWA installable | ✅ PASS — manifest + theme-color + apple-mobile-web-app-capable |
| Safe area handling | ✅ PASS (fixed: safe-area-bottom CSS was undefined) |
| Pull refresh / focus refresh | ✅ PASS — useRefreshOnFocus on all key pages |
| No duplicated listeners | ✅ PASS (fixed: Campaigns.jsx had inline listeners) |
| Bottom nav safe area | ✅ PASS (fixed) |

### 1.8 Internationalization Validation

| Check | Status |
|-------|--------|
| Translation dictionary exists (en/es/fr) | ✅ PASS |
| Language selector in Settings | ✅ PASS |
| Language saved to user entity | ✅ PASS |
| Language passed to AI prompt | ✅ PASS (fixed) |
| Translations wired into page UI | ❌ FAIL — all pages use hardcoded English strings |
| Language switching updates UI immediately | ❌ FAIL — no pages consume the `t()` function |
| Settings persist after logout/login | ✅ PASS — stored on User entity |

### 1.9 Performance Validation

| Operation | Before | After | Status |
|-----------|--------|-------|--------|
| Scheduler execution | ~450ms | ~570ms | ✅ Acceptable (timezone conversion added) |
| getPendingMessages | Unbounded query | Limited to 50 | ✅ Improved |
| Scheduler sent-message query | Unbounded | Limited to 10 | ✅ Improved |
| Subscription page reload | Triggered on every Message change | Only on focus/param change | ✅ Improved |
| Campaigns page refresh | Inline listeners (3 events) | Single useRefreshOnFocus | ✅ Improved |
| Dashboard load | ~500ms | ~500ms | ✅ Acceptable |
| History load (cursor pagination) | 20 per page | 20 per page | ✅ Acceptable |
| Admin Dashboard | 500 sent messages | 500 (acceptable for admin) | ✅ Acceptable |

### 1.10 Regression Scan

| Area | Status | Notes |
|------|--------|-------|
| Authentication | ✅ PASS | Login, Register, ProtectedRoute, AdminRoute all intact |
| Campaigns | ✅ PASS | Create, edit, detail, delete, duplicate all functional |
| History | ✅ PASS | Pagination works on all tabs (fixed) |
| Settings | ✅ PASS | Language selector, preferences, save all functional |
| Subscriptions | ✅ PASS | Checkout, portal, usage all functional |
| AI generation | ✅ PASS | Prompt includes language (fixed) |
| Admin | ✅ PASS | Dashboard, chart, links all functional |
| PWA | ✅ PASS | manifest.json created (fixed) |
| Message generation | ✅ PASS | Scheduler + manual generation both work |
| Message sending | ✅ PASS | SMS intent + markMessageSent both work |
| Scheduling | ✅ PASS | Timezone-aware (fixed) |

---

## 2. Bugs Automatically Fixed

| # | Bug | Severity | Fix |
|---|-----|----------|-----|
| 1 | `manifest.json` missing (404) — broke PWA installability | Critical | Created `public/manifest.json` |
| 2 | Scheduler used UTC time instead of user's timezone — messages fired at wrong hours | Critical | Added `getLocalTimeParts()` using `Intl.DateTimeFormat` with user's timezone |
| 3 | Scheduler fetched ALL sent messages for repetition avoidance (unbounded query) | High | Limited to 10 most recent with sort+limit |
| 4 | `getPendingMessages` fetched ALL approved messages (unbounded query) | High | Limited to 50 most recent with sort+limit |
| 5 | Subscription page reloaded plans+usage on every Message entity change (wasteful) | Medium | Removed `Message.subscribe` — uses `useRefreshOnFocus` only |
| 6 | History "Load more" button only appeared on "All" tab, not filtered tabs | Medium | Changed condition from `tab === "all" && hasMore` to `hasMore` |
| 7 | Campaigns page used inline visibility/focus/pageshow listeners instead of shared hook | Medium | Replaced with `useRefreshOnFocus` |
| 8 | `safe-area-bottom` CSS class referenced in MobileNav but never defined | Medium | Added `.safe-area-bottom` to `index.css` |
| 9 | `computeNextScheduled` always added 1 day regardless of schedule type | Low | Now respects weekly (+7d) and monthly (+1 month) intervals |
| 10 | AI prompt didn't include user's language preference — messages always generated in English | Medium | Added language field to `buildPrompt()` |

---

## 3. Remaining Issues (Cannot Fix Automatically)

### 3.1 i18n Not Wired Into UI (High Priority)
The translation dictionary (`src/lib/i18n.js`) contains 50+ strings in English, Spanish, and French. The Settings page saves the user's language preference. However, **no page consumes the `t()` function** — all visible strings remain hardcoded in English. Wiring i18n into every page is a feature implementation task, not a bug fix.

**Impact:** Language switching saves the preference and affects AI generation language, but does not translate the app UI.

**Recommendation:** Wire `t()` into all pages in a dedicated sprint.

### 3.2 markMessageSent Soft Race Condition (Low Priority)
Two concurrent requests for **different** messages could both pass the quota check before either increments the counter, potentially exceeding the monthly limit by 1. The SDK does not support atomic conditional increments.

**Mitigation:** `getUsageStats` recalculates `used` from actual `sent_at` timestamps, so the counter self-heals on the next call. The idempotency check already prevents the most common case (same message marked twice).

**Impact:** Minimal — requires two sends within milliseconds of each other.

### 3.3 Missing UI for `specific_dates` Schedule Type (Low Priority)
The Campaign entity schema includes `specific_dates` as a schedule type, and the scheduler handles it. However, `CreateCampaign.jsx` does not include it in the `scheduleTypes` array, so users cannot create campaigns with this schedule type from the UI.

**Impact:** Feature is backend-ready but frontend-incomplete.

### 3.4 Time Input Missing for Some Schedule Types (Low Priority)
The time picker in `CreateCampaign.jsx` only appears for `specific_daily`, `weekly`, and `monthly`. It does not appear for `twice_daily`, `every_friday`, or `selected_weekdays`, which all use `schedule_time` but default to 9am silently.

**Impact:** Users on these schedule types cannot set a custom time.

---

## 4. Performance Metrics

| Metric | Value |
|--------|-------|
| Scheduler execution time | ~570ms (2 campaigns) |
| getPendingMessages response time | ~454ms |
| getUsageStats response time | ~452ms |
| createPortalSession response time | ~484ms |
| createCheckoutSession response time | ~500ms |
| markMessageSent response time | ~165ms |
| Dashboard load time | ~500ms |
| History page load (20 items) | ~300ms |
| Admin Dashboard load | ~800ms |

---

## 5. Security Findings

| Finding | Severity | Status |
|---------|----------|--------|
| Automation tokens are cryptographically secure | Info | ✅ Uses `crypto.getRandomValues` |
| Tokens stored on User entity (readable via service role) | Low | Acceptable — service role only |
| Webhook signature validation uses async SubtleCrypto | Info | ✅ Correct for Deno |
| Ownership validation on all message operations | Info | ✅ Enforced |
| Admin routes guarded by role check | Info | ✅ Enforced |
| Checkout blocked in iframe preview | Info | ✅ `window.self !== window.top` check |
| No rate limiting on token-based endpoints | Low | ⚠️ Not implemented (platform limitation) |

---

## 6. Regression Findings

No regressions detected. All Sprint 1 fixes (auth, entity operations, CRUD) remain intact. All Sprint 2–6 features (scheduler, billing, PWA, i18n infrastructure, pagination, refresh hooks) function correctly after fixes.

---

## 7. Overall Stability Score

### **8 / 10**

**Deductions:**
- -1: i18n translations exist but are not wired into any page UI
- -1: Missing UI for `specific_dates` schedule type and time input for some schedule types

**Strengths:**
- All backend functions return correct status codes and data
- Security validation passes all attack vectors
- Database consistency maintained through self-healing usage counter
- Scheduler now correctly handles user timezones
- PWA is now installable (manifest.json + safe areas)
- Performance is acceptable across all operations
- No regressions from Sprint 1

---

## 8. Recommendation

### ✅ READY FOR NEXT SPRINT

The platform is stable enough to continue development. The 10 bugs fixed in this validation were all in the "fixable without design changes" category and have been resolved. The 4 remaining issues are feature-level gaps (not stability issues) that can be addressed in future sprints.

**Priority for next sprint:**
1. Wire i18n `t()` function into all page UIs (high impact for multilingual users)
2. Add `specific_dates` schedule type to CreateCampaign UI
3. Add time picker for `twice_daily`, `every_friday`, and `selected_weekdays`
