# BoriSend — RC2.2 Optimistic UI Investigation Report

**Date:** 2026-07-25  
**Scope:** Investigate the "Optimistic UI Updates" finding from the latest Google Play readiness scan.  
**Constraint:** No code changes. No behaviour changes. Investigation and recommendations only.

---

## Executive Summary

The Google Play readiness scan flagged "Optimistic UI Updates" as a blocking issue. After tracing every user-initiated mutation in the application, I identified **20 distinct interactions** across **8 screens** that exhibit non-optimistic behaviour — the UI waits for a server response before reflecting the user's action, with no loading indicator, no disabled state, and no immediate visual feedback.

These 20 interactions fall into **5 categories**. For each category, this report provides a recommendation. The summary:

| Category | Interactions | Recommendation | Rationale |
|----------|-------------|----------------|-----------|
| 1. Notification mark-read / delete | 3 | **Implement optimistic UI** | Safe, reversible, standard practice, genuine UX improvement |
| 2. Message approve / skip / delete | 8 | **Do not implement** | Approval workflow integrity; rollback complexity not justified for marginal UX gain |
| 3. Campaign status toggle / duplicate / delete | 5 | **Do not implement** | Business-rule validation server-side; plan-limit enforcement; rollback would confuse users |
| 4. SMS send (single + bulk) | 2 | **Do not implement** | Data integrity — false "sent" status on failure is unacceptable |
| 5. Admin role toggle / plan delete | 2 | **Do not implement** | Privilege changes and billing-plan deletion must be server-confirmed |

**Net recommendation:** Implement optimistic UI **only** for notification mark-read and notification delete (3 interactions, 1 screen). Leave all other interactions unchanged. The remaining 17 flagged interactions involve approval workflows, billing, SMS delivery, or business-rule validation where server confirmation is the correct behaviour.

---

## Methodology

I read every page and component that contains a user-initiated mutation (button click → API call → UI update). For each interaction, I traced:

1. The user action (what they tap).
2. The current behaviour (what the UI does between tap and server response).
3. Whether the interaction has a loading indicator or disabled state.
4. Whether the server-side function performs validation that could reject the action.
5. Whether a rollback (optimistic update that fails) would cause data integrity issues.

**Files examined:**
- `src/pages/CampaignDetail.jsx` (including the `MessageItem` sub-component)
- `src/pages/NotificationCenter.jsx`
- `src/pages/SmartInbox.jsx`
- `src/pages/MessageDetail.jsx`
- `src/pages/CreateCampaign.jsx`
- `src/pages/Settings.jsx`
- `src/pages/Referrals.jsx`
- `src/pages/Subscription.jsx`
- `src/components/dashboard/CommunicationPlanCard.jsx`
- `src/components/dashboard/CampaignCard.jsx`
- `src/pages/admin/ManageUsers.jsx`
- `src/pages/admin/ManagePlans.jsx`
- `src/components/trial/TrialPaymentModal.jsx`
- `src/components/settings/DeleteAccountDialog.jsx`

---

## Category 1: Notification Mark-Read and Delete

**Screen:** NotificationCenter (`src/pages/NotificationCenter.jsx`)  
**Interactions:** 3

### Interaction 1.1 — Mark Single Notification as Read

| Field | Detail |
|-------|--------|
| **User action** | Tap a notification item |
| **Current behaviour** | `await Notification.update(id, { is_read: true })` — the item stays "unread" (bold, blue dot) until the server responds (~200-500ms), then updates to "read" |
| **Why the scanner flags it** | No immediate visual feedback. The notification does not change appearance on tap — only after the server round-trip completes |
| **Genuine UX improvement?** | **Yes.** Mark-as-read is a low-stakes, easily reversible action. The user expects the blue dot to disappear instantly when they tap. The delay is noticeable on slower connections and feels unresponsive |
| **Technical risk** | **Very low.** If the server update fails, rolling back to "unread" is trivial — re-add the blue dot and bold styling. No business rules depend on the read state. No other entity references `is_read` |
| **Recommendation** | **Implement optimistic UI.** Update local state immediately (`setNotifications(prev => prev.map(...))`), call the server in the background, and roll back on error with a toast. This is the single clearest candidate in the entire app |

