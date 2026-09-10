import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { executeOccurrence } from '../../shared/smart-messages/execution-core.ts';

/**
 * RC20 — processGeofenceEvent
 *
 * Secure backend entry point for native OS geofence transitions.
 *
 * A native geofence ENTER/EXIT transition (forwarded by GeofenceService from
 * iOS CLCircularRegion / Android GeofencingClient) arrives here. This function
 * NEVER trusts client-supplied ownership or recipient data. It:
 *
 *   1. Authenticates the user (the native request carries the user token).
 *   2. Loads the SmartMessage by ID.
 *   3. Validates ownership (sm.owner_user_id === user.id).
 *   4. Validates the SmartMessage is active.
 *   5. Validates the trigger_type matches the received transition:
 *        location_arrival   ← 'enter'
 *        location_departure ← 'exit'
 *   6. Validates the geofence_id matches the expected deterministic id.
 *   7. Applies a cooldown / debounce to prevent boundary oscillation.
 *   8. Delegates to the shared executeOccurrence core (same engine as
 *      executeSmartMessage) — capacity, idempotency, ledger, Message creation.
 *
 * Geofence trigger is automatic; SMS sending remains user-assisted (§28).
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { smart_message_id, transition, geofence_id, occurred_at } = body;

    if (!smart_message_id || !transition) {
      return Response.json({ error: 'smart_message_id and transition are required' }, { status: 400 });
    }

    if (transition !== 'enter' && transition !== 'exit') {
      return Response.json({ error: "transition must be 'enter' or 'exit'" }, { status: 400 });
    }

    const sr = base44.asServiceRole;

    // 1. Load Smart Message
    const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
    if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });

    // 2. Validate ownership — cross-user isolation (§57)
    if (sm.owner_user_id !== user.id) {
      return Response.json({ error: 'Not authorized to trigger this Smart Message' }, { status: 403 });
    }

    // 3. Validate active status
    if (sm.status !== 'active') {
      return Response.json({ error: 'Smart Message is not active', blocked: true, reason: 'inactive' }, { status: 400 });
    }

    // 4. Validate trigger_type matches the transition
    const expectedTransition = sm.trigger_type === 'location_arrival' ? 'enter'
      : sm.trigger_type === 'location_departure' ? 'exit'
      : null;

    if (expectedTransition === null) {
      return Response.json({ error: 'Smart Message is not a location trigger', blocked: true, reason: 'wrong_trigger_type' }, { status: 400 });
    }
    if (expectedTransition !== transition) {
      // Arrival event cannot execute a Departure-only trigger, and vice versa.
      return Response.json({
        error: `Transition mismatch: this Smart Message expects ${expectedTransition}, received ${transition}`,
        blocked: true,
        reason: 'transition_mismatch',
      }, { status: 400 });
    }

    // 5. Validate geofence_id matches the expected deterministic identifier
    const expectedGeofenceId = `borisend_sm_${smart_message_id}`;
    if (geofence_id && geofence_id !== expectedGeofenceId) {
      return Response.json({ error: 'Geofence identifier mismatch', blocked: true, reason: 'geofence_mismatch' }, { status: 400 });
    }

    // 6. Cooldown / debounce — prevent boundary oscillation from consuming units
    const cooldownMinutes = sm.trigger_config?.trigger_cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES;
    const occurrence = occurred_at || new Date().toISOString();
    const now = new Date();

    if (sm.last_triggered_at) {
      const lastFired = new Date(sm.last_triggered_at);
      const elapsedMs = now.getTime() - lastFired.getTime();
      const cooldownMs = cooldownMinutes * 60 * 1000;
      if (elapsedMs < cooldownMs) {
        // Within cooldown window — idempotent skip (do NOT consume capacity)
        return Response.json({
          success: true,
          idempotent: true,
          reason: 'cooldown_active',
          message: `Geofence transition ignored — within ${cooldownMinutes}-minute cooldown`,
          cooldown_remaining_ms: cooldownMs - elapsedMs,
          executed_count: 0,
        });
      }
    }

    // 7. Validate the geofence has canonical coordinates
    const cfg = sm.trigger_config || {};
    if (typeof cfg.location_latitude !== 'number' || typeof cfg.location_longitude !== 'number') {
      return Response.json({ error: 'Smart Message location is not fully configured (missing coordinates)', blocked: true, reason: 'incomplete_location' }, { status: 400 });
    }

    // 8. Delegate to the shared execution core (same engine as executeSmartMessage)
    return await executeOccurrence(sr, user.id, sm, occurrence, now);
  } catch (error) {
    console.error('[processGeofenceEvent] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

const DEFAULT_COOLDOWN_MINUTES = 30;