/**
 * RC16.8 — Trigger Type Definitions.
 *
 * Extensible trigger taxonomy for BoriSend Communication Plans.
 * Trigger is a first-class concept: Trigger → Condition becomes true → Prepare Message.
 *
 * The trigger_type field on Campaign determines which trigger evaluator
 * handles the plan. New trigger types can be added to the enum without
 * redesigning Campaign (§21).
 *
 * This module is provider-neutral and portable — no Base44 dependencies.
 */

export type TriggerType =
  | 'scheduled'
  | 'important_date'
  | 'one_time_datetime'
  | 'manual_event'
  | 'location_arrival'
  | 'location_departure';

export const TRIGGER_TYPES: TriggerType[] = [
  'scheduled',
  'important_date',
  'one_time_datetime',
  'manual_event',
  'location_arrival',
  'location_departure',
];

export interface TriggerTypeInfo {
  type: TriggerType;
  display_name: string;
  description: string;
  /** Whether this trigger type is currently executable (vs. schema-only) */
  natively_executable: boolean;
  /** If not executable, what native dependency is required */
  native_dependency_note?: string;
}

export const TRIGGER_TYPE_INFO: Record<TriggerType, TriggerTypeInfo> = {
  scheduled: {
    type: 'scheduled',
    display_name: 'Scheduled',
    description: 'Recurring schedule (daily, weekly, monthly, selected weekdays, specific dates). Existing behaviour — preserved unchanged.',
    natively_executable: true,
  },
  important_date: {
    type: 'important_date',
    display_name: 'Important Date',
    description: 'Triggered by an active important-date RelationshipMemory (birthday, anniversary, milestone). Uses deterministic date calculations — no high-frequency polling.',
    natively_executable: true,
  },
  one_time_datetime: {
    type: 'one_time_datetime',
    display_name: 'One-Time DateTime',
    description: 'A one-off future communication event (e.g. "Prepare a message for Sarah on 4 September at 8:00 AM"). Does not recur after firing.',
    natively_executable: true,
  },
  manual_event: {
    type: 'manual_event',
    display_name: 'Manual Event',
    description: 'User-initiated event communication (e.g. "I\'ve arrived safely"). Web/PWA-compatible alternative to native triggers. Attached to configured Communication Plans.',
    natively_executable: true,
  },
  location_arrival: {
    type: 'location_arrival',
    display_name: 'Location Arrival',
    description: 'Triggered when the user arrives at a named place (e.g. Work, Home). Requires native geofencing — not yet available in this environment.',
    natively_executable: false,
    native_dependency_note: 'Requires a native geofencing plugin (e.g. @capacitor-community/geolocation with background geofence support, or a dedicated Capacitor geofence plugin). The current Capacitor configuration does not include a background geofencing dependency. Browser-based geofencing is battery-inefficient and unreliable (§27/§29) and is intentionally NOT implemented.',
  },
  location_departure: {
    type: 'location_departure',
    display_name: 'Location Departure',
    description: 'Triggered when the user leaves a named place. Requires native geofencing — not yet available in this environment.',
    natively_executable: false,
    native_dependency_note: 'Same as location_arrival — requires a native geofencing plugin not present in the current environment.',
  },
};

/**
 * Check whether a trigger type is currently executable in this environment.
 * Location triggers are schema-only (§29).
 */
export function isTriggerExecutable(type: string): boolean {
  const info = TRIGGER_TYPE_INFO[type as TriggerType];
  return info ? info.natively_executable : false;
}