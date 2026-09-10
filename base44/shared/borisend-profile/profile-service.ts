/**
 * Portable BoriSend Profile provisioning service.
 *
 * Orchestrates user-ID generation + profile persistence through repository
 * interfaces — no Base44 import here. The backend function wires the Base44
 * repositories in; a future private-server implementation would wire its own.
 */
import {
  buildBoriSendUserId,
  getCurrentMonthYear,
  acquireUniqueSerial,
  type UserIdCounterRepository,
} from './user-id-generator.ts';
import { buildProfileSeed, type ProfileRepository } from './profile-repository.ts';
import type { BoriSendProfileRecord, EnsureProfileResult, UserProfileSource } from './types.ts';

export interface ProfileServiceDeps {
  profileRepo: ProfileRepository;
  counterRepo: UserIdCounterRepository;
}

/**
 * Ensures the authenticated user has a BoriSend Profile.
 * - If one already exists for the user, returns it (idempotent — never creates a duplicate).
 * - Otherwise generates a unique BO/MM/YY/SN ID and creates a minimal profile
 *   with onboarding_status = 'incomplete'.
 */
export async function ensureProfile(
  deps: ProfileServiceDeps,
  user: UserProfileSource
): Promise<EnsureProfileResult> {
  const existing = await deps.profileRepo.findByUserId(user.id);
  if (existing) {
    return { profile: existing, created: false };
  }

  const { month, year } = getCurrentMonthYear();
  const prefixOnly = buildBoriSendUserId(month, year, 101).prefix;
  const serial = await acquireUniqueSerial(deps.counterRepo, month, year, prefixOnly);
  const { fullId } = buildBoriSendUserId(month, year, serial);

  const seed = buildProfileSeed(user, fullId);
  const profile = await deps.profileRepo.create(seed);
  return { profile, created: true };
}

/** Reads the profile for a user without creating one. */
export async function getProfile(
  profileRepo: ProfileRepository,
  userId: string
): Promise<BoriSendProfileRecord | null> {
  return await profileRepo.findByUserId(userId);
}