/**
 * RelationshipContextService — Maps campaign category to recipient relationship.
 * Portable: pure data mapping, no Base44 dependencies.
 */

import { CampaignContext, RecipientContext } from './types.ts';

const CATEGORY_RELATIONSHIP_MAP: Record<string, string> = {
  love_messages: 'partner',
  marriage_appreciation: 'spouse',
  daily_encouragement: 'friend',
  birthday_reminders: 'friend',
  employee_appreciation: 'colleague',
  friday_appreciation: 'colleague',
  church_followup: 'church member',
  client_management: 'client',
  customer_retention: 'customer',
  family_checkins: 'family',
  prayer_reminders: 'church member',
  motivation: 'friend',
  custom: 'friend',
};

export function getRelationship(category: string): string {
  return CATEGORY_RELATIONSHIP_MAP[category] || 'friend';
}

export function buildRecipientContext(
  campaign: CampaignContext,
  recipientName: string,
  language: string,
  preferences: string[] = []
): RecipientContext {
  return {
    name: recipientName || 'Friend',
    relationship: getRelationship(campaign.category),
    language: language || 'English',
    preferences,
  };
}