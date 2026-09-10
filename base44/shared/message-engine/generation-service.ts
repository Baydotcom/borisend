/**
 * MessageGenerationService — The orchestrator.
 * Coordinates: context → prompt → provider → validate → retry → fallback.
 *
 * This is the single entry point for message generation.
 * Backend functions call this, not the provider adapter directly.
 */

import {
  GenerationContext, GenerationResult, ProviderConfig,
  ValidationResult, FailureCategory, PreferencesContext,
} from './types.ts';
import { buildGenerationContext } from './context-builder.ts';
import { buildPrompt, buildCorrectionPrompt, buildStrategyPrompt } from './prompt-builder.ts';
import { validateMessage } from './validator.ts';
import { getProviderAdapter, MessageProviderAdapter } from './provider-adapter.ts';
import { getProviderConfig } from './provider-config.ts';
import { withRetry } from './retry-service.ts';
import { classifyFailure } from './failure-classifier.ts';
import type { MessageSpecification } from '../relationship-intelligence/types.ts';
import { buildStrategyFallbackMessage } from '../relationship-intelligence/fallback-builder.ts';
import { validateWithStrategy } from '../relationship-intelligence/strategy-validator.ts';

/**
 * Builds a time-neutral fallback message when validation fails twice.
 */
function buildFallbackMessage(context: GenerationContext): string {
  const name = context.recipient.name;
  const pet = context.campaign.pet_name;
  const nameToUse = pet || name;

  const templates = [
    `Hi ${nameToUse}, just thinking about you and wanted to send some love. Hope you're having a good day.`,
    `Hey ${nameToUse}, you crossed my mind and I wanted to reach out. Hope everything is going well today.`,
    `${nameToUse}, just a quick note to say I appreciate you. Hope your day is going nicely.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

export async function generateMessage(
  base44Client: any,
  params: {
    campaign: any;
    recipientName: string;
    language: string;
    language_display_name?: string;
    deliveryTimeUtc: string;
    userTimezone: string;
    recentMessages: string[];
    preferences?: PreferencesContext;
    specification?: MessageSpecification | null;
  }
): Promise<GenerationResult> {
  // 1. Build generation context (provider-neutral)
  const context = buildGenerationContext(params);

  // 2. Get provider configuration
  let providerConfig: ProviderConfig;
  try {
    providerConfig = await getProviderConfig(base44Client);
  } catch (err) {
    return {
      content: null, provider: 'unknown', model: 'unknown',
      used_fallback: false, needs_review: false, validation_issues: [],
      error: `Provider config error: ${(err as Error).message}`,
      failure_category: 'invalid_provider_config', attempts: 0,
    };
  }

  if (!providerConfig.enabled) {
    return {
      content: null, provider: providerConfig.active_provider, model: providerConfig.model,
      used_fallback: false, needs_review: false, validation_issues: [],
      error: 'Provider is disabled', failure_category: 'invalid_provider_config', attempts: 0,
    };
  }

  // 3. Get provider adapter
  const adapter: MessageProviderAdapter = getProviderAdapter(
    providerConfig.active_provider, base44Client
  );

  // 4. Build prompt — strategy-aware when a MessageSpecification is present (RC13),
  //    legacy prompt otherwise (backward compatible, §34).
  const hasSpec = !!params.specification;
  const prompt = hasSpec
    ? buildStrategyPrompt(params.specification!, params.recentMessages)
    : buildPrompt(context, params.recentMessages);

  // 5. Generate with retry
  const maxAttempts = providerConfig.retry_count + 1;
  const retryResult = await withRetry(
    () => adapter.generateMessage(prompt, providerConfig),
    maxAttempts,
    (err) => adapter.classifyFailure(err)
  );

  if (!retryResult.result) {
    const classification = retryResult.lastClassification || classifyFailure(retryResult.lastError || 'unknown');
    return {
      content: null,
      provider: adapter.getProviderNameForInternalLogs(),
      model: providerConfig.model,
      used_fallback: false,
      needs_review: false,
      validation_issues: [],
      error: retryResult.lastError?.message || 'Generation failed',
      failure_category: classification.category,
      attempts: retryResult.attempts,
    };
  }

  let content = retryResult.result;
  let validation = validateMessage(content, context, params.recentMessages);

  // RC13: Add strategy-aware validation when a specification is present
  if (hasSpec) {
    const stratVal = validateWithStrategy(content, params.specification!, params.recentMessages);
    if (!stratVal.valid) {
      validation = { valid: false, issues: [...validation.issues, ...stratVal.issues] };
    }
  }

  let usedFallback = false;
  let needsReview = false;

  // 6. If validation fails, attempt ONE controlled regeneration with correction
  if (!validation.valid) {
    const errorIssues = validation.issues.filter(i => i.severity === 'error');
    if (errorIssues.length > 0) {
      try {
        const correctionPrompt = buildCorrectionPrompt(prompt, errorIssues);
        const correctedContent = await adapter.generateMessage(correctionPrompt, providerConfig);
        let reValidation = validateMessage(correctedContent, context, params.recentMessages);
        if (hasSpec) {
          const stratReVal = validateWithStrategy(correctedContent, params.specification!, params.recentMessages);
          if (!stratReVal.valid) {
            reValidation = { valid: false, issues: [...reValidation.issues, ...stratReVal.issues] };
          }
        }

        if (reValidation.valid) {
          content = correctedContent;
          validation = reValidation;
        } else {
          // 7. Still invalid — use relationship-aware fallback (RC13) or legacy fallback
          content = hasSpec
            ? buildStrategyFallbackMessage(params.specification!, params.recipientName)
            : buildFallbackMessage(context);
          usedFallback = true;
          needsReview = true;
          validation = { valid: true, issues: [...validation.issues, ...reValidation.issues] };
        }
      } catch (correctionErr) {
        // Correction attempt failed — use fallback
        content = hasSpec
          ? buildStrategyFallbackMessage(params.specification!, params.recipientName)
          : buildFallbackMessage(context);
        usedFallback = true;
        needsReview = true;
      }
    }
  }

  // 8. Return final result
  return {
    content,
    provider: adapter.getProviderNameForInternalLogs(),
    model: providerConfig.model,
    used_fallback: usedFallback,
    needs_review: needsReview,
    validation_issues: validation.issues,
    error: null,
    failure_category: null,
    attempts: retryResult.attempts,
  };
}

export { buildGenerationContext, validateMessage, buildPrompt };