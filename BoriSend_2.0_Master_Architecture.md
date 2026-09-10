# BoriSend 2.0 — Master Product Architecture & PRD

> **Status:** Master Blueprint (LOCKED)
> **Purpose:** Define the redesigned BoriSend before any BoriSend 2.0 implementation begins in Base44.
> **Implementation principle:** Preserve useful existing infrastructure, redesign the product around relationship outcomes, and avoid unnecessary rebuilding.

---

## 1. Product Transformation

BoriSend should no longer be positioned primarily as an AI SMS scheduling application. The technology remains important, but it is not the solution customers are buying.

BoriSend 2.0 becomes: **A relationship-strengthening platform that helps people communicate thoughtfully and consistently with the people who matter to them.**

The underlying problem is: People value their relationships, but maintaining meaningful and consistent communication is difficult.

BoriSend helps users decide: Who needs attention → Why the relationship matters → What they want to achieve → How they should communicate → When they should communicate → What they could thoughtfully say.

AI supports this process but should largely disappear into the background.

## 2. Core Product Promise

**BoriSend helps people intentionally build, maintain and restore relationships through thoughtful, consistent communication.**

Three words are especially important:

- **Intentional** — Communication isn't random. There is a relationship objective behind it.
- **Thoughtful** — BoriSend shouldn't produce generic "Hi! Just checking in 😊" repeatedly. It should understand why the user is communicating.
- **Consistent** — People often know relationships matter but fail to communicate regularly. BoriSend provides the structure.

## 3. Product Architecture

```
PERSON / ORGANISATION
        ↓
RELATIONSHIP CATEGORY
        ↓
RELATIONSHIP TYPE
        ↓
RELATIONSHIP STATE
        ↓
RELATIONSHIP GOAL
        ↓
COMMUNICATION STRATEGY
        ↓
COMMUNICATION PLAN
        ↓
RECIPIENT CONTEXT
        ↓
COMMUNICATION RHYTHM
        ↓
MESSAGE INTENT
        ↓
MESSAGE PREPARATION
        ↓
USER REVIEW / EDIT
        ↓
SEND
        ↓
FEEDBACK
        ↓
RELATIONSHIP LEARNING
```

This is fundamentally different from: Create schedule → AI generates SMS → Send.

## 4. Relationship Taxonomy

Broad Relationship Categories, underneath which we maintain configurable Relationship Types.

### 4.1 Romantic & Marital
Husband ↔ Wife; Partners/Couples; Fiancé ↔ Fiancée; Long-distance partners.

### 4.2 Parent & Child
Parent ↔ Young Child; Parent ↔ Teenager; Parent ↔ Adult Child; Guardian ↔ Child; Grandparent ↔ Grandchild.

### 4.3 Family & Extended Family
Siblings; Cousins; In-laws; Uncle/Aunt ↔ Nephew/Niece; Extended family.

### 4.4 Friendship & Personal
Close friends; Old friends; Childhood friends; Long-distance friends; Former colleagues/friends; Personal Mentor ↔ Mentee.

### 4.5 Workplace & Professional
Employer ↔ Employee; Line Manager ↔ Direct Report; Team Leader ↔ Team Member; Colleague ↔ Colleague; Business Partner ↔ Business Partner; Professional Mentor ↔ Mentee.

### 4.6 Business & Customer
Company ↔ Customer; Account Manager ↔ Client; Consultant ↔ Client; Freelancer ↔ Client; Service Provider ↔ Customer; Salesperson ↔ Prospect; Salesperson ↔ Customer.

### 4.7 Faith & Spiritual
Pastor ↔ Member; Church Leader ↔ Member; Ministry Leader ↔ Volunteer; Spiritual Mentor ↔ Mentee; Small Group Leader ↔ Member.

### 4.8 Community & Social
Community Leader ↔ Member; Association ↔ Member; Club ↔ Member; Volunteer Coordinator ↔ Volunteer; Alumni ↔ Alumni; Neighbour ↔ Neighbour.

