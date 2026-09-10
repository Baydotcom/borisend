import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { evaluateFeedback } from '../../shared/message-engine/feedback-service.ts';
import { updateProfileFromFeedback } from '../../shared/message-engine/preference-service.ts';
import { DEFAULT_LIMITS, mergeLimits } from '../../shared/message-engine/generation-config.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let authedUserId = null;
    try {
      const user = await base44.auth.me();
      if (user) authedUserId = user.id;
    } catch { /* system call */ }

    const body = await req.json().catch(() => ({}));
    const { message_id, rating, reasons, custom_reason, improvement_action } = body;

    if (!message_id || !rating) {
      return Response.json({ error: 'message_id and rating are required' }, { status: 400 });
    }

    const validRatings = ['love_it', 'its_okay', 'prepare_another'];
    if (!validRatings.includes(rating)) {
      return Response.json({ error: 'Invalid rating' }, { status: 400 });
    }

    // Load the message
    const messages = await base44.asServiceRole.entities.Message.filter({ id: message_id });
    const message = messages[0];
    if (!message) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    const effectiveUserId = body.user_id || authedUserId || message.user_id || message.created_by_id;
    if (!effectiveUserId) {
      return Response.json({ error: 'User identification required' }, { status: 400 });
    }

    const campaignId = message.campaign_id;
    const generationKey = message.generation_key || '';
    const recipientId = message.generation_key
      ? message.generation_key.split('|')[2] || ''
      : '';
    const versionNumber = message.version_number || 1;

    // Load admin config
    let limits = DEFAULT_LIMITS;
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({});
      const settingsMap: Record<string, string> = {};
      for (const s of settings) {
        if (s.setting_key?.startsWith('generation_')) {
          settingsMap[s.setting_key] = s.setting_value;
        }
      }
      limits = mergeLimits(DEFAULT_LIMITS, settingsMap);
    } catch { /* use defaults */ }

    // Create the feedback record
    const feedbackRecord = {
      user_id: effectiveUserId,
      campaign_id: campaignId,
      message_id: message.id,
      generation_key: generationKey,
      rating,
      reasons: reasons || [],
      custom_reason: custom_reason || '',
      improvement_action: improvement_action || '',
      recipient_id: recipientId,
      version_number: versionNumber,
      created_by_id: effectiveUserId,
    };

    await base44.asServiceRole.entities.MessageFeedback.create(feedbackRecord);

    // Update plan-scoped preference profile
    try {
      const feedbackEval = evaluateFeedback({
        ...feedbackRecord,
        created_date: new Date().toISOString(),
      });

      if (feedbackEval.shouldLearn) {
        const planPrefsRecords = await base44.asServiceRole.entities.PlanPreferenceProfile.filter({
          user_id: effectiveUserId, campaign_id: campaignId, recipient_id: null,
        });
        const planProfile = planPrefsRecords[0] || null;

        const updatedProfile = updateProfileFromFeedback(
          planProfile as any,
          { ...feedbackRecord, created_date: new Date().toISOString() } as any,
          limits
        );

        if (planProfile?.id) {
          await base44.asServiceRole.entities.PlanPreferenceProfile.update(planProfile.id, {
            avoid_styles: updatedProfile.avoid_styles,
            feedback_count: updatedProfile.feedback_count,
            confidence_score: updatedProfile.confidence_score,
            last_feedback_at: updatedProfile.last_feedback_at,
            last_updated: updatedProfile.last_updated,
          });
        } else {
          await base44.asServiceRole.entities.PlanPreferenceProfile.create({
            ...updatedProfile,
            created_by_id: effectiveUserId,
          });
        }
      }
    } catch (prefErr) {
      console.warn('[recordMessageFeedback] Preference update failed:', prefErr.message);
    }

    // If "love_it", mark the message as selected
    if (rating === 'love_it') {
      await base44.asServiceRole.entities.Message.update(message.id, { is_selected: true });
    }

    console.info(`[recordMessageFeedback] Recorded ${rating} for message ${message.id} (campaign: ${campaignId})`);

    return Response.json({
      success: true,
      rating,
      message_id: message.id,
      is_selected: rating === 'love_it',
    });
  } catch (error) {
    console.error('[recordMessageFeedback] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});