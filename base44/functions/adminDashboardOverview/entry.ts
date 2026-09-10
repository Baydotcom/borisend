import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }
    const sr = base44.asServiceRole;
    const [users, campaigns, messages, subs, plans] = await Promise.all([
      sr.entities.User.list('-created_date', 500),
      sr.entities.Campaign.list('-created_date', 500),
      sr.entities.Message.filter({ status: 'sent' }, '-created_date', 1000),
      sr.entities.UserSubscription.list('-created_date', 500),
      sr.entities.SubscriptionPlan.list('sort_order', 100),
    ]);
    return Response.json({ users, campaigns, messages, subs, plans });
  } catch (error:any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
