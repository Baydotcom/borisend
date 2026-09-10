import { base44 } from "@/api/base44Client";

/**
 * ReferralService — Manages referral codes and dashboard data.
 * All sensitive operations are delegated to backend functions.
 */
const ReferralService = {
  /**
   * Get the full referral dashboard: code, link, stats, rewards, payouts.
   */
  async getDashboard() {
    const response = await base44.functions.invoke('getReferralDashboard', {});
    return response.data;
  },

  /**
   * Get the user's referral code (creates one if none exists).
   */
  async getReferralCode() {
    const data = await this.getDashboard();
    return data.referral_code;
  },

  /**
   * Get the user's shareable referral link.
   */
  async getReferralLink() {
    const data = await this.getDashboard();
    return data.referral_link;
  },

  /**
   * Build a referral link from a known code.
   */
  buildReferralLink(code) {
    const APP_DOMAIN = 'https://app.borisend.macpeniel.com';
    return `${APP_DOMAIN}/?ref=${code}`;
  },

  /**
   * Process a referral attribution (called after signup with a referral code).
   * Delegates fraud checks and attribution to the backend.
   */
  async processAttribution(referralCode) {
    const response = await base44.functions.invoke('processReferralAttribution', {
      referral_code: referralCode
    });
    return response.data;
  }
};

export default ReferralService;