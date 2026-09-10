/**
 * Base44-specific repository for the relationship taxonomy (categories, types,
 * states, goals). Read-globally / admin-write records. Isolates all Base44
 * entity access for the taxonomy so business logic can stay portable.
 */
import type {
  RelationshipCategoryRecord,
  RelationshipGoalRecord,
  RelationshipStateRecord,
  RelationshipTypeRecord,
} from './types.ts';

export interface TaxonomyRepository {
  listCategories(activeOnly?: boolean): Promise<RelationshipCategoryRecord[]>;
  listTypes(activeOnly?: boolean): Promise<RelationshipTypeRecord[]>;
  listStates(activeOnly?: boolean): Promise<RelationshipStateRecord[]>;
  listGoals(activeOnly?: boolean): Promise<RelationshipGoalRecord[]>;
  getTypeById(id: string): Promise<RelationshipTypeRecord | null>;
}

export function createTaxonomyRepository(client: any): TaxonomyRepository {
  return {
    async listCategories(activeOnly = true) {
      const filter = activeOnly ? { is_active: true } : {};
      return await client.entities.RelationshipCategory.filter(filter, 'display_order');
    },
    async listTypes(activeOnly = true) {
      const filter = activeOnly ? { is_active: true } : {};
      return await client.entities.RelationshipType.filter(filter, 'display_order');
    },
    async listStates(activeOnly = true) {
      const filter = activeOnly ? { is_active: true } : {};
      return await client.entities.RelationshipState.filter(filter, 'display_order');
    },
    async listGoals(activeOnly = true) {
      const filter = activeOnly ? { is_active: true } : {};
      return await client.entities.RelationshipGoal.filter(filter, 'display_order');
    },
    async getTypeById(id: string) {
      const types = await client.entities.RelationshipType.filter({ id });
      return types[0] ?? null;
    },
  };
}