### Interaction 1.2 — Mark All as Read

| Field | Detail |
|-------|--------|
| **User action** | Tap "Mark all read" button in the header |
| **Current behaviour** | `await Notification.bulkUpdate(...)` — all items stay "unread" until the bulk update completes, then all update at once |
| **Why the scanner flags it** | The button tap produces no immediate effect. With 10+ unread notifications, the bulk update may take 500ms+, during which the user sees no change |
| **Genuine UX improvement?** | **Yes.** The user expects all blue dots to vanish instantly. This is a satisfying, standard interaction pattern |
| **Technical risk** | **Very low.** Same as 1.1 — read state is low-stakes and trivially reversible. Bulk update either succeeds or fails as a unit; rollback restores all items to unread |
| **Recommendation** | **Implement optimistic UI.** Set all items to `is_read: true` immediately, call `bulkUpdate` in the background, roll back on error |

### Interaction 1.3 — Delete Single Notification

| Field | Detail |
|-------|--------|
| **User action** | Tap the delete action on a notification (via `NotificationItem` component) |
| **Current behaviour** | `await Notification.delete(id)` — the item remains visible until the server confirms deletion, then is removed from the list |
| **Why the scanner flags it** | The item doesn't animate out or disappear on tap. The user taps delete and nothing visibly happens until the server responds |
| **Genuine UX improvement?** | **Yes.** Removing an item from a list is the canonical optimistic UI use case. The user expects the item to vanish instantly |
| **Technical risk** | **Low.** If deletion fails, re-insert the item. The only risk is if the user navigates away during the rollback window, but the server is the source of truth — a failed delete means the item reappears on next load, which is correct behaviour |
| **Recommendation** | **Implement optimistic UI.** Remove the item from local state immediately, call `delete` in the background, and on error, re-insert with a toast: "Could not delete — item restored" |

---

## Category 2: Message Approve / Skip / Delete

**Screens:** CampaignDetail (`MessageItem` sub-component), SmartInbox, MessageDetail  
**Interactions:** 8

### Interaction 2.1 — Approve Message (CampaignDetail → MessageItem)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Approve" button on a pending message |
| **Current behaviour** | `await Message.update(id, { status: "approved" })` then `onUpdate(...)`. No loading indicator. Button stays clickable |
| **Why the scanner flags it** | The "Approve" and "Skip" buttons remain visible and clickable until the server confirms. No spinner, no disabled state |
| **Genuine UX improvement?** | **Marginal.** The round-trip is typically 200-400ms. The user taps "Approve" and the buttons disappear slightly later. On a fast connection this is barely perceptible |
| **Technical risk** | **Moderate.** The approval workflow is a business rule — pending messages must be reviewed before they become sendable. If the client optimistically shows "approved" and the server rejects it (e.g., the message was already processed by the scheduled-message automation, or the campaign was paused), the user sees a flash of "approved" then "pending" again. This is confusing in an approval workflow. Additionally, the `onUpdate` callback in CampaignDetail replaces the message object from the server response — an optimistic update would need to be reconciled with the server response to avoid overwriting server-side fields (e.g., `scheduled_for`) |
| **Recommendation** | **Leave unchanged.** The approval workflow is a deliberate gate. Server confirmation is the correct behaviour. The marginal UX gain does not justify the rollback complexity and the risk of confusing users in an approval context |