### 4.9 Education & Development
Teacher ↔ Student; Tutor ↔ Learner; Coach ↔ Coachee; School ↔ Parent; School ↔ Alumni; Trainer ↔ Participant.

### 4.10 Care & Support
Carer ↔ Person Supported; Support Worker ↔ Client; Support Organisation ↔ Service User; Charity ↔ Beneficiary.

### 4.11 Membership & Organisation
Professional Body ↔ Member; NGO ↔ Member/Supporter; Association ↔ Member; Club ↔ Member; Subscription Community ↔ Member.

### 4.12 Network & Influence
Professional contact; Former colleague; Referral partner; Strategic partner; Investor ↔ Founder; Donor ↔ Organisation.

These should be configuration-driven, not hard-coded throughout the application.

## 5. Relationship Direction Matters

Knowing that a relationship is "workplace" isn't sufficient. The system needs to know: **Who is the user in this relationship?** Manager → Employee is different from Employee → Manager. Pastor → Member differs from Member → Pastor. Relationship Type should preserve direction/role context where applicable.

## 6. Relationship State

Describes the relationship now. Initial states:

- **New** — The relationship is beginning.
- **Active** — Healthy and regularly maintained.
- **Neglected** — Nothing necessarily went wrong, but communication has reduced.
- **Distant** — Meaningful relational distance exists.
- **Strained** — There has been disappointment, disagreement, tension or hurt.
- **Rebuilding** — The parties are reconnecting after difficulty or distance.

Onboarding should phrase sensitively, e.g. "How would you describe your relationship at the moment?" with short explanations.

## 7. Relationship Goal

State tells us where the relationship is. Goal tells us where the user wants it to go.

Stay connected; Communicate more consistently; Show appreciation; Encourage; Be more supportive; Recognise contribution; Reconnect; Rebuild trust gradually; Strengthen family connection; Strengthen professional relationship; Maintain client relationship; Improve employee engagement; Provide pastoral encouragement; Mentor/develop; Celebrate important moments; Keep in touch; Build a new relationship.

Goals must be appropriate to the Relationship Type (no romantic-style objectives for an employer/employee relationship).

## 8. Relationship Strategy

A major new intellectual asset. Translates Category + Type + State + Goal into practical communication guidance.

**Example — Parent → Adult Daughter, Distant, Reconnect:**
Warm, non-demanding contact; Avoid guilt; Avoid repeated questions about silence; Show genuine interest; Use shared memories selectively; Allow space; Build consistency gradually.

**Example — Manager → Direct Report, Active, Recognition and engagement:**
Recognise specific contributions; Check in periodically; Avoid over-familiarity; Encourage development; Celebrate milestones; Maintain professional boundaries.

This strategy informs message generation.

## 9. Communication Plans

Remain central, but richer. An intentional programme of communication designed around a specific relationship objective.

**Example — Plan: Stay Connected With Mum.** Adult Child → Parent, Active, Maintain connection, Recipients: Mum, Rhythm: Twice weekly.

**Example — Plan: Team Recognition.** Team Lead → Team Members, Goal: Recognition and engagement, Recipients: 8 team members, Rhythm: Weekly.

## 10. Multi-Recipient Communication Plans

A firm requirement. A Communication Plan can contain one or multiple recipients (pastors/members, managers/teams, organisations/members, businesses/customers, schools/parents, mentors/cohorts, community leaders, families). However, multiple recipients must not create a subscription loophole.

## 11. Contact vs Recipient Unit

- **Contact** — The actual human/entity. John Smith exists once in the user's contact directory.
- **Plan Recipient** — John's assignment to a particular Communication Plan.
- **Recipient Unit** — One recipient assigned to one Communication Plan consumes one Recipient Unit.

John in "Team Recognition" = 1 Recipient Unit. John also in "Mentoring" = another Recipient Unit. John remains one Contact but consumes 2 Recipient Units. This is intentional because the objectives and relationship intelligence differ.

## 12. Communication Plan Unit

