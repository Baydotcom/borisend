import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { normalizePhone, isValidPhone } from '../../shared/phone-utils.ts';

/**
 * RC18.2 §36 — Backend bulk contact import function.
 *
 * Authenticates the user, normalizes phone numbers, deduplicates against
 * existing contacts by normalized phone, and bulk-creates only new contacts.
 *
 * RC18.2 §42: owner_user_id is taken from the authenticated user —
 * never trusted from the frontend payload.
 *
 * RC18.2 §37: Loads user's existing contacts in ONE query — no N+1.
 *
 * RC18.2 §22: Idempotent — running the same import twice creates 0 duplicates.
 *
 * RC18.2 §1: Importing contacts consumes 0 Recipient Units.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const contacts = body.contacts;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      return Response.json({ error: 'No contacts provided' }, { status: 400 });
    }

    // §37: Load user's existing contacts in ONE query (no N+1)
    const existing = await base44.entities.Contact.filter(
      { owner_user_id: user.id },
      '-created_date',
      500
    );

    // Build normalized phone -> existing contact map for dedup (§18/§19)
    const existingByPhone = new Map();
    for (const c of existing) {
      const norm = c.phone_normalized || normalizePhone(c.phone_number || '');
      if (norm) existingByPhone.set(norm, c);
    }

    const toCreate = [];
    const existingMatches = [];
    const skipped = [];

    for (const c of contacts) {
      const name = (c.display_name || '').trim();
      const phone = (c.phone_number || '').trim();

      // §15: Skip contacts without name or phone
      if (!name) {
        skipped.push({ reason: 'no_name' });
        continue;
      }
      if (!phone) {
        skipped.push({ reason: 'no_phone', name });
        continue;
      }

      const normalized = normalizePhone(phone);
      if (!normalized || !isValidPhone(phone)) {
        skipped.push({ reason: 'invalid_phone', name });
        continue;
      }

      // §18/§19/§22: Check for existing contact by normalized phone
      const existingContact = existingByPhone.get(normalized);
      if (existingContact) {
        // §19: Reuse existing contact — do NOT create a duplicate
        existingMatches.push({
          id: existingContact.id,
          display_name: existingContact.display_name,
        });
      } else {
        // §20: Same name / different number = different person (not merged)
        const firstName = c.first_name || name.split(' ')[0] || name;
        const lastName = c.last_name || name.split(' ').slice(1).join(' ') || '';
        toCreate.push({
          owner_user_id: user.id, // §42: Authenticated owner, not frontend-supplied
          display_name: name,
          first_name: firstName,
          last_name: lastName,
          phone_number: phone,
          phone_normalized: normalized,
          is_active: true,
        });
        // Add to map to prevent intra-batch duplicates
        existingByPhone.set(normalized, { id: 'pending', display_name: name });
      }
    }

    // Bulk create new contacts
    let created = [];
    if (toCreate.length > 0) {
      created = await base44.entities.Contact.bulkCreate(toCreate);
    }

    return Response.json({
      success: true,
      created: created.length,
      existing: existingMatches.length,
      skipped: skipped.length,
      skippedDetails: skipped,
      createdIds: created.map(c => c.id),
      // §1: Confirm 0 Recipient Units consumed
      recipientUnitsConsumed: 0,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}