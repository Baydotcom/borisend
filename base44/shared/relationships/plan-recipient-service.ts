/**
 * Base44-specific repository + portable service for Plan Recipients.
 *
 * A Plan Recipient connects a Communication Plan (Campaign) to a Contact and
 * carries plan-specific relationship context (type, state, goal, context).
 * The same Contact may have multiple Plan Recipient records across different
 * plans. This is the foundation for the future rule:
 *   "each active Plan Recipient consumes one Recipient Unit" (RC12).
 */
import type { PlanRecipientRecord, PlanRecipientStatus } from './types.ts';

export interface PlanRecipientRepository {
  listForCampaign(ownerUserId: string, campaignId: string): Promise<PlanRecipientRecord[]>;
  listForContact(ownerUserId: string, contactId: string): Promise<PlanRecipientRecord[]>;
  listForOwner(ownerUserId: string): Promise<PlanRecipientRecord[]>;
  create(recipient: {
    owner_user_id: string;
    campaign_id: string;
    contact_id: string;
    relationship_type_id?: string;
    relationship_state_id?: string;
    relationship_goal_id?: string;
    recipient_context?: string;
    status?: PlanRecipientStatus;
    joined_at?: string;
  }): Promise<PlanRecipientRecord>;
  update(id: string, changes: Partial<PlanRecipientRecord>): Promise<PlanRecipientRecord>;
  delete(id: string): Promise<void>;
}

export function createPlanRecipientRepository(client: any): PlanRecipientRepository {
  return {
    async listForCampaign(ownerUserId: string, campaignId: string) {
      return await client.entities.PlanRecipient.filter(
        { owner_user_id: ownerUserId, campaign_id: campaignId },
        '-created_date'
      );
    },
    async listForContact(ownerUserId: string, contactId: string) {
      return await client.entities.PlanRecipient.filter(
        { owner_user_id: ownerUserId, contact_id: contactId },
        '-created_date'
      );
    },
    async listForOwner(ownerUserId: string) {
      return await client.entities.PlanRecipient.filter({ owner_user_id: ownerUserId }, '-created_date');
    },
    async create(recipient) {
      return await client.entities.PlanRecipient.create({
        ...recipient,
        status: recipient.status ?? 'active',
        joined_at: recipient.joined_at ?? new Date().toISOString(),
      });
    },
    async update(id: string, changes) {
      return await client.entities.PlanRecipient.update(id, changes);
    },
    async delete(id: string) {
      await client.entities.PlanRecipient.delete(id);
    },
  };
}

export interface PlanRecipientServiceDeps {
  recipientRepo: PlanRecipientRepository;
}

export function createPlanRecipientService(deps: PlanRecipientServiceDeps) {
  return {
    listForCampaign(ownerUserId: string, campaignId: string) {
      return deps.recipientRepo.listForCampaign(ownerUserId, campaignId);
    },
    listForContact(ownerUserId: string, contactId: string) {
      return deps.recipientRepo.listForContact(ownerUserId, contactId);
    },
    listForOwner(ownerUserId: string) {
      return deps.recipientRepo.listForOwner(ownerUserId);
    },
    assignRecipient(input: {
      owner_user_id: string;
      campaign_id: string;
      contact_id: string;
      relationship_type_id?: string;
      relationship_state_id?: string;
      relationship_goal_id?: string;
      recipient_context?: string;
    }) {
      return deps.recipientRepo.create(input);
    },
    updateRecipient(id: string, changes: Partial<PlanRecipientRecord>) {
      return deps.recipientRepo.update(id, changes);
    },
    removeRecipient(id: string) {
      return deps.recipientRepo.delete(id);
    },
  };
}