One active Communication Plan consumes one Communication Plan Unit. The number of recipients does not change its Plan Unit consumption. "Pastor Member Encouragement, 100 recipients" consumes 1 Communication Plan Unit + 100 Recipient Units.

## 13. Recipient-Specific Context

A multi-recipient plan may have shared strategy while maintaining recipient-specific context (e.g. individual employee contributions). This prepares BoriSend for greater personalisation without requiring every recipient to have an entirely separate Communication Plan.

## 14. Shared vs Personalised Communication

- **Shared Communication** — One message/intention appropriate for several recipients (e.g. Pastor → congregation). Potentially 1 generation → multiple recipients.
- **Personalised Communication** — Message uses recipient-specific context (e.g. Manager recognising individual employee contributions). Potentially separate personalised outputs.

The system must not falsely personalise a shared message. This distinction matters for both quality and generation economics.

## 15. Relationship Memory

BoriSend should learn within the appropriate relationship context. Memory should not simply belong globally to the user.

```
USER
  ↓
COMMUNICATION PLAN
  ↓
PLAN RECIPIENT
  ↓
RELATIONSHIP MEMORY
```

Examples: preferred tone; topics the user dislikes; communication boundaries; useful contextual information; previous communication themes; important dates where deliberately supplied; feedback.

## 16. RC7 Preference Principle Remains

Learned communication preferences must be isolated by Communication Plan rather than globally applied to the user. A user might want "professional and concise" for clients, but "warm and conversational" for siblings. Learning one must not contaminate the other. Recipient-specific intelligence can sit underneath the Communication Plan where necessary.

## 17. Message Intelligence

Existing RC7 principles remain valuable: GenerationKey deduplication; reuse; version control; feedback; preference learning; generation locks; cost control.

The new message specification should eventually include: Relationship Type; Relationship State; Relationship Goal; Relationship Strategy; Plan Preferences; Recipient Context; Message Intent; Communication History; Timing Context; Tone Boundaries. The LLM should receive a structured communication brief, not simply "Write a nice SMS to my daughter."

## 18. AI Should Be Invisible

BoriSend should not constantly announce "AI generated this." Preferred language: Prepare message; Suggest another; Improve message; Communication suggestion; Relationship insight — rather than: Generate with AI; AI assistant; AI-powered; AI recommendation. AI can still be disclosed appropriately where necessary, but should not define the visual/product identity.

## 19. Human Control Remains Mandatory

BoriSend prepares. The user decides. Users can: review; edit; reject; regenerate within policy; postpone; delete; send. Particularly important for sensitive personal relationships.

## 20. Relationship Reconnect / Revival

Design now, not necessarily launched in full immediately. Customer-facing terminology: "Reconnect" rather than "Relationship Revival."

Flow: Relationship → Current situation → What happened? → What would you like to achieve? → Communication boundaries → Reconnection strategy → Gradual communication plan → Review progress.

It should provide relationship communication support, not present itself as psychotherapy or professional counselling.

## 21. Reconnect Safety Boundaries

Some situations should not proceed through ordinary automated relationship-rebuilding advice. Examples: abuse; coercive control; threats; stalking; exploitation; serious safety concerns. The system should not encourage "Keep reaching out until they respond." Respect for boundaries and consent should be foundational. This safety layer belongs in the strategy engine, not merely in the generated wording.

## 22. Registration Architecture

Base44 authentication can remain. The problem is that Base44 registration doesn't collect sufficient profile information. Separate:

- **Authentication** — Base44: credentials + authenticated account.
- **BoriSend Profile** — After first successful registration: "Welcome to BoriSend" and complete onboarding.

Potential initial fields: First name; Last name; Timezone; Preferred language where required. Collect only information we can justify using.

## 23. BoriSend User ID

Formal format: **BO/MM/YY/SN**. SN starts at 101 each month.

Example: BO/08/26/101 … BO/08/26/999, BO/08/26/1000. September: BO/09/26/101.

Requirements: server-side generation; concurrency-safe; unique; immutable; user-visible; support-visible. It must NOT serve as the database primary key or authentication credential. Maintain an internal immutable technical ID separately.