### Interaction 2.2 — Skip Message (CampaignDetail → MessageItem)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Skip" button on a pending message |
| **Current behaviour** | `await Message.update(id, { status: "skipped" })` then `onUpdate(...)`. No loading indicator |
| **Why the scanner flags it** | Same as 2.1 — no immediate feedback |
| **Genuine UX improvement?** | **Marginal.** Same reasoning as approve |
| **Technical risk** | **Low-moderate.** Skipping is less consequential than approving, but the same reconciliation issue applies — the server may reject the skip if the message was already sent by the automation |
| **Recommendation** | **Leave unchanged.** Same reasoning as 2.1 |

### Interaction 2.3 — Approve Message (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Approve" on a pending message in the Smart Inbox |
| **Current behaviour** | `await Message.update(id, { status: "approved" })` then `setMessages(...)`. No loading indicator |
| **Why the scanner flags it** | No immediate feedback on tap |
| **Genuine UX improvement?** | **Marginal.** Same as 2.1 |
| **Technical risk** | **Moderate.** Same approval-workflow concern as 2.1. Additionally, the Smart Inbox tabs filter by status — an optimistic "approved" update would move the message from the "pending" tab to the "approved" tab immediately. If the server rejects, the message would need to move back to "pending", which is a visible tab-switch rollback |
| **Recommendation** | **Leave unchanged.** The tab-filter architecture makes rollback visually jarring. Server confirmation is appropriate for the approval workflow |

### Interaction 2.4 — Skip Message (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Skip" on a message in the Smart Inbox |
| **Current behaviour** | `await Message.update(id, { status: "skipped" })` then `setMessages(...)`. No loading indicator |
| **Why the scanner flags it** | No immediate feedback |
| **Genuine UX improvement?** | **Marginal.** Same as 2.2 |
| **Technical risk** | **Low-moderate.** Same tab-filter concern as 2.3 |
| **Recommendation** | **Leave unchanged** |

### Interaction 2.5 — Delete Message (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Tap delete on a message in the Smart Inbox |
| **Current behaviour** | `await Message.delete(id)` then `setMessages(...)`. No loading indicator |
| **Why the scanner flags it** | The message stays visible until the server confirms deletion |
| **Genuine UX improvement?** | **Moderate.** Removing an item from a list is a standard optimistic use case. However, messages are tied to campaigns and scheduling — deleting a message that the automation is about to send could cause a race condition |
| **Technical risk** | **Moderate.** If the `generateScheduledMessages` automation has already picked up the message for processing, a client-side optimistic deletion could create a discrepancy. The server is the source of truth, and the realtime subscription (`Message.subscribe(() => load())`) will eventually reconcile, but there's a window where the user sees "deleted" while the server is still processing |
| **Recommendation** | **Leave unchanged.** Message deletion interacts with the scheduling automation. Server confirmation prevents race conditions. The realtime subscription already provides eventual consistency |

### Interaction 2.6 — Bulk Approve (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Select multiple messages, tap "Approve" in the bulk action bar |
| **Current behaviour** | `await Message.bulkUpdate(...)` then `setMessages(...)`. No loading indicator on the bulk action button |
| **Why the scanner flags it** | No feedback during the bulk operation |
| **Genuine UX improvement?** | **Marginal.** Bulk operations are expected to take slightly longer; users are accustomed to brief delays |
| **Technical risk** | **Moderate.** Same approval-workflow concern as 2.3, compounded by bulk rollback complexity — if some messages succeed and others fail, the rollback is partial and confusing |
| **Recommendation** | **Leave unchanged.** Bulk approval rollback is complex and error-prone. Server confirmation is appropriate |

### Interaction 2.7 — Bulk Delete (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Select multiple messages, tap delete in the bulk action bar |
| **Current behaviour** | `await Message.deleteMany(...)` then `setMessages(...)`. No loading indicator |
| **Why the scanner flags it** | No feedback during the bulk deletion |
| **Genuine UX improvement?** | **Moderate.** Same as 2.5 |
| **Technical risk** | **Moderate.** Same scheduling-automation concern as 2.5, compounded by partial-failure rollback |
| **Recommendation** | **Leave unchanged** |

