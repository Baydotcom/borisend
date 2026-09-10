import { base44 } from '@/api/base44Client';

/**
 * Frontend service for the relationship taxonomy (categories, types, states,
 * goals). Read-globally, admin-managed. UI components use this instead of
 * touching Base44 entities directly.
 */
export const taxonomyService = {
  async listCategories(activeOnly = true) {
    const filter = activeOnly ? { is_active: true } : {};
    return await base44.entities.RelationshipCategory.filter(filter, 'display_order');
  },
  async listTypes(activeOnly = true) {
    const filter = activeOnly ? { is_active: true } : {};
    return await base44.entities.RelationshipType.filter(filter, 'display_order');
  },
  async listStates(activeOnly = true) {
    const filter = activeOnly ? { is_active: true } : {};
    return await base44.entities.RelationshipState.filter(filter, 'display_order');
  },
  async listGoals(activeOnly = true) {
    const filter = activeOnly ? { is_active: true } : {};
    return await base44.entities.RelationshipGoal.filter(filter, 'display_order');
  },
  async getTypeById(id) {
    const items = await base44.entities.RelationshipType.filter({ id });
    return items[0] ?? null;
  },
};

export default taxonomyService;