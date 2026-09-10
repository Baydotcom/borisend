/**
 * Base44-specific repository + portable service for Contacts.
 * A Contact is the actual human/entity (NOT a Recipient Unit). Owner-isolated.
 */
import type { ContactRecord } from './types.ts';

export interface ContactRepository {
  listForOwner(ownerUserId: string): Promise<ContactRecord[]>;
  getById(id: string): Promise<ContactRecord | null>;
  create(contact: Omit<ContactRecord, 'id' | 'is_active'> & { is_active?: boolean }): Promise<ContactRecord>;
  update(id: string, changes: Partial<ContactRecord>): Promise<ContactRecord>;
  delete(id: string): Promise<void>;
}

export function createContactRepository(client: any): ContactRepository {
  return {
    async listForOwner(ownerUserId: string) {
      return await client.entities.Contact.filter({ owner_user_id: ownerUserId }, '-created_date');
    },
    async getById(id: string) {
      const items = await client.entities.Contact.filter({ id });
      return items[0] ?? null;
    },
    async create(contact) {
      return await client.entities.Contact.create(contact);
    },
    async update(id: string, changes) {
      return await client.entities.Contact.update(id, changes);
    },
    async delete(id: string) {
      await client.entities.Contact.delete(id);
    },
  };
}

export interface ContactServiceDeps {
  contactRepo: ContactRepository;
}

export function createContactService(deps: ContactServiceDeps) {
  return {
    listMyContacts(ownerUserId: string) {
      return deps.contactRepo.listForOwner(ownerUserId);
    },
    getContact(id: string) {
      return deps.contactRepo.getById(id);
    },
    createContact(input: {
      owner_user_id: string;
      display_name: string;
      first_name?: string;
      last_name?: string;
      phone_number?: string;
      email?: string;
      organisation?: string;
      timezone?: string;
      notes?: string;
    }) {
      return deps.contactRepo.create({ ...input, is_active: true });
    },
    updateContact(id: string, changes: Partial<ContactRecord>) {
      return deps.contactRepo.update(id, changes);
    },
    deleteContact(id: string) {
      return deps.contactRepo.delete(id);
    },
  };
}