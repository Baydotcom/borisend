import { base44 } from '@/api/base44Client';

/**
 * Frontend service for the BoriSend Profile.
 * Wraps Base44 SDK calls so UI components stay free of direct entity access.
 */
export const profileService = {
  /** Provisions (or returns) the current user's BoriSend Profile. */
  async ensureMyProfile() {
    const res = await base44.functions.invoke('ensureBoriSendProfile', {});
    return res.data;
  },

  /** Reads the current user's profile without provisioning. */
  async getMyProfile() {
    const profiles = await base44.entities.BoriSendProfile.filter({});
    return profiles[0] ?? null;
  },

  /** Updates editable fields on the current user's profile. */
  async updateMyProfile(profileId, changes) {
    return await base44.entities.BoriSendProfile.update(profileId, changes);
  },
};

export default profileService;