## 24. Membership Model

For launch, BoriSend 2.0 should have **One Membership**, available Monthly and Annual. Deliberately not launching multiple artificial tiers yet. Objective: collect real usage data before deciding how future customer segments should be packaged.

## 25. Included Capacity

Membership includes configurable amounts of Communication Plan Units and Recipient Units. Exact launch quantities and price are not yet locked. They must be configuration-driven. Do not hard-code "3 plans / 10 recipients" into business logic.

## 26. Add-ons

Users can purchase additional Communication Plan Units and/or Recipient Units. Add-on quantities and pricing must be configurable.

## 27. Add-on Renewal

Default behaviour: **Recurring ON**, but clearly disclosed before purchase. Example: "+10 Recipient Units, £X/month, ☑ Renew automatically." The customer can turn renewal off. No hidden recurring billing.

## 28. Add-on Expiry

Turning renewal off does not immediately remove paid capacity. The add-on remains active until the end of its paid period. Unused capacity does not roll over.

## 29. Over-Capacity State

Never automatically delete relationships because capacity expires. Example: Available 20 Recipient Units, Current consumption 32 → Account enters "Over Capacity". The user can: see existing data; add capacity; choose which relationships remain active; deactivate recipient assignments. The 12 excess units should not continue receiving paid-capacity functionality indefinitely, but their relationship data should not simply disappear.

## 30. Future Membership Changes

The entitlement architecture must support future multiple plans even though launch has one.

- **Upgrade** — Future tier upgrade: immediate + billing-provider proration.
- **Downgrade** — effective next renewal. Never suddenly delete/deactivate relationships in the middle of a paid period merely because a future downgrade was requested.

## 31. Entitlement Engine

Do not store only `recipient_limit = 30`. Instead calculate:

```
BASE MEMBERSHIP
        +
ACTIVE ADD-ONS
        +
PROMOTIONAL CAPACITY
        +
ADMIN ADJUSTMENTS
        =
EFFECTIVE ENTITLEMENT

EFFECTIVE ENTITLEMENT
        -
ACTIVE CONSUMPTION
        =
AVAILABLE CAPACITY
```

This allows future pricing changes without rebuilding the subscription architecture.

## 32. Subscription Data Model

Conceptually: MembershipProduct; MembershipSubscription; EntitlementDefinition; MembershipEntitlement; AddOnProduct; AddOnSubscription; AddOnEntitlement; PromotionalEntitlement; AdminEntitlementAdjustment; EntitlementSnapshot; UsageConsumption.

We don't necessarily need every entity as a separate table if Base44 has a cleaner implementation, but the logical separation must remain.

## 33. Pricing Discovery

The launch membership model is deliberately a learning mechanism. Understand: plans per account; recipient units per account; capacity utilisation; add-on purchases; add-on size; add-on renewal; cancellation; relationship categories; personal vs professional use; generation activity; revenue; infrastructure cost. Future pricing should emerge from observed customer behaviour.

## 34. Analytics Events

At minimum, architecture should support events such as:

- profile_completed; membership_started; membership_renewed; membership_cancelled
- communication_plan_created; communication_plan_activated; communication_plan_deactivated
- recipient_assigned; recipient_deactivated
- plan_capacity_80_percent; plan_capacity_reached
- recipient_capacity_80_percent; recipient_capacity_reached
- addon_viewed; addon_purchased; addon_renewed; addon_cancelled; addon_expired
- relationship_category_selected; relationship_type_selected; relationship_state_selected; relationship_goal_selected
- message_prepared; alternative_requested; message_edited; message_accepted; message_sent
- reconnect_started; reconnect_completed

Commercial analytics should not unnecessarily copy private message content.

## 35. Communication Plan Creation Experience

The existing plan-creation process should eventually become more conversational and outcome-oriented. Instead of beginning with "Schedule type?", start with: Who are you trying to stay connected with? → What is your relationship? → How would you describe the relationship today? → What would you like to achieve? → How often would you naturally like to communicate? Then BoriSend recommends an appropriate plan. The user remains free to customise it.

