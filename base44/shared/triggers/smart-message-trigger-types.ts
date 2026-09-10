/**
 * RC18 — Smart Message Trigger Type Definitions.
 *
 * Clean trigger definitions for Smart Messages, distinct from Communication
 * Plan triggers (§18). Smart Messages answer "When this event happens, what
 * fixed message should go to whom?" — the intelligence is in the trigger,
 * not in generated wording.
 *
 * Provider-neutral and portable — no Base44 dependencies.
 */

export type SmartMessageTriggerType =
  | 'time'
  | 'date'
  | 'recurring_date'
  | 'manual_event'
  | 'location_arrival'
  | 'location_departure';

export const SMART_MESSAGE_TRIGGER_TYPES: SmartMessageTriggerType[] = [
  'time',
  'date',
  'recurring_date',
  'manual_event',
  'location_arrival',
  'location_departure',
];

export interface SmartMessageTriggerTypeInfo {
  type: SmartMessageTriggerType;
  display_name: string;
  description: string;
  natively_executable: boolean;
  native_dependency_note?: string;
}

export const SMART_MESSAGE_TRIGGER_TYPE_INFO: Record<SmartMessageTriggerType, SmartMessageTriggerTypeInfo> = {
  time: {
    type: 'time',
    display_name: 'Time',
    description: 'Fires at a specific time of day. Useful for one-time or daily reminders.',
    natively_executable: true,
  },
  date: {
    type: 'date',
    display_name: 'Specific Date',
    description: 'Fires once on a specific calendar date. Does not recur.',
    natively_executable: true,
  },
  recurring_date: {
    type: 'recurring_date',
    display_name: 'Recurring Schedule',
    description: 'Fires on selected weekdays at a specific time (e.g. every weekday at 8am).',
    natively_executable: true,
  },
  manual_event: {
    type: 'manual_event',
    display_name: 'Manual Event',
    description: 'User-initiated event (e.g. "I\'ve arrived safely"). Web/PWA-compatible — no native dependency required.',
    natively_executable: true,
  },
  location_arrival: {
    type: 'location_arrival',
    display_name: 'Location Arrival',
    description: 'Fires when the user arrives at a named place (e.g. Work, Home). Requires native geofencing.',
    natively_executable: false,
    native_dependency_note: 'Requires a native geofencing plugin. Browser-based geofencing is battery-inefficient and unreliable (§20/§21) and is intentionally NOT implemented.',
  },
  location_departure: {
    type: 'location_departure',
    display_name: 'Location Departure',
    description: 'Fires when the user leaves a named place. Requires native geofencing.',
    natively_executable: false,
    native_dependency_note: 'Same as location_arrival — requires a native geofencing plugin not present in the current environment.',
  },
};

export function isSmartMessageTriggerExecutable(type: string): boolean {
  const info = SMART_MESSAGE_TRIGGER_TYPE_INFO[type as SmartMessageTriggerType];
  return info ? info.natively_executable : false;
}