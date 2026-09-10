/**
 * FraudCheckService — Abstraction for referral fraud detection.
 *
 * The AUTHORITATIVE fraud checks run server-side in the processReferralAttribution
 * backend function. This frontend module provides:
 *  - Client-side pre-validation (format checks, basic sanity)
 *  - Documentation of the server-side fraud checks
 *  - Admin access to flagged records
 *
 * Server-side checks (in processReferralAttribution):
 *  1. Self-referral: code owner === current user → rejected
 *  2. Duplicate attribution: user already has an attribution record → rejected
 *  3. Referral loop: referrer was referred by current user → rejected
 *  4. Code reuse: same user attempting multiple referral claims → rejected (via duplicate check)
 *
 * Suspicious cases are flagged for admin review, not aggressively blocked.
 */
import { base44 } from "@/api/base44Client";

const FraudCheckService = {
  /**
   * Client-side pre-validation before calling the backend.
   * Does NOT replace server-side checks — just avoids unnecessary API calls.
   */
  validateClientSide(referralCode) {
    const checks = { passed: true, reasons: [] };

    if (!referralCode || referralCode.trim().length < 4) {
      checks.passed = false;
      checks.reasons.push("Invalid referral code format");
    }

    if (referralCode && referralCode.trim().toUpperCase().startsWith("BR") === false) {
      // Not a hard fail — just a warning. The backend is authoritative.
      checks.warning = "Code format looks unusual";
    }

    return checks;
  },

  /**
   * Admin: Get all fraud-flagged attribution records.
   */
  async getFlaggedRecords() {
    const response = await base44.functions.invoke('adminGetReferrals', {});
    return (response.data.attributions || []).filter(a => a.fraud_flag);
  },

  /**
   * Admin: Get fraud check summary.
   */
  async getFraudSummary() {
    const response = await base44.functions.invoke('adminGetReferrals', {});
    return {
      total_flagged: response.data.summary?.flagged_attributions || 0,
      total_attributions: response.data.summary?.total_attributions || 0
    };
  }
};

export default FraudCheckService;