## 36. BoriSend Should Recommend, Not Dictate

Example: "Based on your goal of staying connected with your adult son, a thoughtful check-in once or twice a week may feel more natural than daily messaging." Then: "Use recommendation" / "Customise". This is more valuable than simply asking the customer to configure a scheduler.

## 37. Communication Intents

Messages within a plan should not all serve the same purpose. A plan may rotate through intents such as: check-in; appreciation; encouragement; recognition; gratitude; celebration; shared memory; practical support; thoughtful question; milestone; congratulations; gentle reconnection. Allowed intents depend on Relationship Type and Goal. This reduces repetitive generic communication.

## 38. Communication Rhythm

Frequency is not simply a technical schedule. BoriSend should understand Communication Rhythm: weekly; twice weekly; fortnightly; monthly; important occasions; custom. The technical scheduler then implements that rhythm. This keeps the product language relationship-centred rather than engineering-centred.

## 39. Existing Scheduler

RC9 gives us a strong foundation. `next_scheduled` is now authoritative. The current hourly runner can remain initially. Do not redesign it merely for architectural elegance. Current fixed automation baseline after RC9 is approximately 780 credits/month rather than 9,390 credits/month. Acceptable for launch.

## 40. Generation Cost Control

RC7 remains part of BoriSend 2.0. Continue to prefer reuse before regeneration. Generation should be intentional. The product should not encourage users to press "Try again" repeatedly until they receive something entertaining — bad for both relationship quality and cost.

## 41. Generation Economics and Recipients

Preserve the ability for appropriate multi-recipient communications to use one prepared communication → multiple recipients, rather than automatically generating independently for every recipient. But when genuine recipient-specific personalisation is required, BoriSend should produce recipient-specific content. This distinction should be explicit in the architecture.

## 42. Base44 Strategy

Following RC9, no immediate migration. Current strategy: **Remain on Base44 while designing portable boundaries.** Base44 can continue handling: UI; authentication; database; backend functions; scheduling; Stripe/webhooks; referral logic; app packaging.

## 43. Portability Boundary

New business logic should be modular. Avoid deeply coupling: Relationship Strategy Engine; entitlement calculations; message specification; relationship taxonomy; preference learning; to Base44-specific UI components. Think: UI → Service → Business Logic → Persistence/Provider, not "Page component containing everything." This gives a migration path later.

## 44. Long-Term Externalisation Candidate

The most likely first component to leave Base44 eventually remains the **Message Generation Provider Layer**. At sufficient scale, BoriSend may benefit from: direct model-provider billing; more granular routing; cheaper models for simple tasks; stronger fallback control; independent cost telemetry. No economic justification for doing this immediately.

## 45. BoriSend Design System

**NO GRADIENTS.** Anywhere. Including: backgrounds; buttons; banners; cards; onboarding; subscription pages; dashboards; empty states; illustrations; loading states.

## 46. No AI Design Vibe

Avoid: purple-blue gradient SaaS design; glowing borders; glassmorphism; neon; excessive floating cards; sparkles everywhere; robot imagery; generic AI illustrations; decorative blobs; unnecessary animations; exaggerated futuristic interfaces.

BoriSend should feel: **Human. Calm. Warm. Mature. Trustworthy. Intentional.** Technology should support the relationship rather than visually dominate it.

## 47. Light and Dark Appearance

Existing theme work remains applicable. Users should control appearance. New users: Light by default. Existing users without an explicit preference: Follow Device. Explicit preferences: always preserved. Dark mode must be intentionally designed, not produced by simply inverting colours. No gradients in either theme.

## 48. Product Language

Move away from software terminology where possible.

- "AI Generation Configuration" → "Message Preferences"
- "Scheduler" → "Communication Rhythm"
- "Recipient allocation" → "People in this plan"
- "Generate" → "Prepare Message"

The underlying architecture can remain technical; the user experience should not be.

## 49. Existing Functionality — Preserve

