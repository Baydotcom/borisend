import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkSubscriptionAccess } from '../../shared/subscriptionGuard.ts';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { message_id, token, status } = body;

    if (!message_id) {
      return Response.json({ error: 'message_id is required' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    let userId;

    if (token) {
      const users = await base44.asServiceRole.entities.User.filter({ automation_token: token });
      if (users.length === 0) {
        return Response.json({ error: 'Invalid automation token' }, { status: 401 });
      }
      userId = users[0].id;
    } else {
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      userId = user.id;
    }

    let message;
    try {
      message = await base44.asServiceRole.entities.Message.get(message_id);
    } catch (_) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.created_by_id !== userId && message.user_id !== userId) {
      return Response.json({ error: 'Forbidden: you do not own this message' }, { status: 403 });
    }

    const finalStatus = status || 'sent';

    if (message.status === 'sent' && finalStatus === 'sent') {
      return Response.json({ success: true, message: 'Message already marked as sent', idempotent: true });
    }

    if (finalStatus === 'sent') {
      // ── Shared subscription guard ──
      const guard = await checkSubscriptionAccess(base44.asServiceRole, userId);
      if (!guard.allowed) {
        return Response.json({ error: 'Your trial has ended. Choose a subscription to continue using BoriSend.', paused: true }, { status: 403 });
      }

      if (!guard.planRecord) {
        console.error('[markMessageSent] No SubscriptionPlan found — denying send');
        return Response.json({ error: 'Subscription plan configuration error. Please contact support.', config_error: true }, { status: 500 });
      }
      const monthlyLimit = guard.planRecord.monthly_message_limit;
      const used = guard.subscription?.messages_used_this_month || 0;

      if (used >= monthlyLimit) {
        return Response.json({ error: 'Monthly quota exceeded', quota_exceeded: true }, { status: 403 });
      }

      const nowIso = new Date().toISOString();
      await base44.asServiceRole.entities.Message.update(message_id, { status: 'sent', sent_at: nowIso });
      console.info(`[AUDIT] Message ${message_id} -> sent (user: ${userId})`);

      if (guard.subscription) {
        await base44.asServiceRole.entities.UserSubscription.update(guard.subscription.id, {
          messages_used_this_month: used + 1
        });
      }

      if (message.campaign_id) {
        const campaign = await base44.asServiceRole.entities.Campaign.get(message.campaign_id);
        if (campaign) {
          await base44.asServiceRole.entities.Campaign.update(message.campaign_id, {
            messages_sent: (campaign.messages_sent || 0) + 1
          });
        }
      }

      // Create "Message Sent" notification
      await base44.asServiceRole.entities.Notification.create({
        title: 'Message Sent',
        body: `Your message to ${message.recipient_name || 'recipient'} has been sent.`,
        type: 'message_sent',
        priority: 'low',
        campaign_id: message.campaign_id || null,
        message_id: message_id,
        user_id: userId,
        created_by_id: userId,
      });
    } else {
      await base44.asServiceRole.entities.Message.update(message_id, { status: finalStatus });
      console.info(`[AUDIT] Message ${message_id} -> ${finalStatus} (user: ${userId})`);

      // Create "Failed Send" notification if status is failed
      if (finalStatus === 'failed') {
        await base44.asServiceRole.entities.Notification.create({
          title: 'Failed Send',
          body: `Message to ${message.recipient_name || 'recipient'} could not be sent. It will be retried automatically.`,
          type: 'failed_send',
          priority: 'high',
          campaign_id: message.campaign_id || null,
          message_id: message_id,
          user_id: userId,
          created_by_id: userId,
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('markMessageSent error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});