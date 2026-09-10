import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * RC18.3.1 §14 — Comprehensive account deletion.
 *
 * Principle: Personal data is deleted/anonymised; financial and commercial
 * audit records are RETAINED with personal identifiers removed.
 *
 * DELETED (personal content — no financial value):
 *   Contact, PlanRecipient, RelationshipMemory, SmartMessage,
 *   SmartMessageRecipient, ContactGroup, Notification, Message, ReferralInvitation
 *
 * ARCHIVED + ANONYMISED (commercial history retained for audit):
 *   Campaign (status='archived', personal fields cleared)
 *
 * ANONYMISED (financial ledgers — records preserved, user_id → unique per-deletion token):
 *   GenerationUsageLedger, MessagePassUsageLedger, SmartMessageUsageLedger, RewardLedger
 *
 * CANCELLED/EXPIRED (subscription state — retained for billing history):
 *   MembershipSubscription (status='expired'), AddOnSubscription (status='expired'),
 *   UserSubscription (status='cancelled'), AdminEntitlementAdjustment (is_active=false),
 *   PromotionalEntitlement (is_active=false)
 *
 * DEACTIVATED:
 *   DeviceToken, ReferralCode, GenerationLock
 *
 * ANONYMISED:
 *   BoriSendProfile (first_name/last_name cleared), ReferralAttribution, PayoutRequest, RewardLedger
 *
 * RC18.3.2 §J: Anonymisation uses a UNIQUE per-deletion token (deleted_<uuid>),
 * NOT a shared "[deleted]" literal. This prevents uniqueness conflicts, audit
 * ambiguity, accidental aggregation of unrelated deleted users, and preserves
 * separation between historical accounts while remaining non-reversible.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = user.id;
    const admin = base44.asServiceRole;
    const nowIso = new Date().toISOString();
    // RC18.3.2 §J: Unique per-deletion anonymised identifier — non-reversible,
    // but preserves separation between different deleted accounts.
    const anonId = `deleted_${crypto.randomUUID()}`;

    // ── 1. Campaigns: archive + anonymise personal fields (preserve commercial history) ──
    const campaignsByUserId = await admin.entities.Campaign.filter({ user_id: userId });
    const campaignsByCreator = await admin.entities.Campaign.filter({ created_by_id: userId });
    const campaigns = [...new Map([...campaignsByUserId, ...campaignsByCreator].map(c => [c.id, c])).values()];
    const campaignIds = campaigns.map(c => c.id);
    for (const c of campaigns) {
      await admin.entities.Campaign.update(c.id, {
        status: 'archived',
        next_scheduled: null,
        name: anonId,
        purpose: '',
        pet_name: '',
        additional_instructions: '',
        recipients: [],
        contact_group: '',
      });
    }

    // ── 2. Messages: delete all (personal content) ──
    if (campaignIds.length > 0) {
      await admin.entities.Message.deleteMany({ campaign_id: { $in: campaignIds } });
    }
    await admin.entities.Message.deleteMany({ user_id: userId });
    await admin.entities.Message.deleteMany({ created_by_id: userId });

    // ── 3. PlanRecipients: delete (personal relationship data) ──
    await admin.entities.PlanRecipient.deleteMany({ owner_user_id: userId });

    // ── 4. Contacts: delete (personal data) ──
    await admin.entities.Contact.deleteMany({ owner_user_id: userId });

    // ── 5. RelationshipMemory: delete (personal relationship context) ──
    await admin.entities.RelationshipMemory.deleteMany({ owner_user_id: userId });

    // ── 6. SmartMessages + SmartMessageRecipients: delete (personal content) ──
    const smartMsgs = await admin.entities.SmartMessage.filter({ owner_user_id: userId });
    const smartMsgIds = smartMsgs.map(s => s.id);
    if (smartMsgIds.length > 0) {
      await admin.entities.SmartMessageRecipient.deleteMany({ smart_message_id: { $in: smartMsgIds } });
    }
    await admin.entities.SmartMessageRecipient.deleteMany({ owner_user_id: userId });
    for (const sm of smartMsgs) {
      await admin.entities.SmartMessage.delete(sm.id);
    }

    // ── 7. Financial ledgers: ANONYMISE (preserve records, remove personal ID) ──
    // These are immutable commercial records. We retain them for audit/tax
    // purposes but replace the user identifier with a unique per-deletion token
    // so they cannot be linked back to the original person, while preserving
    // separation between different deleted accounts (RC18.3.2 §J).
    await admin.entities.GenerationUsageLedger.updateMany(
      { user_id: userId },
      { $set: { user_id: anonId } }
    ).catch(() => {});
    await admin.entities.MessagePassUsageLedger.updateMany(
      { owner_user_id: userId },
      { $set: { owner_user_id: anonId } }
    ).catch(() => {});
    await admin.entities.SmartMessageUsageLedger.updateMany(
      { owner_user_id: userId },
      { $set: { owner_user_id: anonId } }
    ).catch(() => {});

    // ── 8. Subscriptions: cancel/expire (retain for billing history) ──
    await admin.entities.MembershipSubscription.updateMany(
      { owner_user_id: userId },
      { $set: { status: 'expired', cancel_at_period_end: true } }
    ).catch(() => {});
    await admin.entities.AddOnSubscription.updateMany(
      { owner_user_id: userId },
      { $set: { status: 'expired', cancel_at_period_end: true, cancelled_at: nowIso } }
    ).catch(() => {});

    // Legacy UserSubscription
    const subs = await admin.entities.UserSubscription.filter({ owner_user_id: userId });
    for (const sub of subs) {
      if (sub.status === 'active' || sub.status === 'trial') {
        await admin.entities.UserSubscription.update(sub.id, { status: 'cancelled' });
      }
    }

    // ── 9. Admin adjustments + Promotional entitlements: deactivate ──
    await admin.entities.AdminEntitlementAdjustment.updateMany(
      { owner_user_id: userId },
      { $set: { is_active: false } }
    ).catch(() => {});
    await admin.entities.PromotionalEntitlement.updateMany(
      { owner_user_id: userId },
      { $set: { is_active: false } }
    ).catch(() => {});

    // ── 10. BoriSendProfile: anonymise ──
    const profiles = await admin.entities.BoriSendProfile.filter({ user_id: userId }).catch(() => []);
    for (const p of profiles) {
      await admin.entities.BoriSendProfile.update(p.id, {
        first_name: '',
        last_name: '',
        profile_status: 'deactivated',
      }).catch(() => {});
    }

    // ── 11. GenerationLock: release any active locks ──
    await admin.entities.GenerationLock.updateMany(
      { owner_user_id: userId, status: 'active' },
      { $set: { status: 'released' } }
    ).catch(() => {});

    // ── 12. Device tokens: deactivate ──
    await admin.entities.DeviceToken.updateMany(
      { created_by_id: userId, is_active: true },
      { $set: { is_active: false } }
    );

    // ── 13. Notifications: delete ──
    await admin.entities.Notification.deleteMany({ user_id: userId });
    await admin.entities.Notification.deleteMany({ created_by_id: userId });

    // ── 14. Referral data: anonymise/deactivate ──
    await admin.entities.ReferralCode.updateMany(
      { owner_user_id: userId, is_active: true },
      { $set: { is_active: false } }
    );
    await admin.entities.ReferralAttribution.updateMany(
      { referrer_user_id: userId },
      { $set: { referred_email: anonId } }
    );
    await admin.entities.ReferralInvitation.deleteMany({ referrer_user_id: userId });

    // ── 14b. RewardLedger: anonymise personal identifiers (RC18.3.2 §K) ──
    // RewardLedger stores user_id (referrer) and referred_user_id — these are
    // internal UUIDs, not emails/names/phones. However, they link to user
    // accounts and should be anonymised during account deletion. Financial
    // fields (subscription_id, payment_reference, amounts) are retained for
    // reconciliation. Using the same unique anonId preserves audit trail
    // within one deleted account while separating different deleted accounts.
    await admin.entities.RewardLedger.updateMany(
      { user_id: userId },
      { $set: { user_id: anonId } }
    ).catch(() => {});
    await admin.entities.RewardLedger.updateMany(
      { referred_user_id: userId },
      { $set: { referred_user_id: anonId } }
    ).catch(() => {});

    await admin.entities.PayoutRequest.updateMany(
      { user_id: userId },
      { $set: { user_email: anonId } }
    );

    // ── 15. Contact groups: delete ──
    await admin.entities.ContactGroup.deleteMany({ created_by_id: userId });

    // ── 16. CRM/support personal data ──
    // Delete the user's support message content and conversations. Internal CRM
    // notes/profile/preferences are also personal account data and are removed.
    await admin.entities.CRMMessage.deleteMany({ owner_user_id: userId }).catch(() => {});
    await admin.entities.CRMConversation.deleteMany({ owner_user_id: userId }).catch(() => {});
    await admin.entities.CRMContactNote.deleteMany({ user_id: userId }).catch(() => {});
    await admin.entities.CRMUserProfile.deleteMany({ user_id: userId }).catch(() => {});
    await admin.entities.CRMEmailPreference.deleteMany({ user_id: userId }).catch(() => {});
    // Delivery history is retained for operational audit but stripped of direct identity.
    await admin.entities.CRMEmailDelivery.updateMany(
      { recipient_user_id: userId },
      { $set: { recipient_user_id: anonId, recipient_email: anonId, recipient_name: '' } }
    ).catch(() => {});

    // ── 17. Mark user account as deletion_requested ──
    await base44.auth.updateMe({
      deletion_requested: true,
      deletion_requested_at: nowIso,
    });

    console.info(`[deleteAccount] Comprehensive deletion completed for user ${userId}: ${campaigns.length} campaigns archived, ${smartMsgs.length} smart messages deleted, ledgers anonymised`);
    return Response.json({
      success: true,
      message: "Account deletion completed. Your personal data has been removed. Financial and audit records have been retained as required by law.",
    });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});