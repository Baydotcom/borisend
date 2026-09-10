import { base44 } from '@/api/base44Client';

/**
 * Frontend service for Contacts (the actual humans/entities).
 * Owner-isolated. A Contact is NOT a Recipient Unit.
 */
export const contactService = {
  async listMyContacts() {
    return await base44.entities.Contact.filter({}, '-created_date');
  },
  async getContact(id) {
    const items = await base44.entities.Contact.filter({ id });
    return items[0] ?? null;
  },
  async createContact(input) {
    return await base44.entities.Contact.create({ ...input, is_active: true });
  },
  async updateContact(id, changes) {
    return await base44.entities.Contact.update(id, changes);
  },
  async deleteContact(id) {
    return await base44.entities.Contact.delete(id);
  },
};

export default contactService;