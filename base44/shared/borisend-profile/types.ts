/**
 * Type definitions for the BoriSend Profile subsystem.
 * Provider-neutral and portable — no Base44 dependencies.
 */

export type OnboardingStatus = 'incomplete' | 'complete';
export type ProfileStatus = 'active' | 'suspended' | 'deactivated';

export interface BoriSendProfileRecord {
  id: string;
  user_id: string;
  borisend_user_id: string;
  first_name?: string;
  last_name?: string;
  timezone?: string;
  preferred_locale?: string;
  onboarding_status: OnboardingStatus;
  profile_status: ProfileStatus;
  created_date?: string;
  updated_date?: string;
}

export interface BoriSendUserIdSegments {
  prefix: string;   // BO/MM/YY
  serial: number;  // SN (starts at 101, no zero-padding)
  fullId: string;  // BO/MM/YY/SN
}

export interface EnsureProfileResult {
  profile: BoriSendProfileRecord;
  created: boolean;
}

/**
 * Minimal view of the authenticated user that the profile service needs.
 * Decoupled from the Base44 user shape for portability.
 */
export interface UserProfileSource {
  id: string;
  full_name?: string;
  timezone?: string;
  language?: string;
}