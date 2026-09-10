import { base44 } from "@/api/base44Client";

/**
 * RewardService — Manages reward ledger entries and reward events.
 * The reward ledger is append-only; historical records are never overwritten.
 */
const RewardService = {
  /**
   * Get all reward ledger entries for the current user.
   */
  async getRewards() {
    const response = await base44.functions.invoke('getReferralDashboard', {});
    return response.data.rewards || [];
  },

  /**
   * Get reward statistics for the current user.
   */
  async getRewardStats() {
    const response = await base44.functions.invoke('getReferralDashboard', {});
    return response.data.stats || {};
  },

  /**
   * Trigger a reward event for a referred user.
   * Supported events: signup, trial_started, became_paid, remained_active.
   * Rewards are configuration-driven (ReferralProgramConfiguration).
   */
  async processEvent(referredUserId, eventType) {
    const response = await base44.functions.invoke('processRewardEvent', {
      referred_user_id: referredUserId,
      event_type: eventType
    });
    return response.data;
  },

  /**
   * Admin: Update a referral program configuration value.
   * Validation runs on the backend (adminUpdateReferralConfig).
   */
  async adminUpdateConfig(configId, value, isActive) {
    const response = await base44.functions.invoke('adminUpdateReferralConfig', {
      config_id: configId,
      value,
      is_active: isActive
    });
    return response.data;
  }
};

export default RewardService;