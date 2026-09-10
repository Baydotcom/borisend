/**
 * Base44-specific persistence layer for the BoriSend Profile subsystem.
 *
 * This module is the ONLY place that touches Base44 entities for profiles and
 * the user-ID counter. The portable profile-service imports repository
 * interfaces, not this file's Base44 calls — keeping business logic portable
 * for a future private-server migration.
 */
import type { BoriSendProfileRecord, UserProfileSource } from './types.ts';
import type { UserIdCounterRepository } from './user-id-generator.ts';
import { COUNTER_SEED } from './user-id-generator.ts';

export interface ProfileRepository {
  findByUserId(userId: string): Promise<BoriSendProfileRecord | null>;
  create(profile: {
    user_id: string;
    borisend_user_id: string;
    first_name?: string;
    last_name?: string;
    timezone?: string;
    preferred_locale?: string;
    onboarding_status: string;
    profile_status: string;
  }): Promise<BoriSendProfileRecord>;
}

// `client` is the Base44 service-role client (base44.asServiceRole). Both
// `.entities` shapes are identical, so the user-scoped client works too.
export function createProfileRepository(client: any): ProfileRepository {
  return {
    async findByUserId(userId: string) {
      const profiles = await client.entities.BoriSendProfile.filter({ user_id: userId });
      return (profiles[0] as BoriSendProfileRecord) ?? null;
    },
    async create(profile) {
      return await client.entities.BoriSendProfile.create(profile) as BoriSendProfileRecord;
    },
  };
}

export function createCounterRepository(client: any): UserIdCounterRepository {
  return {
    async getCounter(month: number, year: number) {
      const counters = await client.entities.BoriSendUserIdCounter.filter({ month, year });
      return counters[0] ?? null;
    },
    async createCounter(month: number, year: number, prefix: string) {
      return await client.entities.BoriSendUserIdCounter.create({
        month,
        year,
        last_serial: COUNTER_SEED,
        id_prefix: prefix,
      });
    },
    async conditionalAdvance(counterId: string, expectedSerial: number, newSerial: number) {
      // Conditional update: only matches while last_serial is still expectedSerial.
      await client.entities.BoriSendUserIdCounter.updateMany(
        { id: counterId, last_serial: expectedSerial },
        { $set: { last_serial: newSerial } }
      );
      // Re-read to confirm this caller won the advance. If another caller
      // advanced past newSerial first, last_serial will differ and we report
      // false so the generator retries with the fresh baseline.
      const updated = await client.entities.BoriSendUserIdCounter.filter({ id: counterId });
      return updated[0]?.last_serial === newSerial;
    },
  };
}

/** Derive first/last name from a full_name string. */
export function splitFullName(fullName?: string): { first_name: string; last_name: string } {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { first_name: '', last_name: '' };
  const parts = trimmed.split(/\s+/);
  const first_name = parts[0] || '';
  const last_name = parts.slice(1).join(' ');
  return { first_name, last_name };
}

/** Builds the profile creation payload from the user source (no ID yet). */
export function buildProfileSeed(user: UserProfileSource, borisend_user_id: string) {
  const { first_name, last_name } = splitFullName(user.full_name);
  return {
    user_id: user.id,
    borisend_user_id,
    first_name,
    last_name,
    timezone: user.timezone || '',
    preferred_locale: user.language || 'en',
    onboarding_status: 'incomplete' as const,
    profile_status: 'active' as const,
  };
}