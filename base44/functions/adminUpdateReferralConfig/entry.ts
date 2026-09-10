import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const VALID_REWARD_TYPES = ['message_credits', 'subscription_days', 'cash_payout', 'feature_unlock'];

function validateConfigValue(key, value) {
  const errors = [];

  if (!key || typeof key !== 'string') {
    errors.push('Config key is required');
    return errors;
  }

  if (value === null || value === undefined || value === '') {
    errors.push('Value is required');
    return errors;
  }

  const val = String(value).trim();

  // Boolean keys
  if (key.endsWith('_enabled') || key === 'program_is_active') {
    if (val !== 'true' && val !== 'false') {
      errors.push(`${key} must be 'true' or 'false'`);
    }
  }

  // Amount keys
  if (key.endsWith('_amount')) {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) {
      errors.push(`${key} must be a non-negative number`);
    }
  }

  // Type keys
  if (key.endsWith('_type')) {
    if (!VALID_REWARD_TYPES.includes(val)) {
      errors.push(`${key} must be one of: ${VALID_REWARD_TYPES.join(', ')}`);
    }
  }

  // Days keys
  if (key.endsWith('_days')) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num <= 0) {
      errors.push(`${key} must be a positive integer`);
    }
  }

  // Program name
  if (key === 'program_name') {
    if (val.length < 3) {
      errors.push('Program name must be at least 3 characters');
    }
  }

  return errors;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'super_admin'].includes(user.role)) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const config_id = body?.config_id;
    const value = body?.value;
    const is_active = body?.is_active;

    if (!config_id) {
      return Response.json({ error: 'config_id is required' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const config = await sr.entities.ReferralProgramConfiguration.get(config_id);
    if (!config) {
      return Response.json({ error: 'Configuration not found' }, { status: 404 });
    }

    // Validate the new value
    const errors = validateConfigValue(config.key, value);
    if (errors.length > 0) {
      return Response.json({ error: 'Validation failed', validation_errors: errors }, { status: 400 });
    }

    const updateData = { value: String(value).trim() };
    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    await sr.entities.ReferralProgramConfiguration.update(config_id, updateData);

    return Response.json({ success: true, config_id, updated_fields: updateData });
  } catch (error) {
    console.error('[adminUpdateReferralConfig] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});