import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const base44 = createClientFromRequest(req);

    // Support token from POST body (preferred) or URL query param (backwards compat with existing shortcuts)
    let automationToken = url.searchParams.get('token');

    // For GET requests, token stays in query param. For POST, accept from body.
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      automationToken = body.token || automationToken;
    }

    let userId;
    let deliveryMode;

    if (automationToken) {
      // Called from Apple Shortcut / Android automation — authenticate via token
      const users = await base44.asServiceRole.entities.User.filter({ automation_token: automationToken });
      if (users.length === 0) {
        return Response.json({ error: 'Invalid automation token' }, { status: 401 });
      }
      userId = users[0].id;
      deliveryMode = users[0].delivery_mode || 'manual';
    } else {
      // Called from the app — authenticate via session
      const user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      userId = user.id;
      deliveryMode = user.delivery_mode || 'manual';
    }

    // Get the user's campaigns
    const campaignsByUserId = await base44.asServiceRole.entities.Campaign.filter({ user_id: userId });
    const campaignsByCreator = await base44.asServiceRole.entities.Campaign.filter({ created_by_id: userId });
    const campaignIds = [...new Set([...campaignsByUserId.map(c => c.id), ...campaignsByCreator.map(c => c.id)])];

    if (campaignIds.length === 0) {
      return Response.json({ messages: [], delivery_mode: deliveryMode });
    }

    // Get approved messages for the user's campaigns (limited to 50 most recent for performance)
    const allMessages = await base44.asServiceRole.entities.Message.filter({
      campaign_id: { $in: campaignIds },
      status: 'approved'
    }, '-created_date', 50);

    // Filter to messages that are due now (scheduled_for is null or in the past)
    const now = new Date();
    const dueMessages = allMessages.filter(m => {
      if (!m.scheduled_for) return true;
      return new Date(m.scheduled_for) <= now;
    });

    return Response.json({
      messages: dueMessages.map(m => ({
        id: m.id,
        content: m.content,
        recipient_name: m.recipient_name,
        recipient_phone: m.recipient_phone
      })),
      delivery_mode: deliveryMode
    });
  } catch (error) {
    console.error("[getPendingMessages] Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});