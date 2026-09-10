import { base44 } from "@/api/base44Client";

/**
 * ReferralAttributionService — Manages referral attribution records.
 * Attribution is recorded once and never silently overwritten.
 * All checks run server-side to prevent manipulation.
 */
const ReferralAttributionService = {
  /**
   * Process a referral attribution for the current user.
   * The backend performs: self-referral check, duplicate check, loop detection.
   */
  async processAttribution(referralCode) {
    const response = await base44.functions.invoke('processReferralAttribution', {
      referral_code: referralCode
    });
    return response.data;
  },

  /**
   * Get all attribution records where the current user is the referrer.
   */
  async getMyAttributions() {
    const response = await base44.functions.invoke('getReferralDashboard', {});
    return response.data.attributions || [];
  }
};

export default ReferralAttributionService;