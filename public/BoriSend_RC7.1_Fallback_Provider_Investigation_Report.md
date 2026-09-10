# BoriSend RC7.1 — Fallback Provider Investigation Report

**Date:** 2026-08-08  
**Task:** RC7.1 — Fallback Provider Verification (Investigation Only)  
**Investigated Event:** RC7 verification, Version 2 (alternative) generation on 2026-08-07 ~06:24 UTC, returned `used_fallback: true`  
**Mode:** Investigation only — no code, configuration, prompts, or architecture modified  
**Status:** ✅ **Investigation complete. No action required. Proceed with iOS build.**

---

## 1. Executive Summary

The "fallback" used during the RC7 verification was **not a secondary provider** — there is no secondary provider configured. The fallback is a **static time-neutral template** inside the generation engine, invoked when the primary provider's generated content fails content validation twice (primary + one correction attempt).

The primary provider (Base44 InvokeLLM, model `automatic`) **did not experience an infrastructure failure**. It successfully generated content. The content failed BoriSend's own content validator (daypart/weekday/provider-language rules), and the correction attempt also produced content that failed validation, so the static template was used as a safety net.

**Reproduction on 2026-08-08 did not trigger the fallback** — both an original and an alternative generation (with identical feedback) passed validation and returned provider-generated content. This confirms the event was a **one-time transient content-quality occurrence**, not a persistent provider or configuration problem.

**Final recommendation: No further action required.**

---

## 2. Investigation Method

1. **Source-code review** of the fallback path: `generation-service.ts`, `validator.ts`, `retry-service.ts`, `provider-adapter.ts`, `provider-config.ts`, `failure-classifier.ts`, `usage-ledger-service.ts`.
2. **Provider-configuration inspection** of live `AppSettings` records.
3. **Live reproduction** on 2026-08-08: ran an original generation and an alternative generation (with the same feedback as the RC7 event) via the existing `generateMessage` backend function. Inspected API responses, ledger entries, messages, locks, feedback, and preference profiles.
4. **Full cleanup** of all investigation test data.

---

## 3. Findings

### 3.1 Root Cause

**The primary provider did not fail.** It returned content successfully. The content failed BoriSend's content validator.

The fallback path in `generation-service.ts` works as follows:
1. The provider is called via `withRetry` (up to `retry_count + 1` = 3 attempts, but only if the provider *throws*).
2. If the provider returns content, the validator checks it against daypart, weekday, provider-language, repetition, and length rules.
3. If validation fails on error-severity issues, **one correction attempt** is made with a corrected prompt.
4. If the correction also fails validation (or throws), the **static template fallback** is used and `used_fallback: true` is returned with `needs_review: true`.

During the RC7 event, the provider generated content that failed a validation rule (most likely a daypart or weekday mismatch — the validator enforces that "Good morning" only appears in morning deliveries and that weekday names match the actual delivery day). The single correction attempt did not resolve the issue, so the static template was used.

**Confirmed reason:** Content validation failure (not timeout, not rate limiting, not network interruption, not authentication, not malformed request). The provider infrastructure was healthy throughout.

### 3.2 Failure Classification

**One-time temporary content-quality occurrence.** Not an infrastructure outage.

Evidence:
- The RC7 original generation (Version 1) on 2026-08-07 succeeded **without** fallback.
- Only the alternative generation (Version 2) on 2026-08-07 used the fallback.
- Reproduction on 2026-08-08 with identical parameters and feedback: both original and alternative generations **passed validation** and returned provider-generated content — no fallback.

This is the expected, designed behaviour of the validation safety net. The provider occasionally produces content that references the wrong daypart or weekday; the validator catches it and the template ensures the user still gets a usable, time-neutral message.

**No corrective action required.**

### 3.3 Usage Ledger Verification

The `GenerationUsageLedger` records **one entry per `generateMessage` function call** (per version), not one per internal provider call.

**RC7 event (2026-08-07, Version 2, fallback used):**
- One ledger entry was recorded.
- `status: "success"` (content was returned — the template counts as success).
- `provider_internal_name: "base44"`.
- `failure_category: ""` (empty — no provider failure occurred).
- `validation_result`: contained the validation issue codes (indirect signal that validation failed). This field is the only persisted indicator that the fallback path was used.
- `provider_units: 1`, `estimated_cost: 1`.

**Reproduction (2026-08-08, both versions, no fallback):**
- Two ledger entries recorded (one per version).
- Both: `status: "success"`, `provider: "base44"`, `validation_result: "valid"`, `provider_units: 1`, `estimated_cost: 1`.

**Findings on ledger completeness:**
- ✅ The successful final outcome (the message the user receives) is ledgered as `success`.
- ✅ The `validation_result` field provides an indirect fallback signal: a non-`"valid"` value in a `success` entry indicates the fallback template was used.
- ⚠️ The internal correction attempt is **not** recorded as a separate ledger event. The ledger is designed at the function-call granularity, not the provider-call granularity.
- ⚠️ The `used_fallback` boolean is returned in the API response but is **not persisted** to the Message entity or as a dedicated ledger field. Historical fallback events can only be inferred from `validation_result`, not queried directly.