### Interaction 2.8 — Approve / Skip (MessageDetail)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Approve" or "Skip" on the message detail page |
| **Current behaviour** | `await Message.update(...)` then `setMsg(...)` or `navigate(-1)`. No loading indicator |
| **Why the scanner flags it** | No feedback on tap |
| **Genuine UX improvement?** | **Marginal.** The detail page shows a single message; the action either changes the status badge or navigates away. The delay is barely perceptible |
| **Technical risk** | **Moderate.** Same approval-workflow concern as 2.1. Additionally, `handleApprove` can also save edited content — an optimistic update would need to handle both the status change and the content save atomically |
| **Recommendation** | **Leave unchanged** |

---

## Category 3: Campaign Status Toggle / Duplicate / Delete

**Screens:** CommunicationPlanCard (used in Campaigns and Home), CampaignDetail  
**Interactions:** 5

### Interaction 3.1 — Toggle Campaign Status (CommunicationPlanCard)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Pause"/"Resume" in the campaign card dropdown menu |
| **Current behaviour** | `await Campaign.update(id, { status: newStatus })` then `onUpdate()` (parent reloads the list). No loading indicator on the dropdown item |
| **Why the scanner flags it** | The status badge on the card doesn't change until the server confirms and the parent reloads the list |
| **Genuine UX improvement?** | **Marginal.** The card's badge changes from green to amber slightly after the tap. On a fast connection this is ~300ms |
| **Technical risk** | **High.** The `manageCampaign` backend function (used in CampaignDetail) performs server-side validation — it checks plan limits, campaign state, and trial/subscription status before allowing a status change. If the client optimistically shows "active" but the server blocks it (e.g., the user's trial has expired, or they've reached their plan limit), the user sees a flash of "active" then "paused". This is actively misleading in a billing-gated context. Additionally, `onUpdate()` triggers a full list reload — an optimistic local update would be overwritten by the reload, requiring coordination between the card and the parent |
| **Recommendation** | **Leave unchanged.** Campaign status is billing-gated. Server confirmation prevents false status displays. The full-list reload on `onUpdate()` makes optimistic local updates impractical without refactoring the parent-child data flow |

