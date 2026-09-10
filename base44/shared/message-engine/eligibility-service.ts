/**
 * Eligibility Service — checks all conditions before calling the provider.
 * Portable: pure logic, receives data as parameters.
 */

import { GenerationLimits } from "./generation-config.ts";
import { ReusableMessage, findReusableVersion } from "./reuse-service.ts";
import { LockState, isLockActive, shouldWaitForLock } from "./lock-service.ts";

export interface EligibilityInput {
  campaign: {
    id: string;
    user_id: string;
    status: string;
    recipients: Array<{ name: string; phone: string }>;
  } | null;
  userId: string;
  subscription: {
    status: string;
    monthly_limit: number;
    messages_used_this_month: number;
  } | null;
  existingMessages: ReusableMessage[];
  generationKey: string;
  activeLock: LockState | null;
  requestId: string;
  occurrence: string;
  isManualRequest: boolean;
  limits: GenerationLimits;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  userMessage: string;
  existingMessage?: ReusableMessage;
  shouldWait?: boolean;
}

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  const {
    campaign, userId, subscription, existingMessages, generationKey,
    activeLock, requestId, occurrence, isManualRequest, limits,
  } = input;

  // 1. Campaign exists
  if (!campaign) {
    return {
      eligible: false,
      reason: "campaign_not_found",
      userMessage: "This communication plan could not be found.",
    };
  }

  // 2. Campaign belongs to user
  if (campaign.user_id !== userId) {
    return {
      eligible: false,
      reason: "ownership_denied",
      userMessage: "You do not have access to this communication plan.",
    };
  }

  // 3. Campaign is active
  if (campaign.status !== "active") {
    return {
      eligible: false,
      reason: "plan_not_active",
      userMessage: `This communication plan is ${campaign.status}. Resume it to prepare new messages.`,
    };
  }

  // 4. Subscription access
  if (!subscription) {
    return {
      eligible: false,
      reason: "no_subscription",
      userMessage: "BoriSend could not verify your subscription. Please try again.",
    };
  }

  if (["expired", "cancelled", "paused"].includes(subscription.status)) {
    return {
      eligible: false,
      reason: "subscription_inactive",
      userMessage: "Your subscription is not active. Visit Subscription to reactivate.",
    };
  }

  // 5. Send allowance (only for manual requests — scheduler checks separately)
  if (isManualRequest && subscription.monthly_limit > 0 &&
      subscription.messages_used_this_month >= subscription.monthly_limit) {
    return {
      eligible: false,
      reason: "allowance_exhausted",
      userMessage: "You have reached your monthly message limit. Upgrade your plan to send more messages.",
    };
  }

  // 6. Occurrence is valid
  if (!occurrence) {
    return {
      eligible: false,
      reason: "invalid_occurrence",
      userMessage: "BoriSend could not determine the scheduled time.",
    };
  }

  // 7. Check for existing reusable version
  const existing = findReusableVersion(existingMessages, generationKey);
  if (existing) {
    return {
      eligible: false,
      reason: "reuse_existing",
      userMessage: "A message is already prepared for this occurrence.",
      existingMessage: existing,
    };
  }

  // 8. Check for active lock from a different request
  if (shouldWaitForLock(activeLock, requestId)) {
    return {
      eligible: false,
      reason: "lock_active",
      userMessage: "BoriSend is already preparing this message. Please wait a moment.",
      shouldWait: true,
    };
  }

  // 9. All checks passed
  return {
    eligible: true,
    reason: "eligible",
    userMessage: "",
  };
}