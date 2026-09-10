/**
 * RC15 Pending Message Resolution
 *
 * Determines whether a prepared message is "unresolved" (still needs user
 * decision) and whether generation should be blocked for a given
 * Communication Plan / PlanRecipient.
 *
 * Unresolved = status is 'pending' (awaiting approval/review).
 * Resolving actions: approve, edit+accept, skip, delete, send.
 *
 * Blocking scope:
 *   personalised → per PlanRecipient (one recipient's pending does not block another)
 *   shared      → per Campaign (one unresolved shared message blocks the stream)
 */

import { deriveRecipientId } from './generation-key.ts';

/** Statuses that represent an unresolved prepared message. */
export const UNRESOLVED_STATUSES = ['pending'] as const;

/** Statuses that represent a resolved message (user has acted). */
export const RESOLVED_STATUSES = ['approved', 'sent', 'skipped', 'failed'] as const;

export interface UnresolvedCheck {
  hasUnresolved: boolean;
  unresolvedCount: number;
  unresolvedMessageIds: string[];
}

/**
 * Check for unresolved messages for a specific campaign + recipient.
 * Used for personalised mode (per PlanRecipient blocking).
 */
export async function checkUnresolvedForRecipient(
  base44: any,
  campaignId: string,
  recipientId: string
): Promise<UnresolvedCheck> {
  const messages = await base44.asServiceRole.entities.Message.filter({
    campaign_id: campaignId,
    status: 'pending',
  });

  const unresolved = messages.filter((m: any) => {
    // Match by recipient_id derived from recipient_name/phone
    const mRecipientId = deriveRecipientId({ name: m.recipient_name, phone: m.recipient_phone });
    return mRecipientId === recipientId;
  });

  return {
    hasUnresolved: unresolved.length > 0,
    unresolvedCount: unresolved.length,
    unresolvedMessageIds: unresolved.map((m: any) => m.id),
  };
}

/**
 * Check for unresolved messages across an entire campaign.
 * Used for shared mode (one stream blocks all) and for plan-level display.
 */
export async function checkUnresolvedForCampaign(
  base44: any,
  campaignId: string
): Promise<UnresolvedCheck> {
  const messages = await base44.asServiceRole.entities.Message.filter({
    campaign_id: campaignId,
    status: 'pending',
  });

  return {
    hasUnresolved: messages.length > 0,
    unresolvedCount: messages.length,
    unresolvedMessageIds: messages.map((m: any) => m.id),
  };
}

/**
 * Check unresolved per recipient for personalised mode.
 * Returns a map of recipientId → UnresolvedCheck so the scheduler can
 * block only blocked recipients and proceed with eligible ones.
 */
export async function checkUnresolvedPerRecipient(
  base44: any,
  campaignId: string,
  recipients: Array<{ name: string; phone?: string }>
): Promise<Record<string, UnresolvedCheck>> {
  const messages = await base44.asServiceRole.entities.Message.filter({
    campaign_id: campaignId,
    status: 'pending',
  });

  const result: Record<string, UnresolvedCheck> = {};
  for (const r of recipients) {
    const recipientId = deriveRecipientId(r);
    const unresolved = messages.filter((m: any) => {
      const mRecipientId = deriveRecipientId({ name: m.recipient_name, phone: m.recipient_phone });
      return mRecipientId === recipientId;
    });
    result[recipientId] = {
      hasUnresolved: unresolved.length > 0,
      unresolvedCount: unresolved.length,
      unresolvedMessageIds: unresolved.map((m: any) => m.id),
    };
  }
  return result;
}

/**
 * Check for unresolved messages for a specific campaign + PlanRecipient.
 * Authoritative personalised scoping (RC15.1).
 *
 * Matching rule:
 *   - If the message carries Message.plan_recipient_id, match it exactly.
 *   - Else (legacy message without the field), fall back to a name/phone
 *     identity derived from the PlanRecipient's Contact, so historical
 *     pending messages still block until resolved.
 *
 * The PlanRecipient.id is stable across Contact name/phone changes, so
 * identity remains correct even when the Contact is later edited.
 */
