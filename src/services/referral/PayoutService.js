import { base44 } from "@/api/base44Client";

/**
 * PayoutService — Placeholder abstraction for payout management.
 *
 * NO external payout providers (Stripe Connect, PayPal, bank, crypto) are connected.
 * This service handles internal payout request lifecycle only:
 *   requested → approved → paid  (or rejected)
 *
 * Future integration will replace the backend implementation without changing
 * this service's public interface.
 */
const PayoutService = {
  /**
   * User requests a payout. Backend validates available balance.
   */
  async requestPayout() {
    const response = await base44.functions.invoke('requestPayout', {});
    return response.data;
  },

  /**
   * Get all payout requests for the current user.
   */
  async getPayouts() {
    const response = await base44.functions.invoke('getReferralDashboard', {});
    return response.data.payouts || [];
  },

  // ── Admin operations (placeholder status updates only) ──

  async adminApprovePayout(payoutId, notes) {
    const response = await base44.functions.invoke('adminManagePayout', {
      payout_id: payoutId,
      action: 'approve',
      notes
    });
    return response.data;
  },

  async adminRejectPayout(payoutId, notes) {
    const response = await base44.functions.invoke('adminManagePayout', {
      payout_id: payoutId,
      action: 'reject',
      notes
    });
    return response.data;
  },

  async adminMarkPayoutPaid(payoutId, notes, paymentReference) {
    const response = await base44.functions.invoke('adminManagePayout', {
      payout_id: payoutId,
      action: 'mark_paid',
      notes,
      payment_reference: paymentReference
    });
    return response.data;
  }
};

export default PayoutService;