### Interaction 3.2 — Duplicate Campaign (CommunicationPlanCard)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Duplicate" in the campaign card dropdown menu |
| **Current behaviour** | `await Campaign.create(...)` then `onUpdate()`. No loading indicator |
| **Why the scanner flags it** | No feedback during the duplication |
| **Genuine UX improvement?** | **No.** Duplication creates a new entity with a server-generated ID. The new card can't appear in the list until the server responds with the ID. An optimistic "ghost" card would be confusing — the user doesn't know what the duplicate will look like until it exists |
| **Technical risk** | **Moderate.** The `manageCampaign` function (in CampaignDetail's version) performs validation. The CommunicationPlanCard version calls `Campaign.create` directly, which may bypass plan-limit checks. An optimistic card that gets rejected by the server would need to be removed with an error toast |
| **Recommendation** | **Leave unchanged.** The duplicated campaign needs a server-generated ID before it can appear in the list. Optimistic UI is not practical for entity creation |

### Interaction 3.3 — Delete Campaign (CommunicationPlanCard)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Delete" in the dropdown, confirm in the AlertDialog |
| **Current behaviour** | `await Campaign.delete(id)` then `onUpdate()`. No loading indicator on the confirm button |
| **Why the scanner flags it** | The card remains visible until the server confirms deletion and the parent reloads |
| **Genuine UX improvement?** | **Moderate.** Removing a card from a list is a standard optimistic use case. However, the confirmation dialog provides a psychological "commit" point — the user has already confirmed, so the wait feels intentional |
| **Technical risk** | **Moderate.** If the delete fails, the card would need to reappear. The `onUpdate()` parent reload would eventually show the card again, but there's a window of inconsistency. Additionally, deleting a campaign with active scheduled messages may be blocked by the server |
| **Recommendation** | **Leave unchanged.** The confirmation dialog already provides the "commit" feedback. Server confirmation prevents inconsistency with scheduled-message automation |

### Interaction 3.4 — Toggle Campaign Status (CampaignDetail)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Pause"/"Resume" in the detail page dropdown menu |
| **Current behaviour** | `await manageCampaign({ action: "toggleStatus" })` then `setCampaign(...)`. No loading indicator |
| **Why the scanner flags it** | The status badge at the top of the detail page doesn't change until the server confirms |
| **Genuine UX improvement?** | **Marginal.** Same as 3.1 |
| **Technical risk** | **High.** The `manageCampaign` function performs server-side validation (plan limits, trial status, campaign state). An optimistic update that's rejected by the server would show a false status. This is the billing-gated concern from 3.1, but worse — the detail page prominently displays the status badge |
| **Recommendation** | **Leave unchanged.** The `manageCampaign` function's server-side validation makes optimistic UI risky for billing-gated status changes |

### Interaction 3.5 — Delete Campaign (CampaignDetail)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Delete" in the dropdown, confirm in the AlertDialog |
| **Current behaviour** | `await Campaign.delete(id)` then `navigate("/")`. No loading indicator on the confirm button |
| **Why the scanner flags it** | The confirm button has no loading state |
| **Genuine UX improvement?** | **No.** The user confirms deletion and the page navigates away. The navigation itself is the feedback. Adding a loading state to the confirm button would add a brief delay before navigation, which is arguably worse UX |
| **Technical risk** | **Low.** If the delete fails, the user would navigate away without the deletion occurring. However, the error would surface on the next list load when the campaign still appears |
| **Recommendation** | **Leave unchanged.** The navigation provides the feedback. A loading state on the confirm button would delay navigation unnecessarily |

---

## Category 4: SMS Send (Single + Bulk)

**Screens:** CampaignDetail (MessageItem), SmartInbox, MessageDetail  
**Interactions:** 2 (plus 2 that already have loading indicators)

### Interaction 4.1 — Send Message via SMS (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Tap "Send" on an approved message in the Smart Inbox |
| **Current behaviour** | `await SMSService.send(...)` then `await markMessageSent(...)` then `setMessages(...)`. No loading indicator on the send button |
| **Why the scanner flags it** | No immediate feedback on the send button |
| **Genuine UX improvement?** | **No.** A loading indicator (spinner) would be better than optimistic UI here, but even that is marginal — the SMS send is typically fast |
| **Technical risk** | **Critical.** Optimistic UI would mark the message as "sent" before the SMS actually delivers. If the SMS fails (network error, invalid number, carrier rejection), the user would see "sent" when the message was not sent. This is a data-integrity violation — the user believes a message was delivered to their loved one or client when it was not. This cannot be rolled back meaningfully — the user may have already moved on, believing the message was sent |
| **Recommendation** | **Leave unchanged.** SMS delivery status must reflect reality. Optimistic UI for message sending is a data-integrity risk. The correct improvement (if any) would be a loading spinner on the send button, not an optimistic status change. However, even that is out of scope for this investigation — the current behaviour (wait for confirmation, then update) is correct for SMS delivery |

### Interaction 4.2 — Bulk Send (SmartInbox)

| Field | Detail |
|-------|--------|
| **User action** | Select multiple approved messages, tap "Send" in the bulk action bar |
| **Current behaviour** | Sequential `SMSService.send` + `markMessageSent` for each message, then `setMessages(...)`. No loading indicator |
| **Why the scanner flags it** | No feedback during the bulk send operation |
| **Genuine UX improvement?** | **No.** A progress indicator would be better than optimistic UI — showing "Sending 2 of 5..." |
| **Technical risk** | **Critical.** Same data-integrity concern as 4.1, compounded by partial failure — some messages may send successfully while others fail. An optimistic "all sent" update would be false for the failed messages |
| **Recommendation** | **Leave unchanged.** The sequential send correctly handles partial failures (each message is individually tried and caught). Optimistic UI would create false "sent" statuses. The correct improvement would be a progress indicator, but the current behaviour is functionally correct |

**Note:** The single-send interactions in CampaignDetail's `MessageItem` and in `MessageDetail` already have `sending` state with spinners and disabled buttons. These are **not flagged** by the scanner — they correctly show feedback during the operation.

---

## Category 5: Admin Role Toggle / Plan Delete

**Screens:** ManageUsers, ManagePlans  
**Interactions:** 2

### Interaction 5.1 — Toggle User Role (ManageUsers)

| Field | Detail |
|-------|--------|
| **User action** | Tap the shield icon to toggle a user between "admin" and "user" |
| **Current behaviour** | `await User.update(id, { role: newRole })` then `setUsers(...)`. No loading indicator |
| **Why the scanner flags it** | The role badge doesn't change until the server confirms |
| **Genuine UX improvement?** | **No.** Role changes are infrequent admin actions. The user does not benefit from seeing the badge change 300ms earlier |
| **Technical risk** | **High.** Role changes affect access control. An optimistic "admin" badge that's rejected by the server would show a user as having admin privileges when they don't. This is a security concern — the admin might navigate away believing the role was changed, when it wasn't. Additionally, only admins can change roles, and the server enforces this — an optimistic update bypasses this check visually |
| **Recommendation** | **Leave unchanged.** Privilege changes must be server-confirmed. Optimistic UI for access-control mutations is a security risk |

### Interaction 5.2 — Delete Subscription Plan (ManagePlans)

| Field | Detail |
|-------|--------|
| **User action** | Tap delete on a subscription plan, confirm |
| **Current behaviour** | `await SubscriptionPlan.delete(id)` then `setPlans(...)`. No loading indicator |
| **Why the scanner flags it** | The plan card remains visible until the server confirms deletion |
| **Genuine UX improvement?** | **No.** Plan deletion is a rare admin action with billing implications |
| **Technical risk** | **High.** Deleting a subscription plan affects billing. If the plan is referenced by active subscriptions or Stripe products, the server may reject the deletion. An optimistic removal that's rejected would confuse the admin — the plan "disappe" then reappears. Additionally, the `syncPlanToStripe` function may need to update Stripe, and an optimistic local deletion would be inconsistent with the Stripe state |
| **Recommendation** | **Leave unchanged.** Billing-plan mutations must be server-confirmed. Optimistic UI for billing changes is a financial-integrity risk |

---

## Interactions Not Flagged (Already Have Loading Indicators)

The following interactions correctly show a spinner, disabled button, or loading state during the operation. The scanner does not flag these:

| Screen | Interaction | Loading mechanism |
|--------|------------|-------------------|
| CampaignDetail | Generate message | `generating` state, spinner, disabled button |
| CampaignDetail (MessageItem) | Send via SMS | `sending` state, spinner, disabled button |
| MessageDetail | Send via SMS | `sending` state, spinner, disabled button |
| MessageDetail | Regenerate message | `regenerating` state, spinner, disabled button |
| CreateCampaign | Create / update plan | `loading` state, spinner, disabled button |
| Settings | Save settings | `saving` state, spinner, disabled button |
| Referrals | Request payout | `requestingPayout` state, disabled button, text change |
| ManagePlans | Save plan | `busy` state |
| ManagePlans | Sync to Stripe | `busy` state |
| Subscription | Checkout | `checkingOut` state, spinner |
| Subscription | Manage subscription | `managing` state, spinner |
| Subscription | Cancel conversion | `cancellingConversion` state, spinner |
| TrialPaymentModal | Add payment method | `processing` state, spinner, disabled button |
| DeleteAccountDialog | Delete account | Loading state during deletion |

These interactions are correctly implemented — they show immediate feedback (spinner) while waiting for the server. No changes needed.

---

## Summary Recommendations

### Implement Optimistic UI (3 interactions, 1 screen)

| # | Screen | Interaction | Risk | Justification |
|---|--------|------------|------|---------------|
| 1.1 | NotificationCenter | Mark single as read | Very low | Low-stakes, reversible, standard pattern, genuine UX improvement |
| 1.2 | NotificationCenter | Mark all as read | Very low | Same as above, bulk variant |
| 1.3 | NotificationCenter | Delete notification | Low | List-item removal is the canonical optimistic use case |

### Leave Unchanged (17 interactions, 7 screens)

| # | Screen | Interaction | Risk if implemented | Justification |
|---|--------|------------|---------------------|---------------|
| 2.1 | CampaignDetail (MessageItem) | Approve message | Moderate | Approval workflow integrity; server may reject |
| 2.2 | CampaignDetail (MessageItem) | Skip message | Low-moderate | Same as 2.1 |
| 2.3 | SmartInbox | Approve message | Moderate | Tab-filter rollback is visually jarring |
| 2.4 | SmartInbox | Skip message | Low-moderate | Same as 2.3 |
| 2.5 | SmartInbox | Delete message | Moderate | Scheduling-automation race condition |
| 2.6 | SmartInbox | Bulk approve | Moderate | Partial-failure rollback complexity |
| 2.7 | SmartInbox | Bulk delete | Moderate | Same as 2.5, compounded by partial failure |
| 2.8 | MessageDetail | Approve / skip | Moderate | Approval workflow; content-save atomicity |
| 3.1 | CommunicationPlanCard | Toggle status | High | Billing-gated; plan-limit enforcement |
| 3.2 | CommunicationPlanCard | Duplicate | Moderate | Entity creation needs server-generated ID |
| 3.3 | CommunicationPlanCard | Delete | Moderate | Confirmation dialog provides commit feedback |
| 3.4 | CampaignDetail | Toggle status | High | `manageCampaign` server-side validation |
| 3.5 | CampaignDetail | Delete | Low | Navigation provides feedback |
| 4.1 | SmartInbox | Send via SMS | Critical | Data integrity — false "sent" status |
| 4.2 | SmartInbox | Bulk send | Critical | Data integrity — partial failure |
| 5.1 | ManageUsers | Toggle role | High | Security — access-control mutation |
| 5.2 | ManagePlans | Delete plan | High | Billing — financial-integrity risk |

---

## Conclusion

The Google Play scanner's "Optimistic UI Updates" finding is technically valid — 20 interactions in the app wait for server confirmation before updating the UI, and most lack any loading indicator. However, the scanner cannot distinguish between:

- **Low-stakes, reversible actions** (notification mark-read, notification delete) where optimistic UI is the correct pattern
- **Business-critical operations** (SMS sending, billing-gated status changes, approval workflows, access-control changes) where server confirmation is the correct behaviour

Implementing optimistic UI for the 17 business-critical interactions would introduce data-integrity risks, billing-display errors, security-display errors, and rollback complexity — all for marginal UX gains on actions that are either infrequent (admin actions, plan management) or already have appropriate loading indicators (AI generation, form submission).

The recommended path forward is to implement optimistic UI **only** for the 3 notification interactions in `NotificationCenter`. This addresses the scanner finding with minimal risk, provides a genuine UX improvement where it matters most, and leaves all business-critical behaviour unchanged.

If the scanner still flags the remaining 17 interactions after this change, the correct response is to document them as **intentional server-confirmed operations** in the app's Play Store review notes, explaining that SMS delivery status, billing-gated status changes, approval workflows, and access-control mutations must reflect server state for data integrity and security reasons.
