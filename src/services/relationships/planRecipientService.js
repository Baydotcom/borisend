import { base44 } from '@/api/base44Client';

/**
 * Frontend service for Plan Recipients.
 * Connects a Communication Plan (Campaign) to a Contact with plan-specific
 * relationship context. The same Contact can appear in multiple plans.
 */
export const planRecipientService = {
  async listForCampaign(campaignId) {
    return await base44.entities.PlanRecipient.filter({ campaign_id: campaignId }, '-created_date');
  },
  async listForContact(contactId) {
    return await base44.entities.PlanRecipient.filter({ contact_id: contactId }, '-created_date');
  },
  async listMine() {
    return await base44.entities.PlanRecipient.filter({}, '-created_date');
  },
  async assignRecipient(input) {
    return await base44.entities.PlanRecipient.create({
      ...input,
      status: input.status ?? 'active',
      joined_at: input.joined_at ?? new Date().toISOString(),
    });
  },
  async updateRecipient(id, changes) {
    return await base44.entities.PlanRecipient.update(id, changes);
  },
  async removeRecipient(id) {
    return await base44.entities.PlanRecipient.delete(id);
  },
};

export default planRecipientService;