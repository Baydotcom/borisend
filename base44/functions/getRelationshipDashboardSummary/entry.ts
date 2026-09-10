/**
 * RC15.2 — Relationship Dashboard Summary.
 *
 * ONE lightweight authenticated aggregation endpoint for the BoriSend
 * Relationship Dashboard (Home). Deterministic. No LLM. No external
 * integration. No writes. No polling.
 *
 * Every query is explicitly scoped to the authenticated user (owner_user_id /
 * user_id / created_by_id). Service-role calls never rely on RLS alone.
 *
 * Sources of truth (no dashboard-owned copies):
 *   BoriSendProfile → greeting
 *   PlanRecipient (active) → relationship instance count + state counts
 *   Campaign → plans / next_scheduled / draft detection
 *   Message (this month) → monthly communication summary + consistency
 *   Message (pending) → needs attention / today
 *   RelationshipMemory (important_date/milestone) → upcoming moments
 *   EntitlementService → capacity
 *   RelationshipState / RelationshipType taxonomy → display labels
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCapacityStatus } from '../../shared/entitlements/entitlement-service.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = user.id;
    const sr = base44.asServiceRole;
    const now = new Date();

    // ── Current calendar month window ──
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    const monthStartStr = monthStart.toISOString();
    const monthEndStr = monthEnd.toISOString();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayStartStr = todayStart.toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const todayEndStr = todayEnd.toISOString();

    // ── Batch all independent reads ──
    const [
      profiles, campaignsByUser, campaignsByCreator, planRecipients,
      contacts, categories, states, types, goals,
      messagesThisMonth, pendingMessages, sentToday, memories,
    ] = await Promise.all([
      sr.entities.BoriSendProfile.filter({ user_id: userId }).catch(() => []),
      sr.entities.Campaign.filter({ user_id: userId }).catch(() => []),
      sr.entities.Campaign.filter({ created_by_id: userId }).catch(() => []),
      sr.entities.PlanRecipient.filter({ owner_user_id: userId }).catch(() => []),
      sr.entities.Contact.filter({ owner_user_id: userId }).catch(() => []),
      sr.entities.RelationshipCategory.list('display_order', 50).catch(() => []),
      sr.entities.RelationshipState.list('display_order', 50).catch(() => []),
      sr.entities.RelationshipType.list('display_order', 100).catch(() => []),
      sr.entities.RelationshipGoal.list('display_order', 50).catch(() => []),
      // RC16.6: Fetch ALL user messages (SDK does not support $gte/$lt on created_date).
      // Date filtering is done in JavaScript below (lines ~92-96) by occurrence date.
      sr.entities.Message.filter({ user_id: userId }, '-created_date', 200).catch(() => []),
      sr.entities.Message.filter({ user_id: userId, status: 'pending' }, '-created_date', 50).catch(() => []),
      // RC16.6: sent_at range filter also unsupported — fetch recent sent and filter in JS.
      sr.entities.Message.filter({ user_id: userId, status: 'sent' }, '-sent_at', 50).catch(() => []),
      sr.entities.RelationshipMemory.filter({ owner_user_id: userId, is_active: true }).catch(() => []),
    ]);

    // Also catch messages authored via created_by_id (legacy ownership)
    const legacyMonth = await sr.entities.Message.filter({ created_by_id: userId }, '-created_date', 200).catch(() => []);
    const allMonthMessages = mergeUnique([...messagesThisMonth, ...legacyMonth]);
    const profile = profiles[0] || null;

    // ── Merge campaigns (user_id + created_by_id) ──
    const campaigns = mergeUnique([...campaignsByUser, ...campaignsByCreator]);

    // ── Index lookups ──
    const contactMap = new Map(contacts.map(c => [c.id, c]));
    const categoryMap = new Map(categories.map(c => [c.id, c]));
    const stateMap = new Map(states.map(s => [s.id, s]));
    const stateByKey = new Map(states.map(s => [s.system_key, s]));
    const typeMap = new Map(types.map(t => [t.id, t]));
    const goalMap = new Map(goals.map(g => [g.id, g]));
    const campaignMap = new Map(campaigns.map(c => [c.id, c]));

    // RC18.3: Filter by eligible parent campaign (same as EntitlementService).
    // Orphaned PlanRecipients (parent deleted/archived) are NOT relationships.
    const activePlanRecipients = planRecipients.filter(pr => pr.status === 'active');
    const eligiblePlanRecipients = activePlanRecipients.filter(pr => {
      const camp = campaignMap.get(pr.campaign_id);
      return camp && ['active', 'paused'].includes(camp.status);
    });
    const relationshipsCount = eligiblePlanRecipients.length;
    const activeCampaigns = campaigns.filter(c => c.status === 'active');
    const draftCampaigns = campaigns.filter(c => c.status === 'draft');
    // RC16.2 §12: Archived (deleted) plans are excluded from all dashboard
    // counts. Historical sent messages are preserved in monthly stats.
    const nonArchivedCampaigns = campaigns.filter(c => c.status !== 'archived');

    // ── Monthly communication summary ──
    // Deduplicate by generation_key so technical retries / alternative versions
    // never count as separate planned communications. Fall back to a composite
    // key when generation_key is absent (legacy).
    const monthOccurrences = new Map();
    for (const m of allMonthMessages) {
      const occTs = m.occurrence || m.scheduled_for || m.created_date;
      const occDate = occTs ? new Date(occTs) : new Date(m.created_date);
      if (occDate < monthStart || occDate >= monthEnd) continue;
      const key = m.generation_key || `${m.campaign_id}|${m.plan_recipient_id || m.recipient_name}|${m.occurrence || m.created_date}`;
      const existing = monthOccurrences.get(key);
      if (!existing || new Date(m.updated_date || m.created_date) > new Date(existing.updated_date || existing.created_date)) {
        monthOccurrences.set(key, m);
      }
    }
    const monthMessages = [...monthOccurrences.values()];
    const plannedCount = monthMessages.length;
    const completedCount = monthMessages.filter(m => m.status === 'sent').length;
    const skippedCount = monthMessages.filter(m => m.status === 'skipped').length;
    const awaitingCount = monthMessages.filter(m => m.status === 'pending').length;

    // ── Consistency (deterministic, documented) ──
    // Eligible = occurrences whose scheduled time has arrived (occurrence/scheduled_for <= now),
    // deduplicated by generation_key. Consistency = completed / (completed + skipped + awaiting)
    // among eligible occurrences. null when there is insufficient data (new user).
    let eligible = 0, eligibleCompleted = 0;
    for (const m of monthMessages) {
      const occTs = m.occurrence || m.scheduled_for;
      const isDue = !occTs || new Date(occTs) <= now; // no occurrence => treat as due
      if (isDue && (m.status === 'sent' || m.status === 'skipped' || m.status === 'pending')) {
        eligible++;
        if (m.status === 'sent') eligibleCompleted++;
      }
    }
    const consistency = eligible > 0 ? Math.round((eligibleCompleted / eligible) * 100) : null;

    // ── Connections this month (completed communications) ──
    const connectionsThisMonth = completedCount;

    // ── RC16.4 Part V/W/X/Y: Scheduled communication from Campaign scheduling ──
    // A future communication can be SCHEDULED (Campaign.next_scheduled) before
    // any Message entity is generated. The monthly summary must NOT say
    // "No communication scheduled this month yet" when an active campaign has
    // a valid next_scheduled within the current calendar month.
    const scheduledThisMonth = activeCampaigns.filter(c => {
      if (!c.next_scheduled) return false;
      const ns = new Date(c.next_scheduled);
      return ns >= monthStart && ns < monthEnd;
    }).length;

    // Next upcoming scheduled communication (nearest next_scheduled in the future)
    let nextScheduled: any = null;
    const upcomingCampaigns = activeCampaigns
      .filter(c => c.next_scheduled && new Date(c.next_scheduled) > now)
      .sort((a, b) => new Date(a.next_scheduled!).getTime() - new Date(b.next_scheduled!).getTime());
    if (upcomingCampaigns.length > 0) {
      const c = upcomingCampaigns[0];
      const ns = new Date(c.next_scheduled!);
      const timeStr = ns.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const dateStr = ns.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      nextScheduled = {
        campaignId: c.id,
        campaignName: c.name,
        timestamp: c.next_scheduled,
        label: c.name,
        detail: `${dateStr} at ${timeStr}`,
      };
    }

    // ── Relationship-state overview (active PlanRecipients grouped by state) ──
    const stateCounts = new Map();
    let unspecifiedStates = 0;
    for (const pr of activePlanRecipients) {
      if (!pr.relationship_state_id) { unspecifiedStates++; continue; }
      const s = stateMap.get(pr.relationship_state_id);
      const key = s?.system_key || pr.relationship_state_id;
      stateCounts.set(key, { state: s, count: (stateCounts.get(key)?.count || 0) + 1 });
    }
    const relationshipStates = [...stateCounts.entries()].map(([key, v]) => ({
      systemKey: key,
      displayName: v.state?.display_name || key,
      count: v.count,
    })).sort((a, b) => b.count - a.count);
    if (unspecifiedStates > 0) {
      relationshipStates.push({ systemKey: '_unspecified', displayName: 'Unspecified', count: unspecifiedStates });
    }

    // ── Today's Connections (prioritised actionable) ──
    // 1. Pending message requiring review
    // 2. Approved message scheduled for today
    // 3. Campaign with next_scheduled today
    const todaysConnections = [];
    for (const m of pendingMessages.slice(0, 5)) {
      const camp = campaignMap.get(m.campaign_id);
      const pr = m.plan_recipient_id ? activePlanRecipients.find(p => p.id === m.plan_recipient_id) : null;
      const contact = pr ? contactMap.get(pr.contact_id) : null;
      const relType = pr?.relationship_type_id ? typeMap.get(pr.relationship_type_id) : null;
      todaysConnections.push({
        id: m.id,
        kind: 'pending_review',
        name: m.recipient_name || contact?.display_name || 'Friend',
        relationshipLabel: relType?.display_label || (camp?.name || 'Communication Plan'),
        detail: 'Message ready for review',
        actionLabel: 'Review Message',
        url: `/messages/${m.id}`,
      });
    }
    // Approved scheduled today
    const approvedToday = allMonthMessages.filter(m =>
      m.status === 'approved' && m.scheduled_for &&
      new Date(m.scheduled_for) >= todayStart && new Date(m.scheduled_for) <= todayEnd
    );
    for (const m of approvedToday.slice(0, 3)) {
      const pr = m.plan_recipient_id ? activePlanRecipients.find(p => p.id === m.plan_recipient_id) : null;
      const relType = pr?.relationship_type_id ? typeMap.get(pr.relationship_type_id) : null;
      const time = new Date(m.scheduled_for).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      todaysConnections.push({
        id: m.id,
        kind: 'scheduled_today',
        name: m.recipient_name || 'Friend',
        relationshipLabel: relType?.display_label || 'Scheduled',
        detail: `Scheduled for ${time}`,
        actionLabel: 'View Message',
        url: `/messages/${m.id}`,
      });
    }
    // Campaigns due today (next_scheduled today) not already represented
    for (const c of activeCampaigns) {
      if (!c.next_scheduled) continue;
      const ns = new Date(c.next_scheduled);
      if (ns >= todayStart && ns <= todayEnd) {
        todaysConnections.push({
          id: c.id,
          kind: 'plan_due_today',
          name: c.name,
          relationshipLabel: 'Communication Plan',
          detail: `Scheduled for ${ns.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`,
          actionLabel: 'View Plan',
          url: `/campaigns/${c.id}`,
        });
      }
    }

    // ── Needs Your Attention (actionable only) ──
    // RC16.2 §21: Dedup — don't show the same pending message in both
    // Today's Connections and Needs Attention. Today's Connections is the
    // primary section for pending messages; counts still reflect the total.
    const todaysMessageIds = new Set(
      todaysConnections.filter(tc => tc.kind === 'pending_review').map(tc => tc.id)
    );
    const needsAttentionItems = [];
    // Pending messages
    for (const m of pendingMessages.slice(0, 10)) {
      if (todaysMessageIds.has(m.id)) continue;
      needsAttentionItems.push({
        id: `pending_${m.id}`,
        type: 'pending_message',
        title: `${m.recipient_name || 'A message'} needs your review`,
        description: m.content?.slice(0, 80) || 'A prepared message is waiting for your approval.',
        actionLabel: 'Review',
        url: `/messages/${m.id}`,
      });
    }
    // Draft plans (setup incomplete)
    for (const c of draftCampaigns.slice(0, 3)) {
      needsAttentionItems.push({
        id: `draft_${c.id}`,
        type: 'setup_incomplete',
        title: `Finish setting up "${c.name}"`,
        description: 'This communication plan is still a draft.',
        actionLabel: 'Continue Setup',
        url: `/campaigns/${c.id}/edit`,
      });
    }
    // Capacity (added below after we compute it)

    // ── Upcoming Moments (PlanRecipient-scoped RelationshipMemory) ──
    // Only important_date / milestone memories with a related_date. Annual
    // recurrence is assumed for important_date (birthday/anniversary): the
    // next month/day occurrence >= today is used. Milestone uses the literal
    // date (one-time). No invented occasions; no LLM inference.
    const upcomingRaw = [];
    for (const mem of memories) {
      if (!mem.related_date) continue;
      if (mem.memory_type !== 'important_date' && mem.memory_type !== 'milestone') continue;
      const baseDate = new Date(mem.related_date);
      let nextDate;
      // RC16.8: Use is_recurring_annual flag (authoritative) instead of assuming
      // annual based on memory_type. important_date can now be one-time.
      if (mem.is_recurring_annual) {
        // Annual recurrence from month/day
        const thisYear = new Date(now.getFullYear(), baseDate.getMonth(), baseDate.getDate());
        nextDate = thisYear >= now ? thisYear : new Date(now.getFullYear() + 1, baseDate.getMonth(), baseDate.getDate());
      } else {
        nextDate = baseDate;
      }
      if (nextDate < now) continue;
      // Only show within the next 90 days
      const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      if (daysUntil > 90) continue;
      const pr = mem.plan_recipient_id ? planRecipients.find(p => p.id === mem.plan_recipient_id) : null;
      const contact = pr ? contactMap.get(pr.contact_id) : null;
      upcomingRaw.push({
        id: mem.id,
        label: mem.trigger_intent || mem.content || (mem.memory_type === 'important_date' ? 'Important date' : 'Milestone'),
        daysUntil,
        date: nextDate.toISOString().split('T')[0],
        planRecipientId: mem.plan_recipient_id,
        campaignId: mem.campaign_id,
        contactName: contact?.display_name || pr?.recipient_context || 'Someone',
        isTriggerActive: !!mem.is_trigger_active,
        triggerTiming: mem.trigger_timing || null,
      });
    }
    upcomingRaw.sort((a, b) => a.daysUntil - b.daysUntil);
    const upcomingMoments = upcomingRaw.slice(0, 6);

    // ── Continue where you left off (single highest-value action) ──
    let continueAction = null;
    if (pendingMessages.length > 0) {
      const m = pendingMessages[0];
      continueAction = {
        label: `${pendingMessages.length} message${pendingMessages.length > 1 ? 's' : ''} waiting for your review`,
        actionLabel: 'Review Messages',
        url: '/inbox',
      };
    } else if (draftCampaigns.length > 0) {
      continueAction = {
        label: `Finish setting up "${draftCampaigns[0].name}"`,
        actionLabel: 'Continue Setup',
        url: `/campaigns/${draftCampaigns[0].id}/edit`,
      };
    } else if (activeCampaigns.length === 0 && campaigns.length > 0) {
      // Has plans but none active
      const paused = campaigns.find(c => c.status === 'paused');
      if (paused) {
        const pausedRecipients = eligiblePlanRecipients.filter(pr => pr.campaign_id === paused.id);
        const recipientNames = pausedRecipients
          .map(pr => contactMap.get(pr.contact_id)?.display_name || contactMap.get(pr.contact_id)?.first_name || pr.recipient_context)
          .filter(Boolean);
        const relationshipType = paused.relationship_type_id ? typeMap.get(paused.relationship_type_id) : null;
        const relationshipCategory = paused.relationship_category_id ? categoryMap.get(paused.relationship_category_id) : null;
        // Campaign.name is the authoritative user-assigned plan name. Legacy rows
        // can be blank, so never render empty quotation marks on the dashboard.
        // The fallback is derived from relationship data, not a fabricated plan name.
        const planDisplayName = String(paused.name || '').trim()
          || (recipientNames.length === 1 ? `Plan with ${recipientNames[0]}` : '')
          || relationshipType?.display_label
          || relationshipCategory?.display_name
          || 'Communication Plan';
        continueAction = {
          label: `${planDisplayName} is paused`,
          actionLabel: 'View Plan',
          url: `/campaigns/${paused.id}`,
          planId: paused.id,
          planName: planDisplayName,
          relationshipCategory: paused.relationship_category_system_key || relationshipCategory?.system_key || null,
        };
      }
    }

    // ── Capacity (authoritative EntitlementService) ──
    // RC16.6: Uses the same getCapacityStatus as Subscription/checkMessageCapacity.
    const capStatus = await getCapacityStatus(sr, userId, now);
    const capacity = {
      plan: {
        used: capStatus.plan.used,
        effective: capStatus.plan.effective,
        remaining: capStatus.plan.remaining,
        isOverCapacity: capStatus.plan.isOverCapacity,
      },
      recipient: {
        used: capStatus.recipient.used,
        effective: capStatus.recipient.effective,
        remaining: capStatus.recipient.remaining,
        isOverCapacity: capStatus.recipient.isOverCapacity,
      },
      message: {
        used: capStatus.message.used,
        effective: capStatus.message.effective,
        remaining: capStatus.message.remaining,
        isOverCapacity: capStatus.message.isOverCapacity,
      },
      message_pass: {
        used: capStatus.message_pass?.used ?? 0,
        effective: capStatus.message_pass?.effective ?? 0,
        remaining: capStatus.message_pass?.remaining ?? 0,
        isOverCapacity: capStatus.message_pass?.isOverCapacity ?? false,
      },
      smart_message: {
        used: capStatus.smart_message?.used ?? 0,
        effective: capStatus.smart_message?.effective ?? 0,
        remaining: capStatus.smart_message?.remaining ?? 0,
        isOverCapacity: capStatus.smart_message?.isOverCapacity ?? false,
      },
      membershipStatus: capStatus.membershipStatus,
      periodEnd: capStatus.periodEnd,
    };

    // Over-capacity → promote to Needs Attention
    if (capacity.plan.isOverCapacity || capacity.recipient.isOverCapacity || capacity.message.isOverCapacity || capacity.message_pass.isOverCapacity || capacity.smart_message.isOverCapacity) {
      needsAttentionItems.push({
        id: 'over_capacity',
        type: 'over_capacity',
        title: 'You are over capacity',
        description: 'Some communication plans or recipients may not operate until capacity is increased.',
        actionLabel: 'Manage Capacity',
        url: '/subscription',
      });
    }

    const needsAttentionCount = needsAttentionItems.length;

    // ── New-user / partial-setup detection ──
    // RC15.6: zero-plan state is driven by Communication Plan count, NOT onboarding
    // history — a long-standing user who deletes all plans must see the zero-plan CTA.
    // RC16.2 §12: Archived plans are excluded (they are deleted, not active).
    const zeroPlanState = nonArchivedCampaigns.length === 0;
    const hasActiveRelationships = activePlanRecipients.length > 0;
    const isNewUser = nonArchivedCampaigns.length === 0 && activePlanRecipients.length === 0;
    const isPartiallySetup = !zeroPlanState && !hasActiveRelationships;

    // ── Greeting ──
    const firstName = profile?.first_name || user.full_name?.split(' ')[0] || '';

    return Response.json({
      greeting: { firstName },
      isNewUser,
      isPartiallySetup,
      zeroPlanState,
      hasActiveRelationships,
      summary: {
        relationships: relationshipsCount,
        needsAttention: needsAttentionCount,
        connectionsThisMonth,
        consistency,
      },
      continueAction,
      todaysConnections: todaysConnections.slice(0, 3),
      todaysConnectionsTotal: todaysConnections.length,
      needsAttentionItems: needsAttentionItems.slice(0, 3),
      needsAttentionTotal: needsAttentionItems.length,
      monthly: {
        planned: plannedCount,
        completed: completedCount,
        skipped: skippedCount,
        awaiting: awaitingCount,
        scheduledThisMonth,
        consistency,
      },
      nextScheduled,
      relationshipStates,
      upcomingMoments,
      capacity,
      pendingMessageCount: pendingMessages.length,
      hasActivePlans: activeCampaigns.length > 0,
    });
  } catch (error) {
    console.error('[getRelationshipDashboardSummary] Error:', error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function mergeUnique(arr) {
  return [...new Map(arr.map(x => [x.id, x])).values()];
}