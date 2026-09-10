/**
 * Base44-specific repository + portable service for Relationship Memory.
 *
 * Memory hierarchy: User → Communication Plan → Plan Recipient → Relationship Memory.
 * Memory is scoped to a Plan Recipient and is NOT applied globally across
 * unrelated plans. Owner-isolated.
 */
import type { RelationshipMemoryRecord, RelationshipMemoryType } from './types.ts';

export interface RelationshipMemoryRepository {
  listForRecipient(ownerUserId: string, planRecipientId: string): Promise<RelationshipMemoryRecord[]>;
  create(memory: {
    owner_user_id: string;
    campaign_id: string;
    plan_recipient_id: string;
    memory_type: RelationshipMemoryType;
    content: string;
    related_date?: string;
    is_active?: boolean;
  }): Promise<RelationshipMemoryRecord>;
  update(id: string, changes: Partial<RelationshipMemoryRecord>): Promise<RelationshipMemoryRecord>;
  delete(id: string): Promise<void>;
}

export function createRelationshipMemoryRepository(client: any): RelationshipMemoryRepository {
  return {
    async listForRecipient(ownerUserId: string, planRecipientId: string) {
      return await client.entities.RelationshipMemory.filter(
        { owner_user_id: ownerUserId, plan_recipient_id: planRecipientId },
        '-created_date'
      );
    },
    async create(memory) {
      return await client.entities.RelationshipMemory.create({
        ...memory,
        is_active: memory.is_active ?? true,
      });
    },
    async update(id: string, changes) {
      return await client.entities.RelationshipMemory.update(id, changes);
    },
    async delete(id: string) {
      await client.entities.RelationshipMemory.delete(id);
    },
  };
}

export interface MemoryServiceDeps {
  memoryRepo: RelationshipMemoryRepository;
}

export function createMemoryService(deps: MemoryServiceDeps) {
  return {
    listForRecipient(ownerUserId: string, planRecipientId: string) {
      return deps.memoryRepo.listForRecipient(ownerUserId, planRecipientId);
    },
    addMemory(input: {
      owner_user_id: string;
      campaign_id: string;
      plan_recipient_id: string;
      memory_type: RelationshipMemoryType;
      content: string;
      related_date?: string;
    }) {
      return deps.memoryRepo.create(input);
    },
    updateMemory(id: string, changes: Partial<RelationshipMemoryRecord>) {
      return deps.memoryRepo.update(id, changes);
    },
    deleteMemory(id: string) {
      return deps.memoryRepo.delete(id);
    },
  };
}