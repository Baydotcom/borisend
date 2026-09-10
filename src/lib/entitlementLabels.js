/**
 * Entitlement type display labels — single source of truth for UI rendering.
 * Used by ManageCommercial, Subscription, CapacityPanel, and admin displays.
 *
 * RC18: message_units is now displayed as "Generated Messages" to distinguish
 * from Message Passes and Smart Messages. No separate generated_messages
 * entitlement type exists (§34).
 */
export const ENTITLEMENT_LABELS = {
  communication_plan_units: "Communication Plans",
  recipient_units: "Recipients",
  message_units: "Generated Messages",
  message_passes: "Message Passes",
  smart_message_units: "Smart Messages",
};

export const ENTITLEMENT_LABEL_SINGULAR = {
  communication_plan_units: "Communication Plan",
  recipient_units: "Recipient",
  message_units: "Generated Message",
  message_passes: "Message Pass",
  smart_message_units: "Smart Message",
};

/**
 * Returns the human-readable label for an entitlement type.
 * Falls back to the raw key for unknown types.
 */
export function entitlementLabel(type) {
  return ENTITLEMENT_LABELS[type] || type;
}

export function entitlementLabelSingular(type) {
  return ENTITLEMENT_LABEL_SINGULAR[type] || type;
}