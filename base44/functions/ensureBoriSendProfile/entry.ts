import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ensureProfile } from '../../shared/borisend-profile/profile-service.ts';
import { createProfileRepository, createCounterRepository } from '../../shared/borisend-profile/profile-repository.ts';

/**
 * ensureBoriSendProfile
 *
 * Provisions a BoriSend Profile for the authenticated user if one does not yet
 * exist. Idempotent — returns the existing profile if already present.
 *
 * Server-side, concurrency-safe BoriSend User ID generation (BO/MM/YY/SN) is
 * delegated to the portable profile-service via the Base44 counter repository.
 */
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sr = base44.asServiceRole;
    const result = await ensureProfile(
      {
        profileRepo: createProfileRepository(sr),
        counterRepo: createCounterRepository(sr),
      },
      {
        id: user.id,
        full_name: user.full_name,
        timezone: user.timezone,
        language: user.language,
      }
    );

    return Response.json({
      success: true,
      created: result.created,
      profile: result.profile,
    });
  } catch (error) {
    console.error('[ensureBoriSendProfile] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}