Do not throw away working capabilities merely because we're redesigning. Subject to compatibility with BoriSend 2.0, preserve: existing authentication; scheduling; timezone handling; fixed/random timing; RC6/RC7 generation infrastructure; message review/edit; notifications; referrals; Stripe; legal/account deletion; account management; subscription infrastructure; iOS/Android work; RC9 automation optimisation.

## 50. Existing Functionality — Reframe

- **Campaign** → "Communication Plan" (user-facing terminology).
- **AI generation** → "Message Preparation".
- **Scheduling** → "Communication Rhythm".
- **Message quota** → should no longer dominate the value proposition.
- **Contact** → becomes part of the broader relationship model.

## 51. Existing Functionality — Potentially Deprecate

Over time, remove concepts that exist only because BoriSend was originally designed as an SMS scheduler and don't contribute to the relationship solution. Nothing should be removed merely because it looks old. Every existing feature should be classified during implementation: **Preserve / Adapt / Migrate / Deprecate**.

## 52. Administrative Architecture

Admin should eventually manage: Relationship Categories; Relationship Types; Relationship States; Relationship Goals; strategy templates/rules; communication intents; membership pricing; included capacities; add-on products; add-on quantities; promotional entitlements; relationship safety rules; feature flags. This prevents rebuilding the application whenever the business learns something.

## 53. Relationship Taxonomy Must Be Configurable

Do not bury "Pastor → Member" or "Parent → Adult Child" inside frontend code. We will learn. We may discover new categories, merge categories, or disable poorly performing ones. The taxonomy should be administratively manageable while protecting system-critical identifiers.

## 54. Safety and Appropriate Use

BoriSend should never become: harassment automation; stalking support; manipulative persuasion software; mass spam infrastructure; a substitute for professional therapy; a mechanism for circumventing someone's request for no contact. Relationship strengthening must remain respectful of the other person's autonomy.

## 55. Business Customer Opportunity

The architecture naturally supports future organisational use (Pastor → Members, Manager → Employees, Company → Customers, School → Parents, Association → Members, Charity → Supporters). Do not prematurely complicate launch with a huge enterprise system. Build the underlying data model so organisational expansion is possible later.

## 56. Launch Scope — Must Have

- BoriSend Profile
- BoriSend User ID
- Relationship taxonomy
- Relationship Type
- Relationship State
- Relationship Goal
- Communication Plans
- Multiple recipients
- Recipient Unit accounting
- Plan Unit accounting
- One membership model
- Capacity add-ons
- Entitlement engine
- Relationship-aware plan creation
- Strategy-driven message preparation
- RC7 memory/preferences
- Existing scheduler
- User review/edit/send
- Analytics
- New human-centred UI/design system

## 57. Post-Launch / Controlled Introduction

- Deeper recipient-specific memory
- Advanced Reconnect programme
- Progress tracking
- Relationship insights
- Organisational accounts
- Team administration
- Bulk recipient management improvements
- Sophisticated outcome measurement
- Direct external LLM infrastructure

This prevents BoriSend 2.0 becoming an endless pre-launch project.

## 58. Proposed Core Data Relationships

```
User
 │
 ├── BoriSendProfile
 │
 ├── MembershipSubscription
 │     └── Entitlements
 │
 ├── Contacts
 │
 └── CommunicationPlans
       │
       ├── RelationshipType
       ├── RelationshipState
       ├── RelationshipGoal
       ├── RelationshipStrategy
       ├── CommunicationRhythm
       │
       └── PlanRecipients
              │
              ├── Contact
              ├── RecipientContext
              ├── RecipientMemory
              └── Messages
```

Supporting structures: RelationshipCategory; RelationshipType; RelationshipState; RelationshipGoal; CommunicationIntent; AddOnProduct; AddOnSubscription; Entitlement; EntitlementConsumption; GenerationLedger; Feedback; PreferenceProfile; AnalyticsEvent.

## 59. Critical Data Ownership Rule

- A contact is not the relationship.
- A recipient assignment is not the contact.
- A Communication Plan is not the relationship person.
- A message is not the relationship.

These must remain separate. That prevents the architectural problem of John appearing in multiple plans.