export async function checkUnresolvedForPlanRecipient(
  base44: any,
  campaignId: string,
  planRecipientId: string,
  fallbackRecipient: { name?: string; phone?: string } = {}
): Promise<UnresolvedCheck> {
  const messages = await base44.asServiceRole.entities.Message.filter({
    campaign_id: campaignId,
    status: 'pending',
  });

  const fallbackId =
    fallbackRecipient && (fallbackRecipient.name || fallbackRecipient.phone)
      ? deriveRecipientId(fallbackRecipient as any)
      : null;

  const unresolved = messages.filter((m: any) => {
    if (m.plan_recipient_id) {
      return m.plan_recipient_id === planRecipientId;
    }
    if (fallbackId) {
      return (
        deriveRecipientId({ name: m.recipient_name, phone: m.recipient_phone }) ===
        fallbackId
      );
    }
    return false;
  });

  return {
    hasUnresolved: unresolved.length > 0,
    unresolvedCount: unresolved.length,
    unresolvedMessageIds: unresolved.map((m: any) => m.id),
  };
}

/**
 * Check unresolved per PlanRecipient for personalised mode (batch).
 * Returns a map keyed by plan_recipient_id (or deriveRecipientId fallback for
 * legacy recipient instances that have no PlanRecipient).
 *
 * Each recipient entry may carry:
 *   - plan_recipient_id: authoritative PlanRecipient.id (preferred), OR
 *   - name/phone only (legacy compatibility — no PlanRecipient synced)
 */
export async function checkUnresolvedPerPlanRecipient(
  base44: any,
  campaignId: string,
  recipients: Array<{ plan_recipient_id: string | null; name?: string; phone?: string }>
): Promise<Record<string, UnresolvedCheck>> {
  const messages = await base44.asServiceRole.entities.Message.filter({
    campaign_id: campaignId,
    status: 'pending',
  });

  const result: Record<string, UnresolvedCheck> = {};
  for (const r of recipients) {
    const key = r.plan_recipient_id || deriveRecipientId(r as any);
    const fallbackId = r.name || r.phone ? deriveRecipientId(r as any) : null;

    const unresolved = messages.filter((m: any) => {
      if (r.plan_recipient_id) {
        // Authoritative match on Message.plan_recipient_id
        if (m.plan_recipient_id) {
          return m.plan_recipient_id === r.plan_recipient_id;
        }
        // Legacy message without plan_recipient_id — name/phone fallback
        if (fallbackId) {
          return (
            deriveRecipientId({ name: m.recipient_name, phone: m.recipient_phone }) ===
            fallbackId
          );
        }
        return false;
      }
      // Legacy recipient instance (no plan_recipient_id) — name/phone match only
      if (fallbackId) {
        return (
          deriveRecipientId({ name: m.recipient_name, phone: m.recipient_phone }) ===
          fallbackId
        );
      }
      return false;
    });

    result[key] = {
      hasUnresolved: unresolved.length > 0,
      unresolvedCount: unresolved.length,
      unresolvedMessageIds: unresolved.map((m: any) => m.id),
    };
  }
  return result;
}

/**
 * Determine whether a message status is unresolved.
 */
export function isUnresolved(status: string): boolean {
  return (UNRESOLVED_STATUSES as readonly string[]).includes(status);
}

/**
 * Build a deterministic reminder notification body for a pending message.
 * No LLM — uses template strings.
 */
export function buildReminderNotification(recipientName: string, campaignName: string): {
  title: string;
  body: string;
} {
  const display = recipientName && recipientName !== 'Friend' ? recipientName : 'your contact';
  return {
    title: 'Message waiting for your review',
    body: `Your message for ${display} is still waiting. Review, edit, approve or skip it before BoriSend prepares the next one.`,
  };
}