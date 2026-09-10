import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * RC15 Update My Profile
 *
 * Updates the authenticated user's BoriSendProfile with permitted fields.
 * Does NOT allow changing:
 *   - borisend_user_id (immutable)
 *   - authentication email (owned by auth system)
 *   - profile_status (admin-controlled)
 *
 * Permitted fields: first_name, last_name, timezone, preferred_locale.
 * preferred_locale is the interface language only. Generated-message language
 * is managed separately by Settings through BoriSendProfile.default_message_language.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { first_name, last_name, timezone, preferred_locale } = body;

    // Find the user's BoriSendProfile (authoritative, owned by auth user)
    const profiles = await base44.asServiceRole.entities.BoriSendProfile.filter({
      user_id: user.id,
    });
    const profile = profiles[0];

    if (!profile) {
      return Response.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Build update from permitted fields only
    const update: any = {};
    if (first_name !== undefined) update.first_name = first_name;
    if (last_name !== undefined) update.last_name = last_name;
    if (timezone !== undefined) update.timezone = timezone;
    if (preferred_locale !== undefined) update.preferred_locale = preferred_locale;

    // Mark onboarding complete if it wasn't
    if (profile.onboarding_status !== 'complete') {
      update.onboarding_status = 'complete';
    }

    const updated = await base44.asServiceRole.entities.BoriSendProfile.update(profile.id, update);

    // Timezone is shared with scheduling. Interface language must not alter
    // generated-message language, so preferred_locale is intentionally NOT
    // copied into User.message_language here.
    if (timezone !== undefined) {
      try {
        await base44.asServiceRole.entities.User.update(user.id, { timezone });
      } catch { /* non-blocking */ }
    }

    // Analytics
    try {
      await base44.analytics.track({ eventName: 'profile_updated' });
    } catch { /* non-blocking */ }

    return Response.json({
      success: true,
      profile: updated,
    });
  } catch (error) {
    console.error('[updateMyProfile] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});