import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { executeOccurrence } from '../../shared/smart-messages/execution-core.ts';

/**
 * RC18.1 — executeSmartMessage
 *
 * The authoritative Smart Message execution entry point for user-initiated
 * triggers (manual_event "Trigger Now", and any time/date triggers invoked
 * from the app while it is open).
 *
 * RC20: the execution logic itself now lives in the shared
 * `executeOccurrence` core (base44/shared/smart-messages/execution-core.ts),
 * which is also used by processGeofenceEvent for native geofence transitions.
 * This guarantees ONE execution engine — geofencing does not run a competing
 * pipeline.
 *
 * Delivery architecture (§28): Smart Messages respect the platform's
 * user-assisted SMS model. Messages are created with status=pending and
 * appear in the SmartInbox for the user to send. This function does NOT
 * invoke LLM generation (§8).
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { smart_message_id, trigger_occurrence } = body;

    if (!smart_message_id) {
      return Response.json({ error: 'smart_message_id is required' }, { status: 400 });
    }

    // §33: trigger_occurrence is required for idempotency. For manual triggers,
    // the frontend generates this per "Trigger Now" tap. Retries use the same value.
    const occurrence = trigger_occurrence || new Date().toISOString();

    const sr = base44.asServiceRole;

    // 1. Load Smart Message
    const sm = await sr.entities.SmartMessage.get(smart_message_id).catch(() => null);
    if (!sm) return Response.json({ error: 'Smart Message not found' }, { status: 404 });

    // 2. Verify owner (§57 — trigger security)
    if (sm.owner_user_id !== user.id) {
      return Response.json({ error: 'Not authorized to trigger this Smart Message' }, { status: 403 });
    }

    // 3. Verify active status
    if (sm.status !== 'active') {
      return Response.json({ error: 'Smart Message is not active', blocked: true, reason: 'inactive' }, { status: 400 });
    }

    // 4. Manual "Trigger Now" is an explicit user action on a fixed Smart
    // Message. Create the resulting Message as approved so it is immediately
    // ready for the user-assisted send flow. Automatic time/date/location
    // execution paths continue to use pending status unless they explicitly
    // opt into a different state.
    return await executeOccurrence(sr, user.id, sm, occurrence, new Date(), { initialStatus: 'approved' });
  } catch (error) {
    console.error('[executeSmartMessage] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}