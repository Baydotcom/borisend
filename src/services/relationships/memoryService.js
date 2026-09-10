import { base44 } from '@/api/base44Client';

/**
 * Frontend service for Relationship Memory.
 * Scoped to User → Plan → Plan Recipient → Memory. Not applied globally.
 */
export const memoryService = {
  async listForRecipient(planRecipientId) {
    return await base44.entities.RelationshipMemory.filter(
      { plan_recipient_id: planRecipientId },
      '-created_date'
    );
  },
  async addMemory(input) {
    return await base44.entities.RelationshipMemory.create({ ...input, is_active: true });
  },
  async updateMemory(id, changes) {
    return await base44.entities.RelationshipMemory.update(id, changes);
  },
  async deleteMemory(id) {
    return await base44.entities.RelationshipMemory.delete(id);
  },
};

export default memoryService;