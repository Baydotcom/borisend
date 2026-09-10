/**
 * Goal Eligibility — Determines which relationship goals are appropriate
 * for a given relationship family/type. Rule-driven, not scattered frontend
 * conditionals (§10). Provider-neutral and portable.
 */

// Goals appropriate per relationship family (category system_key).
// Goals not listed for a family are considered inappropriate for that family.
export const GOAL_ELIGIBILITY_BY_FAMILY: Record<string, string[]> = {
  romantic_marital: [
    'stay_connected', 'communicate_more_consistently', 'show_appreciation',
    'encourage', 'celebrate_important_moments', 'keep_in_touch', 'rebuild_trust_gradually',
  ],
  parent_child: [
    'stay_connected', 'communicate_more_consistently', 'show_appreciation',
    'encourage', 'be_more_supportive', 'reconnect', 'rebuild_trust_gradually',
    'celebrate_important_moments', 'strengthen_family_connection',
  ],
  family_extended: [
    'stay_connected', 'show_appreciation', 'encourage', 'be_more_supportive',
    'reconnect', 'celebrate_important_moments', 'strengthen_family_connection', 'keep_in_touch',
  ],
  friendship_personal: [
    'stay_connected', 'communicate_more_consistently', 'show_appreciation',
    'encourage', 'be_more_supportive', 'reconnect', 'celebrate_important_moments',
    'keep_in_touch', 'build_new_relationship',
  ],
  workplace_professional: [
    'stay_connected', 'recognise_contribution', 'encourage',
    'improve_employee_engagement', 'mentor_develop', 'strengthen_professional_relationship',
    'celebrate_important_moments',
  ],
  business_customer: [
    'stay_connected', 'show_appreciation', 'maintain_client_relationship',
    'reconnect', 'keep_in_touch', 'celebrate_important_moments',
  ],
  faith_spiritual: [
    'stay_connected', 'encourage', 'provide_pastoral_encouragement',
    'be_more_supportive', 'celebrate_important_moments', 'keep_in_touch',
  ],
  community_social: [
    'stay_connected', 'show_appreciation', 'encourage', 'keep_in_touch',
    'celebrate_important_moments', 'build_new_relationship',
  ],
  education_development: [
    'encourage', 'mentor_develop', 'recognise_contribution',
    'celebrate_important_moments', 'stay_connected',
  ],
  care_support: [
    'stay_connected', 'encourage', 'be_more_supportive',
    'show_appreciation', 'celebrate_important_moments',
  ],
  membership_organisation: [
    'stay_connected', 'show_appreciation', 'keep_in_touch',
    'celebrate_important_moments',
  ],
  network_influence: [
    'stay_connected', 'keep_in_touch', 'show_appreciation',
    'strengthen_professional_relationship', 'build_new_relationship',
  ],
};

// Type-specific goal restrictions (narrower than family).
// If a type is listed here, its eligible goals REPLACE the family set.
export const GOAL_ELIGIBILITY_BY_TYPE: Record<string, string[]> = {
  // Workplace: employee vs employer differ
  employer_to_employee: [
    'stay_connected', 'recognise_contribution', 'encourage',
    'improve_employee_engagement', 'mentor_develop', 'celebrate_important_moments',
  ],
  employee_to_employer: [
    'stay_connected', 'show_appreciation', 'encourage',
    'strengthen_professional_relationship', 'celebrate_important_moments',
  ],
};

/**
 * Returns the list of eligible goal system_keys for a relationship type.
 * Falls back to family-level eligibility, then to all goals if unknown.
 */
export function getEligibleGoals(
  relationshipCategory: string,
  relationshipType: string
): string[] {
  if (relationshipType && GOAL_ELIGIBILITY_BY_TYPE[relationshipType]) {
    return GOAL_ELIGIBILITY_BY_TYPE[relationshipType];
  }
  if (relationshipCategory && GOAL_ELIGIBILITY_BY_FAMILY[relationshipCategory]) {
    return GOAL_ELIGIBILITY_BY_FAMILY[relationshipCategory];
  }
  // Unknown family — return a safe broad set (all goals) so the UI isn't broken.
  return [
    'stay_connected', 'communicate_more_consistently', 'show_appreciation',
    'encourage', 'be_more_supportive', 'recognise_contribution', 'reconnect',
    'rebuild_trust_gradually', 'strengthen_family_connection',
    'strengthen_professional_relationship', 'maintain_client_relationship',
    'improve_employee_engagement', 'provide_pastoral_encouragement',
    'mentor_develop', 'celebrate_important_moments', 'keep_in_touch',
    'build_new_relationship',
  ];
}

/**
 * Checks whether a specific goal is eligible for a relationship type.
 */
export function isGoalEligible(
  goal: string,
  relationshipCategory: string,
  relationshipType: string
): boolean {
  return getEligibleGoals(relationshipCategory, relationshipType).includes(goal);
}