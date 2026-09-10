# BoriSend RC10 — Foundation & Data Model Report

**Sprint:** RC10 Foundation & Data Model
**Date:** 2026-08-15
**Status:** ✅ Complete and verified
**Blueprint:** BoriSend 2.0 Master Architecture (LOCKED)

---

## 1. Objective

Transition BoriSend from an RC9 SMS-scheduling utility to the intentional
relationship-strengthening platform defined by the 2.0 Master Architecture, by
laying a portable, provider-independent foundation: a BoriSend Profile with a
public reference ID, a configurable relationship taxonomy, the Contact /
Plan Recipient separation, and the Relationship Memory foundation — all isolated
per owner and per plan, with no changes to existing RC9 behaviour.

---

## 2. Entities Delivered

All entities are portable Base44 schemas. RLS enforces owner isolation and admin
override on every record. Built-in fields (id, created_date, updated_date,
created_by_id) are not redeclared.

### 2.1 BoriSend Profile
- **Entity:** `BoriSendProfile`
- **Purpose:** One record per authenticated user. Holds the public BoriSend
  reference ID and onboarding state.
- **Public ID format:** `BO/MM/YY/SN` — `BO` prefix, 2-digit month, 2-digit year,
  un-padded serial starting at 101.
- **Key fields:** `user_id` (immutable relational key, NOT the public ID),
  `borisend_user_id` (public, immutable), `onboarding_status`
  (`incomplete`/`complete`), `profile_status` (`active`/`suspended`/`deactivated`),
  `preferred_locale`, `timezone`.
- **RLS:** read/update by owner or admin; create/delete admin-only.

### 2.2 User ID Counter
- **Entity:** `BoriSendUserIdCounter`
- **Purpose:** Server-side, atomic, per-month/year serial allocation for the
  `BO/MM/YY/SN` ID. One row per (month, year).
- **Key fields:** `month`, `year` (full year), `last_serial` (starts at 100 so
  the first ID is 101), `id_prefix`.
- **RLS:** admin-only (all ops). Never exposed to end users.

### 2.3 Relationship Taxonomy (configurable)
Four reference entities, all admin-managed, publicly readable, and keyed by an
immutable `system_key` so display labels can change without breaking links:

| Entity | Count | Purpose |
|---|---|---|
| `RelationshipCategory` | 12 | Top-level grouping (family, professional, friendship, faith, romantic, mentorship, community, clients, colleagues, acquaintance, in_law, extended_family) |
| `RelationshipType` | 71 | Directional/symmetric types (e.g. `husband_to_wife`, `manager_to_direct_report`, `friend_to_friend`) with denormalised `category_system_key` for portable lookups without a join |
| `RelationshipState` | 6 | Health states (`active`, `neglected`, `strengthening`, `distant`, `new`, `transitional`) |
| `RelationshipGoal` | 17 | Intents (e.g. `stay_connected`, `recognise_contribution`, `reconnect`, `encourage_growth`) |

### 2.4 Contact
- **Entity:** `Contact`
- **Purpose:** The actual human/entity, owned by one user. NOT a per-plan
  recipient unit — a single Contact can appear in many plans.
- **Key fields:** `owner_user_id`, `display_name`, `phone_number`, `email`,
  `organisation`, `timezone`, `notes` (global owner context), `is_active`.
- **RLS:** owner-isolated read/update/delete; owner-only create; admin override.

### 2.5 Plan Recipient
- **Entity:** `PlanRecipient`
- **Purpose:** The per-plan join between a Contact and a Communication Plan.
  Carries the plan-specific relationship context that is intentionally isolated
  from the master Contact.
- **Key fields:** `owner_user_id`, `campaign_id`, `contact_id`,
  `relationship_type_id`, `relationship_state_id`, `relationship_goal_id`,
  `recipient_context` (plan-specific, isolated), `status`, `joined_at`,
  `deactivated_at`.
- **Multi-recipient model:** one plan can have many recipients; one contact can
  be a recipient in many plans, each with its own context, state, and goal.
- **RLS:** owner-isolated; admin override.

### 2.6 Relationship Memory
- **Entity:** `RelationshipMemory`
- **Purpose:** Scoped facts, milestones, dates, preferences, boundaries, and
  feedback-derived notes. Memory is scoped to a **Plan Recipient**, never
  applied globally across unrelated plans.
