/**
 * Expiry Service — determines when prepared messages expire.
 * Portable: pure logic.
 */

import { GenerationLimits } from "./generation-config.ts";

export interface ExpiryCheck {
  shouldExpire: boolean;
  expiredAt: string;
  reason: string;
}

/**
 * Check if a prepared message should expire based on its occurrence time and campaign type.
 */
export function checkExpiry(
  message: {
    occurrence: string;
    scheduled_for: string;
    created_date: string;
    status: string;
    expired_at: string | null;
    campaign_category?: string;
  },
  campaignCategory: string,
  limits: GenerationLimits,
  now: Date = new Date()
): ExpiryCheck {
  // Already expired
  if (message.expired_at) {
    return { shouldExpire: false, expiredAt: message.expired_at, reason: "already_expired" };
  }

  // Sent messages don't expire (they stay in history)
  if (message.status === "sent") {
    return { shouldExpire: false, expiredAt: "", reason: "sent" };
  }

  // Skip/failed/cancelled messages don't need expiry
  if (["skipped", "failed"].includes(message.status)) {
    return { shouldExpire: false, expiredAt: "", reason: "terminal_status" };
  }

  const occurrence = new Date(message.occurrence || message.scheduled_for || message.created_date);
  if (isNaN(occurrence.getTime())) {
    return { shouldExpire: false, expiredAt: "", reason: "invalid_date" };
  }

  // Category-specific expiry
  const categoryExpiryHours = getCategoryExpiryHours(campaignCategory);

  // Use the category-specific expiry or the default, whichever is sooner
  const expiryHours = Math.min(categoryExpiryHours, limits.message_expiry_hours);
  const expiryTime = new Date(occurrence.getTime() + expiryHours * 60 * 60 * 1000);

  if (now >= expiryTime) {
    return {
      shouldExpire: true,
      expiredAt: now.toISOString(),
      reason: "occurrence_passed",
    };
  }

  return { shouldExpire: false, expiredAt: "", reason: "not_expired" };
}

/**
 * Get expiry duration by campaign category (in hours).
 */
export function getCategoryExpiryHours(category: string): number {
  switch (category) {
    case "birthday_reminders":
      return 24; // Expire after the birthday
    case "love_messages":
    case "daily_encouragement":
    case "motivation":
      return 24; // Daily messages expire after the day
    case "friday_appreciation":
      return 48; // Friday messages expire after the weekend
    case "church_followup":
    case "prayer_reminders":
      return 48; // Follow-up messages have a grace period
    case "client_management":
    case "customer_retention":
      return 72; // Business messages have a longer window
    default:
      return 48;
  }
}