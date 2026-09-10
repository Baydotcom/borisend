/**
 * Plan-Change Classifier — determines if a plan edit invalidates prepared messages.
 * Portable: pure logic.
 */

export interface ChangeClassification {
  type: "minor" | "significant";
  changedFields: string[];
  shouldInvalidate: boolean;
}

const SIGNIFICANT_FIELDS = [
  "recipients",
  "category",
  "tone",
  "purpose",
  "pet_name",
  "additional_instructions",
  "schedule_type",
  "schedule_time",
  "schedule_days",
  "schedule_dates",
  "writing_style",
  "message_length",
  "approval_mode",
  "contact_group",
];

/**
 * Classify a plan change as minor or significant.
 */
export function classifyPlanChange(
  oldCampaign: Record<string, any>,
  newCampaign: Record<string, any>
): ChangeClassification {
  const changedFields: string[] = [];

  for (const field of SIGNIFICANT_FIELDS) {
    const oldVal = oldCampaign[field];
    const newVal = newCampaign[field];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changedFields.push(field);
    }
  }

  if (changedFields.length === 0) {
    return { type: "minor", changedFields: [], shouldInvalidate: false };
  }

  return {
    type: "significant",
    changedFields,
    shouldInvalidate: true,
  };
}

/**
 * Get a user-friendly message about what changed.
 */
export function getChangeDescription(classification: ChangeClassification): string {
  if (classification.type === "minor") {
    return "Minor changes saved. Your prepared messages are not affected.";
  }

  const fieldLabels: Record<string, string> = {
    recipients: "recipients",
    category: "message category",
    tone: "tone",
    purpose: "purpose",
    pet_name: "pet name",
    additional_instructions: "instructions",
    schedule_type: "schedule type",
    schedule_time: "schedule time",
    schedule_days: "schedule days",
    schedule_dates: "schedule dates",
    writing_style: "writing style",
    message_length: "message length",
    approval_mode: "approval mode",
    contact_group: "contact group",
  };

  const labels = classification.changedFields.map((f) => fieldLabels[f] || f);
  return `Significant changes detected: ${labels.join(", ")}. Your prepared messages may need to be reviewed.`;
}