- **Key fields:** `owner_user_id`, `campaign_id`, `plan_recipient_id`,
  `memory_type` (`fact`/`milestone`/`important_date`/`preference`/`boundary`/
  `feedback_derived`), `content`, `related_date`, `is_active`.
- **RLS:** owner-isolated; admin override.

---

## 3. Portable Service / Repository Layer

All business logic lives in `base44/shared/` and `src/services/` so it is
portable to a private server environment and not coupled to Base44 components.

- `base44/shared/borisend-profile/` — `user-id-generator.ts` (pure
  `buildBoriSendUserId`), `profile-service.ts` (idempotent `ensureProfile`),
  `profile-repository.ts`, `types.ts`.
- `base44/shared/relationships/` — `taxonomy-repository.ts`,
  `contact-service.ts`, `plan-recipient-service.ts`, `memory-service.ts`,
  `types.ts`.
- `src/services/relationships/` and `src/services/borisend-profile/` — frontend
  SDK wrappers over the entities for RC11 UI consumption.

### Server-side ID generation
`ensureBoriSendProfile` (backend function) acquires a serial atomically:
load-or-create the counter row for the current (month, year), increment
`last_serial`, persist, then format `BO/MM/YY/SN`. Idempotent — a second call
returns the existing profile without re-allocating.

---

## 4. Integration Into Existing App

- **AuthContext:** a fire-and-forget `ensureBoriSendProfile` invocation is wired
  into post-auth initialisation. It is non-blocking and never affects login,
  session, or routing behaviour; existing RC9 flows are unchanged.
- **No RC9 entity or function was modified.** Campaign, Message, scheduler,
  subscription, referral, and trial systems are untouched. RC10 only *adds*
  new entities and a portable service layer.

---

## 5. Verification

| Check | Method | Result |
|---|---|---|
| `BO/MM/YY/SN` format (first, cross-999→1000, month reset) | pure-function unit | ✅ `BO/08/26/101`, `BO/08/26/999`, `BO/08/26/1000`, `BO/09/26/101` |
| Profile provisioning (live function) | `test_backend_function` | ✅ created `BO/08/26/101`, onboarding `incomplete`, status `active` |
| Provisioning idempotency | second function call | ✅ `created:false`, same profile/ID |
| Taxonomy integrity | asServiceRole read | ✅ 12/71/6/17, 0 orphan types, all categories have types, all types carry `category_system_key` |
| Counter row created | asServiceRole read | ✅ month 8, year 2026, last_serial 101 |
| Multi-recipient per plan | throwaway records | ✅ Plan A: 2 recipients, Plan B: 1 |
| Same contact across plans | throwaway records | ✅ John in 2 plans with distinct contexts |
| Memory scoping to Plan Recipient | throwaway records | ✅ memory found for PR1 (1), absent for PR2 (0) |
| Test-data cleanup | post-assert delete | ✅ 0 leftover contacts, recipients, memories |
| Frontend build intact (RC9 + RC10) | preview render | ✅ Home, Campaigns, ArchitectureDoc render; 0 build errors |

> RLS isolation (User A cannot see User B's records) is enforced by the per-entity
> `rls` rules (owner match + admin override) and was verified by code inspection
> against the RLS authoring guide; live two-user isolation testing requires a
> second invited user and is deferred to QA.

---

## 6. Cost & Portability Notes

- The `ensureBoriSendProfile` function is invoked once per authenticated session
  start and short-circuits when a profile already exists, so steady-state cost is
  a single read per session — no polling, no per-message overhead.
- All RC10 logic is provider-independent and lives outside Base44 platform
  primitives (no AI terminology in user surfaces; IDs are generated server-side;
  memory is portable text). The layer can be lifted to a private server with the
  entity schemas and the `base44/shared/` modules intact.

---

## 7. Deferred to RC11

- BoriSend 2.0 onboarding flow consuming `onboarding_status`.
- Relationship taxonomy picker UI in the Create Plan wizard.
- Contact management UI (list, add, edit) with plan-recipient assignment.
- Relationship Memory capture and display within plan/recipient views.
- Wiring Plan Recipient records into the message-generation context pipeline.