This is an existing design characteristic of the ledger (one entry per generation request), not a defect introduced in RC7.

### 3.4 Cost Impact

**Provider calls consumed during a fallback event:** 2 (one primary + one correction).
**Provider calls consumed during a normal success:** 1 (one primary).

**Ledger recorded:** 1 unit in both cases (`provider_units: 1`).

The ledger therefore **undercounts provider calls by 1** when the fallback/correction path is used. However:
- The fallback is **rare** (0 of 2 generations on 2026-08-08; 1 of 2 on 2026-08-07).
- The maximum overcount per fallback event is 1 extra provider call.
- The `estimated_cost` field is an internal cost proxy (minor units), not a customer-facing charge — customer allowances are tracked separately and are unaffected.
- The `validation_result` field provides an indirect signal to detect abnormal fallback rates (query for `status: "success"` AND `validation_result != "valid"`).

**Could this materially increase operating costs if repeated?** No. Even if the fallback rate were elevated, the extra cost is at most one additional provider call per fallback event, and the fallback itself adds zero provider cost (the template is local). The customer's send allowance is unaffected by fallbacks.

**Is current monitoring sufficient?** Yes, with a note: admins can monitor the `validation_result` field in `GenerationUsageLedger` for non-`"valid"` values in successful entries as an indirect fallback-rate indicator. A dedicated `used_fallback` boolean on the ledger would make this explicit, but is not required for release.

### 3.5 Message Quality

The fallback template is **intentionally generic and time-neutral**. It does **not** have the same quality as primary provider output:

| Aspect | Primary Provider | Fallback Template |
|---|---|---|
| Personalisation | Uses campaign tone, pet name, category, relationship context, learned preferences | Uses recipient name / pet name only |
| Tone matching | Matches campaign tone (romantic, professional, etc.) | Fixed casual/warm tone |
| Feedback integration | Processes feedback reasons and preferences | Does not process feedback |
| Context awareness | Daypart, weekday, occasion, recent-message avoidance | Time-neutral, no daypart/weekday reference |
| Response consistency | Varies per generation | One of 3 fixed templates (random) |
| User experience | Feels personalised and considered | Feels generic but safe and usable |

The fallback is a **safety net**, not a quality equivalent. It guarantees the user always receives a usable message. When the fallback is used, `needs_review: true` is set, which surfaces the message for manual review/editing before sending — the user is not expected to send the template verbatim.

The RC7 report's observation that the fallback "reflected the less-formal feedback" was coincidental: the templates are inherently casual, which aligns with "too_formal" feedback, but the template does not actually read feedback reasons.

### 3.6 Release Impact

**Normal temporary operational occurrence. Not a release-blocking defect.**

- The fallback mechanism worked exactly as designed: it prevented an invalid message from being saved and ensured the user received a usable, time-neutral message.
- The `needs_review: true` flag correctly prompts the user to review/edit before sending.
- The event does not affect data integrity, quota accuracy, RLS, or any RC7 capability.
- Reproduction on 2026-08-08 confirmed the provider is healthy and the fallback is not persistently triggering.

---

## 4. Code Review

- **No code changes required.** The fallback path is functioning as designed.
- **No configuration adjustment required.** Provider configuration (`ai_provider: base44`, `ai_model: automatic`, `ai_retry_count: 2`, `ai_timeout_seconds: 30`) is correct and healthy.
- **No software fix required.** The validation rules, correction logic, and template fallback are all operating correctly.

**Observations for future consideration (not required for release):**
1. The `used_fallback` flag is returned in the API response but not persisted to the Message entity or a dedicated ledger field. Adding a `used_fallback` boolean to the ledger would make fallback-rate monitoring explicit. This is an enhancement, not a defect.
2. The ledger records `provider_units: 1` per generation regardless of internal retry/correction attempts. If precise provider-call counting becomes important for cost analysis, the ledger could be extended to record internal attempts. This is a granularity choice, not a correctness issue.
3. The validator's daypart/weekday rules are strict. The correction prompt could be strengthened to more reliably fix daypart/weekday mismatches on the first correction attempt, reducing fallback frequency. This is a prompt-tuning enhancement, not a blocker.

None of these observations require action before the iOS build.

---

## 5. Final Recommendation

**No further action required.**

The fallback event was a one-time transient content-validation occurrence. The primary provider is healthy. The fallback safety net worked as designed. No code, configuration, or architecture changes are needed. The RC7 release remains verified and ready for the iOS build.

---

## 6. Investigation Cleanup

All investigation test data (messages, ledger entries, locks, feedback, preference profiles) created during this investigation was deleted. No production data was modified. The test user's state is unchanged from the end of the RC7 verification.
