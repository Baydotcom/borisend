/**
 * OccasionContextService — Maps campaign category to occasion type.
 * Portable: pure data mapping, no Base44 dependencies.
 */

import { CampaignContext } from './types.ts';

const CATEGORY_OCCASION_MAP: Record<string, string> = {
  love_messages: 'love and appreciation',
  marriage_appreciation: 'marriage appreciation',
  daily_encouragement: 'encouragement',
  birthday_reminders: 'birthday',
  employee_appreciation: 'workplace appreciation',
  friday_appreciation: 'end of week appreciation',
  church_followup: 'church follow-up',
  client_management: 'client check-in',
  customer_retention: 'customer check-in',
  family_checkins: 'family check-in',
  prayer_reminders: 'prayer reminder',
  motivation: 'motivation',
  custom: 'general appreciation',
};

export function getOccasion(category: string): string {
  return CATEGORY_OCCASION_MAP[category] || 'general appreciation';
}

export function getPurpose(campaign: CampaignContext): string {
  if (campaign.purpose) return campaign.purpose;
  return getOccasion(campaign.category);
}