## 60. BoriSend's Emerging Moat

Long-term defensibility is unlikely to be "We can call an LLM and write an SMS." Anyone can do that. The more defensible asset is: **BoriSend understands different relationship contexts and can translate relationship goals into sustainable communication strategies while learning what works for each context.** Over time, the valuable layer becomes **Relationship Intelligence** — not merely AI-generated wording.

## 61. Commercial Model Summary

```
BORISEND MEMBERSHIP
Monthly / Annual
        │
        ├── Included Communication Plan Units
        │
        └── Included Recipient Units
                    │
                    ▼
             NEED MORE?
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
Additional Plan Units    Additional Recipient Units
        │                       │
        └───────────┬───────────┘
                    ▼
            Recurring by default
            Clearly disclosed
```

Future plans can be introduced without replacing this entitlement engine.

## 62. Infrastructure Summary

Following RC9, Base44 remains viable for BoriSend 2.0 at present. Current theoretical fixed automation consumption ~780 credits/month versus ~9,390 before RC9. No infrastructure migration is required before BoriSend 2.0 development. Retain portability as an architectural principle rather than making migration a launch dependency.

## 63. What We Should NOT Do Now

Do not:
- rebuild everything from scratch;
- migrate from Base44 merely because migration sounds more scalable;
- create five subscription tiers before customer evidence exists;
- hard-code relationship taxonomy;
- hard-code add-on prices;
- globally learn communication preferences;
- treat every recipient as a unique contact for billing;
- allow unlimited recipients inside one subscription unit;
- expose AI everywhere;
- redesign the scheduler again;
- implement the entire Reconnect service before core launch;
- run enormous Base44 verification suites after every sprint.

## 64. Implementation Strategy

Controlled, phased implementation:

- **RC10 — Foundation & Data Model:** Profiles, BoriSend ID, taxonomy and new relationship entities.
- **RC11 — Relationship-Aware Communication Plans:** New plan creation, states, goals, recipients and multi-recipient architecture.
- **RC12 — Entitlement & Membership Engine:** One membership, Plan Units, Recipient Units and capacity enforcement.
- **RC13 — Add-on Commerce:** Recipient/Plan add-ons, recurring behaviour, cancellation and over-capacity.
- **RC14 — Relationship Intelligence:** Strategy engine, communication intents and generation specification.
- **RC15 — Message Intelligence Integration:** Integrate relationship context with RC7 without breaking reuse/cost controls.
- **RC16 — Experience Redesign:** Human-centred UI, terminology, no-gradient design system, onboarding.
- **RC17 — Analytics & Pricing Intelligence:** Commercial measurement and admin visibility.
- **RC18 — Migration & Regression:** Migrate existing users/plans safely and perform controlled end-to-end validation.
- **RC19 — Store/Launch Readiness:** Privacy, store declarations, screenshots, descriptions, billing validation and release checks.

This numbering can change as implementation reveals dependencies.

## 65. Definition of BoriSend 2.0

When complete, we should be able to describe the product without mentioning SMS or AI first:

> **BoriSend helps you strengthen the relationships that matter by turning your relationship goals into thoughtful, consistent communication.**

Then explain the mechanism:

> BoriSend helps you create communication plans, prepares thoughtful messages based on each relationship and reminds you when it's time to reach out. You stay in control by reviewing and editing messages before they're sent.

That is a much stronger business than "Schedule AI-generated SMS messages."

## 66. Master Architecture Decision

**Locked direction:**

BoriSend is a relationship-strengthening and reconnection platform. Communication is the mechanism, Relationship Intelligence is the engine, and AI is an enabling technology rather than the product itself.

**Commercially:** One membership at launch, scalable through Communication Plan Units and Recipient Units, with recurring capacity add-ons and an entitlement architecture capable of supporting future pricing models.

**Technically:** Continue with Base44 following RC9, but maintain modular, portable business logic and reassess external infrastructure when real scale and economics justify it.

**Experientially:** Human relationships first. Technology second. No gradients. No generic AI aesthetic.