import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { listAll } from '../../shared/pagination.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    // Load configuration
    const configs = await sr.entities.ReferralProgramConfiguration.filter({ is_active: true });
    const configMap = {};
    configs.forEach(c => { configMap[c.key] = c.value; });

    // Check if remained_active reward is enabled
    if (configMap['reward_remained_active_enabled'] !== 'true') {
      return Response.json({ success: true, message: 'remained_active reward not enabled', checked: 0, triggered: 0 });
    }

    const retentionDays = parseInt(configMap['reward_remained_active_days'] || '30', 10);
    if (!retentionDays || retentionDays <= 0) {
      return Response.json({ success: true, message: 'Invalid retention days configuration', checked: 0, triggered: 0 });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Get attributions eligible for remained_active check
    // Status 'attributed' or 'qualified' = not yet rewarded; skip fraud-flagged
    // RC9: server-side filter by status, age and fraud flag, paginated so
    // records beyond 500 are never silently ignored.
    const eligible = await listAll(sr.entities.ReferralAttribution, {
      status: { $in: ['attributed', 'qualified'] },
      fraud_flag: { $ne: true },
      created_date: { $lte: cutoffDate.toISOString() },
    }, '-created_date');

    let triggered = 0;
    let skipped = 0;

    for (const attribution of eligible) {
      try {
        // Delegate to existing processRewardEvent — idempotent, configuration-driven
        const result = await sr.functions.invoke('processRewardEvent', {
          referred_user_id: attribution.referred_user_id,
          event_type: 'remained_active',
          trigger_source: 'scheduled_automation'
        });
        if (result.data?.success && result.data?.reward) {
          triggered++;
        } else {
          skipped++;
        }
      } catch (e) {
        console.error(`[checkActiveUserRewards] Failed for attribution ${attribution.id}:`, e.message);
        skipped++;
      }
    }

    return Response.json({
      success: true,
      checked: eligible.length,
      triggered,
      skipped,
      retention_days: retentionDays,
      cutoff_date: cutoffDate.toISOString()
    });
  } catch (error) {
    console.error('[checkActiveUserRewards] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});